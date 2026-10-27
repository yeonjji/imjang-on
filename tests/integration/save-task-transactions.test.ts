import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { PropertyType, DealType } from '@prisma/client';

// 대기열 넣기를 실패시킬 수 있게 부분 모킹한다(다른 함수는 실제 구현).
const failEnqueue = { on: false };
vi.mock('@/scripts/ingest/aggregate-queue', async (importActual) => {
  const actual = await importActual<typeof import('@/scripts/ingest/aggregate-queue')>();
  return {
    ...actual,
    enqueuePropertyAggregates: vi.fn(async (...args: Parameters<typeof actual.enqueuePropertyAggregates>) => {
      if (failEnqueue.on) throw new Error('enqueue failed');
      return actual.enqueuePropertyAggregates(...args);
    }),
  };
});

import { prisma } from '@/lib/db';
import { saveTaskTransactions } from '@/scripts/ingest/transactions/runner';

const REGION = '9990900000';
let pid: bigint;
const row = (n: number) => ({
  rawHash: `UT-SAVE-${n}`, propertyId: pid, propertyType: PropertyType.APARTMENT, regionCode: REGION, sigunguCode: '99909',
  dealType: DealType.SALE, contractDate: new Date(Date.UTC(2026, 8, n)), exclusiveArea: 84.9, floor: 3, dealAmount: 100000 + n, source: 'test',
});

beforeAll(async () => {
  await prisma.region.upsert({
    where: { code: REGION },
    create: { code: REGION, sido: 'UT도', sigungu: 'UT저장시', level: 2, isAbolished: false, fullName: 'UT도 UT저장시', sourceVersion: 'test' },
    update: {},
  });
  await prisma.property.deleteMany({ where: { regionCode: REGION } });
  pid = (await prisma.property.create({ data: { propertyType: PropertyType.APARTMENT, name: 'UT저장', nameNorm: 'UT저장', regionCode: REGION, address: 'UT' } })).id;
});
beforeEach(async () => {
  failEnqueue.on = false;
  await prisma.propertyAggregateQueue.deleteMany({});
  await prisma.transaction.deleteMany({ where: { regionCode: REGION } });
  await prisma.ingestionRun.deleteMany({ where: { source: 'UT-SAVE' } });
});
afterAll(async () => {
  await prisma.propertyAggregateQueue.deleteMany({});
  await prisma.transaction.deleteMany({ where: { regionCode: REGION } });
  await prisma.ingestionRun.deleteMany({ where: { source: 'UT-SAVE' } });
  await prisma.property.deleteMany({ where: { regionCode: REGION } });
  await prisma.region.deleteMany({ where: { code: REGION } });
  await prisma.$disconnect();
});

describe('saveTaskTransactions — 거래 저장·대기열·완료 기록이 한 트랜잭션', () => {
  it('성공: 거래, 대기열, OK가 함께 커밋된다', async () => {
    const run = await prisma.ingestionRun.create({ data: { source: 'UT-SAVE', targetKey: 'k1', status: 'RUNNING' } });
    expect(await saveTaskTransactions(prisma, run.id, [row(1), row(2)])).toBe(2);
    expect(await prisma.transaction.count({ where: { regionCode: REGION } })).toBe(2);
    expect(await prisma.propertyAggregateQueue.count({ where: { propertyId: pid } })).toBe(1);
    expect((await prisma.ingestionRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe('OK');
  });

  it('대기열 넣기가 실패하면 거래도 저장되지 않고 단위는 OK가 아니다(재실행이 다시 처리)', async () => {
    const run = await prisma.ingestionRun.create({ data: { source: 'UT-SAVE', targetKey: 'k2', status: 'RUNNING' } });
    failEnqueue.on = true;
    await expect(saveTaskTransactions(prisma, run.id, [row(3)])).rejects.toThrow('enqueue failed');
    expect(await prisma.transaction.count({ where: { regionCode: REGION } })).toBe(0);
    expect((await prisma.ingestionRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe('RUNNING');
  });

  it('같은 단위를 다시 저장해도 거래가 중복되지 않는다(재실행 멱등)', async () => {
    const r1 = await prisma.ingestionRun.create({ data: { source: 'UT-SAVE', targetKey: 'k3', status: 'RUNNING' } });
    await saveTaskTransactions(prisma, r1.id, [row(4)]);
    const r2 = await prisma.ingestionRun.create({ data: { source: 'UT-SAVE', targetKey: 'k3', status: 'RUNNING' } });
    expect(await saveTaskTransactions(prisma, r2.id, [row(4)])).toBe(0);
    expect(await prisma.transaction.count({ where: { regionCode: REGION } })).toBe(1);
  });
});
