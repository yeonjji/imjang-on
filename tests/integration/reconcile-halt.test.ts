import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { prisma } from '@/lib/db';
import { getHalt, setHalt, clearHalt, HALT_SOURCE } from '@/scripts/ingest/transactions/halt';

// 수집 정지 상태: 차단기가 멈추면 기록되고, 해제 전까지 예약 수집이 원천을 부르지 않고 끝난다.
beforeEach(async () => { await prisma.ingestionRun.deleteMany({ where: { source: HALT_SOURCE } }); });
afterAll(async () => { await prisma.ingestionRun.deleteMany({ where: { source: HALT_SOURCE } }); await prisma.$disconnect(); });

describe('수집 정지 상태', () => {
  it('기록 → 조회 → 사유와 함께 해제, 이력은 남는다', async () => {
    expect(await getHalt()).toEqual({ active: false });
    await setHalt('breaker:archive-rate', { trip: { value: 0.03 } });
    expect(await getHalt()).toMatchObject({ active: true, reason: 'breaker:archive-rate', detail: { trip: { value: 0.03 } } });
    await expect(clearHalt('  ')).rejects.toThrow(/사유/);
    await clearHalt('원천 형식 변경 확인, 어댑터 수정 배포');
    expect((await getHalt()).active).toBe(false);
    await expect(clearHalt('x')).rejects.toThrow(/정지 상태가 아니다/);
    expect(await prisma.ingestionRun.count({ where: { source: HALT_SOURCE } })).toBe(2);
  });

  it('정지 상태면 수집기(실제 진입점)가 원천을 부르지 않고 종료 코드 1로 끝난다', async () => {
    await setHalt('breaker:errors');
    expect((await getHalt()).active).toBe(true); // 아래 실행이 실제 수집으로 넘어가지 않게 먼저 확인
    const before = await prisma.ingestionRun.count();
    const r = spawnSync('pnpm', ['exec', 'tsx', 'scripts/ingest/transactions/runner.ts', '--mode=daily'], {
      env: { ...process.env, PUBLIC_DATA_KEY: '', DISCORD_WEBHOOK_URL: '', REVALIDATE_TOKEN: '', LOG_LEVEL: 'info' },
      encoding: 'utf8', timeout: 60_000,
    });
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toContain('transactions ETL is halted');
    expect(await prisma.ingestionRun.count()).toBe(before); // 수집 단위를 하나도 만들지 않았다
  }, 60_000);
});
