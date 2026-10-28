/**
 * 거래 재정합(S3). 설계: docs/superpowers/specs/2026-10-27-property-aggregate-integrity-design.md §2·§3
 *
 * 한 범위 = (원천 API source × 시군구 × 계약 연월). 원천을 정답으로 보고, '재정합 키'별 개수를 맞춘다.
 *   재정합 키 = 매물·거래유형·계약일·면적(소수 둘째 자리)·층·금액·보증금·월세·해제 여부
 * - 원천에만 있는 키 개수 → INSERT(해제본·같은 조건 재신고·동일 조건 실거래 여러 건·지연 신고)
 * - DB에만 남는 행은 **원천에서 대체가 확인될 때만** TransactionArchive로 옮긴다(삭제 아님):
 *     cancel(같은 거래의 해제본) · correction(속성 하나만 다른 정정본)
 *   대체가 없으면 지우지 않고 보류(orphan)로 보고한다 — 단순 건수 차이로 기존 데이터를 지우지 않는다.
 * - 매물만 다르고 나머지가 같은 행은 같은 거래로 보고 그대로 둔다(propertyMismatch). 같은 시군구에 같은 이름의 매물이
 *   여럿이면 실행마다 다른 매물로 확정될 수 있어, 옮기면 거래가 매물 사이를 오간다.
 * - 같은 키의 해제 행이 옛 파싱 오류(19YY년) 해제일을 갖고 있으면 원천 값으로 고친다(행 이동 없음, 이전 값은 보관).
 *
 * 안전: 원천을 끝까지 받았고(건수 = totalCount) 급감(<90%)·과다 보관(>20%)이 아닐 때만 쓴다.
 * 범위 밖 원천 행은 계획에서 뺀다: 계약일이 그 달이 아닌 행(파싱 실패 등), 같은 거래가 다른 범위에 이미 있는 행
 * (행정구역 코드 변경으로 옛 시군구 코드에 저장된 거래 — 옛 수집 해시로 확인). 넣지도 지우지도 않는다.
 * 한 범위 = DB 트랜잭션 하나(범위 자문 잠금 → 재조회 → 계획 → 보관·삭제·삽입·해제일 수정 → 대기열 → 완료 기록).
 * 실패하면 전부 롤백되고 다음 실행이 다시 처리한다. 같은 원천으로 다시 돌리면 아무것도 바뀌지 않는다(멱등).
 */
import { createHash } from 'node:crypto';
import { Prisma, type DealType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { CANCELLED_TYPE } from '@/lib/transaction/valid-deal';
import { enqueuePropertyAggregates } from '@/scripts/ingest/aggregate-queue';

export interface RecFields {
  propertyId: bigint;
  dealType: DealType;
  contractDate: Date;
  exclusiveArea: number;
  floor: number | null;
  dealAmount: number | null;
  deposit: number | null;
  monthlyRent: number | null;
  cancelType: string | null;
  cancelDate: Date | null;
}
export interface DbTx extends RecFields { id: bigint; rawHash: string }
/** 원천 1건. data는 rawHash를 뺀 Transaction 생성값(매물 해석까지 끝난 것). */
export interface ApiTx extends RecFields { data: Omit<Prisma.TransactionCreateManyInput, 'rawHash'> }

export type ArchiveReason = 'cancel' | 'correction';
export interface ReconcilePlan {
  inserts: ApiTx[];
  archives: { row: DbTx; reason: ArchiveReason }[];
  /** DB에만 있고 원천 대체가 확인되지 않은 행 — 건드리지 않는다. */
  orphans: DbTx[];
  /** 매물만 다른 같은 거래 — 건드리지 않는다. */
  propertyMismatch: number;
  cancelDateRepairs: { id: bigint; propertyId: bigint; cancelDate: Date }[];
}

const isCancelled = (t: RecFields) => t.cancelType === CANCELLED_TYPE || t.cancelDate != null;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * number를 Decimal(6,2)에 넣을 때 실제 저장되는 값. Prisma는 number를 유효숫자 16자리로 바꾼 뒤 DB가 둘째 자리에서 반올림한다
 * (84.975 → 84.97499999999999 → 84.97, 1.005 → 1.005000000000000 → 1.01). 1.000~99.999 전부와 리허설 원천 값으로 실측 일치(2026-10-28).
 * 키를 이 규칙으로 만들어야 기존 행과 맞고, 새 행은 이 문자열로 넣어 저장값 = 키가 되게 한다(toApiTx).
 */
export function area2(x: number): string {
  const neg = x < 0;
  const [i, f = ''] = Math.abs(x).toPrecision(16).split('.');
  let cents = BigInt(i) * 100n + BigInt((f + '00').slice(0, 2));
  if (Number(f[2] ?? '0') >= 5) cents += 1n;
  const s = `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
  return neg ? `-${s}` : s;
}

function fieldsKey(t: RecFields, opts: { skip?: 'propertyId' | 'cancel' } = {}): string {
  return [
    opts.skip === 'propertyId' ? '*' : String(t.propertyId),
    t.dealType, ymd(t.contractDate), area2(t.exclusiveArea), t.floor ?? '',
    t.dealAmount ?? '', t.deposit ?? '', t.monthlyRent ?? '',
    opts.skip === 'cancel' ? '*' : isCancelled(t) ? 1 : 0,
  ].join('|');
}
export const reconcileKey = (t: RecFields) => fieldsKey(t);

/** 정정: 같은 매물·유형·계약일·해제 여부에서 속성 하나만 다르다(면적은 1㎡ 이내 차이만). */
function isCorrection(d: RecFields, a: RecFields): boolean {
  if (d.propertyId !== a.propertyId || d.dealType !== a.dealType || ymd(d.contractDate) !== ymd(a.contractDate)) return false;
  if (isCancelled(d) !== isCancelled(a)) return false;
  const diffs = [
    area2(d.exclusiveArea) !== area2(a.exclusiveArea) ? (Math.abs(d.exclusiveArea - a.exclusiveArea) <= 1 ? 'area' : 'area-far') : null,
    d.floor !== a.floor ? 'floor' : null,
    d.dealAmount !== a.dealAmount ? 'amount' : null,
    d.deposit !== a.deposit ? 'deposit' : null,
    d.monthlyRent !== a.monthlyRent ? 'rent' : null,
  ].filter(Boolean);
  return diffs.length === 1 && diffs[0] !== 'area-far';
}

function groupBy<T>(xs: T[], k: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) { const key = k(x); const a = m.get(key); if (a) a.push(x); else m.set(key, [x]); }
  return m;
}

/** 순수 함수 — 원천과 DB(같은 범위)를 비교해 할 일을 정한다. */
export function planReconcile(api: ApiTx[], db: DbTx[]): ReconcilePlan {
  const A = groupBy(api, reconcileKey);
  const B = groupBy(db, reconcileKey);
  const surplusApi: ApiTx[] = [];
  const surplusDb: DbTx[] = [];
  const cancelDateRepairs: ReconcilePlan['cancelDateRepairs'] = [];
  for (const key of new Set([...A.keys(), ...B.keys()])) {
    const a = A.get(key) ?? [];
    const b = [...(B.get(key) ?? [])].sort((x, y) => (x.id < y.id ? -1 : 1)); // 오래된 원본 우선 유지
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      // 같은 해제 거래인데 해제일이 다르면(옛 19YY 파싱 오류) 원천 값으로
      if (isCancelled(a[i]) && a[i].cancelDate && (!b[i].cancelDate || ymd(b[i].cancelDate!) !== ymd(a[i].cancelDate!))) {
        cancelDateRepairs.push({ id: b[i].id, propertyId: b[i].propertyId, cancelDate: a[i].cancelDate! });
      }
    }
    if (a.length > b.length) surplusApi.push(...a.slice(b.length));
    if (b.length > a.length) surplusDb.push(...b.slice(a.length).reverse()); // 최근 id부터 보관 후보
  }
  const used = new Set<ApiTx>();
  const find = (pred: (a: ApiTx) => boolean) => surplusApi.find((a) => !used.has(a) && pred(a));
  // 매물만 다른 같은 거래는 짝지어 둘 다 그대로 둔다(옮기지도 넣지도 않음).
  const sameDeal = new Set<ApiTx>();
  const rest: DbTx[] = [];
  for (const d of surplusDb) {
    const a = find((x) => fieldsKey(x, { skip: 'propertyId' }) === fieldsKey(d, { skip: 'propertyId' }));
    if (a) { used.add(a); sameDeal.add(a); } else rest.push(d);
  }
  // DB에만 남은 행을 원천 대체로 설명할 수 있을 때만 보관한다. 대체 하나는 한 행만 설명한다.
  const archives: ReconcilePlan['archives'] = [];
  const orphans: DbTx[] = [];
  for (const d of rest) {
    let a = find((x) => fieldsKey(x, { skip: 'cancel' }) === fieldsKey(d, { skip: 'cancel' }) && isCancelled(x) !== isCancelled(d));
    let reason: ArchiveReason | null = a ? 'cancel' : null;
    if (!a) { a = find((x) => isCorrection(d, x)); reason = a ? 'correction' : null; }
    if (a && reason) { used.add(a); archives.push({ row: d, reason }); } else orphans.push(d);
  }
  return { inserts: surplusApi.filter((a) => !sameDeal.has(a)), archives, orphans, propertyMismatch: sameDeal.size, cancelDateRepairs };
}

export interface ReconcileScope {
  source: string;
  sigunguCode: string;
  yyyymm: string;
  api: ApiTx[];
  /** 원천을 끝까지 받았는가(받은 건수 = totalCount, 모든 페이지 정상). */
  complete: boolean;
  totalCount: number;
  /** 받았지만 api에 넣지 못한 행 수(단지명 없음 등). 완전성 확인에서 받은 건수에 더한다. */
  excluded?: number;
}

export type ReconcileStatus = 'applied' | 'unchanged' | 'skipped' | 'dry-run';
export interface ReconcileResult {
  status: ReconcileStatus;
  skipReason?: 'incomplete' | 'abnormal' | 'shrink' | 'too-many-archives';
  api: number;
  db: number;
  inserted: number;
  archived: Record<ArchiveReason, number>;
  orphans: number;
  /** 매물만 다른 같은 거래(그대로 둠) */
  propertyMismatch: number;
  cancelDateRepaired: number;
  /** 계약일이 범위 달이 아니어서 뺀 원천 행 */
  outOfMonth: number;
  /** 같은 거래가 다른 범위(옛 시군구 코드 등)에 이미 있어 뺀 원천 행 */
  outOfScope: number;
  affectedPropertyIds: bigint[];
}

const monthRange = (yyyymm: string) => {
  const y = Number(yyyymm.slice(0, 4)); const m = Number(yyyymm.slice(4, 6));
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
};

type Db = Prisma.TransactionClient | typeof prisma;
async function loadScope(db: Db, s: ReconcileScope): Promise<DbTx[]> {
  const { from, to } = monthRange(s.yyyymm);
  const rows = await db.transaction.findMany({
    where: { source: s.source, sigunguCode: s.sigunguCode, contractDate: { gte: from, lt: to } },
    select: { id: true, rawHash: true, propertyId: true, dealType: true, contractDate: true, exclusiveArea: true, floor: true,
      dealAmount: true, deposit: true, monthlyRent: true, cancelType: true, cancelDate: true },
  });
  return rows.map((r) => ({ ...r, exclusiveArea: Number(r.exclusiveArea) }));
}

/**
 * 옛 수집기(runner.computeHash)와 같은 해시. 해제 여부를 빼고 만들었으므로 해제본·정상본이 같은 값이다.
 * 다른 범위에 같은 거래가 이미 있는지 확인하는 데만 쓴다(tests/ingest/reconcile-plan.test.ts에서 일치 확인).
 */
export function legacyHash(t: RecFields): string {
  const key = JSON.stringify({
    p: String(t.propertyId), t: t.dealType, d: ymd(t.contractDate), a: t.exclusiveArea,
    f: t.floor, da: t.dealAmount, dep: t.deposit, mr: t.monthlyRent,
  });
  return createHash('sha256').update(key).digest('hex');
}

interface Prepared { db: DbTx[]; api: ApiTx[]; plan: ReconcilePlan; outOfMonth: number; outOfScope: number }

/** 범위 행 조회 → 범위 밖 원천 행 제외 → 계획. */
async function prepare(t: Db, s: ReconcileScope): Promise<Prepared> {
  const db = await loadScope(t, s);
  const { from, to } = monthRange(s.yyyymm);
  const inMonth = s.api.filter((a) => a.contractDate >= from && a.contractDate < to);
  const inScope = new Set(db.map((d) => d.rawHash));
  const hashes = [...new Set(inMonth.map(legacyHash))].filter((h) => !inScope.has(h));
  const elsewhere = hashes.length === 0 ? new Set<string>() : new Set(
    (await t.transaction.findMany({ where: { rawHash: { in: hashes } }, select: { rawHash: true } })).map((r) => r.rawHash),
  );
  const api = inMonth.filter((a) => !elsewhere.has(legacyHash(a)));
  return { db, api, plan: planReconcile(api, db), outOfMonth: s.api.length - inMonth.length, outOfScope: inMonth.length - api.length };
}

/**
 * 원천 응답이 비정상으로 보이는가: 매매인데 금액이 없거나, 전월세인데 보증금이 없거나, 면적이 0 이하.
 * 운영 최근 13개월 133만 행에서 이런 행은 0건이었다(2026-10-28) — 나오면 응답 형식이 바뀐 것으로 본다.
 */
function looksAbnormal(api: ApiTx[]): boolean {
  return api.some((a) => (a.dealType === 'SALE' ? a.dealAmount == null : a.deposit == null) || !(a.exclusiveArea > 0));
}

/** 안전 가드. 걸리면 쓰지 않는다. */
export function guard(s: ReconcileScope, p: Prepared): ReconcileResult['skipReason'] | null {
  if (!s.complete || s.api.length + (s.excluded ?? 0) !== s.totalCount) return 'incomplete';
  if (looksAbnormal(s.api)) return 'abnormal';
  if (p.db.length >= 20 && p.api.length < p.db.length * 0.9) return 'shrink';
  if (p.plan.archives.length > Math.max(10, p.db.length * 0.2)) return 'too-many-archives';
  return null;
}

function summarize(s: ReconcileScope, p: Prepared, status: ReconcileStatus, skipReason?: ReconcileResult['skipReason']): ReconcileResult {
  const { plan } = p;
  const archived = { cancel: 0, correction: 0 };
  for (const a of plan.archives) archived[a.reason]++;
  const affected = new Set<bigint>([...plan.inserts.map((a) => a.propertyId), ...plan.archives.map((a) => a.row.propertyId),
    ...plan.cancelDateRepairs.map((r) => r.propertyId)]);
  return { status, ...(skipReason ? { skipReason } : {}), api: s.api.length, db: p.db.length, inserted: plan.inserts.length, archived,
    orphans: plan.orphans.length, propertyMismatch: plan.propertyMismatch, cancelDateRepaired: plan.cancelDateRepairs.length, outOfMonth: p.outOfMonth, outOfScope: p.outOfScope,
    affectedPropertyIds: [...affected] };
}

/** 쓰지 않고 계획만(운영 dry-run·리허설용). 읽기 전용 세션에서 돈다. */
export async function dryRunReconcile(s: ReconcileScope): Promise<ReconcileResult> {
  const p = await prepare(prisma, s);
  const skip = guard(s, p);
  return summarize(s, p, skip ? 'skipped' : 'dry-run', skip ?? undefined);
}

/** 재정합이 넣는 행의 rawHash. 범위(source·시군구)를 넣어 다른 범위와 겹치지 않게 하고, 같은 키 안에서는 순번으로 구분한다. */
/** 범위 자문 잠금(트랜잭션 끝까지). 재정합과 롤백이 같은 키를 쓴다. */
async function lockScope(t: Prisma.TransactionClient, source: string, sgg: string, yyyymm: string) {
  await t.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reconcile:${source}:${sgg}:${yyyymm}`}))`;
}

const newHash = (s: ReconcileScope, t: ApiTx, ordinal: number) =>
  createHash('sha256').update(`reconcile:v1|${s.source}|${s.sigunguCode}|${reconcileKey(t)}|${ordinal}`).digest('hex');

/** 테이블 전체에서 겹치지 않는 해시를 고른다(보관됐다가 다시 들어온 행·이전 실행분과 충돌 방지). */
async function pickHashes(t: Db, s: ReconcileScope, inserts: ApiTx[], scopeHashes: string[]): Promise<string[]> {
  const taken = new Set(scopeHashes);
  const ordinal = inserts.map(() => 1);
  for (;;) {
    const used = new Set<string>(taken);
    const hashes = inserts.map((a, i) => {
      let h = newHash(s, a, ordinal[i]);
      while (used.has(h)) h = newHash(s, a, ++ordinal[i]);
      used.add(h);
      return h;
    });
    const clash = await t.transaction.findMany({ where: { rawHash: { in: hashes } }, select: { rawHash: true } });
    if (clash.length === 0) return hashes;
    clash.forEach((c) => taken.add(c.rawHash));
  }
}

/**
 * 한 범위를 재정합한다. runId의 IngestionRun은 성공(변경 없음 포함) 시 같은 트랜잭션에서 OK가 된다.
 * 가드에 걸리면 쓰지 않고 'skipped'를 돌려준다(호출자가 ERROR로 기록). 예외는 트랜잭션 롤백 후 던진다.
 */
export async function reconcileScope(s: ReconcileScope, runId: bigint): Promise<ReconcileResult> {
  return prisma.$transaction(async (t) => {
    // 같은 범위를 동시에 재정합하지 않는다(일일·재확인·수동 실행·롤백이 겹쳐도 직렬화).
    await lockScope(t, s.source, s.sigunguCode, s.yyyymm);
    const p = await prepare(t, s); // 잠금 뒤 재조회 — 앞선 실행의 결과를 본다
    const { db, plan } = p;
    const skip = guard(s, p);
    if (skip) return summarize(s, p, 'skipped', skip);

    const changed = plan.inserts.length + plan.archives.length + plan.cancelDateRepairs.length > 0;
    if (plan.archives.length > 0) {
      for (const reason of ['cancel', 'correction'] as const) {
        const ids = plan.archives.filter((a) => a.reason === reason).map((a) => a.row.id);
        if (ids.length === 0) continue;
        await t.$executeRaw`
          INSERT INTO "TransactionArchive" ("transactionId", "propertyId", "sigunguCode", "row", "reason", "runId")
          SELECT id, "propertyId", "sigunguCode", to_jsonb(x), ${reason}, ${runId} FROM "Transaction" x WHERE id = ANY(${ids}::bigint[])`;
        await t.$executeRaw`DELETE FROM "Transaction" WHERE id = ANY(${ids}::bigint[])`;
      }
    }
    if (plan.inserts.length > 0) {
      const hashes = await pickHashes(t, s, plan.inserts, db.map((d) => d.rawHash));
      const data = plan.inserts.map((a, i) => ({ ...a.data, rawHash: hashes[i] }));
      await t.transaction.createMany({ data }); // 해시 충돌이면 예외 → 전체 롤백(안전)
      const ins = await t.transaction.findMany({ where: { rawHash: { in: data.map((d) => d.rawHash) } }, select: { id: true } });
      await t.reconcileInsert.createMany({ data: ins.map((r) => ({ runId, transactionId: r.id })) });
    }
    if (plan.cancelDateRepairs.length > 0) {
      // 고치기 전 행을 남긴다(삭제하지 않음) — 롤백이 해제일을 되돌린다.
      const ids = plan.cancelDateRepairs.map((r) => r.id);
      await t.$executeRaw`
        INSERT INTO "TransactionArchive" ("transactionId", "propertyId", "sigunguCode", "row", "reason", "runId")
        SELECT id, "propertyId", "sigunguCode", to_jsonb(x), 'cancel-date', ${runId} FROM "Transaction" x WHERE id = ANY(${ids}::bigint[])`;
    }
    for (const r of plan.cancelDateRepairs) {
      await t.transaction.update({ where: { id: r.id }, data: { cancelDate: r.cancelDate } });
    }
    const result = summarize(s, p, changed ? 'applied' : 'unchanged');
    await enqueuePropertyAggregates(t, result.affectedPropertyIds);
    await t.ingestionRun.update({ where: { id: runId }, data: { status: 'OK', rowsUpserted: plan.inserts.length, finishedAt: new Date() } });
    return result;
  }, { timeout: 120_000, maxWait: 30_000 });
}

/**
 * 재정합 실행 하나를 되돌린다: 그 실행이 넣은 행을 지우고, 보관본을 원래 id 그대로 복원하고, 고친 해제일을 되돌린다.
 * 매물은 재집계 대기열로. 같은 범위의 나중 실행이 행을 넣거나 보관했으면 거부한다 — 최신 실행부터 역순으로 되돌린다
 * (나중 실행이 복원 대상과 같은 거래를 다시 넣었을 수 있어, 그대로 복원하면 중복이나 해시 충돌이 생긴다).
 */
export async function rollbackReconcileRun(runId: bigint): Promise<{ removed: number; restored: number }> {
  return prisma.$transaction(async (t) => {
    const run = await t.ingestionRun.findUniqueOrThrow({ where: { id: runId }, select: { source: true, targetKey: true } });
    // 같은 범위의 재정합과 겹치지 않게 같은 잠금을 잡는다(targetKey = '<시군구>-<YYYYMM>', runner.runOne).
    const [sgg, yyyymm] = run.targetKey.split('-');
    await lockScope(t, run.source, sgg, yyyymm);
    const laterRuns = (await t.ingestionRun.findMany({
      where: { source: run.source, targetKey: run.targetKey, id: { gt: runId } }, select: { id: true },
    })).map((r) => r.id);
    const laterChanges = laterRuns.length === 0 ? 0
      : (await t.transactionArchive.count({ where: { runId: { in: laterRuns } } })) + (await t.reconcileInsert.count({ where: { runId: { in: laterRuns } } }));
    if (laterChanges > 0) throw new Error(`같은 범위의 나중 실행이 ${laterChanges}건을 바꿨다 — 최신 실행부터 되돌려라`);

    const inserted = (await t.reconcileInsert.findMany({ where: { runId }, select: { transactionId: true } })).map((r) => r.transactionId);
    const props = await t.$queryRaw<{ pid: bigint }[]>`
      SELECT DISTINCT "propertyId" AS pid FROM "Transaction" WHERE id = ANY(${inserted}::bigint[])
      UNION SELECT DISTINCT "propertyId" FROM "TransactionArchive" WHERE "runId" = ${runId}`;
    const removed = await t.$executeRaw`DELETE FROM "Transaction" WHERE id = ANY(${inserted}::bigint[])`;
    const restored = await t.$executeRaw`
      INSERT INTO "Transaction" SELECT (jsonb_populate_record(NULL::"Transaction", "row")).*
      FROM "TransactionArchive" WHERE "runId" = ${runId} AND "reason" IN ('cancel', 'correction')`;
    await t.$executeRaw`
      UPDATE "Transaction" x SET "cancelDate" = (a."row"->>'cancelDate')::date
      FROM "TransactionArchive" a WHERE a."runId" = ${runId} AND a."reason" = 'cancel-date' AND x.id = a."transactionId"`;
    await t.transactionArchive.deleteMany({ where: { runId } });
    await t.reconcileInsert.deleteMany({ where: { runId } });
    await enqueuePropertyAggregates(t, props.map((p) => p.pid));
    logger.info({ runId: String(runId), removed, restored }, 'reconcile run rolled back');
    return { removed, restored };
  }, { timeout: 120_000 });
}
