/**
 * 가이드 무거운 블록 스냅샷 갱신. 일일 실거래 ingest 이후 실행한다.
 *
 *   pnpm tsx scripts/guide/refresh-data-snapshot.ts
 *
 * 집계 5종 합계가 실측 ~90초라 기본 statement_timeout에 걸린다.
 * `scripts/dashboard/refresh-snapshot.ts`와 같이 세션 모드(DIRECT_URL) + 단일 커넥션으로 돈다.
 *
 * 한 블록이 실패해도 나머지는 갱신한다 — 그 블록만 페이지에서 사라지고 본문은 그대로 읽힌다.
 */
export {}; // 톱레벨 import가 없으면 전역 스크립트로 취급돼 다른 스크립트의 main과 충돌한다.

async function main() {
  // prisma 싱글톤이 DATABASE_URL을 읽기 전에 덮어써야 하므로 아래는 전부 동적 import다.
  const base = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (base) {
    const sep = base.includes('?') ? '&' : '?';
    process.env.DATABASE_URL = `${base}${sep}connection_limit=1&pool_timeout=600`;
  }

  const { prisma } = await import('@/lib/db');
  const { writeGuideSnapshot } = await import('@/lib/guide/data-snapshot');
  const { computeAreaPrice } = await import('@/lib/guide/blocks/heavy/area-price');
  const { computeFloorPremium } = await import('@/lib/guide/blocks/heavy/floor-premium');
  const { computePriceTrend } = await import('@/lib/guide/blocks/heavy/price-trend');
  const { computeSubwayPremium } = await import('@/lib/guide/blocks/heavy/subway-premium');
  const { computeLtvByRegion } = await import('@/lib/guide/blocks/heavy/ltv-by-region');

  await prisma.$executeRawUnsafe('SET statement_timeout = 0');

  const jobs = [
    ['area-price', computeAreaPrice],
    ['floor-premium', computeFloorPremium],
    ['price-trend-24m', computePriceTrend],
    ['subway-premium', computeSubwayPremium],
    ['ltv-by-region', computeLtvByRegion],
  ] as const;

  let failed = 0;
  for (const [key, compute] of jobs) {
    const t = Date.now();
    try {
      await writeGuideSnapshot(key, await compute());
      console.log(`[guide-snapshot] ${key} ok in ${Date.now() - t}ms`);
    } catch (err) {
      failed++;
      console.error(`[guide-snapshot] ${key} FAILED`, err);
    }
  }

  await prisma.$disconnect();
  console.log(`[guide-snapshot] done — ${jobs.length - failed}/${jobs.length} ok`);
  // 전부 실패하면 연결·권한 문제다. ETL 로그에서 조용히 넘어가지 않도록 실패로 끝낸다.
  if (failed === jobs.length) process.exit(1);
}

main().catch((err) => {
  console.error('[guide-snapshot] fatal', err);
  process.exit(1);
});
