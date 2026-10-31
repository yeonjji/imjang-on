import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// 타이머 JOBS·시작 목록·run-etl 디스패처가 서로 맞는지(시작 목록 하드코딩 누락 함정 방지).
const timers = readFileSync('deploy/systemd/install-timers.sh', 'utf8');
const etl = readFileSync('deploy/run-etl.sh', 'utf8');
const jobsBlock = timers.slice(timers.indexOf("JOBS='") + 6, timers.indexOf("'", timers.indexOf("JOBS='") + 6));
const jobs = jobsBlock.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.split('|')[0]);
const startLine = timers.split('\n').find((l) => l.includes('systemctl start'))!;

describe('ETL 타이머 배선', () => {
  it('S2 잡이 등록돼 있다', () => {
    expect(jobs).toEqual(expect.arrayContaining(['property-aggregates', 'property-aggregate-check']));
  });
  it.each(jobs)('%s: 시작 목록과 run-etl 디스패처에 모두 있다', (job) => {
    expect(startLine).toContain(`imjang-etl@${job}.timer`);
    expect(etl).toMatch(new RegExp(`^\\s+${job.replace(/-/g, '\\-')}\\)`, 'm'));
  });
  it('S3 재확인 잡: 매일 상한만큼, 2~6개월 전은 7일·7~12개월 전은 30일 주기', () => {
    expect(jobs).toContain('transactions-recheck');
    const block = etl.slice(etl.indexOf('  transactions-recheck)'), etl.indexOf(';;', etl.indexOf('  transactions-recheck)')));
    expect(block).toContain('--mode=recheck --offsets=2-6 --window-days=7 --limit=');
    expect(block).toContain('--mode=recheck --offsets=7-12 --window-days=30 --limit=');
    expect(block).toContain('exit $rc'); // 앞 단계 실패를 숨기지 않는다
  });
  it('거래 수집(daily·recheck)은 같은 잠금으로 직렬화된다(매물 중복 생성 경쟁 방지)', () => {
    const daily = etl.slice(etl.indexOf('  transactions-daily)'), etl.indexOf(';;', etl.indexOf('  transactions-daily)')));
    expect(daily).toContain('$TX_LOCK $DC pnpm ingest:run');
    const block = etl.slice(etl.indexOf('  transactions-recheck)'), etl.indexOf(';;', etl.indexOf('  transactions-recheck)')));
    expect(block.match(/\$TX_LOCK \$DC pnpm ingest:run/g)).toHaveLength(2);
  });
  it('주간 점검은 S5 전까지 대기열에 넣지 않는다(dry-run)', () => {
    const line = etl.split('\n').find((l) => l.trim().startsWith('property-aggregate-check)'))!;
    expect(line).toContain('--mode=check');
    expect(line).not.toContain('--enqueue-diff');
  });
});
