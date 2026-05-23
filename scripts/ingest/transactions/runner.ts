import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { fetchPage } from '@/scripts/ingest/http';
import { findOrCreateProperty } from '@/scripts/ingest/property-matcher';
import { updatePropertyAggregates } from '@/scripts/ingest/aggregator';
import { revalidatePaths, propertyPath, regionPath } from '@/scripts/ingest/revalidator';
import { notify } from '@/scripts/ingest/notify';

import { adapterAptTrade } from './adapter-apt-trade';
import { adapterAptRent } from './adapter-apt-rent';
import { adapterOffiTrade } from './adapter-offi-trade';
import { adapterOffiRent } from './adapter-offi-rent';
import { adapterRhTrade } from './adapter-rh-trade';
import { adapterRhRent } from './adapter-rh-rent';

import type { Adapter, ApiType, Mode, NormalizedTransaction } from '@/scripts/ingest/types';
import { createHash } from 'node:crypto';

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
}

function parseArgs(): RunArgs {
  const args = process.argv.slice(2);
  const get = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
  const api = (get('api') ?? 'all') as ApiType | 'all';
  const mode = (get('mode') ?? 'daily') as Mode;
  const months = Number(get('months') ?? '1');
  const monthOffset = get('month-offset') !== undefined ? Number(get('month-offset')) : undefined;
  return { api, mode, months, monthOffset };
}

async function main() {
  const args = parseArgs();
  const apis = args.api === 'all' ? (Object.keys(ADAPTERS) as ApiType[]) : [args.api];
  const months =
    args.mode === 'daily'
      ? getDailyMonths()
      : args.monthOffset !== undefined
        ? [getMonthByOffset(args.monthOffset)]
        : getBackfillMonths(args.months);

  logger.info({ apis, months, mode: args.mode }, 'runner start');

  const sigunguRecords = await prisma.region.findMany({
    where: { level: 2, isAbolished: false },
    select: { code: true },
  });
  // sigunguCode (5자리) → 실제 Region.code (10자리) 매핑.
  // padEnd로 강제 매핑하면 세종 등 특수 케이스 FK 위반 발생.
  const sigunguToRegionCode = new Map<string, string>();
  for (const r of sigunguRecords) {
    sigunguToRegionCode.set(r.code.slice(0, 5), r.code);
  }
  const sigunguIds = Array.from(sigunguToRegionCode.keys());

  const sources = apis.map((a) => ADAPTERS[a].source);
  const doneRuns = await prisma.ingestionRun.findMany({
    where: { source: { in: sources }, status: 'OK' },
    select: { source: true, targetKey: true },
  });
  // daily 모드에서 이번달은 항상 재처리 — 당월 신규 거래 누락 방지
  const currentMonth = args.mode === 'daily' ? getDailyMonths()[0] : null;
  const doneKeys = new Set(
    doneRuns
      .filter((r) => !currentMonth || !r.targetKey.endsWith(`-${currentMonth}`))
      .map((r) => `${r.source}:${r.targetKey}`),
  );
  logger.info({ skippable: doneKeys.size }, 'resume: loaded completed keys');

  let totalUpserted = 0;
  let failed = 0;
  let skipped = 0;
  const affectedPropertyIds = new Set<bigint>();
  const affectedRegionCodes = new Set<string>();

  const tasks: Array<() => Promise<void>> = [];
  for (const api of apis) {
    const adapter = ADAPTERS[api];
    for (const sgg of sigunguIds) {
      const regionCode = sigunguToRegionCode.get(sgg)!;
      for (const yyyymm of months) {
        const targetKey = `${sgg}-${yyyymm}`;
        if (doneKeys.has(`${adapter.source}:${targetKey}`)) {
          skipped++;
          continue;
        }
        tasks.push(async () => {
          try {
            const upserted = await runOne(adapter, sgg, regionCode, yyyymm, affectedPropertyIds, affectedRegionCodes);
            totalUpserted += upserted;
          } catch (err) {
            failed++;
            logger.error({ err, api: adapter.source, sgg, yyyymm }, 'sigungu-month failed');
          }
        });
      }
    }
  }
  await runWithLimit(tasks, 5);

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
    for (const sgg of affectedRegionCodes) paths.push(regionPath(sgg));
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
  affectedRegions: Set<string>,
): Promise<number> {
  const targetKey = `${sigungu}-${yyyymm}`;
  const run = await prisma.ingestionRun.create({
    data: { source: adapter.source, targetKey, status: 'RUNNING' },
  });

  try {
    const rows = await fetchAll(adapter, sigungu, yyyymm);
    let upserted = 0;
    const propertyCache = new Map<string, Awaited<ReturnType<typeof findOrCreateProperty>>>();
    for (const row of rows) {
      if (!row.name) continue;
      const cacheKey = `${row.propertyType}:${row.name}:${row.sigunguCode}`;
      let property = propertyCache.get(cacheKey);
      if (!property) {
        property = await findOrCreateProperty({
          propertyType: row.propertyType,
          name: row.name,
          sigunguCode: row.sigunguCode,
          // 실제 level-2 Region.code (사전 매핑) — FK 안전 보장
          regionCode,
          address: buildAddress(row),
          buildYear: row.buildYear,
          roadName: row.roadName,
        });
        propertyCache.set(cacheKey, property);
      }
      const rawHash = computeHash(row, property.id);
      try {
        await prisma.transaction.upsert({
          where: { rawHash },
          create: {
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
            rawHash,
          },
          update: {},
        });
        upserted++;
        affectedProps.add(property.id);
        affectedRegions.add(row.sigunguCode);
      } catch (err) {
        logger.warn({ err, rawHash }, 'transaction upsert failed');
      }
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
    const { rows, totalCount } = adapter.parseRows(xml, sigungu);
    all.push(...rows);
    if (all.length >= totalCount || rows.length < 1000 || pageNo > 10) break;
    pageNo++;
  }
  return all;
}

function buildAddress(row: NormalizedTransaction): string {
  const parts: string[] = [];
  if (row.umd) parts.push(row.umd);
  if (row.roadName) parts.push(row.roadName);
  if (row.jibun) parts.push(row.jibun);
  return parts.join(' ').trim();
}

function computeHash(row: NormalizedTransaction, propertyId: bigint): string {
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

main().catch((err) => {
  logger.error({ err }, 'runner fatal');
  process.exit(1);
});
