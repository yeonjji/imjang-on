import { prisma } from '@/lib/db';

export interface RegionRow {
  code: string;
  level: number;
}

/**
 * region 레코드 목록에서 MOLIT RTMS가 인식하는 시군구 LAWD_CD(5자리) → Region.code(10자리)
 * 매핑을 만든다. (순수 함수 — DB 접근 없음, 테스트 용이)
 *
 * region 시드는 fullName 단어 수로 level을 매겨, 일반구를 가진 통합시(성남·수원·고양 등)는
 * 시 자체가 level-2("경기도 성남시"=2단어), 일반구는 level-3("경기도 성남시 분당구"=3단어)로
 * 들어간다. 그런데 MOLIT는 일반구 코드(41135 등)만 받고 시 코드(41130)는 0을 반환하므로,
 * 단순히 level-2만 돌면 이 통합시들이 통째로 누락된다.
 *
 * 올바른 시군구 집합 = (일반구 부모시를 제외한 level-2) + (일반구 = level-3, 코드 끝 "00000").
 * - 일반구: level-3이면서 code가 "00000"으로 끝남(읍면동은 6자리 이후가 채워져 제외됨).
 * - 제외 대상 통합시: 각 일반구의 부모시 코드(앞 4자리 + "000000").
 * 세종은 동이 level-2(2단어)라 prefix 36110으로 자연 collapse되어 1건으로 처리된다.
 */
export function selectSigunguTargets(regions: RegionRow[]): Map<string, string> {
  const ilbangu = regions.filter((r) => r.level === 3 && r.code.slice(5) === '00000');
  const excludeCity = new Set(ilbangu.map((g) => `${g.code.slice(0, 4)}000000`));

  const map = new Map<string, string>();
  for (const r of regions) {
    if (r.level === 2 && !excludeCity.has(r.code)) map.set(r.code.slice(0, 5), r.code);
  }
  for (const g of ilbangu) map.set(g.code.slice(0, 5), g.code);
  return map;
}

/** DB에서 미폐지 level 2·3 region을 읽어 시군구 타깃 맵을 반환. */
export async function getSigunguTargets(): Promise<Map<string, string>> {
  const regions = await prisma.region.findMany({
    where: { isAbolished: false, level: { in: [2, 3] } },
    select: { code: true, level: true },
  });
  return selectSigunguTargets(regions);
}
