import { describe, it, expect } from 'vitest';
import { paginate, parsePageParam } from '@/lib/pagination';

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
