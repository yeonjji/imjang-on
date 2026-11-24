/**
 * 청약 공고별 "분양가 ÷ 주변 신축 시세" 스냅샷 갱신. 청약 공고 수집(subscriptions 잡) 뒤 실행한다.
 * 스냅샷이 없거나 공고 후 60일 이내인 공고만 계산한다(lib/subscription/newbuild-compare.ts).
 */
export {}; // 톱레벨 import가 없으면 전역 스크립트로 취급돼 다른 스크립트의 main과 충돌한다.

async function main() {
  const base = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (base) {
    const sep = base.includes('?') ? '&' : '?';
    process.env.DATABASE_URL = `${base}${sep}connection_limit=1&pool_timeout=600`;
  }
  const { prisma } = await import('@/lib/db');
  const { refreshNewbuildSnapshots } = await import('@/lib/subscription/newbuild-compare');
  await prisma.$executeRawUnsafe('SET statement_timeout = 0');
  const t = Date.now();
  const r = await refreshNewbuildSnapshots();
  await prisma.$disconnect();
  console.log(`[subscription-newbuild] computed ${r.computed} of ${r.eligible} eligible notices in ${Date.now() - t}ms`);
}

main().catch((err) => {
  console.error('[subscription-newbuild] failed', err);
  process.exit(1);
});
