import { describe, it, expect } from 'vitest';
import { RunBreaker, DEFAULT_LIMITS, type ScopeOutcome } from '@/scripts/ingest/transactions/run-breaker';

const done = (db: number, inserted = 0, archived = 0, api = db + inserted): ScopeOutcome => ({ kind: 'done', db, api, inserted, archived });
const feed = (b: RunBreaker, xs: ScopeOutcome[]) => xs.map((x) => b.record(x));

describe('RunBreaker — 실행 전체 누적 기준', () => {
  it('정상 범위만 있으면 멈추지 않는다(운영 dry-run 수준: 보관 0.6%·삽입 8.4%)', () => {
    const b = new RunBreaker();
    feed(b, Array.from({ length: 200 }, () => done(300, 25, 2)));
    expect(b.tripped).toBe(false);
    expect(b.totals).toMatchObject({ finished: 200, applied: 200, dbRows: 60_000, archived: 400 });
  });

  it('보관 누적 비율이 2%를 넘으면 멈춘다 — 분모는 끝난 범위의 DB 행', () => {
    const b = new RunBreaker();
    feed(b, Array.from({ length: 19 }, () => done(100)));
    expect(b.record(done(100, 0, 41))).toBe(true); // 41 / 2000 = 2.05%
    expect(b.trip).toMatchObject({ reason: 'archive-rate', limit: 0.02 });
    expect(b.trip!.value).toBeCloseTo(41 / 2000);
    expect(b.trip!.totals).toMatchObject({ finished: 20, dbRows: 2000, archived: 41 });
  });

  it('여러 범위에 흩어진 이상(범위마다 가드 아래 보관 15%)도 누적으로 잡는다', () => {
    const b = new RunBreaker();
    const r = feed(b, Array.from({ length: 30 }, () => done(100, 15, 15))); // 범위 가드(max(10,20%))는 통과하는 수준
    expect(r.indexOf(true)).toBe(19); // 표본 하한(20범위·2,000행)에 닿는 순간 멈춤
    expect(b.trip!.reason).toBe('archive-rate');
  });

  it('정상 범위 뒤에 이상이 와도 그 시점에 멈춘다(앞선 정상 범위 수치 포함)', () => {
    const b = new RunBreaker();
    feed(b, Array.from({ length: 50 }, () => done(200, 10, 1))); // 10,000행 · 보관 50
    const r = feed(b, Array.from({ length: 20 }, () => done(200, 0, 20)));
    // 누적 보관 50 + 20n > 2% × (10,000 + 200n) = 200 + 4n → n ≥ 10
    expect(r.indexOf(true)).toBe(9);
    expect(b.trip!.totals.finished).toBe(60);
  });

  it('삽입 누적 비율 25% 초과', () => {
    const b = new RunBreaker();
    feed(b, Array.from({ length: 20 }, () => done(80, 30, 0, 110)));
    expect(b.trip).toMatchObject({ reason: 'insert-rate' }); // 600 / 2,200 = 27%
  });

  it('가드 비율 5% 초과(분모 = 끝난 범위 전체)', () => {
    const b = new RunBreaker();
    feed(b, [...Array.from({ length: 18 }, () => done(10)), { kind: 'guarded' }, { kind: 'guarded' }]);
    expect(b.trip).toMatchObject({ reason: 'guard-rate', value: 0.1 });
  });

  it('오류는 표본 하한 없이 5건이면 멈춘다(원천 장애·한도 소진)', () => {
    const b = new RunBreaker();
    const r = feed(b, Array.from({ length: 6 }, () => ({ kind: 'error' as const })));
    expect(r).toEqual([false, false, false, false, true, true]);
    expect(b.trip).toMatchObject({ reason: 'errors', value: 5 });
  });

  it('표본이 작으면 비율로 멈추지 않는다(초반 한두 범위로 오판 방지)', () => {
    const b = new RunBreaker();
    feed(b, [done(10, 0, 5), done(10, 0, 5)]); // 50%지만 2범위·20행
    expect(b.tripped).toBe(false);
  });

  it('한 번 멈추면 첫 사유를 유지한다', () => {
    const b = new RunBreaker({ ...DEFAULT_LIMITS, maxErrors: 1 });
    b.record({ kind: 'error' });
    const first = b.trip;
    feed(b, Array.from({ length: 30 }, () => done(100, 0, 50)));
    expect(b.trip).toBe(first);
  });
});
