import { prisma } from '@/lib/db';
import { PropertyType } from '@prisma/client';
import type { AmenitySlug } from '@/lib/amenity/category';
import { buildInfraCategories, INFRA_FETCH_LIMIT, type InfraCategory } from '@/lib/amenity/infra';

export interface NearbyEvCharger {
  id: bigint;
  name: string;
  address: string;
  chargeSpeed: string;
  chargerCount: number;
  operatorName: string | null;
  distanceMeters: number;
}

export interface NearbyTraditionalMarket {
  id: bigint;
  name: string;
  address: string;
  marketType: string | null;
  distanceMeters: number;
}

export interface NearbyStore {
  id: bigint;
  name: string;
  address: string;
  industryCode: string | null;
  industryName: string | null;
  distanceMeters: number;
}

export async function getNearbyEvChargers(
  lat: number,
  lng: number,
  radiusMeters = 500,
  limit = 10,
): Promise<NearbyEvCharger[]> {
  return prisma.$queryRaw<NearbyEvCharger[]>`
    SELECT
      id,
      name,
      address,
      "chargeSpeed",
      "chargerCount",
      "operatorName",
      ROUND(ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )::numeric) AS "distanceMeters"
    FROM "EvCharger"
    WHERE ST_DWithin(
      location::geography,
      ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
      ${radiusMeters}
    )
    ORDER BY "distanceMeters"
    LIMIT ${limit}
  `;
}

export async function getNearbyTraditionalMarkets(
  lat: number,
  lng: number,
  radiusMeters = 1000,
  limit = 5,
): Promise<NearbyTraditionalMarket[]> {
  return prisma.$queryRaw<NearbyTraditionalMarket[]>`
    SELECT
      id,
      name,
      address,
      "marketType",
      ROUND(ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )::numeric) AS "distanceMeters"
    FROM "TraditionalMarket"
    WHERE ST_DWithin(
      location::geography,
      ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
      ${radiusMeters}
    )
    ORDER BY "distanceMeters"
    LIMIT ${limit}
  `;
}

export async function getNearbyStores(
  lat: number,
  lng: number,
  radiusMeters = 300,
  limit = 10,
): Promise<NearbyStore[]> {
  return prisma.$queryRaw<NearbyStore[]>`
    SELECT
      id,
      name,
      address,
      "industryCode",
      "industryName",
      ROUND(ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )::numeric) AS "distanceMeters"
    FROM "Store"
    WHERE ST_DWithin(
      location::geography,
      ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
      ${radiusMeters}
    )
    ORDER BY "distanceMeters"
    LIMIT ${limit}
  `;
}

export async function getNearbyAmenities(lat: number, lng: number) {
  const [chargers, markets, stores] = await Promise.all([
    getNearbyEvChargers(lat, lng),
    getNearbyTraditionalMarkets(lat, lng),
    getNearbyStores(lat, lng),
  ]);
  return { chargers, markets, stores };
}

export interface NearbyApartment {
  id: bigint;
  name: string;
  region: string;
  builtYear: number | null;
  households: number | null;
  saleLastPrice: number | null;
  jeonseLastDeposit: number | null;
  distanceMeters: number;
}

export async function getNearbyApartments(
  lat: number,
  lng: number,
  radiusMeters = 1000,
  limit = 10,
): Promise<NearbyApartment[]> {
  return prisma.$queryRaw<NearbyApartment[]>`
    SELECT
      p.id, p.name, r."fullName" AS region, p."builtYear", p.households,
      p."saleLastPrice"::float AS "saleLastPrice",
      p."jeonseLastDeposit"::float AS "jeonseLastDeposit",
      ROUND(ST_Distance(
        p.location,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )::numeric) AS "distanceMeters"
    FROM "Property" p
    JOIN "Region" r ON r.code = p."regionCode"
    WHERE p."propertyType" = ${PropertyType.APARTMENT}::"PropertyType"
      AND p.location IS NOT NULL
      AND p."txCount12m" > 0
      AND ST_DWithin(
        p.location,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${radiusMeters}
      )
    ORDER BY "distanceMeters"
    LIMIT ${limit}
  `;
}

export interface NearbyPark {
  id: bigint;
  name: string;
  address: string;
  parkType: string | null;
  area: number | null;
  distanceMeters: number;
}

export async function getNearbyParks(
  lat: number,
  lng: number,
  radiusMeters = 1000,
  limit = 5,
): Promise<NearbyPark[]> {
  return prisma.$queryRaw<NearbyPark[]>`
    SELECT id, name, address, "parkType", area,
      ROUND(ST_Distance(
        location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )::numeric) AS "distanceMeters"
    FROM "Park"
    WHERE ST_DWithin(
      location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusMeters}
    )
    ORDER BY "distanceMeters"
    LIMIT ${limit}
  `;
}

/**
 * DETAIL "주변 상권 종합" — 현재 카테고리 **제외**한 나머지 카테고리의 가까운 항목들.
 * Store(convenience/mart/cafe) + TraditionalMarket(market)를 단일 호출로.
 */
export async function getMixedNearbyForDetail(
  currentSlug: AmenitySlug | 'parking' | 'charger',
  lat: number,
  lng: number,
): Promise<{
  convenience: NearbyStore[];
  mart: NearbyStore[];
  cafe: NearbyStore[];
  market: NearbyTraditionalMarket[];
}> {
  const [stores, markets] = await Promise.all([
    getNearbyStores(lat, lng, 500),
    getNearbyTraditionalMarkets(lat, lng, 1000),
  ]);
  const convenience = stores.filter((s) => (s.industryCode ?? '').startsWith('G20405'));
  const mart = stores.filter((s) => {
    const c = s.industryCode ?? '';
    return c.startsWith('G20404') || c.startsWith('G20402');
  });
  const cafe = stores.filter((s) => (s.industryCode ?? '').startsWith('I21201'));
  return {
    convenience: currentSlug === 'convenience' ? [] : convenience.slice(0, 5),
    mart: currentSlug === 'mart' ? [] : mart.slice(0, 5),
    cafe: currentSlug === 'cafe' ? [] : cafe.slice(0, 5),
    market: currentSlug === 'market' ? [] : markets.slice(0, 5),
  };
}

export interface NearbyChildcare {
  id: bigint;
  name: string;
  address: string;
  sigunguCode: string | null;
  crType: string | null;
  capacity: number | null;
  distanceMeters: number;
}

export async function getNearbyChildcare(
  lat: number,
  lng: number,
  radiusMeters = 1000,
  limit = 5,
  excludeId: bigint | null = null,
): Promise<NearbyChildcare[]> {
  const rows = await prisma.$queryRaw<NearbyChildcare[]>`
    SELECT
      id, name, address, "sigunguCode", "crType", capacity,
      ROUND(ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )::numeric)::int AS "distanceMeters"
    FROM "Childcare"
    WHERE location IS NOT NULL
      AND ("status" IN ('정상', '재개') OR "status" IS NULL)
      AND ST_DWithin(
        location::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${radiusMeters}
      )
    ORDER BY "distanceMeters"
    LIMIT ${limit + 1}
  `;
  return rows.filter((r) => excludeId == null || r.id !== excludeId).slice(0, limit);
}

export interface NearbyPharmacy {
  id: bigint;
  name: string;
  address: string;
  tel: string | null;
  distanceMeters: number;
}

export async function getNearbyPharmacies(
  lat: number,
  lng: number,
  radiusMeters = 500,
  limit = 5,
  excludeId: bigint | null = null,
): Promise<NearbyPharmacy[]> {
  const rows = await prisma.$queryRaw<NearbyPharmacy[]>`
    SELECT
      id, name, address, tel,
      ROUND(ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )::numeric) AS "distanceMeters"
    FROM "Pharmacy"
    WHERE location IS NOT NULL
      AND ST_DWithin(
        location::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${radiusMeters}
      )
    ORDER BY "distanceMeters"
    LIMIT ${limit + 1}
  `;
  return rows.filter((r) => excludeId == null || r.id !== excludeId).slice(0, limit);
}

export interface NearbyHospital {
  id: bigint;
  name: string;
  typeName: string;
  address: string;
  distanceMeters: number;
}

export async function getNearbyHospitals(
  lat: number,
  lng: number,
  radiusMeters = 500,
  limit = 5,
  excludeId: bigint | null = null,
): Promise<NearbyHospital[]> {
  const rows = await prisma.$queryRaw<NearbyHospital[]>`
    SELECT
      id, name, "typeName", address,
      ROUND(ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )::numeric) AS "distanceMeters"
    FROM "Hospital"
    WHERE location IS NOT NULL
      AND ST_DWithin(
        location::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${radiusMeters}
      )
    ORDER BY "distanceMeters"
    LIMIT ${limit + 1}
  `;
  return rows.filter((r) => excludeId == null || r.id !== excludeId).slice(0, limit);
}

export interface NearbyParking {
  id: bigint;
  name: string;
  address: string;
  prkplceSe: string | null;
  prkcmprt: number | null;
  distanceMeters: number;
}

export async function getNearbyParking(
  lat: number,
  lng: number,
  radiusMeters = 500,
  limit = 5,
): Promise<NearbyParking[]> {
  return prisma.$queryRaw<NearbyParking[]>`
    SELECT id, name, address, "prkplceSe", "prkcmprt",
      ROUND(ST_Distance(
        location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )::numeric) AS "distanceMeters"
    FROM "Parking"
    WHERE location IS NOT NULL
      AND ST_DWithin(
        location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusMeters}
      )
    ORDER BY "distanceMeters"
    LIMIT ${limit}
  `;
}

// 상세 "주변 생활 인프라" — 카테고리를 정규화해 반환. 빈 카테고리는 제외됨. (좌표만 받는 범용)
export async function getNearbyInfra(
  lat: number,
  lng: number,
  opts: {
    excludeHospitalId?: bigint;
    excludePharmacyId?: bigint;
    excludeStoreId?: bigint;
    excludeMarketId?: bigint;
    excludeParkId?: bigint;
    excludeParkingId?: bigint;
    excludeChargerId?: bigint;
    includeChildcare?: boolean;
  } = {},
): Promise<InfraCategory[]> {
  const [stores, hospitals, pharmacies, parks, markets, chargers, parking, childcare] = await Promise.all([
    getNearbyStores(lat, lng, 500, INFRA_FETCH_LIMIT),
    getNearbyHospitals(lat, lng, 500, INFRA_FETCH_LIMIT, opts.excludeHospitalId ?? null),
    getNearbyPharmacies(lat, lng, 500, INFRA_FETCH_LIMIT, opts.excludePharmacyId ?? null),
    getNearbyParks(lat, lng, 1000, INFRA_FETCH_LIMIT),
    getNearbyTraditionalMarkets(lat, lng, 1000, INFRA_FETCH_LIMIT),
    getNearbyEvChargers(lat, lng, 500, INFRA_FETCH_LIMIT),
    getNearbyParking(lat, lng, 500, INFRA_FETCH_LIMIT),
    opts.includeChildcare
      ? getNearbyChildcare(lat, lng, 1000, INFRA_FETCH_LIMIT)
      : Promise.resolve([] as NearbyChildcare[]),
  ]);
  const filteredStores =
    opts.excludeStoreId != null ? stores.filter((s) => s.id !== opts.excludeStoreId) : stores;
  const filteredMarkets =
    opts.excludeMarketId != null ? markets.filter((m) => m.id !== opts.excludeMarketId) : markets;
  const filteredParks =
    opts.excludeParkId != null ? parks.filter((p) => p.id !== opts.excludeParkId) : parks;
  const filteredParking =
    opts.excludeParkingId != null ? parking.filter((p) => p.id !== opts.excludeParkingId) : parking;
  const filteredChargers =
    opts.excludeChargerId != null ? chargers.filter((c) => c.id !== opts.excludeChargerId) : chargers;
  return buildInfraCategories({
    stores: filteredStores,
    hospitals,
    pharmacies,
    parks: filteredParks,
    markets: filteredMarkets,
    chargers: filteredChargers,
    parking: filteredParking,
    childcare,
  });
}
