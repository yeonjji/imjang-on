export function formatHospitalTime(n: number | null | undefined): string {
  if (n == null) return '휴진';
  const h = Math.floor(n / 100);
  const m = n % 100;
  // 원본(HIRA)에 시·분 범위를 벗어난 값이 섞여 있어 그대로 렌더하면 "25:00"이 노출된다.
  // 종료시각 2400(자정)은 정상 표기라 유지한다.
  if (n < 0 || m > 59 || h > 24 || (h === 24 && m > 0)) return '-';
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
