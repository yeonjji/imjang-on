import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

export const SIGUNGU_MEDIAN_KEY = 'subscription_sigungu_median';

export interface SigunguMedian {
  median: number;
  count: number;
}

/** 표본이 이보다 적은 시군구는 스냅샷에 넣지 않는다. */
export const MIN_SAMPLE = 30;

/** 시군구별 최근 12개월 아파트 매매 중위 거래가(만원)와 건수. 실측 대상 249곳. */
export async function computeSigunguMedians(): Promise<Record<string, SigunguMedian>> {
  const rows = await prisma.$queryRaw<Array<{ sgg: string; med: number; n: bigint }>>`
    SELECT "sigunguCode" AS sgg,
           ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY "dealAmount"))::int AS med,
           COUNT(*) AS n
    FROM "Transaction"
    WHERE "propertyType" = 'APARTMENT' AND "dealType" = 'SALE'
      AND "contractDate" >= (CURRENT_DATE - INTERVAL '12 months')
      AND "dealAmount" IS NOT NULL AND "cancelDate" IS NULL
    GROUP BY "sigunguCode"
    HAVING COUNT(*) >= ${MIN_SAMPLE}
  `;
  const out: Record<string, SigunguMedian> = {};
  for (const r of rows) out[r.sgg] = { median: r.med, count: Number(r.n) };
  return out;
}

export async function writeSigunguMedianSnapshot(): Promise<void> {
  const payload = (await computeSigunguMedians()) as unknown as Prisma.InputJsonValue;
  await prisma.dashboardSnapshot.upsert({
    where: { key: SIGUNGU_MEDIAN_KEY },
    create: { key: SIGUNGU_MEDIAN_KEY, payload },
    update: { payload },
  });
}

/** 상세 페이지에서 호출. 없으면 null → 비교 줄을 렌더하지 않는다. */
export async function readSigunguMedianSnapshot(): Promise<Record<string, SigunguMedian> | null> {
  const row = await prisma.dashboardSnapshot.findUnique({ where: { key: SIGUNGU_MEDIAN_KEY } });
  return (row?.payload as unknown as Record<string, SigunguMedian>) ?? null;
}
