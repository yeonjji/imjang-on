import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { PropertyType, DealType } from '@prisma/client';

// 실행 전체 차단기: 실제 runOne(원천 수신 → 매물 확정 → 재정합)을 runScopeTasks로 돌리고, 원천 API만 월별 응답으로 모킹한다.
const byMonth: Record<string, string> = {};
vi.mock('@/scripts/ingest/http', () => ({
  // 2쪽부터는 행 없는 페이지(totalCount는 그대로)
  fetchPage: vi.fn(async ({ dealYmd, pageNo }: { dealYmd: string; pageNo: number }) =>
    (pageNo === 1 ? byMonth[dealYmd] : byMonth[dealYmd].replace(/<item>.*?<\/item>/g, ''))),
}));
vi.mock('@/scripts/ingest/geocoder', async (importActual) => ({ ...(await importActual<object>()), geocode: vi.fn(async () => null) }));

import { prisma } from '@/lib/db';
import { runOne, runScopeTasks, ADAPTERS } from '@/scripts/ingest/transactions/runner';
import { RunBreaker, DEFAULT_LIMITS } from '@/scripts/ingest/transactions/run-breaker';

const REGION = '9991500000';
const SGG = '99915';
const NAME = 'UT차단기단지';
const MONTHS = ['202601', '202602', '202603', '202604', '202605', '202606'];
const LIMITS = { ...DEFAULT_LIMITS, minScopes: 3, minRows: 10 }; // 작은 표본으로 같은 규칙을 검증
let pid: bigint;

type Item = { day: number; amount: number; cancel?: boolean };
const xml = (ym: string, items: Item[]) => `<response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header><body><items>${items.map((i) =>
  `<item><aptNm>${NAME}</aptNm><dealYear>${ym.slice(0, 4)}</dealYear><dealMonth>${Number(ym.slice(4))}</dealMonth><dealDay>${i.day}</dealDay><excluUseAr>84.99</excluUseAr><floor>5</floor><dealAmount>${i.amount}</dealAmount><umdNm>UT동</umdNm><jibun>1</jibun>${i.cancel ? '<cdealType>O</cdealType><cdealDay>26.07.20</cdealDay>' : ''}</item>`).join('')}</items><totalCount>${items.length}</totalCount></body></response>`;
const ten = (cancelled = 0): Item[] => Array.from({ length: 10 }, (_, i) => ({ day: i + 1, amount: 10000 + i, cancel: i < cancelled }));
const keyOf = (ym: string) => ({ ym });
const run = (ym: string) => runOne(ADAPTERS['apt-trade'], SGG, REGION, ym);
const go = (months: string[], breaker: RunBreaker) =>
  runScopeTasks(months.map(keyOf), (k) => run(k.ym), { concurrency: 1, breaker, label: (k) => ({ yyyymm: k.ym }) });
const rowsOf = (ym: string) => prisma.transaction.findMany({
  where: { regionCode: REGION, contractDate: { gte: new Date(`${ym.slice(0, 4)}-${ym.slice(4)}-01T00:00:00Z`), lt: new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(4)), 1)) } },
  orderBy: { id: 'asc' }, select: { dealAmount: true, cancelType: true },
});

async function seedMonth(ym: string) {
  await prisma.transaction.createMany({ data: ten().map((i, n) => ({
    rawHash: `UT-BRK-${ym}-${n}`.padEnd(64, 'x'), propertyId: pid, propertyType: PropertyType.APARTMENT, regionCode: REGION, sigunguCode: SGG,
    dealType: DealType.SALE, contractDate: new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(4)) - 1, i.day)), exclusiveArea: 84.99, floor: 5,
    dealAmount: i.amount, source: ADAPTERS['apt-trade'].source,
  })) });
}

async function clean() {
  await prisma.propertyAggregateQueue.deleteMany({});
  await prisma.transactionArchive.deleteMany({ where: { sigunguCode: SGG } });
  const runs = (await prisma.ingestionRun.findMany({ where: { targetKey: { startsWith: `${SGG}-` } }, select: { id: true } })).map((r) => r.id);
  await prisma.reconcileInsert.deleteMany({ where: { runId: { in: runs } } });
  await prisma.ingestionRun.deleteMany({ where: { id: { in: runs } } });
  await prisma.transaction.deleteMany({ where: { regionCode: REGION } });
}

beforeAll(async () => {
  await prisma.region.upsert({ where: { code: REGION }, update: {},
    create: { code: REGION, sido: 'UT도', sigungu: 'UT차단시', level: 2, isAbolished: false, fullName: 'UT도 UT차단시', sourceVersion: 'test' } });
  await prisma.property.deleteMany({ where: { regionCode: REGION } });
  pid = (await prisma.property.create({ data: { propertyType: PropertyType.APARTMENT, name: NAME, nameNorm: NAME, regionCode: REGION, address: 'UT' } })).id;
});
beforeEach(async () => {
  await clean();
  for (const ym of MONTHS) { await seedMonth(ym); byMonth[ym] = xml(ym, ten()); }
});
afterAll(async () => {
  await clean();
  await prisma.property.deleteMany({ where: { regionCode: REGION } });
  await prisma.region.deleteMany({ where: { code: REGION } });
  await prisma.$disconnect();
});

describe('실행 전체 차단기(runScopeTasks + 실제 runOne)', () => {
  it('정상 범위만이면 끝까지 처리하고 멈추지 않는다', async () => {
    const b = new RunBreaker(LIMITS);
    const out = await go(MONTHS, b);
    expect(b.tripped).toBe(false);
    expect(out).toMatchObject({ failed: [], notStarted: [] });
    expect(out.done.map((d) => d.result.status)).toEqual(Array(6).fill('unchanged'));
  });

  it('여러 범위에 흩어진 이상(범위마다 가드 아래)도 누적 보관 비율로 멈추고, 이후 범위는 시작하지 않는다', async () => {
    for (const ym of MONTHS) byMonth[ym] = xml(ym, ten(2)); // 범위마다 2건(20%)씩 해제 → 범위 가드(max(10, 20%)) 통과
    const b = new RunBreaker(LIMITS);
    const out = await go(MONTHS, b);
    expect(b.trip).toMatchObject({ reason: 'archive-rate', totals: { finished: 3, dbRows: 30, archived: 6 } });
    expect(out.done.map((d) => d.key.ym)).toEqual(['202601', '202602', '202603']);
    expect(out.notStarted.map((k) => k.ym)).toEqual(['202604', '202605', '202606']);
    // 끝난 범위는 그대로(자동 롤백 없음), 시작하지 않은 범위는 변경 없음
    expect((await rowsOf('202601')).filter((r) => r.cancelType === 'O')).toHaveLength(2);
    expect((await rowsOf('202604')).every((r) => r.cancelType === null)).toBe(true);
    expect(await prisma.ingestionRun.count({ where: { targetKey: { in: ['99915-202604', '99915-202605', '99915-202606'] } } })).toBe(0);
  });

  it('정상 범위를 처리한 뒤 이상이 오는 범위에서 멈춘다', async () => {
    for (const ym of MONTHS.slice(3)) byMonth[ym] = xml(ym, ten(2));
    const b = new RunBreaker(LIMITS);
    const out = await go(MONTHS, b);
    expect(out.done.map((d) => [d.key.ym, d.result.status])).toEqual([['202601', 'unchanged'], ['202602', 'unchanged'], ['202603', 'unchanged'], ['202604', 'applied']]);
    expect(b.trip).toMatchObject({ reason: 'archive-rate', totals: { finished: 4, dbRows: 40, archived: 2 } }); // 2 / 40 = 5%
    expect(out.notStarted.map((k) => k.ym)).toEqual(['202605', '202606']);
  });

  it('자동 중단 후 재실행: 남은 범위만 처리되고, 끝난 범위를 다시 돌려도 중복·불일치가 없다', async () => {
    for (const ym of MONTHS) byMonth[ym] = xml(ym, ten(2));
    const first = await go(MONTHS, new RunBreaker(LIMITS));
    // 원인을 확인했다고 보고 기준을 풀어 재실행(운영은 doneRunFilter가 OK 범위를 건너뛴다 — 여기선 전부 다시 돌려 멱등도 본다)
    const second = await go(MONTHS, new RunBreaker({ ...LIMITS, maxArchiveRate: 1 }));
    expect(second.notStarted).toEqual([]);
    expect(second.done.map((d) => [d.key.ym, d.result.status])).toEqual(MONTHS.map((ym) =>
      [ym, first.done.some((x) => x.key.ym === ym) ? 'unchanged' : 'applied']));
    for (const ym of MONTHS) {
      const rows = await rowsOf(ym);
      expect(rows).toHaveLength(10);
      expect(rows.filter((r) => r.cancelType === 'O')).toHaveLength(2);
    }
    expect(await prisma.transactionArchive.count({ where: { sigunguCode: SGG } })).toBe(12); // 범위마다 2건, 한 번씩만
  });

  it('원천 오류가 이어지면 오류 건수 기준으로 멈춘다', async () => {
    for (const ym of MONTHS) byMonth[ym] = '<response><header><resultCode>99</resultCode><resultMsg>SERVICE ERROR</resultMsg></header></response>';
    const b = new RunBreaker({ ...LIMITS, maxErrors: 2 });
    const out = await go(MONTHS, b);
    expect(b.trip).toMatchObject({ reason: 'errors', value: 2 });
    expect(out.failed).toHaveLength(2);
    expect(out.notStarted).toHaveLength(4);
  });

  it('가드에 걸리는 범위 비율로 멈춘다(원천 불완전이 이어지는 경우)', async () => {
    for (const ym of MONTHS) byMonth[ym] = xml(ym, ten()).replace('<totalCount>10<', '<totalCount>11<');
    const b = new RunBreaker(LIMITS);
    const out = await go(MONTHS, b);
    expect(b.trip).toMatchObject({ reason: 'guard-rate' });
    expect(out.done).toHaveLength(3);
    expect(out.notStarted).toHaveLength(3);
    expect(await prisma.transactionArchive.count({ where: { sigunguCode: SGG } })).toBe(0);
  });
});
