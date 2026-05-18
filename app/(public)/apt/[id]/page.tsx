import { notFound } from 'next/navigation';
import { getPropertyById } from '@/lib/property';
import {
  getTransactionCounts,
  getTransactionsByType,
  getMonthlyChartData,
} from '@/lib/transaction';
import { getNearbyProperties } from '@/lib/nearby';
import { PropertyType, DealType } from '@prisma/client';
import { PropertyHeader } from './_components/property-header';
import { StatsCards } from './_components/stats-cards';
import { PriceCharts } from './_components/price-charts';
import { TransactionSection } from './_components/transaction-section';
import { StaticMap } from './_components/static-map';
import { NearbyProperties } from './_components/nearby-properties';
import { Phase2Placeholder } from './_components/phase2-placeholder';
import { formatBillion } from '@/lib/format';
import { prisma } from '@/lib/db';
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

async function getCoord(id: bigint) {
  const r = await prisma.$queryRaw<Array<{ lat: number; lng: number }>>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "Property" WHERE id = ${id} AND location IS NOT NULL
  `;
  return r[0] ?? null;
}

export default async function AptDetailPage({ params }: Params) {
  const { id } = await params;
  const propId = BigInt(id);
  const property = await getPropertyById(propId);
  if (!property || property.propertyType !== PropertyType.APARTMENT) notFound();

  const [counts, saleRows, jeonseRows, wolseRows, chart, nearby, coord] = await Promise.all([
    getTransactionCounts(propId),
    getTransactionsByType(propId, DealType.SALE, { perPage: 10 }),
    getTransactionsByType(propId, DealType.JEONSE, { perPage: 10 }),
    getTransactionsByType(propId, DealType.WOLSE, { perPage: 10 }),
    getMonthlyChartData(propId),
    getNearbyProperties({ propertyId: propId, propertyType: PropertyType.APARTMENT }),
    getCoord(propId),
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

      <div className="grid gap-6 md:grid-cols-2">
        {coord && <StaticMap lat={coord.lat} lng={coord.lng} name={property.name} />}
        <NearbyProperties items={nearby} slug="apt" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Phase2Placeholder
          title="주변 학교·마트·병원"
          description="생활 인프라 정보는 Phase 2에서 제공할 예정이에요."
        />
        <Phase2Placeholder
          title="주변 청약 정보"
          description="청약 단지 연결 정보는 Phase 2에서 제공할 예정이에요."
        />
      </div>
    </article>
  );
}
