// 경합으로 갈라진 중복 단지를 병합한다. 기본 DRY-RUN, 실제 반영은 --apply.
// 그룹 키: (propertyType, nameNorm, regionCode, address), 생존자: 최소 id.
// 패자는 삭제하지 않고 redirectToId로 301을 건다.
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { PropertyType } from '@prisma/client';
import { updatePropertyAggregates } from '@/scripts/ingest/aggregator';
import { computeHash } from '@/scripts/ingest/transactions/runner';
import type { NormalizedTransaction } from '@/scripts/ingest/types';
import { planGroupMerge, hashInputFromDbRow } from './core';

export interface MergeStats {
  groups: number;
  losers: number;
  moved: number;
  deleted: number;
}

interface GroupRow {
  propertyType: string;
  nameNorm: string;
  regionCode: string;
  address: string;
}

export async function mergeDuplicateProperties(opts: { apply: boolean; limit?: number }): Promise<MergeStats> {
  const stats: MergeStats = { groups: 0, losers: 0, moved: 0, deleted: 0 };

  // redirectToId IS NULL — 이미 리다이렉트된 행(2026-07-01 개편분, 이전 병합분)은 대상이 아니다.
  const groups = await prisma.$queryRaw<GroupRow[]>`
    SELECT "propertyType"::text AS "propertyType", "nameNorm", "regionCode", address
    FROM "Property"
    WHERE "redirectToId" IS NULL
    GROUP BY 1, 2, 3, 4
    HAVING COUNT(*) > 1
    ORDER BY 1, 2, 3, 4
  `;

  const targets = opts.limit ? groups.slice(0, opts.limit) : groups;
  logger.info({ groups: targets.length, total: groups.length, apply: opts.apply }, 'merge targets');

  for (const g of targets) {
    const rows = await prisma.property.findMany({
      where: {
        propertyType: g.propertyType as PropertyType,
        nameNorm: g.nameNorm,
        regionCode: g.regionCode,
        address: g.address,
        redirectToId: null,
      },
      select: { id: true, builtYear: true },
    });
    const plan = planGroupMerge(rows);
    if (!plan) continue;

    stats.groups++;
    stats.losers += plan.losers.length;
    const loserIds = plan.losers.map((l) => l.id);

    const txs = await prisma.transaction.findMany({
      where: { propertyId: { in: loserIds } },
      select: {
        id: true, dealType: true, contractDate: true, exclusiveArea: true,
        floor: true, dealAmount: true, deposit: true, monthlyRent: true,
      },
    });

    // 해시 계산과 충돌 판정은 읽기 전용이라 dry-run에서도 그대로 돌린다.
    // 그래야 dry-run의 moved/deleted가 --apply의 실제 결과와 같아진다.
    const toMove: Array<{ id: bigint; hash: string }> = [];
    const toDelete: bigint[] = [];
    const claimed = new Set<string>();
    for (const row of txs) {
      // rawHash는 propertyId를 포함하고 @@unique다. 재계산하지 않으면 다음 수집 때
      // ETL이 생존자 id로 만든 해시와 달라 같은 거래가 다시 삽입된다.
      const newHash = computeHash(hashInputFromDbRow(row) as unknown as NormalizedTransaction, plan.survivor.id);
      // 패자가 둘 이상인 그룹에서는 서로 내용이 같은 거래가 같은 새 해시로 매핑될 수 있다.
      // claimed로 걸러내지 않으면 두 번째 update가 @@unique(rawHash)를 위반한다.
      if (claimed.has(newHash)) {
        toDelete.push(row.id);
        continue;
      }
      const clash = await prisma.transaction.findUnique({ where: { rawHash: newHash }, select: { id: true } });
      if (clash) {
        toDelete.push(row.id);
      } else {
        claimed.add(newHash);
        toMove.push({ id: row.id, hash: newHash });
      }
    }
    stats.moved += toMove.length;
    stats.deleted += toDelete.length;

    if (!opts.apply) {
      logger.info(
        { name: g.nameNorm, address: g.address, survivor: String(plan.survivor.id),
          losers: loserIds.map(String), move: toMove.length, del: toDelete.length },
        'DRY-RUN group',
      );
      continue;
    }

    await prisma.$transaction(async (t) => {
      if (toDelete.length > 0) {
        await t.transaction.deleteMany({ where: { id: { in: toDelete } } });
      }
      for (const m of toMove) {
        await t.transaction.update({
          where: { id: m.id },
          data: { propertyId: plan.survivor.id, rawHash: m.hash },
        });
      }
      if (plan.builtYear !== null) {
        await t.property.update({ where: { id: plan.survivor.id }, data: { builtYear: plan.builtYear } });
      }
      await t.property.updateMany({
        where: { id: { in: loserIds } },
        data: { redirectToId: plan.survivor.id },
      });
    });

    await updatePropertyAggregates([plan.survivor.id]);
  }

  logger.info(stats, opts.apply ? 'merge applied' : 'merge dry-run complete');
  return stats;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;

  const stats = await mergeDuplicateProperties({ apply, limit });
  if (!apply) {
    console.log('\n[DRY-RUN] 실제 반영하려면 --apply');
  }
  console.log(JSON.stringify(stats, null, 2));
  await prisma.$disconnect();
}

// 테스트에서 import할 때는 main을 돌리지 않는다.
if (process.argv[1]?.includes('merge-duplicate-properties')) {
  main().catch((err) => {
    logger.error({ err }, 'merge failed');
    process.exit(1);
  });
}
