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

  // 유니크 제약(Property_dedupe_key) 하에서 두 프로세스가 같은 단지를 동시에 만들면
  // 한쪽 create가 P2002로 실패한다. 그건 형제가 방금 만들었다는 뜻이므로 그 행을 반환해야 한다.
  // geocode는 조회가 모두 끝난 뒤 create 직전에 호출되므로, 여기서 경쟁 행을 넣으면
  // 실제 경합과 같은 순서를 결정적으로 재현할 수 있다.
  it('create가 P2002로 실패하면 형제가 만든 행을 재조회해 반환한다', async () => {
    await prisma.region.upsert({
      where: { code: '1168000000' },
      create: {
        code: '1168000000', sido: '서울특별시', sigungu: '강남구', level: 2,
        isAbolished: false, fullName: '서울특별시 강남구', sourceVersion: 'test',
      },
      update: {},
    });

    const geocoder = await import('@/scripts/ingest/geocoder');
    // 배열에 담는 이유: `let x: T | null = null`을 클로저 안에서만 대입하면
    // 단언 시점에 타입 좁히기가 꼬인다. 홀더를 쓰면 그 문제가 없다.
    const sibling: Array<{ id: bigint }> = [];
    vi.mocked(geocoder.geocode).mockImplementationOnce(async () => {
      // 형제 프로세스가 먼저 커밋한 상황
      const row = await prisma.property.create({
        data: {
          propertyType: PropertyType.APARTMENT,
          name: '경합단지', nameNorm: '경합단지',
          regionCode: '1168000000', address: '역삼동 5',
        },
      });
      sibling.push(row);
      return { lat: 37.5, lng: 127.0, region1: null, region2: null };
    });

    const found = await findOrCreateProperty({
      propertyType: PropertyType.APARTMENT,
      name: '경합단지',
      sigunguCode: '11680',
      regionCode: '1168000000',
      address: '역삼동 5',
      buildYear: null,
      roadName: null,
    });

    expect(sibling).toHaveLength(1);
    expect(found.id).toBe(sibling[0].id);
    // 두 행이 생기지 않았어야 한다
    expect(await prisma.property.count({ where: { nameNorm: '경합단지' } })).toBe(1);
  });
});
