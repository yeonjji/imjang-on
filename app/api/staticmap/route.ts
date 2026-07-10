// NCP Static Map(raster)을 헤더 인증으로 프록시한다. 키를 클라이언트에 노출하지 않고
// 좌표별 이미지를 장기 캐시해 검색 썸네일/JSON-LD/OG에 재사용한다.
import { env } from '@/lib/env';

const NCP_ENDPOINT = 'https://maps.apigw.ntruss.com/map-static/v2/raster';
const UPSTREAM_REVALIDATE = 2_592_000; // 30일 (fetch 캐시 + CDN 헤더로 캐싱)

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return new Response('invalid coordinates', { status: 400 });
  }
  const w = clampInt(searchParams.get('w'), 600, 1, 1024);
  const h = clampInt(searchParams.get('h'), 400, 1, 1024);
  const level = clampInt(searchParams.get('level'), 16, 1, 20);

  const keyId = env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const secret = env.NAVER_MAP_CLIENT_SECRET;
  if (!keyId || !secret) {
    return new Response('map not configured', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  const upstream = new URL(NCP_ENDPOINT);
  upstream.searchParams.set('w', String(w));
  upstream.searchParams.set('h', String(h));
  // NCP Static Map은 lng,lat 순서를 기대한다.
  upstream.searchParams.set('center', `${lng},${lat}`);
  upstream.searchParams.set('level', String(level));
  upstream.searchParams.set('format', 'png');
  // scale=1: cold-miss PNG 바이트를 scale=2 대비 ~¼로 줄인다. 썸네일 용도라 레티나 손실 미미.
  upstream.searchParams.set('scale', '1');
  upstream.searchParams.set('markers', `type:d|size:mid|pos:${lng} ${lat}`);

  const res = await fetch(upstream, {
    headers: {
      'x-ncp-apigw-api-key-id': keyId,
      'x-ncp-apigw-api-key': secret,
    },
    next: { revalidate: UPSTREAM_REVALIDATE },
  });
  if (!res.ok) {
    return new Response(`upstream error ${res.status}`, {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  const buf = await res.arrayBuffer();
  return new Response(buf, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control':
        'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400',
    },
  });
}
