import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';

// 운영에서 쓰는 명령 그대로(--apply) 실행하면 DB에 닿기 전에 오류 메시지와 함께 종료 코드 2로 끝난다.
describe('매물 병합 CLI --apply 차단', () => {
  it('오류 메시지를 출력하고 종료 코드 2로 끝난다', () => {
    const r = spawnSync('pnpm', ['exec', 'tsx', 'scripts/ops/merge-duplicate-properties/index.ts', '--apply'], {
      // DB 주소를 닿을 수 없는 곳으로 — 차단이 DB 접근보다 먼저인지 확인한다(접속을 시도하면 다른 오류로 끝남).
      env: { ...process.env, DATABASE_URL: 'postgresql://blocked:blocked@127.0.0.1:1/none', DIRECT_URL: 'postgresql://blocked:blocked@127.0.0.1:1/none' },
      encoding: 'utf8',
      timeout: 60_000,
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('[차단] 매물 병합 --apply는 차단되어 있습니다');
    expect(r.stderr).toContain('DB는 변경하지 않았습니다');
  }, 60_000);
});
