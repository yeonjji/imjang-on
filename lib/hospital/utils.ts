export function formatHospitalTime(n: number | null | undefined): string {
  if (n == null) return '휴진';
  const h = Math.floor(n / 100).toString().padStart(2, '0');
  const m = (n % 100).toString().padStart(2, '0');
  return `${h}:${m}`;
}

/** HHMM 정수가 실재하는 시각인지(0000~2400, 분 < 60). 원자료에 범위 밖 값이 섞여 있다. */
function isValidHhmm(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 2400 && n % 100 < 60;
}

/**
 * 진료 시작·종료를 "HH:MM ~ HH:MM"으로. 두 값이 모두 유효하고 종료가 시작보다 늦을 때만 문자열을 반환한다.
 * 그 외에는 null이며 호출부는 표시를 생략한다 — 원자료(HIRA)에 종료<시작(예: 08:30~06:00) 같은 모순 값이
 * 있어 그대로 렌더하면 잘못된 진료시간을 안내하게 된다. 한쪽만 있는 값도 구간을 단정할 수 없어 null.
 */
export function formatHospitalHours(
  open: number | null | undefined,
  close: number | null | undefined,
): string | null {
  if (open == null || close == null) return null;
  if (!isValidHhmm(open) || !isValidHhmm(close)) return null;
  if (close <= open) return null;
  return `${formatHospitalTime(open)} ~ ${formatHospitalTime(close)}`;
}
