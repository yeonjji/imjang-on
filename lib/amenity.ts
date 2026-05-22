import { prisma } from '@/lib/db';

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
