import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { PropertyType } from '@prisma/client';
import { getBuildingRegisterView } from '@/lib/building-register-query';

const REGION_CODE = '1171000000';
let matchedId: bigint;
let rejectedId: bigint;

beforeAll(async () => {
  await prisma.property.deleteMany({ where: { name: { startsWith: 'UT-BRQ' } } });
  await prisma.region.upsert({ where: { code: REGION_CODE }, update: {}, create: { code: REGION_CODE, sido: '서울특별시', sigungu: '송파구', fullName: '서울특별시 송파구', level: 2, sourceVersion: 'ut' } });
  const a = await prisma.property.create({ data: { propertyType: PropertyType.MULTIPLEX, name: 'UT-BRQ-A', nameNorm: 'ut-brq-a', regionCode: REGION_CODE, address: 'x' } });
  const b = await prisma.property.create({ data: { propertyType: PropertyType.MULTIPLEX, name: 'UT-BRQ-B', nameNorm: 'ut-brq-b', regionCode: REGION_CODE, address: 'x' } });
  matchedId = a.id; rejectedId = b.id;
  const now = new Date('2026-10-20T03:00:00Z');
  await prisma.buildingRegister.create({ data: { propertyId: matchedId, status: 'matched', groundFloors: 6, households: 14, parkingTotal: 12, bcRat: 59.8, vlRat: 187.33, seismicApplied: 1, hasNeighborhoodFacility: true, fetchedAt: now } });
  await prisma.buildingRegister.create({ data: { propertyId: rejectedId, status: 'year_mismatch', groundFloors: 6, fetchedAt: now } });
});
afterAll(async () => {
  await prisma.buildingRegister.deleteMany({ where: { propertyId: { in: [matchedId, rejectedId] } } });
  await prisma.property.deleteMany({ where: { name: { startsWith: 'UT-BRQ' } } });
  await prisma.$disconnect();
});

describe('getBuildingRegisterView', () => {
  it('matched 행만 표시 모델로', async () => {
    const v = (await getBuildingRegisterView(matchedId, 'MULTIPLEX', new Date('2026-10-20T00:00:00Z')))!;
    expect(v.tiles.find((t) => t.label === '용적률')!.value).toBe('187.33%');
    expect(v.neighborhoodNotice).toBe(true);
  });
  it('채택되지 않은 단지는 null', async () => {
    expect(await getBuildingRegisterView(rejectedId, 'MULTIPLEX', new Date())).toBeNull();
  });
});
