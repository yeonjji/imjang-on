import { describe, it, expect } from 'vitest';
import { buildStoreWhere } from '@/lib/amenity/adapters/convenience';

describe('convenience adapter — buildStoreWhere', () => {
  it('시군구 없으면 prefix만', () => {
    expect(buildStoreWhere({})).toEqual({
      industryCode: { startsWith: 'G20405' },
    });
  });

  it('시군구 있으면 sigunguCode + prefix', () => {
    expect(buildStoreWhere({ sigunguCode: '11680' })).toEqual({
      sigunguCode: '11680',
      industryCode: { startsWith: 'G20405' },
    });
  });

  it('이름 검색은 contains', () => {
    expect(buildStoreWhere({ sigunguCode: '11680', q: 'CU' })).toEqual({
      sigunguCode: '11680',
      industryCode: { startsWith: 'G20405' },
      name: { contains: 'CU' },
    });
  });

  it('sub 값은 무시 (convenience는 subFilters 없음)', () => {
    expect(buildStoreWhere({ sigunguCode: '11680', sub: 'whatever' })).toEqual({
      sigunguCode: '11680',
      industryCode: { startsWith: 'G20405' },
    });
  });
});
