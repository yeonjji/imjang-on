import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getChildcareById, getChildcareLatLng, getChildcareList } from '@/lib/childcare';
import { getSigunguByCode } from '@/lib/region';
import { getNearbyApartments, getNearbyChildcare, getNearbyInfra } from '@/lib/amenity/nearby';
import { getNearbySubwayStations } from '@/lib/subway/nearby';
import { ChildcareHero } from './_components/childcare-hero';
import { ChildcareInfo } from './_components/childcare-info';
import { ChildcareFacility } from './_components/childcare-facility';
import { ChildcareAgeBreakdown } from './_components/childcare-age-breakdown';
import { ChildcareWaitList } from './_components/childcare-wait-list';
import { ChildcareStaff } from './_components/childcare-staff';
import { ChildcareDetailSidebar } from './_components/childcare-detail-sidebar';
import { NearbyChildcare } from './_components/nearby-childcare';
import { NearbyInfra } from '@/components/ui/nearby-infra';
import { NearbySubway } from '@/components/ui/nearby-subway';
import { NearbyApartments } from '@/components/ui/nearby-apartments';
import { LocationViewer } from '@/components/ui/location-viewer';
import { Card } from '@/components/ui/card';
import { SourceCaption } from '@/components/ui/source-caption';
import { MainSourceBlock } from '@/components/ui/main-source-block';
import { BoardBriefingSection } from '@/app/(public)/_components/board-briefing-section';
import { JsonLd, placeSchema, breadcrumbSchema } from '@/lib/seo/json-ld';
import { staticMapUrl } from '@/lib/seo/static-map';
import { SITE_URL } from '@/lib/site';
import type { Metadata } from 'next';
import type { NearbyApartment } from '@/lib/amenity/nearby';

export const revalidate = 86_400;

interface Params { params: Promise<{ sigunguCode: string; id: string }>; }

/** 숫자가 아닌 id(크롤러의 변형 URL 등)는 BigInt 변환에서 throw → 500. null로 흡수한다. */
function parseId(id: string): bigint | null {
  try { return BigInt(id); } catch { return null; }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { sigunguCode, id } = await params;
  const itemId = parseId(id);
  const item = itemId == null ? null : await getChildcareById(itemId).catch(() => null);
  if (!item) return {};
  const parts: string[] = [];
  if (item.capacity != null) parts.push(`정원 ${item.capacity.toLocaleString('ko-KR')}명`);
  if (item.currentCount != null) parts.push(`현원 ${item.currentCount.toLocaleString('ko-KR')}명`);
  if (item.staffCount != null) parts.push(`교직원 ${item.staffCount.toLocaleString('ko-KR')}명`);
  const stat = parts.length ? ` ${parts.join('·')}` : '';
  const type = item.crType ? `(${item.crType})` : '';
  return {
    title: `${item.name} — ${item.crType ?? '어린이집'} 정원 ${item.capacity ?? '-'}`,
    description: `${item.name}${type}${stat}. 도보권 아파트 실거래가와 보육정보를 한눈에.`,
    alternates: { canonical: `/childcare/${sigunguCode}/${id}` },
  };
}

export default async function ChildcareDetailPage({ params }: Params) {
  const { sigunguCode, id } = await params;
  const itemId = parseId(id);
  if (itemId == null) notFound();
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

  const [apts, infra, nearbyChildren, otherList, subway] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
    coord ? getNearbyInfra(coord.lat, coord.lng) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
    coord ? getNearbyChildcare(coord.lat, coord.lng, 1000, 5, itemId) : Promise.resolve([]),
    getChildcareList({ sigunguCode }, 1),
    coord
      ? getNearbySubwayStations(coord.lat, coord.lng)
      : Promise.resolve({ stations: [], fallback: false }),
  ]);
  const others = otherList.rows
    .filter((o) => o.id !== item.id)
    .slice(0, 4)
    .map((o) => ({ id: o.id, name: o.name }));

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <JsonLd
        data={[
          placeSchema({
            type: 'ChildCare',
            name: item.name,
            address: item.address,
            lat: coord?.lat,
            lng: coord?.lng,
            url: `${SITE_URL}/childcare/${sigunguCode}/${id}`,
            image: coord ? staticMapUrl(coord) : undefined,
            telephone: item.tel,
          }),
          breadcrumbSchema([
            { name: '홈', url: `${SITE_URL}/` },
            { name: '생활편의', url: `${SITE_URL}/life` },
            { name: '어린이집찾기', url: `${SITE_URL}/childcare` },
            { name: item.name, url: `${SITE_URL}/childcare/${sigunguCode}/${id}` },
          ]),
        ]}
      />
      <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href="/childcare">어린이집찾기</Link><span>›</span>
        <Link href={basePath}>{regionDisplay.fullName}</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)] truncate max-w-[40vw]">{item.name}</span>
      </nav>

      <ChildcareHero item={item} />

      <div className="mt-7 grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="flex flex-col gap-6">
          <ChildcareInfo item={item} regionFullName={regionDisplay.fullName} />
          <ChildcareFacility item={item} />
          <ChildcareAgeBreakdown item={item} />
          <ChildcareWaitList item={item} />
          <ChildcareStaff item={item} />
          <SourceCaption ids={['childcare']} />
          {coord && (
            <Card id="map">
              <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">위치</h2>
              <LocationViewer lat={coord.lat} lng={coord.lng} name={item.name} />
            </Card>
          )}
          <NearbyApartments items={apts} />
          {coord && <NearbyChildcare items={nearbyChildren} />}
          {coord && <NearbySubway data={subway} />}
          {coord && <NearbyInfra categories={infra} />}
          <MainSourceBlock id="childcare" />
          <BoardBriefingSection />
        </main>
        <aside><ChildcareDetailSidebar basePath={basePath} others={others} /></aside>
      </div>
    </div>
  );
}
