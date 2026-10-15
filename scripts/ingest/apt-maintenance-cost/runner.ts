/**
 * K-apt 관리비 수집 러너.
 *
 *   pnpm ingest:maintenance-cost [--month=YYYYMM] [--limit=N] [--concurrency=N]
 *
 * 대상은 우리 페이지가 있는 단지(AptComplex.propertyId 있음, inUse)다. 최신 공개 월과 같은 해 1월
 * (겨울·여름 비교용)만 받는다. 이미 complete인 (단지, 월)은 건너뛰므로, 일일 한도에 걸려
 * 멈춰도 다음 실행이 이어 받는다. 화면은 DB만 읽으므로 revalidate를 호출하지 않는다(ISR 주기로 반영).
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import { QuotaExceededError } from '@/scripts/ingest/apt-complex/http';
import { fetchCostItem } from './http';
import { COST_OPS, type CostOp } from './ops';
import { readItem, summarizeMonth, toAmount, type OpResult, type MaintenanceAmounts } from './adapter';

export const MAINTENANCE_COST_SOURCE = 'apt-maintenance-cost';
const DEFAULT_CONCURRENCY = 3; // 동시 6에서 429 실측(2026-10-15)
const MIN_STAT_SAMPLE = 5;
const EMPTY_RETRY_MS = 60 * 86_400_000;

export type FetchItem = (op: CostOp, kaptCode: string, yearMonth: string) => Promise<unknown>;

export function shiftMonth(ym: string, delta: number): string {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(4, 6)) - 1 + delta, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function ymOf(date: Date): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 최신 월 + 같은 해 1월(겨울·여름 비교). 최신이 1월이면 하나. */
export function targetMonths(latest: string): string[] {
  const jan = `${latest.slice(0, 4)}01`;
  return latest === jan ? [latest] : [latest, jan];
}

/** 약 2개월 지연 공개(실측). 1~6개월 전을 최근부터 거꾸로 probe한다. */
export async function resolveLatestMonth(
  now: Date,
  probeCodes: string[],
  fetchItem: FetchItem = fetchCostItem,
): Promise<string | null> {
  const probeOp = COST_OPS.find((o) => o.op === 'getHsmpCleaningCostInfoV3')!;
  const current = ymOf(now);
  for (let back = 1; back <= 6; back++) {
    const ym = shiftMonth(current, -back);
    for (const code of probeCodes) {
      const { item } = readItem(await fetchItem(probeOp, code, ym));
      if (item && toAmount(item.cleanCost) !== null) return ym;
    }
  }
  return null;
}

function toDb(a: MaintenanceAmounts) {
  const big = (n: number | null) => (n === null ? null : BigInt(Math.round(n)));
  return {
    labor: big(a.labor), cleaning: big(a.cleaning), guard: big(a.guard), disinfection: big(a.disinfection),
    elevator: big(a.elevator), homeNetwork: big(a.homeNetwork), consignFee: big(a.consignFee),
    repairs: big(a.repairs), commonEtc: big(a.commonEtc), commonTotal: big(a.commonTotal),
    heat: big(a.heat), hotWater: big(a.hotWater), gas: big(a.gas), electricity: big(a.electricity),
    water: big(a.water), individualEtc: big(a.individualEtc),
    ltrLevy: big(a.ltrLevy), ltrUse: big(a.ltrUse), ltrBalance: big(a.ltrBalance),
    ltrRate: a.ltrRate,
  };
}

export async function runCollect(opts: {
  months: string[];
  limit?: number;
  concurrency?: number;
  fetchItem?: FetchItem;
  /** 테스트 전용 — 대상 단지를 좁힌다. */
  kaptCodes?: string[];
}): Promise<{ saved: number; quotaHit: boolean }> {
  const fetchItem = opts.fetchItem ?? fetchCostItem;
  const complexes = await prisma.aptComplex.findMany({
    where: {
      inUse: true,
      propertyId: { not: null },
      ...(opts.kaptCodes ? { kaptCode: { in: opts.kaptCodes } } : {}),
    },
    select: { kaptCode: true },
    orderBy: [{ sigunguCode: 'asc' }, { kaptCode: 'asc' }],
  });

  let saved = 0;
  let quotaHit = false;

  for (const ym of opts.months) {
    if (quotaHit) break;
    // 빈 응답(정상 응답인데 금액이 전부 비어 있음)은 공개 지연일 수 있어 월말+60일까지는 다시 받는다.
    const retryUntil = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(4, 6)), 0) + EMPTY_RETRY_MS);
    const existing = await prisma.aptMaintenanceCost.findMany({
      where: { yearMonth: ym, complete: true },
      select: { kaptCode: true, commonTotal: true, fetchedAt: true },
    });
    const done = new Set<string>();
    const emptyRetry = new Set<string>();
    for (const r of existing) {
      if (r.commonTotal !== null || r.fetchedAt >= retryUntil) done.add(r.kaptCode);
      else emptyRetry.add(r.kaptCode);
    }
    // 한도가 하루 수천 건이라 한 달치를 다 받기 전에 다음 달로 넘어갈 수 있다(운영 증설 전 약 43일/월).
    // 화면에 보여줄 데이터가 아직 없는 단지를 먼저 받아 뒤쪽 시군구가 영영 비는 일을 막는다.
    const withData = new Set(
      (await prisma.aptMaintenanceCost.findMany({
        where: { complete: true, commonTotal: { gt: 0 } },
        select: { kaptCode: true },
        distinct: ['kaptCode'],
      })).map((r) => r.kaptCode),
    );
    const rank = (k: string) => (emptyRetry.has(k) ? 2 : withData.has(k) ? 1 : 0);
    let todo = complexes
      .map((c) => c.kaptCode)
      .filter((k) => !done.has(k))
      .map((k, i) => ({ k, i, r: rank(k) }))
      .sort((a, b) => a.r - b.r || a.i - b.i)
      .map((x) => x.k);
    if (opts.limit) todo = todo.slice(0, opts.limit);

    let next = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        if (quotaHit) return;
        const i = next++;
        if (i >= todo.length) return;
        const kaptCode = todo[i];
        const results: OpResult[] = [];
        for (const op of COST_OPS) {
          if (quotaHit) return;
          try {
            const { ok, item } = readItem(await fetchItem(op, kaptCode, ym));
            results.push({ op, ok, item });
          } catch (err) {
            if (err instanceof QuotaExceededError) {
              quotaHit = true; // 이 단지는 저장하지 않는다. 다음 실행이 처음부터 받는다.
              return;
            }
            logger.warn({ err, kaptCode, ym, op: op.op }, 'maintenance-cost op failed');
            results.push({ op, ok: false, item: null });
          }
        }
        const row = summarizeMonth(results);
        const data = { ...toDb(row.amounts), complete: row.complete, raw: row.raw as object, fetchedAt: new Date() };
        await prisma.aptMaintenanceCost.upsert({
          where: { kaptCode_yearMonth: { kaptCode, yearMonth: ym } },
          create: { kaptCode, yearMonth: ym, ...data },
          update: data,
        });
        saved++;
        if (saved % 500 === 0) logger.info({ saved, ym }, 'maintenance-cost progress');
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY) }, () => worker()));
    logger.info({ ym, todo: todo.length, saved, quotaHit }, 'maintenance-cost month pass');
  }
  return { saved, quotaHit };
}

/**
 * 시군구 × 월 공용관리비 ㎡당 중앙값. 분모는 K-apt 기본정보의 관리비부과면적(rawJson.kaptMarea).
 * 표본 5개 미만 시군구는 저장하지 않는다(화면에서 비교 칸이 빠진다).
 */
export async function refreshStats(yearMonth: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.aptMaintenanceCostStat.deleteMany({ where: { yearMonth } });
    return tx.$executeRaw`
      INSERT INTO "AptMaintenanceCostStat" ("sigunguCode", "yearMonth", "medianCommonPerM2", "sampleCount", "computedAt")
      SELECT ac."sigunguCode", m."yearMonth",
             ROUND(percentile_cont(0.5) WITHIN GROUP (
               ORDER BY m."commonTotal"::float8 / (ac."rawJson"->>'kaptMarea')::float8
             ))::int,
             COUNT(*)::int,
             now()
      FROM "AptMaintenanceCost" m
      JOIN "AptComplex" ac ON ac."kaptCode" = m."kaptCode"
      WHERE m."yearMonth" = ${yearMonth}
        AND m.complete
        AND m."commonTotal" > 0
        AND (ac."rawJson"->>'kaptMarea') ~ '^[0-9]+(\\.[0-9]+)?$'
        AND (ac."rawJson"->>'kaptMarea')::float8 > 0
      GROUP BY ac."sigunguCode", m."yearMonth"
      HAVING COUNT(*) >= ${MIN_STAT_SAMPLE}
    `;
  });
}

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
}

async function main(): Promise<void> {
  const run = await prisma.ingestionRun.create({
    data: { source: MAINTENANCE_COST_SOURCE, targetKey: 'resolving', status: 'RUNNING' },
  });
  try {
    let latest = arg('month') ?? null;
    if (!latest) {
      const probes = (await prisma.aptComplex.findMany({
        where: { inUse: true, propertyId: { not: null } },
        select: { kaptCode: true },
        orderBy: { kaptCode: 'asc' },
        take: 3,
      })).map((r) => r.kaptCode);
      latest = await resolveLatestMonth(new Date(), probes);
    }
    if (!latest) throw new Error('최근 6개월 안에 공개된 관리비 월을 찾지 못했다');

    const months = targetMonths(latest);
    const limit = Number(arg('limit')) || undefined;
    const concurrency = Number(arg('concurrency')) || undefined;
    const { saved, quotaHit } = await runCollect({ months, limit, concurrency });
    for (const ym of months) await refreshStats(ym);

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'OK', targetKey: latest, rowsUpserted: saved, finishedAt: new Date() },
    });
    await notify(quotaHit ? 'warn' : 'info', `apt-maintenance-cost ${latest}${quotaHit ? ' 한도 도달로 중단(다음 실행이 이어 받음)' : ' 완료'}`, { months, saved });
  } catch (err) {
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() },
    });
    logger.error({ err }, 'apt-maintenance-cost failed');
    await notify('error', 'apt-maintenance-cost failed', { err: String(err) });
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && process.argv[1].includes('apt-maintenance-cost/runner')) {
  main().catch((err) => {
    logger.error({ err }, 'apt-maintenance-cost runner fatal');
    process.exit(1);
  });
}
