import { prisma } from '@/lib/db';
import { lastContractDate, round } from './shared';

export interface FloorPremiumResult {
  /** n≥10인 (단지, 평형) 조합 수 */
  groups: number;
  /** 그중 R²≥0.2로 채택한 수 */
  groupsUsed: number;
  medianPctPerFloor: number;
  p25: number;
  p75: number;
  asOf: string | null;
}

/**
 * 같은 단지·같은 평형 안에서 한 층 오를 때 ㎡당 단가가 몇 % 오르는지.
 *
 * 전국 저/중/고층 평균 비교(2,006 → 2,655 만원/평)는 쓰지 않는다. 고층이 있는 건물이 대체로
 * 더 새 건물·대단지·도심이라, 그 차이를 층 효과로 읽으면 인과를 잘못 단정하게 된다.
 * 대신 조합별 OLS 기울기를 구하고 **층이 가격을 설명하는 조합만**(R²≥0.2) 채택해 중앙값을 낸다.
 * `lib/transaction.ts`의 `getFloorPremium`(단지 1곳)과 같은 방법을 전국으로 넓힌 것이다.
 *
 * 창은 24개월 — 12개월이면 조합당 n≥10을 채우는 단지가 크게 준다. 실측 38.7초.
 */
export async function computeFloorPremium(): Promise<FloorPremiumResult> {
  const rows = await prisma.$queryRaw<
    Array<{ groups: bigint; groups_used: bigint; med: number | null; p25: number | null; p75: number | null }>
  >`
    WITH sale AS (
      SELECT "propertyId",
             ROUND("exclusiveArea"::numeric / 3.3057851239669422)::int AS pyeong,
             "floor"::float AS f,
             "dealAmount"::float / NULLIF("exclusiveArea"::float, 0) AS ppa
      FROM "Transaction"
      WHERE "propertyType" = 'APARTMENT' AND "dealType" = 'SALE'
        AND "contractDate" >= (CURRENT_DATE - INTERVAL '24 months')
        AND "dealAmount" IS NOT NULL AND "floor" IS NOT NULL AND "floor" > 0
        AND "exclusiveArea" > 0 AND "cancelDate" IS NULL
    ), fit AS (
      SELECT regr_slope(ppa, f) AS slope, regr_r2(ppa, f) AS r2, AVG(ppa) AS mean_ppa
      FROM sale
      GROUP BY "propertyId", pyeong
      HAVING COUNT(*) >= 10 AND regr_slope(ppa, f) IS NOT NULL AND AVG(ppa) > 0
    )
    SELECT COUNT(*) AS groups,
           COUNT(*) FILTER (WHERE r2 >= 0.2) AS groups_used,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY slope / mean_ppa * 100)
             FILTER (WHERE r2 >= 0.2) AS med,
           percentile_cont(0.25) WITHIN GROUP (ORDER BY slope / mean_ppa * 100)
             FILTER (WHERE r2 >= 0.2) AS p25,
           percentile_cont(0.75) WITHIN GROUP (ORDER BY slope / mean_ppa * 100)
             FILTER (WHERE r2 >= 0.2) AS p75
    FROM fit
  `;
  const r = rows[0];
  const asOf = await lastContractDate();
  if (!r || r.med == null) {
    return { groups: Number(r?.groups ?? 0), groupsUsed: 0, medianPctPerFloor: 0, p25: 0, p75: 0, asOf };
  }
  return {
    groups: Number(r.groups),
    groupsUsed: Number(r.groups_used),
    medianPctPerFloor: round(r.med, 2),
    p25: round(r.p25, 2),
    p75: round(r.p75, 2),
    asOf,
  };
}
