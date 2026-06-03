import { describe, it, expect } from 'vitest';
import { formatNearbyPrice, type NearbyProperty } from '@/lib/nearby';

const base: NearbyProperty = {
  id: '1',
  name: '단지',
  address: '주소',
  region: '서울',
  distKm: 0.1,
  saleLastPrice: 120_000,
  jeonseLastDeposit: 70_000,
  wolseLastDeposit: 5_000,
  wolseLastRent: 90,
};

describe('formatNearbyPrice', () => {
  it('SALE 탭: 매매가만', () => {
    expect(formatNearbyPrice(base, 'SALE')).toBe('12억');
  });

  it('JEONSE 탭: 전세가만', () => {
    expect(formatNearbyPrice(base, 'JEONSE')).toBe('7억');
  });

  it('WOLSE 탭: 보증금/월세', () => {
    expect(formatNearbyPrice(base, 'WOLSE')).toBe('보 5,000만원 / 월 90만');
  });

  it('ALL 탭: 세 유형 모두', () => {
    expect(formatNearbyPrice(base, 'ALL')).toBe('매매 12억 · 전세 7억 · 월세 보 5,000만원 / 월 90만');
  });

  it('데이터 없으면 해당 자리에 -', () => {
    const empty: NearbyProperty = {
      ...base,
      saleLastPrice: null,
      jeonseLastDeposit: null,
      wolseLastDeposit: null,
      wolseLastRent: null,
    };
    expect(formatNearbyPrice(empty, 'SALE')).toBe('-');
    expect(formatNearbyPrice(empty, 'JEONSE')).toBe('-');
    expect(formatNearbyPrice(empty, 'WOLSE')).toBe('-');
    expect(formatNearbyPrice(empty, 'ALL')).toBe('매매 - · 전세 - · 월세 -');
  });
});
