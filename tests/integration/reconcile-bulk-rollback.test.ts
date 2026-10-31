import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PropertyType, DealType } from '@prisma/client';

// 롤백 도중 실패(트랜잭션 중간 예외)를 만들 수 있게 대기열 넣기만 부분 모킹한다.
const failEnqueueOnCall = { n: 0, count: 0 };
vi.mock('@/scripts/ingest/aggregate-queue', async (importActual) => {
  const actual = await importActual<typeof import('@/scripts/ingest/aggregate-queue')>();
  return {
    ...actual,
    enqueuePropertyAggregates: vi.fn(async (...args: Parameters<typeof actual.enqueuePropertyAggregates>) => {
      failEnqueueOnCall.count++;
      if (failEnqueueOnCall.n && failEnqueueOnCall.count === failEnqueueOnCall.n) throw new Error('crash during rollback');
      return actual.enqueuePropertyAggregates(...args);
    }),
  };
});

import { prisma } from '@/lib/db';
import { reconcileScope, rollbackReconcileRun, type ApiTx } from '@/scripts/ingest/transactions/reconcile';
import { bulkRollback, planBulkRollback } from '@/scripts/ingest/transactions/reconcile-rollback';
import { updatePropertyAggregates } from '@/scripts/ingest/aggregator';
import { setHalt, HALT_SOURCE } from '@/scripts/ingest/transactions/halt';
import { drainAggregateQueue } from '@/scripts/ingest/aggregate-queue';

const REGION = '9991600000';
const SGG = '99916';
const SOURCE = 'UT-BULK';
const D = (s: string) => new Date(`${s}T00:00:00Z`);
const T0 = new Date('2026-11-01T00:00:00Z');
const H = (h: number) => new Date(T0.getTime() + h * 3_600_000);
let pid: bigint;
let seq = 0;
let dir: string;

type F = { day: string; amount: number; cancelType?: string | null; cancelDate?: Date | null };
const fields = (o: F) => ({ propertyId: pid, dealType: DealType.SALE, contractDate: D(o.day), exclusiveArea: 84.99, floor: 5, dealAmount: o.amount,
  deposit: null, monthlyRent: null, cancelType: o.cancelType ?? null, cancelDate: o.cancelDate ?? null });
const api = (o: F): ApiTx => { const f = fields(o); return { ...f, data: { ...f, propertyType: PropertyType.APARTMENT, regionCode: REGION, sigunguCode: SGG, source: SOURCE } }; };
const seed = (o: F) => prisma.transaction.create({ data: { ...fields(o), rawHash: `UT-BULK-${++seq}`.padEnd(64, 'x'), propertyType: PropertyType.APARTMENT, regionCode: REGION, sigunguCode: SGG, source: SOURCE } });
const O = { cancelType: 'O', cancelDate: D('2026-07-20') };

/** 범위 하나를 재정합하고 그 실행의 끝난 시각을 at으로 맞춘다(기간 필터 검증용). */
async function reconcileAt(ym: string, rows: ApiTx[], at: Date) {
  const run = await prisma.ingestionRun.create({ data: { source: SOURCE, targetKey: `${SGG}-${ym}`, status: 'RUNNING' } });
  const r = await reconcileScope({ source: SOURCE, sigunguCode: SGG, yyyymm: ym, api: rows, complete: true, totalCount: rows.length }, run.id);
  await prisma.ingestionRun.update({ where: { id: run.id }, data: { finishedAt: at } });
  return { runId: run.id, r };
}

const snapTx = async () => JSON.stringify(await prisma.transaction.findMany({ where: { regionCode: REGION }, orderBy: { id: 'asc' } }),
  (_k, v) => (typeof v === 'bigint' ? String(v) : v));
const snapAgg = async () => JSON.stringify(await prisma.property.findUniqueOrThrow({ where: { id: pid } }), (_k, v) => (typeof v === 'bigint' ? String(v) : v));

async function clean() {
  await prisma.propertyAggregateQueue.deleteMany({});
  await prisma.transactionArchive.deleteMany({ where: { sigunguCode: SGG } });
  const runs = (await prisma.ingestionRun.findMany({ where: { source: SOURCE }, select: { id: true } })).map((r) => r.id);
  await prisma.reconcileInsert.deleteMany({ where: { runId: { in: runs } } });
  await prisma.ingestionRun.deleteMany({ where: { source: { in: [SOURCE, HALT_SOURCE] } } });
  await prisma.ingestionRun.deleteMany({ where: { source: 'molit-ut-bulk' } });
  await prisma.transaction.deleteMany({ where: { regionCode: REGION } });
}

let pre: { tx: string; agg: string };
let runs: bigint[];

beforeAll(async () => {
  await prisma.region.upsert({ where: { code: REGION }, update: {},
    create: { code: REGION, sido: 'UT도', sigungu: 'UT롤백시', level: 2, isAbolished: false, fullName: 'UT도 UT롤백시', sourceVersion: 'test' } });
  await prisma.property.deleteMany({ where: { regionCode: REGION } });
  pid = (await prisma.property.create({ data: { propertyType: PropertyType.APARTMENT, name: 'UT롤백', nameNorm: 'UT롤백', regionCode: REGION, address: 'UT' } })).id;
});

beforeEach(async () => {
  failEnqueueOnCall.n = 0; failEnqueueOnCall.count = 0;
  dir = mkdtempSync(join(tmpdir(), 'bulk-rb-'));
  await clean();
  // 범위 3개: 해제(1월) · 정정(2월) · 지연 신고 + 옛 해제일 수정(3월)
  await seed({ day: '2026-01-05', amount: 100 }); await seed({ day: '2026-01-06', amount: 110 });
  await seed({ day: '2026-02-05', amount: 200 }); await seed({ day: '2026-02-06', amount: 210 });
  await seed({ day: '2026-03-05', amount: 300 }); await seed({ day: '2026-03-06', amount: 310, cancelType: 'O', cancelDate: D('1926-07-20') });
  await updatePropertyAggregates([pid]);
  pre = { tx: await snapTx(), agg: await snapAgg() };
  runs = [
    (await reconcileAt('202601', [api({ day: '2026-01-05', amount: 100, ...O }), api({ day: '2026-01-06', amount: 110 })], H(1))).runId,
    (await reconcileAt('202602', [api({ day: '2026-02-05', amount: 205 }), api({ day: '2026-02-06', amount: 210 })], H(2))).runId,
    (await reconcileAt('202603', [api({ day: '2026-03-05', amount: 300 }), api({ day: '2026-03-06', amount: 310, ...O }), api({ day: '2026-03-20', amount: 320 })], H(3))).runId,
  ];
  await drainAggregateQueue();
  await setHalt('test: 일괄 롤백 준비'); // --apply는 수집 정지 상태에서만 된다
});
afterAll(async () => {
  await clean();
  await prisma.property.deleteMany({ where: { regionCode: REGION } });
  await prisma.region.deleteMany({ where: { code: REGION } });
  await prisma.$disconnect();
});

const lockFile = () => join(dir, 'rb.lock');
const auditLines = () => readdirSync(dir).filter((f) => f.endsWith('.jsonl')).flatMap((f) => readFileSync(join(dir, f), 'utf8').trim().split('\n').map((l) => JSON.parse(l)));

describe('기간 일괄 롤백', () => {
  it('dry-run(기본): 대상(최신부터)·예상 변경만 보고하고 쓰지 않는다', async () => {
    const after = await snapTx();
    const r = await bulkRollback({ since: T0 }, { lockFile: lockFile() });
    expect(r.stoppedBy).toBe('dry-run');
    expect(r.plan.targets.map((t) => t.runId)).toEqual([...runs].reverse());
    expect(r.plan.expected).toEqual({ runs: 3, remove: 3, restore: 2, cancelDate: 1, properties: 1 });
    expect(await snapTx()).toBe(after);
  });

  it('--apply: 최신부터 되돌려 거래·집계가 재정합 전과 같아지고, 검증·감사 로그를 남긴다', async () => {
    const r = await bulkRollback({ since: T0 }, { apply: true, auditDir: dir, lockFile: lockFile() });
    expect(r).toMatchObject({ stoppedBy: 'done', rolledBack: 3, removed: 3, restored: 2,
      verify: { txDelta: -1, expectedTxDelta: -1, leftoverRecords: 0, aggregateDiffs: 0, ok: true } });
    expect(await snapTx()).toBe(pre.tx); // id·생성 시각·해제일까지 체크섬 일치
    expect(await snapAgg()).toBe(pre.agg.replace(/"updatedAt":"[^"]+"/, (await snapAgg()).match(/"updatedAt":"[^"]+"/)![0]));
    const lines = auditLines();
    expect(lines.map((l) => l.event)).toEqual(['start', 'run', 'run', 'run', 'end']);
    expect(lines.filter((l) => l.event === 'run').map((l) => l.runId)).toEqual([...runs].reverse().map(String));
    expect(lines[0]).toMatchObject({ apply: true, filter: { since: T0.toISOString() }, expected: { runs: 3 } });
    expect(lines.at(-1)).toMatchObject({ stoppedBy: 'done', verify: { ok: true } });
    // 되돌린 실행은 완료로 남지 않아 다음 수집이 그 범위를 다시 처리한다
    expect((await prisma.ingestionRun.findMany({ where: { id: { in: runs } } })).map((x) => x.status)).toEqual(['ERROR', 'ERROR', 'ERROR']);
  });

  it('--apply는 수집이 정지돼 있지 않으면 아무것도 쓰지 않고 거부한다', async () => {
    await prisma.ingestionRun.deleteMany({ where: { source: HALT_SOURCE } });
    const before = await snapTx();
    const r = await bulkRollback({ since: T0 }, { apply: true, auditDir: dir, lockFile: lockFile() });
    expect(r).toMatchObject({ stoppedBy: 'not-halted', rolledBack: 0 });
    expect(await snapTx()).toBe(before);
  });

  it('--apply는 진행 중인 수집 단위가 있으면 거부한다', async () => {
    await prisma.ingestionRun.create({ data: { source: 'molit-ut-bulk', targetKey: '99916-202610', status: 'RUNNING' } });
    const before = await snapTx();
    const r = await bulkRollback({ since: T0 }, { apply: true, auditDir: dir, lockFile: lockFile() });
    expect(r).toMatchObject({ stoppedBy: 'collection-running', rolledBack: 0 });
    expect(await snapTx()).toBe(before);
  });

  it('--apply에는 감사 로그 디렉터리가 필요하다', async () => {
    await expect(bulkRollback({ since: T0 }, { apply: true, lockFile: lockFile() })).rejects.toThrow(/audit-dir/);
  });

  it('기간 밖 실행은 그대로 둔다(1:30~2:30 → 2월 실행만)', async () => {
    const r = await bulkRollback({ since: H(1.5), until: H(2.5) }, { apply: true, auditDir: dir, lockFile: lockFile() });
    expect(r.plan.targets.map((t) => t.runId)).toEqual([runs[1]]);
    const left = (await planBulkRollback({ since: T0 })).targets.map((t) => t.runId);
    expect(left).toEqual([runs[2], runs[0]]);
  });

  it('이미 롤백된 실행은 대상에서 빠져 중복 처리하지 않는다', async () => {
    await rollbackReconcileRun(runs[2]);
    const r = await bulkRollback({ since: T0 }, { apply: true, auditDir: dir, lockFile: lockFile() });
    expect(r.plan.targets.map((t) => t.runId)).toEqual([runs[1], runs[0]]);
    expect(r).toMatchObject({ rolledBack: 2, stoppedBy: 'done', verify: { ok: true } });
    expect(await snapTx()).toBe(pre.tx);
  });

  it('기간 뒤에 같은 범위를 변경 없이 다시 돈 실행(정상 작업)은 충돌이 아니다', async () => {
    await reconcileAt('202601', [api({ day: '2026-01-05', amount: 100, ...O }), api({ day: '2026-01-06', amount: 110 })], H(10)); // unchanged
    const r = await bulkRollback({ since: T0, until: H(5) }, { apply: true, auditDir: dir, lockFile: lockFile() });
    expect(r).toMatchObject({ stoppedBy: 'done', rolledBack: 3, verify: { ok: true } });
    expect(await snapTx()).toBe(pre.tx);
  });

  it('기간 뒤에 같은 범위의 행을 바꾼 실행이 있으면 충돌로 거부하고 아무것도 쓰지 않는다', async () => {
    await reconcileAt('202602', [api({ day: '2026-02-05', amount: 205 }), api({ day: '2026-02-06', amount: 210, ...O })], H(10)); // 2월 범위를 다시 바꿈
    const before = await snapTx();
    const r = await bulkRollback({ since: T0, until: H(5) }, { apply: true, auditDir: dir, lockFile: lockFile() });
    expect(r.stoppedBy).toBe('conflict');
    expect(r.plan.conflicts).toEqual([expect.objectContaining({ runId: runs[1], targetKey: `${SGG}-202602` })]);
    expect(r.rolledBack).toBe(0);
    expect(await snapTx()).toBe(before);
    expect(auditLines().at(-1)).toMatchObject({ stoppedBy: 'conflict' });
  });

  it('롤백 도중 실패(두 번째 실행의 트랜잭션 중간 예외): 앞 실행만 되돌려진 채 일관, 다시 돌리면 나머지를 마친다', async () => {
    failEnqueueOnCall.count = 0; failEnqueueOnCall.n = 2; // 두 번째 실행의 롤백 트랜잭션 안에서 실패
    const r1 = await bulkRollback({ since: T0 }, { apply: true, auditDir: dir, lockFile: lockFile() });
    expect(r1).toMatchObject({ stoppedBy: 'error', rolledBack: 1 });
    // 두 번째(2월) 실행은 그대로 남아 다시 대상이 된다 — 반쯤 되돌린 상태가 없다
    const left = await planBulkRollback({ since: T0 });
    expect(left.targets.map((t) => t.runId)).toEqual([runs[1], runs[0]]);
    expect(left.expected).toMatchObject({ remove: 2, restore: 2 });
    failEnqueueOnCall.n = 0;
    const r2 = await bulkRollback({ since: T0 }, { apply: true, auditDir: dir, lockFile: lockFile() });
    expect(r2).toMatchObject({ stoppedBy: 'done', rolledBack: 2, verify: { ok: true } });
    expect(await snapTx()).toBe(pre.tx);
    expect(auditLines().filter((l) => l.event === 'run' && l.ok === false)).toHaveLength(1);
  });

  it('같은 잠금 파일로 두 번 동시에 실행할 수 없다', async () => {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(lockFile(), 'other');
    await expect(bulkRollback({ since: T0 }, { lockFile: lockFile() })).rejects.toThrow(/실행 중/);
  });
});
