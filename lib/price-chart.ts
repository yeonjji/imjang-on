export interface MonthPoint {
  month: string; // 'YYYY-MM'
  avg: number; // 만원
  min: number;
  max: number;
  count: number;
}

export interface ChartRow {
  month: string;
  avg: number;
  band: [number, number]; // [min, max]
  count: number;
}

export interface HeaderStats {
  current: number;
  changePct: number | null;
  changeMonths: number;
  high: number;
  low: number;
  count: number;
}

/** 'YYYY-MM' 두 개의 개월 차이 (b - a). */
export function monthDiff(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

function sortedByMonth(points: MonthPoint[]): MonthPoint[] {
  return [...points].sort((a, b) => a.month.localeCompare(b.month));
}

export function deriveHeaderStats(points: MonthPoint[]): HeaderStats | null {
  if (points.length === 0) return null;
  const sorted = sortedByMonth(points);
  const last = sorted[sorted.length - 1];
  const high = Math.max(...sorted.map((p) => p.max));
  const low = Math.min(...sorted.map((p) => p.min));
  const count = sorted.reduce((s, p) => s + p.count, 0);

  // 마지막 달로부터 ~12개월 전(target) 이하인 가장 최근 달을 기준점으로.
  const target = addMonths(last.month, -12);
  let baseIdx = -1;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].month <= target) baseIdx = i;
  }
  if (baseIdx < 0) baseIdx = 0; // 12개월 미만 → 가장 이른 달
  const baseline = sorted[baseIdx];
  const changeMonths = monthDiff(baseline.month, last.month);
  const changePct =
    baseline === last || baseline.avg === 0
      ? null
      : ((last.avg - baseline.avg) / baseline.avg) * 100;

  return { current: last.avg, changePct, changeMonths, high, low, count };
}

export function toChartRows(points: MonthPoint[]): ChartRow[] {
  return sortedByMonth(points).map((p) => ({
    month: p.month,
    avg: p.avg,
    band: [p.min, p.max],
    count: p.count,
  }));
}

export function pickDefaultPyeong(
  areas: { pyeong: number; totalCount: number }[],
): number | null {
  if (areas.length === 0) return null;
  return areas.reduce((best, a) => (a.totalCount > best.totalCount ? a : best)).pyeong;
}
