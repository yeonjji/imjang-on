import { prisma } from '@/lib/db';
import type { PropertyType } from '@prisma/client';
import { formatBillion } from '@/lib/format';

export interface NearbyProperty {
  id: string;
  name: string;
  address: string;
  region: string;
  distKm: number;
  saleLastPrice: number | null;
  jeonseLastDeposit: number | null;
  wolseLastDeposit: number | null;
  wolseLastRent: number | null;
}

export async function getNearbyProperties(opts: {
  propertyId: bigint;
  propertyType: PropertyType;
  radiusMeters?: number;
  limit?: number;
}): Promise<NearbyProperty[]> {
  const { propertyId, propertyType, radiusMeters = 2000, limit = 10 } = opts;
  const rows = await prisma.$queryRaw<
    Array<{
      id: bigint;
      name: string;
      address: string;
      full_name: string;
      dist_km: number;
      sale_last_price: number | null;
      jeonse_last_deposit: number | null;
      wolse_last_deposit: number | null;
      wolse_last_rent: number | null;
    }>
  >`
    WITH center AS (
      SELECT location FROM "Property" WHERE id = ${propertyId}
    )
    SELECT
      p.id, p.name, p.address, r."fullName" AS full_name,
      (ST_Distance(p.location, c.location) / 1000.0) AS dist_km,
      p."saleLastPrice"::float AS sale_last_price,
      p."jeonseLastDeposit"::float AS jeonse_last_deposit,
      p."wolseLastDeposit"::float AS wolse_last_deposit,
      p."wolseLastRent"::int AS wolse_last_rent
    FROM "Property" p
    JOIN "Region" r ON r.code = p."regionCode"
    JOIN center c ON true
    WHERE p."propertyType" = ${propertyType}::"PropertyType"
      AND p.id <> ${propertyId}
      AND p.location IS NOT NULL
      AND c.location IS NOT NULL
      AND ST_DWithin(p.location, c.location, ${radiusMeters})
      AND p."txCount12m" > 0
    ORDER BY dist_km ASC, p."txCount12m" DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: String(r.id),
    name: r.name,
    address: r.address,
    region: r.full_name,
    distKm: r.dist_km,
    saleLastPrice: r.sale_last_price,
    jeonseLastDeposit: r.jeonse_last_deposit,
    wolseLastDeposit: r.wolse_last_deposit,
    wolseLastRent: r.wolse_last_rent,
  }));
}

export type NearbyTab = 'ALL' | 'SALE' | 'JEONSE' | 'WOLSE';

export interface NearbyPricePart {
  label: string;
  value: string;
}

export function formatNearbyParts(item: NearbyProperty): NearbyPricePart[] {
  const sale = item.saleLastPrice != null ? formatBillion(item.saleLastPrice) : '-';
  const jeonse = item.jeonseLastDeposit != null ? formatBillion(item.jeonseLastDeposit) : '-';
  const wolse =
    item.wolseLastDeposit != null
      ? `보 ${formatBillion(item.wolseLastDeposit)} / 월 ${(item.wolseLastRent ?? 0).toLocaleString('ko-KR')}만`
      : '-';
  return [
    { label: '매매', value: sale },
    { label: '전세', value: jeonse },
    { label: '월세', value: wolse },
  ];
}

export function formatNearbyPrice(item: NearbyProperty, tab: NearbyTab): string {
  const [sale, jeonse, wolse] = formatNearbyParts(item).map((p) => p.value);
  switch (tab) {
    case 'SALE':
      return sale;
    case 'JEONSE':
      return jeonse;
    case 'WOLSE':
      return wolse;
    case 'ALL':
      return `매매 ${sale} · 전세 ${jeonse} · 월세 ${wolse}`;
    default:
      return tab satisfies never;
  }
}
