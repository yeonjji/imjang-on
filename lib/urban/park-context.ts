// 공원 상세의 계산값: 같은 시군구·같은 유형 공원 중 면적 순위.
// Park에는 sigunguCode 컬럼이 없어 '시도 시군구' 주소 접두어(resolveAddrPrefix)로 묶는다.
import { prisma } from '@/lib/db';

export interface ParkAreaRank {
  rank: number;
  total: number;
}

type ParkLike = { address: string; parkType: string | null; area: number | null };

// 이 공원이 그룹 안에 있어야 "N곳 중 M위"가 성립한다. 세종(동이 시군구 코드를 공유)·시도 표기 혼재
// (강원도/강원특별자치도 등)로 접두어가 이 공원을 빠뜨리면 "14곳 중 15위" 같은 불가능한 순위가 나온다.
function areaRankEligible(p: ParkLike, addrPrefix: string | null): addrPrefix is string {
  if (!addrPrefix || addrPrefix === '__NO_MATCH__' || !p.parkType || !p.area) return false;
  return p.address.startsWith(`${addrPrefix} `);
}

const MIN_RANK_GROUP = 3;

export async function getParkAreaRank(
  p: { address: string; parkType: string | null; area: number | null },
  addrPrefix: string | null,
): Promise<ParkAreaRank | null> {
  if (!areaRankEligible(p, addrPrefix)) return null;
  const rows = await prisma.$queryRaw<{ total: number; bigger: number }[]>`
    SELECT count(*)::int AS total, count(*) FILTER (WHERE area > ${p.area})::int AS bigger
    FROM "Park"
    WHERE address LIKE ${`${addrPrefix} %`} AND "parkType" = ${p.parkType} AND area IS NOT NULL
  `;
  const r = rows[0];
  if (!r || r.total < MIN_RANK_GROUP) return null;
  return { rank: r.bigger + 1, total: r.total };
}

/**
 * 목록 점수 배치용: 접두어 안 유형별 '면적 있는 공원 수'를 한 번에 센다. 공원마다 getParkAreaRank를 부르면
 * 1.7만 번 테이블을 훑는다(운영 첫 weekly에서 CPU 점유). 표시 여부는 getParkAreaRank와 같다(통합 테스트가 대조).
 */
export async function parkAreaRankTotals(addrPrefix: string): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<{ parkType: string; total: number }[]>`
    SELECT "parkType", count(*)::int AS total
    FROM "Park"
    WHERE address LIKE ${`${addrPrefix} %`} AND "parkType" IS NOT NULL AND area IS NOT NULL
    GROUP BY "parkType"
  `;
  return new Map(rows.map((r) => [r.parkType, r.total]));
}

/** 상세에 '면적 순위'가 보이는가 — getParkAreaRank(...) !== null 과 같다. totals = parkAreaRankTotals(addrPrefix) */
export function parkAreaRankShown(p: ParkLike, addrPrefix: string | null, totals: Map<string, number>): boolean {
  if (!areaRankEligible(p, addrPrefix)) return false;
  return (totals.get(p.parkType!) ?? 0) >= MIN_RANK_GROUP;
}
