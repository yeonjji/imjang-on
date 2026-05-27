export interface RegionRef {
  sido: string;
  sigungu: string;
  sigunguCode: string;
}

// 도로명/지번 주소 앞부분(시도 + 시군구)을 Region 목록과 대조해 sigunguCode를 찾는다.
// 같은 시 아래 여러 구(예: 성남시 분당구/수정구)는 "시도 시군구" 접두가 가장 긴 항목을 택한다.
export function matchSigunguCode(address: string, regions: RegionRef[]): string | null {
  const norm = address.replace(/\s+/g, ' ').trim();
  if (!norm) return null;

  let best: { code: string; len: number } | null = null;
  for (const r of regions) {
    const key = `${r.sido} ${r.sigungu}`;
    if (norm.startsWith(key) && (best === null || key.length > best.len)) {
      best = { code: r.sigunguCode, len: key.length };
    }
  }
  return best?.code ?? null;
}
