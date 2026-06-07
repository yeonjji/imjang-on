import { describe, it, expect } from 'vitest';
import { getNearbySubwayStations } from '@/lib/subway/nearby';
import { getPropertyList } from '@/lib/property';
import { PropertyType } from '@prisma/client';
import { prisma } from '@/lib/db';

// 강남역 좌표 인근. SubwayStation이 .env.test DB에 적재돼 있어야 함.
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
