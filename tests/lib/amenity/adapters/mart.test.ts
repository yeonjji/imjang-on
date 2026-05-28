import { describe, it, expect } from 'vitest';
import { buildMartWhere } from '@/lib/amenity/adapters/mart';

describe('mart adapter — buildMartWhere', () => {
  it('sub=all (또는 미지정) — G20404 + G20402 OR', () => {
    expect(buildMartWhere({ sigunguCode: '11680' })).toEqual({
      sigunguCode: '11680',
      OR: [{ industryCode: { startsWith: 'G20404' } }, { industryCode: { startsWith: 'G20402' } }],
    });
    expect(buildMartWhere({ sigunguCode: '11680', sub: 'all' })).toEqual({
      sigunguCode: '11680',
      OR: [{ industryCode: { startsWith: 'G20404' } }, { industryCode: { startsWith: 'G20402' } }],
    });
  });

  it('sub=super — G20404만', () => {
    expect(buildMartWhere({ sigunguCode: '11680', sub: 'super' })).toEqual({
      sigunguCode: '11680',
      industryCode: { startsWith: 'G20404' },
    });
  });

  it('sub=hyper — G20402만', () => {
    expect(buildMartWhere({ sigunguCode: '11680', sub: 'hyper' })).toEqual({
      sigunguCode: '11680',
      industryCode: { startsWith: 'G20402' },
    });
  });

  it('잘못된 sub 값은 all로 fallback', () => {
    expect(buildMartWhere({ sigunguCode: '11680', sub: 'unknown' })).toEqual({
      sigunguCode: '11680',
      OR: [{ industryCode: { startsWith: 'G20404' } }, { industryCode: { startsWith: 'G20402' } }],
    });
  });

  it('검색 q는 contains', () => {
    expect(buildMartWhere({ sigunguCode: '11680', sub: 'hyper', q: '이마트' })).toEqual({
      sigunguCode: '11680',
      industryCode: { startsWith: 'G20402' },
      name: { contains: '이마트' },
    });
  });
});
