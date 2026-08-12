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
      -- dealAmount=0은 결측이 아니라 degenerate 값이라 IS NOT NULL만으로는 안 걸러진다.
      -- lib/briefing.ts:176-181이 최저가 조회에 dealAmount: { gt: 0 }을 쓰는 이유와 같다 —
      -- 0원 거래가 섞이면 percentile_cont가 아래로 끌려 시군구 중위가가 왜곡된다.
      AND "dealAmount" > 0 AND "cancelDate" IS NULL
    GROUP BY "sigunguCode"
    HAVING COUNT(*) >= ${MIN_SAMPLE}
  `;
  const out: Record<string, SigunguMedian> = {};
  for (const r of rows) out[r.sgg] = { median: r.med, count: Number(r.n) };
  return out;
}

/**
 * 계산 결과를 스냅샷에 쓰고 반영된 시군구 개수를 돌려준다.
 * 빈 결과는 상류 일시 장애(집계 쿼리 실패 직전 상태 등)일 수 있어, 그걸 그대로 upsert하면
 * 정상 스냅샷(249곳)을 빈 값으로 덮어써 5,900여 공개 페이지가 한꺼번에 비교 줄을 잃는다.
 * 그래서 빈 결과는 쓰지 않고 기존 스냅샷을 그대로 둔 채 개수만 돌려준다 — 호출부가 실패로 취급한다.
 */
export async function writeSigunguMedianSnapshot(): Promise<number> {
  const medians = await computeSigunguMedians();
  const count = Object.keys(medians).length;
  if (count === 0) return 0;
  const payload = medians as unknown as Prisma.InputJsonValue;
  await prisma.dashboardSnapshot.upsert({
    where: { key: SIGUNGU_MEDIAN_KEY },
    create: { key: SIGUNGU_MEDIAN_KEY, payload },
    update: { payload },
  });
  return count;
}

/** 상세 페이지에서 호출. 없으면 null → 비교 줄을 렌더하지 않는다. */
export async function readSigunguMedianSnapshot(): Promise<Record<string, SigunguMedian> | null> {
  const row = await prisma.dashboardSnapshot.findUnique({ where: { key: SIGUNGU_MEDIAN_KEY } });
  return (row?.payload as unknown as Record<string, SigunguMedian>) ?? null;
}
