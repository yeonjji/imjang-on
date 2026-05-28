import { describe, it, expect } from 'vitest';
import { buildMarketWhere, classifyMarketSub } from '@/lib/amenity/adapters/market';

describe('classifyMarketSub', () => {
  it('상설시장은 permanent', () => {
    expect(classifyMarketSub('상설시장')).toBe('permanent');
  });
  it('5일장/정기시장은 periodic', () => {
    expect(classifyMarketSub('정기시장')).toBe('periodic');
    expect(classifyMarketSub('5일장')).toBe('periodic');
  });
  it('빈/미상은 unknown', () => {
    expect(classifyMarketSub(null)).toBe('unknown');
    expect(classifyMarketSub('')).toBe('unknown');
  });
  it("상설장+N일장 같은 하이브리드는 '상설' 우선이라 permanent", () => {
    expect(classifyMarketSub('상설장+5일장')).toBe('permanent');
    expect(classifyMarketSub('상설장+3일장')).toBe('permanent');
  });
});

describe('market adapter — buildMarketWhere', () => {
  it('시군구만', () => {
    expect(buildMarketWhere({ sigunguCode: '11680' })).toEqual({ sigunguCode: '11680' });
  });
  it('sub=permanent — marketType contains 상설', () => {
    expect(buildMarketWhere({ sigunguCode: '11680', sub: 'permanent' })).toEqual({
      sigunguCode: '11680',
      marketType: { contains: '상설' },
    });
  });
  it('sub=periodic — marketType OR (정기|일장)', () => {
    expect(buildMarketWhere({ sigunguCode: '11680', sub: 'periodic' })).toEqual({
      sigunguCode: '11680',
      OR: [
        { marketType: { contains: '정기' } },
        { marketType: { contains: '일장' } },
      ],
    });
  });
  it('sub=all — marketType 조건 없음', () => {
    expect(buildMarketWhere({ sigunguCode: '11680', sub: 'all' })).toEqual({ sigunguCode: '11680' });
  });
  it('검색 q', () => {
    expect(buildMarketWhere({ sigunguCode: '11680', q: '강남' })).toEqual({
      sigunguCode: '11680',
      name: { contains: '강남' },
    });
  });
  it('시군구 미지정 LIST는 sigunguCode 있는 row만', () => {
    expect(buildMarketWhere({})).toEqual({
      sigunguCode: { not: null },
    });
    expect(buildMarketWhere({ q: '강남' })).toEqual({
      sigunguCode: { not: null },
      name: { contains: '강남' },
    });
  });
});
