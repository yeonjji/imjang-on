import { prisma } from '@/lib/db';

export interface IlbanguRow {
  code: string;
  level: number;
}

/**
 * 통합시 일반구 sigunguCode(5자리) → 부모 시 sigunguCode(5자리) 매핑.
 *
 * 어린이집 API는 통합시(수원·성남·고양 등) 데이터를 시 arcode와 구 arcode에
 * 걸쳐 쪼개 반환한다. 그대로 저장하면 한 통합시가 시코드·구코드로 섞여,
 * 시 단위 드롭다운("수원시"=41110)으로 구코드(41111 등) 저장분이 도달 불가해진다.
 * 저장 시 구코드를 부모 시코드로 정규화해 한 시군구로 통일한다.
 *
 * - 일반구: level-3이면서 code가 "00000"으로 끝남(읍면동은 6자리 이후가 채워져 제외).
 * - 부모 시코드: 구코드 앞 4자리 + "0" (예: 41113→41110, 41135→41130).
 *
 * 자치구(서울 송파 11710 등)는 level-2라 매핑에 포함되지 않아 영향 없다.
 */
export function ilbanguToSiMap(regions: IlbanguRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of regions) {
    if (r.level === 3 && r.code.slice(5) === '00000') {
      map.set(r.code.slice(0, 5), `${r.code.slice(0, 4)}0`);
    }
  }
  return map;
}

/** DB에서 미폐지 일반구를 읽어 구→시 정규화 맵을 만든다. */
export async function getIlbanguToSiMap(): Promise<Map<string, string>> {
  const regions = await prisma.region.findMany({
    where: { level: 3, code: { endsWith: '00000' }, isAbolished: false },
    select: { code: true, level: true },
  });
  return ilbanguToSiMap(regions);
}
