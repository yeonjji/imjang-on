// 공공데이터 날짜 문자열을 UTC Date 로 정규화. 모호/빈 값은 null.
export function parseFlexibleDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || s === '-') return null;

  // 유효한 패턴만 허용: YYYY-MM-DD, YYYYMMDD, YYYY.MM.DD
  // 부분 포맷 (YYYYMM.DD 등)은 거부
  const isValidPattern =
    /^\d{4}-\d{2}-\d{2}$/.test(s) ||  // YYYY-MM-DD
    /^\d{8}$/.test(s) ||               // YYYYMMDD
    /^\d{4}\.\d{2}\.\d{2}$/.test(s);   // YYYY.MM.DD

  if (!isValidPattern) return null;

  // 구분자 제거 후 정확히 8자리 숫자(YYYYMMDD)만 허용
  const digits = s.replace(/[.\-\/]/g, '');
  if (!/^\d{8}$/.test(digits)) return null;
  const y = Number(digits.slice(0, 4));
  const m = Number(digits.slice(4, 6));
  const d = Number(digits.slice(6, 8));
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

// "2023.10.16 10:00 ~ 2023.10.17 17:00" → { begin, end }
export function parseScheduleRange(raw: string | null | undefined): {
  begin: Date | null;
  end: Date | null;
} {
  if (!raw) return { begin: null, end: null };
  const parts = String(raw).split('~');
  const first = parts[0]?.trim().split(/\s+/)[0] ?? null;
  const last = (parts[1] ?? parts[0])?.trim().split(/\s+/)[0] ?? null;
  return { begin: parseFlexibleDate(first), end: parseFlexibleDate(last) };
}
