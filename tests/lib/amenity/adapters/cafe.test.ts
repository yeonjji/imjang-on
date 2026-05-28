import { describe, it, expect } from 'vitest';
import { buildCafeWhere } from '@/lib/amenity/adapters/cafe';

describe('cafe adapter — buildCafeWhere', () => {
  it('시군구 없으면 prefix만', () => {
    expect(buildCafeWhere({})).toEqual({ industryCode: { startsWith: 'I21201' } });
  });
  it('시군구 + 검색 조합', () => {
    expect(buildCafeWhere({ sigunguCode: '11680', q: '스타벅스' })).toEqual({
      sigunguCode: '11680',
      industryCode: { startsWith: 'I21201' },
      name: { contains: '스타벅스' },
    });
  });
});
