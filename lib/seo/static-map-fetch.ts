// NCP Static Map(raster) 호출은 여기 한 곳뿐이다. 이미지 라우트와 OG 합성이 공유한다.
// 키를 클라이언트에 노출하지 않고, fetch 데이터 캐시로 상류 호출을 30일 묶는다.
import { env } from '@/lib/env';

const NCP_ENDPOINT = 'https://maps.apigw.ntruss.com/map-static/v2/raster';

export const STATIC_MAP_UPSTREAM_REVALIDATE = 2_592_000; // 30일

/** NCP 키가 설정되지 않은 상태. 호출부는 이걸 503으로 옮긴다. */
export class StaticMapUnavailableError extends Error {}

export interface StaticMapRequest {
  lat: number;
  lng: number;
  w: number;
  h: number;
  level: number;
  /** 정확한 좌표에만 마커를 찍는다. 지역 폴백 지도는 false. */
  marker: boolean;
}

export async function fetchStaticMapPng(req: StaticMapRequest): Promise<ArrayBuffer> {
  const keyId = env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const secret = env.NAVER_MAP_CLIENT_SECRET;
  if (!keyId || !secret) throw new StaticMapUnavailableError('map not configured');

  const upstream = new URL(NCP_ENDPOINT);
  upstream.searchParams.set('w', String(req.w));
  upstream.searchParams.set('h', String(req.h));
  // NCP Static Map은 lng,lat 순서를 기대한다.
  upstream.searchParams.set('center', `${req.lng},${req.lat}`);
  upstream.searchParams.set('level', String(req.level));
  upstream.searchParams.set('format', 'png');
  // scale=1: cold-miss PNG 바이트를 scale=2 대비 ~¼로 줄인다. 썸네일 용도라 손실 미미.
  upstream.searchParams.set('scale', '1');
  if (req.marker) {
    upstream.searchParams.set('markers', `type:d|size:mid|pos:${req.lng} ${req.lat}`);
  }

  const res = await fetch(upstream, {
    headers: {
      'x-ncp-apigw-api-key-id': keyId,
      'x-ncp-apigw-api-key': secret,
    },
    next: { revalidate: STATIC_MAP_UPSTREAM_REVALIDATE },
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`ncp static map ${res.status}`);
  return res.arrayBuffer();
}
