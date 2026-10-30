import { describe, it, expect } from 'vitest';
import { tier, nearbyPoints, filled, listRankOf, tieKey, sum, NEARBY_CAP } from '@/lib/content-score/core';

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
  it('listRankOf: 서울 > 점수 > 섞임 값 순으로 우선', () => {
    // 서울은 최저점이어도 비서울 최고점보다 위
    expect(listRankOf(true, 0, 1n)).toBeGreaterThan(listRankOf(false, 22, 2n));
    // 점수가 1이라도 높으면 섞임 값과 무관하게 위
    for (let i = 1n; i < 200n; i++) expect(listRankOf(false, 8, i)).toBeGreaterThan(listRankOf(false, 7, i + 1n));
  });
  it('tieKey: 0~9999, 같은 id는 항상 같은 값', () => {
    for (let i = 1n; i < 2000n; i++) {
      const k = tieKey(i);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThan(10_000);
      expect(tieKey(i)).toBe(k);
    }
  });
  it('tieKey: 연속 id(=이름순으로 들어온 행)가 섞인다', () => {
    const keys = Array.from({ length: 30 }, (_, i) => tieKey(BigInt(i + 1)));
    const sorted = [...keys].sort((a, b) => a - b);
    expect(keys).not.toEqual(sorted); // 오름차순 아님
    expect(keys).not.toEqual([...sorted].reverse()); // 내림차순도 아님
    // 정렬했을 때 앞 10개 자리에 원래 앞 10개 id가 몰리지 않는다(이름순 앞부분 독점 방지)
    const order = keys.map((k, i) => ({ k, i })).sort((a, b) => b.k - a.k).slice(0, 10).map((x) => x.i);
    expect(order.filter((i) => i < 10).length).toBeLessThan(7);
  });
  it('sum', () => {
    expect(sum({ a: 2, b: 1, c: 0 })).toBe(3);
  });
});
