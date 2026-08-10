import { prisma } from '@/lib/db';
import { lastContractDate } from './shared';

export interface PriceTrendPoint {
  month: string; // YYYY-MM
  n: number;
  medianPerPyeong: number;
}
export interface PriceTrendResult {
  points: PriceTrendPoint[];
  asOf: string | null;
}

/**
 * 최근 24개월 월별 아파트 매매 거래량과 중위 평당가.
 *
 * **진행 중인 당월은 뺀다.** 실거래 신고 기한이 계약일로부터 30일이라 당월은 언제 집계해도
 * 과소 표시된다(실측: 2026-08 3,194건 vs 2026-07 37,975건 vs 2026-06 45,781건).
 * 직전 달도 아직 차는 중이므로 컴포넌트가 그 사실을 함께 표기한다.
 *
 * 평균이 아니라 중위값을 쓴다 — 초고가 거래가 월 단위 추이를 흔들지 않도록. 실측 5.5초.
 */
export async function computePriceTrend(): Promise<PriceTrendResult> {
  const rows = await prisma.$queryRaw<Array<{ m: string; n: bigint; med: number }>>`
    SELECT to_char(date_trunc('month', "contractDate"), 'YYYY-MM') AS m,
           COUNT(*) AS n,
           ROUND(percentile_cont(0.5) WITHIN GROUP (
             ORDER BY "dealAmount"::numeric / "exclusiveArea" * 3.3057851239669422))::int AS med
    FROM "Transaction"
    WHERE "propertyType" = 'APARTMENT' AND "dealType" = 'SALE'
      AND "contractDate" >= (date_trunc('month', CURRENT_DATE) - INTERVAL '24 months')
      AND "contractDate" < date_trunc('month', CURRENT_DATE)
      AND "dealAmount" IS NOT NULL AND "cancelDate" IS NULL AND "exclusiveArea" > 0
    GROUP BY 1
    ORDER BY 1
  `;
  return {
    points: rows.map((r) => ({ month: r.m, n: Number(r.n), medianPerPyeong: r.med })),
    asOf: await lastContractDate(),
  };
}
