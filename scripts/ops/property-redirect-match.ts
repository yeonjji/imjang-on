// 폐지지역 구 property → 신 property 크로스워크 매칭(301용).
// 이름(nameNorm)+타입 동일 후보 중 좌표 근접으로 대상을 고른다. 순수 함수(DB 없음, 테스트 용이).

export interface Coord {
  lat: number | null;
  lng: number | null;
}
export interface Candidate extends Coord {
  id: bigint;
}

/** 같은 건물로 볼 좌표 임계(m). MOLIT가 같은 주소로 재서빙 → 신·구 좌표 ≈ 동일. */
export const MATCH_THRESHOLD_M = 500;

export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * (이름+타입 동일) 신 property 후보에서 리다이렉트 대상 선택.
 * - 후보 1개: 그 id(좌표 무관).
 * - 여러 개: 구 좌표에 가장 가까운 후보(임계 이내). 구 좌표 없으면 모호 → null.
 * - 0개 / 임계 초과: null(미매칭, redirectToId 미설정 → 구 페이지 그대로).
 */
export function pickRedirectTarget(oldProp: Coord, candidates: Candidate[]): bigint | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].id;
  if (oldProp.lat == null || oldProp.lng == null) return null;

  let best: Candidate | null = null;
  let bestD = Infinity;
  for (const c of candidates) {
    if (c.lat == null || c.lng == null) continue;
    const d = haversineMeters(oldProp.lat, oldProp.lng, c.lat, c.lng);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best && bestD <= MATCH_THRESHOLD_M ? best.id : null;
}
