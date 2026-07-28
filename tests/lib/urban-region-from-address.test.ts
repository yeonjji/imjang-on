import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@/lib/db';
import {
  resolveSigunguFromAddress,
  resolveSigunguLabelFromAddress,
  __resetRegionCatalogCacheForTests,
} from '@/lib/region/from-address';

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
  // 동명 시군구 — '서구'는 대구·대전·부산·전남광주에 있다
  await prisma.region.upsert({
    where: { code: '3017000000' },
    create: {
      code: '3017000000', sido: '대전광역시', sigungu: '서구',
      level: 2, isAbolished: false, fullName: '대전광역시 서구', sourceVersion: 'test',
    },
    update: {},
  });
  await prisma.region.upsert({
    where: { code: '2714000000' },
    create: {
      code: '2714000000', sido: '대구광역시', sigungu: '서구',
      level: 2, isAbolished: false, fullName: '대구광역시 서구', sourceVersion: 'test',
    },
    update: {},
  });
  // 북구 동명 충돌 — 부산에도 북구가 있어 전남광주의 '북구'가 collision rule을 탄다
  await prisma.region.upsert({
    where: { code: '2617000000' },
    create: {
      code: '2617000000', sido: '부산광역시', sigungu: '북구',
      level: 2, isAbolished: false, fullName: '부산광역시 북구', sourceVersion: 'test',
    },
    update: {},
  });
  // 구·군이 없는 시 — 세종은 읍면동이 sigunguCode 36110을 공유한다
  await prisma.region.upsert({
    where: { code: '3611025000' },
    create: {
      code: '3611025000', sido: '세종특별자치시', sigungu: '조치원읍',
      level: 2, isAbolished: false, fullName: '세종특별자치시 조치원읍', sourceVersion: 'test',
    },
    update: {},
  });
  await prisma.region.upsert({
    where: { code: '3611051000' },
    create: {
      code: '3611051000', sido: '세종특별자치시', sigungu: '한솔동',
      level: 2, isAbolished: false, fullName: '세종특별자치시 한솔동', sourceVersion: 'test',
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

describe('resolveSigunguLabelFromAddress', () => {
  it('이름이 유일한 시군구는 시군구만 낸다', async () => {
    expect(await resolveSigunguLabelFromAddress('서울특별시 서초구 서초동 1234')).toBe('서초구');
  });

  // 전국 243개 중 26곳이 여러 시도에 걸친다. '(서구)'만으로는 어디인지 알 수 없다.
  it('여러 시도에 걸치는 시군구는 시도 축약명을 앞에 붙인다', async () => {
    expect(await resolveSigunguLabelFromAddress('대전광역시 서구 둔산동 1')).toBe('대전 서구');
    expect(await resolveSigunguLabelFromAddress('대구광역시 서구 내당동 1')).toBe('대구 서구');
  });

  // 세종은 구·군이 없어 읍면동이 한 sigunguCode를 공유한다 → 동 이름 대신 시 이름
  it('구·군이 없는 시는 시 축약명으로 접는다', async () => {
    expect(await resolveSigunguLabelFromAddress('세종특별자치시 조치원읍 로1')).toBe('세종');
    expect(await resolveSigunguLabelFromAddress('세종특별자치시 한솔동 로1')).toBe('세종');
  });

  // 부산에도 북구가 있어 collision rule이 실제로 발동한다. 전남광주는 '전남광주'가 아니라
  // '광주'로 표시된다 — 검색자가 인지하는 이름(display override).
  it('구 명칭 주소도 통합 시도 라벨을 낸다', async () => {
    expect(await resolveSigunguLabelFromAddress('광주광역시 북구 운암동 1')).toBe('광주 북구');
  });

  it('매칭 실패는 null — 호출부가 접미사를 생략한다', async () => {
    expect(await resolveSigunguLabelFromAddress('미상지역 어딘가')).toBeNull();
    expect(await resolveSigunguLabelFromAddress(null)).toBeNull();
    expect(await resolveSigunguLabelFromAddress('')).toBeNull();
  });
});
