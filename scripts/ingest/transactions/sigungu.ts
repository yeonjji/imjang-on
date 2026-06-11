import { prisma } from '@/lib/db';
// 적재·서빙 공용 SSOT는 lib/region.ts. 여기서는 DB 변형만 제공하고 순수 함수는 재노출한다.
import { selectSigunguTargets, type RegionRow } from '@/lib/region';

export { selectSigunguTargets, type RegionRow };

/** DB에서 미폐지 level 2·3 region을 읽어 시군구 타깃 맵을 반환. */
export async function getSigunguTargets(): Promise<Map<string, string>> {
  const regions = await prisma.region.findMany({
    where: { isAbolished: false, level: { in: [2, 3] } },
    select: { code: true, level: true },
  });
  return selectSigunguTargets(regions);
}
