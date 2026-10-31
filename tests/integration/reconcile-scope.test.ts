import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { PropertyType, DealType } from '@prisma/client';

// 대기열 넣기를 실패시켜 '재정합 도중 중단'을 만든다(다른 함수는 실제 구현).
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
import { reconcileScope, rollbackReconcileRun, dryRunReconcile, legacyHash, area2, type ApiTx, type ReconcileScope } from '@/scripts/ingest/transactions/reconcile';
import { drainAggregateQueue } from '@/scripts/ingest/aggregate-queue';

// S3 재정합: 실제 DB에서 가드·적용·멱등·보관/복원·중단·동시 실행·S1/S2 집계 연결.
const REGION = '9991200000';
const SGG = '99912';
const SOURCE = 'UT-REC';
const YM = '202606';
const D = (s: string) => new Date(`${s}T00:00:00Z`);
const O = { cancelType: 'O', cancelDate: D('2026-07-20') };
let p1: bigint; let p2: bigint;
let seq = 0;

type F = { propertyId?: bigint; contractDate?: Date; exclusiveArea?: number; floor?: number; dealAmount?: number; cancelType?: string | null; cancelDate?: Date | null };
const fields = (o: F) => ({
  propertyId: o.propertyId ?? p1, dealType: DealType.SALE, contractDate: o.contractDate ?? D('2026-06-10'),
  exclusiveArea: o.exclusiveArea ?? 84.99, floor: o.floor ?? 5, dealAmount: o.dealAmount ?? 100000,
  deposit: null, monthlyRent: null, cancelType: o.cancelType ?? null, cancelDate: o.cancelDate ?? null,
});
const api = (o: F = {}): ApiTx => {
  const f = fields(o);
  return { ...f, data: { ...f, propertyType: PropertyType.APARTMENT, regionCode: REGION, sigunguCode: SGG, source: SOURCE } };
};
const seedDb = async (o: F = {}) => {
  const f = fields(o);
  return prisma.transaction.create({ data: { ...f, rawHash: `UT-REC-${++seq}`.padEnd(64, '0'), propertyType: PropertyType.APARTMENT, regionCode: REGION, sigunguCode: SGG, source: SOURCE } });
};
const scope = (a: ApiTx[], o: Partial<ReconcileScope> = {}): ReconcileScope => ({ source: SOURCE, sigunguCode: SGG, yyyymm: YM, api: a, complete: true, totalCount: a.length, ...o });
const newRun = () => prisma.ingestionRun.create({ data: { source: SOURCE, targetKey: `${SGG}-${YM}`, status: 'RUNNING' } }).then((r) => r.id);
/** 범위 전체 거래를 비교 가능한 형태로(createdAt 포함 — 복원이 원래 행 그대로인지). */
const snapshot = async () => JSON.stringify(
  await prisma.transaction.findMany({ where: { regionCode: REGION }, orderBy: { id: 'asc' } }),
  (_k, v) => (typeof v === 'bigint' ? String(v) : v),
);
const rows = () => prisma.transaction.findMany({ where: { regionCode: REGION }, orderBy: { id: 'asc' } });

async function clean() {
  await prisma.propertyAggregateQueue.deleteMany({});
  await prisma.transactionArchive.deleteMany({ where: { sigunguCode: SGG } });
  const runs = (await prisma.ingestionRun.findMany({ where: { source: SOURCE }, select: { id: true } })).map((r) => r.id);
  await prisma.reconcileInsert.deleteMany({ where: { runId: { in: runs } } });
  await prisma.ingestionRun.deleteMany({ where: { source: SOURCE } });
  await prisma.transaction.deleteMany({ where: { regionCode: REGION } });
}

beforeAll(async () => {
  await prisma.region.upsert({
    where: { code: REGION },
    create: { code: REGION, sido: 'UT도', sigungu: 'UT재정합시', level: 2, isAbolished: false, fullName: 'UT도 UT재정합시', sourceVersion: 'test' },
    update: {},
  });
  await clean();
  await prisma.property.deleteMany({ where: { regionCode: REGION } });
  const mk = (n: string) => prisma.property.create({ data: { propertyType: PropertyType.APARTMENT, name: n, nameNorm: n, regionCode: REGION, address: 'UT' } }).then((p) => p.id);
  p1 = await mk('UT재정합1'); p2 = await mk('UT재정합2');
});
beforeEach(async () => { failEnqueue.on = false; await clean(); });
afterAll(async () => {
  await clean();
  await prisma.property.deleteMany({ where: { regionCode: REGION } });
  await prisma.region.deleteMany({ where: { code: REGION } });
  await prisma.$disconnect();
});

describe('가드 — 원천이 불완전·비정상이면 기존 거래를 바꾸지 않는다', () => {
  it('일부 페이지 누락(complete=false): skipped, 쓰기 없음, run은 OK가 아니다', async () => {
    await seedDb();
    const before = await snapshot();
    const run = await newRun();
    const r = await reconcileScope(scope([api(O)], { complete: false }), run);
    expect(r).toMatchObject({ status: 'skipped', skipReason: 'incomplete' });
    expect(await snapshot()).toBe(before);
    expect(await prisma.transactionArchive.count({ where: { sigunguCode: SGG } })).toBe(0);
    expect((await prisma.ingestionRun.findUniqueOrThrow({ where: { id: run } })).status).toBe('RUNNING');
  });

  it('받은 건수가 totalCount와 다르면(비정상 응답) skipped', async () => {
    await seedDb();
    const before = await snapshot();
    const r = await reconcileScope(scope([api(O)], { totalCount: 3 }), await newRun());
    expect(r).toMatchObject({ status: 'skipped', skipReason: 'incomplete' });
    expect(await snapshot()).toBe(before);
  });

  it('원천이 DB의 90% 미만으로 급감하면(shrink) skipped', async () => {
    for (let i = 0; i < 20; i++) await seedDb({ dealAmount: 100000 + i });
    const before = await snapshot();
    const a = Array.from({ length: 10 }, (_, i) => api({ dealAmount: 100000 + i }));
    const r = await reconcileScope(scope(a), await newRun());
    expect(r).toMatchObject({ status: 'skipped', skipReason: 'shrink' });
    expect(await snapshot()).toBe(before);
  });

  it('매매인데 금액이 없는 등 응답이 비정상이면 작은 범위라도 skipped(abnormal)', async () => {
    await seedDb();
    const before = await snapshot();
    const bad = { ...api(), dealAmount: null }; // 응답 형식이 바뀌어 금액이 비는 경우
    const r = await reconcileScope(scope([bad]), await newRun());
    expect(r).toMatchObject({ status: 'skipped', skipReason: 'abnormal' });
    expect(await snapshot()).toBe(before);
  });

  it('보관 대상이 max(10, DB의 20%)를 넘으면 skipped', async () => {
    for (let i = 0; i < 20; i++) await seedDb({ dealAmount: 100000 + i });
    const before = await snapshot();
    const a = Array.from({ length: 20 }, (_, i) => api({ dealAmount: 100000 + i, ...O }));
    const r = await reconcileScope(scope(a), await newRun());
    expect(r).toMatchObject({ status: 'skipped', skipReason: 'too-many-archives' });
    expect(await snapshot()).toBe(before);
  });
});

describe('적용 — 필수 사례', () => {
  it('해제 원거래 + 같은 조건 재신고: 정상 행은 유지, 해제 행만 추가', async () => {
    const d = await seedDb();
    const run = await newRun();
    const r = await reconcileScope(scope([api(), api(O)]), run);
    expect(r).toMatchObject({ status: 'applied', inserted: 1, archived: { cancel: 0, correction: 0 }, orphans: 0 });
    const all = await rows();
    expect(all.map((x) => [x.id === d.id, x.cancelType])).toEqual([[true, null], [false, 'O']]);
    expect(await prisma.reconcileInsert.count({ where: { runId: run } })).toBe(1);
    expect((await prisma.ingestionRun.findUniqueOrThrow({ where: { id: run } })).status).toBe('OK');
    expect((await prisma.propertyAggregateQueue.findMany()).map((q) => q.propertyId)).toEqual([p1]);
  });

  it('재신고 없이 해제만: 정상 행을 보관(cancel)하고 해제 행을 넣는다', async () => {
    const d = await seedDb();
    const run = await newRun();
    const r = await reconcileScope(scope([api(O)]), run);
    expect(r).toMatchObject({ status: 'applied', inserted: 1, archived: { cancel: 1 } });
    const arch = await prisma.transactionArchive.findMany({ where: { runId: run } });
    expect(arch).toHaveLength(1);
    expect(arch[0]).toMatchObject({ transactionId: d.id, reason: 'cancel', propertyId: p1, sigunguCode: SGG });
    expect((arch[0].row as { rawHash: string }).rawHash).toBe(d.rawHash);
    expect((await rows()).map((x) => x.cancelType)).toEqual(['O']);
  });

  it('같은 계약일·면적·층·금액 실거래 3건: 모두 남는다(고유 해시로 2건 보충)', async () => {
    await seedDb();
    const r = await reconcileScope(scope([api(), api(), api()]), await newRun());
    expect(r.inserted).toBe(2);
    const all = await rows();
    expect(all).toHaveLength(3);
    expect(new Set(all.map((x) => x.rawHash)).size).toBe(3);
  });

  it('정정 신고(금액 변경): 이전 값 보관(correction), 정정본 삽입', async () => {
    await seedDb({ dealAmount: 100000 });
    const r = await reconcileScope(scope([api({ dealAmount: 101000 })]), await newRun());
    expect(r).toMatchObject({ inserted: 1, archived: { correction: 1 } });
    expect((await rows()).map((x) => x.dealAmount)).toEqual([101000]);
  });

  it('수집 기간이 지난 뒤 추가 신고: 넣기만 하고 기존 행은 그대로', async () => {
    const d = await seedDb();
    const r = await reconcileScope(scope([api(), api({ contractDate: D('2026-06-28'), dealAmount: 90000 })]), await newRun());
    expect(r).toMatchObject({ inserted: 1, archived: { cancel: 0, correction: 0 } });
    expect((await rows())[0].id).toBe(d.id);
  });

  it('원천 대체가 없는 DB 행은 지우지 않는다(orphan 보고만)', async () => {
    await seedDb();
    const lone = await seedDb({ dealAmount: 55555, floor: 12 });
    const r = await reconcileScope(scope([api()]), await newRun());
    expect(r).toMatchObject({ status: 'unchanged', orphans: 1 });
    expect((await rows()).some((x) => x.id === lone.id)).toBe(true);
  });

  it('범위 밖(다른 달·다른 source) 행은 건드리지 않는다', async () => {
    const other = await seedDb({ contractDate: D('2026-07-01') });
    await reconcileScope(scope([api(O)]), await newRun());
    expect((await rows()).some((x) => x.id === other.id)).toBe(true);
  });

  it('삽입 해시가 테이블 어디에 있는 해시와도 겹치지 않는다(보관 후 같은 거래가 다시 들어와도)', async () => {
    const run = await newRun();
    await reconcileScope(scope([api()]), run); // 해시 h1로 삽입
    await reconcileScope(scope([api(O)]), await newRun()); // h1 행 보관, 해제본 삽입
    const r = await reconcileScope(scope([api(O), api()]), await newRun()); // 정상본이 다시 — h1은 보관됐으니 범위 안엔 없음
    expect(r).toMatchObject({ status: 'applied', inserted: 1 });
    expect(new Set((await rows()).map((x) => x.rawHash)).size).toBe(2);
  });

  it('계약일이 범위 달이 아닌 원천 행은 넣지 않는다(파싱 실패 시 오늘 날짜 등)', async () => {
    const r = await reconcileScope(scope([api(), api({ contractDate: D('2026-10-28') })]), await newRun());
    expect(r).toMatchObject({ inserted: 1, outOfMonth: 1 });
    expect(await rows()).toHaveLength(1);
  });

  it('같은 거래가 다른 범위(옛 시군구 코드)에 이미 있으면 넣지 않는다', async () => {
    const a = api({ floor: 3 });
    await prisma.transaction.create({ data: { ...a.data, sigunguCode: '99913', rawHash: legacyHash(a) } });
    const r = await reconcileScope(scope([a, api()]), await newRun());
    expect(r).toMatchObject({ inserted: 1, outOfScope: 1 });
    expect(await rows()).toHaveLength(2); // 옛 코드 행 1 + 새로 넣은 1
  });

  it('완전성은 받은 건수 + 제외 건수(단지명 없음)로 판단한다', async () => {
    const r = await reconcileScope(scope([api()], { totalCount: 2, excluded: 1 }), await newRun());
    expect(r.status).toBe('applied');
  });

  it('옛 파싱 오류 해제일(1926)을 원천 값으로 고친다', async () => {
    const d = await seedDb({ cancelType: 'O', cancelDate: D('1926-07-20') });
    const r = await reconcileScope(scope([api(O)]), await newRun());
    expect(r).toMatchObject({ status: 'applied', cancelDateRepaired: 1, inserted: 0 });
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: d.id } })).cancelDate).toEqual(D('2026-07-20'));
  });

  it('같은 원천으로 다시 돌리면 아무것도 바뀌지 않는다(멱등)', async () => {
    await seedDb(); await seedDb({ dealAmount: 100000, floor: 9 });
    const a = [api(), api(O), api(), api({ floor: 9, dealAmount: 101000 })];
    await reconcileScope(scope(a), await newRun());
    const after1 = await snapshot();
    const r2 = await reconcileScope(scope(a), await newRun());
    expect(r2).toMatchObject({ status: 'unchanged', inserted: 0, orphans: 0 });
    expect(await snapshot()).toBe(after1);
  });

  it('면적 셋째 자리 5(84.975 등)도 재실행 때 정정으로 오인하지 않는다(멱등)', async () => {
    const a = [api({ exclusiveArea: 84.975 }), api({ exclusiveArea: 8.075, floor: 2 }), api({ exclusiveArea: 1.005, floor: 3 })];
    await reconcileScope(scope(a), await newRun());
    const r = await reconcileScope(scope(a), await newRun());
    expect(r).toMatchObject({ status: 'unchanged', inserted: 0, archived: { cancel: 0, correction: 0 } });
  });

  it('area2는 DB Decimal(6,2) 저장값과 모든 값에서 같다(1.000~99.999 셋째 자리 전부)', async () => {
    const vals = Array.from({ length: 99_000 }, (_, i) => (1000 + i) / 1000);
    // 옛 수집기처럼 number 그대로 넣어 기존 행의 저장 규칙을 재현한다
    const data = vals.map((v, i) => ({ ...api().data, exclusiveArea: v, contractDate: D('2026-01-01'), rawHash: `UT-AREA-${String(i).padStart(6, '0')}`.padEnd(64, 'x') }));
    for (let i = 0; i < data.length; i += 10_000) await prisma.transaction.createMany({ data: data.slice(i, i + 10_000) });
    const rows = await prisma.transaction.findMany({ where: { rawHash: { startsWith: 'UT-AREA-' } }, select: { rawHash: true, exclusiveArea: true } });
    const stored = new Map(rows.map((r) => [r.rawHash, r.exclusiveArea.toFixed(2)]));
    const bad = vals.filter((v, i) => stored.get(`UT-AREA-${String(i).padStart(6, '0')}`.padEnd(64, 'x')) !== area2(v));
    expect(bad).toEqual([]);
  }, 120_000);

  it('dry-run은 결과만 보고하고 쓰지 않는다', async () => {
    await seedDb();
    const before = await snapshot();
    const r = await dryRunReconcile(scope([api(O)]));
    expect(r).toMatchObject({ status: 'dry-run', inserted: 1, archived: { cancel: 1 } });
    expect(await snapshot()).toBe(before);
  });
});

describe('보관·복원', () => {
  it('롤백하면 삽입분이 지워지고 보관분이 원래 id·값 그대로 돌아온다', async () => {
    await seedDb(); await seedDb({ dealAmount: 120000 }); await seedDb({ floor: 9 });
    const before = await snapshot();
    const run = await newRun();
    const r = await reconcileScope(scope([api(O), api({ dealAmount: 121000 }), api({ floor: 9 }), api({ floor: 9 })]), run);
    expect(r).toMatchObject({ inserted: 3, archived: { cancel: 1, correction: 1 } });
    expect(await rollbackReconcileRun(run)).toEqual({ removed: 3, restored: 2 });
    expect(await snapshot()).toBe(before);
    expect(await prisma.transactionArchive.count({ where: { runId: run } })).toBe(0);
    expect(await prisma.reconcileInsert.count({ where: { runId: run } })).toBe(0);
  });

  it('나중 실행이 복원 대상과 같은 거래를 다시 넣었으면 거부한다(롤백이 중복을 만들지 않게)', async () => {
    await seedDb({ dealAmount: 500000 });
    const r1 = await newRun();
    await reconcileScope(scope([api({ dealAmount: 510000 })]), r1); // 정정: 50만 보관, 51만 삽입
    const r2 = await newRun();
    await reconcileScope(scope([api({ dealAmount: 510000 }), api({ dealAmount: 500000 })]), r2); // 원천에 50만이 다시 나타남
    await expect(rollbackReconcileRun(r1)).rejects.toThrow(/최신 실행부터/);
    expect((await rows()).map((x) => x.dealAmount).sort()).toEqual([500000, 510000]);
  });

  it('변경이 없던 나중 실행은 롤백을 막지 않는다', async () => {
    await seedDb();
    const before = await snapshot();
    const r1 = await newRun();
    await reconcileScope(scope([api(O)]), r1);
    await reconcileScope(scope([api(O)]), await newRun()); // unchanged
    await rollbackReconcileRun(r1);
    expect(await snapshot()).toBe(before);
  });

  it('고친 해제일도 롤백으로 되돌아간다(이전 행을 보관해 둠)', async () => {
    await seedDb({ cancelType: 'O', cancelDate: D('1926-07-20') });
    const before = await snapshot();
    const run = await newRun();
    await reconcileScope(scope([api(O)]), run);
    expect(await prisma.transactionArchive.count({ where: { runId: run, reason: 'cancel-date' } })).toBe(1);
    await rollbackReconcileRun(run);
    expect(await snapshot()).toBe(before);
  });

  it('나중 실행이 바꾼 행이 있으면 앞 실행 롤백을 거부하고, 최신부터 되돌리면 된다', async () => {
    const before = await snapshot();
    const r1 = await newRun();
    await reconcileScope(scope([api()]), r1); // 정상본 삽입
    const r2 = await newRun();
    await reconcileScope(scope([api(O)]), r2); // r1이 넣은 행을 해제본으로 대체
    await expect(rollbackReconcileRun(r1)).rejects.toThrow(/최신 실행부터/);
    await rollbackReconcileRun(r2);
    await rollbackReconcileRun(r1);
    expect(await snapshot()).toBe(before);
  });
});

describe('중단·재실행·동시 실행', () => {
  it('도중 실패하면 보관·삭제·삽입 모두 롤백되고, 다시 실행하면 정상 적용된다', async () => {
    await seedDb();
    const before = await snapshot();
    const run = await newRun();
    failEnqueue.on = true;
    await expect(reconcileScope(scope([api(O), api({ floor: 7 })]), run)).rejects.toThrow('enqueue failed');
    expect(await snapshot()).toBe(before);
    expect(await prisma.transactionArchive.count({ where: { sigunguCode: SGG } })).toBe(0);
    expect(await prisma.reconcileInsert.count({ where: { runId: run } })).toBe(0);
    expect((await prisma.ingestionRun.findUniqueOrThrow({ where: { id: run } })).status).toBe('RUNNING');

    failEnqueue.on = false;
    const r = await reconcileScope(scope([api(O), api({ floor: 7 })]), await newRun());
    expect(r).toMatchObject({ status: 'applied', inserted: 2, archived: { cancel: 1 } });
  });

  it('같은 범위를 동시에 돌려도 직렬화되어 중복 삽입이 없다', async () => {
    await seedDb();
    const a = [api(), api(), api(O)];
    const [r1, r2] = [await newRun(), await newRun()];
    // 다른 트랜잭션이 범위 잠금을 쥔 동안 두 실행을 출발시켜, 잠금이 풀리는 순간 반드시 겹치게 한다.
    let release!: () => void;
    const gate = new Promise<void>((res) => { release = res; });
    let started!: () => void;
    const locked = new Promise<void>((res) => { started = res; });
    const holder = prisma.$transaction(async (t) => {
      await t.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reconcile:${SOURCE}:${SGG}:${YM}`}))`;
      started();
      await gate;
    }, { timeout: 30_000 });
    await locked;
    let done = 0;
    const runs = [reconcileScope(scope(a), r1), reconcileScope(scope(a), r2)].map((p) => p.then((r) => { done++; return r; }));
    await new Promise((res) => setTimeout(res, 300));
    expect(done).toBe(0); // 잠금을 기다린다
    release();
    await holder;
    const [x, y] = await Promise.all(runs);
    expect([x.status, y.status].sort()).toEqual(['applied', 'unchanged']);
    expect(await rows()).toHaveLength(3);
  });
});

describe('S1·S2 연결 — 재정합 후 대기열을 비우면 집계가 유효 거래 기준으로 맞는다', () => {
  it('해제로 바뀐 거래는 통계에서 빠지고, 매물만 다르게 확정된 거래는 원래 매물에 그대로 남는다', async () => {
    await seedDb({ dealAmount: 100000, contractDate: D('2026-06-05') });
    await seedDb({ dealAmount: 200000, contractDate: D('2026-06-20') }); // 나중에 해제됨
    await seedDb({ propertyId: p1, dealAmount: 300000, contractDate: D('2026-06-15'), floor: 2 }); // 원천은 p2로 확정
    await prisma.property.updateMany({ where: { id: { in: [p1, p2] } }, data: { txCountTotal: 3, saleLastPrice: 200000n } });
    const r = await reconcileScope(scope([
      api({ dealAmount: 100000, contractDate: D('2026-06-05') }),
      api({ dealAmount: 200000, contractDate: D('2026-06-20'), ...O }),
      api({ propertyId: p2, dealAmount: 300000, contractDate: D('2026-06-15'), floor: 2 }),
    ]), await newRun());
    expect(r).toMatchObject({ archived: { cancel: 1, correction: 0 }, inserted: 1, propertyMismatch: 1 });
    expect(r.affectedPropertyIds).toEqual([p1]);
    const d = await drainAggregateQueue({ batchSize: 10 });
    expect(d).toMatchObject({ processed: 1, stoppedBy: 'empty', remaining: 0 });
    const a1 = await prisma.property.findUniqueOrThrow({ where: { id: p1 } });
    expect(a1).toMatchObject({ txCountTotal: 2, saleLastPrice: 300000n, saleCount12m: 2 });
  });
});
