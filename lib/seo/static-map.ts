import { SITE_URL } from '@/lib/site';

export interface StaticMapParams {
  lat: number;
  lng: number;
  w?: number;
  h?: number;
  level?: number;
}

const DEFAULTS = { w: 600, h: 400, level: 16 } as const;

/** 정적 지도 프록시의 상대 경로 (`<img src>`용). */
export function staticMapPath({
  lat,
  lng,
  w = DEFAULTS.w,
  h = DEFAULTS.h,
  level = DEFAULTS.level,
}: StaticMapParams): string {
  return `/api/staticmap?lat=${lat}&lng=${lng}&w=${w}&h=${h}&level=${level}`;
}

/** 절대 URL (JSON-LD `image`, OG fetch용). */
export function staticMapUrl(params: StaticMapParams): string {
  return `${SITE_URL}${staticMapPath(params)}`;
}
