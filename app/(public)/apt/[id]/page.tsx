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
import { formatBillion } from '@/lib/format';
import { getNearbySubscriptions } from '@/lib/subscription';
import { shortSidoFromRegionCode } from '@/lib/region';
import { NearbySubscriptions } from './_components/nearby-subscriptions';
import type { Metadata } from 'next';

export const revalidate = 21_600;

interface Params {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const property = await getPropertyById(BigInt(id)).catch(() => null);
  if (!property) return {};
  return {
    title: `${property.name} 실거래가 · ${property.region.fullName}`,
    description: `${property.name}(${property.builtYear ?? '?'}년 준공). 매매 평균 ${formatBillion(property.saleAvgPrice12m)} · 전세 ${formatBillion(property.jeonseAvgDeposit12m)} · 거래 ${property.txCount12m}건.`,
    alternates: { canonical: `/apt/${property.id}` },
  };
}

export default async function AptDetailPage({ params }: Params) {
  const { id } = await params;
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

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-12">
      <PropertyDetailHero property={property} region={property.region} />
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
        </main>
        <aside>
          <DetailSidebar property={property} />
        </aside>
      </div>
    </div>
  );
}
