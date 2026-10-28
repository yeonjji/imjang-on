import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { PropertyType, DealType } from '@prisma/client';

// 수집기 한 단위(runOne): 원천 응답(모킹) → 매물 확정 → 재정합 → 단위 기록. 원천 API·지오코더만 가짜.
const pages: { xml: string[] } = { xml: [] };
vi.mock('@/scripts/ingest/http', () => ({
  fetchPage: vi.fn(async ({ pageNo }: { pageNo: number }) => pages.xml[pageNo - 1]),
}));
vi.mock('@/scripts/ingest/geocoder', async (importActual) => ({
  ...(await importActual<object>()),
  geocode: vi.fn(async () => null),
}));

import { prisma } from '@/lib/db';
import { runOne, ADAPTERS } from '@/scripts/ingest/transactions/runner';
import { drainAggregateQueue } from '@/scripts/ingest/aggregate-queue';

const REGION = '9991400000';
const SGG = '99914';
const SOURCE = ADAPTERS['apt-trade'].source;
type Item = { name?: string; day: number; amount: number; floor?: number; cancel?: boolean };
const xml = (items: Item[], total = items.length) => `<?xml version="1.0"?><response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header>
<body><items>${items.map((i) => `<item><aptNm>${i.name ?? 'UT수집단지'}</aptNm><dealYear>2026</dealYear><dealMonth>6</dealMonth><dealDay>${i.day}</dealDay>
<excluUseAr>84.99</excluUseAr><floor>${i.floor ?? 5}</floor><dealAmount>${i.amount.toLocaleString('en-US')}</dealAmount>
<umdNm>UT동</umdNm><jibun>1-1</jibun>${i.cancel ? '<cdealType>O</cdealType><cdealDay>26.07.20</cdealDay>' : '<cdealType> </cdealType><cdealDay> </cdealDay>'}</item>`).join('')}
</items><numOfRows>1000</numOfRows><pageNo>1</pageNo><totalCount>${total}</totalCount></body></response>`;

const runs = () => prisma.ingestionRun.findMany({ where: { source: SOURCE, targetKey: `${SGG}-202606` }, orderBy: { id: 'asc' } });
const txs = () => prisma.transaction.findMany({ where: { regionCode: { startsWith: SGG } }, orderBy: { id: 'asc' } });

async function clean() {
  await prisma.propertyAggregateQueue.deleteMany({});
  await prisma.transactionArchive.deleteMany({ where: { sigunguCode: SGG } });
  const ids = (await runs()).map((r) => r.id);
  await prisma.reconcileInsert.deleteMany({ where: { runId: { in: ids } } });
  await prisma.ingestionRun.deleteMany({ where: { id: { in: ids } } });
  await prisma.transaction.deleteMany({ where: { regionCode: { startsWith: SGG } } });
  await prisma.property.deleteMany({ where: { regionCode: { startsWith: SGG } } });
}

beforeAll(async () => {
  await prisma.region.upsert({
    where: { code: REGION },
    create: { code: REGION, sido: 'UT도', sigungu: 'UT수집시', level: 2, isAbolished: false, fullName: 'UT도 UT수집시', sourceVersion: 'test' },
    update: {},
  });
});
beforeEach(clean);
afterAll(async () => {
  await clean();
  await prisma.region.deleteMany({ where: { code: REGION } });
  await prisma.$disconnect();
});

describe('runOne — 재정합 수집', () => {
  it('새 매물·거래를 넣고 OK, 같은 응답으로 다시 돌리면 변경 없음', async () => {
    pages.xml = [xml([{ day: 3, amount: 100000 }, { day: 3, amount: 100000 }, { day: 9, amount: 110000, cancel: true }])];
    const r1 = await runOne(ADAPTERS['apt-trade'], SGG, REGION, '202606');
    expect(r1).toMatchObject({ status: 'applied', inserted: 3 });
    const t = await txs();
    expect(t.map((x) => [x.dealAmount, x.cancelType, x.cancelDate?.toISOString().slice(0, 10) ?? null]))
      .toEqual([[100000, null, null], [100000, null, null], [110000, 'O', '2026-07-20']]);
    expect(t[0].sigunguCode).toBe(SGG);
    const r2 = await runOne(ADAPTERS['apt-trade'], SGG, REGION, '202606');
    expect(r2).toMatchObject({ status: 'unchanged', inserted: 0 });
    expect((await runs()).map((r) => r.status)).toEqual(['OK', 'OK']);
    expect(await txs()).toHaveLength(3);
  });

  it('해제 반영 → 대기열 → 집계: 해제된 거래는 통계에서 빠진다', async () => {
    pages.xml = [xml([{ day: 3, amount: 100000 }, { day: 9, amount: 110000 }])];
    await runOne(ADAPTERS['apt-trade'], SGG, REGION, '202606');
    await drainAggregateQueue();
    pages.xml = [xml([{ day: 3, amount: 100000 }, { day: 9, amount: 110000, cancel: true }])];
    const r = await runOne(ADAPTERS['apt-trade'], SGG, REGION, '202606');
    expect(r).toMatchObject({ inserted: 1, archived: { cancel: 1 } });
    await drainAggregateQueue();
    const p = await prisma.property.findFirstOrThrow({ where: { regionCode: { startsWith: SGG } } });
    expect(p).toMatchObject({ txCountTotal: 1, saleLastPrice: 100000n });
    expect(p.saleCount12m).toBe(1);
    expect(p.propertyType).toBe(PropertyType.APARTMENT);
    expect((await txs()).every((x) => x.dealType === DealType.SALE)).toBe(true);
  });

  it('원천 건수가 totalCount보다 적으면(페이지 누락) 아무것도 쓰지 않고 단위는 ERROR', async () => {
    pages.xml = [xml([{ day: 3, amount: 100000 }])];
    await runOne(ADAPTERS['apt-trade'], SGG, REGION, '202606');
    const before = await txs();
    pages.xml = [xml([{ day: 3, amount: 100000, cancel: true }], 2), xml([], 2)]; // totalCount=2인데 2쪽이 비어 1건만 옴
    const r = await runOne(ADAPTERS['apt-trade'], SGG, REGION, '202606');
    expect(r).toMatchObject({ status: 'skipped', skipReason: 'incomplete' });
    expect(await txs()).toEqual(before);
    const last = (await runs()).at(-1)!;
    expect(last.status).toBe('ERROR');
    expect(last.errorMessage).toMatch(/reconcile skipped: incomplete/);
  });

  it('비정상 응답(오류 코드)이면 예외, 쓰기 없음, 단위 ERROR', async () => {
    pages.xml = [xml([{ day: 3, amount: 100000 }])];
    await runOne(ADAPTERS['apt-trade'], SGG, REGION, '202606');
    const before = await txs();
    pages.xml = ['<response><header><resultCode>99</resultCode><resultMsg>SERVICE ERROR</resultMsg></header></response>'];
    await expect(runOne(ADAPTERS['apt-trade'], SGG, REGION, '202606')).rejects.toThrow();
    expect(await txs()).toEqual(before);
    expect((await runs()).at(-1)!.status).toBe('ERROR');
  });

  it('단지명 없는 원천 행은 빼되 완전성 판단에는 넣는다', async () => {
    pages.xml = [xml([{ day: 3, amount: 100000 }, { name: '', day: 4, amount: 1 }])];
    const r = await runOne(ADAPTERS['apt-trade'], SGG, REGION, '202606');
    expect(r).toMatchObject({ status: 'applied', inserted: 1 });
  });
});
