/**
 * 한국(본토+주요 도서) 좌표 bbox. 좌표 위생 검사의 단일 출처.
 * 보수적으로 잡아 정상 좌표 오탐을 피한다 (제주 남단·서해5도·독도 포함).
 */
export const KOREA_BBOX = {
  minLat: 33.0,
  maxLat: 38.7,
  minLng: 124.0,
  maxLng: 132.0,
} as const;

/** 경도(lng)·위도(lat)가 한국 bbox 내부인지. 인자 순서는 (경도, 위도). */
export function isInKoreaBbox(lng: number, lat: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= KOREA_BBOX.minLat &&
    lat <= KOREA_BBOX.maxLat &&
    lng >= KOREA_BBOX.minLng &&
    lng <= KOREA_BBOX.maxLng
  );
}
