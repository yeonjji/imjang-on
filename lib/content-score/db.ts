// 점수 배치의 무거운 쿼리에 쿼리 단위 statement_timeout을 건다(설계 §4.3). 트랜잭션 로컬 설정이라
// 같은 연결의 다른 쿼리(웹 요청 등)에는 영향이 없다.
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

export const CONTENT_SCORE_STATEMENT_TIMEOUT_MS = 60_000;

const setTimeout_ = (ms: number) => prisma.$queryRaw`SELECT set_config('statement_timeout', ${String(Math.max(1, Math.floor(ms)))}, true)`;

export async function queryWithTimeout<T>(sql: Prisma.Sql, ms = CONTENT_SCORE_STATEMENT_TIMEOUT_MS): Promise<T[]> {
  const [, rows] = await prisma.$transaction([setTimeout_(ms), prisma.$queryRaw<T[]>(sql)]);
  return rows;
}

export async function executeWithTimeout(sql: Prisma.Sql, ms = CONTENT_SCORE_STATEMENT_TIMEOUT_MS): Promise<number> {
  const [, n] = await prisma.$transaction([setTimeout_(ms), prisma.$executeRaw(sql)]);
  return n;
}
