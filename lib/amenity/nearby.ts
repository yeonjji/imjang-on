import { prisma } from '@/lib/db';
import { PropertyType } from '@prisma/client';

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
    LIMIT 10
  `;
}

export async function getNearbyTraditionalMarkets(
  lat: number,
  lng: number,
  radiusMeters = 1000,
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
    LIMIT 5
  `;
}

export async function getNearbyStores(
  lat: number,
  lng: number,
  radiusMeters = 300,
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
    LIMIT 10
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
    LIMIT 5
  `;
}

// 학교 상세 "주변 생활 인프라" 탭(공원 / 마트·편의 / 충전소). 병원·약국은 보류(제외).
export async function getSchoolNearbyAmenities(lat: number, lng: number) {
  const [parks, stores, chargers] = await Promise.all([
    getNearbyParks(lat, lng),
    getNearbyStores(lat, lng),
    getNearbyEvChargers(lat, lng),
  ]);
  const mart = stores.filter((s) => {
    const c = s.industryCode ?? '';
    return ['G20405', 'G20404', 'G20402', 'I21201'].some((p) => c.startsWith(p));
  });
  return { parks, mart, chargers };
}
