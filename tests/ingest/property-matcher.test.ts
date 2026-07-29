import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { findOrCreateProperty } from '@/scripts/ingest/property-matcher';
import { PropertyType } from '@prisma/client';
import { assertLocalDatabase } from '../_helpers/assert-local-db';

vi.mock('@/scripts/ingest/geocoder', async (importActual) => {
  const actual = await importActual<typeof import('@/scripts/ingest/geocoder')>();
  return {
    ...actual,
    geocode: vi.fn().mockResolvedValue({ lat: 37.5, lng: 127.0, region1: null, region2: null }),
  };
});

describe('property-matcher', () => {
  beforeEach(async () => {
    assertLocalDatabase();
    await prisma.transaction.deleteMany();
    await prisma.property.deleteMany();
  });

  it('1차: exact match on (type, name, sigungu)', async () => {
    await prisma.region.upsert({
      where: { code: '1165010100' },
      create: { code: '1165010100', sido: '서울', sigungu: '서초구', eupmyeondong: '서초동', fullName: '서울 서초구 서초동', level: 3, sourceVersion: 'test' },
      update: {},
    });
    const created = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: '1165010100', address: '서울 서초구' },
    });

    const found = await findOrCreateProperty({
      propertyType: PropertyType.APARTMENT,
      name: '래미안',
      sigunguCode: '11650',
      regionCode: '1165010100',
      address: '서울 서초구',
      buildYear: 2010,
      roadName: null,
    });
    expect(found.id).toBe(created.id);
  });

  // C1: 병합 패자는 생존자와 (type, name, region)이 동일해 필터 없이는 그대로 다시 걸린다.
  //
  // "생존자 + 패자 둘 다 시딩하고 생존자가 반환되는지" 형태로는 검증력이 없다는 걸 실측으로
  // 확인했다: orderBy 없는 findFirst/findMany의 반환 순서는 Postgres 물리 저장 순서를 따르고,
  // 그 순서는 INSERT/UPDATE 순서에 따라 달라져(특히 나중에 redirectToId를 UPDATE로 세우면 그
  // 행이 물리적으로 뒤로 밀린다) 필터를 지워도 우연히 생존자가 먼저 나올 수 있다 — 즉
  // 타이브레이크 순서에 기대는 테스트는 회귀를 못 잡을 수 있다.
  //
  // 대신 검색 조건에 매칭되는 행이 "리다이렉트된 패자 단 하나뿐"인 상황을 만든다. 이러면
  // 물리적 순서와 무관하게 결정적이다 — 필터가 있으면 그 하나뿐인 행마저 제외되어 완전히
  // 새 property가 생성되고, 필터가 없으면 그 행이 그대로 반환된다.
  it('검색 조건에 맞는 행이 리다이렉트된 패자뿐이면 그 패자를 재사용하지 않고 새로 만든다', async () => {
    await prisma.region.upsert({
      where: { code: '1165010100' },
      create: { code: '1165010100', sido: '서울', sigungu: '서초구', eupmyeondong: '서초동', fullName: '서울 서초구 서초동', level: 3, sourceVersion: 'test' },
      update: {},
    });
    // redirectToId가 가리킬 대상 — type/name/region을 검색 조건과 다르게 해서
    // 이 행 자체가 매칭 후보로 섞여 들어오지 않게 한다.
    const redirectTarget = await prisma.property.create({
      data: { propertyType: PropertyType.OFFICETEL, name: '무관한매물', nameNorm: '무관한매물', regionCode: '1165010100', address: '서울 서초구 다른동' },
    });
    const loser = await prisma.property.create({
      data: {
        propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: '1165010100', address: '서울 서초구',
        redirectToId: redirectTarget.id,
      },
    });

    const found = await findOrCreateProperty({
      propertyType: PropertyType.APARTMENT,
      name: '래미안',
      sigunguCode: '11650',
      regionCode: '1165010100',
      address: '서울 서초구',
      buildYear: 2010,
      roadName: null,
    });

    expect(found.id).not.toBe(loser.id);
    expect(found.redirectToId).toBeNull();
    expect(found.name).toBe('래미안');
  });

  it('3차: creates new property when not found', async () => {
    await prisma.region.upsert({
      where: { code: '1165010100' },
      create: { code: '1165010100', sido: '서울', sigungu: '서초구', eupmyeondong: '서초동', fullName: '서울 서초구 서초동', level: 3, sourceVersion: 'test' },
      update: {},
    });
    const p = await findOrCreateProperty({
      propertyType: PropertyType.APARTMENT,
      name: '신규단지',
      sigunguCode: '11650',
      regionCode: '1165010100',
      address: '서울 서초구 서초동 1',
      buildYear: 2024,
      roadName: null,
    });
    expect(p.id).toBeDefined();
    expect(p.name).toBe('신규단지');
  });
});
