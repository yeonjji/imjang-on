import { prisma } from '@/lib/db';

export interface NearbySubwayStation {
  id: string;
  name: string;
  lines: string[];
  isTransfer: boolean;
  distanceMeters: number;
}

export interface NearbySubwayResult {
  stations: NearbySubwayStation[];
  fallback: boolean; // 800m 내 없어 가장 가까운 1개만 반환한 경우
}

const RADIUS_METERS = 800;
const FALLBACK_MAX_METERS = 5000;
const LIMIT = 8;

interface Row {
  id: bigint;
  name: string;
  lines: string[];
  is_transfer: boolean;
  distance_meters: number;
}

export async function getNearbySubwayStations(lat: number, lng: number): Promise<NearbySubwayResult> {
  const within = await prisma.$queryRaw<Row[]>`
    SELECT id, name, lines, "isTransfer" AS is_transfer,
      ROUND(ST_Distance(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography)::numeric)::int AS distance_meters
    FROM "SubwayStation"
    WHERE location IS NOT NULL
      AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${RADIUS_METERS})
    ORDER BY distance_meters
    LIMIT ${LIMIT}
  `;
  if (within.length > 0) {
    return { stations: within.map(mapRow), fallback: false };
  }
  const nearest = await prisma.$queryRaw<Row[]>`
    SELECT id, name, lines, "isTransfer" AS is_transfer,
      ROUND(ST_Distance(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography)::numeric)::int AS distance_meters
    FROM "SubwayStation"
    WHERE location IS NOT NULL
      AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${FALLBACK_MAX_METERS})
    ORDER BY distance_meters
    LIMIT 1
  `;
  return { stations: nearest.map(mapRow), fallback: nearest.length > 0 };
}

function mapRow(r: Row): NearbySubwayStation {
  return {
    id: String(r.id),
    name: r.name,
    lines: r.lines,
    isTransfer: r.is_transfer,
    distanceMeters: Number(r.distance_meters),
  };
}
