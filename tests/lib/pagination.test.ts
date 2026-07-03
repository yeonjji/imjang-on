import { describe, it, expect } from 'vitest';
import { buildPager, paginate, parsePageParam } from '@/lib/pagination';

describe('buildPager', () => {
  it('총 페이지가 윈도우 이하이면 모든 번호 노출, 빠른 이동 없음', () => {
    const p = buildPager(3, 5);
    expect(p.pages).toEqual([1, 2, 3, 4, 5]);
    expect(p.first).toBe(false);
    expect(p.prev10).toBeNull();
    expect(p.next10).toBeNull();
    expect(p.last).toBeNull();
  });

  it('번호 윈도우는 최대 5개이며 연속·범위 내', () => {
    const p = buildPager(50, 2389);
    expect(p.pages).toEqual([48, 49, 50, 51, 52]);
  });

  it('초반 페이지: 후방 빠른 이동 없음, 전방은 노출', () => {
    const p = buildPager(2, 2389);
    expect(p.pages).toEqual([1, 2, 3, 4, 5]);
    expect(p.first).toBe(false);
    expect(p.prev10).toBeNull();
    expect(p.next10).toBe(12);
    expect(p.last).toBe(2389);
  });

  it('깊은 페이지: 양방향 빠른 이동 노출 + clamp', () => {
    const p = buildPager(50, 2389);
    expect(p.first).toBe(true);
    expect(p.prev10).toBe(40);
    expect(p.next10).toBe(60);
    expect(p.last).toBe(2389);
  });

  it('마지막 페이지: 전방 빠른 이동/마지막 숨김, 후방은 노출', () => {
    const p = buildPager(2389, 2389);
    expect(p.pages).toEqual([2385, 2386, 2387, 2388, 2389]);
    expect(p.first).toBe(true);
    expect(p.prev10).toBe(2379);
    expect(p.next10).toBeNull();
    expect(p.last).toBeNull();
  });

  it('prev10은 current>11일 때만, next10은 total로 clamp', () => {
    expect(buildPager(11, 2389).prev10).toBeNull();
    expect(buildPager(12, 2389).prev10).toBe(2);
    expect(buildPager(2385, 2389).next10).toBe(2389);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => i); // 0..24

  it('1페이지는 앞에서 perPage개', () => {
    const r = paginate(items, 1, 20);
    expect(r.pageItems).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(r.total).toBe(25);
    expect(r.totalPages).toBe(2);
    expect(r.safePage).toBe(1);
  });

  it('마지막 페이지는 나머지만', () => {
    const r = paginate(items, 2, 20);
    expect(r.pageItems).toEqual([20, 21, 22, 23, 24]);
    expect(r.safePage).toBe(2);
  });

  it('totalPages 초과 page는 마지막으로 클램프', () => {
    const r = paginate(items, 99, 20);
    expect(r.safePage).toBe(2);
    expect(r.pageItems).toEqual([20, 21, 22, 23, 24]);
  });

  it('page <= 0 / NaN 은 1로', () => {
    expect(paginate(items, 0, 20).safePage).toBe(1);
    expect(paginate(items, -5, 20).safePage).toBe(1);
    expect(paginate(items, Number.NaN, 20).safePage).toBe(1);
  });

  it('빈 배열 → totalPages 1, 항목 없음', () => {
    const r = paginate([], 1, 20);
    expect(r.total).toBe(0);
    expect(r.totalPages).toBe(1);
    expect(r.pageItems).toEqual([]);
    expect(r.safePage).toBe(1);
  });
});

describe('parsePageParam', () => {
  it.each([
    ['?page=3', 3],
    ['?page=1', 1],
    ['', 1],
    ['?page=0', 1],
    ['?page=-2', 1],
    ['?page=abc', 1],
    ['?page=2.5', 1],
    ['?foo=bar', 1],
    ['?page=2&usage=jeonse', 2],
  ])('%s → %s', (search, expected) => {
    expect(parsePageParam(search as string)).toBe(expected);
  });
});
