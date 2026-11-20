/**
 * 아파트 상세 지역 비교 스냅샷(시군구 × 면적대 ㎡당 가격 분포) 갱신. 일일 실거래 ingest 뒤 실행한다.
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
  const { writeAptRegionSnapshots } = await import('@/lib/apt-region/snapshot');

  await prisma.$executeRawUnsafe('SET statement_timeout = 0');
  const t = Date.now();
  const count = await writeAptRegionSnapshots();
  await prisma.$disconnect();

  // 운영 실측 255개 시군구 코드. 0이면 기존 스냅샷을 그대로 두고 실패로 끝내 사람이 알 수 있게 한다.
  if (count === 0) {
    console.error(`[apt-region] empty result — snapshot left unchanged (${Date.now() - t}ms)`);
    process.exit(1);
  }
  console.log(`[apt-region] refreshed ${count} sigungu keys in ${Date.now() - t}ms`);
}

main().catch((err) => {
  console.error('[apt-region] failed', err);
  process.exit(1);
});
