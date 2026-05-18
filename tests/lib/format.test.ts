import { describe, it, expect } from 'vitest';
import { formatBillion, formatArea, formatDate, formatPyeong, sqmToPyeong } from '@/lib/format';

describe('formatBillion (만원 → 한국식 표기)', () => {
  it.each([
    [125_000, '12.5억'],
    [10_000, '1억'],
    [99_999, '9.99억'],
    [500, '500만원'],
    [0, '0만원'],
    [null, '-'],
  ])('formats %s → %s', (input, expected) => {
    expect(formatBillion(input as number | null)).toBe(expected);
  });
});

describe('sqmToPyeong', () => {
  it('converts 84.99 m² to 25.7 평', () => {
    expect(sqmToPyeong(84.99)).toBeCloseTo(25.71, 1);
  });
});

describe('formatArea', () => {
  it('formats sqm only', () => {
    expect(formatArea(84.99, 'sqm')).toBe('84.99㎡');
  });
  it('formats pyeong with 1 decimal', () => {
    expect(formatArea(84.99, 'pyeong')).toBe('25.7평');
  });
});

describe('formatDate', () => {
  it('formats Date to YYYY-MM-DD', () => {
    expect(formatDate(new Date('2026-04-12T00:00:00Z'))).toBe('2026-04-12');
  });
  it('returns "-" for null', () => {
    expect(formatDate(null)).toBe('-');
  });
});
