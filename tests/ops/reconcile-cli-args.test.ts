import { describe, it, expect } from 'vitest';
import { parseReconcileArgs } from '@/scripts/ops/reconcile-transactions';

describe('parseReconcileArgs', () => {
  const now = new Date(2026, 9, 28);
  it('롤백은 run id만', () => {
    expect(parseReconcileArgs(['--rollback-run=42'], now).rollbackRun).toBe(42n);
  });
  it('dry-run: api·시군구·오프셋 월', () => {
    expect(parseReconcileArgs(['--api=apt-trade,offi-trade', '--sgg=11110', '--offsets=0-1'], now))
      .toMatchObject({ apis: ['apt-trade', 'offi-trade'], sgg: ['11110'], months: ['202610', '202609'] });
  });
  it('시군구를 정하지 않으면 거부(호출량 의식)', () => {
    expect(() => parseReconcileArgs(['--months=202606'], now)).toThrow(/--sgg/);
  });
  it('기간 일괄 롤백: 기본은 dry-run, 필터를 읽는다', () => {
    expect(parseReconcileArgs(['--rollback-since=2026-11-01T00:00:00Z', '--rollback-until=2026-11-02T00:00:00Z', '--source=molit-apt-trade', '--sgg=11440'], now).bulkRollback)
      .toEqual({ apply: false, auditDir: undefined, filter: { since: new Date('2026-11-01T00:00:00Z'), until: new Date('2026-11-02T00:00:00Z'), source: 'molit-apt-trade', sigunguCode: '11440' } });
  });
  it('기간 일괄 롤백 --apply는 감사 로그 디렉터리가 있어야 한다', () => {
    expect(() => parseReconcileArgs(['--rollback-since=2026-11-01', '--apply'], now)).toThrow(/audit-dir/);
    expect(parseReconcileArgs(['--rollback-since=2026-11-01', '--apply', '--audit-dir=/tmp/a'], now).bulkRollback).toMatchObject({ apply: true, auditDir: '/tmp/a' });
  });
  it('기간 형식 오류·역순 기간은 거부', () => {
    expect(() => parseReconcileArgs(['--rollback-since=어제'], now)).toThrow(/날짜/);
    expect(() => parseReconcileArgs(['--rollback-since=2026-11-02', '--rollback-until=2026-11-01'], now)).toThrow(/뒤여야/);
  });
  it('알 수 없는 api·월 형식은 거부', () => {
    expect(() => parseReconcileArgs(['--api=foo', '--sgg=all', '--months=202606'], now)).toThrow(/api/);
    expect(() => parseReconcileArgs(['--sgg=all', '--months=2026-06'], now)).toThrow(/months/);
  });
});
