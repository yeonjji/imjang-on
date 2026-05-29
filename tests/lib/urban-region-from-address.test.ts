import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@/lib/db';
import { resolveSigunguFromAddress, __resetRegionCatalogCacheForTests } from '@/lib/urban/region-from-address';

beforeAll(async () => {
  __resetRegionCatalogCacheForTests();
  // 테스트 region 시드 (idempotent)
  await prisma.region.upsert({
    where: { code: '1165000000' },
    create: {
      code: '1165000000',
      sido: '서울특별시',
      sigungu: '서초구',
      sigunguCode: '11650',
      level: 2,
      isAbolished: false,
      fullName: '서울특별시 서초구',
      sourceVersion: 'test',
    },
    update: {},
  });
  __resetRegionCatalogCacheForTests();
});

describe('resolveSigunguFromAddress', () => {
  it('returns sigunguCode for full sido + sigungu prefix', async () => {
    expect(await resolveSigunguFromAddress('서울특별시 서초구 서초동 1234')).toBe('11650');
  });

  it('returns sigunguCode for short sido + sigungu prefix (alias)', async () => {
    expect(await resolveSigunguFromAddress('서울 서초구 서초동 1234')).toBe('11650');
  });

  it('returns null when no sigungu matches', async () => {
    expect(await resolveSigunguFromAddress('미상지역 어딘가')).toBeNull();
  });

  it('returns null for null / empty input', async () => {
    expect(await resolveSigunguFromAddress(null)).toBeNull();
    expect(await resolveSigunguFromAddress('')).toBeNull();
  });
});
