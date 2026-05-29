import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { parkingDef } from '@/lib/urban/adapters/parking';

const SEED_SOURCE_IDS = ['UT-PRK-1', 'UT-PRK-2', 'UT-PRK-3'];

beforeAll(async () => {
  await prisma.parking.deleteMany({ where: { sourceId: { in: SEED_SOURCE_IDS } } });
  await prisma.parking.createMany({
    data: [
      {
        sourceId: 'UT-PRK-1',
        name: '유닛테스트 마포 공영주차장',
        address: '서울특별시 마포구 신촌로 100',
        rdnmadr: '서울특별시 마포구 신촌로 100',
        prkplceSe: '공영',
        prkplceType: '노외',
        chargeInfo: '유료',
        feedingSe: '유료',
        prkcmprt: 120,
        weekdayOpenHhmm: '0000',
        weekdayCloseHhmm: '2400',
        satOpenHhmm: '0000',
        satCloseHhmm: '2400',
        holidayOpenHhmm: '0000',
        holidayCloseHhmm: '2400',
        basicTime: 30,
        basicCharge: 500,
        addUnitTime: 10,
        addUnitCharge: 200,
        pwdbsPpkZoneYn: true,
      },
      {
        sourceId: 'UT-PRK-2',
        name: '유닛테스트 마포 사설',
        address: '서울특별시 마포구 마포대로 5',
        rdnmadr: '서울특별시 마포구 마포대로 5',
        prkplceSe: '민영',
        prkplceType: '노상',
        chargeInfo: '무료',
        feedingSe: '무료',
        prkcmprt: 20,
        pwdbsPpkZoneYn: false,
      },
      {
        sourceId: 'UT-PRK-3',
        name: '유닛테스트 강남 부설',
        address: '서울특별시 강남구 테헤란로 1',
        rdnmadr: '서울특별시 강남구 테헤란로 1',
        prkplceSe: '민영',
        prkplceType: '부설',
        chargeInfo: '유료',
        prkcmprt: 50,
      },
    ],
    skipDuplicates: true,
  });
});

afterAll(async () => {
  await prisma.parking.deleteMany({ where: { sourceId: { in: SEED_SOURCE_IDS } } });
  await prisma.$disconnect();
});

describe('parkingDef.getList filters', () => {
  it('filters by sido prefix (서울)', async () => {
    const r = await parkingDef.getList({ sido: '서울', q: '유닛테스트' }, 1);
    expect(r.rows.length).toBe(3);
    expect(r.rows.every((it) => it.address.startsWith('서울'))).toBe(true);
  });

  it('filters by prkplceSe via sub', async () => {
    const r = await parkingDef.getList({ sido: '서울', sub: '공영', q: '유닛테스트' }, 1);
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].name).toContain('공영');
  });

  it('filters by chargeInfo (무료)', async () => {
    const r = await parkingDef.getList({ sido: '서울', charge: '무료', q: '유닛테스트' }, 1);
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].name).toContain('사설');
  });

  it('filters by 24시간 (open24)', async () => {
    const r = await parkingDef.getList({ sido: '서울', open24: 'on', q: '유닛테스트' }, 1);
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].name).toContain('공영');
  });

  it('filters by prkplceType', async () => {
    const r = await parkingDef.getList({ sido: '서울', type: '부설', q: '유닛테스트' }, 1);
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].name).toContain('부설');
  });

  it('filters by pwd checkbox', async () => {
    const r = await parkingDef.getList({ sido: '서울', pwd: 'on', q: '유닛테스트' }, 1);
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].name).toContain('공영');
  });

  it('filters by name q (contains)', async () => {
    const r = await parkingDef.getList({ sido: '서울', q: '사설' }, 1);
    expect(r.rows.length).toBeGreaterThanOrEqual(1);
    expect(r.rows.every((it) => it.name.includes('사설'))).toBe(true);
  });
});
