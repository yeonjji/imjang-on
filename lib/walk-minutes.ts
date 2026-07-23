/**
 * 도보 소요 시간(분). 성인 보행 80 m/분 기준으로 통일한다.
 * 프로즈(insights)와 배지(nearby-subway)가 같은 거리에서 다른 값을 내지 않도록 단일 소스.
 */
export function walkMinutes(distanceMeters: number): number {
  return Math.max(1, Math.round(distanceMeters / 80));
}
