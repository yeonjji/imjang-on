import { prisma } from '@/lib/db';
import type { DealType, Prisma } from '@prisma/client';
import type { MonthPoint } from '@/lib/price-chart';
import { pctChange } from '@/lib/price-chart';

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

export type ChartData = Record<DealType, MonthPoint[]>;

export async function getMonthlyChartData(propertyId: bigint): Promise<ChartData> {
  const rows = await prisma.$queryRaw<
    Array<{
      month: Date;
      deal_type: DealType;
      avg_value: number | null;
      min_value: number | null;
      max_value: number | null;
      cnt: number;
    }>
  >`
    SELECT
      DATE_TRUNC('month', "contractDate")::date AS month,
      "dealType" AS deal_type,
      AVG(val)::float AS avg_value,
      MIN(val)::float AS min_value,
      MAX(val)::float AS max_value,
      COUNT(*)::int AS cnt
    FROM (
      SELECT
        "contractDate",
        "dealType",
        CASE WHEN "dealType" = 'SALE' THEN "dealAmount" ELSE "deposit" END AS val
      FROM "Transaction"
      WHERE "propertyId" = ${propertyId}
        AND "contractDate" >= NOW() - INTERVAL '24 months'
    ) t
    WHERE val IS NOT NULL
    GROUP BY 1, 2
    ORDER BY 1 ASC
  `;

  const byType: ChartData = { SALE: [], JEONSE: [], WOLSE: [] };
  for (const r of rows) {
    if (r.avg_value === null || r.min_value === null || r.max_value === null) continue;
    byType[r.deal_type].push({
      month: r.month.toISOString().slice(0, 7),
      avg: r.avg_value,
      min: r.min_value,
      max: r.max_value,
      count: r.cnt,
    });
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
  /** 직전 12개월(12~24개월 전) 매매 평균. 평형 보정 변동률의 기준값. */
  avgPrior12m: number | null;
  countPrior12m: number;
  /** 평형 보정 변동률(%): 최근 12개월 평균 vs 직전 12개월 평균. 각 기간 표본<2건이면 null(노이즈 방지). */
  changePct12m: number | null;
  /** 동일 평형 12개월 전세 평균(만원)·건수. 전세가율의 분자. */
  jeonseAvg12m: number | null;
  jeonseCount12m: number;
  /** 평형 일치 전세가율(%) = 전세평균/매매평균. 매매·전세 각 표본<2건이면 null(평형 혼합 금지). */
  jeonseRatioPct: number | null;
  /** 매매−전세 갭(만원, 동일 평형). */
  gap12m: number | null;
}

export async function getAreaSummary(propertyId: bigint): Promise<AreaSummaryItem[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      area: number;
      last_price: number | null;
      avg_12m: number | null;
      cnt_12m: number;
      avg_prior: number | null;
      cnt_prior: number;
      jeonse_avg: number | null;
      jeonse_cnt: number;
    }>
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
    ),
    prior AS (
      SELECT
        area_pyeong,
        AVG("dealAmount")::float AS avg_prior,
        COUNT(*)::int AS cnt_prior
      FROM base
      WHERE "contractDate" >= NOW() - INTERVAL '24 months'
        AND "contractDate" < NOW() - INTERVAL '12 months'
      GROUP BY area_pyeong
    ),
    jeonse AS (
      SELECT
        ROUND("exclusiveArea"::numeric / 3.3057851239669422)::int AS area_pyeong,
        AVG("deposit")::float AS jeonse_avg,
        COUNT(*)::int AS jeonse_cnt
      FROM "Transaction"
      WHERE "propertyId" = ${propertyId}
        AND "dealType" = 'JEONSE'
        AND "deposit" IS NOT NULL
        AND "contractDate" >= NOW() - INTERVAL '12 months'
      GROUP BY area_pyeong
    )
    SELECT
      l.area_pyeong AS area,
      l.last_price,
      s.avg_12m,
      COALESCE(s.cnt_12m, 0) AS cnt_12m,
      p.avg_prior,
      COALESCE(p.cnt_prior, 0) AS cnt_prior,
      j.jeonse_avg,
      COALESCE(j.jeonse_cnt, 0) AS jeonse_cnt
    FROM latest l
    LEFT JOIN stats s ON s.area_pyeong = l.area_pyeong
    LEFT JOIN prior p ON p.area_pyeong = l.area_pyeong
    LEFT JOIN jeonse j ON j.area_pyeong = l.area_pyeong
    ORDER BY COALESCE(s.cnt_12m, 0) DESC
    LIMIT 4
  `;
  return rows.map((r) => {
    // 평형 보정 변동률: 국토부 미제공. 두 기간 각각 표본 2건 이상일 때만 계산(단건 노이즈 배제).
    const changePct12m =
      r.avg_12m != null && r.avg_prior != null && r.cnt_12m >= 2 && r.cnt_prior >= 2
        ? pctChange(r.avg_12m, r.avg_prior)
        : null;
    // 평형 일치 전세가율·갭: 국토부 미제공. 동일 평형 매매·전세 각 표본 2건 이상일 때만(평형 혼합 금지).
    const jeonseRatioPct =
      r.avg_12m != null && r.jeonse_avg != null && r.cnt_12m >= 2 && r.jeonse_cnt >= 2 && r.avg_12m > 0
        ? (r.jeonse_avg / r.avg_12m) * 100
        : null;
    const gap12m =
      r.avg_12m != null && r.jeonse_avg != null && r.cnt_12m >= 2 && r.jeonse_cnt >= 2
        ? r.avg_12m - r.jeonse_avg
        : null;
    return {
      area: r.area,
      lastPrice: r.last_price,
      avg12m: r.avg_12m,
      count12m: r.cnt_12m,
      avgPrior12m: r.avg_prior,
      countPrior12m: r.cnt_prior,
      changePct12m,
      jeonseAvg12m: r.jeonse_avg,
      jeonseCount12m: r.jeonse_cnt,
      jeonseRatioPct,
      gap12m,
    };
  });
}

export interface SameFloorPair {
  pyeong: number;
  floor: number;
  recentPrice: number;
  recentDate: string; // YYYY-MM-DD
  prevPrice: number;
  prevDate: string;
  changePct: number;
  days: number;
}

/**
 * 동일 평형·동일 층의 가장 최근 매매 두 건을 비교한다(회귀·기준선 불필요).
 * 평형·층이 같아 물건(향·라인) 차이로 설명되지 않는 순수 가격 변화 관측치.
 * 비교 가능한(직전 거래가 존재하는) 쌍이 없으면 null.
 */
export async function getSameFloorComparison(propertyId: bigint): Promise<SameFloorPair | null> {
  const rows = await prisma.$queryRaw<
    Array<{
      pyeong: number;
      floor: number;
      recent_price: number;
      recent_date: Date;
      prev_price: number;
      prev_date: Date;
      days: number;
    }>
  >`
    WITH sale AS (
      SELECT
        id,
        ROUND("exclusiveArea"::numeric / 3.3057851239669422)::int AS pyeong,
        "floor",
        "dealAmount"::float AS price,
        "contractDate"
      FROM "Transaction"
      WHERE "propertyId" = ${propertyId}
        AND "dealType" = 'SALE'
        AND "dealAmount" IS NOT NULL
        AND "floor" IS NOT NULL
    ),
    recent AS (
      SELECT DISTINCT ON (pyeong, "floor") pyeong, "floor", price, "contractDate"
      FROM sale
      ORDER BY pyeong, "floor", "contractDate" DESC, id DESC
    ),
    prev AS (
      SELECT DISTINCT ON (s.pyeong, s."floor")
        s.pyeong, s."floor", s.price AS prev_price, s."contractDate" AS prev_date
      FROM sale s
      JOIN recent r ON r.pyeong = s.pyeong AND r."floor" = s."floor"
      WHERE s."contractDate" < r."contractDate"
      ORDER BY s.pyeong, s."floor", s."contractDate" DESC, s.id DESC
    )
    SELECT
      r.pyeong,
      r."floor" AS floor,
      r.price AS recent_price,
      r."contractDate" AS recent_date,
      p.prev_price,
      p.prev_date,
      (r."contractDate" - p.prev_date)::int AS days
    FROM recent r
    JOIN prev p ON p.pyeong = r.pyeong AND p."floor" = r."floor"
    ORDER BY r."contractDate" DESC
    LIMIT 1
  `;
  const r = rows[0];
  if (!r) return null;
  const changePct = pctChange(r.recent_price, r.prev_price);
  if (changePct == null) return null;
  return {
    pyeong: r.pyeong,
    floor: r.floor,
    recentPrice: r.recent_price,
    recentDate: r.recent_date.toISOString().slice(0, 10),
    prevPrice: r.prev_price,
    prevDate: r.prev_date.toISOString().slice(0, 10),
    changePct,
    days: r.days,
  };
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
