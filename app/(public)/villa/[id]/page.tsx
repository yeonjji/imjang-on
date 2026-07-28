import { notFound, permanentRedirect } from 'next/navigation';
import { getRedirectPath } from '@/lib/redirect';
import {
  getMonthlyChartData,
  getAreaSummary,
  getUnifiedTransactions,
  getTransactionCounts,
  getSameFloorComparison,
} from '@/lib/transaction';
import { getNearbyProperties } from '@/lib/nearby';
import { propertyAddress, metaRegionName } from '@/lib/property';
import type { getNearbyInfra } from '@/lib/amenity/nearby';
import { NearbyInfra } from '@/components/ui/nearby-infra';
import { NearbySubway } from '@/components/ui/nearby-subway';
import { LocationViewer } from '@/components/ui/location-viewer';
import { AddressLine } from '@/components/ui/address-line';
import { Card } from '@/components/ui/card';
import { MainSourceBlock } from '@/components/ui/main-source-block';
import { PropertyType } from '@prisma/client';
import { PropertyDetailHero } from '../../apt/[id]/_components/property-detail-hero';
import { DealSummarySection } from '../../apt/[id]/_components/deal-summary-section';
import { UnifiedTransactionTable } from '../../apt/[id]/_components/unified-transaction-table';
import { PriceCharts } from '../../apt/[id]/_components/price-charts';
import { AreaComparison } from '../../apt/[id]/_components/area-comparison';
import { SameFloorObservation } from '../../apt/[id]/_components/same-floor-observation';
import { FloorPremiumView } from '../../apt/[id]/_components/floor-premium';
import { TransactionFlagsView } from '../../apt/[id]/_components/transaction-flags';
import { NearbyPriceComparison } from '../../apt/[id]/_components/nearby-price-comparison';
import { DetailSidebar } from '../../apt/[id]/_components/detail-sidebar';
import { propertyMetaDescription } from '@/lib/seo/blurb';
import { JsonLd, residenceSchema, breadcrumbSchema, aptProvenanceNodes } from '@/lib/seo/json-ld';
import { InsightSection } from '@/components/ui/insight-section';
import {
  cachedPropertyById,
  cachedHasSingleJibun,
  cachedPropertyLatLng,
  cachedNearbySubway,
  cachedNearbyInfra,
  cachedFloorPremium,
  cachedTransactionFlags,
  loadAptInsight,
} from '@/lib/insights/apt-loader';
import { mapImageUrl } from '@/lib/seo/static-map';
import { isNarrativeIndexable, robotsFor } from '@/lib/seo/indexable';
import { detailTitleLocality } from '@/lib/region';
import { SITE_URL } from '@/lib/site';
import type { Metadata } from 'next';
import { BoardBriefingSection } from '../../_components/board-briefing-section';
import { RelatedGuides } from '../../_components/related-guides';
import { Faq } from '../../_components/faq';
import { composeDetailFaq } from '@/lib/faq/compose';
import { buildAptFaq } from '@/lib/faq/builders/apt';

export const revalidate = 86_400;
// 동적 세그먼트는 generateStaticParams가 없으면 revalidate가 무시되고 매 요청 동적 렌더된다.
// 빈 배열 → 프리빌드 없이 첫 요청 시 렌더 후 revalidate 동안 ISR 캐시(dynamicParams 기본 true).
export function generateStaticParams() { return []; }

interface Params {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return {};
  const p = await cachedPropertyById(BigInt(id)).catch(() => null);
  // ID 공간 공유 → 유형 필터 필수(빌라=연립·다세대). 없으면 타 유형 메타를 방출한다.
  if (!p || (p.propertyType !== PropertyType.ROW_HOUSE && p.propertyType !== PropertyType.MULTIPLEX)) return {};
  const { narrative } = await loadAptInsight(BigInt(id));
  const indexable = isNarrativeIndexable(narrative);
  const addr = propertyAddress(p, p.region);
  const jibunConfirmed = addr.street !== null ? await cachedHasSingleJibun(BigInt(id)) : false;
  return {
    title: `${p.name} 실거래가 · ${detailTitleLocality(p.region, p.address)}`,
    description: narrative?.text.slice(0, 150) ?? propertyMetaDescription({
      name: p.name,
      typeLabel: '연립·다세대',
      regionFullName: metaRegionName(addr, p.region, jibunConfirmed),
      builtYear: p.builtYear,
      households: p.households,
      saleAvgPrice12m: p.saleAvgPrice12m ? Number(p.saleAvgPrice12m) : null,
      jeonseAvgDeposit12m: p.jeonseAvgDeposit12m ? Number(p.jeonseAvgDeposit12m) : null,
      txCount12m: p.txCount12m,
    }),
    robots: robotsFor(indexable),
    alternates: { canonical: `/villa/${p.id}` },
  };
}

export default async function VillaDetailPage({ params }: Params) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const propId = BigInt(id);
  const property = await cachedPropertyById(propId);
  if (!property) {
    // 폐지지역 삭제된 구 매물(B1) → 신 매물 301
    const to = await getRedirectPath('property', propId);
    if (to) permanentRedirect(to);
    notFound();
  }
  if (
    property.propertyType !== PropertyType.ROW_HOUSE &&
    property.propertyType !== PropertyType.MULTIPLEX
  )
    notFound();
  // 삭제 전 구 매물(redirectToId) → 신 매물 301. 삭제 후엔 위 getRedirectPath가 커버.
  if (property.redirectToId) permanentRedirect(`/villa/${property.redirectToId}`);

  const coord = await cachedPropertyLatLng(propId);

  const [unified, counts, chart, areaSummary, nearby, sameFloor, floorPremium, flags, infra, subway] = await Promise.all([
    getUnifiedTransactions(propId, { page: 1, perPage: 15 }),
    getTransactionCounts(propId),
    getMonthlyChartData(propId),
    getAreaSummary(propId),
    getNearbyProperties({ propertyId: propId, propertyType: property.propertyType }),
    getSameFloorComparison(propId),
    cachedFloorPremium(propId),
    cachedTransactionFlags(propId),
    coord
      ? cachedNearbyInfra(coord.lat, coord.lng)
      : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
    coord
      ? cachedNearbySubway(coord.lat, coord.lng)
      : Promise.resolve({ stations: [], fallback: false }),
  ]);

  const { narrative, dateModified } = await loadAptInsight(propId);

  const villaFaq = composeDetailFaq(
    buildAptFaq({ property, areaSummary, unifiedTotalCount: unified.totalCount }),
    'villa',
  );

  const addr = propertyAddress(property, property.region);
  // 게이트 실패는 페이지를 죽일 이유가 없다 — 보수적으로 '대표 지번' 표기로 낮춘다.
  const jibunConfirmed =
    addr.street !== null ? await cachedHasSingleJibun(propId).catch(() => false) : false;

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-12">
      <JsonLd
        data={[
          residenceSchema({
            name: property.name,
            address: jibunConfirmed && addr.street ? addr.street : undefined,
            addressRegion: property.region.sido,
            addressLocality: property.region.sigungu ?? undefined,
            lat: coord?.lat,
            lng: coord?.lng,
            url: `${SITE_URL}/villa/${property.id}`,
            image: coord ? mapImageUrl('property', property.id) : undefined,
            id: `${SITE_URL}/villa/${property.id}#residence`,
            mainEntityOfPageId: `${SITE_URL}/villa/${property.id}#webpage`,
          }),
          breadcrumbSchema([
            { name: '홈', url: `${SITE_URL}/` },
            { name: '빌라', url: `${SITE_URL}/villa` },
            { name: property.name, url: `${SITE_URL}/villa/${property.id}` },
          ]),
          ...aptProvenanceNodes({
            url: `${SITE_URL}/villa/${property.id}`,
            name: property.name,
            dateModified,
          }),
        ]}
      />
      <PropertyDetailHero property={property} region={property.region} confirmed={jibunConfirmed} />
      {narrative && <InsightSection sentences={narrative.sentences} />}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="flex flex-col gap-8">
          <DealSummarySection id="summary" property={property} />
          {coord && (
            <Card id="map">
              <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">
                위치 · 로드뷰
              </h2>
              {/* 지도/로드뷰 바로 위. 좌표 없는 단지(414개, 0.2%)는 이 카드 자체가 없어 주소·출처가 노출되지 않는다 */}
              {addr.street && <AddressLine display={addr.display} confirmed={jibunConfirmed} />}
              <LocationViewer
                lat={coord.lat}
                lng={coord.lng}
                mapKind="property"
                mapId={property.id}
                name={property.name}
              />
            </Card>
          )}
          <UnifiedTransactionTable
            id="transactions"
            propertyId={String(propId)}
            initialRows={unified.rows}
            counts={counts}
          />
          <section id="chart">
            <h2 className="mb-4 text-xl font-bold text-[var(--color-blue-dark)]">
              가격 흐름 그래프
            </h2>
            <PriceCharts data={chart} />
          </section>
          <AreaComparison id="area" areas={areaSummary} />
          <SameFloorObservation id="same-floor" pair={sameFloor} />
          <FloorPremiumView id="floor-premium" data={floorPremium} />
          <TransactionFlagsView id="data-notes" data={flags} />
          <NearbyPriceComparison id="nearby" items={nearby} slug="villa" />
          <NearbySubway data={subway} />
          <NearbyInfra categories={infra} />
          <BoardBriefingSection />
          <RelatedGuides pageKey="villa" />
          {villaFaq && <Faq items={villaFaq} />}
          <MainSourceBlock id="molit-rtms" />
        </main>
        <aside>
          <DetailSidebar property={property} />
        </aside>
      </div>
    </div>
  );
}
