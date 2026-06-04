const SQM_PER_PYEONG = 3.3057851239669422;

export function sqmToPyeong(sqm: number): number {
  return sqm / SQM_PER_PYEONG;
}

export function formatArea(sqm: number, unit: 'sqm' | 'pyeong' = 'sqm'): string {
  if (unit === 'pyeong') {
    return `${sqmToPyeong(sqm).toFixed(1)}평`;
  }
  return `${sqm.toFixed(2)}㎡`;
}

export function formatBillion(manwon: number | bigint | null | undefined): string {
  if (manwon === null || manwon === undefined) return '-';
  const n = typeof manwon === 'bigint' ? Number(manwon) : manwon;
  if (n < 10_000) return `${n.toLocaleString('ko-KR')}만원`;
  const billion = n / 10_000;
  const floored = Math.floor(billion * 100) / 100;
  return `${floored}억`;
}

export function formatDate(date: Date | null | undefined): string {
  if (!date) return '-';
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatPyeong(sqm: number): string {
  return `${Math.round(sqmToPyeong(sqm))}평`;
}

/** 큰 카운트를 "16만+" / "25.6만+" / "5,000+" 형태로 표기 */
export function formatStatCount(n: number): string {
  if (n >= 10_000) {
    const man = Math.round((n / 10_000) * 10) / 10;
    return `${man}만+`;
  }
  return `${n.toLocaleString('ko-KR')}+`;
}
