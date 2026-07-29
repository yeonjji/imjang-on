import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
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
  // 이 파일은 Property_dedupe_key 인덱스가 막는 바로 그 중복 상태(같은 type/nameNorm/
  // regionCode/address에 redirectToId IS NULL 행이 여럿)를 시드해야 병합 로직을 검증할 수
  // 있다. 그래서 파일 전체 동안 인덱스를 내렸다가 끝나면 정확히 원상복구한다. 복구문은
  // prisma/migrations/20260729000000_add_property_dedupe_unique/migration.sql과
  // byte-identical해야 한다 — 어긋나면 이후 이 스위트가 검증하는 건 운영과 다른 제약이 된다.
  // integration 스위트는 --no-file-parallelism으로 직렬 실행되므로, 인덱스가 없는 동안
  // 다른 파일이 끼어들어 중복을 만들 걱정은 없다.
  beforeAll(async () => {
    await prisma.$executeRaw`DROP INDEX IF EXISTS "Property_dedupe_key"`;
  });

  afterAll(async () => {
    // 마지막 테스트("한 그룹이 실패해도 나머지 그룹을 계속 처리한다")는 실패 그룹을 일부러
    // 병합하지 않은 채로 남긴다 — 그 자체가 검증 대상이다. 그 결과 이 파일이 만든 중복이
    // 인덱스 재생성 시점까지 남아 있어, 정리하지 않으면 CREATE UNIQUE INDEX 자체가
    // 23505로 실패한다. REGION으로 좁혀 이 파일의 픽스처만 지운다.
    await prisma.transaction.deleteMany({ where: { regionCode: REGION } });
    await prisma.property.deleteMany({ where: { regionCode: REGION } });
    await prisma.$executeRaw`
      CREATE UNIQUE INDEX "Property_dedupe_key"
        ON "Property" ("propertyType", "nameNorm", "regionCode", "address")
        WHERE "redirectToId" IS NULL
    `;
  });

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

  // I3(a): updatePropertyAggregates는 Transaction을 propertyId로 GROUP BY하는 CTE와
  // 조인한다. 패자는 거래가 0건이 되므로 CTE에 행이 안 생겨 UPDATE...FROM이 매칭할 게
  // 없는 조용한 no-op이 된다 — 명시적으로 리셋하지 않으면 병합 이전 집계값이 그대로 남는다.
  it('패자의 집계를 병합 후 초기값으로 리셋한다', async () => {
    const a = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    const b = await prisma.property.create({
      data: {
        propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1',
        txCountTotal: 5, txCount12m: 3, lastTxAt: new Date(Date.UTC(2026, 0, 1)),
        saleCount12m: 2, saleAvgPrice12m: 100000n, saleLastPrice: 100000n, saleLastAt: new Date(Date.UTC(2026, 0, 1)),
        areaTypes: [24, 33],
      },
    });
    await prisma.transaction.create({ data: tx(b.id, 5, 84.9, 120000) });

    await mergeDuplicateProperties({ apply: true });

    const loser = await prisma.property.findUnique({ where: { id: b.id } });
    expect(loser!.txCountTotal).toBe(0);
    expect(loser!.txCount12m).toBe(0);
    expect(loser!.lastTxAt).toBeNull();
    expect(loser!.saleCount12m).toBe(0);
    expect(loser!.saleAvgPrice12m).toBeNull();
    expect(loser!.saleLastPrice).toBeNull();
    expect(loser!.saleLastAt).toBeNull();
    expect(loser!.areaTypes).toEqual([]);
  });

  // M6: X → loser → survivor 체인을 두면 populate-url-redirects가 한 홉만 보고
  // X의 목적지를 loser의 URL로 스냅샷해 잘못된 301을 굳힌다. 병합 시 체인을 즉시 collapse해야 한다.
  it('기존에 패자를 가리키던 리다이렉트를 생존자로 재연결한다', async () => {
    const a = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    const b = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    // 2026-07-01 개편 등으로 이미 b를 가리키던 구 property
    const x = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '구래미안', nameNorm: '구래미안', regionCode: REGION, address: '구역삼동 1', redirectToId: b.id },
    });

    await mergeDuplicateProperties({ apply: true });

    const xAfter = await prisma.property.findUnique({ where: { id: x.id } });
    const bAfter = await prisma.property.findUnique({ where: { id: b.id } });
    expect(xAfter!.redirectToId).toBe(a.id);
    expect(bAfter!.redirectToId).toBe(a.id);
  });

  // I2: 운영 SSH 터널 위에서 한 그룹의 $transaction이 타임아웃 등으로 던지면(P2028),
  // try/catch 없이는 프로세스 전체가 죽어 --limit에 offset이 없는 탓에 나머지 그룹이
  // 영영 처리되지 않는다. 첫 그룹에서만 실패를 유도해 나머지가 이어지는지 확인한다.
  it('한 그룹이 실패해도 나머지 그룹을 계속 처리한다', async () => {
    // nameNorm 오름차순 정렬이라 '가나'가 '래미안'보다 먼저 처리된다.
    const failA = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '가나', nameNorm: '가나', regionCode: REGION, address: '역삼동 1' },
    });
    const failB = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '가나', nameNorm: '가나', regionCode: REGION, address: '역삼동 1' },
    });
    const okA = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    const okB = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });

    const spy = vi.spyOn(prisma, '$transaction').mockImplementationOnce(() => Promise.reject(new Error('boom (simulated P2028)')));

    let stats;
    try {
      stats = await mergeDuplicateProperties({ apply: true });
    } finally {
      spy.mockRestore();
    }

    expect(stats.failed).toBe(1);
    expect(stats.groups).toBe(1);
    expect(stats.losers).toBe(1);

    const failLoser = await prisma.property.findUnique({ where: { id: failB.id } });
    expect(failLoser!.redirectToId).toBeNull();

    const okLoser = await prisma.property.findUnique({ where: { id: okB.id } });
    expect(okLoser!.redirectToId).toBe(okA.id);

    expect(failA.id < failB.id).toBe(true);
  });
});
