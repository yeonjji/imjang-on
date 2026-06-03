import { notFound } from 'next/navigation';
import { getPropertyById } from '@/lib/property';
import { getMonthlyChartData, getAreaSummary, getUnifiedTransactions } from '@/lib/transaction';
import { getNearbyProperties } from '@/lib/nearby';
import { PropertyType } from '@prisma/client';
import { PropertyDetailHero } from '../../apt/[id]/_components/property-detail-hero';
import { DealSummarySection } from '../../apt/[id]/_components/deal-summary-section';
import { UnifiedTransactionTable } from '../../apt/[id]/_components/unified-transaction-table';
import { PriceCharts } from '../../apt/[id]/_components/price-charts';
import { AreaComparison } from '../../apt/[id]/_components/area-comparison';
import { NearbyPriceComparison } from '../../apt/[id]/_components/nearby-price-comparison';
import { DetailSidebar } from '../../apt/[id]/_components/detail-sidebar';
import type { Metadata } from 'next';

export const revalidate = 21_600;

interface Params {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const p = await getPropertyById(BigInt(id)).catch(() => null);
  if (!p) return {};
  const typeLabel = p.propertyType === 'ROW_HOUSE' ? '연립' : '다세대';
  return {
    title: `${p.name} 실거래가 · ${typeLabel}`,
    description: `${p.name} ${typeLabel} 실거래가`,
    alternates: { canonical: `/villa/${p.id}` },
  };
}

export default async function VillaDetailPage({ params }: Params) {
  const { id } = await params;
  const propId = BigInt(id);
  const property = await getPropertyById(propId);
  if (
    !property ||
    (property.propertyType !== PropertyType.ROW_HOUSE &&
      property.propertyType !== PropertyType.MULTIPLEX)
  )
    notFound();

  const [unified, chart, areaSummary, nearby] = await Promise.all([
    getUnifiedTransactions(propId, { page: 1, perPage: 15 }),
    getMonthlyChartData(propId),
    getAreaSummary(propId),
    getNearbyProperties({ propertyId: propId, propertyType: property.propertyType }),
  ]);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-12">
      <PropertyDetailHero property={property} region={property.region} />
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
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
          <NearbyPriceComparison id="nearby" items={nearby} slug="villa" />
        </main>
        <aside>
          <DetailSidebar property={property} />
        </aside>
      </div>
    </div>
  );
}
