import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { PropertyType } from '@prisma/client';
import { getMaintenanceCostView } from '@/lib/maintenance-cost-query';

const REGION_CODE = '1171000000';
const SGG = '11710';
const CODE = 'UT-MCQ-1';
let propertyId: bigint;
let bareId: bigint;

const amounts = { labor: 40_000_000n, cleaning: 30_000_000n, commonTotal: 70_000_000n, electricity: 50_000_000n, ltrLevy: 10_000_000n };

async function cleanup() {
  await prisma.aptMaintenanceCost.deleteMany({ where: { kaptCode: CODE } });
  await prisma.aptMaintenanceCostStat.deleteMany({ where: { sigunguCode: SGG, yearMonth: '202608' } });
  await prisma.aptComplex.deleteMany({ where: { kaptCode: CODE } });
  await prisma.property.deleteMany({ where: { name: { startsWith: 'UT-MCQ' } } });
}

beforeAll(async () => {
  await cleanup();
  await prisma.region.upsert({
    where: { code: REGION_CODE },
    create: { code: REGION_CODE, sido: '서울특별시', sigungu: '송파구', fullName: '서울특별시 송파구', level: 2, sourceVersion: 'test' },
    update: {},
  });
  const p = await prisma.property.create({ data: { propertyType: PropertyType.APARTMENT, name: 'UT-MCQ-A', nameNorm: 'ut-mcq-a', regionCode: REGION_CODE, address: '서울' } });
  const bare = await prisma.property.create({ data: { propertyType: PropertyType.APARTMENT, name: 'UT-MCQ-B', nameNorm: 'ut-mcq-b', regionCode: REGION_CODE, address: '서울' } });
  propertyId = p.id;
  bareId = bare.id;
  await prisma.aptComplex.create({
    data: { kaptCode: CODE, kaptName: CODE, nameNorm: 'ut-mcq-1', bjdCode: REGION_CODE, sigunguCode: SGG, propertyId, households: 100, heatType: '지역난방', rawJson: { kaptMarea: '10000' } },
  });
  const base = { kaptCode: CODE, raw: {}, fetchedAt: new Date('2026-10-15T00:00:00Z') };
  await prisma.aptMaintenanceCost.create({ data: { ...base, yearMonth: '202608', complete: true, ...amounts } });
  // 불완전 행은 더 최신이어도 쓰지 않는다
  await prisma.aptMaintenanceCost.create({ data: { ...base, yearMonth: '202609', complete: false, ...amounts, commonTotal: 999_000_000n } });
  await prisma.aptMaintenanceCostStat.create({ data: { sigunguCode: SGG, yearMonth: '202608', medianCommonPerM2: 7000, sampleCount: 12, computedAt: new Date() } });
});
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('getMaintenanceCostView', () => {
  it('complete 행 중 최신 월과 그 달 구 통계로 표시 모델을 만든다', async () => {
    const v = (await getMaintenanceCostView(propertyId, '송파구'))!;
    expect(v.yearMonth).toBe('202608');
    expect(v.commonPerM2).toBe(7000);
    expect(v.comparison).toEqual({ sigunguName: '송파구', pct: 0, label: '비슷함', sampleCount: 12, medianPerM2: 7000 });
    expect(v.commonAmount).toBe(700_000);
  });
  it('연결된 단지가 없으면 null', async () => {
    expect(await getMaintenanceCostView(bareId, '송파구')).toBeNull();
  });
});
