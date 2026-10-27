import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { validDealSql } from '@/lib/transaction/valid-deal';

/** prisma 또는 interactive transaction 클라이언트. 대기열 소비는 트랜잭션 안에서 집계한다. */
export type Db = PrismaClient | Prisma.TransactionClient;

/** 매물 집계 컬럼(저장값). 순서는 SQL 비교·백업·롤백에서 공용. */
export const AGG_COLUMNS = [
  'txCountTotal', 'txCount12m', 'lastTxAt',
  'saleCount12m', 'saleAvgPrice12m', 'saleLastPrice', 'saleLastAt',
  'jeonseCount12m', 'jeonseAvgDeposit12m', 'jeonseLastDeposit', 'jeonseLastAt',
  'wolseCount12m', 'wolseAvgDeposit12m', 'wolseAvgRent12m', 'wolseLastDeposit', 'wolseLastRent', 'wolseLastAt',
  'areaTypes',
] as const;
export type AggColumn = (typeof AGG_COLUMNS)[number];

/**
 * 대상 매물의 '올바른' 집계값 CTE(agg). 유효 거래(해제 제외, lib/transaction/valid-deal.ts)만 센다.
 * 대상 매물을 ids로 LEFT JOIN해, 유효 거래가 0건인 매물도 0/null 행을 만든다(낡은 값 잔존 방지).
 * 면적대(areaTypes)는 통계가 아니라 '이 단지에 있는 평형' 정보라 해제 거래도 포함하고, 10㎡ 미만은 이상치로 뺀다.
 */
function aggCte(propertyIds: bigint[]): Prisma.Sql {
  return Prisma.sql`
    WITH ids AS (
      SELECT unnest(${propertyIds}::bigint[]) AS pid
    ),
    valid AS (
      SELECT * FROM "Transaction"
      WHERE "propertyId" = ANY(${propertyIds}::bigint[]) AND ${validDealSql()}
    ),
    area AS (
      SELECT "propertyId" AS pid,
             array_agg(DISTINCT ROUND("exclusiveArea" / 3.3057851239669422)::int
                       ORDER BY ROUND("exclusiveArea" / 3.3057851239669422)::int) AS types
      FROM "Transaction"
      WHERE "propertyId" = ANY(${propertyIds}::bigint[]) AND "exclusiveArea" >= 10
      GROUP BY "propertyId"
    ),
    stats AS (
      SELECT
        ids.pid AS pid,
        COUNT(v.id)::int AS "txCountTotal",
        (COUNT(v.id) FILTER (WHERE v."contractDate" >= NOW() - INTERVAL '12 months'))::int AS "txCount12m",
        MAX(v."contractDate") AS "lastTxAt",
        (COUNT(v.id) FILTER (WHERE v."dealType"='SALE' AND v."contractDate" >= NOW() - INTERVAL '12 months'))::int AS "saleCount12m",
        (AVG(v."dealAmount") FILTER (WHERE v."dealType"='SALE' AND v."contractDate" >= NOW() - INTERVAL '12 months'))::bigint AS "saleAvgPrice12m",
        (array_agg(v."dealAmount" ORDER BY v."contractDate" DESC) FILTER (WHERE v."dealType"='SALE'))[1]::bigint AS "saleLastPrice",
        MAX(v."contractDate") FILTER (WHERE v."dealType"='SALE') AS "saleLastAt",
        (COUNT(v.id) FILTER (WHERE v."dealType"='JEONSE' AND v."contractDate" >= NOW() - INTERVAL '12 months'))::int AS "jeonseCount12m",
        (AVG(v."deposit") FILTER (WHERE v."dealType"='JEONSE' AND v."contractDate" >= NOW() - INTERVAL '12 months'))::bigint AS "jeonseAvgDeposit12m",
        (array_agg(v."deposit" ORDER BY v."contractDate" DESC) FILTER (WHERE v."dealType"='JEONSE'))[1]::bigint AS "jeonseLastDeposit",
        MAX(v."contractDate") FILTER (WHERE v."dealType"='JEONSE') AS "jeonseLastAt",
        (COUNT(v.id) FILTER (WHERE v."dealType"='WOLSE' AND v."contractDate" >= NOW() - INTERVAL '12 months'))::int AS "wolseCount12m",
        (AVG(v."deposit") FILTER (WHERE v."dealType"='WOLSE' AND v."contractDate" >= NOW() - INTERVAL '12 months'))::bigint AS "wolseAvgDeposit12m",
        (AVG(v."monthlyRent") FILTER (WHERE v."dealType"='WOLSE' AND v."contractDate" >= NOW() - INTERVAL '12 months'))::int AS "wolseAvgRent12m",
        (array_agg(v."deposit" ORDER BY v."contractDate" DESC) FILTER (WHERE v."dealType"='WOLSE'))[1]::bigint AS "wolseLastDeposit",
        (array_agg(v."monthlyRent" ORDER BY v."contractDate" DESC) FILTER (WHERE v."dealType"='WOLSE'))[1]::int AS "wolseLastRent",
        MAX(v."contractDate") FILTER (WHERE v."dealType"='WOLSE') AS "wolseLastAt"
      FROM ids
      LEFT JOIN valid v ON v."propertyId" = ids.pid
      GROUP BY ids.pid
    ),
    agg AS (
      SELECT s.*, COALESCE(a.types, '{}'::int[]) AS "areaTypes"
      FROM stats s LEFT JOIN area a ON a.pid = s.pid
    )`;
}

const cols = (prefix: string) => Prisma.raw(AGG_COLUMNS.map((c) => `${prefix}."${c}"`).join(', '));
/** 저장값과 계산값이 하나라도 다른 행. */
const CHANGED = Prisma.sql`(${cols('p')}) IS DISTINCT FROM (${cols('agg')})`;
const asJson = (prefix: string) => Prisma.raw(AGG_COLUMNS.map((c) => `'${c}', ${prefix}."${c}"`).join(', '));

export interface AggregateDiff {
  id: bigint;
  /** 바뀌기 전 저장값(jsonb — 백업·롤백용). */
  old: Record<AggColumn, unknown>;
  new: Record<AggColumn, unknown>;
}

/** 쓰지 않고 바뀔 행만 돌려준다(dry-run·백업용). */
export async function diffPropertyAggregates(propertyIds: bigint[], db: Db = prisma): Promise<AggregateDiff[]> {
  if (propertyIds.length === 0) return [];
  return db.$queryRaw<AggregateDiff[]>`
    ${aggCte(propertyIds)}
    SELECT p.id, jsonb_build_object(${asJson('p')}) AS old, jsonb_build_object(${asJson('agg')}) AS new
    FROM "Property" p JOIN agg ON agg.pid = p.id
    WHERE ${CHANGED}
    ORDER BY p.id`;
}

/**
 * 매물 거래 집계(누적·12개월·최근가·면적대)를 다시 계산해 **바뀐 행만** 쓴다(쓰기·WAL 최소화).
 * db에 트랜잭션 클라이언트를 넘기면 그 트랜잭션 안에서 실행된다(대기열 소비). 반환: 실제로 바뀐 행 수.
 */
export async function updatePropertyAggregates(propertyIds: bigint[], db: Db = prisma): Promise<number> {
  if (propertyIds.length === 0) return 0;
  const changed = await db.$executeRaw`
    ${aggCte(propertyIds)}
    UPDATE "Property" p
    SET ${Prisma.raw(AGG_COLUMNS.map((c) => `"${c}" = agg."${c}"`).join(', '))}
    FROM agg
    WHERE p.id = agg.pid AND ${CHANGED}`;
  logger.info({ count: propertyIds.length, changed }, 'property aggregates updated');
  return changed;
}
