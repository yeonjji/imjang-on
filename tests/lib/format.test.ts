import { describe, it, expect } from 'vitest';
import { formatBillion, formatArea, formatDate, formatPyeong, sqmToPyeong, formatStatCount, formatReceiptPeriodShort } from '@/lib/format';

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

  it('만원 단위 소수는 반올림한다 (매매-전세 갭 등 평균 차이 계산값)', () => {
    expect(formatBillion(3766.667)).toBe('3,767만원');
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

describe('formatStatCount (큰 카운트 → "N만+" 표기)', () => {
  it.each([
    [256_000, '25.6만+'],
    [160_000, '16만+'],
    [10_000, '1만+'],
    [12_345, '1.2만+'],
    [5_000, '5,000+'],
  ])('formats %s → %s', (input, expected) => {
    expect(formatStatCount(input as number)).toBe(expected);
  });
});

const RD = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('formatReceiptPeriodShort', () => {
  it('시작·마감을 MM.DD~MM.DD로 표기', () => {
    expect(formatReceiptPeriodShort(RD('2026-06-10'), RD('2026-06-16'))).toBe('06.10~06.16');
  });
  it('둘 다 없으면 일정 미정', () => {
    expect(formatReceiptPeriodShort(null, null)).toBe('일정 미정');
  });
  it('시작만 없으면 -~MM.DD', () => {
    expect(formatReceiptPeriodShort(null, RD('2026-06-16'))).toBe('-~06.16');
  });
  it('마감만 없으면 MM.DD~-', () => {
    expect(formatReceiptPeriodShort(RD('2026-06-10'), null)).toBe('06.10~-');
  });
});
