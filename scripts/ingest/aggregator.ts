import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function updatePropertyAggregates(propertyIds: bigint[]): Promise<void> {
  if (propertyIds.length === 0) return;

  await prisma.$executeRaw`
    WITH agg AS (
      SELECT
        "propertyId" AS pid,
        COUNT(*)::int AS cnt_total,
        (COUNT(*) FILTER (WHERE "contractDate" >= NOW() - INTERVAL '12 months'))::int AS cnt_12m,
        MAX("contractDate") AS last_at,

        (COUNT(*) FILTER (WHERE "dealType"='SALE' AND "contractDate" >= NOW() - INTERVAL '12 months'))::int AS sale_cnt,
        (AVG("dealAmount") FILTER (WHERE "dealType"='SALE' AND "contractDate" >= NOW() - INTERVAL '12 months'))::bigint AS sale_avg,
        (array_agg("dealAmount" ORDER BY "contractDate" DESC) FILTER (WHERE "dealType"='SALE'))[1]::bigint AS sale_last,
        MAX("contractDate") FILTER (WHERE "dealType"='SALE') AS sale_last_at,

        (COUNT(*) FILTER (WHERE "dealType"='JEONSE' AND "contractDate" >= NOW() - INTERVAL '12 months'))::int AS jeonse_cnt,
        (AVG("deposit") FILTER (WHERE "dealType"='JEONSE' AND "contractDate" >= NOW() - INTERVAL '12 months'))::bigint AS jeonse_avg,
        (array_agg("deposit" ORDER BY "contractDate" DESC) FILTER (WHERE "dealType"='JEONSE'))[1]::bigint AS jeonse_last,
        MAX("contractDate") FILTER (WHERE "dealType"='JEONSE') AS jeonse_last_at,

        (COUNT(*) FILTER (WHERE "dealType"='WOLSE' AND "contractDate" >= NOW() - INTERVAL '12 months'))::int AS wolse_cnt,
        (AVG("deposit") FILTER (WHERE "dealType"='WOLSE' AND "contractDate" >= NOW() - INTERVAL '12 months'))::bigint AS wolse_dep_avg,
        (AVG("monthlyRent") FILTER (WHERE "dealType"='WOLSE' AND "contractDate" >= NOW() - INTERVAL '12 months'))::int AS wolse_rent_avg,
        (array_agg("deposit" ORDER BY "contractDate" DESC) FILTER (WHERE "dealType"='WOLSE'))[1]::bigint AS wolse_last_dep,
        (array_agg("monthlyRent" ORDER BY "contractDate" DESC) FILTER (WHERE "dealType"='WOLSE'))[1]::int AS wolse_last_rent,
        MAX("contractDate") FILTER (WHERE "dealType"='WOLSE') AS wolse_last_at
      FROM "Transaction"
      WHERE "propertyId" = ANY(${propertyIds}::bigint[])
      GROUP BY "propertyId"
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
