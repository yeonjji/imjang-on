import { getAllSigungus, shortSido } from '@/lib/region';

interface CatalogRow {
  sido: string;
  sigungu: string;
  sigunguCode: string;
  /** 제목 표시용 라벨. 동명 시군구는 시도 접두, 구·군 없는 시는 시 이름. */
  label: string;
}

let cache: CatalogRow[] | null = null;

async function loadCatalog() {
  if (cache) return cache;
  const rows = (await getAllSigungus()).filter(
    (r): r is { sido: string; sigungu: string; sigunguCode: string } =>
      typeof r.sido === 'string' && typeof r.sigungu === 'string' && typeof r.sigunguCode === 'string',
  );

  // 같은 sigungu 이름을 쓰는 시도를 센다. distinct 시도 수로 세므로
  // 같은 시도 안의 여러 행(세종 읍면동 등)에 흔들리지 않는다.
  const sidosByName = new Map<string, Set<string>>();
  // 한 sigunguCode를 여러 행이 공유 = 구·군이 없는 시(세종).
  const rowsPerCode = new Map<string, number>();
  for (const r of rows) {
    let set = sidosByName.get(r.sigungu);
    if (!set) sidosByName.set(r.sigungu, (set = new Set()));
    set.add(r.sido);
    rowsPerCode.set(r.sigunguCode, (rowsPerCode.get(r.sigunguCode) ?? 0) + 1);
  }

  cache = rows
    .map(r => ({
      ...r,
      label:
        rowsPerCode.get(r.sigunguCode)! > 1
          ? (shortSido(r.sido) ?? r.sido)
          : sidosByName.get(r.sigungu)!.size > 1
            ? `${shortSido(r.sido) ?? r.sido} ${r.sigungu}`
            : r.sigungu,
    }))
    // 긴 sigungu name 우선 (수원시 영통구 vs 수원시)
    .sort((a, b) => b.sigungu.length - a.sigungu.length);
  return cache;
}

/** 시도 풀네임 → 짧은 alias 리스트 (주소 prefix 매칭용) */
const SIDO_ALIASES: Record<string, string[]> = {
  서울특별시: ['서울특별시', '서울'],
  부산광역시: ['부산광역시', '부산'],
  대구광역시: ['대구광역시', '대구'],
  인천광역시: ['인천광역시', '인천'],
  // 2026-07-01 광주+전남 통합. 구 명칭 주소도 신 시도로 매칭시킨다.
  전남광주통합특별시: ['전남광주통합특별시', '광주광역시', '광주', '전라남도', '전남'],
  // 아래 두 항목은 Region에 해당 시도 행이 남아 있지 않아 현재 조회되지 않는다.
  // 카탈로그가 Region.sido로 역인덱싱하므로 남겨둬도 동작에 영향이 없다.
  광주광역시: ['광주광역시', '광주'],
  대전광역시: ['대전광역시', '대전'],
  울산광역시: ['울산광역시', '울산'],
  세종특별자치시: ['세종특별자치시', '세종특별시', '세종'],
  경기도: ['경기도', '경기'],
  강원특별자치도: ['강원특별자치도', '강원도', '강원'],
  충청북도: ['충청북도', '충북'],
  충청남도: ['충청남도', '충남'],
  전북특별자치도: ['전북특별자치도', '전라북도', '전북'],
  전라남도: ['전라남도', '전남'],
  경상북도: ['경상북도', '경북'],
  경상남도: ['경상남도', '경남'],
  제주특별자치도: ['제주특별자치도', '제주도', '제주'],
};

async function matchRow(addr: string | null | undefined): Promise<CatalogRow | null> {
  if (!addr) return null;
  const catalog = await loadCatalog();
  for (const r of catalog) {
    const aliases = SIDO_ALIASES[r.sido] ?? [r.sido];
    for (const sidoForm of aliases) {
      if (addr.startsWith(`${sidoForm} ${r.sigungu}`)) return r;
    }
  }
  return null;
}

export async function resolveSigunguFromAddress(addr: string | null | undefined): Promise<string | null> {
  return (await matchRow(addr))?.sigunguCode ?? null;
}

/** 제목 접미사용 시군구 라벨. 매칭 실패 시 null — 호출부가 접미사를 생략한다. */
export async function resolveSigunguLabelFromAddress(addr: string | null | undefined): Promise<string | null> {
  return (await matchRow(addr))?.label ?? null;
}

/** for test cleanup */
export function __resetRegionCatalogCacheForTests() { cache = null; }
