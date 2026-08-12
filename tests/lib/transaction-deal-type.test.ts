import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { PropertyType, DealType } from '@prisma/client';
import { createHash } from 'node:crypto';
import { getUnifiedTransactions } from '@/lib/transaction';

const REGION = '9999999999'; // VarChar(10)
const SIGUNGU = '99999'; // VarChar(5)
let propId: bigint;

beforeAll(async () => {
  await prisma.region.upsert({
    where: { code: REGION },
    update: {},
    create: { code: REGION, sido: '테스트', fullName: '테스트', level: 3, sourceVersion: 'test' },
  });
  const prop = await prisma.property.create({
    data: {
      propertyType: PropertyType.APARTMENT,
      name: '탭테스트',
      nameNorm: '탭테스트',
      regionCode: REGION,
      address: '테스트 주소',
    },
  });
  propId = prop.id;

  const mk = (dealType: DealType, i: number) => ({
    propertyId: propId,
    propertyType: PropertyType.APARTMENT,
    regionCode: REGION,
    sigunguCode: SIGUNGU,
    dealType,
    contractDate: new Date(2026, 0, i + 1),
    exclusiveArea: 59.99,
    floor: 5,
    dealAmount: dealType === DealType.SALE ? 100_000 + i : null,
    deposit: dealType !== DealType.SALE ? 50_000 : null,
    monthlyRent: dealType === DealType.WOLSE ? 80 : null,
    source: 'test',
    rawHash: createHash('sha256').update(`${propId}-${dealType}-${i}`).digest('hex'),
  });

  await prisma.transaction.createMany({
    data: [
      mk(DealType.SALE, 0),
      mk(DealType.SALE, 1),
      mk(DealType.SALE, 2),
      mk(DealType.JEONSE, 3),
      mk(DealType.JEONSE, 4),
      mk(DealType.WOLSE, 5),
    ],
  });
});

afterAll(async () => {
  // propId 대신 sentinel sigunguCode로 지운다 — beforeAll이 propId 대입 전에 던지면
  // propertyId: undefined가 조건 없는 deleteMany가 되어 Transaction 테이블 전체가 날아간다.
  await prisma.transaction.deleteMany({ where: { sigunguCode: SIGUNGU } });
  await prisma.property.delete({ where: { id: propId } });
  await prisma.region.delete({ where: { code: REGION } });
  await prisma.$disconnect();
});

describe('getUnifiedTransactions dealType 필터', () => {
  it('dealType 미지정 시 전체 6건 반환', async () => {
    const r = await getUnifiedTransactions(propId, { page: 1, perPage: 15 });
    expect(r.totalCount).toBe(6);
  });

  it('SALE 필터 시 매매 3건만 반환', async () => {
    const r = await getUnifiedTransactions(propId, { page: 1, perPage: 15, dealType: DealType.SALE });
    expect(r.totalCount).toBe(3);
    expect(r.rows.every((row) => row.dealType === 'SALE')).toBe(true);
  });

  it('JEONSE 필터 시 전세 2건만 반환', async () => {
    const r = await getUnifiedTransactions(propId, { page: 1, perPage: 15, dealType: DealType.JEONSE });
    expect(r.totalCount).toBe(2);
    expect(r.rows.every((row) => row.dealType === 'JEONSE')).toBe(true);
  });

  it('WOLSE 필터 시 월세 1건 + monthlyRent 반환', async () => {
    const r = await getUnifiedTransactions(propId, { page: 1, perPage: 15, dealType: DealType.WOLSE });
    expect(r.totalCount).toBe(1);
    expect(r.rows[0].dealType).toBe('WOLSE');
    expect(r.rows[0].monthlyRent).toBe(80);
  });
});
