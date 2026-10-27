/**
 * 매물 집계 유지 잡(S2). 설계 §4·§6.
 *
 *   daily:  12개월 창 밖으로 나간 거래의 매물을 대기열에 넣고(D2) 대기열을 비운다(시간 예산 안에서).
 *   check:  전체 매물 저장값 vs 계산값 차이를 **세기만** 한다(dry-run). 차이 수를 알린다.
 *           S5(운영 전체 재집계, 별도 승인)가 끝나기 전에는 대기열에 넣지 않는다 — 넣으면 승인 없이
 *           수만 건 재집계가 자동으로 돌기 때문이다. S5 뒤에는 --enqueue-diff로 바꾼다.
 *
 *   pnpm tsx scripts/ingest/property-aggregates/runner.ts --mode=daily [--max-minutes=60]
 *   pnpm tsx scripts/ingest/property-aggregates/runner.ts --mode=check [--enqueue-diff]
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import { drainAggregateQueue, enqueueWindowExpired } from '@/scripts/ingest/aggregate-queue';
import { runReaggregate } from '@/scripts/ops/reaggregate-properties';

export const PROPERTY_AGGREGATES_SOURCE = 'property-aggregates';

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
}

export async function runDaily(opts: { now?: Date; maxMinutes?: number } = {}) {
  const now = opts.now ?? new Date();
  const expired = await enqueueWindowExpired(prisma, now, 3);
  const drained = await drainAggregateQueue({ deadline: Date.now() + (opts.maxMinutes ?? 60) * 60_000, pauseMs: 500 });
  return { expiredEnqueued: expired, ...drained };
}

async function main() {
  const mode = arg('mode') ?? 'daily';
  const run = await prisma.ingestionRun.create({ data: { source: PROPERTY_AGGREGATES_SOURCE, targetKey: mode, status: 'RUNNING' } });
  try {
    let summary: Record<string, unknown>;
    if (mode === 'check') {
      const r = await runReaggregate({
        target: { kind: 'all' }, enqueueDiff: process.argv.includes('--enqueue-diff'), pauseMs: 500,
        lockFile: '/tmp/property-aggregates-check.lock',
      });
      summary = { scanned: r.scanned, diff: r.changed, enqueued: process.argv.includes('--enqueue-diff'), ms: r.ms };
    } else {
      summary = await runDaily({ maxMinutes: Number(arg('max-minutes')) || undefined });
      if (summary.stoppedBy === 'error') throw new Error(`대기열 비우기 실패(항목은 대기열에 남음): ${summary.error}`);
    }
    await prisma.ingestionRun.update({ where: { id: run.id }, data: { status: 'OK', finishedAt: new Date() } });
    const warn = mode === 'check' ? Number(summary.diff) > 0 : Number(summary.remaining) > 0;
    await notify(warn ? 'warn' : 'info', `property-aggregates ${mode}`, summary);
  } catch (err) {
    await prisma.ingestionRun.update({ where: { id: run.id }, data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() } });
    logger.error({ err }, 'property-aggregates failed');
    await notify('error', 'property-aggregates failed', { err: String(err) });
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && process.argv[1].includes('property-aggregates/runner')) {
  main().catch((err) => { logger.error({ err }, 'property-aggregates fatal'); process.exit(1); });
}
