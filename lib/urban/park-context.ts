// 공원 상세의 계산값: 같은 시군구·같은 유형 공원 중 면적 순위.
// Park에는 sigunguCode 컬럼이 없어 '시도 시군구' 주소 접두어(resolveAddrPrefix)로 묶는다.
import { prisma } from '@/lib/db';

export interface ParkAreaRank {
  rank: number;
  total: number;
}

export async function getParkAreaRank(
  p: { address: string; parkType: string | null; area: number | null },
  addrPrefix: string | null,
): Promise<ParkAreaRank | null> {
  if (!addrPrefix || addrPrefix === '__NO_MATCH__' || !p.parkType || !p.area) return null;
  // 이 공원이 그룹 안에 있어야 "N곳 중 M위"가 성립한다. 세종(동이 시군구 코드를 공유)·시도 표기 혼재
  // (강원도/강원특별자치도 등)로 접두어가 이 공원을 빠뜨리면 "14곳 중 15위" 같은 불가능한 순위가 나온다.
  if (!p.address.startsWith(`${addrPrefix} `)) return null;
  const rows = await prisma.$queryRaw<{ total: number; bigger: number }[]>`
    SELECT count(*)::int AS total, count(*) FILTER (WHERE area > ${p.area})::int AS bigger
    FROM "Park"
    WHERE address LIKE ${`${addrPrefix} %`} AND "parkType" = ${p.parkType} AND area IS NOT NULL
  `;
  const r = rows[0];
  if (!r || r.total < 3) return null;
  return { rank: r.bigger + 1, total: r.total };
}
