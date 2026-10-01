// 어댑터 공용 파싱 헬퍼. 공공데이터 표준데이터 계열(공원·주차장·전통시장)이 같은 규칙을 쓴다.

export function strOrNull(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

export function boolFromYn(v: unknown): boolean | null {
  const s = strOrNull(v);
  if (s === 'Y') return true;
  if (s === 'N') return false;
  return null;
}

export function parseRefDate(v: unknown): Date | null {
  const s = strOrNull(v);
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function intInRange(v: unknown, min: number, max: number): number | null {
  const s = strOrNull(v);
  if (!s || !/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
}

/** VARCHAR 길이 초과 1건이 청크 INSERT 전체를 실패시키므로 저장 전에 자른다. */
export function clip(s: string | null, max: number): string | null {
  if (s === null) return null;
  return s.length > max ? s.slice(0, max) : s;
}
