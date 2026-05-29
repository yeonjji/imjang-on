import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getChildcareById, getChildcareLatLng, getChildcareList } from '@/lib/childcare';
import { getSigunguByCode } from '@/lib/region';
import { getNearbyApartments, getNearbyChildcare, getSchoolNearbyAmenities } from '@/lib/amenity/nearby';
import { ChildcareHero } from './_components/childcare-hero';
import { ChildcareInfo } from './_components/childcare-info';
import { ChildcareFacility } from './_components/childcare-facility';
import { ChildcareAgeBreakdown } from './_components/childcare-age-breakdown';
import { ChildcareWaitList } from './_components/childcare-wait-list';
import { ChildcareStaff } from './_components/childcare-staff';
import { ChildcareDetailSidebar } from './_components/childcare-detail-sidebar';
import { NearbyChildcare } from './_components/nearby-childcare';
import { NearbyAmenities } from '../../../school/[sigunguCode]/[id]/_components/nearby-amenities';
import { NearbyApartments } from '@/components/ui/nearby-apartments';
import { NaverMap } from '@/components/ui/naver-map';
import { Card } from '@/components/ui/card';
import type { Metadata } from 'next';
import type { NearbyApartment } from '@/lib/amenity/nearby';

export const revalidate = 86_400;

interface Params { params: Promise<{ sigunguCode: string; id: string }>; }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { sigunguCode, id } = await params;
  const item = await getChildcareById(BigInt(id)).catch(() => null);
  if (!item) return {};
  return {
    title: `${item.name} — ${item.crType ?? '어린이집'} 정원 ${item.capacity ?? '-'}`,
    description: `${item.name}(${item.address}) 보육정보·정원·교직원·주변 아파트 실거래가.`,
    alternates: { canonical: `/childcare/${sigunguCode}/${id}` },
  };
}

export default async function ChildcareDetailPage({ params }: Params) {
  const { sigunguCode, id } = await params;
  const itemId = BigInt(id);
  const [item, region] = await Promise.all([
    getChildcareById(itemId),
    getSigunguByCode(sigunguCode),
  ]);
  if (!item || item.sigunguCode !== sigunguCode) notFound();
  // Region 테이블에 sigunguCode가 없는 경우(cpmsapi030 arcode와 Region 매핑 불일치)
  // Childcare row의 sido/sigungu로 fallback해서 페이지를 그대로 노출한다.
  const regionDisplay = region ?? {
    fullName: [item.sido, item.sigungu].filter(Boolean).join(' ') || sigunguCode,
    sigungu: item.sigungu ?? '',
    sigunguCode,
  };

  const basePath = `/childcare/${sigunguCode}`;
  const coord = await getChildcareLatLng(itemId);

  const [apts, schoolAmenities, nearbyChildren, otherList] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
    coord
      ? getSchoolNearbyAmenities(coord.lat, coord.lng)
      : Promise.resolve({ parks: [], mart: [], chargers: [] } as Awaited<ReturnType<typeof getSchoolNearbyAmenities>>),
    coord ? getNearbyChildcare(coord.lat, coord.lng, 1000, 5, itemId) : Promise.resolve([]),
    getChildcareList({ sigunguCode }, 1),
  ]);
  const others = otherList.rows
    .filter((o) => o.id !== item.id)
    .slice(0, 4)
    .map((o) => ({ id: o.id, name: o.name }));

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href="/childcare">어린이집찾기</Link><span>›</span>
        <Link href={basePath}>{regionDisplay.fullName}</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)] truncate max-w-[40vw]">{item.name}</span>
      </nav>

      <ChildcareHero item={item} />

      <div className="mt-7 grid grid-cols-1 gap-7 lg:grid-cols-[1fr_320px]">
        <main className="flex flex-col gap-6">
          <ChildcareInfo item={item} regionFullName={regionDisplay.fullName} />
          <ChildcareFacility item={item} />
          <ChildcareAgeBreakdown item={item} />
          <ChildcareWaitList item={item} />
          <ChildcareStaff item={item} />
          {coord && (
            <Card id="map">
              <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">위치</h2>
              <NaverMap lat={coord.lat} lng={coord.lng} name={item.name} />
            </Card>
          )}
          <NearbyApartments items={apts} />
          {coord && <NearbyChildcare items={nearbyChildren} />}
          {coord && (
            <NearbyAmenities
              parks={schoolAmenities.parks}
              mart={schoolAmenities.mart}
              chargers={schoolAmenities.chargers}
            />
          )}
        </main>
        <aside><ChildcareDetailSidebar basePath={basePath} others={others} /></aside>
      </div>
    </div>
  );
}
