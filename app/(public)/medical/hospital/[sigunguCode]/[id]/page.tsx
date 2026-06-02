import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getHospitalById, getHospitalLatLng, getHospitalList } from '@/lib/hospital';
import {
  getNearbyApartments,
  getNearbyPharmacies,
  getNearbyParks,
  getNearbyStores,
  getNearbyEvChargers,
} from '@/lib/amenity/nearby';
import { HospitalHero } from './_components/hospital-hero';
import { HospitalSummaryCards } from './_components/hospital-summary-cards';
import { HospitalTabs } from './_components/hospital-tabs';
import { HospitalNearby } from './_components/hospital-nearby';
import { HospitalSidebar } from './_components/hospital-sidebar';
import { NaverMap } from '@/components/ui/naver-map';
import { Card } from '@/components/ui/card';
import type { Metadata } from 'next';

export const revalidate = 86_400;

interface Params { params: Promise<{ sigunguCode: string; id: string }>; }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const hospital = await getHospitalById(BigInt(id)).catch(() => null);
  if (!hospital) return {};
  return {
    title: `${hospital.name} — ${hospital.typeName} 정보·주변 아파트`,
    description: `${hospital.name}(${hospital.address}) 진료과·시설·교통 정보와 주변 아파트.`,
    alternates: { canonical: `/medical/hospital/${hospital.sigunguCode}/${id}` },
  };
}

export default async function HospitalDetailPage({ params }: Params) {
  const { sigunguCode, id } = await params;
  const hospitalId = BigInt(id);

  const hospital = await getHospitalById(hospitalId);
  if (!hospital || hospital.sigunguCode !== sigunguCode) notFound();

  const coord = await getHospitalLatLng(hospitalId);

  const [apts, pharmacies, parks, stores, chargers, otherList] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([]),
    coord ? getNearbyPharmacies(coord.lat, coord.lng) : Promise.resolve([]),
    coord ? getNearbyParks(coord.lat, coord.lng) : Promise.resolve([]),
    coord ? getNearbyStores(coord.lat, coord.lng, 500) : Promise.resolve([]),
    coord ? getNearbyEvChargers(coord.lat, coord.lng) : Promise.resolve([]),
    getHospitalList({ sigunguCode }, 1, 5),
  ]);

  const others = otherList.rows.filter(h => h.id !== hospital.id).slice(0, 4);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href="/life/medical">의료시설</Link><span>›</span>
        <Link href="/medical/hospital">병원·의원</Link><span>›</span>
        {hospital.sigunguCode && (
          <>
            <Link href={`/medical/hospital?region=${hospital.sigunguCode}`}>
              {hospital.sigungu ?? hospital.sido}
            </Link>
            <span>›</span>
          </>
        )}
        <span className="truncate font-semibold text-[var(--color-blue-dark)]">{hospital.name}</span>
      </nav>

      <HospitalHero hospital={hospital} />

      <div className="mt-5">
        <HospitalSummaryCards
          totalDoctors={hospital.totalDoctors}
          facility={hospital.facility}
          detail={hospital.detail}
        />
      </div>

      <div className="mt-7 grid grid-cols-1 gap-7 lg:grid-cols-[1fr_320px]">
        <main className="flex flex-col gap-6">
          <HospitalTabs hospital={hospital} />
          {coord && (
            <Card id="map">
              <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">위치</h2>
              <NaverMap lat={coord.lat} lng={coord.lng} name={hospital.name} />
            </Card>
          )}
          <HospitalNearby
            apts={apts}
            pharmacies={pharmacies}
            parks={parks}
            stores={stores}
            chargers={chargers}
          />
        </main>
        <aside>
          <HospitalSidebar hospitals={others} sigunguCode={sigunguCode} />
        </aside>
      </div>
    </div>
  );
}
