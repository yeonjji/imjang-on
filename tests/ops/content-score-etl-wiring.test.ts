import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const etl = readFileSync('deploy/run-etl.sh', 'utf8');
const timers = readFileSync('deploy/systemd/install-timers.sh', 'utf8');

describe('content-score ETL 배선', () => {
  it('run-etl.sh에 daily·weekly 잡이 있다', () => {
    expect(etl).toMatch(/content-score-daily\)\s+\$DC pnpm tsx scripts\/ingest\/content-score\/runner\.ts --mode=daily/);
    expect(etl).toMatch(/content-score-weekly\)\s+\$DC pnpm tsx scripts\/ingest\/content-score\/runner\.ts --mode=weekly/);
  });
  it('타이머: daily 매일 04:00, 주변·비교(weekly 잡)는 월 1회 — 시설 수집(매월 1일) 다음 날 2일 04:30 UTC', () => {
    expect(timers).toContain('content-score-daily|*-*-* 04:00:00');
    expect(timers).toContain('content-score-weekly|*-*-02 04:30:00');
    expect(timers).not.toContain('content-score-weekly|Sun');
  });
  it('설치 직후 start 목록에도 들어 있다(하드코딩 목록)', () => {
    const start = timers.split('\n').find((l) => l.startsWith('sudo systemctl start'))!;
    expect(start).toContain('imjang-etl@content-score-daily.timer');
    expect(start).toContain('imjang-etl@content-score-weekly.timer');
  });
});
