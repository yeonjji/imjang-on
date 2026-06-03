import { prisma } from '@/lib/db';
import type { DealType, Prisma } from '@prisma/client';

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
  const where: Prisma.TransactionWhereInput = { propertyId, dealType };
  if (area)
    where.exclusiveArea = {
      gte: (area - 3) * 3.3057851239669422,
      lte: (area + 3) * 3.3057851239669422,
    };
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

export interface UnifiedTxRow {
  id: string;
  dealType: DealType;
  contractDate: string;
  exclusiveArea: number;
  floor: number | null;
  dealAmount: number | null;
  deposit: number | null;
  monthlyRent: number | null;
}

export interface AreaSummaryItem {
  area: number;
  lastPrice: number | null;
  avg12m: number | null;
  count12m: number;
}

export async function getAreaSummary(propertyId: bigint): Promise<AreaSummaryItem[]> {
  const rows = await prisma.$queryRaw<
    Array<{ area: number; last_price: number | null; avg_12m: number | null; cnt_12m: number }>
  >`
    WITH base AS (
      SELECT
        ROUND("exclusiveArea"::numeric / 3.3057851239669422)::int AS area_pyeong,
        "dealAmount",
        "contractDate"
      FROM "Transaction"
      WHERE "propertyId" = ${propertyId}
        AND "dealType" = 'SALE'
        AND "dealAmount" IS NOT NULL
    ),
    latest AS (
      SELECT DISTINCT ON (area_pyeong)
        area_pyeong,
        "dealAmount"::float AS last_price
      FROM base
      ORDER BY area_pyeong, "contractDate" DESC
    ),
    stats AS (
      SELECT
        area_pyeong,
        AVG("dealAmount")::float AS avg_12m,
        COUNT(*)::int AS cnt_12m
      FROM base
      WHERE "contractDate" >= NOW() - INTERVAL '12 months'
      GROUP BY area_pyeong
    )
    SELECT
      l.area_pyeong AS area,
      l.last_price,
      s.avg_12m,
      COALESCE(s.cnt_12m, 0) AS cnt_12m
    FROM latest l
    LEFT JOIN stats s ON s.area_pyeong = l.area_pyeong
    ORDER BY COALESCE(s.cnt_12m, 0) DESC
    LIMIT 4
  `;
  return rows.map((r) => ({
    area: r.area,
    lastPrice: r.last_price,
    avg12m: r.avg_12m,
    count12m: r.cnt_12m,
  }));
}

export async function getUnifiedTransactions(
  propertyId: bigint,
  params: { page?: number; perPage?: number; dealType?: DealType },
): Promise<{ rows: UnifiedTxRow[]; totalCount: number }> {
  const { page = 1, perPage = 15, dealType } = params;
  const where: Prisma.TransactionWhereInput = {
    propertyId,
    ...(dealType ? { dealType } : {}),
  };
  const [rawRows, totalCount] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: [{ contractDate: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        dealType: true,
        contractDate: true,
        exclusiveArea: true,
        floor: true,
        dealAmount: true,
        deposit: true,
        monthlyRent: true,
      },
    }),
    prisma.transaction.count({ where }),
  ]);
  return {
    rows: rawRows.map((t) => ({
      id: String(t.id),
      dealType: t.dealType,
      contractDate: t.contractDate.toISOString().slice(0, 10),
      exclusiveArea: Number(t.exclusiveArea),
      floor: t.floor,
      dealAmount: t.dealAmount !== null ? Number(t.dealAmount) : null,
      deposit: t.deposit !== null ? Number(t.deposit) : null,
      monthlyRent: t.monthlyRent !== null ? Number(t.monthlyRent) : null,
    })),
    totalCount,
  };
}
