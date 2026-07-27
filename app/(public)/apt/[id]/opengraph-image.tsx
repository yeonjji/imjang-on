import { cache } from 'react';
import { OG_SIZE, OG_CONTENT_TYPE } from '@/lib/seo/og';
import { createOgMapRoute } from '@/lib/seo/og-map-route';
import { resolveOgMapTarget } from '@/lib/seo/og-coord';
import { getPropertyById } from '@/lib/property';
import { PropertyType } from '@prisma/client';

export const runtime = 'nodejs';
export const revalidate = 86_400;
// generateStaticParams 없이는 revalidate가 무시되고 매 요청 satori 렌더된다. 빈 배열 → id당 첫 요청에 렌더 후 ISR 캐시.
export function generateStaticParams() {
  return [];
}
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const ALLOWED: PropertyType[] = [PropertyType.APARTMENT];

// cache()는 같은 요청 안에서 load가 중복 호출되는 것만 막는다. generateImageMetadata와
// Image는 별개의 웹팩 모듈로 컴파일되어 서로 다른 HTTP 요청(페이지 렌더 vs 크롤러의 이미지
// fetch)에서 실행되므로 그 둘 사이의 중복은 dedupe되지 않는다.
const load = cache(async ({ id }: { id: string }) => {
  if (!/^\d+$/.test(id)) return null;
  const propId = BigInt(id);
  const property = await getPropertyById(propId).catch(() => null);
  // ID 공간 공유 → 유형 필터 필수. 없으면 타 유형의 OG를 방출한다.
  if (!property || !ALLOWED.includes(property.propertyType)) return null;
  const target = await resolveOgMapTarget(propId);
  if (!target) return null;
  return {
    title: property.name,
    subtitle: `${property.region.fullName} · 임장ON`,
    alt:
      target.kind === 'precise'
        ? `${property.name} 위치 지도`
        : `${property.region.fullName} 일대 지도`,
    lat: target.lat,
    lng: target.lng,
    level: target.level,
    marker: target.marker,
  };
});

const route = createOgMapRoute(load);
export const generateImageMetadata = route.generateImageMetadata;
export default route.Image;
