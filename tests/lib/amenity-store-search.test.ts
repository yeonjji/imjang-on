import { describe, it, expect } from 'vitest';
import { applyStoreNameSearch } from '@/lib/amenity/_shared';
import { buildMartWhere } from '@/lib/amenity/adapters/mart';
import { buildStoreWhere } from '@/lib/amenity/adapters/convenience';
import type { Prisma } from '@prisma/client';

describe('applyStoreNameSearch', () => {
  it('q가 없으면 where를 건드리지 않는다', () => {
    const where: Prisma.StoreWhereInput = { sigunguCode: '11140' };
    applyStoreNameSearch(where, undefined);
    expect(where).toEqual({ sigunguCode: '11140' });
  });

  it('name과 branchName 중 하나만 맞아도 걸리게 한다', () => {
    const where: Prisma.StoreWhereInput = {};
    applyStoreNameSearch(where, '서울역점');
    expect(where.AND).toEqual([
      { OR: [{ name: { contains: '서울역점' } }, { branchName: { contains: '서울역점' } }] },
    ]);
  });

  it('기존 OR(업종 필터)을 덮어쓰지 않는다', () => {
    const where: Prisma.StoreWhereInput = {
      OR: [{ industryCode: { startsWith: 'G20404' } }, { industryCode: { startsWith: 'G20402' } }],
    };
    applyStoreNameSearch(where, '이마트');
    expect(where.OR).toHaveLength(2); // 업종 OR 그대로
    expect(where.AND).toHaveLength(1); // 검색은 AND로 합성
  });
});

describe('어댑터 where 조립', () => {
  it('마트: 업종 OR과 검색이 공존한다', () => {
    const where = buildMartWhere({ q: '이마트' });
    expect(where.OR).toHaveLength(2);
    expect(where.AND).toHaveLength(1);
  });

  it('편의점: 업종 접두를 유지한 채 검색이 붙는다', () => {
    const where = buildStoreWhere({ q: '서울역점' });
    expect(where.industryCode).toEqual({ startsWith: 'G20405' });
    expect(where.AND).toHaveLength(1);
  });

  it('편의점: q가 없으면 AND가 생기지 않는다', () => {
    const where = buildStoreWhere({ sigunguCode: '11140' });
    expect(where.AND).toBeUndefined();
  });
});
