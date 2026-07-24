// 방식 B1: 폐지지역 구 orphan 물리 삭제. 기본은 DRY RUN(카운트만).
// 실제 삭제: CONFIRM_DELETE=yes pnpm tsx scripts/ops/delete-region-orphans.ts
// 선행: populate-url-redirects.ts로 UrlRedirect 스냅샷 완료(301 유지)해야 함.
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

// 폐지: 인천 중구(28110)·동구(28140)·서구(28260) + 광주(29) + 전남(46)
const OLD_TX = `"sigunguCode" IN ('28110','28140','28260') OR "sigunguCode" LIKE '29%' OR "sigunguCode" LIKE '46%'`;
const OLD_PROP = `"regionCode" LIKE '2811%' OR "regionCode" LIKE '2814%' OR "regionCode" LIKE '2826%' OR "regionCode" LIKE '29%' OR "regionCode" LIKE '46%'`;
const OLD_SCHOOL = `"sigunguCode" LIKE '29%' OR "sigunguCode" LIKE '46%'`;
const OLD_CHILD = `"sigunguCode" IN ('28110','28140','28260') OR "sigunguCode" LIKE '29%' OR "sigunguCode" LIKE '46%'`;

async function count(table: string, clause: string): Promise<number> {
  const r = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT count(*)::bigint AS c FROM "${table}" WHERE ${clause}`,
  );
  return Number(r[0].c);
}

async function main() {
  const dryRun = process.env.CONFIRM_DELETE !== 'yes';
  const [tx, prop, school, child] = await Promise.all([
    count('Transaction', OLD_TX),
    count('Property', OLD_PROP),
    count('School', OLD_SCHOOL),
    count('Childcare', OLD_CHILD),
  ]);
  logger.info({ tx, prop, school, child, dryRun }, 'delete-orphans: 삭제 대상 카운트');

  if (dryRun) {
    logger.warn('DRY RUN — 실제 삭제하려면 CONFIRM_DELETE=yes. 아무것도 삭제 안 함.');
    await prisma.$disconnect();
    return;
  }

  // 안전장치: 301 스냅샷이 선행돼야 삭제(구 URL 색인 신호 보존). 매핑이 대상의 90% 미만이면 중단.
  const propRedirects = await prisma.urlRedirect.count({ where: { kind: 'property' } });
  if (prop > 0 && propRedirects < prop * 0.9) {
    throw new Error(`UrlRedirect property 매핑(${propRedirects}) < 삭제대상(${prop})*0.9 — populate-url-redirects 먼저 실행`);
  }

  // FK 순서: Transaction(propertyId→Property) 먼저, 그 다음 Property. School·Childcare는 의존 없음.
  const dTx = await prisma.$executeRawUnsafe(`DELETE FROM "Transaction" WHERE ${OLD_TX}`);
  logger.info({ deleted: dTx }, 'Transaction 삭제');
  const dProp = await prisma.$executeRawUnsafe(`DELETE FROM "Property" WHERE ${OLD_PROP}`);
  logger.info({ deleted: dProp }, 'Property 삭제');
  const dSchool = await prisma.$executeRawUnsafe(`DELETE FROM "School" WHERE ${OLD_SCHOOL}`);
  logger.info({ deleted: dSchool }, 'School 삭제');
  const dChild = await prisma.$executeRawUnsafe(`DELETE FROM "Childcare" WHERE ${OLD_CHILD}`);
  logger.info({ deleted: dChild }, 'Childcare 삭제');
  logger.info('delete-orphans 완료 (301은 UrlRedirect가 유지)');
  await prisma.$disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'delete-orphans fatal');
  process.exit(1);
});
