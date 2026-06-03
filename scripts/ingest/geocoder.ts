import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export interface Coord {
  lat: number;
  lng: number;
  /** 카카오가 응답한 시/도명 (검증·로깅용) */
  region1: string | null;
  /** 카카오가 응답한 시/군/구명 (검증·로깅용) */
  region2: string | null;
}

const cache = new Map<string, Coord | null>();

/**
 * 지오코딩 쿼리를 만든다. 시/도·시군구 접두사를 주소 앞에 붙여
 * "금호동 787"처럼 여러 지역에 존재하는 동명의 모호성을 제거한다.
 */
export function buildGeocodeQuery(prefix: string | null | undefined, address: string): string {
  return `${prefix ?? ''} ${address ?? ''}`.replace(/\s+/g, ' ').trim();
}

export async function geocode(query: string): Promise<Coord | null> {
  if (!env.KAKAO_REST_KEY) {
    logger.warn('KAKAO_REST_KEY not set — skipping geocode');
    return null;
  }
  if (cache.has(query)) return cache.get(query) ?? null;

  const url = new URL('https://dapi.kakao.com/v2/local/search/address.json');
  url.searchParams.set('query', query);
  url.searchParams.set('size', '1');

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `KakaoAK ${env.KAKAO_REST_KEY}` },
    });
    if (!res.ok) {
      logger.warn({ status: res.status, query }, 'geocode http failure');
      cache.set(query, null);
      return null;
    }
    const data = (await res.json()) as {
      documents?: {
        x: string;
        y: string;
        address?: { region_1depth_name?: string; region_2depth_name?: string };
        road_address?: { region_1depth_name?: string; region_2depth_name?: string };
      }[];
    };
    const doc = data.documents?.[0];
    if (!doc) {
      cache.set(query, null);
      return null;
    }
    const region = doc.address ?? doc.road_address;
    const coord: Coord = {
      lat: Number(doc.y),
      lng: Number(doc.x),
      region1: region?.region_1depth_name ?? null,
      region2: region?.region_2depth_name ?? null,
    };
    cache.set(query, coord);
    return coord;
  } catch (err) {
    logger.warn({ err, query }, 'geocode failed');
    cache.set(query, null);
    return null;
  }
}
