import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { PropertyType, DealType } from '@prisma/client';
import { createHash } from 'node:crypto';
import { getNearbyProperties } from '@/lib/nearby';
import { updatePropertyAggregates } from '@/scripts/ingest/aggregator';

const REGION = '8888888888';
const SIGUNGU = '88888';
let centerId: bigint;
let neighborId: bigint;

async function seedProp(name: string, lng: number, lat: number): Promise<bigint> {
  const prop = await prisma.property.create({
    data: {
      propertyType: PropertyType.APARTMENT,
      name,
      nameNorm: name,
      regionCode: REGION,
      address: '테스트 주소',
    },
  });
  await prisma.$executeRaw`
    UPDATE "Property"
    SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
    WHERE id = ${prop.id}
  `;
  for (const dealType of [DealType.SALE, DealType.JEONSE, DealType.WOLSE]) {
    await prisma.transaction.create({
      data: {
        propertyId: prop.id,
        propertyType: PropertyType.APARTMENT,
        regionCode: REGION,
        sigunguCode: SIGUNGU,
        dealType,
        contractDate: new Date(),
        exclusiveArea: 59.99,
        floor: 5,
        dealAmount: dealType === DealType.SALE ? 200_000 : null,
        deposit: dealType !== DealType.SALE ? 100_000 : null,
        monthlyRent: dealType === DealType.WOLSE ? 90 : null,
        source: 'test',
        rawHash: createHash('sha256').update(`${prop.id}-${dealType}`).digest('hex'),
      },
    });
  }
  await updatePropertyAggregates([prop.id]);
  return prop.id;
}

beforeAll(async () => {
  await prisma.region.upsert({
    where: { code: REGION },
    update: {},
    create: { code: REGION, sido: '테스트', fullName: '테스트', level: 3, sourceVersion: 'test' },
  });
  centerId = await seedProp('센터단지', 127.0, 37.5);
  neighborId = await seedProp('이웃단지', 127.001, 37.5); // 약 88m
});

afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { propertyId: { in: [centerId, neighborId] } } });
  await prisma.property.deleteMany({ where: { id: { in: [centerId, neighborId] } } });
  await prisma.region.delete({ where: { code: REGION } });
  await prisma.$disconnect();
});

describe('getNearbyProperties 월세 노출', () => {
  it('이웃 단지의 월세 보증금/월세를 반환', async () => {
    const items = await getNearbyProperties({
      propertyId: centerId,
      propertyType: PropertyType.APARTMENT,
    });
    const n = items.find((i) => i.id === String(neighborId));
    expect(n).toBeDefined();
    expect(n!.wolseLastDeposit).toBe(100_000);
    expect(n!.wolseLastRent).toBe(90);
  });
});
