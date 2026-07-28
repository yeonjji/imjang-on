import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@/lib/db';
import { resolveSigunguFromAddress, __resetRegionCatalogCacheForTests } from '@/lib/urban/region-from-address';

beforeAll(async () => {
  __resetRegionCatalogCacheForTests();
  // 테스트 region 시드 (idempotent)
  await prisma.region.upsert({
    where: { code: '1165000000' },
    create: {
      // sigunguCode는 generated column (code 앞 5자리) — 명시 전달 시 CI 거부
      code: '1165000000',
      sido: '서울특별시',
      sigungu: '서초구',
      level: 2,
      isAbolished: false,
      fullName: '서울특별시 서초구',
      sourceVersion: 'test',
    },
    update: {},
  });
  // 2026-07-01 통합 시도 — 구 명칭(광주광역시/전라남도) 주소도 매칭돼야 한다
  await prisma.region.upsert({
    where: { code: '1220000000' },
    create: {
      code: '1220000000',
      sido: '전남광주통합특별시',
      sigungu: '북구',
      level: 2,
      isAbolished: false,
      fullName: '전남광주통합특별시 북구',
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

  // 2026-07-01 광주+전남 통합. alias 누락 시 광주·전남 주소 15,804행이 매칭 실패했다.
  it('matches the merged sido by its new name', async () => {
    expect(await resolveSigunguFromAddress('전남광주통합특별시 북구 운암동 1')).toBe('12200');
  });

  it('matches the merged sido by pre-merger names', async () => {
    expect(await resolveSigunguFromAddress('광주광역시 북구 운암동 1')).toBe('12200');
    expect(await resolveSigunguFromAddress('광주 북구 운암동 1')).toBe('12200');
    expect(await resolveSigunguFromAddress('전라남도 북구 운암동 1')).toBe('12200');
  });

  it('returns null when no sigungu matches', async () => {
    expect(await resolveSigunguFromAddress('미상지역 어딘가')).toBeNull();
  });

  it('returns null for null / empty input', async () => {
    expect(await resolveSigunguFromAddress(null)).toBeNull();
    expect(await resolveSigunguFromAddress('')).toBeNull();
  });
});
