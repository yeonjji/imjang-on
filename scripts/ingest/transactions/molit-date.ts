// 국토부(MOLIT) 실거래 API 날짜·해제 필드 공용 파서.
/**
 * 국토부 날짜 문자열 → Date(UTC). 등기일(rgstDate)·해제일(cdealDay)은 'YY.MM.DD'(예: 26.09.09)로 온다.
 * 예전 파서는 8자리 YYYYMMDD만 가정해 'YY.MM.DD'를 19YY년으로 읽었다(운영 해제일 32,821건이 전부 1923~1926년).
 * YYYYMMDD도 계속 받는다. 실재하지 않는 날짜(13월 등)는 null.
 */
export function parseMolitDate(raw: string): Date | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(s);
  if (match) {
    y = 2000 + Number(match[1]); m = Number(match[2]); d = Number(match[3]);
  } else if ((match = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) {
    y = Number(match[1]); m = Number(match[2]); d = Number(match[3]);
  } else {
    return null;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

/** 해제 여부(cdealType). 공백·빈 값은 null, 값이 있으면 trim한 값('O'). */
export function parseCancelType(raw: unknown): string | null {
  const s = raw == null ? '' : String(raw).trim();
  return s ? s : null;
}

/** 해제일(cdealDay) — 'YY.MM.DD'. 공백·잘못된 날짜는 null. */
export function parseCancelDate(raw: unknown): Date | null {
  return raw == null ? null : parseMolitDate(String(raw));
}
