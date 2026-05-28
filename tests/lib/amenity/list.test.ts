import { describe, it, expect } from 'vitest';
import { normalizePage } from '@/lib/amenity/list';

describe('normalizePage', () => {
  it('1 미만은 1', () => {
    expect(normalizePage('0')).toBe(1);
    expect(normalizePage('-5')).toBe(1);
    expect(normalizePage(undefined)).toBe(1);
    expect(normalizePage('abc')).toBe(1);
  });
  it('숫자 그대로', () => {
    expect(normalizePage('3')).toBe(3);
    expect(normalizePage('1')).toBe(1);
  });
});
