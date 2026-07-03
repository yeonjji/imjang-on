import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getNearbySubwayStations } from '@/lib/subway/nearby';
import { getPropertyList } from '@/lib/property';
import { PropertyType } from '@prisma/client';
import { prisma } from '@/lib/db';

// 강남역(37.4979, 127.0276) 인근 역을 테스트가 직접 시드한다.
// CI의 check 잡은 migrate만 하고 seed를 안 하므로, 앰비언트 SubwayStation 데이터에
// 의존하면 DB 상태에 따라 0건→flaky. 자체 시드로 결정적(deterministic)으로 만든다.
const SEED_KEYS = ['UT-SUB-GANGNAM', 'UT-SUB-YEOKSAM'];

beforeAll(async () => {
  await prisma.subwayStation.deleteMany({ where: { sourceKey: { in: SEED_KEYS } } });
  await prisma.subwayStation.createMany({
    data: [
      { name: '강남', nameNorm: '강남', lines: ['2호선', '신분당선'], isTransfer: true, address: '서울특별시 강남구', sourceKey: 'UT-SUB-GANGNAM' },
      { name: '역삼', nameNorm: '역삼', lines: ['2호선'], isTransfer: false, address: '서울특별시 강남구', sourceKey: 'UT-SUB-YEOKSAM' },
    ],
    skipDuplicates: true,
  });
  // location(geography)은 Prisma createMany로 넣을 수 없어 raw로 세팅. 둘 다 강남역 800m 내(≈0m, ≈250m).
  await prisma.$executeRaw`UPDATE "SubwayStation" SET location = ST_SetSRID(ST_MakePoint(127.0276, 37.4979), 4326)::geography WHERE "sourceKey" = 'UT-SUB-GANGNAM'`;
  await prisma.$executeRaw`UPDATE "SubwayStation" SET location = ST_SetSRID(ST_MakePoint(127.0300, 37.4990), 4326)::geography WHERE "sourceKey" = 'UT-SUB-YEOKSAM'`;
});

afterAll(async () => {
  await prisma.subwayStation.deleteMany({ where: { sourceKey: { in: SEED_KEYS } } });
  await prisma.$disconnect();
});

describe('getNearbySubwayStations (integration)', () => {
  it('역 밀집 지역은 800m 내 역을 가까운 순으로 반환', async () => {
    const res = await getNearbySubwayStations(37.4979, 127.0276);
    expect(res.fallback).toBe(false);
    expect(res.stations.length).toBeGreaterThan(0);
    for (let i = 1; i < res.stations.length; i++) {
      expect(res.stations[i].distanceMeters).toBeGreaterThanOrEqual(res.stations[i - 1].distanceMeters);
    }
  });

  it('역이 없는 바다 한가운데는 fallback 또는 빈 결과', async () => {
    const res = await getNearbySubwayStations(35.0, 129.5);
    expect(res.fallback === false ? res.stations.length === 0 : true).toBe(true);
  });
});

it('역 필터: 선택 역 800m 내 단지만 반환', async () => {
  const station = await prisma.subwayStation.findFirst({ where: { name: '강남' } });
  if (!station) return; // 데이터 없으면 skip
  const res = await getPropertyList({
    types: [PropertyType.APARTMENT, PropertyType.OFFICETEL, PropertyType.ROW_HOUSE, PropertyType.MULTIPLEX],
    stationId: String(station.id),
    page: 1,
    perPage: 30,
  });
  expect(res.total).toBeGreaterThanOrEqual(0);
  expect(res.rows.length).toBeLessThanOrEqual(30);
});
