import { notFound } from 'next/navigation';
import {
  getMonthlyChartData,
  getAreaSummary,
  getUnifiedTransactions,
  getTransactionCounts,
} from '@/lib/transaction';
import { getNearbyProperties } from '@/lib/nearby';
import type { getNearbyInfra } from '@/lib/amenity/nearby';
import { NearbyInfra } from '@/components/ui/nearby-infra';
import { NearbySubway } from '@/components/ui/nearby-subway';
import { LocationViewer } from '@/components/ui/location-viewer';
import { Card } from '@/components/ui/card';
import { MainSourceBlock } from '@/components/ui/main-source-block';
import { PropertyType } from '@prisma/client';
import { PropertyDetailHero } from '../../apt/[id]/_components/property-detail-hero';
import { DealSummarySection } from '../../apt/[id]/_components/deal-summary-section';
import { UnifiedTransactionTable } from '../../apt/[id]/_components/unified-transaction-table';
import { PriceCharts } from '../../apt/[id]/_components/price-charts';
import { AreaComparison } from '../../apt/[id]/_components/area-comparison';
import { NearbyPriceComparison } from '../../apt/[id]/_components/nearby-price-comparison';
import { DetailSidebar } from '../../apt/[id]/_components/detail-sidebar';
import { propertyMetaDescription } from '@/lib/seo/blurb';
import { JsonLd, residenceSchema, breadcrumbSchema, aptProvenanceNodes } from '@/lib/seo/json-ld';
import { PropertyInsight } from '@/components/ui/property-insight';
import {
  cachedPropertyById,
  cachedPropertyLatLng,
  cachedNearbySubway,
  cachedNearbyInfra,
  loadAptInsight,
} from '@/lib/insights/apt-loader';
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
  const p = await cachedPropertyById(BigInt(id)).catch(() => null);
  if (!p) return {};
  const { narrative } = await loadAptInsight(BigInt(id));
  const indexable = !!narrative && narrative.fired.length >= 3;
  return {
    title: `${p.name} 실거래가 · ${p.region.sigungu}`,
    description: narrative?.text.slice(0, 150) ?? propertyMetaDescription({
      name: p.name,
      typeLabel: '연립·다세대',
      regionFullName: p.region.fullName,
      builtYear: p.builtYear,
      households: p.households,
      saleAvgPrice12m: p.saleAvgPrice12m ? Number(p.saleAvgPrice12m) : null,
      jeonseAvgDeposit12m: p.jeonseAvgDeposit12m ? Number(p.jeonseAvgDeposit12m) : null,
      txCount12m: p.txCount12m,
    }),
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
    alternates: { canonical: `/villa/${p.id}` },
  };
}

export default async function VillaDetailPage({ params }: Params) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const propId = BigInt(id);
  const property = await cachedPropertyById(propId);
  if (
    !property ||
    (property.propertyType !== PropertyType.ROW_HOUSE &&
      property.propertyType !== PropertyType.MULTIPLEX)
  )
    notFound();

  const coord = await cachedPropertyLatLng(propId);

  const [unified, counts, chart, areaSummary, nearby, infra, subway] = await Promise.all([
    getUnifiedTransactions(propId, { page: 1, perPage: 15 }),
    getTransactionCounts(propId),
    getMonthlyChartData(propId),
    getAreaSummary(propId),
    getNearbyProperties({ propertyId: propId, propertyType: property.propertyType }),
    coord
      ? cachedNearbyInfra(coord.lat, coord.lng)
      : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
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
            url: `${SITE_URL}/villa/${property.id}`,
            image: coord ? staticMapUrl(coord) : undefined,
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
      <PropertyDetailHero property={property} region={property.region} />
      {narrative && <PropertyInsight sentences={narrative.sentences} />}
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
          <NearbyPriceComparison id="nearby" items={nearby} slug="villa" />
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
