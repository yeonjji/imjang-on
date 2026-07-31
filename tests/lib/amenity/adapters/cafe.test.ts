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
      AND: [{ OR: [{ name: { contains: '스타벅스' } }, { branchName: { contains: '스타벅스' } }] }],
    });
  });

  it('sido 만 있으면 prefix startsWith', () => {
    expect(buildCafeWhere({ sido: '서울' })).toEqual({
      industryCode: { startsWith: 'I21201' },
      sigunguCode: { startsWith: '11' },
    });
  });

  it('sigunguCode 가 있으면 sido 는 무시', () => {
    expect(buildCafeWhere({ sido: '서울', sigunguCode: '26110' })).toEqual({
      industryCode: { startsWith: 'I21201' },
      sigunguCode: '26110',
    });
  });

  it('미존재 시도명은 무시 (전국 fallback)', () => {
    expect(buildCafeWhere({ sido: '존재하지않음' })).toEqual({
      industryCode: { startsWith: 'I21201' },
    });
  });
});
