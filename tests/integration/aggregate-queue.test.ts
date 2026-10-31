import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { PropertyType, DealType } from '@prisma/client';
import {
  enqueuePropertyAggregates,
  drainAggregateQueue,
  enqueueWindowExpired,
} from '@/scripts/ingest/aggregate-queue';
import { runDaily } from '@/scripts/ingest/property-aggregates/runner';

// S2 재집계 대기열: 원자성(거래와 같은 트랜잭션), 동시성(비우는 중 새로 들어온 항목 보존), 12개월 경계.
const REGION = '9990800000';
const SGG = '99908';
const DAY = 86_400_000;
const day = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
let seq = 0;
const tx = (propertyId: bigint, contractDate: Date, amount = 100000) => ({
  rawHash: `UT-AQ-${++seq}-${propertyId}`, propertyId, propertyType: PropertyType.APARTMENT, regionCode: REGION,
  sigunguCode: SGG, dealType: DealType.SALE, contractDate, exclusiveArea: 84.9, floor: 3, dealAmount: amount, source: 'test',
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let a: bigint; let b: bigint;

beforeAll(async () => {
  await prisma.region.upsert({
    where: { code: REGION },
    create: { code: REGION, sido: 'UT도', sigungu: 'UT대기열시', level: 2, isAbolished: false, fullName: 'UT도 UT대기열시', sourceVersion: 'test' },
    update: {},
  });
  await prisma.property.deleteMany({ where: { regionCode: REGION } });
  const mk = (name: string) => prisma.property.create({ data: { propertyType: PropertyType.APARTMENT, name, nameNorm: name, regionCode: REGION, address: 'UT' } });
  a = (await mk('UT대기열A')).id;
  b = (await mk('UT대기열B')).id;
});
beforeEach(async () => {
  await prisma.propertyAggregateQueue.deleteMany({});
  await prisma.transaction.deleteMany({ where: { regionCode: REGION } });
});
afterAll(async () => {
  await prisma.propertyAggregateQueue.deleteMany({});
  await prisma.transaction.deleteMany({ where: { regionCode: REGION } });
  await prisma.property.deleteMany({ where: { regionCode: REGION } });
  await prisma.region.deleteMany({ where: { code: REGION } });
  await prisma.$disconnect();
});

describe('원자성', () => {
  it('거래 저장이 롤백되면 대기열 기록도 남지 않는다', async () => {
    await expect(
      prisma.$transaction(async (t) => {
        await t.transaction.create({ data: tx(a, day(new Date())) });
        await enqueuePropertyAggregates(t, [a]);
        throw new Error('task failed');
      }),
    ).rejects.toThrow('task failed');
    expect(await prisma.propertyAggregateQueue.count()).toBe(0);
    expect(await prisma.transaction.count({ where: { propertyId: a } })).toBe(0);
  });

  it('커밋되면 대기열에 남고, 비우면 집계되고 대기열이 빈다', async () => {
    await prisma.$transaction(async (t) => {
      await t.transaction.create({ data: tx(a, day(new Date(Date.now() - 10 * DAY)), 120000) });
      await enqueuePropertyAggregates(t, [a, a]); // 중복 id도 안전
    });
    expect(await prisma.propertyAggregateQueue.count()).toBe(1);
    const r = await drainAggregateQueue({ batchSize: 10 });
    expect(r).toMatchObject({ processed: 1, changed: 1 });
    expect(await prisma.propertyAggregateQueue.count()).toBe(0);
    expect(await prisma.property.findUniqueOrThrow({ where: { id: a } })).toMatchObject({ txCountTotal: 1, saleLastPrice: 120000n });
  });
});

describe('동시성', () => {
  it('비우는 트랜잭션이 잡고 있는 동안 들어온 항목은 사라지지 않는다(갱신 손실 없음)', async () => {
    await enqueuePropertyAggregates(prisma, [a]);
    // 비우는 쪽: 행을 잠그고 잠시 쥔 뒤 삭제·커밋
    const draining = prisma.$transaction(async (t) => {
      await t.$queryRaw`SELECT "propertyId" FROM "PropertyAggregateQueue" WHERE "propertyId" = ${a} FOR UPDATE`;
      await sleep(400);
      await t.$executeRaw`DELETE FROM "PropertyAggregateQueue" WHERE "propertyId" = ${a}`;
    }, { timeout: 10_000 });
    await sleep(100);
    // 넣는 쪽: 잠금에 막혔다가 삭제 커밋 뒤 새 행으로 들어가야 한다
    const t0 = Date.now();
    await enqueuePropertyAggregates(prisma, [a]);
    expect(Date.now() - t0).toBeGreaterThan(150); // 실제로 대기했다
    await draining;
    expect(await prisma.propertyAggregateQueue.count({ where: { propertyId: a } })).toBe(1);
  });

  it('동시에 비워도 같은 매물을 두 번 처리하지 않는다(SKIP LOCKED)', async () => {
    await enqueuePropertyAggregates(prisma, [a, b]);
    const [r1, r2] = await Promise.all([drainAggregateQueue({ batchSize: 1, maxBatches: 1 }), drainAggregateQueue({ batchSize: 1, maxBatches: 1 })]);
    expect(r1.processed + r2.processed).toBe(2);
    expect(await prisma.propertyAggregateQueue.count()).toBe(0);
  });
});

describe('12개월 경계(D2)', () => {
  it('창 밖으로 나간 거래가 있는 매물을 대기열에 넣고, 비우면 12개월 지표가 0/null이 된다', async () => {
    const now = new Date();
    const expired = day(new Date(now.getTime() - 366 * DAY)); // 막 12개월 밖
    const old = day(new Date(now.getTime() - 500 * DAY)); // 이미 오래전(대상 아님)
    await prisma.transaction.createMany({ data: [tx(a, expired, 150000), tx(b, old, 90000)] });
    // 1년 전 집계 시점에 계산된 낡은 값
    await prisma.property.update({ where: { id: a }, data: { txCountTotal: 1, txCount12m: 1, saleCount12m: 1, saleAvgPrice12m: 150000n, saleLastPrice: 150000n } });

    const n = await enqueueWindowExpired(prisma, now, 3);
    expect(n).toBe(1);
    expect((await prisma.propertyAggregateQueue.findMany()).map((x) => x.propertyId)).toEqual([a]);

    await drainAggregateQueue({ batchSize: 10 });
    expect(await prisma.property.findUniqueOrThrow({ where: { id: a } })).toMatchObject({
      txCountTotal: 1, txCount12m: 0, saleCount12m: 0, saleAvgPrice12m: null, saleLastPrice: 150000n,
    });
  });
});

describe('일일 잡(runDaily)', () => {
  it('12개월 경계 넣기 + 대기열 비우기를 한 번에, 남은 대기열 0', async () => {
    const now = new Date();
    await prisma.transaction.createMany({ data: [tx(a, day(new Date(now.getTime() - 366 * DAY)))] });
    await enqueuePropertyAggregates(prisma, [b]); // 수집기가 남긴 항목
    const r = await runDaily({ now, maxMinutes: 5 });
    expect(r).toMatchObject({ expiredEnqueued: 1, processed: 2, remaining: 0, stoppedBy: 'empty' });
  });
});

