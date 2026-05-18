import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

interface Coord {
  lat: number;
  lng: number;
}

const cache = new Map<string, Coord | null>();

export async function geocode(address: string): Promise<Coord | null> {
  if (!env.KAKAO_REST_KEY) {
    logger.warn('KAKAO_REST_KEY not set — skipping geocode');
    return null;
  }
  if (cache.has(address)) return cache.get(address) ?? null;

  const url = new URL('https://dapi.kakao.com/v2/local/search/address.json');
  url.searchParams.set('query', address);
  url.searchParams.set('size', '1');

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `KakaoAK ${env.KAKAO_REST_KEY}` },
    });
    if (!res.ok) {
      logger.warn({ status: res.status, address }, 'geocode http failure');
      cache.set(address, null);
      return null;
    }
    const data = (await res.json()) as { documents?: { x: string; y: string }[] };
    const doc = data.documents?.[0];
    if (!doc) {
      cache.set(address, null);
      return null;
    }
    const coord = { lat: Number(doc.y), lng: Number(doc.x) };
    cache.set(address, coord);
    return coord;
  } catch (err) {
    logger.warn({ err, address }, 'geocode failed');
    cache.set(address, null);
    return null;
  }
}
