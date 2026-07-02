import { notFound } from 'next/navigation';
import {
  getMonthlyChartData,
  getAreaSummary,
  getUnifiedTransactions,
  getTransactionCounts,
} from '@/lib/transaction';
import { getNearbyProperties } from '@/lib/nearby';
import { PropertyType } from '@prisma/client';
import { PropertyDetailHero } from './_components/property-detail-hero';
import { DealSummarySection } from './_components/deal-summary-section';
import { UnifiedTransactionTable } from './_components/unified-transaction-table';
import { PriceCharts } from './_components/price-charts';
import { AreaComparison } from './_components/area-comparison';
import { NearbyPriceComparison } from './_components/nearby-price-comparison';
import { DetailSidebar } from './_components/detail-sidebar';
import type { getNearbyInfra } from '@/lib/amenity/nearby';
import { NearbyInfra } from '@/components/ui/nearby-infra';
import { NearbySubway } from '@/components/ui/nearby-subway';
import { LocationViewer } from '@/components/ui/location-viewer';
import { Card } from '@/components/ui/card';
import { MainSourceBlock } from '@/components/ui/main-source-block';
import { getNearbySubscriptions } from '@/lib/subscription';
import { shortSidoFromRegionCode } from '@/lib/region';
import { NearbySubscriptions } from './_components/nearby-subscriptions';
import { propertyMetaDescription } from '@/lib/seo/blurb';
import { JsonLd, residenceSchema, breadcrumbSchema, aptProvenanceNodes } from '@/lib/seo/json-ld';
import { InsightSection } from '@/components/ui/insight-section';
import { cachedPropertyById, cachedPropertyLatLng, cachedNearbySubway, cachedNearbyInfra, loadAptInsight } from '@/lib/insights/apt-loader';
import { staticMapUrl } from '@/lib/seo/static-map';
import { SITE_URL } from '@/lib/site';
import type { Metadata } from 'next';
import { BoardBriefingSection } from '../../_components/board-briefing-section';

export const revalidate = 86_400;

interface Params {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return {};
  const property = await cachedPropertyById(BigInt(id)).catch(() => null);
  if (!property) return {};
  const { narrative } = await loadAptInsight(BigInt(id));
  const indexable = !!narrative && narrative.fired.length >= 3;
  return {
    title: `${property.name} 실거래가 · ${property.region.sigungu}`,
    description: narrative?.text.slice(0, 150) ?? propertyMetaDescription({
      name: property.name,
      typeLabel: '아파트',
      regionFullName: property.region.fullName,
      builtYear: property.builtYear,
      households: property.households,
      saleAvgPrice12m: property.saleAvgPrice12m ? Number(property.saleAvgPrice12m) : null,
      jeonseAvgDeposit12m: property.jeonseAvgDeposit12m ? Number(property.jeonseAvgDeposit12m) : null,
      txCount12m: property.txCount12m,
    }),
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
    alternates: { canonical: `/apt/${property.id}` },
  };
}

export default async function AptDetailPage({ params }: Params) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const propId = BigInt(id);
  const property = await cachedPropertyById(propId);
  if (!property || property.propertyType !== PropertyType.APARTMENT) notFound();

  const coord = await cachedPropertyLatLng(propId);
  const shortSido = shortSidoFromRegionCode(property.region.code);

  const [unified, counts, chart, areaSummary, nearby, infra, nearbySubs, subway] = await Promise.all([
    getUnifiedTransactions(propId, { page: 1, perPage: 15 }),
    getTransactionCounts(propId),
    getMonthlyChartData(propId),
    getAreaSummary(propId),
    getNearbyProperties({ propertyId: propId, propertyType: PropertyType.APARTMENT }),
    coord
      ? cachedNearbyInfra(coord.lat, coord.lng)
      : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
    shortSido
      ? getNearbySubscriptions({ sido: shortSido, sigungu: property.region.sigungu })
      : Promise.resolve(null),
    coord
      ? cachedNearbySubway(coord.lat, coord.lng)
      : Promise.resolve({ stations: [], fallback: false }),
  ]);

  const { narrative, dateModified } = await loadAptInsight(propId);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-12">
      <JsonLd
        data={[
          residenceSchema({
            name: property.name,
            address: property.region.fullName,
            lat: coord?.lat,
            lng: coord?.lng,
            url: `${SITE_URL}/apt/${property.id}`,
            image: coord ? staticMapUrl(coord) : undefined,
            id: `${SITE_URL}/apt/${property.id}#residence`,
            mainEntityOfPageId: `${SITE_URL}/apt/${property.id}#webpage`,
          }),
          breadcrumbSchema([
            { name: '홈', url: `${SITE_URL}/` },
            { name: '아파트', url: `${SITE_URL}/apt` },
            { name: property.name, url: `${SITE_URL}/apt/${property.id}` },
          ]),
          ...aptProvenanceNodes({
            url: `${SITE_URL}/apt/${property.id}`,
            name: property.name,
            dateModified,
          }),
        ]}
      />
      <PropertyDetailHero property={property} region={property.region} />
      {narrative && <InsightSection sentences={narrative.sentences} />}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="flex flex-col gap-8">
          <DealSummarySection id="summary" property={property} />
          {coord && (
            <Card id="map">
              <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">
                위치 · 로드뷰
              </h2>
              <LocationViewer lat={coord.lat} lng={coord.lng} name={property.name} />
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
          <NearbyPriceComparison id="nearby" items={nearby} slug="apt" />
          {shortSido && nearbySubs && nearbySubs.items.length > 0 && (
            <NearbySubscriptions
              id="subscriptions-nearby"
              items={nearbySubs.items}
              scopeLabel={nearbySubs.scopeLabel}
              sido={shortSido}
            />
          )}
          <NearbySubway data={subway} />
          <NearbyInfra categories={infra} />
          <BoardBriefingSection />
          <MainSourceBlock id="molit-rtms" />
        </main>
        <aside>
          <DetailSidebar property={property} />
        </aside>
      </div>
    </div>
  );
}
