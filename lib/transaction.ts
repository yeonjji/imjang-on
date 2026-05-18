import { prisma } from '@/lib/db';
import { DealType } from '@prisma/client';

export async function getTransactionCounts(propertyId: bigint) {
  const rows = await prisma.transaction.groupBy({
    by: ['dealType'],
    where: { propertyId },
    _count: true,
  });
  const result: Record<DealType, number> = { SALE: 0, JEONSE: 0, WOLSE: 0 };
  for (const r of rows) {
    result[r.dealType] = r._count;
  }
  return result;
}

export async function getTransactionsByType(propertyId: bigint, dealType: DealType, params: { page?: number; perPage?: number; area?: number | null }) {
  const { page = 1, perPage = 10, area = null } = params;
  const where: any = { propertyId, dealType };
  if (area) where.exclusiveArea = { gte: (area - 3) * 3.3057851239669422, lte: (area + 3) * 3.3057851239669422 };
  return prisma.transaction.findMany({
    where,
    orderBy: [{ contractDate: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * perPage,
    take: perPage,
  });
}

export async function getMonthlyChartData(propertyId: bigint) {
  const rows = await prisma.$queryRaw<Array<{ month: Date; deal_type: DealType; avg_value: number | null; cnt: number }>>`
    SELECT
      DATE_TRUNC('month', "contractDate")::date AS month,
      "dealType" AS deal_type,
      AVG(
        CASE
          WHEN "dealType" = 'SALE' THEN "dealAmount"
          WHEN "dealType" IN ('JEONSE', 'WOLSE') THEN "deposit"
        END
      )::float AS avg_value,
      COUNT(*)::int AS cnt
    FROM "Transaction"
    WHERE "propertyId" = ${propertyId}
      AND "contractDate" >= NOW() - INTERVAL '24 months'
    GROUP BY 1, 2
    ORDER BY 1 ASC
  `;
  const byType: Record<DealType, { month: string; value: number; count: number }[]> = { SALE: [], JEONSE: [], WOLSE: [] };
  for (const r of rows) {
    const monthStr = r.month.toISOString().slice(0, 7);
    if (r.avg_value !== null) {
      byType[r.deal_type].push({ month: monthStr, value: r.avg_value, count: r.cnt });
    }
  }
  return byType;
}
