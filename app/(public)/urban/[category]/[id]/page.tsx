import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getUrbanCategoryDef } from '@/lib/urban/category';
import type { UrbanItem } from '@/lib/urban/category';
import { getUrbanById, getUrbanLatLng } from '@/lib/urban/detail';
import { getUrbanList } from '@/lib/urban/list';
import { getSameCategoryNearbyParking } from '@/lib/urban/nearby';
import { resolveSigunguFromAddress } from '@/lib/urban/region-from-address';
import { getNearbyApartments, getMixedNearbyForDetail } from '@/lib/amenity/nearby';
import { getSigunguByCode } from '@/lib/region';
import { UrbanHero } from '../_components/urban-hero';
import { UrbanInfo } from '../_components/urban-info';
import { ParkingHoursTable } from '../_components/parking-hours-table';
import { ParkingFeeGrid } from '../_components/parking-fee-grid';
import { ParkingExtras } from '../_components/parking-extras';
import { UrbanSameCategoryNearby } from '../_components/urban-same-category-nearby';
import { UrbanDetailSidebar } from '../_components/urban-detail-sidebar';
import { NearbyApartments } from '@/components/ui/nearby-apartments';
import { NearbyAmenitiesMixed } from '@/app/(public)/amenity/[category]/_components/nearby-amenities-mixed';
import { NaverMap } from '@/components/ui/naver-map';
import { Card } from '@/components/ui/card';
import type { ParkingRaw } from '@/lib/urban/adapters/parking';
import type { NearbyApartment } from '@/lib/amenity/nearby';
import { ParkInfo } from '../_components/park-info';
import type { ParkRaw } from '@/lib/urban/adapters/park';
import { getSameCategoryNearbyPark } from '@/lib/urban/nearby';

export const revalidate = 86_400;

interface Params { params: Promise<{ category: string; id: string }>; }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category, id } = await params;
  const def = getUrbanCategoryDef(category);
  if (!def) return {};
  const item = await getUrbanById(def.slug, BigInt(id)).catch(() => null);
  if (!item) return {};
  return {
    title: `${item.name} — ${def.label} 정보·주변 아파트`,
    description: `${item.name}(${item.address}) ${def.label} 정보(운영시간·요금)와 주변 아파트 실거래가.`,
    alternates: { canonical: `/urban/${def.slug}/${id}` },
  };
}

export default async function UrbanDetailPage({ params }: Params) {
  const { category, id } = await params;
  const def = getUrbanCategoryDef(category);
  if (!def) notFound();

  const itemId = BigInt(id);
  const item = await getUrbanById(def.slug, itemId);
  if (!item) notFound();

  const r = item.raw as ParkingRaw;
  const sigunguCode = await resolveSigunguFromAddress(r.rdnmadr ?? r.lnmadr ?? r.address);

  const [region, coord] = await Promise.all([
    sigunguCode ? getSigunguByCode(sigunguCode).catch(() => null) : Promise.resolve(null),
    getUrbanLatLng(def.slug, itemId),
  ]);

  const emptyMixed = { convenience: [], mart: [], cafe: [], market: [] };
  const emptyList = { rows: [], total: 0, page: 1, perPage: 0, totalPages: 0 };

  const [apts, mixed, sameCat, otherList] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
    coord ? getMixedNearbyForDetail('parking', coord.lat, coord.lng).catch(() => emptyMixed) : Promise.resolve(emptyMixed),
    coord
      ? def.slug === 'park'
        ? getSameCategoryNearbyPark(coord.lat, coord.lng, itemId)
        : getSameCategoryNearbyParking(coord.lat, coord.lng, itemId)
      : Promise.resolve([]),
    sigunguCode ? getUrbanList(def.slug, { sigunguCode }, 1) : Promise.resolve(emptyList),
  ]);

  const others = otherList.rows.filter((s) => s.id !== item.id).slice(0, 4);

  const PARK_ANCHORS = [
    { href: '#info', label: '공원 정보' },
    { href: '#map',  label: '위치' },
    { href: '#apt',  label: '주변 아파트' },
    { href: '#poi',  label: '주변 상권' },
    { href: '#same', label: '가까운 공원' },
  ];

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href="/life/urban">도시인프라</Link><span>›</span>
        <Link href={`/urban/${def.slug}`}>{def.breadcrumbLabel}</Link><span>›</span>
        {region && (<><Link href={`/urban/${def.slug}?region=${sigunguCode}`}>{region.fullName}</Link><span>›</span></>)}
        <span className="truncate font-semibold text-[var(--color-blue-dark)]">{item.name}</span>
      </nav>

      <UrbanHero item={item} def={def} />

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
          {coord ? (
            <Card id="map">
              <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">위치</h2>
              <NaverMap lat={coord.lat} lng={coord.lng} name={item.name} />
            </Card>
          ) : (
            <Card>
              <p className="py-6 text-center text-sm text-[var(--color-muted)]">위치 정보가 등록되어 있지 않아 지도와 주변 정보를 표시할 수 없습니다.</p>
            </Card>
          )}
          {coord && <NearbyApartments items={apts} />}
          {coord && <NearbyAmenitiesMixed {...mixed} />}
          {coord && <UrbanSameCategoryNearby items={sameCat} def={def} />}
        </main>
        <aside><UrbanDetailSidebar others={others} def={def} sigunguCode={sigunguCode} anchors={def.slug === 'park' ? PARK_ANCHORS : undefined} /></aside>
      </div>
    </div>
  );
}
