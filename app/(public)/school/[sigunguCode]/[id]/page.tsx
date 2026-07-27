import { notFound, permanentRedirect } from 'next/navigation';
import { getRedirectPath } from '@/lib/redirect';
import Link from 'next/link';
import { getSchoolList } from '@/lib/school';
import { getSigunguByCode } from '@/lib/region';
import { getNearbyChildcare } from '@/lib/amenity/nearby';
import { NearbyChildcare } from '../../../childcare/[sigunguCode]/[id]/_components/nearby-childcare';
import { SchoolHero } from './_components/school-hero';
import { SchoolInfo } from './_components/school-info';
import { NearbyApartments } from '@/components/ui/nearby-apartments';
import { NearbyInfra } from '@/components/ui/nearby-infra';
import { NearbySubway } from '@/components/ui/nearby-subway';
import { SchoolDetailSidebar } from './_components/school-detail-sidebar';
import { LocationViewer } from '@/components/ui/location-viewer';
import { Card } from '@/components/ui/card';
import { SourceCaption } from '@/components/ui/source-caption';
import { MainSourceBlock } from '@/components/ui/main-source-block';
import { BoardBriefingSection } from '@/app/(public)/_components/board-briefing-section';
import { RelatedGuides } from '@/app/(public)/_components/related-guides';
import { Faq } from '@/app/(public)/_components/faq';
import { composeDetailFaq } from '@/lib/faq/compose';
import { buildSchoolFaq } from '@/lib/faq/builders/school';
import { JsonLd, placeSchema, breadcrumbSchema, provenanceNodes } from '@/lib/seo/json-ld';
import { InsightSection } from '@/components/ui/insight-section';
import { mapImageUrl } from '@/lib/seo/static-map';
import { isNarrativeIndexable, robotsFor } from '@/lib/seo/indexable';
import { SITE_URL } from '@/lib/site';
import type { Metadata } from 'next';
import type { NearbyApartment } from '@/lib/amenity/nearby';
import {
  loadSchoolInsight,
  cachedSchoolById,
  cachedSchoolLatLng,
  cachedNearbyAptsSchool,
  cachedNearbyInfraSchool,
  cachedNearbySubwaySchool,
} from '@/lib/insights/school-loader';

// 시설 정보는 거의 불변이라 7일 캐시 — 크롤러 재생성(ISR write·원본전송)을 대폭 절감.
export const revalidate = 604_800;
// 동적 세그먼트는 generateStaticParams가 없으면 revalidate가 무시되고 매 요청 동적 렌더된다.
// 빈 배열 → 프리빌드 없이 첫 요청 시 렌더 후 revalidate 동안 ISR 캐시(dynamicParams 기본 true).
export function generateStaticParams() { return []; }

interface Params { params: Promise<{ sigunguCode: string; id: string }>; }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { sigunguCode, id } = await params;
  if (!/^\d+$/.test(id)) return {};
  const school = await cachedSchoolById(BigInt(id)).catch(() => null);
  if (!school) return {};
  const { narrative } = await loadSchoolInsight(BigInt(id));
  const indexable = isNarrativeIndexable(narrative);
  const tags = [school.foundType, school.coeduType].filter(Boolean).join('·');
  const tagPart = tags ? `(${tags})` : '';
  const regionPart = school.region ? `${school.region} ` : '';
  return {
    title: `${school.name} — ${school.schoolKind ?? '학교'} 정보·주변 아파트`,
    description: narrative?.text.slice(0, 150) ?? `${school.name}${tagPart} ${school.schoolKind ?? '학교'} 정보와 도보권 아파트 실거래가. ${regionPart}통학 정보를 공공데이터로 확인하세요.`,
    robots: robotsFor(indexable),
    alternates: { canonical: `/school/${sigunguCode}/${id}` },
  };
}

export default async function SchoolDetailPage({ params }: Params) {
  const { sigunguCode, id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const schoolId = BigInt(id);
  const [school, region] = await Promise.all([
    cachedSchoolById(schoolId),
    getSigunguByCode(sigunguCode),
  ]);
  if (!school) {
    // 폐지지역 삭제된 구 학교(B1) → 신 학교 301
    const to = await getRedirectPath('school', BigInt(id));
    if (to) permanentRedirect(to);
    notFound();
  }
  // sigunguCode 정규화로 옛 URL이 mismatch되면 404 대신 정식 URL로 308 영구 리다이렉트.
  if (school.sigunguCode !== sigunguCode) permanentRedirect(`/school/${school.sigunguCode}/${school.id}`);
  // Region 테이블에 sigunguCode가 없을 경우 School.region(sido)으로 fallback.
  const regionDisplay = region ?? {
    fullName: school.region ? `${school.region} (${sigunguCode})` : sigunguCode,
    sigungu: '',
    sigunguCode,
  };

  const basePath = `/school/${sigunguCode}`;
  const coord = await cachedSchoolLatLng(schoolId);

  const [apts, infra, nearbyChildren, otherList, subway] = await Promise.all([
    coord ? cachedNearbyAptsSchool(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
    coord ? cachedNearbyInfraSchool(coord.lat, coord.lng) : Promise.resolve([] as Awaited<ReturnType<typeof cachedNearbyInfraSchool>>),
    coord ? getNearbyChildcare(coord.lat, coord.lng, 1000, 5) : Promise.resolve([]),
    getSchoolList({ sigunguCode }, 1),
    coord
      ? cachedNearbySubwaySchool(coord.lat, coord.lng)
      : Promise.resolve({ stations: [], fallback: false }),
  ]);

  const { narrative } = await loadSchoolInsight(schoolId);

  const others = otherList.rows.filter((s) => s.id !== school.id).slice(0, 4);

  const schoolFaq = composeDetailFaq(
    buildSchoolFaq({
      name: school.name,
      schoolKind: school.schoolKind,
      foundType: school.foundType,
      coeduType: school.coeduType,
      regionFullName: regionDisplay.fullName,
      eduOffice: school.eduOffice,
      address: school.address,
    }),
    'school',
  );

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <JsonLd
        data={[
          placeSchema({
            type: 'School',
            name: school.name,
            address: school.address,
            lat: coord?.lat,
            lng: coord?.lng,
            url: `${SITE_URL}/school/${sigunguCode}/${id}`,
            image: coord ? mapImageUrl('school', school.id) : undefined,
            telephone: school.tel,
            id: `${SITE_URL}/school/${sigunguCode}/${id}#school`,
            mainEntityOfPageId: `${SITE_URL}/school/${sigunguCode}/${id}#webpage`,
          }),
          breadcrumbSchema([
            { name: '홈', url: `${SITE_URL}/` },
            { name: '학교찾기', url: `${SITE_URL}/school` },
            { name: school.name, url: `${SITE_URL}/school/${sigunguCode}/${id}` },
          ]),
          ...provenanceNodes({
            url: `${SITE_URL}/school/${sigunguCode}/${id}`,
            name: school.name,
            sourceId: 'neis',
            entityId: `${SITE_URL}/school/${sigunguCode}/${id}#school`,
          }),
        ]}
      />
      <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/school">학교찾기</Link><span>›</span>
        <Link href={basePath}>{regionDisplay.fullName}</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">{school.name}</span>
      </nav>

      <SchoolHero school={school} />
      {narrative && <InsightSection sentences={narrative.sentences} />}

      <div className="mt-7 grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="flex flex-col gap-6">
          <SchoolInfo school={school} regionFullName={regionDisplay.fullName} />
          <SourceCaption ids={['neis']} />
          {coord && (
            <Card id="map">
              <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">위치</h2>
              <LocationViewer
                lat={coord.lat}
                lng={coord.lng}
                mapKind="school"
                mapId={school.id}
                name={school.name}
              />
            </Card>
          )}
          <NearbyApartments items={apts} />
          {coord && <NearbyChildcare items={nearbyChildren} />}
          {coord && <NearbySubway data={subway} />}
          {coord && <NearbyInfra categories={infra} />}
          <BoardBriefingSection />
          <RelatedGuides pageKey="school" />
          {schoolFaq && <Faq items={schoolFaq} />}
          <MainSourceBlock id="neis" />
        </main>
        <aside><SchoolDetailSidebar basePath={basePath} others={others} /></aside>
      </div>
    </div>
  );
}
