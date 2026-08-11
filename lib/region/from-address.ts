import { getAllSigungus, shortSido, SIDO_ALIASES } from '@/lib/region';

interface CatalogRow {
  sido: string;
  sigungu: string;
  sigunguCode: string;
  /** 제목 표시용 라벨. 동명 시군구는 시도 접두, 구·군 없는 시는 시 이름. */
  label: string;
}

/**
 * 시도 축약명 표시 오버라이드 — 행정 명칭이 아니라 제목 표시용 타협이다.
 * 2026-07-01 광주+전남 통합으로 shortSido()가 내는 축약명은 '전남광주'이지만,
 * 검색자는 '광주'로 검색·인지하므로 제목에는 '광주'를 쓴다.
 * SIDO_LIST·shortSido()는 행정 SSOT라 그대로 두고, 라벨 조립 시점에만 적용한다.
 * 목포·순천 등 구 전남 지역은 이름이 겹치는 시군구가 없어 애초에 시도 접두사가
 * 붙지 않으므로 이 오버라이드의 영향을 받지 않는다.
 */
const DISPLAY_SIDO_OVERRIDE: Record<string, string> = {
  전남광주: '광주',
};

function displaySido(sido: string): string {
  const short = shortSido(sido) ?? sido;
  return DISPLAY_SIDO_OVERRIDE[short] ?? short;
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
          ? displaySido(r.sido)
          : sidosByName.get(r.sigungu)!.size > 1
            ? `${displaySido(r.sido)} ${r.sigungu}`
            : r.sigungu,
    }))
    // 긴 sigungu name 우선 (수원시 영통구 vs 수원시)
    .sort((a, b) => b.sigungu.length - a.sigungu.length);
  return cache;
}

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
