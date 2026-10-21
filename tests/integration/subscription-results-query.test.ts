import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { SubscriptionCategory, SubscriptionSource } from '@prisma/client';
import { getSubscriptionResults } from '@/lib/subscription-results-query';

const PFX = 'UT-SRQ-';
const ids: Record<string, bigint> = {};
const row = { HOUSE_TY: '084.9700A', SUBSCRPT_RANK_CODE: 1, RESIDE_SECD: '01', CMPET_RATE: '2.00', REQ_CNT: '20', SUPLY_HSHLDCO: 10 };

async function cleanup() {
  const ns = await prisma.subscriptionNotice.findMany({ where: { sourceKey: { startsWith: PFX } } });
  const nids = ns.map((n) => n.id);
  await prisma.subscriptionResult.deleteMany({ where: { noticeId: { in: nids } } });
  await prisma.subscriptionNotice.deleteMany({ where: { id: { in: nids } } });
}

beforeAll(async () => {
  await cleanup();
  for (const k of ['OK', 'EMPTY', 'NONE']) {
    const n = await prisma.subscriptionNotice.create({
      data: { source: SubscriptionSource.APPLYHOME, category: SubscriptionCategory.APT, sourceKey: `${PFX}${k}`, name: k, rawJson: {} },
    });
    ids[k] = n.id;
  }
  await prisma.subscriptionResult.create({ data: { noticeId: ids.OK, status: 'ok', competition: [row], fetchedAt: new Date('2026-10-20T01:00:00Z') } });
  await prisma.subscriptionResult.create({ data: { noticeId: ids.EMPTY, status: 'empty', fetchedAt: new Date() } });
});
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('getSubscriptionResults', () => {
  it('ok 행만 표시 모델과 KST 조회일로', async () => {
    const r = await getSubscriptionResults(ids.OK, 'APT');
    expect(r?.fetchedLabel).toBe('2026-10-20');
    expect(r?.view.kind).toBe('apt');
  });
  it('empty·행 없음은 null', async () => {
    expect(await getSubscriptionResults(ids.EMPTY, 'APT')).toBeNull();
    expect(await getSubscriptionResults(ids.NONE, 'APT')).toBeNull();
  });
});
