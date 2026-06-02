import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSchoolById, getSchoolList } from '@/lib/school';
import { getSigunguByCode } from '@/lib/region';
import { getNearbyApartments, getNearbyInfra, getNearbyChildcare } from '@/lib/amenity/nearby';
import { NearbyChildcare } from '../../../childcare/[sigunguCode]/[id]/_components/nearby-childcare';
import { SchoolHero } from './_components/school-hero';
import { SchoolInfo } from './_components/school-info';
import { NearbyApartments } from '@/components/ui/nearby-apartments';
import { NearbyInfra } from '@/components/ui/nearby-infra';
import { SchoolDetailSidebar } from './_components/school-detail-sidebar';
import { NaverMap } from '@/components/ui/naver-map';
import { Card } from '@/components/ui/card';
import type { Metadata } from 'next';
import type { NearbyApartment } from '@/lib/amenity/nearby';

export const revalidate = 86_400;

interface Params { params: Promise<{ sigunguCode: string; id: string }>; }

async function getSchoolLatLng(id: bigint): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "School" WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { sigunguCode, id } = await params;
  const school = await getSchoolById(BigInt(id)).catch(() => null);
  if (!school) return {};
  return {
    title: `${school.name} — ${school.schoolKind ?? '학교'} 정보·주변 아파트`,
    description: `${school.name}(${school.address}) 학교 정보와 주변 아파트 실거래가.`,
    alternates: { canonical: `/school/${sigunguCode}/${id}` },
  };
}

export default async function SchoolDetailPage({ params }: Params) {
  const { sigunguCode, id } = await params;
  const schoolId = BigInt(id);
  const [school, region] = await Promise.all([
    getSchoolById(schoolId),
    getSigunguByCode(sigunguCode),
  ]);
  if (!school || school.sigunguCode !== sigunguCode) notFound();
  // Region 테이블에 sigunguCode가 없을 경우 School.region(sido)으로 fallback.
  const regionDisplay = region ?? {
    fullName: school.region ? `${school.region} (${sigunguCode})` : sigunguCode,
    sigungu: '',
    sigunguCode,
  };

  const basePath = `/school/${sigunguCode}`;
  const coord = await getSchoolLatLng(schoolId);

  const [apts, infra, nearbyChildren, otherList] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
    coord ? getNearbyInfra(coord.lat, coord.lng) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
    coord ? getNearbyChildcare(coord.lat, coord.lng, 1000, 5) : Promise.resolve([]),
    getSchoolList({ sigunguCode }, 1),
  ]);

  const others = otherList.rows.filter((s) => s.id !== school.id).slice(0, 4);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href="/school">학교찾기</Link><span>›</span>
        <Link href={basePath}>{regionDisplay.fullName}</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">{school.name}</span>
      </nav>

      <SchoolHero school={school} />

      <div className="mt-7 grid grid-cols-1 gap-7 lg:grid-cols-[1fr_320px]">
        <main className="flex flex-col gap-6">
          <SchoolInfo school={school} regionFullName={regionDisplay.fullName} />
          {coord && (
            <Card id="map">
              <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">위치</h2>
              <NaverMap lat={coord.lat} lng={coord.lng} name={school.name} />
            </Card>
          )}
          <NearbyApartments items={apts} />
          {coord && <NearbyChildcare items={nearbyChildren} />}
          {coord && <NearbyInfra categories={infra} />}
        </main>
        <aside><SchoolDetailSidebar basePath={basePath} others={others} /></aside>
      </div>
    </div>
  );
}
