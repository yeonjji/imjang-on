import { geocode } from '@/scripts/ingest/geocoder';
import { logger } from '@/lib/logger';

interface Coordable {
  address: string;
  lat: number | null;
  lng: number | null;
}

// API 응답에 좌표가 없는 amenity 행에 대해 주소로 geocode 호출해 좌표를 채운다.
// geocode 실패 시 lat/lng는 null 유지 (DB에 NULL::geography로 저장됨).
export async function enrichWithGeocode<T extends Coordable>(rows: T[]): Promise<T[]> {
  let filled = 0;
  let missing = 0;
  for (const r of rows) {
    if (r.lat != null && r.lng != null) continue;
    if (!r.address) {
      missing++;
      continue;
    }
    const coord = await geocode(r.address);
    if (coord) {
      r.lat = coord.lat;
      r.lng = coord.lng;
      filled++;
    } else {
      missing++;
    }
  }
  if (filled || missing) {
    logger.info({ filled, missing, total: rows.length }, 'amenity geocode enrichment');
  }
  return rows;
}
