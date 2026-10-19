import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { PropertyType } from '@prisma/client';
import { runCollect, refreshStats, type FetchItem } from '@/scripts/ingest/apt-maintenance-cost/runner';
import { QuotaExceededError } from '@/scripts/ingest/apt-complex/http';
import { COST_OPS } from '@/scripts/ingest/apt-maintenance-cost/ops';

const REGION_CODE = '1171000000';
const SGG = '11710';
const PREFIX = 'UT-MC-';
const YM = '202608';
const codes = Array.from({ length: 6 }, (_, i) => `${PREFIX}${i}`);

const ok = (item: Record<string, unknown>) => ({ response: { header: { resultCode: '00' }, body: { item } } });
/** 단지마다 청소비만 (i+1)*1000원, 나머지는 0 */
const fakeFetch: FetchItem = async (op, kaptCode) => {
  const i = Number(kaptCode.slice(PREFIX.length));
  if (op.op === 'getHsmpCleaningCostInfoV3') return ok({ kaptCode, cleanCost: (i + 1) * 1000 });
  const fields = op.kind === 'sum' ? op.fields : [op.key];
  return ok({ kaptCode, ...Object.fromEntries(fields.map((f) => [f, 0])) });
};

async function cleanup() {
  await prisma.aptMaintenanceCost.deleteMany({ where: { kaptCode: { startsWith: PREFIX } } });
  await prisma.aptMaintenanceCostStat.deleteMany({ where: { sigunguCode: SGG, yearMonth: YM } });
  await prisma.aptComplex.deleteMany({ where: { kaptCode: { startsWith: PREFIX } } });
  await prisma.property.deleteMany({ where: { name: { startsWith: PREFIX } } });
}

beforeAll(async () => {
  await cleanup();
  await prisma.region.upsert({
    where: { code: REGION_CODE },
    create: { code: REGION_CODE, sido: '서울특별시', sigungu: '송파구', fullName: '서울특별시 송파구', level: 2, sourceVersion: 'test' },
    update: {},
  });
  for (const code of codes) {
    const p = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: code, nameNorm: code.toLowerCase(), regionCode: REGION_CODE, address: '서울특별시 송파구' },
    });
    await prisma.aptComplex.create({
      data: {
        kaptCode: code, kaptName: code, nameNorm: code.toLowerCase(), bjdCode: REGION_CODE, sigunguCode: SGG,
        propertyId: p.id, rawJson: { kaptMarea: '1000' },
      },
    });
  }
});
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.aptMaintenanceCost.deleteMany({ where: { kaptCode: { startsWith: PREFIX } } });
});

const row = (kaptCode: string, yearMonth: string, o: Record<string, unknown> = {}) => ({
  kaptCode, yearMonth, complete: true, raw: {}, fetchedAt: new Date(), commonTotal: 1000n, ...o,
});

describe('runCollect 우선순위·재시도', () => {
  it('보여줄 데이터가 하나도 없는 단지를 먼저 받는다', async () => {
    // 0~4는 이전 달 데이터가 있고 5만 없다 → 한도가 1단지뿐이면 5를 받아야 한다
    await prisma.aptMaintenanceCost.createMany({ data: codes.slice(0, 5).map((c) => row(c, '202607')) });
    const seen: string[] = [];
    await runCollect({ months: [YM], kaptCodes: codes, limit: 1, concurrency: 1, fetchItem: async (op, k, ym) => { seen.push(k); return fakeFetch(op, k, ym); } });
    expect(new Set(seen)).toEqual(new Set([`${PREFIX}5`]));
  });

  it('빈 응답으로 끝난 달은 공개 지연일 수 있어 60일 동안 다시 받는다', async () => {
    await prisma.aptMaintenanceCost.createMany({
      data: [
        row(`${PREFIX}0`, YM, { commonTotal: null, fetchedAt: new Date('2026-09-15T00:00:00Z') }), // 월말+60일 이전 → 재시도
        row(`${PREFIX}1`, YM, { commonTotal: null, fetchedAt: new Date('2026-11-15T00:00:00Z') }), // 월말+60일 이후 → 확정
        ...codes.slice(2).map((c) => row(c, YM)),
      ],
    });
    const seen = new Set<string>();
    await runCollect({ months: [YM], kaptCodes: codes, concurrency: 1, fetchItem: async (op, k, ym) => { seen.add(k); return fakeFetch(op, k, ym); } });
    expect([...seen]).toEqual([`${PREFIX}0`]);
  });
});

describe('runCollect', () => {
  it('단지마다 31번 호출해 complete 행을 저장한다', async () => {
    let calls = 0;
    const r = await runCollect({ months: [YM], kaptCodes: codes, fetchItem: async (...a) => { calls++; return fakeFetch(...a); } });
    expect(r).toEqual({ saved: 6, quotaHit: false, timeUp: false });
    expect(calls).toBe(6 * COST_OPS.length);
    const row = await prisma.aptMaintenanceCost.findUniqueOrThrow({ where: { kaptCode_yearMonth: { kaptCode: `${PREFIX}0`, yearMonth: YM } } });
    expect(row.complete).toBe(true);
    expect(row.cleaning).toBe(1000n);
    expect(row.commonTotal).toBe(1000n);
    expect(row.heat).toBe(0n);
  });

  it('이미 complete인 (단지, 월)은 다시 부르지 않는다', async () => {
    await runCollect({ months: [YM], kaptCodes: codes, fetchItem: fakeFetch });
    let calls = 0;
    const r = await runCollect({ months: [YM], kaptCodes: codes, fetchItem: async (...a) => { calls++; return fakeFetch(...a); } });
    expect(r.saved).toBe(0);
    expect(calls).toBe(0);
  });

  it('오퍼레이션 하나가 실패하면 complete=false로 저장되고 다음 실행에서 다시 받는다', async () => {
    const flaky: FetchItem = async (op, kaptCode, ym) => {
      if (kaptCode === `${PREFIX}0` && op.op === 'getHsmpGuardCostInfoV3') throw new Error('HTTP 500');
      return fakeFetch(op, kaptCode, ym);
    };
    await runCollect({ months: [YM], kaptCodes: codes, fetchItem: flaky, concurrency: 1 });
    const bad = await prisma.aptMaintenanceCost.findUniqueOrThrow({ where: { kaptCode_yearMonth: { kaptCode: `${PREFIX}0`, yearMonth: YM } } });
    expect(bad.complete).toBe(false);
    const again = await runCollect({ months: [YM], kaptCodes: codes, fetchItem: fakeFetch });
    expect(again.saved).toBe(1);
  });

  it('한도 초과를 만나면 그 단지는 저장하지 않고 즉시 멈춘다', async () => {
    let n = 0;
    const quota: FetchItem = async (op, kaptCode, ym) => {
      if (++n > COST_OPS.length + 5) throw new QuotaExceededError();
      return fakeFetch(op, kaptCode, ym);
    };
    const r = await runCollect({ months: [YM], kaptCodes: codes, fetchItem: quota, concurrency: 1 });
    expect(r).toEqual({ saved: 1, quotaHit: true, timeUp: false });
    expect(await prisma.aptMaintenanceCost.count({ where: { kaptCode: { startsWith: PREFIX } } })).toBe(1);
  });
});

describe('runCollect 견고성', () => {
  it('한 단지의 저장이 DB 오류로 실패해도 나머지는 계속 저장한다', async () => {
    // jsonb는 \u0000을 받지 않는다 → 이 단지의 upsert만 실패
    const poison: FetchItem = async (op, kaptCode, ym) => {
      if (kaptCode === `${PREFIX}2` && op.op === 'getHsmpGuardCostInfoV3') return ok({ kaptCode, guardCost: 1, kaptName: 'bad\u0000' });
      return fakeFetch(op, kaptCode, ym);
    };
    const r = await runCollect({ months: [YM], kaptCodes: codes, fetchItem: poison, concurrency: 1 });
    expect(r.saved).toBe(5);
    expect(await prisma.aptMaintenanceCost.count({ where: { kaptCode: { startsWith: PREFIX }, yearMonth: YM } })).toBe(5);
  });

  it('시간 예산이 지나면 새 단지를 받지 않고 멈춘다', async () => {
    let calls = 0;
    const r = await runCollect({ months: [YM], kaptCodes: codes, deadline: Date.now() - 1, fetchItem: async (...a) => { calls++; return fakeFetch(...a); } });
    expect(r).toEqual({ saved: 0, quotaHit: false, timeUp: true });
    expect(calls).toBe(0);
  });
});

describe('refreshStats', () => {
  it('공용관리비 ㎡당 중앙값을 시군구 × 월로 저장한다', async () => {
    await runCollect({ months: [YM], kaptCodes: codes, fetchItem: fakeFetch });
    await refreshStats(YM);
    const stat = await prisma.aptMaintenanceCostStat.findUniqueOrThrow({ where: { sigunguCode_yearMonth: { sigunguCode: SGG, yearMonth: YM } } });
    // ㎡당 = 1,2,3,4,5,6 → 중앙값 3.5 → ROUND 4
    expect(stat.sampleCount).toBe(6);
    expect(stat.medianCommonPerM2).toBe(4);
  });

  it('표본이 5개 미만이면 저장하지 않는다', async () => {
    await runCollect({ months: [YM], kaptCodes: codes.slice(0, 4), fetchItem: fakeFetch });
    await refreshStats(YM);
    expect(await prisma.aptMaintenanceCostStat.findUnique({ where: { sigunguCode_yearMonth: { sigunguCode: SGG, yearMonth: YM } } })).toBeNull();
  });
});
