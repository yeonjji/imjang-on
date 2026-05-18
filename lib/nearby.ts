import { prisma } from '@/lib/db';
import { PropertyType } from '@prisma/client';

export interface NearbyProperty {
  id: string;
  name: string;
  address: string;
  region: string;
  distKm: number;
}

export async function getNearbyProperties(opts: {
  propertyId: bigint;
  propertyType: PropertyType;
  radiusMeters?: number;
  limit?: number;
}): Promise<NearbyProperty[]> {
  const { propertyId, propertyType, radiusMeters = 2000, limit = 10 } = opts;
  const rows = await prisma.$queryRaw<Array<{ id: bigint; name: string; address: string; full_name: string; dist_km: number }>>`
    WITH center AS (
      SELECT location FROM "Property" WHERE id = ${propertyId}
    )
    SELECT
      p.id, p.name, p.address, r."fullName" AS full_name,
      (ST_Distance(p.location, c.location) / 1000.0) AS dist_km
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
  }));
}
