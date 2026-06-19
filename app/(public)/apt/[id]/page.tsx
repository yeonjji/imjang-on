import { notFound } from 'next/navigation';
import { getPropertyById, getPropertyLatLng } from '@/lib/property';
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
import { getNearbyInfra } from '@/lib/amenity/nearby';
import { getNearbySubwayStations } from '@/lib/subway/nearby';
import { NearbyInfra } from '@/components/ui/nearby-infra';
import { NearbySubway } from '@/components/ui/nearby-subway';
import { LocationViewer } from '@/components/ui/location-viewer';
import { Card } from '@/components/ui/card';
import { MainSourceBlock } from '@/components/ui/main-source-block';
import { getNearbySubscriptions } from '@/lib/subscription';
import { shortSidoFromRegionCode } from '@/lib/region';
import { NearbySubscriptions } from './_components/nearby-subscriptions';
import { propertyBlurb, salePriceTrend, propertyMetaDescription } from '@/lib/seo/blurb';
import { JsonLd, residenceSchema, breadcrumbSchema } from '@/lib/seo/json-ld';
import { staticMapUrl } from '@/lib/seo/static-map';
import { SITE_URL } from '@/lib/site';
import type { Metadata } from 'next';
import { BoardBriefingSection } from '../../_components/board-briefing-section';

export const revalidate = 21_600;

interface Params {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return {};
  const property = await getPropertyById(BigInt(id)).catch(() => null);
  if (!property) return {};
  return {
    title: `${property.name} 실거래가 · ${property.region.sigungu}`,
    description: propertyMetaDescription({
      name: property.name,
      typeLabel: '아파트',
      regionFullName: property.region.fullName,
      builtYear: property.builtYear,
      households: property.households,
      saleAvgPrice12m: property.saleAvgPrice12m ? Number(property.saleAvgPrice12m) : null,
      jeonseAvgDeposit12m: property.jeonseAvgDeposit12m ? Number(property.jeonseAvgDeposit12m) : null,
      txCount12m: property.txCount12m,
    }),
    alternates: { canonical: `/apt/${property.id}` },
  };
}

export default async function AptDetailPage({ params }: Params) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const propId = BigInt(id);
  const property = await getPropertyById(propId);
  if (!property || property.propertyType !== PropertyType.APARTMENT) notFound();

  const coord = await getPropertyLatLng(propId);
  const shortSido = shortSidoFromRegionCode(property.region.code);

  const [unified, counts, chart, areaSummary, nearby, infra, nearbySubs, subway] = await Promise.all([
    getUnifiedTransactions(propId, { page: 1, perPage: 15 }),
    getTransactionCounts(propId),
    getMonthlyChartData(propId),
    getAreaSummary(propId),
    getNearbyProperties({ propertyId: propId, propertyType: PropertyType.APARTMENT }),
    coord
      ? getNearbyInfra(coord.lat, coord.lng, { includeChildcare: true })
      : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
    shortSido
      ? getNearbySubscriptions({ sido: shortSido, sigungu: property.region.sigungu })
      : Promise.resolve(null),
    coord
      ? getNearbySubwayStations(coord.lat, coord.lng)
      : Promise.resolve({ stations: [], fallback: false }),
  ]);

  const blurbText = propertyBlurb({
    name: property.name,
    regionFullName: property.region.fullName,
    builtYear: property.builtYear,
    households: property.households,
    txCount12m: property.txCount12m,
    saleCount12m: property.saleCount12m,
    jeonseCount12m: property.jeonseCount12m,
    saleAvgPrice12m: property.saleAvgPrice12m ? Number(property.saleAvgPrice12m) : null,
    jeonseAvgDeposit12m: property.jeonseAvgDeposit12m ? Number(property.jeonseAvgDeposit12m) : null,
    trend: salePriceTrend(chart.SALE.map((p) => ({ month: p.month, avg: p.avg }))),
    subwayCount: subway.stations.length,
    infra: infra.map((c) => ({ label: c.label, count: c.items.length })).filter((c) => c.count > 0).slice(0, 5),
  });

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
          }),
          breadcrumbSchema([
            { name: '홈', url: `${SITE_URL}/` },
            { name: '아파트', url: `${SITE_URL}/apt` },
            { name: property.name, url: `${SITE_URL}/apt/${property.id}` },
          ]),
        ]}
      />
      <PropertyDetailHero property={property} region={property.region} />
      <p className="mt-5 rounded-2xl bg-[var(--color-soft)] px-5 py-4 leading-relaxed text-[var(--color-text)]">
        {blurbText}
      </p>
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
          <MainSourceBlock id="molit-rtms" />
        </main>
        <aside>
          <DetailSidebar property={property} />
        </aside>
      </div>
      <BoardBriefingSection />
    </div>
  );
}
