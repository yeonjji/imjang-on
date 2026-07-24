import { describe, it, expect } from 'vitest';
import { haversineMeters, pickRedirectTarget } from '@/scripts/ops/property-redirect-match';

describe('haversineMeters', () => {
  it('같은 좌표는 0', () => {
    expect(haversineMeters(37.5, 127.0, 37.5, 127.0)).toBe(0);
  });
  it('서울시청~강남역 ~8km 근사', () => {
    const d = haversineMeters(37.5665, 126.978, 37.4979, 127.0276);
    expect(d).toBeGreaterThan(7000);
    expect(d).toBeLessThan(10000);
  });
});

describe('pickRedirectTarget', () => {
  it('후보 0개 → null', () => {
    expect(pickRedirectTarget({ lat: 37.5, lng: 127 }, [])).toBeNull();
  });
  it('후보 1개 → 그 id (좌표 무관)', () => {
    expect(pickRedirectTarget({ lat: null, lng: null }, [{ id: 42n, lat: 37.5, lng: 127 }])).toBe(42n);
  });
  it('여러 후보 → 가장 가까운 것', () => {
    const got = pickRedirectTarget({ lat: 37.5, lng: 127.0 }, [
      { id: 1n, lat: 37.6, lng: 127.1 }, // 멀다
      { id: 2n, lat: 37.5005, lng: 127.0005 }, // 가깝다
    ]);
    expect(got).toBe(2n);
  });
  it('여러 후보인데 구 좌표 없음 → 모호 → null', () => {
    expect(
      pickRedirectTarget({ lat: null, lng: null }, [
        { id: 1n, lat: 37.5, lng: 127 },
        { id: 2n, lat: 37.6, lng: 127 },
      ]),
    ).toBeNull();
  });
  it('가장 가까운 것도 임계(500m) 초과 → null', () => {
    expect(
      pickRedirectTarget({ lat: 37.5, lng: 127 }, [
        { id: 1n, lat: 38.0, lng: 127 },
        { id: 2n, lat: 37.9, lng: 127 },
      ]),
    ).toBeNull();
  });
});
