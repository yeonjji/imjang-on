import { describe, it, expect, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { queryWithTimeout } from '@/lib/content-score/db';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('queryWithTimeout', () => {
  it('제한 시간을 넘는 쿼리는 취소된다', async () => {
    await expect(queryWithTimeout(Prisma.sql`SELECT 1 AS n FROM pg_sleep(0.5)`, 50)).rejects.toThrow(/statement timeout/);
  });
  it('제한 안의 쿼리는 결과를 돌려준다', async () => {
    const rows = await queryWithTimeout<{ n: number }>(Prisma.sql`SELECT 1::int AS n`, 2000);
    expect(rows).toEqual([{ n: 1 }]);
  });
  it('제한은 그 쿼리에만 적용된다(같은 연결의 다음 쿼리는 영향 없음)', async () => {
    await queryWithTimeout(Prisma.sql`SELECT 1`, 50);
    await expect(prisma.$queryRaw`SELECT 1 AS n FROM pg_sleep(0.2)`).resolves.toBeDefined();
  });
});
