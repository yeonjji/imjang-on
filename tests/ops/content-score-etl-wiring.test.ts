import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const etl = readFileSync('deploy/run-etl.sh', 'utf8');
const timers = readFileSync('deploy/systemd/install-timers.sh', 'utf8');

describe('content-score ETL 배선', () => {
  it('run-etl.sh에 daily·weekly 잡이 있다', () => {
    expect(etl).toMatch(/content-score-daily\)\s+\$DC pnpm tsx scripts\/ingest\/content-score\/runner\.ts --mode=daily/);
    expect(etl).toMatch(/content-score-weekly\)\s+\$DC pnpm tsx scripts\/ingest\/content-score\/runner\.ts --mode=weekly/);
  });
  it('타이머: 스펙 §4.3 시간대(02~14 UTC) — daily 매일 04:00, weekly 일요일 04:30 UTC', () => {
    expect(timers).toContain('content-score-daily|*-*-* 04:00:00');
    expect(timers).toContain('content-score-weekly|Sun *-*-* 04:30:00');
  });
  it('설치 직후 start 목록에도 들어 있다(하드코딩 목록)', () => {
    const start = timers.split('\n').find((l) => l.startsWith('sudo systemctl start'))!;
    expect(start).toContain('imjang-etl@content-score-daily.timer');
    expect(start).toContain('imjang-etl@content-score-weekly.timer');
  });
});
