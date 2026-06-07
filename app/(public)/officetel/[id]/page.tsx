import { notFound } from 'next/navigation';
import { getPropertyById, getPropertyLatLng } from '@/lib/property';
import {
  getMonthlyChartData,
  getAreaSummary,
  getUnifiedTransactions,
  getTransactionCounts,
} from '@/lib/transaction';
import { getNearbyProperties } from '@/lib/nearby';
import { getNearbyInfra } from '@/lib/amenity/nearby';
import { getNearbySubwayStations } from '@/lib/subway/nearby';
import { NearbyInfra } from '@/components/ui/nearby-infra';
import { NearbySubway } from '@/components/ui/nearby-subway';
import { LocationViewer } from '@/components/ui/location-viewer';
import { StaticMapImage } from '@/components/ui/static-map';
import { Card } from '@/components/ui/card';
import { PropertyType } from '@prisma/client';
import { PropertyDetailHero } from '../../apt/[id]/_components/property-detail-hero';
import { DealSummarySection } from '../../apt/[id]/_components/deal-summary-section';
import { UnifiedTransactionTable } from '../../apt/[id]/_components/unified-transaction-table';
import { PriceCharts } from '../../apt/[id]/_components/price-charts';
import { AreaComparison } from '../../apt/[id]/_components/area-comparison';
import { NearbyPriceComparison } from '../../apt/[id]/_components/nearby-price-comparison';
import { DetailSidebar } from '../../apt/[id]/_components/detail-sidebar';
import { formatBillion } from '@/lib/format';
import type { Metadata } from 'next';

export const revalidate = 21_600;

interface Params {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const p = await getPropertyById(BigInt(id)).catch(() => null);
  if (!p) return {};
  return {
    title: `${p.name} 실거래가 · ${p.region.fullName}`,
    description: `${p.name} 오피스텔 실거래가 — 매매 평균 ${formatBillion(p.saleAvgPrice12m)} · 전세 ${formatBillion(p.jeonseAvgDeposit12m)}`,
    alternates: { canonical: `/officetel/${p.id}` },
  };
}

export default async function OffiDetailPage({ params }: Params) {
  const { id } = await params;
  const propId = BigInt(id);
  const property = await getPropertyById(propId);
  if (!property || property.propertyType !== PropertyType.OFFICETEL) notFound();

  const coord = await getPropertyLatLng(propId);

  const [unified, counts, chart, areaSummary, nearby, infra, subway] = await Promise.all([
    getUnifiedTransactions(propId, { page: 1, perPage: 15 }),
    getTransactionCounts(propId),
    getMonthlyChartData(propId),
    getAreaSummary(propId),
    getNearbyProperties({ propertyId: propId, propertyType: PropertyType.OFFICETEL }),
    coord
      ? getNearbyInfra(coord.lat, coord.lng, { includeChildcare: true })
      : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
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
              <StaticMapImage lat={coord.lat} lng={coord.lng} name={property.name} />
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
          <NearbyPriceComparison id="nearby" items={nearby} slug="officetel" />
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
