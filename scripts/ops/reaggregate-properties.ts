/**
 * 매물 집계 재계산 도구(S2). 설계 §8: 운영 적용은 dry-run → 1묶음 → 롤백 검증 → 10묶음 → 전체, 각 단계 별도 승인.
 *
 *   # 기본은 dry-run(쓰기 없음): 바뀔 행 수만 보고
 *   pnpm tsx scripts/ops/reaggregate-properties.ts --target=all
 *   pnpm tsx scripts/ops/reaggregate-properties.ts --target=cancelled-apartments
 *   pnpm tsx scripts/ops/reaggregate-properties.ts --target=ids --ids=1,2,3
 *   # 적용: 바뀌기 전 값을 JSONL로 백업한 뒤 바뀐 행만 UPDATE
 *   ... --apply --backup-dir=/opt/imjang/backups/reagg --checkpoint=/opt/imjang/backups/reagg/cp.json [--resume]
 *   # 주간 점검: 쓰지 않고 차이 나는 매물만 대기열에 넣기
 *   ... --target=all --enqueue-diff
 *   # 롤백
 *   pnpm tsx scripts/ops/reaggregate-properties.ts --rollback=/opt/imjang/backups/reagg/reaggregate-….jsonl
 *
 * 안전장치: 묶음(기본 2,000)·묶음 간 휴식(기본 2초)·정지 파일(기본 /tmp/reagg.stop)·디스크 여유 하한(기본 10GB)·
 * 체크포인트(처리한 최대 id)·잠금 파일(동시 실행 금지). 백업은 UPDATE 전에 기록한다.
 */
import { appendFileSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, rmSync, statfsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { CANCELLED_TYPE } from '@/lib/transaction/valid-deal';
import { AGG_COLUMNS, diffPropertyAggregates, updatePropertyAggregates } from '@/scripts/ingest/aggregator';
import { enqueuePropertyAggregates } from '@/scripts/ingest/aggregate-queue';

export type ReaggTarget =
  | { kind: 'all' }
  | { kind: 'ids'; ids: bigint[] }
  /** 해제 거래가 있는 아파트(S1 직후 불일치 해소용). regionCode는 테스트 격리용. */
  | { kind: 'cancelled-apartments'; regionCode?: string };

export interface ReaggOptions {
  target: ReaggTarget;
  apply?: boolean;
  enqueueDiff?: boolean;
  batchSize?: number;
  pauseMs?: number;
  maxBatches?: number;
  backupDir?: string;
  checkpointFile?: string;
  resume?: boolean;
  stopFile?: string;
  minFreeGb?: number;
  diskPath?: string;
  lockFile?: string;
}

export interface ReaggResult {
  apply: boolean;
  batches: number;
  scanned: number;
  changed: number;
  lastId: string | null;
  stoppedBy: 'done' | 'maxBatches' | 'stopFile' | 'disk';
  backupFile?: string;
  ms: number;
}

function targetWhere(t: ReaggTarget): Prisma.Sql {
  if (t.kind === 'all') return Prisma.sql`TRUE`;
  if (t.kind === 'ids') return Prisma.sql`p.id = ANY(${t.ids}::bigint[])`;
  return Prisma.sql`p."propertyType" = 'APARTMENT'
    ${t.regionCode ? Prisma.sql`AND p."regionCode" = ${t.regionCode}` : Prisma.empty}
    AND EXISTS (SELECT 1 FROM "Transaction" x WHERE x."propertyId" = p.id
                AND (x."cancelType" = ${CANCELLED_TYPE} OR x."cancelDate" IS NOT NULL))`;
}

const freeGb = (path: string) => { const s = statfsSync(path); return (s.bavail * s.bsize) / 1e9; };

export async function runReaggregate(o: ReaggOptions): Promise<ReaggResult> {
  const t0 = Date.now();
  const {
    target, apply = false, enqueueDiff = false, batchSize = 2000, pauseMs = 2000, maxBatches = Infinity,
    backupDir, checkpointFile, resume = false, stopFile = '/tmp/reagg.stop', minFreeGb = 10, diskPath = '/',
    lockFile = '/tmp/reaggregate-properties.lock',
  } = o;
  if (apply && !backupDir) throw new Error('--apply에는 backupDir가 필요하다(바뀌기 전 값을 먼저 백업)');
  if (apply && enqueueDiff) throw new Error('apply와 enqueueDiff는 함께 쓸 수 없다');

  // 동시 실행 금지(같은 박스에서 두 번 돌리는 실수 방지)
  let fd: number;
  try { fd = openSync(lockFile, 'wx'); } catch { throw new Error(`이미 실행 중이다(잠금 파일 ${lockFile}). 확인 후 지워라`); }
  writeFileSync(fd, String(process.pid)); closeSync(fd);

  let backupFile: string | undefined;
  if (apply) {
    mkdirSync(backupDir!, { recursive: true });
    backupFile = join(backupDir!, `reaggregate-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
  }
  let lastId: bigint = 0n;
  if (resume && checkpointFile && existsSync(checkpointFile)) {
    lastId = BigInt(JSON.parse(readFileSync(checkpointFile, 'utf8')).lastId);
  }
  let batches = 0; let scanned = 0; let changed = 0;
  let stoppedBy: ReaggResult['stoppedBy'] = 'done';
  try {
    for (;;) {
      if (batches >= maxBatches) { stoppedBy = 'maxBatches'; break; }
      if (existsSync(stopFile)) { stoppedBy = 'stopFile'; break; }
      if (apply && freeGb(diskPath) < minFreeGb) { stoppedBy = 'disk'; break; }
      const rows = await prisma.$queryRaw<{ id: bigint }[]>`
        SELECT p.id FROM "Property" p
        WHERE p."redirectToId" IS NULL AND p.id > ${lastId} AND ${targetWhere(target)}
        ORDER BY p.id LIMIT ${batchSize}`;
      if (rows.length === 0) break;
      const ids = rows.map((r) => r.id);
      const diffs = await diffPropertyAggregates(ids);
      if (apply && diffs.length > 0) {
        // 백업을 먼저 디스크에 남긴다 — UPDATE 뒤에 죽어도 되돌릴 수 있게.
        appendFileSync(backupFile!, diffs.map((d) => JSON.stringify({ id: String(d.id), old: d.old })).join('\n') + '\n');
        changed += await updatePropertyAggregates(diffs.map((d) => d.id));
      } else {
        changed += diffs.length;
        if (enqueueDiff && diffs.length > 0) await enqueuePropertyAggregates(prisma, diffs.map((d) => d.id));
      }
      batches++; scanned += ids.length; lastId = ids[ids.length - 1];
      if (checkpointFile) writeFileSync(checkpointFile, JSON.stringify({ lastId: String(lastId), at: new Date().toISOString(), scanned, changed }));
      logger.info({ batch: batches, scanned, changed, lastId: String(lastId), apply }, 'reaggregate batch');
      if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs));
    }
  } finally {
    rmSync(lockFile, { force: true });
  }
  const result: ReaggResult = { apply, batches, scanned, changed, lastId: batches ? String(lastId) : null, stoppedBy, backupFile, ms: Date.now() - t0 };
  logger.info(result, 'reaggregate done');
  return result;
}

const SQL_TYPE: Record<(typeof AGG_COLUMNS)[number], string> = {
  txCountTotal: 'int', txCount12m: 'int', lastTxAt: 'timestamp(3)',
  saleCount12m: 'int', saleAvgPrice12m: 'bigint', saleLastPrice: 'bigint', saleLastAt: 'date',
  jeonseCount12m: 'int', jeonseAvgDeposit12m: 'bigint', jeonseLastDeposit: 'bigint', jeonseLastAt: 'date',
  wolseCount12m: 'int', wolseAvgDeposit12m: 'bigint', wolseAvgRent12m: 'int', wolseLastDeposit: 'bigint', wolseLastRent: 'int', wolseLastAt: 'date',
  areaTypes: 'int[]',
};

/** 백업 JSONL의 이전 값으로 되돌린다. 반환: 되돌린 행 수. */
export async function rollbackFromBackup(file: string, batchSize = 500): Promise<number> {
  const lines = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as { id: string; old: Record<string, unknown> });
  const recType = Prisma.raw(['id bigint', ...AGG_COLUMNS.map((c) => `"${c}" ${SQL_TYPE[c]}`)].join(', '));
  const setList = Prisma.raw(AGG_COLUMNS.map((c) => `"${c}" = r."${c}"`).join(', '));
  let n = 0;
  for (let i = 0; i < lines.length; i += batchSize) {
    const payload = JSON.stringify(lines.slice(i, i + batchSize).map((l) => ({ id: l.id, ...l.old })));
    n += await prisma.$executeRaw`
      UPDATE "Property" p SET ${setList}
      FROM jsonb_to_recordset(${payload}::jsonb) AS r(${recType})
      WHERE p.id = r.id`;
  }
  logger.info({ file, restored: n }, 'reaggregate rollback done');
  return n;
}

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const rb = arg('rollback');
  if (rb) { console.log(JSON.stringify({ restored: await rollbackFromBackup(rb) })); return; }
  const t = arg('target') ?? 'all';
  const target: ReaggTarget =
    t === 'ids' ? { kind: 'ids', ids: (arg('ids') ?? '').split(',').filter(Boolean).map((x) => BigInt(x)) }
    : t === 'cancelled-apartments' ? { kind: 'cancelled-apartments' }
    : { kind: 'all' };
  const r = await runReaggregate({
    target,
    apply: flag('apply'),
    enqueueDiff: flag('enqueue-diff'),
    batchSize: Number(arg('batch-size')) || undefined,
    pauseMs: arg('pause-ms') != null ? Number(arg('pause-ms')) : undefined,
    maxBatches: Number(arg('max-batches')) || undefined,
    backupDir: arg('backup-dir'),
    checkpointFile: arg('checkpoint'),
    resume: flag('resume'),
    stopFile: arg('stop-file'),
    minFreeGb: arg('min-free-gb') != null ? Number(arg('min-free-gb')) : undefined,
  });
  console.log(JSON.stringify(r));
}

if (process.argv[1] && process.argv[1].includes('reaggregate-properties')) {
  main()
    .catch((err) => { logger.error({ err }, 'reaggregate failed'); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
