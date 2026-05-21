import { notFound } from 'next/navigation';
import { getPropertyById } from '@/lib/property';
import { getMonthlyChartData, getAreaSummary, getUnifiedTransactions } from '@/lib/transaction';
import { getNearbyProperties } from '@/lib/nearby';
import { PropertyType } from '@prisma/client';
import { PropertyDetailHero } from './_components/property-detail-hero';
import { DealSummarySection } from './_components/deal-summary-section';
import { UnifiedTransactionTable } from './_components/unified-transaction-table';
import { PriceCharts } from './_components/price-charts';
import { AreaComparison } from './_components/area-comparison';
import { NearbyPriceComparison } from './_components/nearby-price-comparison';
import { DetailSidebar } from './_components/detail-sidebar';
import { formatBillion } from '@/lib/format';
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

  const [unified, chart, areaSummary, nearby] = await Promise.all([
    getUnifiedTransactions(propId, { page: 1, perPage: 15 }),
    getMonthlyChartData(propId),
    getAreaSummary(propId),
    getNearbyProperties({ propertyId: propId, propertyType: PropertyType.APARTMENT }),
  ]);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-12">
      <PropertyDetailHero property={property} region={property.region} />
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <main className="flex flex-col gap-8">
          <DealSummarySection id="summary" property={property} />
          <UnifiedTransactionTable
            id="transactions"
            propertyId={String(propId)}
            initialRows={unified.rows}
            totalCount={unified.totalCount}
          />
          <section id="chart">
            <h2 className="mb-4 text-xl font-bold text-[var(--color-blue-dark)]">
              가격 흐름 그래프
            </h2>
            <PriceCharts sale={chart.SALE} jeonse={chart.JEONSE} wolse={chart.WOLSE} />
          </section>
          <AreaComparison id="area" areas={areaSummary} />
          <NearbyPriceComparison id="nearby" items={nearby} slug="apt" />
        </main>
        <aside>
          <DetailSidebar property={property} />
        </aside>
      </div>
    </div>
  );
}
