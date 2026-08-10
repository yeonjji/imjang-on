import { prisma } from '@/lib/db';
import { lastContractDate, round } from './shared';

/** 도보권 반경. `lib/subway/nearby.ts`의 RADIUS_METERS와 같은 값이어야 한다. */
export const WALK_RADIUS_METERS = 800;

export interface SubwayPremiumResult {
  /** 도보권·비도보권 양쪽 다 n≥30인 시군구 수 */
  sigungus: number;
  medianPremiumPct: number;
  p25: number;
  p75: number;
  /** 프리미엄이 0 이하인 시군구 수 — "역세권이면 늘 비싸다"가 아님을 보여준다 */
  noPremiumSigungus: number;
  walkRadiusMeters: number;
  asOf: string | null;
}

/**
 * 역 도보권 아파트가 **같은 시군구의** 비도보권 아파트보다 평당 몇 % 비싼지.
 *
 * 전국을 한 번에 비교하면 +97%가 나오지만(도보권 3,289 vs 비도보권 1,669 만원/평) 그건
 * 지하철이 수도권에만 있어서 생기는 구성 효과다 — 사실상 "수도권 vs 지방"을 재는 셈이다.
 * 시군구 안에서만 비교하고 그 분포의 중앙값을 낸다. 실측 32.6초.
 */
export async function computeSubwayPremium(): Promise<SubwayPremiumResult> {
  const rows = await prisma.$queryRaw<
    Array<{ sigungus: bigint; med: number | null; p25: number | null; p75: number | null; no_prem: bigint }>
  >`
    WITH prop AS (
      SELECT p.id, p."sigunguCode",
             EXISTS (
               SELECT 1 FROM "SubwayStation" s
               WHERE s.location IS NOT NULL
                 AND ST_DWithin(p.location, s.location, ${WALK_RADIUS_METERS})
             ) AS walkable
      FROM "Property" p
      WHERE p."propertyType" = 'APARTMENT' AND p."redirectToId" IS NULL AND p.location IS NOT NULL
    ), tx AS (
      SELECT pr.walkable, pr."sigunguCode" AS sgg,
             t."dealAmount"::numeric / t."exclusiveArea" * 3.3057851239669422 AS ppp
      FROM "Transaction" t
      JOIN prop pr ON pr.id = t."propertyId"
      WHERE t."dealType" = 'SALE' AND t."propertyType" = 'APARTMENT'
        AND t."contractDate" >= (CURRENT_DATE - INTERVAL '12 months')
        AND t."dealAmount" IS NOT NULL AND t."cancelDate" IS NULL AND t."exclusiveArea" > 0
    ), bysgg AS (
      SELECT AVG(ppp) FILTER (WHERE walkable) AS w,
             COUNT(*) FILTER (WHERE walkable) AS nw,
             AVG(ppp) FILTER (WHERE NOT walkable) AS nwk,
             COUNT(*) FILTER (WHERE NOT walkable) AS nn
      FROM tx GROUP BY sgg
    ), ok AS (
      SELECT (w / nwk - 1) * 100 AS pct FROM bysgg WHERE nw >= 30 AND nn >= 30 AND nwk > 0
    )
    SELECT COUNT(*) AS sigungus,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY pct) AS med,
           percentile_cont(0.25) WITHIN GROUP (ORDER BY pct) AS p25,
           percentile_cont(0.75) WITHIN GROUP (ORDER BY pct) AS p75,
           COUNT(*) FILTER (WHERE pct <= 0) AS no_prem
    FROM ok
  `;
  const r = rows[0];
  const asOf = await lastContractDate();
  if (!r || r.med == null) {
    return {
      sigungus: 0, medianPremiumPct: 0, p25: 0, p75: 0,
      noPremiumSigungus: 0, walkRadiusMeters: WALK_RADIUS_METERS, asOf,
    };
  }
  return {
    sigungus: Number(r.sigungus),
    medianPremiumPct: round(r.med, 1),
    p25: round(r.p25, 1),
    p75: round(r.p75, 1),
    noPremiumSigungus: Number(r.no_prem),
    walkRadiusMeters: WALK_RADIUS_METERS,
    asOf,
  };
}
