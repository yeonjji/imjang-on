/**
 * 청약 결과 수집(매일, subscriptions 잡 뒤). 공고당 1행(SubscriptionResult)에 오퍼레이션 원응답을 보관한다.
 *   pnpm ingest:subscription-results [--max-minutes=30] [--limit=N]
 * 대상: 주택관리번호가 있고 접수가 끝난 청약홈 공고 중
 *   - 결과 행이 없음(처음) · api_error
 *   - 당첨자 발표 + 30일 안(접수건수 변동 가능, 원문 안내) · empty는 접수 마감 + 30일 안(공개 지연) — 20시간마다
 * 이미 ok인 결과는 재수집이 실패하거나 비어도 지우지 않는다. 한도 초과는 즉시 중단.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import { QuotaExceededError } from '@/scripts/ingest/apt-complex/http';
import { fetchResultRows, RESULT_OPS, type ResultOp } from './http';

export const SUBSCRIPTION_RESULTS_SOURCE = 'subscription-results';
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_MAX_MINUTES = 30;
const BATCH = 2_000;
const REFETCH_AFTER_MS = 20 * 3600_000;

export type FetchRows = (op: ResultOp, houseManageNo: string) => Promise<object[]>;

interface Target {
  id: bigint;
  category: string;
  houseManageNo: string;
}

const kstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

async function nextTargets(runStart: Date, noticeIds: bigint[] | undefined): Promise<Target[]> {
  const today = kstToday();
  const refetchBefore = new Date(runStart.getTime() - REFETCH_AFTER_MS);
  const scope = noticeIds ? Prisma.sql`AND n.id IN (${Prisma.join(noticeIds)})` : Prisma.empty;
  return prisma.$queryRaw<Target[]>`
    SELECT n.id, n.category::text AS category, n."houseManageNo"
    FROM "SubscriptionNotice" n
    LEFT JOIN "SubscriptionResult" r ON r."noticeId" = n.id
    WHERE n.source = 'APPLYHOME'
      AND n."houseManageNo" IS NOT NULL
      AND n.category::text IN (${Prisma.join(Object.keys(RESULT_OPS))})
      AND n."receiptEnd" < ${today}::date
      AND (
        r."noticeId" IS NULL
        OR (r."fetchedAt" < ${runStart} AND (
          r.status = 'api_error'
          OR (r."fetchedAt" < ${refetchBefore} AND n."winnerDate" IS NOT NULL AND n."winnerDate" + 30 >= ${today}::date)
          OR (r."fetchedAt" < ${refetchBefore} AND r.status = 'empty' AND n."receiptEnd" + 30 >= ${today}::date)
        ))
      )
      ${scope}
    ORDER BY n."receiptEnd" DESC, n.id
    LIMIT ${BATCH}`;
}

const json = (rows: object[] | undefined) => (rows && rows.length ? (rows as Prisma.InputJsonValue) : Prisma.JsonNull);

/** 이미 ok인 결과는 남기고 조회 시각만 갱신한다(같은 실행에서 다시 고르지 않도록 fetchedAt은 항상 갱신). */
async function saveKeepingOk(noticeId: bigint, status: 'empty' | 'api_error') {
  const fetchedAt = new Date();
  const existing = await prisma.subscriptionResult.findUnique({ where: { noticeId }, select: { status: true } });
  if (existing?.status === 'ok') {
    await prisma.subscriptionResult.update({ where: { noticeId }, data: { fetchedAt } });
    return;
  }
  const data = { status, competition: Prisma.JsonNull, scores: Prisma.JsonNull, special: Prisma.JsonNull, fetchedAt };
  await prisma.subscriptionResult.upsert({ where: { noticeId }, create: { noticeId, ...data }, update: data });
}

export async function runCollect(opts: {
  deadline?: number;
  concurrency?: number;
  limit?: number;
  fetchRows?: FetchRows;
  /** 테스트·스모크 전용 — 대상 공고를 좁힌다. */
  noticeIds?: bigint[];
}): Promise<{ processed: number; ok: number; quotaHit: boolean; timeUp: boolean }> {
  const fetchRows = opts.fetchRows ?? fetchResultRows;
  const runStart = new Date();
  let processed = 0;
  let ok = 0;
  let quotaHit = false;
  let timeUp = false;
  const overLimit = () => opts.limit !== undefined && processed >= opts.limit;

  const handle = async (t: Target): Promise<void> => {
    const ops = RESULT_OPS[t.category];
    let competition: object[];
    let scores: object[] | undefined;
    let special: object[] | undefined;
    try {
      competition = await fetchRows(ops.competition, t.houseManageNo);
      if (competition.length && ops.scores) scores = await fetchRows(ops.scores, t.houseManageNo);
      if (competition.length && ops.special) special = await fetchRows(ops.special, t.houseManageNo);
    } catch (err) {
      if (err instanceof QuotaExceededError) throw err;
      logger.warn({ err, noticeId: String(t.id) }, 'subscription-results api error');
      await saveKeepingOk(t.id, 'api_error');
      return;
    }
    if (!competition.length) {
      await saveKeepingOk(t.id, 'empty');
      return;
    }
    const data = {
      status: 'ok',
      competition: json(competition),
      scores: json(scores),
      special: json(special),
      fetchedAt: new Date(),
    };
    await prisma.subscriptionResult.upsert({ where: { noticeId: t.id }, create: { noticeId: t.id, ...data }, update: data });
    ok++;
  };

  for (;;) {
    const targets = await nextTargets(runStart, opts.noticeIds);
    if (targets.length === 0) break;
    let next = 0;
    let progressed = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        if (quotaHit || timeUp || overLimit()) return;
        if (opts.deadline !== undefined && Date.now() > opts.deadline) {
          timeUp = true;
          return;
        }
        const i = next++;
        if (i >= targets.length) return;
        try {
          await handle(targets[i]);
          processed++;
          progressed++;
        } catch (err) {
          if (err instanceof QuotaExceededError) {
            quotaHit = true;
            return;
          }
          logger.warn({ err, noticeId: String(targets[i].id) }, 'subscription-results save failed — skipped');
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY) }, () => worker()));
    logger.info({ processed, ok, batch: targets.length }, 'subscription-results batch done');
    // 저장이 전부 실패한 배치는 다음 조회에서 같은 대상이 나온다 → 무한 반복 대신 종료.
    if (quotaHit || timeUp || overLimit() || progressed === 0) break;
  }
  return { processed, ok, quotaHit, timeUp };
}

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const run = await prisma.ingestionRun.create({
    data: { source: SUBSCRIPTION_RESULTS_SOURCE, targetKey: 'daily', status: 'RUNNING' },
  });
  try {
    const maxMinutes = Number(arg('max-minutes')) || DEFAULT_MAX_MINUTES;
    const limit = Number(arg('limit')) || undefined;
    const r = await runCollect({ deadline: startedAt + maxMinutes * 60_000, limit });
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'OK', rowsUpserted: r.processed, finishedAt: new Date() },
    });
    const stop = r.quotaHit ? ' 한도 도달로 중단' : r.timeUp ? ' 시간 예산 도달로 중단' : '';
    await notify('info', `subscription-results${stop || ' 완료'}`, r);
  } catch (err) {
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() },
    });
    logger.error({ err }, 'subscription-results failed');
    await notify('error', 'subscription-results failed', { err: String(err) });
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && process.argv[1].includes('subscription-results/runner')) {
  main().catch((err) => {
    logger.error({ err }, 'subscription-results runner fatal');
    process.exit(1);
  });
}
