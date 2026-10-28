/**
 * 기간 단위 일괄 롤백(S3). 한 기간에 끝난 재정합 실행들을 **최신부터** 하나씩 되돌린다(실행 하나 = rollbackReconcileRun 트랜잭션 하나).
 * 설계: docs/superpowers/specs/2026-10-27-property-aggregate-integrity-design.md §15
 *
 * - 기본은 dry-run: 대상 실행·예상 변경(삭제·복원·해제일 복원)·충돌만 보고하고 쓰지 않는다. 실제 롤백은 apply=true일 때만.
 * - 대상: 기간 안에 OK로 끝났고, 아직 되돌릴 기록(ReconcileInsert·TransactionArchive)이 남은 실행. 되돌린 실행은 기록이 지워져
 *   다시 대상이 되지 않는다(중복 롤백 없음).
 * - 충돌: 같은 범위(source·targetKey)에서 대상보다 나중에 행을 넣거나 보관한 **대상 밖** 실행이 있으면 그 범위를 되돌릴 수 없다
 *   (복원이 중복·해시 충돌을 만든다). 충돌이 하나라도 있으면 apply는 아무것도 쓰지 않고 거부한다.
 *   변경 없이 끝난 나중 실행(unchanged)은 충돌이 아니다.
 * - 중간 실패·강제 종료: 끝난 실행은 되돌려진 채로, 나머지는 그대로 남는다(실행마다 트랜잭션). 같은 명령을 다시 돌리면 남은 것만 한다.
 * - 검증: 전후 거래 수 변화 = 복원 − 삭제, 되돌린 실행의 기록이 남지 않음, 대기열을 비운 뒤 관련 매물 집계 차이 0.
 * - 감사 로그(JSONL): 시작(조건·계획) · 실행마다(실행 ID·범위·건수·결과) · 끝(합계·검증).
 * - 수집과의 충돌 방지: --apply는 수집이 정지(halt.ts)돼 있고, 최근 3시간 안에 시작해 아직 끝나지 않은 수집 단위가 없을 때만 한다.
 */
import { appendFileSync, closeSync, mkdirSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { rollbackReconcileRun } from './reconcile';
import { getHalt } from './halt';
import { drainAggregateQueue } from '@/scripts/ingest/aggregate-queue';
import { diffPropertyAggregates } from '@/scripts/ingest/aggregator';

export interface BulkRollbackFilter {
  /** 이 시각 이후(포함)에 끝난 실행 */
  since: Date;
  /** 이 시각 전(미포함)에 끝난 실행. 없으면 지금까지 */
  until?: Date;
  source?: string;
  sigunguCode?: string;
}

export interface RollbackTarget {
  runId: bigint;
  source: string;
  targetKey: string;
  finishedAt: Date;
  /** 지울 삽입 행(아직 남아 있는 것) */
  remove: number;
  /** 복원할 보관 행(해제·정정) */
  restore: number;
  /** 되돌릴 해제일 수정 */
  cancelDate: number;
}

export interface RollbackConflict {
  runId: bigint;
  source: string;
  targetKey: string;
  laterRunId: bigint;
  laterFinishedAt: Date | null;
}

export interface BulkRollbackPlan {
  filter: BulkRollbackFilter;
  /** 최신 실행부터 */
  targets: RollbackTarget[];
  conflicts: RollbackConflict[];
  expected: { runs: number; remove: number; restore: number; cancelDate: number; properties: number };
}

export interface BulkRollbackResult {
  apply: boolean;
  plan: BulkRollbackPlan;
  rolledBack: number;
  removed: number;
  restored: number;
  stoppedBy: 'done' | 'dry-run' | 'conflict' | 'not-halted' | 'collection-running' | 'error';
  error?: string;
  verify?: { txDelta: number; expectedTxDelta: number; leftoverRecords: number; aggregateDiffs: number; ok: boolean };
  auditFile?: string;
}

const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? String(x) : x));

function whereRuns(f: BulkRollbackFilter): Prisma.Sql {
  return Prisma.sql`r.status = 'OK' AND r."finishedAt" >= ${f.since}
    ${f.until ? Prisma.sql`AND r."finishedAt" < ${f.until}` : Prisma.empty}
    ${f.source ? Prisma.sql`AND r.source = ${f.source}` : Prisma.empty}
    ${f.sigunguCode ? Prisma.sql`AND r."targetKey" LIKE ${`${f.sigunguCode}-%`}` : Prisma.empty}`;
}

/** 대상·예상 변경·충돌을 계산한다(읽기만). */
export async function planBulkRollback(f: BulkRollbackFilter): Promise<BulkRollbackPlan> {
  const targets = await prisma.$queryRaw<RollbackTarget[]>`
    SELECT r.id AS "runId", r.source, r."targetKey", r."finishedAt",
      (SELECT count(*) FROM "ReconcileInsert" i JOIN "Transaction" t ON t.id = i."transactionId" WHERE i."runId" = r.id)::int AS remove,
      (SELECT count(*) FROM "TransactionArchive" a WHERE a."runId" = r.id AND a.reason IN ('cancel', 'correction'))::int AS restore,
      (SELECT count(*) FROM "TransactionArchive" a WHERE a."runId" = r.id AND a.reason = 'cancel-date')::int AS "cancelDate"
    FROM "IngestionRun" r
    WHERE ${whereRuns(f)}
      AND (EXISTS (SELECT 1 FROM "ReconcileInsert" i WHERE i."runId" = r.id) OR EXISTS (SELECT 1 FROM "TransactionArchive" a WHERE a."runId" = r.id))
    ORDER BY r.id DESC`;
  const ids = targets.map((t) => t.runId);
  // 같은 범위에서 대상 중 가장 오래된 실행보다 나중이고, 대상이 아니며, 행을 바꾼 실행
  const conflicts = ids.length === 0 ? [] : await prisma.$queryRaw<RollbackConflict[]>`
    WITH tg AS (SELECT source, "targetKey", min(id) AS first FROM "IngestionRun" WHERE id = ANY(${ids}::bigint[]) GROUP BY 1, 2)
    SELECT tg.first AS "runId", tg.source, tg."targetKey", l.id AS "laterRunId", l."finishedAt" AS "laterFinishedAt"
    FROM tg JOIN "IngestionRun" l ON l.source = tg.source AND l."targetKey" = tg."targetKey" AND l.id > tg.first
    WHERE NOT (l.id = ANY(${ids}::bigint[]))
      AND (EXISTS (SELECT 1 FROM "ReconcileInsert" i WHERE i."runId" = l.id) OR EXISTS (SELECT 1 FROM "TransactionArchive" a WHERE a."runId" = l.id))
    ORDER BY l.id`;
  const props = ids.length === 0 ? [] : await affectedProperties(ids);
  return {
    filter: f, targets, conflicts,
    expected: {
      runs: targets.length,
      remove: targets.reduce((a, t) => a + t.remove, 0),
      restore: targets.reduce((a, t) => a + t.restore, 0),
      cancelDate: targets.reduce((a, t) => a + t.cancelDate, 0),
      properties: props.length,
    },
  };
}

async function affectedProperties(runIds: bigint[]): Promise<bigint[]> {
  const rows = await prisma.$queryRaw<{ pid: bigint }[]>`
    SELECT DISTINCT t."propertyId" AS pid FROM "ReconcileInsert" i JOIN "Transaction" t ON t.id = i."transactionId" WHERE i."runId" = ANY(${runIds}::bigint[])
    UNION SELECT DISTINCT "propertyId" FROM "TransactionArchive" WHERE "runId" = ANY(${runIds}::bigint[])`;
  return rows.map((r) => r.pid);
}

export async function bulkRollback(
  f: BulkRollbackFilter,
  opts: { apply?: boolean; auditDir?: string; lockFile?: string; rollbackOne?: typeof rollbackReconcileRun } = {},
): Promise<BulkRollbackResult> {
  const { apply = false, auditDir, lockFile = '/tmp/reconcile-rollback.lock', rollbackOne = rollbackReconcileRun } = opts;
  if (apply && !auditDir) throw new Error('일괄 롤백 --apply에는 감사 로그 디렉터리(--audit-dir)가 필요하다');

  let auditFile: string | undefined;
  const audit = (event: string, data: Record<string, unknown>) => {
    const line = { event, at: new Date().toISOString(), ...data };
    if (auditFile) appendFileSync(auditFile, json(line) + '\n');
    logger.info(JSON.parse(json(line)), `reconcile bulk rollback ${event}`);
  };

  // 같은 박스에서 일괄 롤백 두 개가 동시에 돌지 않게(재정합과는 범위 잠금으로 직렬화된다)
  let fd: number;
  try { fd = openSync(lockFile, 'wx'); } catch { throw new Error(`일괄 롤백이 이미 실행 중이다(잠금 파일 ${lockFile}). 확인 후 지워라`); }
  writeFileSync(fd, String(process.pid)); closeSync(fd);
  try {
    if (auditDir) {
      mkdirSync(auditDir, { recursive: true });
      auditFile = join(auditDir, `reconcile-rollback-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
    }
    const plan = await planBulkRollback(f);
    audit('start', { apply, filter: f, expected: plan.expected, conflicts: plan.conflicts.length,
      targets: plan.targets.map((t) => ({ runId: t.runId, source: t.source, targetKey: t.targetKey, finishedAt: t.finishedAt })) });
    const base = { apply, plan, rolledBack: 0, removed: 0, restored: 0, auditFile };
    if (plan.conflicts.length > 0) {
      audit('end', { stoppedBy: 'conflict', conflicts: plan.conflicts });
      return { ...base, stoppedBy: 'conflict' };
    }
    if (!apply) {
      audit('end', { stoppedBy: 'dry-run' });
      return { ...base, stoppedBy: 'dry-run' };
    }
    // 롤백 중 예약 수집이 끼어들지 않게: 정지 상태여야 하고, 진행 중인 수집 단위가 없어야 한다.
    if (!(await getHalt()).active) {
      audit('end', { stoppedBy: 'not-halted' });
      return { ...base, stoppedBy: 'not-halted', error: '수집을 먼저 정지하라(reconcile-transactions --set-halt --reason=…)' };
    }
    const running = await prisma.ingestionRun.count({ where: { source: { startsWith: 'molit-' }, status: 'RUNNING', startedAt: { gte: new Date(Date.now() - 3 * 3_600_000) } } });
    if (running > 0) {
      audit('end', { stoppedBy: 'collection-running', running });
      return { ...base, stoppedBy: 'collection-running', error: `진행 중인 수집 단위 ${running}개 — 끝난 뒤 다시 실행하라` };
    }

    const runIds = plan.targets.map((t) => t.runId);
    const props = await affectedProperties(runIds);
    const txBefore = await prisma.transaction.count();
    let rolledBack = 0; let removed = 0; let restored = 0;
    for (const t of plan.targets) {
      try {
        const r = await rollbackOne(t.runId);
        rolledBack++; removed += r.removed; restored += r.restored;
        audit('run', { runId: t.runId, source: t.source, targetKey: t.targetKey, finishedAt: t.finishedAt, removed: r.removed, restored: r.restored, cancelDate: t.cancelDate, ok: true });
      } catch (err) {
        // 이 실행은 트랜잭션 롤백으로 그대로다. 앞서 되돌린 실행은 되돌려진 채 — 같은 명령을 다시 돌리면 남은 것만 한다.
        audit('run', { runId: t.runId, source: t.source, targetKey: t.targetKey, ok: false, error: String(err) });
        audit('end', { stoppedBy: 'error', rolledBack, removed, restored, remaining: plan.targets.length - rolledBack });
        return { ...base, rolledBack, removed, restored, stoppedBy: 'error', error: String(err) };
      }
    }

    // 검증: 거래 수 변화, 남은 기록, 집계(되돌린 매물은 대기열에 들어갔다 — 비운 뒤 차이 0이어야 한다)
    const txDelta = (await prisma.transaction.count()) - txBefore;
    const leftoverRecords = (await prisma.reconcileInsert.count({ where: { runId: { in: runIds } } }))
      + (await prisma.transactionArchive.count({ where: { runId: { in: runIds } } }));
    await drainAggregateQueue({ deadline: Date.now() + 30 * 60_000 });
    const aggregateDiffs = (await diffPropertyAggregates(props)).length;
    const verify = { txDelta, expectedTxDelta: restored - removed, leftoverRecords, aggregateDiffs,
      ok: txDelta === restored - removed && leftoverRecords === 0 && aggregateDiffs === 0 };
    audit('end', { stoppedBy: 'done', rolledBack, removed, restored, verify });
    return { ...base, rolledBack, removed, restored, stoppedBy: 'done', verify };
  } finally {
    rmSync(lockFile, { force: true });
  }
}
