import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { fetchPage } from '@/scripts/ingest/http';
import { findOrCreateProperty } from '@/scripts/ingest/property-matcher';
import { drainAggregateQueue } from '@/scripts/ingest/aggregate-queue';
import { reconcileScope, type ApiTx, type ReconcileResult } from './reconcile';
import { revalidatePaths, propertyPath } from '@/scripts/ingest/revalidator';
import { notify } from '@/scripts/ingest/notify';

import { adapterAptTrade } from './adapter-apt-trade';
import { adapterAptRent } from './adapter-apt-rent';
import { adapterOffiTrade } from './adapter-offi-trade';
import { adapterOffiRent } from './adapter-offi-rent';
import { adapterRhTrade } from './adapter-rh-trade';
import { adapterRhRent } from './adapter-rh-rent';
import { doneRunFilter, buildDoneKeys } from './resume';
import { getSigunguTargets } from './sigungu';

import type { Adapter, ApiType, Mode, NormalizedTransaction } from '@/scripts/ingest/types';
import { createHash } from 'node:crypto';
import { getRangeMonths } from './months';
import { parseXml, assertNormalResponse } from '@/scripts/ingest/xml-parse';

export const ADAPTERS: Record<ApiType, Adapter> = {
  'apt-trade': adapterAptTrade,
  'apt-rent': adapterAptRent,
  'offi-trade': adapterOffiTrade,
  'offi-rent': adapterOffiRent,
  'rh-trade': adapterRhTrade,
  'rh-rent': adapterRhRent,
};

interface RunArgs {
  api: ApiType | 'all';
  mode: Mode;
  months: number;
  monthOffset?: number;
  limit?: number;
  from?: string;
  to?: string;
  /** recheck: 다시 확인할 월 오프셋 범위(예: '2-6' = 2~6개월 전) */
  offsets?: string;
  /** recheck: 이 기간(일) 안에 완료한 범위는 건너뛴다 */
  windowDays: number;
}

function parseArgs(): RunArgs {
  const args = process.argv.slice(2);
  const get = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
  const api = (get('api') ?? 'all') as ApiType | 'all';
  const mode = (get('mode') ?? 'daily') as Mode;
  const months = Number(get('months') ?? '1');
  const monthOffset = get('month-offset') !== undefined ? Number(get('month-offset')) : undefined;
  const limit = get('limit') !== undefined ? Number(get('limit')) : undefined;
  const from = get('from');
  const to = get('to');
  const offsets = get('offsets');
  if (mode === 'recheck' && !offsets) throw new Error('--mode=recheck에는 --offsets=2-6 형식이 필요하다');
  const windowDays = Number(get('window-days') ?? '7');
  if (!Number.isInteger(windowDays) || windowDays < 1) throw new Error(`--window-days는 1 이상의 정수: ${get('window-days')}`);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new Error(`--limit는 1 이상의 정수: ${get('limit')}`);
  return { api, mode, months, monthOffset, limit, from, to, offsets, windowDays };
}

export interface IngestTaskKey {
  api: string;
  source: string;
  sgg: string;
  yyyymm: string;
}

/**
 * 실행할 (api, 월, 시군구) 조합을 만든다.
 *
 * 월을 바깥, 시군구를 안쪽에 두는 순서가 load-bearing이다. runWithLimit이 동시에
 * 돌리는 인접 두 태스크가 같은 시군구면, 각 runOne의 propCache가 서로의 신규 생성을
 * 못 봐서 같은 단지를 둘 다 만든다(실측 2,025그룹). 시군구를 안쪽에 두면 같은 월 안에서는
 * 인접 쌍이 항상 다른 시군구가 된다.
 *
 * 하지만 doneKeys 필터링은 (source, sgg, yyyymm) 조합별로 독립적으로 적용되므로, 월·api
 * 경계에서 살아남는 시군구 집합이 비대칭이 될 수 있다(예: 이전 --limit 실행이 한 달의
 * 일부만 완료). 이 경우 경계에서 우연히 같은 시군구가 인접할 수 있어, dedupeAdjacentSgg가
 * 최빈값 우선(most-frequent-first) 배치로 재정렬해 없앤다. `maxCount <= ceil(n/2)`이면
 * 인접 충돌 없는 배치가 항상 존재하고 이 알고리즘이 그 배치를 찾아낸다. 그 임계값을 넘는
 * 초과분만 산술적으로 불가피한 잔여로 남으며, 그 잔여는 유니크 제약 추가 시 P2002 재조회
 * 로직이 최종 방어선이 된다.
 */
export function buildIngestTaskKeys(
  apis: Array<{ api: string; source: string }>,
  months: string[],
  sigunguIds: string[],
  doneKeys: Set<string>,
): IngestTaskKey[] {
  const out: IngestTaskKey[] = [];
  for (const { api, source } of apis) {
    for (const yyyymm of months) {
      for (const sgg of sigunguIds) {
        if (doneKeys.has(`${source}:${sgg}-${yyyymm}`)) continue;
        out.push({ api, source, sgg, yyyymm });
      }
    }
  }
  return dedupeAdjacentSgg(out);
}

/**
 * 인접한 두 태스크가 같은 시군구를 갖지 않도록 최빈값 우선(most-frequent-first)으로
 * 재정렬한다. reorganize-array/task-scheduler류 문제의 표준 해법이며, `maxCount <=
 * ceil(n/2)`인 한 인접 충돌 없는 배치를 항상 찾아낸다(단순 전방 그리디 스왑은 뒤쪽 충돌을
 * 풀 유일한 후보를 앞에서 먼저 써버릴 수 있어 이 보장이 없었다).
 *
 * 매 단계마다 "직전에 배치한 시군구를 제외하고" 남은 개수가 가장 많은 시군구를 고른다.
 * 동률이면 시군구 문자열 사전순으로 타이브레이크한다(결정적). 같은 시군구 안에서는 원래
 * 상대 순서(월 순서)를 유지한다. 직전 시군구 말고 고를 게 없는 경우(=그 시군구 개수가
 * n의 과반을 넘어 산술적으로 불가피한 경우)만 예외적으로 이어 붙인다 — 이 잔여는 유니크
 * 제약 추가 시 P2002 재조회 로직이 최종 방어선이 된다.
 *
 * 항목을 버리거나 복제하거나 값을 바꾸지 않고 순서만 바꾸며, 인자로 받은 배열은 변경하지
 * 않는다(같은 입력엔 항상 같은 출력).
 */
function dedupeAdjacentSgg(keys: IngestTaskKey[]): IngestTaskKey[] {
  if (keys.length <= 1) return keys.slice();

  // 시군구별로 원래 상대 순서를 유지하며 그룹화
  const groups = new Map<string, IngestTaskKey[]>();
  for (const k of keys) {
    const group = groups.get(k.sgg);
    if (group) group.push(k);
    else groups.set(k.sgg, [k]);
  }

  const sggList = Array.from(groups.keys()).sort();
  const remaining = new Map(sggList.map((sgg) => [sgg, groups.get(sgg)!.length]));
  const cursors = new Map(sggList.map((sgg) => [sgg, 0]));

  const out: IngestTaskKey[] = [];
  let lastSgg: string | null = null;
  for (let n = 0; n < keys.length; n++) {
    let best: string | null = null;
    for (const candidate of sggList) {
      if (remaining.get(candidate) === 0) continue;
      if (candidate === lastSgg) continue;
      if (best === null || remaining.get(candidate)! > remaining.get(best)!) {
        best = candidate;
      }
    }
    // 직전 시군구 말고 고를 게 없는 불가피한 경우 — 그대로 이어 붙인다.
    const chosenSgg: string = best ?? lastSgg!;
    const cursor = cursors.get(chosenSgg)!;
    out.push(groups.get(chosenSgg)![cursor]);
    cursors.set(chosenSgg, cursor + 1);
    remaining.set(chosenSgg, remaining.get(chosenSgg)! - 1);
    lastSgg = chosenSgg;
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const apis = args.api === 'all' ? (Object.keys(ADAPTERS) as ApiType[]) : [args.api];
  const months =
    args.mode === 'daily'
      ? getDailyMonths()
      : args.mode === 'recheck'
        ? getOffsetMonths(args.offsets!, new Date())
      : args.from && args.to
        ? getRangeMonths(args.from, args.to)
        : args.monthOffset !== undefined
          ? [getMonthByOffset(args.monthOffset)]
          : getBackfillMonths(args.months);

  logger.info({ apis, months, mode: args.mode }, 'runner start');

  // MOLIT가 인식하는 시군구 LAWD_CD(5자리) → Region.code(10자리) 매핑.
  // 일반구 통합시(성남·수원 등)는 시 코드가 아닌 구 코드를 써야 데이터가 잡힌다(getSigunguTargets 참고).
  const sigunguToRegionCode = await getSigunguTargets();
  const sigunguIds = Array.from(sigunguToRegionCode.keys());

  const sources = apis.map((a) => ADAPTERS[a].source);
  const doneRuns = await prisma.ingestionRun.findMany({
    where: { source: { in: sources }, status: 'OK', ...doneRunFilter(args.mode, new Date(), args.windowDays) },
    select: { source: true, targetKey: true },
  });
  // daily: 오늘(KST) 완료분만 스킵 → 날짜가 바뀌면 이번달·전달 전체 재처리(self-heal 유지)
  // backfill: 완료분 전체 스킵 (doneRunFilter가 {} 반환 → 날짜 제한 없음)
  const doneKeys = buildDoneKeys(doneRuns);
  logger.info({ skippable: doneKeys.size }, 'resume: loaded completed keys');

  let totalUpserted = 0;
  let failed = 0;
  let skipped = 0;
  const affectedPropertyIds = new Set<bigint>();
  // 재정합 집계(알림·로그용)
  const rec = { archived: 0, orphans: 0, propertyMismatch: 0, cancelDateRepaired: 0, outOfScope: 0, outOfMonth: 0, guarded: {} as Record<string, number> };

  const taskKeys = buildIngestTaskKeys(
    apis.map((a) => ({ api: a, source: ADAPTERS[a].source })),
    months,
    sigunguIds,
    doneKeys,
  );
  skipped = apis.length * months.length * sigunguIds.length - taskKeys.length;

  const tasks: Array<() => Promise<void>> = taskKeys.map((k) => async () => {
    try {
      const r = await runOne(
        ADAPTERS[k.api as ApiType],
        k.sgg,
        sigunguToRegionCode.get(k.sgg)!,
        k.yyyymm,
      );
      // 가드에 걸린 범위는 아무것도 쓰지 않았다 — 계획 수치를 합치지 않는다.
      if (r.status === 'skipped') { rec.guarded[r.skipReason!] = (rec.guarded[r.skipReason!] ?? 0) + 1; return; }
      totalUpserted += r.inserted;
      r.affectedPropertyIds.forEach((id) => affectedPropertyIds.add(id));
      rec.archived += r.archived.cancel + r.archived.correction;
      rec.orphans += r.orphans; rec.propertyMismatch += r.propertyMismatch; rec.cancelDateRepaired += r.cancelDateRepaired;
      rec.outOfScope += r.outOfScope; rec.outOfMonth += r.outOfMonth;
    } catch (err) {
      failed++;
      logger.error({ err, api: k.source, sgg: k.sgg, yyyymm: k.yyyymm }, 'sigungu-month failed');
    }
  });
  // --limit: 한 실행이 처리할 타깃(시군구·월) 수 상한. 대량 write가 누적되면 Supabase가
  // 디스크 압박으로 read-only(25006)로 빠지므로, 짧게 나눠 실행해 스파이크를 낮춘다.
  // resume(doneKeys)가 이어주므로 여러 번 돌리면 전체가 완료된다.
  const pending = args.limit ? tasks.slice(0, args.limit) : tasks;
  logger.info({ pending: pending.length, total: tasks.length, limit: args.limit ?? null }, 'tasks to run this pass');
  // Supabase pooler 동시 연결 제약 — 5로 두면 connection pool / statement timeout 빈발
  await runWithLimit(pending, 2);

  // 집계는 대기열이 보장한다(단위마다 같은 트랜잭션에서 넣음). 여기서는 쌓인 대기열을 비운다.
  // 실패하거나 30분 예산을 넘겨도 대기열에 남아 property-aggregates 잡이 이어서 처리한다.
  const drained = await drainAggregateQueue({ deadline: Date.now() + 30 * 60_000 });

  if (args.mode !== 'backfill') {
    const paths: string[] = [];
    const props = await prisma.property.findMany({
      where: { id: { in: Array.from(affectedPropertyIds) } },
      select: { id: true, propertyType: true, sigunguCode: true },
    });
    for (const p of props) {
      paths.push(propertyPath(p.propertyType, p.id));
    }
    await revalidatePaths(paths);
  }

  const guarded = Object.values(rec.guarded).reduce((a, b) => a + b, 0);
  const summary = {
    mode: args.mode, totalUpserted, skipped, failed, properties: affectedPropertyIds.size, ...rec,
    aggregated: drained.processed, aggregateQueueRemaining: drained.remaining, aggregateStop: drained.stoppedBy,
  };
  logger.info(summary, 'runner done');
  await notify(drained.stoppedBy === 'error' || guarded > 0 || failed >= 5 ? 'warn' : 'info', 'ETL run complete', summary);

  await prisma.$disconnect();
}

export async function runOne(
  adapter: Adapter,
  sigungu: string,
  regionCode: string,
  yyyymm: string,
): Promise<ReconcileResult> {
  const targetKey = `${sigungu}-${yyyymm}`;
  const run = await prisma.ingestionRun.create({
    data: { source: adapter.source, targetKey, status: 'RUNNING' },
  });

  try {
    const { rows, totalCount, complete } = await fetchAll(adapter, sigungu, yyyymm);

    const { api, excluded } = await resolveApiRows(adapter, sigungu, regionCode, rows, { create: true });

    // 원천과 DB를 범위 단위로 맞춘다(삽입·보관·해제일 수정·대기열·완료 기록이 한 트랜잭션). reconcile.ts 참고.
    const r = await reconcileScope({ source: adapter.source, sigunguCode: sigungu, yyyymm, api, complete, totalCount, excluded }, run.id);
    if (r.status === 'skipped') {
      // 가드에 걸리면 아무것도 쓰지 않았다 — OK가 아니므로 다음 실행이 다시 시도한다.
      await prisma.ingestionRun.update({
        where: { id: run.id },
        data: { status: 'ERROR', errorMessage: `reconcile skipped: ${r.skipReason} (api=${r.api}, db=${r.db}, total=${totalCount})`, finishedAt: new Date() },
      });
      logger.warn({ source: adapter.source, sgg: sigungu, yyyymm, ...r, affectedPropertyIds: undefined }, 'sigungu-month guarded');
      return r;
    }
    logger.info({ source: adapter.source, sgg: sigungu, yyyymm, status: r.status, inserted: r.inserted, archived: r.archived, orphans: r.orphans }, 'sigungu-month ok');
    return r;
  } catch (err) {
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() },
    });
    throw err;
  }
}

/**
 * 원천 행의 매물을 확정해 ApiTx로 만든다. 단지명이 없는 행은 excluded로 센다.
 * create=false(운영 dry-run)면 매물을 만들지 않고, 없는 매물의 행은 unknownProperty로 세어 뺀다(쓰기 없음).
 */
export async function resolveApiRows(
  adapter: Adapter, sigungu: string, regionCode: string, rows: NormalizedTransaction[], opts: { create: boolean },
): Promise<{ api: ApiTx[]; excluded: number; unknownProperty: number }> {
  // 시군구 내 기존 매물 일괄 로드 → findOrCreateProperty의 findFirst N번 → 1번으로 축소
  // redirectToId: null — 병합으로 리다이렉트된 패자는 캐시에서 제외한다. 안 그러면
  // (type, name) 키가 생존자/패자 중 findMany가 마지막으로 돌려준 쪽으로 고정되어,
  // 패자로 확정되면 그날 이후의 거래가 전부 301된 행에 쌓여 영영 복구 불가능해진다.
  const existingProps = await prisma.property.findMany({
    where: { regionCode: { startsWith: sigungu }, redirectToId: null },
    select: { id: true, propertyType: true, name: true, regionCode: true },
    orderBy: { id: 'asc' },
  });
  // 같은 이름이 여럿이면 가장 오래된 매물(findOrCreateProperty와 같은 기준) — 실행마다 같은 매물로 확정한다.
  const propCache = new Map<string, { id: bigint; regionCode: string }>();
  for (const p of existingProps) {
    const k = `${p.propertyType}:${p.name}`;
    if (!propCache.has(k)) propCache.set(k, p);
  }

  // 행별 property 확정 (캐시 miss 시에만 findOrCreateProperty 호출)
  const api: ApiTx[] = [];
  let excluded = 0;
  let unknownProperty = 0;
  for (const row of rows) {
    if (!row.name) { excluded++; continue; }
    const key = `${row.propertyType}:${row.name}`;
    let property = propCache.get(key);
    if (!property) {
      if (!opts.create) { unknownProperty++; continue; }
      property = await findOrCreateProperty({
        propertyType: row.propertyType,
        name: row.name,
        sigunguCode: row.sigunguCode,
        regionCode,
        address: buildAddress(row),
        buildYear: row.buildYear,
        roadName: row.roadName,
      });
      propCache.set(key, property);
    }
    api.push(toApiTx(row, property.id, property.regionCode, adapter.source));
  }
  return { api, excluded, unknownProperty };
}

export function toApiTx(row: NormalizedTransaction, propertyId: bigint, regionCode: string, source: string): ApiTx {
  return {
    propertyId,
    dealType: row.dealType,
    contractDate: row.contractDate,
    exclusiveArea: row.exclusiveArea,
    floor: row.floor,
    dealAmount: row.dealAmount,
    deposit: row.deposit,
    monthlyRent: row.monthlyRent,
    cancelType: row.cancelType,
    cancelDate: row.cancelDate,
    data: {
      propertyId,
      propertyType: row.propertyType,
      regionCode,
      sigunguCode: row.sigunguCode,
      dealType: row.dealType,
      contractDate: row.contractDate,
      exclusiveArea: row.exclusiveArea,
      floor: row.floor,
      buildYear: row.buildYear,
      dealAmount: row.dealAmount,
      registerDate: row.registerDate,
      dealingType: row.dealingType,
      buyerType: row.buyerType,
      sellerType: row.sellerType,
      cancelDate: row.cancelDate,
      cancelType: row.cancelType,
      deposit: row.deposit,
      monthlyRent: row.monthlyRent,
      contractTerm: row.contractTerm,
      contractType: row.contractType,
      useRRRight: row.useRRRight,
      preDeposit: row.preDeposit,
      preMonthlyRent: row.preMonthlyRent,
      umd: row.umd,
      jibun: row.jibun,
      roadName: row.roadName,
      source,
      externalKey: row.externalKey,
    },
  };
}

/** 한 범위에 받을 수 있는 최대 페이지(1,000건/페이지). 넘으면 불완전으로 본다(조용히 자르지 않는다). */
const MAX_PAGES = 100;

/**
 * 원천 한 범위(시군구·월)를 끝까지 받는다. complete = 받은 건수가 totalCount와 같다.
 * 페이지 오류·비정상 응답은 예외(assertNormalResponse). 빈 페이지·건수 부족·페이지 상한은 complete=false.
 */
export async function fetchAll(
  adapter: Adapter, sigungu: string, yyyymm: string, fetch: typeof fetchPage = fetchPage,
): Promise<{ rows: NormalizedTransaction[]; totalCount: number; complete: boolean }> {
  const all: NormalizedTransaction[] = [];
  let totalCount = 0;
  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
    const xml = await fetch({
      operation: adapter.endpoint,
      lawdCd: sigungu,
      dealYmd: yyyymm,
      pageNo,
      numOfRows: 1000,
    });
    assertNormalResponse(parseXml(xml));
    const page = adapter.parseRows(xml, sigungu);
    if (pageNo === 1) totalCount = page.totalCount;
    else if (page.totalCount !== totalCount) return { rows: all, totalCount, complete: false }; // 받는 중 원천이 바뀜
    all.push(...page.rows);
    if (all.length >= totalCount || page.rows.length === 0) break;
  }
  return { rows: all, totalCount, complete: all.length === totalCount };
}

/**
 * Property.address를 "법정동 + 지번"으로 조립한다.
 *
 * 도로명주소는 일부러 넣지 않는다. lib/property.ts의 propertyAddress()가 이 문자열을
 * "법정동 + 지번"으로 파싱하므로, 사이에 도로명을 끼우면 "가정동 봉오재2로 13 597-1"이
 * 되어 도로명이 법정동으로 둔갑한다 — 도로명 건물번호와 지번은 서로 다른 번호 체계라
 * 실존하지 않는 주소가 만들어진다. 도로명은 Transaction.roadName에 따로 보존된다.
 */
export function buildAddress(row: NormalizedTransaction): string {
  const parts: string[] = [];
  if (row.umd) parts.push(row.umd);
  if (row.jibun) parts.push(row.jibun);
  return parts.join(' ').trim();
}

export function computeHash(row: NormalizedTransaction, propertyId: bigint): string {
  const key = JSON.stringify({
    p: String(propertyId),
    t: row.dealType,
    d: row.contractDate.toISOString().slice(0, 10),
    a: row.exclusiveArea,
    f: row.floor,
    da: row.dealAmount,
    dep: row.deposit,
    mr: row.monthlyRent,
  });
  return createHash('sha256').update(key).digest('hex');
}

function getMonthByOffset(offset: number): string {
  const now = new Date();
  return ymd(new Date(now.getFullYear(), now.getMonth() - offset, 1));
}

/** '2-6' → 2~6개월 전의 YYYYMM 목록(KST 기준이 아닌 박스 시각 — getDailyMonths와 같은 규칙). */
export function getOffsetMonths(range: string, now: Date): string[] {
  const m = /^(\d+)-(\d+)$/.exec(range);
  if (!m || Number(m[1]) > Number(m[2])) throw new Error(`--offsets 형식 오류: ${range} (예: 2-6)`);
  const out: string[] = [];
  for (let i = Number(m[1]); i <= Number(m[2]); i++) out.push(ymd(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  return out;
}

function getDailyMonths(): string[] {
  const now = new Date();
  const cur = ymd(now);
  const prev = ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  return [cur, prev];
}

function getBackfillMonths(n: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(ymd(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return out;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}${m}`;
}

async function runWithLimit(tasks: Array<() => Promise<void>>, concurrency: number): Promise<void> {
  let nextIdx = 0;
  async function worker() {
    while (nextIdx < tasks.length) {
      const i = nextIdx++;
      await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
}

// merge-duplicate-properties가 computeHash를 라이브러리로 import한다. 가드 없이 main()을
// 모듈 스코프에서 그냥 부르면 그 import만으로 실제 ETL이 백그라운드에서 돌기 시작한다
// (운영에서는 병합 스크립트를 실행할 때마다 진짜 수집 job이 같이 뜨는 셈). 직접 실행(tsx로
// 이 파일을 돌릴 때)에만 main()이 실행되도록 막는다.
if (process.argv[1]?.includes('transactions/runner')) {
  main().catch((err) => {
    logger.error({ err }, 'runner fatal');
    process.exit(1);
  });
}
