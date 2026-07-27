import { cache } from 'react';
import { OG_SIZE, OG_CONTENT_TYPE } from '@/lib/seo/og';
import { createOgMapRoute, type OgMapData } from '@/lib/seo/og-map-route';
import { getMapEntityLatLng } from '@/lib/seo/map-entity';
import { getSubscriptionById } from '@/lib/subscription';

export const runtime = 'nodejs';
export const revalidate = 86_400;
// generateStaticParams 없이는 revalidate가 무시되고 매 요청 satori 렌더된다. 빈 배열 → id당 첫 요청에 렌더 후 ISR 캐시.
export function generateStaticParams() {
  return [];
}
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const load = cache(async ({ id }: { id: string }): Promise<OgMapData | null> => {
  if (!/^\d+$/.test(id)) return null;
  const noticeId = BigInt(id);
  const notice = await getSubscriptionById(noticeId).catch(() => null);
  if (!notice) return null;
  // 시설·청약은 원본 공공데이터에 좌표가 실려 오므로 지역 폴백을 두지 않는다.
  const coord = await getMapEntityLatLng('subscription', noticeId);
  if (!coord) return null;
  return {
    title: notice.name,
    subtitle: `${notice.regionName ?? '공공데이터 부동산'} · 임장ON`,
    alt: `${notice.name} 위치 지도`,
    lat: coord.lat,
    lng: coord.lng,
    level: 16,
    marker: true,
  };
});

const route = createOgMapRoute(load);
export const generateImageMetadata = route.generateImageMetadata;
export default route.Image;
