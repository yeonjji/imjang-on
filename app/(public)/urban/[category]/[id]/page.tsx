import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getUrbanCategoryDef, URBAN_SOURCE } from '@/lib/urban/category';
import type { UrbanItem } from '@/lib/urban/category';
import { getUrbanById, getUrbanLatLng } from '@/lib/urban/detail';
import { getUrbanList } from '@/lib/urban/list';
import { resolveSigunguFromAddress } from '@/lib/urban/region-from-address';
import { getNearbyApartments, getNearbyInfra } from '@/lib/amenity/nearby';
import { getNearbySubwayStations } from '@/lib/subway/nearby';
import { getSigunguByCode } from '@/lib/region';
import { UrbanHero } from '../_components/urban-hero';
import { UrbanInfo } from '../_components/urban-info';
import { ParkingHoursTable } from '../_components/parking-hours-table';
import { ParkingFeeGrid } from '../_components/parking-fee-grid';
import { ParkingExtras } from '../_components/parking-extras';
import { UrbanDetailSidebar } from '../_components/urban-detail-sidebar';
import { NearbyApartments } from '@/components/ui/nearby-apartments';
import { LocationViewer } from '@/components/ui/location-viewer';
import { Card } from '@/components/ui/card';
import { NearbyInfra } from '@/components/ui/nearby-infra';
import { NearbySubway } from '@/components/ui/nearby-subway';
import { SourceCaption } from '@/components/ui/source-caption';
import { MainSourceBlock } from '@/components/ui/main-source-block';
import { BoardBriefingSection } from '@/app/(public)/_components/board-briefing-section';
import type { ParkingRaw } from '@/lib/urban/adapters/parking';
import type { NearbyApartment } from '@/lib/amenity/nearby';
import { ParkInfo } from '../_components/park-info';
import type { ParkRaw } from '@/lib/urban/adapters/park';
import { JsonLd, placeSchema, breadcrumbSchema, provenanceNodes } from '@/lib/seo/json-ld';
import { InsightSection } from '@/components/ui/insight-section';
import { staticMapUrl } from '@/lib/seo/static-map';
import { SITE_URL } from '@/lib/site';
import {
  loadParkInsight,
  cachedParkLatLng,
  cachedNearbyAptsPark,
  cachedNearbyInfraPark,
  cachedNearbySubwayPark,
} from '@/lib/insights/park-loader';

export const revalidate = 86_400;

interface Params { params: Promise<{ category: string; id: string }>; }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category, id } = await params;
  if (!/^\d+$/.test(id)) return {};
  const def = getUrbanCategoryDef(category);
  if (!def) return {};
  const item = await getUrbanById(def.slug, BigInt(id)).catch(() => null);
  if (!item) return {};
  if (def.slug === 'park') {
    const { narrative } = await loadParkInsight(BigInt(id));
    const indexable = !!narrative && narrative.fired.length >= 2;
    return {
      title: `${item.name} — 공원 정보·주변 아파트`,
      description:
        narrative?.text.slice(0, 150) ??
        `${item.name} 공원 정보와 도보권 아파트 실거래가. 주변 시세를 공공데이터로 확인하세요.`,
      robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
      alternates: { canonical: `/urban/park/${id}` },
    };
  }
  return {
    title: `${item.name} — ${def.label} 정보·주변 아파트`,
    description: `${item.name} ${def.label} 정보(운영시간·요금)와 도보권 아파트 실거래가. 주변 시세를 공공데이터로 확인하세요.`,
    alternates: { canonical: `/urban/${def.slug}/${id}` },
  };
}

export default async function UrbanDetailPage({ params }: Params) {
  const { category, id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const def = getUrbanCategoryDef(category);
  if (!def) notFound();

  const itemId = BigInt(id);
  const item = await getUrbanById(def.slug, itemId);
  if (!item) notFound();

  const r = item.raw as ParkingRaw;
  const sigunguCode = await resolveSigunguFromAddress(r.rdnmadr ?? r.lnmadr ?? r.address);

  const [region, coord] = await Promise.all([
    sigunguCode ? getSigunguByCode(sigunguCode).catch(() => null) : Promise.resolve(null),
    def.slug === 'park' ? cachedParkLatLng(itemId) : getUrbanLatLng(def.slug, itemId),
  ]);

  const emptyList = { rows: [], total: 0, page: 1, perPage: 0, totalPages: 0 };

  const exclude =
    def.slug === 'park' ? { excludeParkId: itemId } : { excludeParkingId: itemId };

  const isPark = def.slug === 'park';
  const [apts, infra, otherList, subway] = await Promise.all([
    coord
      ? (isPark ? cachedNearbyAptsPark(coord.lat, coord.lng) : getNearbyApartments(coord.lat, coord.lng))
      : Promise.resolve([] as NearbyApartment[]),
    coord
      ? (isPark
          ? cachedNearbyInfraPark(coord.lat, coord.lng, itemId)
          : getNearbyInfra(coord.lat, coord.lng, { ...exclude, includeChildcare: true }))
      : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
    sigunguCode ? getUrbanList(def.slug, { sigunguCode }, 1) : Promise.resolve(emptyList),
    coord
      ? (isPark ? cachedNearbySubwayPark(coord.lat, coord.lng) : getNearbySubwayStations(coord.lat, coord.lng))
      : Promise.resolve({ stations: [], fallback: false }),
  ]);

  const { narrative, dateModified } = isPark
    ? await loadParkInsight(itemId)
    : { narrative: null, dateModified: undefined as string | undefined };

  const others = otherList.rows.filter((s) => s.id !== item.id).slice(0, 4);

  const PARK_ANCHORS = [
    { href: '#info', label: '공원 정보' },
    { href: '#map',  label: '위치' },
    { href: '#apt',  label: '주변 아파트' },
    { href: '#poi',  label: '주변 생활 인프라' },
  ];

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      {isPark && (
        <JsonLd
          data={[
            placeSchema({
              type: 'Park',
              name: item.name,
              address: item.address,
              lat: coord?.lat,
              lng: coord?.lng,
              url: `${SITE_URL}/urban/park/${id}`,
              image: coord ? staticMapUrl(coord) : undefined,
              id: `${SITE_URL}/urban/park/${id}#park`,
              mainEntityOfPageId: `${SITE_URL}/urban/park/${id}#webpage`,
            }),
            breadcrumbSchema([
              { name: '홈', url: `${SITE_URL}/` },
              { name: '생활편의', url: `${SITE_URL}/life` },
              { name: '도시인프라', url: `${SITE_URL}/life/urban` },
              { name: '공원', url: `${SITE_URL}/urban/park` },
              { name: item.name, url: `${SITE_URL}/urban/park/${id}` },
            ]),
            ...provenanceNodes({
              url: `${SITE_URL}/urban/park/${id}`,
              name: item.name,
              sourceId: 'mois-park',
              entityId: `${SITE_URL}/urban/park/${id}#park`,
              dateModified,
            }),
          ]}
        />
      )}
      <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href="/life/urban">도시인프라</Link><span>›</span>
        <Link href={`/urban/${def.slug}`}>{def.breadcrumbLabel}</Link><span>›</span>
        {region && (<><Link href={`/urban/${def.slug}?region=${sigunguCode}`}>{region.fullName}</Link><span>›</span></>)}
        <span className="truncate font-semibold text-[var(--color-blue-dark)]">{item.name}</span>
      </nav>

      <UrbanHero item={item} def={def} />
      {narrative && <InsightSection sentences={narrative.sentences} />}

      <div className="mt-7 grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="flex flex-col gap-6">
          {def.slug === 'park' ? (
            <ParkInfo item={item as UrbanItem<ParkRaw>} />
          ) : (
            <>
              <UrbanInfo item={item} def={def} regionFullName={region?.fullName ?? ''} />
              <ParkingHoursTable row={r} />
              <ParkingFeeGrid row={r} />
              <ParkingExtras row={r} />
            </>
          )}
          <SourceCaption ids={[URBAN_SOURCE[def.slug]]} />
          {coord ? (
            <Card id="map">
              <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">위치</h2>
              <LocationViewer lat={coord.lat} lng={coord.lng} name={item.name} />
            </Card>
          ) : (
            <Card>
              <p className="py-6 text-center text-sm text-[var(--color-muted)]">위치 정보가 등록되어 있지 않아 지도와 주변 정보를 표시할 수 없습니다.</p>
            </Card>
          )}
          {coord && <NearbyApartments items={apts} />}
          {coord && <NearbySubway data={subway} />}
          {coord && <NearbyInfra categories={infra} />}
          <BoardBriefingSection />
          <MainSourceBlock id={URBAN_SOURCE[def.slug]} />
        </main>
        <aside><UrbanDetailSidebar others={others} def={def} sigunguCode={sigunguCode} anchors={def.slug === 'park' ? PARK_ANCHORS : undefined} /></aside>
      </div>
    </div>
  );
}
