import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasSingleJibun } from '@/lib/property';
import { prisma } from '@/lib/db';
import { PropertyType, DealType } from '@prisma/client';

// CI의 check 잡은 migrate만 하고 seed를 안 한다. 앰비언트 Transaction에 의존하면
// DB 상태에 따라 결과가 갈리므로 테스트가 직접 시드한다.
const REGION_CODE = '1171000000';
const SGG = '11710';
const NAME_SINGLE = 'UT-JIBUN-SINGLE';
const NAME_MULTI = 'UT-JIBUN-MULTI';
const NAME_NULL = 'UT-JIBUN-NULL';
const NAME_UMD = 'UT-JIBUN-UMD';
const NAME_MIXED = 'UT-JIBUN-MIXED';

let singleId: bigint;
let multiId: bigint;
let nullId: bigint;
let umdId: bigint;
let mixedId: bigint;

async function seedProperty(name: string, address: string): Promise<bigint> {
  const p = await prisma.property.create({
    data: {
      propertyType: PropertyType.APARTMENT,
      name,
      nameNorm: name.toLowerCase(),
      regionCode: REGION_CODE,
      address,
    },
  });
  return p.id;
}

async function seedTx(
  propertyId: bigint,
  jibun: string | null,
  hashSuffix: string,
  umd = '가락동',
) {
  await prisma.transaction.create({
    data: {
      propertyId,
      propertyType: PropertyType.APARTMENT,
      regionCode: REGION_CODE,
      sigunguCode: SGG, // 일반 컬럼이라 반드시 넣어야 한다 (Property/Region의 것은 생성 컬럼)
      dealType: DealType.SALE,
      contractDate: new Date('2026-01-05'),
      exclusiveArea: 84.97,
      umd,
      jibun,
      source: 'ut-jibun-gate',
      rawHash: `ut-jibun-gate-${hashSuffix}`.padEnd(64, '0'),
    },
  });
}

beforeAll(async () => {
  await prisma.region.upsert({
    where: { code: REGION_CODE },
    update: {},
    create: {
      code: REGION_CODE,
      sido: '서울특별시',
      sigungu: '송파구',
      fullName: '서울특별시 송파구',
      level: 2,
      sourceVersion: 'ut',
    },
  });

  singleId = await seedProperty(NAME_SINGLE, '가락동 913');
  multiId = await seedProperty(NAME_MULTI, '가락동 913');
  nullId = await seedProperty(NAME_NULL, '가락동 913');
  umdId = await seedProperty(NAME_UMD, '가락동 100');
  mixedId = await seedProperty(NAME_MIXED, '가락동 913');

  await seedTx(singleId, '913', 'single-a');
  await seedTx(singleId, '913', 'single-b');
  await seedTx(multiId, '913', 'multi-a');
  await seedTx(multiId, '456-4', 'multi-b');
  await seedTx(nullId, null, 'null-a');
  await seedTx(umdId, '100', 'umd-a', '가락동');
  await seedTx(umdId, '100', 'umd-b', '신천동');
  await seedTx(mixedId, '913', 'mixed-a');
  await seedTx(mixedId, null, 'mixed-b');
});

afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { source: 'ut-jibun-gate' } });
  await prisma.property.deleteMany({
    where: { name: { in: [NAME_SINGLE, NAME_MULTI, NAME_NULL, NAME_UMD, NAME_MIXED] } },
  });
  await prisma.$disconnect();
});

describe('hasSingleJibun (integration)', () => {
  it('거래가 모두 같은 지번이면 true', async () => {
    expect(await hasSingleJibun(singleId)).toBe(true);
  });

  it('거래가 여러 지번에 걸치면 false', async () => {
    expect(await hasSingleJibun(multiId)).toBe(false);
  });

  it('지번이 전부 null이면 확인 불가이므로 false', async () => {
    expect(await hasSingleJibun(nullId)).toBe(false);
  });

  // Property.address는 umd + jibun으로 조립되므로 지번 하나만 세면 이 단지가 통과해버린다.
  it('지번이 같아도 법정동이 다르면 false', async () => {
    expect(await hasSingleJibun(umdId)).toBe(false);
  });

  // jibun IS NOT NULL 필터가 지키는 판정 — NULL은 '다른 건물'이 아니다.
  it('지번 하나에 NULL이 섞여 있으면 true', async () => {
    expect(await hasSingleJibun(mixedId)).toBe(true);
  });

  it('거래가 없는 단지는 false', async () => {
    expect(await hasSingleJibun(9_999_999_999n)).toBe(false);
  });
});
