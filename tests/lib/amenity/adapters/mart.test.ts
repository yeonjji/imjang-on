import { describe, it, expect } from 'vitest';
import { buildMartWhere, buildByIdWhere } from '@/lib/amenity/adapters/mart';

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

  it('검색 q는 name·branchName OR을 AND로 합성', () => {
    expect(buildMartWhere({ sigunguCode: '11680', sub: 'hyper', q: '이마트' })).toEqual({
      sigunguCode: '11680',
      industryCode: { startsWith: 'G20402' },
      AND: [{ OR: [{ name: { contains: '이마트' } }, { branchName: { contains: '이마트' } }] }],
    });
  });

  it('sido 만 있을 때 sigunguCode prefix + 마트 OR', () => {
    expect(buildMartWhere({ sido: '서울' })).toEqual({
      sigunguCode: { startsWith: '11' },
      OR: [
        { industryCode: { startsWith: 'G20404' } },
        { industryCode: { startsWith: 'G20402' } },
      ],
    });
  });

  it('sigunguCode 가 있으면 sido 는 무시', () => {
    expect(buildMartWhere({ sigunguCode: '11680', sido: '서울' })).toEqual({
      sigunguCode: '11680',
      OR: [
        { industryCode: { startsWith: 'G20404' } },
        { industryCode: { startsWith: 'G20402' } },
      ],
    });
  });

  it('sub=hyper + sido', () => {
    expect(buildMartWhere({ sido: '서울', sub: 'hyper' })).toEqual({
      sigunguCode: { startsWith: '11' },
      industryCode: { startsWith: 'G20402' },
    });
  });
});

describe('mart adapter — buildByIdWhere', () => {
  it('상세 조회는 슈퍼·대형마트만 허용한다 (편의점 G20405 제외)', () => {
    expect(buildByIdWhere(7n)).toEqual({
      id: 7n,
      OR: [
        { industryCode: { startsWith: 'G20404' } },
        { industryCode: { startsWith: 'G20402' } },
      ],
    });
  });
});
