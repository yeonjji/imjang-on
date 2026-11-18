// 이미 적재된 SubscriptionUnit.topAmount에 원자료 오기 보정표(lib/subscription/amount-corrections.ts)를 한 번 적용한다.
// 새로 수집되는 행은 어댑터(normalizeUnit)가 보정하므로, 이 스크립트는 보정표에 항목을 추가했을 때만 다시 돌리면 된다.
// 기본은 DRY RUN(대상만 출력). 실제 반영: CONFIRM_APPLY=yes pnpm tsx scripts/ops/apply-subscription-amount-corrections.ts
// 원자료 값과 같은 행만 바꾼다 — 이미 보정됐거나 청약홈이 바로잡은 행은 건드리지 않는다(멱등).
// 반영 후 해당 공고 상세/목록 ISR은 /api/revalidate로 무효화할 것.
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { AMOUNT_CORRECTIONS } from '@/lib/subscription/amount-corrections';

async function main() {
  const apply = process.env.CONFIRM_APPLY === 'yes';
  for (const c of AMOUNT_CORRECTIONS) {
    const rows = await prisma.$queryRaw<Array<{ id: bigint; noticeId: bigint; topAmount: number | null }>>`
      SELECT u.id, u."noticeId", u."topAmount"
      FROM "SubscriptionUnit" u JOIN "SubscriptionNotice" n ON n.id = u."noticeId"
      WHERE n."houseManageNo" = ${c.houseManageNo} AND u."houseType" = ${c.houseType}
        AND u."topAmount" = ${c.sourceAmount}
    `;
    logger.info(
      { houseManageNo: c.houseManageNo, houseType: c.houseType, from: c.sourceAmount, to: c.amount, rows: rows.map((r) => ({ id: String(r.id), noticeId: String(r.noticeId) })) },
      'amount-correction 대상',
    );
    if (!apply || rows.length === 0) continue;
    const updated = await prisma.$executeRaw`
      UPDATE "SubscriptionUnit" SET "topAmount" = ${c.amount}
      WHERE id IN (${Prisma.join(rows.map((r) => r.id))}) AND "topAmount" = ${c.sourceAmount}
    `;
    logger.info({ updated }, 'amount-correction 반영');
  }
  if (!apply) logger.warn('DRY RUN — 반영하려면 CONFIRM_APPLY=yes. 아무것도 바꾸지 않음.');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  logger.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
