import { SITE_URL } from '@/lib/site';
import type { MapEntityKind } from '@/lib/seo/map-entity';

/** 지도 이미지 라우트의 상대 경로 (`<img src>`용). */
export function mapImagePath(kind: MapEntityKind, id: string | bigint): string {
  return `/map/${kind}/${id}`;
}

/** 절대 URL (JSON-LD `image`용). */
export function mapImageUrl(kind: MapEntityKind, id: string | bigint): string {
  return `${SITE_URL}${mapImagePath(kind, id)}`;
}
