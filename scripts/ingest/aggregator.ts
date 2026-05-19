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

  await prisma.$executeRaw`
    UPDATE "Property" p
    SET "areaTypes" = sub.types
    FROM (
      SELECT "propertyId" AS pid,
             ARRAY(SELECT DISTINCT ROUND("exclusiveArea" / 3.3057851239669422)::int
                   FROM "Transaction"
                   WHERE "propertyId" = ANY(${propertyIds}::bigint[])
                   ORDER BY 1) AS types
      FROM "Transaction"
      WHERE "propertyId" = ANY(${propertyIds}::bigint[])
      GROUP BY "propertyId"
    ) sub
    WHERE p.id = sub.pid
  `;

  logger.info({ count: propertyIds.length }, 'property aggregates updated');
}
