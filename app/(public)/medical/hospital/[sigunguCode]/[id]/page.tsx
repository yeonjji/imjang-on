import { notFound, permanentRedirect } from 'next/navigation';
import Link from 'next/link';
import { getHospitalList } from '@/lib/hospital';
import type { NearbyApartment } from '@/lib/amenity/nearby';
import { loadHospitalInsight, cachedHospitalById, cachedHospitalLatLng, cachedNearbyApartmentsHosp, cachedNearbyInfraHosp, cachedNearbySubwayHosp } from '@/lib/insights/hospital-loader';
import { InsightSection } from '@/components/ui/insight-section';
import { HospitalHero } from './_components/hospital-hero';
import { HospitalSummaryCards } from './_components/hospital-summary-cards';
import { HospitalTabs } from './_components/hospital-tabs';
import { HospitalSidebar } from './_components/hospital-sidebar';
import { NearbyApartments } from '@/components/ui/nearby-apartments';
import { NearbyInfra } from '@/components/ui/nearby-infra';
import { NearbySubway } from '@/components/ui/nearby-subway';
import { LocationViewer } from '@/components/ui/location-viewer';
import { Card } from '@/components/ui/card';
import { SourceCaption } from '@/components/ui/source-caption';
import { MainSourceBlock } from '@/components/ui/main-source-block';
import { BoardBriefingSection } from '@/app/(public)/_components/board-briefing-section';
import { RelatedGuides } from '@/app/(public)/_components/related-guides';
import { Faq } from '@/app/(public)/_components/faq';
import { composeDetailFaq } from '@/lib/faq/compose';
import { buildHospitalFaq } from '@/lib/faq/builders/hospital';
import { JsonLd, placeSchema, breadcrumbSchema, provenanceNodes } from '@/lib/seo/json-ld';
import { mapImageUrl } from '@/lib/seo/static-map';
import { isNarrativeIndexable, robotsFor } from '@/lib/seo/indexable';
import { SITE_URL } from '@/lib/site';
import { qualifiedTitle } from '@/lib/seo/title';
import { hospitalDescriptor } from '@/lib/seo/facility-descriptor';
import { resolveSigunguLabelFromAddress } from '@/lib/region/from-address';
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
  const hospital = await cachedHospitalById(BigInt(id)).catch(() => null);
  if (!hospital) return {};
  const { narrative } = await loadHospitalInsight(BigInt(id));
  const indexable = isNarrativeIndexable(narrative);
  const docs = hospital.totalDoctors ? `, 의사 ${hospital.totalDoctors.toLocaleString('ko-KR')}명` : '';
  const locality = await resolveSigunguLabelFromAddress(hospital.address);
  return {
    title: qualifiedTitle(hospital.name, locality, `— ${hospitalDescriptor(hospital.depts, hospital.typeName)}`),
    description: narrative?.text.slice(0, 150) ?? `${hospital.name} ${hospital.typeName}${docs}. 진료·시설·교통 정보와 도보권 아파트 실거래가를 함께 확인하세요.`,
    robots: robotsFor(indexable),
    alternates: { canonical: `/medical/hospital/${hospital.sigunguCode}/${id}` },
  };
}

export default async function HospitalDetailPage({ params }: Params) {
  const { sigunguCode, id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const hospitalId = BigInt(id);

  const hospital = await cachedHospitalById(hospitalId);
  if (!hospital) notFound();
  // sigunguCode 정규화로 옛 URL이 mismatch되면 404 대신 정식 URL로 308 영구 리다이렉트.
  if (hospital.sigunguCode !== sigunguCode) permanentRedirect(`/medical/hospital/${hospital.sigunguCode}/${hospital.id}`);

  const coord = await cachedHospitalLatLng(hospitalId);

  const [apts, infra, otherList, subway] = await Promise.all([
    coord ? cachedNearbyApartmentsHosp(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
    coord
      ? cachedNearbyInfraHosp(coord.lat, coord.lng, hospital.id)
      : Promise.resolve([] as Awaited<ReturnType<typeof cachedNearbyInfraHosp>>),
    getHospitalList({ sigunguCode }, 1, 5),
    coord
      ? cachedNearbySubwayHosp(coord.lat, coord.lng)
      : Promise.resolve({ stations: [], fallback: false }),
  ]);

  const others = otherList.rows.filter(h => h.id !== hospital.id).slice(0, 4);
  const { narrative } = await loadHospitalInsight(hospitalId);

  const hospitalFaq = composeDetailFaq(
    buildHospitalFaq({
      name: hospital.name,
      typeName: hospital.typeName,
      sigungu: hospital.sigungu,
      sido: hospital.sido,
      depts: hospital.depts,
      totalDoctors: hospital.totalDoctors,
      detail: hospital.detail
        ? {
            openMon: hospital.detail.openMon,
            closeMon: hospital.detail.closeMon,
            erDayOpen: hospital.detail.erDayOpen,
            erNightOpen: hospital.detail.erNightOpen,
          }
        : null,
    }),
    'hospital',
  );

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <JsonLd
        data={[
          placeSchema({
            type: 'Hospital',
            name: hospital.name,
            address: hospital.address,
            lat: coord?.lat,
            lng: coord?.lng,
            url: `${SITE_URL}/medical/hospital/${hospital.sigunguCode}/${id}`,
            image: coord ? mapImageUrl('hospital', hospital.id) : undefined,
            telephone: hospital.tel,
            id: `${SITE_URL}/medical/hospital/${hospital.sigunguCode}/${id}#hospital`,
            mainEntityOfPageId: `${SITE_URL}/medical/hospital/${hospital.sigunguCode}/${id}#webpage`,
          }),
          breadcrumbSchema([
            { name: '홈', url: `${SITE_URL}/` },
            { name: '병원·의원', url: `${SITE_URL}/medical/hospital` },
            { name: hospital.name, url: `${SITE_URL}/medical/hospital/${hospital.sigunguCode}/${id}` },
          ]),
          ...provenanceNodes({
            url: `${SITE_URL}/medical/hospital/${hospital.sigunguCode}/${id}`,
            name: hospital.name,
            sourceId: 'hira',
            entityId: `${SITE_URL}/medical/hospital/${hospital.sigunguCode}/${id}#hospital`,
          }),
        ]}
      />
      <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/medical/hospital">의료시설</Link><span>›</span>
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
      {narrative && <InsightSection sentences={narrative.sentences} />}

      <div className="mt-5">
        <HospitalSummaryCards
          totalDoctors={hospital.totalDoctors}
          facility={hospital.facility}
          detail={hospital.detail}
        />
      </div>

      <div className="mt-7 grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-6">
          <HospitalTabs hospital={hospital} />
          <SourceCaption ids={['hira']} />
          {coord && (
            <Card id="map">
              <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">위치</h2>
              <LocationViewer
                lat={coord.lat}
                lng={coord.lng}
                mapKind="hospital"
                mapId={hospital.id}
                name={hospital.name}
              />
            </Card>
          )}
          <NearbyApartments items={apts} />
          {coord && <NearbySubway data={subway} />}
          {coord && <NearbyInfra categories={infra} />}
          <BoardBriefingSection />
          <RelatedGuides pageKey="medical/hospital" />
          {hospitalFaq && <Faq items={hospitalFaq} />}
          <MainSourceBlock id="hira" />
        </div>
        <aside>
          <HospitalSidebar hospitals={others} sigunguCode={sigunguCode} />
        </aside>
      </div>
    </div>
  );
}
