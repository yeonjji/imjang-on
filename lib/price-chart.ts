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

/**
 * 월별 시계열의 범위 통계. 실제로 있었던 거래의 최고·최저·건수만 담는다.
 *
 * 여기에 '현재 시세'(마지막 달 평균)와 그 평균끼리 비교한 변동률을 두지 않는 것은 의도적이다 —
 * getMonthlyChartData는 월·거래유형으로만 묶어(평형 미구분) 24평과 45평 거래가 한 평균에 섞인다.
 * 평형이 맞는 시세·변동률은 getAreaSummary(표본 2건 가드, 평형 혼합 금지)를 쓸 것.
 */
export interface RangeStats {
  high: number;
  low: number;
  count: number;
}

function sortedByMonth(points: MonthPoint[]): MonthPoint[] {
  return [...points].sort((a, b) => a.month.localeCompare(b.month));
}

export function deriveRangeStats(points: MonthPoint[]): RangeStats | null {
  if (points.length === 0) return null;
  return {
    high: Math.max(...points.map((p) => p.max)),
    low: Math.min(...points.map((p) => p.min)),
    count: points.reduce((s, p) => s + p.count, 0),
  };
}

/** 기준값(prior) 대비 변화율(%). prior가 0 이하면 null(0 나눗셈·무의미 기준 방지). */
export function pctChange(current: number, prior: number): number | null {
  if (prior <= 0) return null;
  return ((current - prior) / prior) * 100;
}

export function toChartRows(points: MonthPoint[]): ChartRow[] {
  return sortedByMonth(points).map((p) => ({
    month: p.month,
    avg: p.avg,
    band: [p.min, p.max],
    count: p.count,
  }));
}
