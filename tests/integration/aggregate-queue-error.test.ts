import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PropertyType } from '@prisma/client';

// 집계가 실패하는 묶음: 롤백되어 대기열에 그대로 남고, 비우기는 예외 없이 멈춰 결과로 알린다.
const fail = { on: false };
vi.mock('@/scripts/ingest/aggregator', async (importActual) => {
  const actual = await importActual<typeof import('@/scripts/ingest/aggregator')>();
  return {
    ...actual,
    updatePropertyAggregates: vi.fn(async (...args: Parameters<typeof actual.updatePropertyAggregates>) => {
      if (fail.on) throw new Error('aggregate failed');
      return actual.updatePropertyAggregates(...args);
    }),
  };
});

import { prisma } from '@/lib/db';
import { enqueuePropertyAggregates, drainAggregateQueue } from '@/scripts/ingest/aggregate-queue';

const REGION = '9991100000';
let id: bigint;
beforeAll(async () => {
  await prisma.region.upsert({
    where: { code: REGION },
    create: { code: REGION, sido: 'UT도', sigungu: 'UT오류시', level: 2, isAbolished: false, fullName: 'UT도 UT오류시', sourceVersion: 'test' },
    update: {},
  });
  await prisma.property.deleteMany({ where: { regionCode: REGION } });
  id = (await prisma.property.create({ data: { propertyType: PropertyType.APARTMENT, name: 'UT오류', nameNorm: 'UT오류', regionCode: REGION, address: 'UT' } })).id;
  await prisma.propertyAggregateQueue.deleteMany({});
});
afterAll(async () => {
  await prisma.propertyAggregateQueue.deleteMany({});
  await prisma.property.deleteMany({ where: { regionCode: REGION } });
  await prisma.region.deleteMany({ where: { code: REGION } });
  await prisma.$disconnect();
});

describe('대기열 비우기 중 오류', () => {
  it('실패한 묶음은 대기열에 남고, 비우기는 stoppedBy=error로 끝난다(예외로 수집기를 죽이지 않음)', async () => {
    await enqueuePropertyAggregates(prisma, [id]);
    fail.on = true;
    const r = await drainAggregateQueue({ batchSize: 10 });
    expect(r).toMatchObject({ processed: 0, stoppedBy: 'error', remaining: 1 });
    expect(r.error).toMatch(/aggregate failed/);
  });

  it('다음 실행에서 다시 처리된다(누락 없음)', async () => {
    fail.on = false;
    const r = await drainAggregateQueue({ batchSize: 10 });
    expect(r).toMatchObject({ processed: 1, stoppedBy: 'empty', remaining: 0 });
  });
});
