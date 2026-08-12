/**
 * 시군구별 실거래 중위가 스냅샷 갱신. 일일 실거래 ingest 이후 실행한다.
 * 무거운 집계라 세션 모드(DIRECT_URL) + 단일 커넥션으로 돈다.
 */
export {}; // 톱레벨 import가 없으면 전역 스크립트로 취급돼 다른 스크립트의 main과 충돌한다.

async function main() {
  const base = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (base) {
    const sep = base.includes('?') ? '&' : '?';
    process.env.DATABASE_URL = `${base}${sep}connection_limit=1&pool_timeout=600`;
  }
  const { prisma } = await import('@/lib/db');
  const { writeSigunguMedianSnapshot } = await import('@/lib/subscription/median-snapshot');

  await prisma.$executeRawUnsafe('SET statement_timeout = 0');
  const t = Date.now();
  await writeSigunguMedianSnapshot();
  console.log(`[subscription-median] refreshed in ${Date.now() - t}ms`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[subscription-median] failed', err);
  process.exit(1);
});
