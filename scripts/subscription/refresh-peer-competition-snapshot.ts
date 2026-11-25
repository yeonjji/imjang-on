/**
 * 청약 공고별 "같은 가격대 공고 경쟁률" 스냅샷 갱신. 청약 결과 수집(subscriptions 잡) 뒤 실행한다
 * (lib/subscription/peer-competition.ts). 전체를 다시 계산하며 수십 초면 끝난다.
 */
export {}; // 톱레벨 import가 없으면 전역 스크립트로 취급돼 다른 스크립트의 main과 충돌한다.

async function main() {
  const base = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (base) {
    const sep = base.includes('?') ? '&' : '?';
    process.env.DATABASE_URL = `${base}${sep}connection_limit=1&pool_timeout=600`;
  }
  const { prisma } = await import('@/lib/db');
  const { refreshPeerCompetitionSnapshots } = await import('@/lib/subscription/peer-competition');
  await prisma.$executeRawUnsafe('SET statement_timeout = 0');
  const t = Date.now();
  const r = await refreshPeerCompetitionSnapshots();
  await prisma.$disconnect();
  console.log(`[subscription-peer-competition] wrote ${r.written} of ${r.eligible} eligible notices in ${Date.now() - t}ms`);
}

main().catch((err) => {
  console.error('[subscription-peer-competition] failed', err);
  process.exit(1);
});
