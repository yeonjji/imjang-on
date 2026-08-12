import { describe, it, expect } from 'vitest';
import { computeSigunguMedians, MIN_SAMPLE, SIGUNGU_MEDIAN_KEY } from '@/lib/subscription/median-snapshot';

describe('시군구 중위가 스냅샷', () => {
  it('스냅샷 키는 DashboardSnapshot.key 길이 제한(40) 안이다', () => {
    expect(SIGUNGU_MEDIAN_KEY.length).toBeLessThanOrEqual(40);
  });
  it('표본 하한은 30이다', () => {
    expect(MIN_SAMPLE).toBe(30);
  });
  it('빈 데이터에서도 던지지 않고 객체를 돌려준다', async () => {
    const r = await computeSigunguMedians();
    expect(typeof r).toBe('object');
    for (const v of Object.values(r)) {
      expect(v.count).toBeGreaterThanOrEqual(MIN_SAMPLE);
      expect(Number.isFinite(v.median)).toBe(true);
    }
  });
});
