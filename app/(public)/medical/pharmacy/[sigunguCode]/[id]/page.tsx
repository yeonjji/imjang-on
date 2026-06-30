import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPharmacyById, getPharmacyLatLng, getPharmacyList } from '@/lib/pharmacy';
import { getNearbyApartments, getNearbyInfra } from '@/lib/amenity/nearby';
import { getNearbySubwayStations } from '@/lib/subway/nearby';
import type { NearbyApartment } from '@/lib/amenity/nearby';
import { PharmacyHero } from './_components/pharmacy-hero';
import { PharmacyInfo } from './_components/pharmacy-info';
import { PharmacySidebar } from './_components/pharmacy-sidebar';
import { NearbyApartments } from '@/components/ui/nearby-apartments';
import { NearbyInfra } from '@/components/ui/nearby-infra';
import { NearbySubway } from '@/components/ui/nearby-subway';
import { LocationViewer } from '@/components/ui/location-viewer';
import { Card } from '@/components/ui/card';
import { SourceCaption } from '@/components/ui/source-caption';
import { MainSourceBlock } from '@/components/ui/main-source-block';
import { BoardBriefingSection } from '@/app/(public)/_components/board-briefing-section';
import { JsonLd, placeSchema, breadcrumbSchema } from '@/lib/seo/json-ld';
import { staticMapUrl } from '@/lib/seo/static-map';
import { SITE_URL } from '@/lib/site';
import type { Metadata } from 'next';

export const revalidate = 86_400;

interface Params { params: Promise<{ sigunguCode: string; id: string }>; }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return {};
  const pharmacy = await getPharmacyById(BigInt(id)).catch(() => null);
  if (!pharmacy) return {};
  const region = pharmacy.sigungu ?? pharmacy.sido;
  const regionPart = region ? `${region} ` : '';
  return {
    title: `${pharmacy.name} — 약국 정보·주변 아파트`,
    description: `${pharmacy.name} 위치·연락처와 도보권 아파트 실거래가. ${regionPart}주변 생활 인프라를 한눈에 확인하세요.`,
    alternates: { canonical: `/medical/pharmacy/${pharmacy.sigunguCode}/${id}` },
  };
}

export default async function PharmacyDetailPage({ params }: Params) {
  const { sigunguCode, id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const pharmacyId = BigInt(id);

  const pharmacy = await getPharmacyById(pharmacyId);
  if (!pharmacy || pharmacy.sigunguCode !== sigunguCode) notFound();

  const coord = await getPharmacyLatLng(pharmacyId);

  const [apts, infra, otherList, subway] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
    coord
      ? getNearbyInfra(coord.lat, coord.lng, { excludePharmacyId: pharmacy.id, includeChildcare: true })
      : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
    getPharmacyList({ sigunguCode }, 1, 5),
    coord
      ? getNearbySubwayStations(coord.lat, coord.lng)
      : Promise.resolve({ stations: [], fallback: false }),
  ]);

  const others = otherList.rows.filter(p => p.id !== pharmacy.id).slice(0, 4);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <JsonLd
        data={[
          placeSchema({
            type: 'Pharmacy',
            name: pharmacy.name,
            address: pharmacy.address,
            lat: coord?.lat,
            lng: coord?.lng,
            url: `${SITE_URL}/medical/pharmacy/${pharmacy.sigunguCode}/${id}`,
            image: coord ? staticMapUrl(coord) : undefined,
            telephone: pharmacy.tel,
          }),
          breadcrumbSchema([
            { name: '홈', url: `${SITE_URL}/` },
            { name: '생활편의', url: `${SITE_URL}/life` },
            { name: '약국', url: `${SITE_URL}/medical/pharmacy` },
            { name: pharmacy.name, url: `${SITE_URL}/medical/pharmacy/${pharmacy.sigunguCode}/${id}` },
          ]),
        ]}
      />
      <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href="/life/medical">의료시설</Link><span>›</span>
        <Link href="/medical/pharmacy">약국</Link><span>›</span>
        {pharmacy.sigunguCode && (
          <>
            <Link href={`/medical/pharmacy?region=${pharmacy.sigunguCode}`}>
              {pharmacy.sigungu ?? pharmacy.sido}
            </Link>
            <span>›</span>
          </>
        )}
        <span className="truncate font-semibold text-[var(--color-blue-dark)]">{pharmacy.name}</span>
      </nav>

      <PharmacyHero pharmacy={pharmacy} />

      <div className="mt-7 grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-6">
          <PharmacyInfo pharmacy={pharmacy} />
          <SourceCaption ids={['hira']} />
          {coord && (
            <Card id="map">
              <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">위치</h2>
              <LocationViewer lat={coord.lat} lng={coord.lng} name={pharmacy.name} />
            </Card>
          )}
          <NearbyApartments items={apts} />
          {coord && <NearbySubway data={subway} />}
          {coord && <NearbyInfra categories={infra} />}
          <BoardBriefingSection />
          <MainSourceBlock id="hira" />
        </div>
        <aside>
          <PharmacySidebar pharmacies={others} sigunguCode={sigunguCode} />
        </aside>
      </div>
    </div>
  );
}
