/**
 * 실행 전체 기준 누적 이상 감지(S3). 범위별 가드(reconcile.ts guard)는 범위 하나만 본다 — 원천 형식이 조금 바뀌는 식의
 * 전국 단위 이상은 범위마다 가드 아래(보관 ≤ 20%)로 흩어져 통과할 수 있다. 이 차단기는 한 실행(runner 프로세스)에서
 * 끝난 범위들의 누적값을 보고, 기준을 넘으면 **새 범위를 시작하지 않게** 한다.
 * - 이미 끝난 범위는 되돌리지 않는다(각 범위는 원자적으로 커밋됐고, 필요하면 기간 단위 롤백으로 되돌린다).
 * - 진행 중인 범위는 그대로 끝난다(동시성 2).
 * - 재실행하면 완료(OK)된 범위는 doneRunFilter로 건너뛰고, 다시 돌아도 재정합은 멱등이라 중복이 생기지 않는다.
 *
 * 분모(설계 §15):
 * - 보관 비율 = 누적 보관 / 누적 DB 행(가드에 걸리지 않고 끝난 범위의 재정합 직전 DB 행). 보관은 그 행들에서만 나온다.
 * - 삽입 비율 = 누적 삽입 / 누적 원천 행(같은 범위들의 원천 행).
 * - 가드 비율 = 가드에 걸린 범위 / 끝난 범위(적용·무변경·가드·오류).
 * - 오류 = 예외로 끝난 범위 수(절대값).
 * 비율 기준은 표본이 작을 때 흔들리지 않도록 끝난 범위·행 수가 하한 이상일 때만 본다.
 * 다만 극단값(보관 10%·삽입 50% 초과)은 작은 표본(3범위·300행)에서도 바로 멈춘다 — 표본 하한에 닿기 전에
 * 범위 가드가 막지 못하는 삽입이 쌓이는 것을 막는다(보관은 범위 가드가 범위마다 max(10, 20%)로 묶는다).
 */
export interface BreakerLimits {
  /** 비율 판정을 시작할 최소 끝난 범위 수 */
  minScopes: number;
  /** 보관·삽입 비율 판정을 시작할 최소 분모 행 수 */
  minRows: number;
  maxGuardRate: number;
  maxArchiveRate: number;
  maxInsertRate: number;
  maxErrors: number;
  /** 작은 표본에서도 멈추는 극단 기준 */
  extremeMinScopes: number;
  extremeMinRows: number;
  extremeArchiveRate: number;
  extremeInsertRate: number;
}

/**
 * 기본값 근거: 운영 dry-run 30범위(2026-10-28) 가드 0%, 보관 0.6%, 삽입 8.4%(유형 최대 11.8%), 리허설 156범위 가드·오류 0.
 * 가드 5%·보관 2%·오류 5건은 리허설 보고의 중단 기준, 삽입은 관측 최대의 약 2배.
 * 극단 기준: 범위 하나의 관측 최대(보관 6.8%·삽입 19.6%)보다 충분히 높게 — 첫 3범위에서 정상 데이터로는 닿지 않는다.
 */
export const DEFAULT_LIMITS: BreakerLimits = {
  minScopes: 20,
  minRows: 2000,
  maxGuardRate: 0.05,
  maxArchiveRate: 0.02,
  maxInsertRate: 0.25,
  maxErrors: 5,
  extremeMinScopes: 3,
  extremeMinRows: 300,
  extremeArchiveRate: 0.1,
  extremeInsertRate: 0.5,
};

export type ScopeOutcome =
  | { kind: 'done'; db: number; api: number; inserted: number; archived: number }
  | { kind: 'guarded' }
  | { kind: 'error' };

export interface BreakerTotals {
  finished: number;
  applied: number;
  guarded: number;
  errors: number;
  dbRows: number;
  apiRows: number;
  inserted: number;
  archived: number;
}

export interface BreakerTrip {
  reason: 'errors' | 'guard-rate' | 'archive-rate' | 'insert-rate' | 'extreme-archive-rate' | 'extreme-insert-rate';
  /** 기준을 넘긴 값과 기준 */
  value: number;
  limit: number;
  totals: BreakerTotals;
  at: string;
}

export class RunBreaker {
  readonly totals: BreakerTotals = { finished: 0, applied: 0, guarded: 0, errors: 0, dbRows: 0, apiRows: 0, inserted: 0, archived: 0 };
  trip: BreakerTrip | null = null;

  constructor(readonly limits: BreakerLimits = DEFAULT_LIMITS) {}

  get tripped(): boolean { return this.trip !== null; }

  /** 범위 하나가 끝날 때마다 부른다. 처음 기준을 넘으면 trip을 남기고 true. 이미 넘었으면 계속 true. */
  record(o: ScopeOutcome): boolean {
    const t = this.totals;
    t.finished++;
    if (o.kind === 'guarded') t.guarded++;
    else if (o.kind === 'error') t.errors++;
    else { t.applied++; t.dbRows += o.db; t.apiRows += o.api; t.inserted += o.inserted; t.archived += o.archived; }
    if (!this.trip) this.trip = this.evaluate();
    return this.tripped;
  }

  private evaluate(): BreakerTrip | null {
    const t = this.totals; const l = this.limits;
    const mk = (reason: BreakerTrip['reason'], value: number, limit: number): BreakerTrip =>
      ({ reason, value, limit, totals: { ...t }, at: new Date().toISOString() });
    if (t.errors >= l.maxErrors) return mk('errors', t.errors, l.maxErrors);
    if (t.finished >= l.extremeMinScopes) {
      if (t.dbRows >= l.extremeMinRows && t.archived / t.dbRows > l.extremeArchiveRate) return mk('extreme-archive-rate', t.archived / t.dbRows, l.extremeArchiveRate);
      if (t.apiRows >= l.extremeMinRows && t.inserted / t.apiRows > l.extremeInsertRate) return mk('extreme-insert-rate', t.inserted / t.apiRows, l.extremeInsertRate);
    }
    if (t.finished < l.minScopes) return null;
    if (t.guarded / t.finished > l.maxGuardRate) return mk('guard-rate', t.guarded / t.finished, l.maxGuardRate);
    if (t.dbRows >= l.minRows && t.archived / t.dbRows > l.maxArchiveRate) return mk('archive-rate', t.archived / t.dbRows, l.maxArchiveRate);
    if (t.apiRows >= l.minRows && t.inserted / t.apiRows > l.maxInsertRate) return mk('insert-rate', t.inserted / t.apiRows, l.maxInsertRate);
    return null;
  }
}
