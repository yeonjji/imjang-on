import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { SubscriptionCategory, SubscriptionSource } from '@prisma/client';
import { runCollect, type FetchRows } from '@/scripts/ingest/subscription-results/runner';
import { QuotaExceededError } from '@/scripts/ingest/apt-complex/http';

const PFX = 'UT-SR-';
const DAY = 86_400_000;
const ids: Record<string, bigint> = {};
const today = new Date(new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10));
const daysAgo = (n: number) => new Date(today.getTime() - n * DAY);

async function notice(
  key: string,
  category: SubscriptionCategory,
  receiptEnd: Date | null,
  winnerDate: Date | null = null,
  houseManageNo: string | null = `${PFX}${key}`,
) {
  const n = await prisma.subscriptionNotice.create({
    data: {
      source: SubscriptionSource.APPLYHOME,
      category,
      sourceKey: `${PFX}${key}`,
      houseManageNo,
      name: `${PFX}${key}`,
      receiptEnd,
      winnerDate,
      rawJson: {},
    },
  });
  ids[key] = n.id;
}

const row = { HOUSE_TY: '084.9700A', SUBSCRPT_RANK_CODE: 1, RESIDE_SECD: '01', CMPET_RATE: '2.00', REQ_CNT: '20', SUPLY_HSHLDCO: 10 };
const calls: string[] = [];
const fakeOf =
  (over: Partial<Record<string, () => object[]>> = {}): FetchRows =>
  async (op, hmn) => {
    calls.push(`${op}:${hmn}`);
    const key = hmn.replace(PFX, '');
    const f = over[key];
    if (f) return f();
    return [row];
  };

async function cleanup() {
  const ns = await prisma.subscriptionNotice.findMany({ where: { sourceKey: { startsWith: PFX } } });
  const nids = ns.map((n) => n.id);
  await prisma.subscriptionResult.deleteMany({ where: { noticeId: { in: nids } } });
  await prisma.subscriptionNotice.deleteMany({ where: { id: { in: nids } } });
}

beforeAll(async () => {
  await cleanup();
  await notice('APT', SubscriptionCategory.APT, daysAgo(10), daysAgo(3));
  await notice('OFFI', SubscriptionCategory.OFFICETEL_ETC, daysAgo(200), daysAgo(190));
  await notice('FUTURE', SubscriptionCategory.APT, new Date(today.getTime() + 3 * DAY));
  await notice('TODAY', SubscriptionCategory.APT, today);
  await notice('NOHMN', SubscriptionCategory.APT, daysAgo(10), null, null);
  await notice('LH', SubscriptionCategory.LH_PRESUB, daysAgo(10));
});
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});
beforeEach(async () => {
  calls.length = 0;
  await prisma.subscriptionResult.deleteMany({ where: { noticeId: { in: Object.values(ids) } } });
});
const only = () => Object.values(ids);
const result = (k: string) => prisma.subscriptionResult.findUnique({ where: { noticeId: ids[k] } });

describe('runCollect', () => {
  it('접수가 끝난 청약홈 공고만, APT는 3개 오퍼레이션', async () => {
    const r = await runCollect({ fetchRows: fakeOf(), noticeIds: only() });
    expect(r.processed).toBe(2);
    expect(calls.sort()).toEqual(
      [
        `getAPTLttotPblancCmpet:${PFX}APT`,
        `getAPTSpsplyReqstStus:${PFX}APT`,
        `getAptLttotPblancScore:${PFX}APT`,
        `getUrbtyOfctlLttotPblancCmpet:${PFX}OFFI`,
      ].sort(),
    );
    const apt = await result('APT');
    expect(apt?.status).toBe('ok');
    expect(apt?.competition).toEqual([row]);
    expect(apt?.scores).toEqual([row]);
    const offi = await result('OFFI');
    expect(offi?.status).toBe('ok');
    expect(offi?.scores).toBeNull();
    expect(await result('FUTURE')).toBeNull();
    expect(await result('TODAY')).toBeNull();
    expect(await result('NOHMN')).toBeNull();
    expect(await result('LH')).toBeNull();
  });

  it('경쟁률이 비면 empty, 오류는 api_error', async () => {
    await runCollect({
      fetchRows: fakeOf({ APT: () => [], OFFI: () => { throw new Error('HTTP 500'); } }),
      noticeIds: only(),
    });
    expect((await result('APT'))?.status).toBe('empty');
    expect((await result('OFFI'))?.status).toBe('api_error');
  });

  it('한도 초과는 저장 없이 중단', async () => {
    const r = await runCollect({
      fetchRows: async () => { throw new QuotaExceededError(); },
      noticeIds: only(),
      concurrency: 1,
    });
    expect(r.quotaHit).toBe(true);
    expect(r.processed).toBe(0);
    expect(await prisma.subscriptionResult.count({ where: { noticeId: { in: only() } } })).toBe(0);
  });

  it('재수집: 당첨자 발표+30일 안은 20시간 지나면 다시, 지난 공고·방금 받은 공고는 안 받음', async () => {
    const old = new Date(Date.now() - 21 * 3600_000);
    const recent = new Date(Date.now() - 2 * 3600_000);
    await prisma.subscriptionResult.create({ data: { noticeId: ids.APT, status: 'ok', competition: [row], fetchedAt: old } });
    await prisma.subscriptionResult.create({ data: { noticeId: ids.OFFI, status: 'ok', competition: [row], fetchedAt: old } });
    await runCollect({ fetchRows: fakeOf(), noticeIds: only() });
    expect(calls.filter((c) => c.endsWith('APT'))).toHaveLength(3);
    expect(calls.filter((c) => c.endsWith('OFFI'))).toHaveLength(0);

    calls.length = 0;
    await prisma.subscriptionResult.update({ where: { noticeId: ids.APT }, data: { fetchedAt: recent } });
    await runCollect({ fetchRows: fakeOf(), noticeIds: only() });
    expect(calls).toHaveLength(0);
  });

  it('empty는 접수 마감+30일 안에서만 다시 받음', async () => {
    const old = new Date(Date.now() - 21 * 3600_000);
    await prisma.subscriptionResult.create({ data: { noticeId: ids.APT, status: 'empty', fetchedAt: old } });
    await prisma.subscriptionResult.create({ data: { noticeId: ids.OFFI, status: 'empty', fetchedAt: old } });
    await runCollect({ fetchRows: fakeOf(), noticeIds: only() });
    expect(calls.some((c) => c.endsWith('APT'))).toBe(true);
    expect(calls.some((c) => c.endsWith('OFFI'))).toBe(false);
  });

  it('이미 ok인 결과는 재수집 실패·빈 응답에도 지우지 않고 조회 시각만 갱신', async () => {
    const old = new Date(Date.now() - 21 * 3600_000);
    await prisma.subscriptionResult.create({ data: { noticeId: ids.APT, status: 'ok', competition: [row], fetchedAt: old } });
    await runCollect({ fetchRows: fakeOf({ APT: () => { throw new Error('HTTP 500'); } }), noticeIds: only() });
    const a = await result('APT');
    expect(a?.status).toBe('ok');
    expect(a?.competition).toEqual([row]);
    expect(a!.fetchedAt.getTime()).toBeGreaterThan(old.getTime());

    await prisma.subscriptionResult.update({ where: { noticeId: ids.APT }, data: { fetchedAt: old } });
    await runCollect({ fetchRows: fakeOf({ APT: () => [] }), noticeIds: only() });
    expect((await result('APT'))?.status).toBe('ok');
  });

  it('api_error는 다음 실행에서 다시 받는다(같은 실행에서는 한 번)', async () => {
    let n = 0;
    await runCollect({
      fetchRows: fakeOf({ OFFI: () => { n++; throw new Error('HTTP 500'); } }),
      noticeIds: only(),
    });
    expect(n).toBe(1);
    await runCollect({ fetchRows: fakeOf(), noticeIds: only() });
    expect((await result('OFFI'))?.status).toBe('ok');
  });

  it('시간 예산이 지나면 새 공고를 받지 않는다', async () => {
    const r = await runCollect({ fetchRows: fakeOf(), noticeIds: only(), deadline: Date.now() - 1 });
    expect(r.timeUp).toBe(true);
    expect(r.processed).toBe(0);
  });
});
