import { prisma } from '@/lib/db';
import { lastContractDate } from './shared';

/**
 * 표에 곱할 **예시** LTV 비율. 현행 규제가 아니다.
 * 규제 비율은 우리 DB에 없고, 대상 가이드도 "정부 정책에 따라 달라질 수 있다"며 수치를 밝히지
 * 않는다. 특정 시점의 규제를 단정하는 대신 세 구간을 예시로 보여 규모 감각만 전한다.
 */
export const EXAMPLE_LTV_PCT = [40, 50, 70] as const;

export interface LtvRegionRow {
  sido: string;
  n: number;
  /** 중위 매매가(만원) */
  medianManwon: number;
}
export interface LtvByRegionResult {
  rows: LtvRegionRow[];
  exampleLtvPct: number[];
  asOf: string | null;
}

/**
 * 시도별 최근 12개월 아파트 **중위** 매매가.
 * 평균은 초고가 거래에 끌려 필요 자기자금을 과대 표시하므로 쓰지 않는다.
 * 표본이 적은 시도는 뺀다(n≥100).
 */
export async function computeLtvByRegion(): Promise<LtvByRegionResult> {
  const rows = await prisma.$queryRaw<Array<{ sido: string; n: bigint; med: number }>>`
    SELECT r.sido AS sido,
           COUNT(*) AS n,
           ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY t."dealAmount"))::int AS med
    FROM "Transaction" t
    JOIN "Property" p ON p.id = t."propertyId"
    JOIN "Region" r ON r.code = p."regionCode"
    WHERE t."propertyType" = 'APARTMENT' AND t."dealType" = 'SALE'
      AND t."contractDate" >= (CURRENT_DATE - INTERVAL '12 months')
      AND t."dealAmount" IS NOT NULL AND t."cancelDate" IS NULL
      AND p."redirectToId" IS NULL
    GROUP BY r.sido
    HAVING COUNT(*) >= 100
    ORDER BY 3 DESC
  `;
  return {
    rows: rows.map((r) => ({ sido: r.sido, n: Number(r.n), medianManwon: r.med })),
    exampleLtvPct: [...EXAMPLE_LTV_PCT],
    asOf: await lastContractDate(),
  };
}
