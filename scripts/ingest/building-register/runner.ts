/**
 * 건축물대장 수집(매일, 온박스 타이머). 단지당 1행(BuildingRegister)을 쓰고 화면은 matched 행만 쓴다.
 *   pnpm ingest:building-register [--max-minutes=100] [--limit=N]
 * 대상: 행이 없거나 api_error인 단지(이번 실행에서 이미 받은 것 제외). 아파트→오피스텔→연립→다세대,
 * 같은 유형은 최근 12개월 거래 많은 순. 한도 초과는 즉시 중단, 시간 예산이 지나면 새 단지를 받지 않는다.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import { QuotaExceededError } from '@/scripts/ingest/apt-complex/http';
import { loadLegalDongLookup } from '@/scripts/ingest/legal-dong/load';
import { buildRegisterKey, type RegisterKey, type TxPair } from './key';
import { fetchBrItems, type BrOp } from './http';
import { selectTarget, isMain, type PropertyKind, type Rec } from './select';
import { normalizeRegister, type RegisterFields } from './normalize';

export const BUILDING_REGISTER_SOURCE = 'building-register';
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_MAX_MINUTES = 100;
const BATCH = 2_000;

export type FetchItems = (op: BrOp, key: RegisterKey) => Promise<Rec[]>;

interface Target {
  id: bigint;
  propertyType: PropertyKind;
  name: string;
  builtYear: number | null;
}

const EMPTY: Omit<RegisterFields, 'mainBuildingCount' | 'seismicApplied' | 'hasNeighborhoodFacility'> & {
  mainBuildingCount: null; seismicApplied: null; hasNeighborhoodFacility: false;
} = {
  useAprDate: null, structure: null, mainPurpose: null, etcPurpose: null, groundFloors: null, undergroundFloors: null,
  mainBuildingCount: null, households: null, units: null, elevators: null, parkingTotal: null, bcRat: null, vlRat: null,
  seismicApplied: null, zoningKind: null, zoningName: null, hasNeighborhoodFacility: false, registerCreatedAt: null,
};

async function save(propertyId: bigint, status: string, key: RegisterKey | null, fields: Partial<RegisterFields> = {}, raw?: object) {
  const data = {
    status,
    bjdCode: key?.bjdCode ?? null, platGbCd: key?.platGbCd ?? null, bun: key?.bun ?? null, ji: key?.ji ?? null,
    ...EMPTY,
    ...fields,
    raw: raw ?? Prisma.JsonNull,
    fetchedAt: new Date(),
  };
  await prisma.buildingRegister.upsert({ where: { propertyId }, create: { propertyId, ...data }, update: data });
}

async function nextTargets(runStart: Date, propertyIds: bigint[] | undefined): Promise<Target[]> {
  const scope = propertyIds ? Prisma.sql`AND p.id IN (${Prisma.join(propertyIds)})` : Prisma.empty;
  return prisma.$queryRaw<Target[]>`
    SELECT p.id, p."propertyType", p.name, p."builtYear"
    FROM "Property" p
    LEFT JOIN "BuildingRegister" b ON b."propertyId" = p.id
    WHERE p."redirectToId" IS NULL
      AND (b."propertyId" IS NULL OR (b.status = 'api_error' AND b."fetchedAt" < ${runStart}))
      ${scope}
    ORDER BY CASE p."propertyType" WHEN 'APARTMENT' THEN 0 WHEN 'OFFICETEL' THEN 1 WHEN 'ROW_HOUSE' THEN 2 ELSE 3 END,
             p."txCount12m" DESC, p.id
    LIMIT ${BATCH}`;
}

export async function runCollect(opts: {
  deadline?: number;
  concurrency?: number;
  limit?: number;
  fetchItems?: FetchItems;
  /** 테스트·스모크 전용 — 대상 단지를 좁힌다. */
  propertyIds?: bigint[];
}): Promise<{ processed: number; matched: number; quotaHit: boolean; timeUp: boolean }> {
  const fetchItems = opts.fetchItems ?? fetchBrItems;
  const lookup = await loadLegalDongLookup();
  const runStart = new Date();
  let processed = 0;
  let matched = 0;
  let quotaHit = false;
  let timeUp = false;
  const overLimit = () => opts.limit !== undefined && processed >= opts.limit;

  const handle = async (t: Target): Promise<void> => {
    const pairs = await prisma.$queryRaw<TxPair[]>`
      SELECT DISTINCT "sigunguCode", umd, jibun FROM "Transaction" WHERE "propertyId" = ${t.id}`;
    const k = buildRegisterKey(pairs, lookup);
    if (k.status !== 'ok') {
      await save(t.id, k.status, null);
      return;
    }
    let recap: Rec[];
    let titles: Rec[];
    try {
      recap = await fetchItems('getBrRecapTitleInfo', k.key);
      titles = await fetchItems('getBrTitleInfo', k.key);
      const sel = selectTarget({ type: t.propertyType, name: t.name, builtYear: t.builtYear, recap, titles });
      if (sel.status !== 'matched') {
        await save(t.id, sel.status, k.key);
        return;
      }
      const jijigu = await fetchItems('getBrJijiguInfo', k.key);
      const fields = normalizeRegister(sel, jijigu, titles.filter((x) => !isMain(x)));
      await save(t.id, 'matched', k.key, fields, { recap: sel.recap, mains: sel.mains, jijigu });
      matched++;
    } catch (err) {
      if (err instanceof QuotaExceededError) throw err;
      logger.warn({ err, propertyId: String(t.id) }, 'building-register api error');
      await save(t.id, 'api_error', k.key);
    }
  };

  outer: for (;;) {
    const targets = await nextTargets(runStart, opts.propertyIds);
    if (targets.length === 0) break;
    let next = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        if (quotaHit || timeUp || overLimit()) return;
        if (opts.deadline !== undefined && Date.now() > opts.deadline) {
          timeUp = true;
          return;
        }
        const i = next++;
        if (i >= targets.length) return;
        try {
          await handle(targets[i]);
          processed++;
        } catch (err) {
          if (err instanceof QuotaExceededError) {
            quotaHit = true;
            return;
          }
          logger.warn({ err, propertyId: String(targets[i].id) }, 'building-register save failed — skipped');
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY) }, () => worker()));
    logger.info({ processed, matched, batch: targets.length }, 'building-register batch done');
    if (quotaHit || timeUp || overLimit()) break outer;
  }
  return { processed, matched, quotaHit, timeUp };
}

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const run = await prisma.ingestionRun.create({ data: { source: BUILDING_REGISTER_SOURCE, targetKey: 'daily', status: 'RUNNING' } });
  try {
    const maxMinutes = Number(arg('max-minutes')) || DEFAULT_MAX_MINUTES;
    const limit = Number(arg('limit')) || undefined;
    const r = await runCollect({ deadline: startedAt + maxMinutes * 60_000, limit });
    await prisma.ingestionRun.update({ where: { id: run.id }, data: { status: 'OK', rowsUpserted: r.processed, finishedAt: new Date() } });
    const stop = r.quotaHit ? ' 한도 도달로 중단' : r.timeUp ? ' 시간 예산 도달로 중단' : '';
    await notify('info', `building-register${stop || ' 완료'}`, r);
  } catch (err) {
    await prisma.ingestionRun.update({ where: { id: run.id }, data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() } });
    logger.error({ err }, 'building-register failed');
    await notify('error', 'building-register failed', { err: String(err) });
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && process.argv[1].includes('building-register/runner')) {
  main().catch((err) => {
    logger.error({ err }, 'building-register runner fatal');
    process.exit(1);
  });
}
