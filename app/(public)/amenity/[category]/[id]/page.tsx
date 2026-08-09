import { notFound, permanentRedirect } from 'next/navigation';
import Link from 'next/link';
import { getCategoryDef, AMENITY_SOURCE } from '@/lib/amenity/category';
import { getAmenityById, getAmenityLatLng, resolveStoreSlugRedirect } from '@/lib/amenity/detail';
import { getAmenityList } from '@/lib/amenity/list';
import { getSigunguByCode } from '@/lib/region';
import {
  getNearbyApartments,
  getNearbyInfra,
} from '@/lib/amenity/nearby';
import { getNearbySubwayStations } from '@/lib/subway/nearby';
import { AmenityHero } from '../_components/amenity-hero';
import { AmenityInfo } from '../_components/amenity-info';
import { AmenityDetailSidebar } from '../_components/amenity-detail-sidebar';
import { NearbyApartments } from '@/components/ui/nearby-apartments';
import { NearbyInfra } from '@/components/ui/nearby-infra';
import { NearbySubway } from '@/components/ui/nearby-subway';
import { LocationViewer } from '@/components/ui/location-viewer';
import { Card } from '@/components/ui/card';
import { SourceCaption } from '@/components/ui/source-caption';
import { MainSourceBlock } from '@/components/ui/main-source-block';
import { BoardBriefingSection } from '@/app/(public)/_components/board-briefing-section';
import { RelatedGuides } from '@/app/(public)/_components/related-guides';
import { JsonLd, placeSchema, breadcrumbSchema, type PlaceType } from '@/lib/seo/json-ld';
import { robotsFor } from '@/lib/seo/indexable';
import { qualifiedTitle } from '@/lib/seo/title';
import { amenityDescriptor } from '@/lib/seo/facility-descriptor';
import { resolveSigunguLabelFromAddress } from '@/lib/region/from-address';
import { SITE_URL } from '@/lib/site';
import { displayAmenityName } from '@/lib/amenity/store-name';
import type { Metadata } from 'next';
import type { NearbyApartment } from '@/lib/amenity/nearby';

const AMENITY_PLACE_TYPE: Record<string, PlaceType> = {
  convenience: 'ConvenienceStore',
  mart: 'GroceryStore',
  cafe: 'CafeOrCoffeeShop',
  market: 'Store',
};

export const revalidate = 86_400;
// 동적 세그먼트는 generateStaticParams가 없으면 revalidate가 무시되고 매 요청 동적 렌더된다.
// 빈 배열 → 프리빌드 없이 첫 요청 시 렌더 후 revalidate 동안 ISR 캐시(dynamicParams 기본 true).
export function generateStaticParams() { return []; }

interface Params { params: Promise<{ category: string; id: string }>; }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category, id } = await params;
  if (!/^\d+$/.test(id)) return {};
  const def = getCategoryDef(category);
  if (!def) return {};
  const item = await getAmenityById(def.slug, BigInt(id)).catch(() => null);
  if (!item) return {};
  const locality = await resolveSigunguLabelFromAddress(item.address).catch(() => null);
  const displayName = displayAmenityName(item, def);
  return {
    title: qualifiedTitle(displayName, locality, `— ${amenityDescriptor(def.slug, item, def.label)}`),
    description: `${displayName} ${def.label} 정보와 도보권 아파트 실거래가. 주변 시세를 공공데이터로 확인하세요.`,
    robots: robotsFor(false),
    alternates: { canonical: `/amenity/${def.slug}/${id}` },
  };
}

export default async function AmenityDetailPage({ params }: Params) {
  const { category, id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const def = getCategoryDef(category);
  if (!def) notFound();

  const itemId = BigInt(id);
  const item = await getAmenityById(def.slug, itemId);
  if (!item) {
    // 업종 게이트 이전에 200이던 교차 카테고리 URL은 404 대신 정본으로 영구 이동시킨다.
    const canonicalPath = await resolveStoreSlugRedirect(def.slug, itemId).catch(() => null);
    if (canonicalPath) permanentRedirect(canonicalPath);
    notFound();
  }
  const displayName = displayAmenityName(item, def);

  const region = item.sigunguCode
    ? await getSigunguByCode(item.sigunguCode).catch(() => null)
    : null;

  const coord = await getAmenityLatLng(def.slug, itemId);

  // 'convenience' | 'mart' | 'cafe'는 Store 행, 'market'은 TraditionalMarket 행.
  const exclude =
    def.slug === 'market' ? { excludeMarketId: itemId } : { excludeStoreId: itemId };
  const [apts, infra, otherList, subway] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
    coord
      ? getNearbyInfra(coord.lat, coord.lng, { ...exclude, includeChildcare: true })
      : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
    item.sigunguCode
      ? getAmenityList(def.slug, { sigunguCode: item.sigunguCode }, 1)
      : Promise.resolve({ rows: [], total: 0, page: 1, perPage: 0, totalPages: 0 }),
    coord
      ? getNearbySubwayStations(coord.lat, coord.lng)
      : Promise.resolve({ stations: [], fallback: false }),
  ]);

  const others = otherList.rows.filter((s) => s.id !== item.id).slice(0, 4);
  const regionListPath = item.sigunguCode
    ? `/amenity/${def.slug}?region=${item.sigunguCode}`
    : `/amenity/${def.slug}`;

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <JsonLd
        data={[
          placeSchema({
            type: AMENITY_PLACE_TYPE[def.slug] ?? 'Store',
            name: displayName,
            address: item.address,
            lat: coord?.lat,
            lng: coord?.lng,
            url: `${SITE_URL}/amenity/${def.slug}/${id}`,
          }),
          breadcrumbSchema([
            { name: '홈', url: `${SITE_URL}/` },
            { name: def.breadcrumbLabel, url: `${SITE_URL}/amenity/${def.slug}` },
            { name: displayName, url: `${SITE_URL}/amenity/${def.slug}/${id}` },
          ]),
        ]}
      />
      <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/amenity/convenience">상권·편의</Link><span>›</span>
        <Link href={`/amenity/${def.slug}`}>{def.breadcrumbLabel}</Link><span>›</span>
        {region && (
          <>
            <Link href={regionListPath}>{region.fullName}</Link><span>›</span>
          </>
        )}
        <span className="truncate font-semibold text-[var(--color-blue-dark)]">{displayName}</span>
      </nav>

      <AmenityHero item={item} def={def} />

      <div className="mt-7 grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="flex flex-col gap-6">
          <AmenityInfo item={item} def={def} regionFullName={region?.fullName ?? ''} />
          <SourceCaption ids={[AMENITY_SOURCE[def.slug]]} />
          {coord && (
            <Card id="map">
              <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">위치</h2>
              <LocationViewer
                lat={coord.lat}
                lng={coord.lng}
                mapKind={def.slug === 'market' ? 'market' : 'store'}
                mapId={item.id}
                name={displayName}
              />
            </Card>
          )}
          {!coord && (
            <Card>
              <p className="py-6 text-center text-sm text-[var(--color-muted)]">위치 정보가 등록되어 있지 않아 지도와 주변 정보를 표시할 수 없습니다.</p>
            </Card>
          )}
          <NearbyApartments items={apts} />
          {coord && <NearbySubway data={subway} />}
          {coord && <NearbyInfra categories={infra} />}
          <BoardBriefingSection />
          <RelatedGuides pageKey="amenity" />
          <MainSourceBlock id={AMENITY_SOURCE[def.slug]} />
        </main>
        <aside><AmenityDetailSidebar others={others} def={def} sigunguCode={item.sigunguCode} /></aside>
      </div>
    </div>
  );
}
