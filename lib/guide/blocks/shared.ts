/** groupBy 결과에서 뽑은 `_max.updatedAt`(또는 null) 배열 중 가장 최근 시각. 하나도 없으면 null. */
export function latestUpdatedAt(dates: (Date | null)[]): Date | null {
  return dates.reduce<Date | null>((max, d) => (d && (!max || d > max) ? d : max), null);
}
