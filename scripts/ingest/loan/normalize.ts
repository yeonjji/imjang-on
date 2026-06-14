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
