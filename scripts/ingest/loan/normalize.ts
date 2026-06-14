// 콤마 다값 문자열 → 정규화 태그 배열. "-"·빈값 제거, 접미사 "등" 제거, dedup.
export function toTags(raw: unknown): string[] {
  if (raw == null) return [];
  const out: string[] = [];
  for (const part of String(raw).split(',')) {
    const cleaned = part.trim().replace(/\s*등$/, '').trim();
    if (!cleaned || cleaned === '-') continue;
    if (!out.includes(cleaned)) out.push(cleaned);
  }
  return out;
}

// 빈값/"-"/null → null, 그 외 String 변환.
export function emptyToNull(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s === '' || s === '-' ? null : s;
}

// 연 단위 기간 필드. 소스에 비현실적 값이 섞여 옴(예: 상환기간 "10, 15, 20, 309, 14, 19, 29"의 309).
const YEAR_TERM_KEYS = ['maxtotlntrm', 'maxdfrmtrm', 'maxrdpttrm'] as const;
const MAX_PLAUSIBLE_YEARS = 50;

// 비현실적(50년 초과) 숫자 토큰 제거. 순수 숫자형(콤마·공백·범위)만 손대고,
// 단위·설명이 든 텍스트("5(최대 60개월…)")는 정답을 알 수 없으니 보존한다.
export function sanitizeYearTermValue(raw: unknown): unknown {
  if (raw == null) return raw;
  const s = String(raw).trim();
  if (!/^[\d.,~\s]+$/.test(s)) return raw;
  const kept = s
    .split(',')
    .map((t) => t.trim())
    .filter((t) => {
      if (t === '') return false;
      const nums = t.match(/\d+(\.\d+)?/g) ?? [];
      return !nums.some((n) => Number(n) > MAX_PLAUSIBLE_YEARS);
    });
  return kept.join(', '); // 전부 제거되면 '' → isDisplayable이 숨김
}

// rawJson 항목의 연단위 기간 필드들을 교정한 새 객체 반환(원본 미변경).
export function sanitizeRawItem(item: Record<string, unknown>): Record<string, unknown> {
  const out = { ...item };
  for (const key of YEAR_TERM_KEYS) {
    if (key in out) out[key] = sanitizeYearTermValue(out[key]);
  }
  return out;
}
