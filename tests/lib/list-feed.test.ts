import { describe, it, expect } from 'vitest';
import { withAdSlots } from '@/lib/property';

describe('withAdSlots', () => {
  it('interval 미만이면 광고 없음', () => {
    const out = withAdSlots([1, 2, 3], 8);
    expect(out).toHaveLength(3);
    expect(out.every((e) => e.type === 'item')).toBe(true);
  });

  it('interval마다 광고 엔트리 1개 삽입', () => {
    const items = Array.from({ length: 16 }, (_, i) => i);
    const out = withAdSlots(items, 8);
    const ads = out.filter((e) => e.type === 'ad');
    expect(ads).toHaveLength(2);
    expect(out[8]).toEqual({ type: 'ad', key: 'ad-8' });
  });

  it('광고 key는 고유', () => {
    const items = Array.from({ length: 24 }, (_, i) => i);
    const keys = withAdSlots(items, 8).filter((e) => e.type === 'ad').map((e) => (e as { key: string }).key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
