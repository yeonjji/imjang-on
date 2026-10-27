/**
 * 매물 재집계 대기열(S2). 설계: docs/superpowers/specs/2026-10-27-property-aggregate-integrity-design.md §4·§6
 *
 * - 넣기: 거래를 바꾸는 **같은 DB 트랜잭션** 안에서 enqueuePropertyAggregates(t, ids). 거래가 커밋되면 대기열도
 *   커밋되므로, 프로세스가 집계 전에 죽어도 집계 대상이 사라지지 않는다(D1: 끝에서 한 번만 집계하던 구조의 누락).
 * - 비우기: drainAggregateQueue가 묶음마다 `FOR UPDATE SKIP LOCKED`로 잡고, 같은 트랜잭션에서 집계 후 삭제한다.
 *   · 비우는 중 같은 매물이 다시 들어오면 넣는 쪽 ON CONFLICT가 잠금에서 기다렸다가 삭제 커밋 뒤 새 행으로 들어간다
 *     → 다음 묶음에서 다시 집계(갱신 손실 없음).
 *   · 동시에 여러 작업이 비워도 SKIP LOCKED라 같은 매물을 두 번 집계하지 않는다.
 *   · 집계는 늘 그 시점에 커밋된 거래 전체로 다시 계산한다(증분 덧셈 아님) — 늦게 도는 쪽이 최신이다.
 * - 12개월 경계(D2): enqueueWindowExpired가 '어제~오늘 사이 12개월 창 밖으로 나간 거래'의 매물을 넣는다.
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { updatePropertyAggregates, type Db } from './aggregator';

export async function enqueuePropertyAggregates(db: Db, propertyIds: bigint[]): Promise<void> {
  const ids = [...new Set(propertyIds)];
  if (ids.length === 0) return;
  await db.$executeRaw`
    INSERT INTO "PropertyAggregateQueue" ("propertyId", "enqueuedAt")
    SELECT unnest(${ids}::bigint[]), now()
    ON CONFLICT ("propertyId") DO UPDATE SET "enqueuedAt" = EXCLUDED."enqueuedAt"`;
}

/**
 * 계약일이 (now − 12개월 − overlapDays, now − 12개월]인 거래의 매물을 대기열에 넣는다.
 * overlapDays는 타이머가 하루 이틀 빠져도 놓치지 않게 겹쳐 보는 기간. 반환: 넣은(또는 갱신한) 매물 수.
 */
export async function enqueueWindowExpired(db: Db, now: Date = new Date(), overlapDays = 3): Promise<number> {
  return db.$executeRaw`
    INSERT INTO "PropertyAggregateQueue" ("propertyId", "enqueuedAt")
    SELECT DISTINCT t."propertyId", now()
    FROM "Transaction" t
    JOIN "Property" p ON p.id = t."propertyId" AND p."redirectToId" IS NULL
    WHERE t."contractDate" >  (${now}::timestamptz - interval '12 months') - make_interval(days => ${overlapDays}::int)
      AND t."contractDate" <= (${now}::timestamptz - interval '12 months')
    ON CONFLICT ("propertyId") DO UPDATE SET "enqueuedAt" = EXCLUDED."enqueuedAt"`;
}

export interface DrainResult {
  batches: number;
  processed: number;
  changed: number;
  remaining: number;
  stoppedBy: 'empty' | 'maxBatches' | 'deadline' | 'error';
  /** stoppedBy=error일 때 실패 사유. 실패한 묶음은 롤백되어 대기열에 남는다. */
  error?: string;
}

/**
 * 대기열을 묶음 단위로 비운다. 묶음 하나 = 트랜잭션 하나(잡기 → 집계 → 삭제 → 커밋).
 * 실패한 묶음은 롤백되어 대기열에 그대로 남는다(다음 실행이 다시 처리).
 */
export async function drainAggregateQueue(opts: {
  batchSize?: number;
  maxBatches?: number;
  /** epoch ms. 지나면 다음 묶음을 시작하지 않는다. */
  deadline?: number;
  pauseMs?: number;
} = {}): Promise<DrainResult> {
  const { batchSize = 2000, maxBatches = Infinity, deadline, pauseMs = 0 } = opts;
  let batches = 0; let processed = 0; let changed = 0;
  let stoppedBy: DrainResult['stoppedBy'] = 'empty';
  let error: string | undefined;
  for (;;) {
    if (batches >= maxBatches) { stoppedBy = 'maxBatches'; break; }
    if (deadline && Date.now() > deadline) { stoppedBy = 'deadline'; break; }
    let r: { n: number; c: number } | null;
    try {
      r = await prisma.$transaction(async (t) => {
      const rows = await t.$queryRaw<{ propertyId: bigint }[]>`
        SELECT "propertyId" FROM "PropertyAggregateQueue"
        ORDER BY "propertyId"
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED`;
      const ids = rows.map((x) => x.propertyId);
      if (ids.length === 0) return null;
      const c = await updatePropertyAggregates(ids, t);
      await t.$executeRaw`DELETE FROM "PropertyAggregateQueue" WHERE "propertyId" = ANY(${ids}::bigint[])`;
      return { n: ids.length, c };
      }, { timeout: 300_000, maxWait: 30_000 });
    } catch (err) {
      // 묶음 트랜잭션은 롤백되어 항목이 대기열에 남는다 → 다음 실행이 다시 처리(누락 없음).
      // 예외를 던지지 않고 결과로 알린다 — 수집기(runner) 끝에서 호출돼도 수집 결과·알림을 막지 않게.
      stoppedBy = 'error'; error = String(err);
      logger.error({ err }, 'aggregate queue batch failed — left in queue');
      break;
    }
    if (!r) break;
    batches++; processed += r.n; changed += r.c;
    if (pauseMs > 0) await new Promise((res) => setTimeout(res, pauseMs));
  }
  const remaining = await prisma.propertyAggregateQueue.count();
  const result: DrainResult = { batches, processed, changed, remaining, stoppedBy, ...(error ? { error } : {}) };
  logger.info(result, 'aggregate queue drained');
  return result;
}
