import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { normalizeName } from '@/lib/slug';
import { geocode, buildGeocodeQuery } from '@/scripts/ingest/geocoder';
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

  // redirectToId: null — 병합으로 리다이렉트된 패자는 매칭 대상에서 뺀다. 패자는 생존자와
  // (type, name, region)이 동일해 필터 없이는 그대로 다시 걸려, 병합 후 첫 재수집 때
  // 새 거래가 301된 행에 붙어버린다(그 그룹은 redirectToId IS NULL 조건 때문에 재병합도 안 됨).
  const exact = await prisma.property.findFirst({
    where: {
      propertyType: input.propertyType,
      name: input.name,
      regionCode: { startsWith: input.sigunguCode },
      redirectToId: null,
    },
  });
  if (exact) return exact;

  const candidates = await prisma.property.findMany({
    where: {
      propertyType: input.propertyType,
      nameNorm,
      regionCode: { startsWith: input.sigunguCode },
      redirectToId: null,
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

  const region = await prisma.region.findUnique({
    where: { code: input.regionCode },
    select: { fullName: true },
  });
  const coord = await geocode(buildGeocodeQuery(region?.fullName, input.address));
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
