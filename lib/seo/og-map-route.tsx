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

export function createOgMapRoute<P>(load: (params: P) => Promise<OgMapData | null>) {
  async function generateImageMetadata({ params }: { params: Promise<P> }) {
    const data = await load(await params);
    // 지도를 만들 수 없으면 og:image 태그 자체를 내보내지 않는다.
    if (!data) return [];
    return [{ id: 'map', size: OG_SIZE, contentType: OG_CONTENT_TYPE, alt: data.alt }];
  }

  async function Image({ params }: { params: Promise<P> }) {
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
