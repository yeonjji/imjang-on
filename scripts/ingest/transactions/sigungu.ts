import { prisma } from '@/lib/db';
// 적재·서빙 공용 SSOT는 lib/region.ts. 여기서는 DB 변형만 제공하고 순수 함수는 재노출한다.
import { selectSigunguTargets, type RegionRow } from '@/lib/region';

export { selectSigunguTargets, type RegionRow };

/**
 * 실거래 적재용 시군구 타깃: LAWD_CD(5자리) → 매물·거래에 붙일 Region.code.
 *
 * 세종은 구가 없어 읍·면·동 33개가 level-2로 들어와 같은 LAWD_CD(36110)를 공유한다. selectSigunguTargets는
 * 그중 마지막 행을 고르므로(조회 순서에 따라 용호동·소정면 등) 세종 단지·거래 전부가 엉뚱한 동·면에 붙고,
 * 신규 단지 지오코딩도 "세종 용호동 전의면 …"으로 깨졌다(2026-11-26 실측 단지 244·거래 27,144건).
 * 다른 지역이 시군구 단위 코드를 쓰듯, 여러 level-2가 겹치는 LAWD_CD는 시 단위 코드(`<LAWD_CD>00000`)로 바꾼다.
 * 드롭다운(lib/region.ts getSigungusBySido)은 selectSigunguTargets를 그대로 쓰므로 여기서만 바꾼다.
 */
export function selectIngestTargets(regions: RegionRow[]): Map<string, string> {
  const map = selectSigunguTargets(regions);
  const codes = new Set(regions.map((r) => r.code));
  const level2PerPrefix = new Map<string, number>();
  for (const r of regions) {
    if (r.level === 2) level2PerPrefix.set(r.code.slice(0, 5), (level2PerPrefix.get(r.code.slice(0, 5)) ?? 0) + 1);
  }
  for (const [prefix, n] of level2PerPrefix) {
    const city = `${prefix}00000`;
    if (n > 1 && map.has(prefix) && codes.has(city)) map.set(prefix, city);
  }
  return map;
}

/** DB에서 미폐지 region(시 단위 코드 확인용 level 1 포함)을 읽어 실거래 적재 타깃 맵을 반환. */
export async function getSigunguTargets(): Promise<Map<string, string>> {
  const regions = await prisma.region.findMany({
    where: { isAbolished: false, level: { in: [1, 2, 3] } },
    select: { code: true, level: true },
  });
  return selectIngestTargets(regions);
}
