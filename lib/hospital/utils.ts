export function formatHospitalTime(n: number | null | undefined): string {
  if (n == null) return '휴진';
  const h = Math.floor(n / 100).toString().padStart(2, '0');
  const m = (n % 100).toString().padStart(2, '0');
  return `${h}:${m}`;
}
