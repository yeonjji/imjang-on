import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { PropertyType, DealType } from '@prisma/client';
import {
  getLatestTransactionsByType,
  getMonthlyChartData,
  getAreaSummary,
  getSameFloorComparison,
  getFloorPremium,
  getTransactionFlags,
  getUnifiedTransactions,
  getTransactionCounts,
} from '@/lib/transaction';
import { getDongTransactions } from '@/lib/transaction/dong';
import { updatePropertyAggregates } from '@/scripts/ingest/aggregator';

// 해제 거래 두 형태 — 해제일 있음 / 해제 구분값('O')만 있고 해제일 없음(운영 2,863건) — 가
// 통계에서 빠지고 내역 표에는 표시되는지. 실데이터와 겹치지 않게 전용 지역 코드를 쓴다.
const REGION = '9990700000'; // briefing 테스트(99901)와 겹치지 않게
const SGG = '99907';
const UMD = 'UT유효동';
const DAY = 86_400_000;
const daysAgo = (n: number) => {
  const d = new Date(Date.now() - n * DAY);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};
let seq = 0;
function tx(
  propertyId: bigint,
  o: { dealType?: DealType; days: number; area?: number; floor?: number; amount?: number; deposit?: number; cancelType?: string | null; cancelDate?: Date | null },
) {
  const dealType = o.dealType ?? DealType.SALE;
  return {
    rawHash: `UT-VALID-${++seq}-${propertyId}`,
    propertyId,
    propertyType: PropertyType.APARTMENT,
    regionCode: REGION,
    sigunguCode: SGG,
    umd: UMD,
    dealType,
    contractDate: daysAgo(o.days),
    exclusiveArea: o.area ?? 84.9,
    floor: o.floor ?? 5,
    dealAmount: dealType === DealType.SALE ? (o.amount ?? 100000) : null,
    deposit: dealType === DealType.SALE ? null : (o.deposit ?? 60000),
    cancelType: o.cancelType ?? null,
    cancelDate: o.cancelDate ?? null,
    source: 'test',
  };
}

let p: bigint; // 정상 3건 + 해제 2건
let q: bigint; // 해제만 있는 매물
let r: bigint; // 층 회귀용: 정상 10건 + 해제 이상치 1건

beforeAll(async () => {
  await prisma.region.upsert({
    where: { code: REGION },
    create: { code: REGION, sido: 'UT도', sigungu: 'UT시', level: 2, isAbolished: false, fullName: 'UT도 UT시', sourceVersion: 'test' },
    update: {},
  });
  await prisma.property.deleteMany({ where: { regionCode: REGION } });
  const mk = (name: string) =>
    prisma.property.create({ data: { propertyType: PropertyType.APARTMENT, name, nameNorm: name, regionCode: REGION, address: `UT도 UT시 ${UMD} 1` } });
  p = (await mk('UT유효단지')).id;
  q = (await mk('UT해제단지')).id;
  r = (await mk('UT층회귀단지')).id;

  await prisma.transaction.createMany({
    data: [
      tx(p, { days: 30, amount: 100000 }),
      tx(p, { days: 200, amount: 98000 }),
      tx(p, { days: 10, amount: 300000, cancelDate: daysAgo(3) }), // 해제(해제일 있음) — 가장 최근
      tx(p, { days: 5, floor: 7, amount: 310000, cancelType: 'O' }), // 해제(구분값만) — 더 최근
      tx(p, { dealType: DealType.JEONSE, days: 20, deposit: 60000 }),
      tx(q, { days: 15, amount: 200000, cancelType: 'O', cancelDate: daysAgo(2) }),
      ...Array.from({ length: 10 }, (_, i) => tx(r, { days: 40 + i, floor: i + 1, amount: 100000 + i * 1000 })),
      tx(r, { days: 2, floor: 20, amount: 900000, cancelType: 'O' }),
    ],
  });
  // q의 저장 집계를 일부러 낡은 값으로 채워 둔다 — 재집계가 0/null로 되돌리는지 본다.
  await prisma.property.update({ where: { id: q }, data: { txCountTotal: 9, saleCount12m: 9, saleLastPrice: 200000n } });
});

afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { regionCode: REGION } });
  await prisma.property.deleteMany({ where: { regionCode: REGION } });
  await prisma.region.deleteMany({ where: { code: REGION } });
  await prisma.$disconnect();
});

describe('통계에서 해제 거래 제외', () => {
  it('최근 실거래(헤드라인)는 유효 거래 중 가장 최근', async () => {
    expect((await getLatestTransactionsByType(p)).SALE?.amountManwon).toBe(100000);
  });

  it('월별 그래프에 해제 거래가 들어가지 않는다', async () => {
    const sale = (await getMonthlyChartData(p)).SALE;
    expect(sale.reduce((s, m) => s + m.count, 0)).toBe(2);
    expect(Math.max(...sale.map((m) => m.max))).toBe(100000);
  });

  it('면적별 요약의 최근가·12개월 건수', async () => {
    const [a] = await getAreaSummary(p);
    expect(a).toMatchObject({ lastPrice: 100000, count12m: 2 });
  });

  it('동일 조건 직전 거래 비교', async () => {
    expect(await getSameFloorComparison(p)).toMatchObject({ recentPrice: 100000, prevPrice: 98000 });
  });

  it('층 회귀 표본에서 해제 이상치를 뺀다', async () => {
    expect((await getFloorPremium(r))?.n).toBe(10);
  });

  it('특이사항의 해제 건수는 두 형태를 모두 센다', async () => {
    expect((await getTransactionFlags(p))?.cancelledCount12m).toBe(2);
  });

  it('동네 최근 거래에 해제 거래(구분값만 있는 것 포함)를 보이지 않는다', async () => {
    const rows = await getDongTransactions({ sigunguCode: SGG, umd: UMD, dealType: DealType.SALE, limit: 50 });
    expect(rows.map((x) => x.dealAmount).sort()).not.toContain(310000);
    expect(rows.map((x) => x.dealAmount)).not.toContain(300000);
  });
});

describe('내역 표는 해제 거래를 표시한다', () => {
  it('기본: 전부 + cancelled 표시', async () => {
    const { rows, totalCount } = await getUnifiedTransactions(p, { page: 1, perPage: 15 });
    expect(totalCount).toBe(5);
    expect(rows.filter((x) => x.cancelled).map((x) => x.dealAmount).sort()).toEqual([300000, 310000]);
  });

  it('includeCancelled: false면 유효 거래만(요약 문장 근거용)', async () => {
    const { rows, totalCount } = await getUnifiedTransactions(p, { page: 1, perPage: 15, dealType: DealType.SALE, includeCancelled: false });
    expect(totalCount).toBe(2);
    expect(rows.every((x) => !x.cancelled)).toBe(true);
  });

  it('탭 건수는 내역 표와 같은 기준(해제 포함)', async () => {
    expect(await getTransactionCounts(p)).toEqual({ SALE: 4, JEONSE: 1, WOLSE: 0 });
  });
});

describe('매물 집계(updatePropertyAggregates)', () => {
  it('누적·12개월·최근가는 유효 거래 기준', async () => {
    await updatePropertyAggregates([p]);
    const x = await prisma.property.findUniqueOrThrow({ where: { id: p } });
    expect(x).toMatchObject({ txCountTotal: 3, saleCount12m: 2, saleLastPrice: 100000n, saleAvgPrice12m: 99000n, jeonseCount12m: 1 });
  });

  it('유효 거래가 하나도 없으면 0/null로 되돌린다(낡은 값 잔존 방지)', async () => {
    await updatePropertyAggregates([q]);
    const x = await prisma.property.findUniqueOrThrow({ where: { id: q } });
    expect(x).toMatchObject({ txCountTotal: 0, saleCount12m: 0, saleLastPrice: null, saleLastAt: null, lastTxAt: null });
  });
});
