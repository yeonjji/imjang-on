import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { normalizeName } from '@/lib/slug';
import { geocode, buildGeocodeQuery } from '@/scripts/ingest/geocoder';
import type { Property, PropertyType } from '@prisma/client';
import { Prisma } from '@prisma/client';

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
  let created: Property;
  try {
    created = await prisma.property.create({
      data: {
        propertyType: input.propertyType,
        name: input.name,
        nameNorm,
        regionCode: input.regionCode,
        address: input.address,
        builtYear: input.buildYear,
      },
    });
  } catch (err) {
    // P2002 = Property_dedupe_key 위반. 조회와 create 사이에 형제 프로세스가 같은 단지를
    // 만들었다는 뜻이다. 던지면 그 시군구·월 태스크 전체가 실패하므로, 그 행을 찾아 돌려준다.
    // 인덱스 키와 정확히 같은 조건으로 조회해야 방금 충돌한 행이 잡힌다
    // (앞의 조회들은 regionCode를 prefix로 보므로 키가 다르다).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.property.findFirst({
        where: {
          propertyType: input.propertyType,
          nameNorm,
          regionCode: input.regionCode,
          address: input.address,
          redirectToId: null,
        },
      });
      if (winner) {
        logger.info(
          { name: input.name, sigungu: input.sigunguCode, id: String(winner.id) },
          'P2002 — 형제가 만든 단지 재사용',
        );
        return winner;
      }
    }
    throw err;
  }
  if (coord) {
    await prisma.$executeRaw`
      UPDATE "Property"
      SET location = ST_SetSRID(ST_MakePoint(${coord.lng}, ${coord.lat}), 4326)::geography
      WHERE id = ${created.id}
    `;
  }
  return created;
}
