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
});
