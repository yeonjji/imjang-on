import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { fetchPage } from '@/scripts/ingest/http';
import { findOrCreateProperty } from '@/scripts/ingest/property-matcher';
import { updatePropertyAggregates } from '@/scripts/ingest/aggregator';
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

const ADAPTERS: Record<ApiType, Adapter> = {
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
  return { api, mode, months, monthOffset, limit, from, to };
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
    where: { source: { in: sources }, status: 'OK', ...doneRunFilter(args.mode, new Date()) },
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

  const taskKeys = buildIngestTaskKeys(
    apis.map((a) => ({ api: a, source: ADAPTERS[a].source })),
    months,
    sigunguIds,
    doneKeys,
  );
  skipped = apis.length * months.length * sigunguIds.length - taskKeys.length;

  const tasks: Array<() => Promise<void>> = taskKeys.map((k) => async () => {
    try {
      const upserted = await runOne(
        ADAPTERS[k.api as ApiType],
        k.sgg,
        sigunguToRegionCode.get(k.sgg)!,
        k.yyyymm,
        affectedPropertyIds,
      );
      totalUpserted += upserted;
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

  if (affectedPropertyIds.size > 0) {
    await updatePropertyAggregates(Array.from(affectedPropertyIds));
  }

  if (args.mode === 'daily') {
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

  const summary = { totalUpserted, skipped, failed, properties: affectedPropertyIds.size };
  logger.info(summary, 'runner done');
  await notify(failed === 0 ? 'info' : failed >= 5 ? 'warn' : 'info', 'ETL run complete', summary);

  await prisma.$disconnect();
}

async function runOne(
  adapter: Adapter,
  sigungu: string,
  regionCode: string,
  yyyymm: string,
  affectedProps: Set<bigint>,
): Promise<number> {
  const targetKey = `${sigungu}-${yyyymm}`;
  const run = await prisma.ingestionRun.create({
    data: { source: adapter.source, targetKey, status: 'RUNNING' },
  });

  try {
    const rows = await fetchAll(adapter, sigungu, yyyymm);

    // 시군구 내 기존 매물 일괄 로드 → findOrCreateProperty의 findFirst N번 → 1번으로 축소
    // redirectToId: null — 병합으로 리다이렉트된 패자는 캐시에서 제외한다. 안 그러면
    // (type, name) 키가 생존자/패자 중 findMany가 마지막으로 돌려준 쪽으로 고정되어,
    // 패자로 확정되면 그날 이후의 거래가 전부 301된 행에 쌓여 영영 복구 불가능해진다.
    const existingProps = await prisma.property.findMany({
      where: { regionCode: { startsWith: sigungu }, redirectToId: null },
    });
    const propCache = new Map<string, (typeof existingProps)[0]>();
    for (const p of existingProps) {
      propCache.set(`${p.propertyType}:${p.name}`, p);
    }

    // 행별 property 확정 (캐시 miss 시에만 findOrCreateProperty 호출)
    type Resolved = { row: NormalizedTransaction; property: (typeof existingProps)[0] };
    const resolved: Resolved[] = [];
    for (const row of rows) {
      if (!row.name) continue;
      const key = `${row.propertyType}:${row.name}`;
      let property = propCache.get(key);
      if (!property) {
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
      resolved.push({ row, property });
    }

    // 거래 배치 insert (rawHash unique → skipDuplicates로 멱등 처리)
    const { count: upserted } = await prisma.transaction.createMany({
      skipDuplicates: true,
      data: resolved.map(({ row, property }) => ({
        rawHash: computeHash(row, property.id),
        propertyId: property.id,
        propertyType: row.propertyType,
        regionCode: property.regionCode,
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
        source: adapter.source,
        externalKey: row.externalKey,
      })),
    });

    for (const { property } of resolved) {
      affectedProps.add(property.id);
    }

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'OK', rowsUpserted: upserted, finishedAt: new Date() },
    });
    logger.info({ source: adapter.source, sgg: sigungu, yyyymm, upserted }, 'sigungu-month ok');
    return upserted;
  } catch (err) {
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() },
    });
    throw err;
  }
}

async function fetchAll(adapter: Adapter, sigungu: string, yyyymm: string): Promise<NormalizedTransaction[]> {
  const all: NormalizedTransaction[] = [];
  let pageNo = 1;
  while (true) {
    const xml = await fetchPage({
      operation: adapter.endpoint,
      lawdCd: sigungu,
      dealYmd: yyyymm,
      pageNo,
      numOfRows: 1000,
    });
    assertNormalResponse(parseXml(xml));
    const { rows, totalCount } = adapter.parseRows(xml, sigungu);
    all.push(...rows);
    if (all.length >= totalCount || rows.length < 1000 || pageNo > 10) break;
    pageNo++;
  }
  return all;
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
