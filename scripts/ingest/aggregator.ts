import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { validDealSql } from '@/lib/transaction/valid-deal';

/**
 * 매물 거래 집계(누적·12개월·최근가). 유효 거래(해제 제외, lib/transaction/valid-deal.ts)만 센다.
 * 대상 매물을 ids로 LEFT JOIN해, 유효 거래가 0건이 된 매물도 0/null로 되돌린다(낡은 값 잔존 방지).
 * 면적대(areaTypes)는 통계가 아니라 '이 단지에 있는 평형' 정보라 해제 거래도 포함한다.
 */
export async function updatePropertyAggregates(propertyIds: bigint[]): Promise<void> {
  if (propertyIds.length === 0) return;

  await prisma.$executeRaw`
    WITH ids AS (
      SELECT unnest(${propertyIds}::bigint[]) AS pid
    ),
    valid AS (
      SELECT * FROM "Transaction"
      WHERE "propertyId" = ANY(${propertyIds}::bigint[]) AND ${validDealSql()}
    ),
    agg AS (
      SELECT
        ids.pid AS pid,
        COUNT(v.id)::int AS cnt_total,
        (COUNT(v.id) FILTER (WHERE v."contractDate" >= NOW() - INTERVAL '12 months'))::int AS cnt_12m,
        MAX(v."contractDate") AS last_at,

        (COUNT(v.id) FILTER (WHERE v."dealType"='SALE' AND v."contractDate" >= NOW() - INTERVAL '12 months'))::int AS sale_cnt,
        (AVG(v."dealAmount") FILTER (WHERE v."dealType"='SALE' AND v."contractDate" >= NOW() - INTERVAL '12 months'))::bigint AS sale_avg,
        (array_agg(v."dealAmount" ORDER BY v."contractDate" DESC) FILTER (WHERE v."dealType"='SALE'))[1]::bigint AS sale_last,
        MAX(v."contractDate") FILTER (WHERE v."dealType"='SALE') AS sale_last_at,

        (COUNT(v.id) FILTER (WHERE v."dealType"='JEONSE' AND v."contractDate" >= NOW() - INTERVAL '12 months'))::int AS jeonse_cnt,
        (AVG(v."deposit") FILTER (WHERE v."dealType"='JEONSE' AND v."contractDate" >= NOW() - INTERVAL '12 months'))::bigint AS jeonse_avg,
        (array_agg(v."deposit" ORDER BY v."contractDate" DESC) FILTER (WHERE v."dealType"='JEONSE'))[1]::bigint AS jeonse_last,
        MAX(v."contractDate") FILTER (WHERE v."dealType"='JEONSE') AS jeonse_last_at,

        (COUNT(v.id) FILTER (WHERE v."dealType"='WOLSE' AND v."contractDate" >= NOW() - INTERVAL '12 months'))::int AS wolse_cnt,
        (AVG(v."deposit") FILTER (WHERE v."dealType"='WOLSE' AND v."contractDate" >= NOW() - INTERVAL '12 months'))::bigint AS wolse_dep_avg,
        (AVG(v."monthlyRent") FILTER (WHERE v."dealType"='WOLSE' AND v."contractDate" >= NOW() - INTERVAL '12 months'))::int AS wolse_rent_avg,
        (array_agg(v."deposit" ORDER BY v."contractDate" DESC) FILTER (WHERE v."dealType"='WOLSE'))[1]::bigint AS wolse_last_dep,
        (array_agg(v."monthlyRent" ORDER BY v."contractDate" DESC) FILTER (WHERE v."dealType"='WOLSE'))[1]::int AS wolse_last_rent,
        MAX(v."contractDate") FILTER (WHERE v."dealType"='WOLSE') AS wolse_last_at
      FROM ids
      LEFT JOIN valid v ON v."propertyId" = ids.pid
      GROUP BY ids.pid
    )
    UPDATE "Property" p
    SET
      "txCountTotal" = agg.cnt_total,
      "txCount12m"   = agg.cnt_12m,
      "lastTxAt"     = agg.last_at,
      "saleCount12m"     = agg.sale_cnt,
      "saleAvgPrice12m"  = agg.sale_avg,
      "saleLastPrice"    = agg.sale_last,
      "saleLastAt"       = agg.sale_last_at,
      "jeonseCount12m"      = agg.jeonse_cnt,
      "jeonseAvgDeposit12m" = agg.jeonse_avg,
      "jeonseLastDeposit"   = agg.jeonse_last,
      "jeonseLastAt"        = agg.jeonse_last_at,
      "wolseCount12m"       = agg.wolse_cnt,
      "wolseAvgDeposit12m"  = agg.wolse_dep_avg,
      "wolseAvgRent12m"     = agg.wolse_rent_avg,
      "wolseLastDeposit"    = agg.wolse_last_dep,
      "wolseLastRent"       = agg.wolse_last_rent,
      "wolseLastAt"         = agg.wolse_last_at
    FROM agg
    WHERE p.id = agg.pid
  `;

  // 면적대(평형): 단지별 거래의 전용면적을 평으로 반올림해 DISTINCT 집계.
  // ⚠️ 이전 버전은 inner ARRAY(SELECT ... WHERE propertyId = ANY(batch)) 서브쿼리가
  //    바깥 단지와 상관(correlate)되지 않아 '배치 전체 전역 분포'를 모든 단지에 복사했다
  //    (모든 카드에 동일한 1~146평이 뜨는 원인). GROUP BY 내 array_agg로 단지별 집계한다.
  //    exclusiveArea < 10㎡(주거단위로 불가능한 값)는 이상치라 제외.
  await prisma.$executeRaw`
    UPDATE "Property" p
    SET "areaTypes" = sub.types
    FROM (
      SELECT "propertyId" AS pid,
             array_agg(DISTINCT ROUND("exclusiveArea" / 3.3057851239669422)::int
                       ORDER BY ROUND("exclusiveArea" / 3.3057851239669422)::int) AS types
      FROM "Transaction"
      WHERE "propertyId" = ANY(${propertyIds}::bigint[])
        AND "exclusiveArea" >= 10
      GROUP BY "propertyId"
    ) sub
    WHERE p.id = sub.pid
  `;

  logger.info({ count: propertyIds.length }, 'property aggregates updated');
}
