import { notFound } from 'next/navigation';
import { getPropertyById } from '@/lib/property';
import {
  getTransactionCounts,
  getTransactionsByType,
  getMonthlyChartData,
} from '@/lib/transaction';
import { getNearbyProperties } from '@/lib/nearby';
import { PropertyType, DealType } from '@prisma/client';
import { PropertyHeader } from '../../apt/[id]/_components/property-header';
import { StatsCards } from '../../apt/[id]/_components/stats-cards';
import { PriceCharts } from '../../apt/[id]/_components/price-charts';
import { TransactionSection } from '../../apt/[id]/_components/transaction-section';
import { NearbyProperties } from '../../apt/[id]/_components/nearby-properties';
import { Phase2Placeholder } from '../../apt/[id]/_components/phase2-placeholder';
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

  const [counts, saleRows, jeonseRows, wolseRows, chart, nearby] = await Promise.all([
    getTransactionCounts(propId),
    getTransactionsByType(propId, DealType.SALE, { perPage: 10 }),
    getTransactionsByType(propId, DealType.JEONSE, { perPage: 10 }),
    getTransactionsByType(propId, DealType.WOLSE, { perPage: 10 }),
    getMonthlyChartData(propId),
    getNearbyProperties({ propertyId: propId, propertyType: PropertyType.OFFICETEL }),
  ]);

  const toRow = (t: {
    id: bigint;
    contractDate: Date;
    exclusiveArea: { toString(): string } | number;
    floor: number | null;
    dealAmount: number | null;
    deposit: number | null;
    monthlyRent: number | null;
  }) => ({
    id: String(t.id),
    contractDate: t.contractDate.toISOString().slice(0, 10),
    exclusiveArea: Number(t.exclusiveArea),
    floor: t.floor,
    dealAmount: t.dealAmount,
    deposit: t.deposit,
    monthlyRent: t.monthlyRent,
  });

  return (
    <article className="mx-auto max-w-[1180px] space-y-8 px-6 py-12">
      <PropertyHeader property={property} region={property.region} />
      <StatsCards property={property} />
      <PriceCharts sale={chart.SALE} jeonse={chart.JEONSE} wolse={chart.WOLSE} />
      <TransactionSection
        propertyId={String(propId)}
        dealType={DealType.SALE}
        initialRows={saleRows.map(toRow)}
        totalCount={counts.SALE}
      />
      <TransactionSection
        propertyId={String(propId)}
        dealType={DealType.JEONSE}
        initialRows={jeonseRows.map(toRow)}
        totalCount={counts.JEONSE}
      />
      <TransactionSection
        propertyId={String(propId)}
        dealType={DealType.WOLSE}
        initialRows={wolseRows.map(toRow)}
        totalCount={counts.WOLSE}
      />
      <NearbyProperties items={nearby} slug="officetel" />
      <div className="grid gap-4 md:grid-cols-2">
        <Phase2Placeholder title="주변 학교·마트·병원" description="Phase 2에서 제공 예정" />
        <Phase2Placeholder title="주변 청약 정보" description="Phase 2에서 제공 예정" />
      </div>
    </article>
  );
}
