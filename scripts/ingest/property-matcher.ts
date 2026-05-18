import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { normalizeName } from '@/lib/slug';
import { geocode } from '@/scripts/ingest/geocoder';
import type { PropertyType } from '@prisma/client';

export interface MatcherInput {
  propertyType: PropertyType;
  name: string;
  sigunguCode: string;
  regionCode: string;
  address: string;
  buildYear: number | null;
  roadName: string | null;
}

export async function findOrCreateProperty(input: MatcherInput) {
  const nameNorm = normalizeName(input.name);

  const exact = await prisma.property.findFirst({
    where: {
      propertyType: input.propertyType,
      name: input.name,
      regionCode: { startsWith: input.sigunguCode },
    },
  });
  if (exact) return exact;

  const candidates = await prisma.property.findMany({
    where: {
      propertyType: input.propertyType,
      nameNorm,
      regionCode: { startsWith: input.sigunguCode },
    },
    take: 5,
  });
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    if (input.roadName) {
      const byRoad = candidates.find((c) => c.address.includes(input.roadName!));
      if (byRoad) return byRoad;
    }
    logger.warn({ name: input.name, sigungu: input.sigunguCode, count: candidates.length }, 'ambiguous match — picking first');
    return candidates[0];
  }

  const coord = await geocode(input.address);
  const created = await prisma.property.create({
    data: {
      propertyType: input.propertyType,
      name: input.name,
      nameNorm,
      regionCode: input.regionCode,
      address: input.address,
      builtYear: input.buildYear,
    },
  });
  if (coord) {
    await prisma.$executeRaw`
      UPDATE "Property"
      SET location = ST_SetSRID(ST_MakePoint(${coord.lng}, ${coord.lat}), 4326)::geography
      WHERE id = ${created.id}
    `;
  }
  return created;
}
