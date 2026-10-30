import { describe, it, expect } from 'vitest';
import { tier, nearbyPoints, filled, listRankOf, sum, NEARBY_CAP } from '@/lib/content-score/core';

describe('content-score core', () => {
  it('tier: 하한을 넘은 개수', () => {
    expect(tier(0, [1, 4])).toBe(0);
    expect(tier(1, [1, 4])).toBe(1);
    expect(tier(3, [1, 4])).toBe(1);
    expect(tier(4, [1, 4])).toBe(2);
    expect(tier(null, [1, 4])).toBe(0);
    expect(tier(undefined, [2, 5, 10])).toBe(0);
  });
  it('nearbyPoints: 최대 2', () => {
    expect(NEARBY_CAP).toBe(2);
    expect(nearbyPoints([])).toBe(0);
    expect(nearbyPoints([true, false])).toBe(1);
    expect(nearbyPoints([true, true, true, true])).toBe(2);
  });
  it('filled: 빈 값·하이픈은 false', () => {
    expect(filled(null)).toBe(false);
    expect(filled(undefined)).toBe(false);
    expect(filled('')).toBe(false);
    expect(filled('  ')).toBe(false);
    expect(filled('-')).toBe(false);
    expect(filled('02-123')).toBe(true);
    expect(filled(0)).toBe(true);
  });
  it('listRankOf: 서울이 항상 위', () => {
    expect(listRankOf(true, 0)).toBeGreaterThan(listRankOf(false, 22));
    expect(listRankOf(false, 7)).toBe(7);
    expect(listRankOf(true, 7)).toBe(10007);
  });
  it('sum', () => {
    expect(sum({ a: 2, b: 1, c: 0 })).toBe(3);
  });
});
