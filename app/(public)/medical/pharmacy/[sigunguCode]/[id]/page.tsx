import { notFound, permanentRedirect } from 'next/navigation';
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
import { RelatedGuides } from '@/app/(public)/_components/related-guides';
import { JsonLd, placeSchema, breadcrumbSchema } from '@/lib/seo/json-ld';
import { mapImageUrl } from '@/lib/seo/static-map';
import { SITE_URL } from '@/lib/site';
import type { Metadata } from 'next';

// 시설 정보는 거의 불변이라 7일 캐시 — 크롤러 재생성(ISR write·원본전송)을 대폭 절감.
export const revalidate = 604_800;
// 동적 세그먼트는 generateStaticParams가 없으면 revalidate가 무시되고 매 요청 동적 렌더된다.
// 빈 배열 → 프리빌드 없이 첫 요청 시 렌더 후 revalidate 동안 ISR 캐시(dynamicParams 기본 true).
export function generateStaticParams() { return []; }

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
    // 약국 상세는 고유 콘텐츠(이름·주소·시간)가 얇고 나머지는 전 위치 공통 파생이라
    // near-duplicate 색인 부풀림 요인. 로컬 열람용으로 렌더는 유지하되 색인에서만 배제.
    // follow 유지로 근접 아파트 실거래 링크에쿼티는 전달. (docs/adsense/approval-strategy-2026-07-08.md P0-A)
    robots: { index: false, follow: true },
    alternates: { canonical: `/medical/pharmacy/${pharmacy.sigunguCode}/${id}` },
  };
}

export default async function PharmacyDetailPage({ params }: Params) {
  const { sigunguCode, id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const pharmacyId = BigInt(id);

  const pharmacy = await getPharmacyById(pharmacyId);
  if (!pharmacy) notFound();
  // sigunguCode 정규화로 옛 URL이 mismatch되면 404 대신 정식 URL로 308 영구 리다이렉트.
  if (pharmacy.sigunguCode !== sigunguCode) permanentRedirect(`/medical/pharmacy/${pharmacy.sigunguCode}/${pharmacy.id}`);

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
            image: coord ? mapImageUrl('pharmacy', pharmacy.id) : undefined,
            telephone: pharmacy.tel,
          }),
          breadcrumbSchema([
            { name: '홈', url: `${SITE_URL}/` },
            { name: '약국', url: `${SITE_URL}/medical/pharmacy` },
            { name: pharmacy.name, url: `${SITE_URL}/medical/pharmacy/${pharmacy.sigunguCode}/${id}` },
          ]),
        ]}
      />
      <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/medical/hospital">의료시설</Link><span>›</span>
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
              <LocationViewer
                lat={coord.lat}
                lng={coord.lng}
                mapKind="pharmacy"
                mapId={pharmacy.id}
                name={pharmacy.name}
              />
            </Card>
          )}
          <NearbyApartments items={apts} />
          {coord && <NearbySubway data={subway} />}
          {coord && <NearbyInfra categories={infra} />}
          <BoardBriefingSection />
          <RelatedGuides pageKey="medical/pharmacy" />
          <MainSourceBlock id="hira" />
        </div>
        <aside>
          <PharmacySidebar pharmacies={others} sigunguCode={sigunguCode} />
        </aside>
      </div>
    </div>
  );
}
