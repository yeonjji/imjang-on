import { prisma } from '@/lib/db';

export interface NearbyCharger {
  id: bigint;
  name: string;
  address: string;
  chargeSpeed: string;
  chargerCount: number;
  distanceMeters: number;
}

export async function getSameCategoryNearbyCharger(
  lat: number,
  lng: number,
  excludeId: bigint,
  radiusMeters = 1000,
  limit = 6,
): Promise<NearbyCharger[]> {
  const rows = await prisma.$queryRaw<NearbyCharger[]>`
    SELECT id, name, address, "chargeSpeed", "chargerCount",
      ROUND(ST_Distance(
        location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )::numeric)::int AS "distanceMeters"
    FROM "EvCharger"
    WHERE location IS NOT NULL
      AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusMeters})
    ORDER BY "distanceMeters"
    LIMIT ${limit + 1}
  `;
  return rows.filter((r) => r.id !== excludeId).slice(0, limit);
}

export interface NearbyParking {
  id: bigint;
  name: string;
  address: string;
  prkplceSe: string | null;
  chargeInfo: string | null;
  distanceMeters: number;
}

export async function getSameCategoryNearbyParking(
  lat: number,
  lng: number,
  excludeId: bigint,
  radiusMeters = 1000,
  limit = 6,
): Promise<NearbyParking[]> {
  const rows = await prisma.$queryRaw<NearbyParking[]>`
    SELECT id, name, address, "prkplceSe", "chargeInfo",
      ROUND(ST_Distance(
        location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )::numeric)::int AS "distanceMeters"
    FROM "Parking"
    WHERE location IS NOT NULL
      AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusMeters})
    ORDER BY "distanceMeters"
    LIMIT ${limit + 1}
  `;
  return rows.filter((r) => r.id !== excludeId).slice(0, limit);
}

export interface NearbyPark {
  id: bigint;
  name: string;
  address: string;
  parkType: string | null;
  distanceMeters: number;
}

export async function getSameCategoryNearbyPark(
  lat: number,
  lng: number,
  excludeId: bigint,
  radiusMeters = 1000,
  limit = 6,
): Promise<NearbyPark[]> {
  const rows = await prisma.$queryRaw<NearbyPark[]>`
    SELECT id, name, address, "parkType",
      ROUND(ST_Distance(
        location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )::numeric)::int AS "distanceMeters"
    FROM "Park"
    WHERE location IS NOT NULL
      AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusMeters})
    ORDER BY "distanceMeters"
    LIMIT ${limit + 1}
  `;
  return rows.filter((r) => r.id !== excludeId).slice(0, limit);
}
