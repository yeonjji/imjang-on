import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPharmacyById, getPharmacyLatLng, getPharmacyList } from '@/lib/pharmacy';
import {
  getNearbyApartments,
  getNearbyHospitals,
  getNearbyParks,
  getNearbyStores,
  getNearbyTraditionalMarkets,
  getNearbyEvChargers,
  getNearbyChildcare,
} from '@/lib/amenity/nearby';
import { PharmacyHero } from './_components/pharmacy-hero';
import { PharmacyInfo } from './_components/pharmacy-info';
import { PharmacyNearby } from './_components/pharmacy-nearby';
import { PharmacySidebar } from './_components/pharmacy-sidebar';
import { NaverMap } from '@/components/ui/naver-map';
import { Card } from '@/components/ui/card';
import type { Metadata } from 'next';

export const revalidate = 86_400;

interface Params { params: Promise<{ sigunguCode: string; id: string }>; }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return {};
  const pharmacy = await getPharmacyById(BigInt(id)).catch(() => null);
  if (!pharmacy) return {};
  return {
    title: `${pharmacy.name} — 약국 정보·주변 아파트`,
    description: `${pharmacy.name}(${pharmacy.address}) 위치·연락처와 주변 아파트·생활 인프라.`,
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

  const [apts, hospitals, parks, stores, markets, chargers, childcare, otherList] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([]),
    coord ? getNearbyHospitals(coord.lat, coord.lng) : Promise.resolve([]),
    coord ? getNearbyParks(coord.lat, coord.lng) : Promise.resolve([]),
    coord ? getNearbyStores(coord.lat, coord.lng, 500) : Promise.resolve([]),
    coord ? getNearbyTraditionalMarkets(coord.lat, coord.lng) : Promise.resolve([]),
    coord ? getNearbyEvChargers(coord.lat, coord.lng) : Promise.resolve([]),
    coord ? getNearbyChildcare(coord.lat, coord.lng) : Promise.resolve([]),
    getPharmacyList({ sigunguCode }, 1, 5),
  ]);

  const convenience = stores.filter(s => (s.industryCode ?? '').startsWith('G20405'));
  const mart = stores.filter(s => {
    const c = s.industryCode ?? '';
    return c.startsWith('G20404') || c.startsWith('G20402');
  });
  const cafe = stores.filter(s => (s.industryCode ?? '').startsWith('I21201'));
  const others = otherList.rows.filter(p => p.id !== pharmacy.id).slice(0, 4);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
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

      <div className="mt-7 grid grid-cols-1 gap-7 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <PharmacyInfo pharmacy={pharmacy} />
          {coord && (
            <Card id="map">
              <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">위치</h2>
              <NaverMap lat={coord.lat} lng={coord.lng} name={pharmacy.name} />
            </Card>
          )}
          <PharmacyNearby
            apts={apts}
            hospitals={hospitals}
            parks={parks}
            convenience={convenience}
            mart={mart}
            cafe={cafe}
            markets={markets}
            chargers={chargers}
            childcare={childcare}
          />
        </div>
        <aside>
          <PharmacySidebar pharmacies={others} sigunguCode={sigunguCode} />
        </aside>
      </div>
    </div>
  );
}
