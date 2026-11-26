/**
 * 세종 단지·거래의 regionCode를 시 단위(3611000000)로 맞춘다(1회성 보정, 2026-11-26).
 *
 * 실거래 적재가 LAWD_CD 36110을 세종 읍·면·동 중 임의 하나(용호동·소정면 등)로 매핑해, 2026-05 이후 적재분이
 * 엉뚱한 동·면에 붙었다. 적재 쪽은 scripts/ingest/transactions/sigungu.ts selectIngestTargets로 고쳤고,
 * 이 스크립트는 이미 붙은 행을 바로잡는다. 매칭은 regionCode가 '36110'으로 시작하는지로만 보므로
 * 코드를 바꿔도 기존 단지가 그대로 이어진다. 바꾸기 전 Property_dedupe_key 충돌을 확인하고, 있으면 멈춘다.
 *
 * 기본은 DRY-RUN(집계만). 실제 반영은 --apply.
 *   pnpm exec dotenv -e .env.local -- tsx scripts/ops/fix-sejong-region-code.ts [--apply]
 */
import { prisma } from '@/lib/db';

const APPLY = process.argv.includes('--apply');
const CITY = '3611000000';

async function main() {
  const props = await prisma.$queryRaw<{ regionCode: string; n: bigint }[]>`
    SELECT "regionCode", COUNT(*) AS n FROM "Property"
    WHERE "sigunguCode" = '36110' AND "regionCode" <> ${CITY} GROUP BY 1 ORDER BY 2 DESC`;
  const txs = await prisma.$queryRaw<{ regionCode: string; n: bigint }[]>`
    SELECT "regionCode", COUNT(*) AS n FROM "Transaction"
    WHERE "sigunguCode" = '36110' AND "regionCode" <> ${CITY} GROUP BY 1 ORDER BY 2 DESC`;
  const collisions = await prisma.$queryRaw<{ id: bigint; dup: bigint }[]>`
    SELECT a.id, b.id AS dup FROM "Property" a
    JOIN "Property" b ON b.id <> a.id AND b."propertyType" = a."propertyType" AND b."nameNorm" = a."nameNorm"
      AND b.address = a.address AND b."redirectToId" IS NULL
      AND (b."regionCode" = ${CITY} OR (b."sigunguCode" = '36110' AND b."regionCode" <> ${CITY}))
    WHERE a."sigunguCode" = '36110' AND a."regionCode" <> ${CITY} AND a."redirectToId" IS NULL`;

  console.log('Property 대상', props.map((r) => `${r.regionCode}:${r.n}`).join(', ') || '없음');
  console.log('Transaction 대상', txs.map((r) => `${r.regionCode}:${r.n}`).join(', ') || '없음');
  console.log('dedupe 충돌', collisions.length);
  if (collisions.length) {
    console.log(collisions.slice(0, 20).map((c) => `${c.id}~${c.dup}`).join(' '));
    throw new Error('dedupe 충돌이 있어 멈춘다 — 병합 먼저');
  }
  if (!APPLY) {
    console.log('DRY-RUN. 반영하려면 --apply');
    return;
  }
  const [p, t] = await prisma.$transaction([
    prisma.$executeRaw`UPDATE "Property" SET "regionCode" = ${CITY} WHERE "sigunguCode" = '36110' AND "regionCode" <> ${CITY}`,
    prisma.$executeRaw`UPDATE "Transaction" SET "regionCode" = ${CITY} WHERE "sigunguCode" = '36110' AND "regionCode" <> ${CITY}`,
  ]);
  console.log(`반영: Property ${p}건, Transaction ${t}건`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
