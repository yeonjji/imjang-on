import { getAllSigungus } from '@/lib/region';

let cache: Array<{ sido: string; sigungu: string; sigunguCode: string }> | null = null;

async function loadCatalog() {
  if (cache) return cache;
  const rows = await getAllSigungus();
  cache = rows
    .filter((r): r is { sido: string; sigungu: string; sigunguCode: string } =>
      typeof r.sido === 'string' && typeof r.sigungu === 'string' && typeof r.sigunguCode === 'string')
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

export async function resolveSigunguFromAddress(addr: string | null | undefined): Promise<string | null> {
  if (!addr) return null;
  const catalog = await loadCatalog();
  for (const r of catalog) {
    const aliases = SIDO_ALIASES[r.sido] ?? [r.sido];
    for (const sidoForm of aliases) {
      if (addr.startsWith(`${sidoForm} ${r.sigungu}`)) {
        return r.sigunguCode;
      }
    }
  }
  return null;
}

/** for test cleanup */
export function __resetRegionCatalogCacheForTests() { cache = null; }
