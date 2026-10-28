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
  it('알 수 없는 api·월 형식은 거부', () => {
    expect(() => parseReconcileArgs(['--api=foo', '--sgg=all', '--months=202606'], now)).toThrow(/api/);
    expect(() => parseReconcileArgs(['--sgg=all', '--months=2026-06'], now)).toThrow(/months/);
  });
});
