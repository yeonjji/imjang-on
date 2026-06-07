import { describe, it, expect } from 'vitest';
import { getNearbySubwayStations } from '@/lib/subway/nearby';

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
