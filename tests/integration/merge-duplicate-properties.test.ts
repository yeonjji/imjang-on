import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { PropertyType, DealType } from '@prisma/client';
import { mergeDuplicateProperties } from '@/scripts/ops/merge-duplicate-properties';
import { computeHash } from '@/scripts/ingest/transactions/runner';
import type { NormalizedTransaction } from '@/scripts/ingest/types';
import { assertLocalDatabase } from '../_helpers/assert-local-db';

const REGION = '1168000000';

async function seedRegion() {
  await prisma.region.upsert({
    where: { code: REGION },
    create: {
      code: REGION, sido: '서울특별시', sigungu: '강남구',
      level: 2, isAbolished: false, fullName: '서울특별시 강남구', sourceVersion: 'test',
    },
    update: {},
  });
}

// ETL이 만들 해시와 같은 방식으로 시드해야 병합의 재계산을 진짜로 검증할 수 있다.
function tx(propertyId: bigint, day: number, area: number, amount: number) {
  const row = {
    propertyType: PropertyType.APARTMENT,
    dealType: DealType.SALE,
    contractDate: new Date(Date.UTC(2026, 0, day)),
    exclusiveArea: area,
    floor: 3,
    dealAmount: amount,
    deposit: null,
    monthlyRent: null,
  };
  return {
    rawHash: computeHash(row as unknown as NormalizedTransaction, propertyId),
    propertyId,
    propertyType: PropertyType.APARTMENT,
    regionCode: REGION,
    sigunguCode: '11680',
    dealType: DealType.SALE,
    contractDate: row.contractDate,
    exclusiveArea: area,
    floor: 3,
    dealAmount: amount,
    source: 'TEST',
  };
}

describe('mergeDuplicateProperties', () => {
  beforeEach(async () => {
    assertLocalDatabase();
    // tests/integration은 파일 간 병렬 실행되며 DB를 공유한다. 무필터 deleteMany는
    // 동시에 도는 다른 스위트(og-coord 등)의 픽스처를 지워 플레이키를 만든다.
    // REGION으로 좁혀 이 파일이 만든 행만 정리한다.
    await prisma.transaction.deleteMany({ where: { regionCode: REGION } });
    await prisma.property.deleteMany({ where: { regionCode: REGION } });
    await seedRegion();
  });

  it('dry-run은 아무것도 바꾸지 않고 건수만 센다', async () => {
    const a = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    const b = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    await prisma.transaction.create({ data: tx(b.id, 5, 84.9, 120000) });

    const stats = await mergeDuplicateProperties({ apply: false });
    expect(stats.groups).toBe(1);
    expect(stats.losers).toBe(1);
    // dry-run도 해시·충돌 판정을 실제로 돌리므로 --apply와 같은 수치가 나와야 한다
    expect(stats.moved).toBe(1);
    expect(stats.deleted).toBe(0);

    expect((await prisma.property.findUnique({ where: { id: b.id } }))!.redirectToId).toBeNull();
    expect((await prisma.transaction.findFirst())!.propertyId).toBe(b.id);
    expect(a.id < b.id).toBe(true);
  });

  it('패자 둘의 거래 내용이 같으면 하나만 옮기고 나머지는 삭제한다', async () => {
    const a = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    const b = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    const c = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    // 생존자 a에는 없고, 패자 b·c에 같은 내용의 거래가 하나씩.
    // 둘 다 같은 새 해시로 매핑되므로 하나만 살아남아야 한다 — 아니면 @@unique(rawHash) 위반.
    await prisma.transaction.create({ data: tx(b.id, 7, 84.9, 140000) });
    await prisma.transaction.create({ data: tx(c.id, 7, 84.9, 140000) });

    const stats = await mergeDuplicateProperties({ apply: true });
    expect(stats.moved).toBe(1);
    expect(stats.deleted).toBe(1);
    expect(await prisma.transaction.count()).toBe(1);
    expect((await prisma.transaction.findFirst())!.propertyId).toBe(a.id);
  });

  it('거래를 생존자로 옮기고 해시를 재계산한다', async () => {
    const a = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    const b = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    await prisma.transaction.create({ data: tx(a.id, 5, 84.9, 120000) });
    await prisma.transaction.create({ data: tx(b.id, 6, 84.9, 130000) });

    const stats = await mergeDuplicateProperties({ apply: true });
    expect(stats.moved).toBe(1);
    expect(stats.deleted).toBe(0);

    const all = await prisma.transaction.findMany();
    expect(all).toHaveLength(2);
    expect(all.every((t) => t.propertyId === a.id)).toBe(true);

    // 재계산된 해시가 ETL이 다음에 만들 값과 같아야 한다. 아니면 재수집 때 중복이 다시 들어온다.
    const moved = all.find((t) => t.dealAmount === 130000)!;
    const expected = computeHash(
      { propertyType: PropertyType.APARTMENT, dealType: DealType.SALE,
        contractDate: new Date(Date.UTC(2026, 0, 6)), exclusiveArea: 84.9,
        floor: 3, dealAmount: 130000, deposit: null, monthlyRent: null } as never,
      a.id,
    );
    expect(moved.rawHash).toBe(expected);
  });

  it('생존자에 같은 거래가 이미 있으면 패자 쪽을 삭제한다', async () => {
    const a = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    const b = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    // 같은 내용의 거래가 양쪽에 하나씩 — 해시는 propertyId 때문에 다르다
    await prisma.transaction.create({ data: tx(a.id, 5, 84.9, 120000) });
    await prisma.transaction.create({ data: tx(b.id, 5, 84.9, 120000) });

    const stats = await mergeDuplicateProperties({ apply: true });
    expect(stats.deleted).toBe(1);
    expect(stats.moved).toBe(0);
    expect(await prisma.transaction.count()).toBe(1);
  });

  it('패자에 redirectToId를 세우고 삭제하지 않는다', async () => {
    const a = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    const b = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });

    await mergeDuplicateProperties({ apply: true });

    const loser = await prisma.property.findUnique({ where: { id: b.id } });
    expect(loser).not.toBeNull();
    expect(loser!.redirectToId).toBe(a.id);
  });

  it('생존자 집계를 다시 계산한다', async () => {
    const a = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    const b = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    await prisma.transaction.create({ data: tx(a.id, 5, 84.9, 120000) });
    await prisma.transaction.create({ data: tx(b.id, 6, 84.9, 130000) });

    await mergeDuplicateProperties({ apply: true });

    const survivor = await prisma.property.findUnique({ where: { id: a.id } });
    expect(survivor!.txCountTotal).toBe(2);
  });

  it('주소가 다르면 같은 그룹으로 묶지 않는다', async () => {
    await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '동신', nameNorm: '동신', regionCode: REGION, address: '금동 10' },
    });
    await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '동신', nameNorm: '동신', regionCode: REGION, address: '수송동 904' },
    });

    const stats = await mergeDuplicateProperties({ apply: true });
    expect(stats.groups).toBe(0);
    expect(await prisma.property.count({ where: { redirectToId: { not: null } } })).toBe(0);
  });

  it('이미 리다이렉트된 행은 그룹에서 제외한다', async () => {
    const a = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1', redirectToId: a.id },
    });

    const stats = await mergeDuplicateProperties({ apply: true });
    expect(stats.groups).toBe(0);
  });
});
