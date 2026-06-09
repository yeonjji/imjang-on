/**
 * 홈 대시보드 스냅샷(시장 브리핑·인기지역) 갱신 스크립트.
 * 일일 ingest 이후 실행한다. 무거운 집계라 세션 모드(DIRECT_URL) + 긴 statement_timeout으로 돈다.
 *
 *   dotenv -e .env.local -- tsx scripts/dashboard/refresh-snapshot.ts
 */
async function main() {
  // 긴 집계는 세션 모드(DIRECT_URL)로 연결한다. connection_limit=1로 단일 커넥션을 강제하면
  // 아래 SET statement_timeout이 모든 쿼리에 적용된다. 코드의 병렬 쿼리는 pool_timeout을
  // 길게 둬서(실패 대신) 그 커넥션을 순차 대기하게 한다 — 오프라인 ETL이라 순차 실행도 무방.
  // prisma 싱글톤이 DATABASE_URL을 읽기 전에 덮어써야 하므로 동적 import를 사용한다.
  const base = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (base) {
    const sep = base.includes('?') ? '&' : '?';
    process.env.DATABASE_URL = `${base}${sep}connection_limit=1&pool_timeout=300`;
  }

  const { prisma } = await import('@/lib/db');
  const { writeHomeSnapshot } = await import('@/lib/dashboard-snapshot');

  // 단일 커넥션에 statement_timeout 해제(대량 집계가 기본 한도에 걸리지 않도록).
  await prisma.$executeRawUnsafe(`SET statement_timeout = 0`);

  const t = Date.now();
  await writeHomeSnapshot();
  console.log(`[dashboard-snapshot] refreshed in ${Date.now() - t}ms`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[dashboard-snapshot] failed', err);
  process.exit(1);
});
