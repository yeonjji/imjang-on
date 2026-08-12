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
  const count = await writeSigunguMedianSnapshot();
  await prisma.$disconnect();

  // count=0은 정상 상태가 아니다(운영 실측 249곳) — 로그만 남기면 ETL 잡이 초록으로 지나가
  // 사람이 못 알아채므로, 여기서 실패로 끝내 기존 스냅샷이 그대로 유지됐음을 알린다.
  if (count === 0) {
    console.error(`[subscription-median] empty result — snapshot left unchanged (${Date.now() - t}ms)`);
    process.exit(1);
  }
  console.log(`[subscription-median] refreshed ${count} sigungus in ${Date.now() - t}ms`);
}

main().catch((err) => {
  console.error('[subscription-median] failed', err);
  process.exit(1);
});
