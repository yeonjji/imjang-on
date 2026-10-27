import { describe, it, expect } from 'vitest';
import { parseReaggArgs } from '@/scripts/ops/reaggregate-properties';

const argv = (...a: string[]) => ['node', 'reaggregate-properties.ts', ...a];

describe('parseReaggArgs', () => {
  it('기본은 전체 dry-run', () => {
    expect(parseReaggArgs(argv()).options).toMatchObject({ target: { kind: 'all' }, apply: false, enqueueDiff: false, resume: false });
  });
  it('적용·백업·체크포인트·재개·정지 파일·묶음·휴식·디스크 하한', () => {
    const o = parseReaggArgs(argv('--target=cancelled-apartments', '--apply', '--backup-dir=/b', '--checkpoint=/b/cp.json', '--resume',
      '--stop-file=/tmp/s', '--batch-size=500', '--pause-ms=0', '--max-batches=1', '--min-free-gb=12')).options!;
    expect(o).toMatchObject({ target: { kind: 'cancelled-apartments' }, apply: true, backupDir: '/b', checkpointFile: '/b/cp.json',
      resume: true, stopFile: '/tmp/s', batchSize: 500, pauseMs: 0, maxBatches: 1, minFreeGb: 12 });
  });
  it('ids 대상', () => {
    expect(parseReaggArgs(argv('--target=ids', '--ids=3,1,2')).options!.target).toEqual({ kind: 'ids', ids: [3n, 1n, 2n] });
    expect(() => parseReaggArgs(argv('--target=ids'))).toThrow(/--ids/);
  });
  it('롤백은 다른 인자보다 우선, 경로에 = 포함 가능', () => {
    expect(parseReaggArgs(argv('--rollback=/b/x=1.jsonl', '--apply'))).toEqual({ rollback: '/b/x=1.jsonl' });
  });
  it('알 수 없는 대상은 거부', () => {
    expect(() => parseReaggArgs(argv('--target=everything'))).toThrow(/알 수 없는/);
  });
});
