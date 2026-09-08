import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { PropertyType } from '@prisma/client';
import { runMatch } from '@/scripts/ingest/apt-complex/runner';
import { assertLocalDatabase } from '../../_helpers/assert-local-db';

// 공유 로컬 DB에 파일 간 병렬로 붙으므로 이 파일이 쓰는 코드로만 좁혀 지운다.
// 무필터 deleteMany는 동시에 도는 다른 스위트의 픽스처를 지워 플레이키를 만든다.
//
// 단지명은 전부 합성값이다. 실제 단지명을 쓰면 같은 시군구의 실수집 단지가 같은
// Property를 먼저 가져가 taken 가드에 걸린다(로컬 27260에 실단지 272개).
const REGION = '2726010100'; // 대구 수성구 범어동
const SGG = '27260';
const KAPT = ['TEST_AC_1', 'TEST_AC_2', 'TEST_AC_3'];

async function seedRegion() {
  await prisma.region.upsert({
    where: { code: REGION },
    create: {
      code: REGION,
      sido: '대구광역시',
      sigungu: '수성구',
      eupmyeondong: '범어동',
      fullName: '대구광역시 수성구 범어동',
      level: 3,
      sourceVersion: 'test',
    },
    update: {},
  });
}

describe('apt-complex 매칭 (DB)', () => {
  beforeEach(async () => {
    assertLocalDatabase();
    await prisma.aptComplex.deleteMany({ where: { kaptCode: { in: KAPT } } });
    await prisma.property.deleteMany({ where: { regionCode: REGION } });
    await seedRegion();
  });

  it('Tier1 완전일치로 붙고 households를 역채움한다', async () => {
    const p = await prisma.property.create({
      data: {
        propertyType: PropertyType.APARTMENT,
        name: '테스트에일린단지',
        nameNorm: '테스트에일린단지',
        regionCode: REGION,
        address: '범어동 2272',
      },
    });
    await prisma.aptComplex.create({
      data: {
        kaptCode: KAPT[0], kaptName: '테스트에일린단지', nameNorm: '테스트에일린단지',
        bjdCode: REGION, sigunguCode: SGG, as3: '범어동', households: 400, buildingCount: 5,
      },
    });

    await runMatch({ apply: true, sigunguCodes: [SGG] });

    const c = await prisma.aptComplex.findUnique({ where: { kaptCode: KAPT[0] } });
    expect(c?.propertyId).toBe(p.id);
    expect(c?.matchTier).toBe(1);
    const after = await prisma.property.findUnique({ where: { id: p.id } });
    expect(after?.households).toBe(400);
    expect(after?.buildingCount).toBe(5);
  });

  it('동명이 다르면 붙지 않는다', async () => {
    await prisma.property.create({
      data: {
        propertyType: PropertyType.APARTMENT,
        name: '테스트수성아이파크',
        nameNorm: '테스트수성아이파크',
        regionCode: REGION,
        address: '파동 1000',
      },
    });
    await prisma.aptComplex.create({
      data: {
        kaptCode: KAPT[1], kaptName: '테스트범어아이파크', nameNorm: '테스트범어아이파크',
        bjdCode: REGION, sigunguCode: SGG, as3: '범어동', households: 300,
      },
    });

    await runMatch({ apply: true, sigunguCodes: [SGG] });

    const c = await prisma.aptComplex.findUnique({ where: { kaptCode: KAPT[1] } });
    expect(c?.propertyId).toBeNull();
    expect(c?.matchTier).toBeNull();
  });

  it('API households가 null이면 기존 값을 덮어쓰지 않는다', async () => {
    const p = await prisma.property.create({
      data: {
        propertyType: PropertyType.APARTMENT,
        name: '테스트화성파크단지',
        nameNorm: '테스트화성파크단지',
        regionCode: REGION,
        address: '범어동 300',
        households: 999,
      },
    });
    await prisma.aptComplex.create({
      data: {
        kaptCode: KAPT[2], kaptName: '테스트화성파크단지', nameNorm: '테스트화성파크단지',
        bjdCode: REGION, sigunguCode: SGG, as3: '범어동', households: null,
      },
    });

    await runMatch({ apply: true, sigunguCodes: [SGG] });

    const after = await prisma.property.findUnique({ where: { id: p.id } });
    expect(after?.households).toBe(999);
  });

  it('매칭이 떨어지면 역채움 값을 되돌린다', async () => {
    const p = await prisma.property.create({
      data: {
        propertyType: PropertyType.APARTMENT,
        name: '테스트에일린단지',
        nameNorm: '테스트에일린단지',
        regionCode: REGION,
        address: '범어동 2272',
      },
    });
    await prisma.aptComplex.create({
      data: {
        kaptCode: KAPT[0], kaptName: '테스트에일린단지', nameNorm: '테스트에일린단지',
        bjdCode: REGION, sigunguCode: SGG, as3: '범어동', households: 400, buildingCount: 5,
      },
    });
    await runMatch({ apply: true, sigunguCodes: [SGG] });
    expect((await prisma.property.findUnique({ where: { id: p.id } }))?.households).toBe(400);

    // 단지명을 바꿔 더는 매칭되지 않게 만든 뒤 다시 돌린다.
    await prisma.aptComplex.update({
      where: { kaptCode: KAPT[0] },
      data: { kaptName: '전혀다른이름단지', nameNorm: '전혀다른이름단지' },
    });
    await runMatch({ apply: true, sigunguCodes: [SGG] });

    const after = await prisma.property.findUnique({ where: { id: p.id } });
    expect(after?.households).toBeNull();
    expect(after?.buildingCount).toBeNull();
  });

  it('audit 모드는 아무것도 쓰지 않는다', async () => {
    await prisma.property.create({
      data: {
        propertyType: PropertyType.APARTMENT,
        name: '테스트에일린단지',
        nameNorm: '테스트에일린단지',
        regionCode: REGION,
        address: '범어동 2272',
      },
    });
    await prisma.aptComplex.create({
      data: {
        kaptCode: KAPT[0], kaptName: '테스트에일린단지', nameNorm: '테스트에일린단지',
        bjdCode: REGION, sigunguCode: SGG, as3: '범어동', households: 400,
      },
    });

    await runMatch({ apply: false, sigunguCodes: [SGG] });

    const c = await prisma.aptComplex.findUnique({ where: { kaptCode: KAPT[0] } });
    expect(c?.propertyId).toBeNull();
    expect(c?.matchTier).toBeNull();
  });
});
