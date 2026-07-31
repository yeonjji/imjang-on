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

  it('이름 검색은 name·branchName OR을 AND로 합성', () => {
    expect(buildStoreWhere({ sigunguCode: '11680', q: 'CU' })).toEqual({
      sigunguCode: '11680',
      industryCode: { startsWith: 'G20405' },
      AND: [{ OR: [{ name: { contains: 'CU' } }, { branchName: { contains: 'CU' } }] }],
    });
  });

  it('sub 값은 무시 (convenience는 subFilters 없음)', () => {
    expect(buildStoreWhere({ sigunguCode: '11680', sub: 'whatever' })).toEqual({
      sigunguCode: '11680',
      industryCode: { startsWith: 'G20405' },
    });
  });

  it('sido 만 있으면 prefix startsWith', () => {
    expect(buildStoreWhere({ sido: '서울' })).toEqual({
      industryCode: { startsWith: 'G20405' },
      sigunguCode: { startsWith: '11' },
    });
  });

  it('sigunguCode 가 있으면 sido 는 무시', () => {
    expect(buildStoreWhere({ sido: '서울', sigunguCode: '26110' })).toEqual({
      industryCode: { startsWith: 'G20405' },
      sigunguCode: '26110',
    });
  });

  it('미존재 시도명은 무시 (전국 fallback)', () => {
    expect(buildStoreWhere({ sido: '존재하지않음' })).toEqual({
      industryCode: { startsWith: 'G20405' },
    });
  });
});
