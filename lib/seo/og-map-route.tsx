// 지도 OG 라우트 8개가 공유하는 정책 한 벌: 메타데이터 방출, 지도 합성,
// 에러 처리, 캔버스 크기. 엔트리 파일에는 페이지별 load만 남는다.
import { ImageResponse } from 'next/og';
import { OG_SIZE, OG_CONTENT_TYPE, loadOgFonts, OgMapFrame } from '@/lib/seo/og';
import { fetchStaticMapPng } from '@/lib/seo/static-map-fetch';

/** 지도 OG 한 장에 필요한 전부. load가 null을 주면 og:image를 내보내지 않는다. */
export interface OgMapData {
  title: string;
  subtitle: string;
  alt: string;
  lat: number;
  lng: number;
  level: 16 | 13 | 11;
  marker: boolean;
}

// NCP raster는 w/h 최대 1024라 1200x630을 직접 요청할 수 없다.
// 같은 1.905 비율인 1024x538을 받아 satori에서 캔버스 크기로 늘린다.
const OG_MAP_SIZE = { w: 1024, h: 538 } as const;

// 지도 OG 한 장은 DB 조회 + NCP 호출 + satori 렌더라 비싸다. 크롤러가 몰리면 CPU가 포화되고,
// 그러면 NCP 호출이 타임아웃 → 502(no-store)라 캐시되지 않고 → 다음 크롤에 다시 렌더되는
// 순환이 생긴다(2026-09-30 운영 실측). 동시 렌더를 제한하고 넘치는 요청은 일을 하기 전에
// 503으로 돌려보내, 페이지 렌더에 CPU를 남긴다. 단일 박스·단일 프로세스라 모듈 카운터로 충분하다.
export const OG_MAP_MAX_INFLIGHT = 2;
let inflight = 0;

export function createOgMapRoute<P>(load: (params: P) => Promise<OgMapData | null>) {
  async function generateImageMetadata({ params }: { params: Promise<P> }) {
    const data = await load(await params);
    // 지도를 만들 수 없으면 og:image 태그 자체를 내보내지 않는다.
    if (!data) return [];
    return [{ id: 'map', size: OG_SIZE, contentType: OG_CONTENT_TYPE, alt: data.alt }];
  }

  async function Image({ params }: { params: Promise<P> }) {
    if (inflight >= OG_MAP_MAX_INFLIGHT) {
      return new Response(null, {
        status: 503,
        headers: { 'Cache-Control': 'no-store', 'Retry-After': '120' },
      });
    }
    inflight++;
    try {
      return await render(params);
    } finally {
      inflight--;
    }
  }

  async function render(params: Promise<P>) {
    const data = await load(await params);
    if (!data) {
      return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }

    let png: ArrayBuffer;
    try {
      png = await fetchStaticMapPng({
        lat: data.lat,
        lng: data.lng,
        level: data.level,
        marker: data.marker,
        ...OG_MAP_SIZE,
      });
    } catch {
      // 파란 브랜드 카드로 폴백하지 않는다 — 그게 없애려는 대상이다.
      // no-store라 다음 크롤에 재시도된다.
      return new Response(null, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }

    return new ImageResponse(
      <OgMapFrame
        mapDataUri={`data:image/png;base64,${Buffer.from(png).toString('base64')}`}
        title={data.title}
        subtitle={data.subtitle}
      />,
      { ...OG_SIZE, fonts: await loadOgFonts() },
    );
  }

  return { generateImageMetadata, Image };
}
