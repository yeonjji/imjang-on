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
  failed: number;
}

interface GroupRow {
  propertyType: string;
  nameNorm: string;
  regionCode: string;
  address: string;
}

export async function mergeDuplicateProperties(opts: { apply: boolean; limit?: number }): Promise<MergeStats> {
  const stats: MergeStats = { groups: 0, losers: 0, moved: 0, deleted: 0, failed: 0 };

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
    // 그룹 하나가 던지면(예: 운영 터널 위 트랜잭션 타임아웃) 나머지 그룹까지 죽지 않게
    // 한 그룹 단위로 격리한다. --limit엔 offset이 없어 실행을 그대로 죽이면 실패한
    // 그룹이 다음 재실행에서도 다시 1번이 되어 그 뒤 그룹이 영영 처리되지 않는다.
    try {
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

      if (!opts.apply) {
        stats.groups++;
        stats.losers += plan.losers.length;
        stats.moved += toMove.length;
        stats.deleted += toDelete.length;
        logger.info(
          { name: g.nameNorm, address: g.address, survivor: String(plan.survivor.id),
            losers: loserIds.map(String), move: toMove.length, del: toDelete.length },
          'DRY-RUN group',
        );
        continue;
      }

      await prisma.$transaction(
        async (t) => {
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
          // 기존에 이 패자들을 가리키던 리다이렉트(예: 2026-07-01 개편분, 이전 병합분)를
          // 생존자로 직접 재연결한다. 안 그러면 X → loser → survivor 체인이 남고,
          // populate-url-redirects는 한 홉만 보므로 X의 목적지를 loser URL로 스냅샷해 굳혀버린다.
          await t.property.updateMany({
            where: { redirectToId: { in: loserIds } },
            data: { redirectToId: plan.survivor.id },
          });
          // 패자에 redirectToId를 세우는 동시에 집계도 초기값으로 리셋한다.
          // updatePropertyAggregates는 Transaction을 GROUP BY propertyId로 조인하는데,
          // 패자는 거래가 0건이 되어 CTE에 행이 안 생기고 UPDATE...FROM이 매칭할 게 없어
          // 조용한 no-op이 된다 — 그대로 두면 패자가 병합 이전 집계값을 영원히 들고 있다가
          // lib/property.ts 등에서 redirectToId 필터로 걸러지지 않는 한 목록에 다시 노출된다.
          await t.property.updateMany({
            where: { id: { in: loserIds } },
            data: {
              redirectToId: plan.survivor.id,
              txCountTotal: 0,
              txCount12m: 0,
              lastTxAt: null,
              saleCount12m: 0,
              saleAvgPrice12m: null,
              saleLastPrice: null,
              saleLastAt: null,
              jeonseCount12m: 0,
              jeonseAvgDeposit12m: null,
              jeonseLastDeposit: null,
              jeonseLastAt: null,
              wolseCount12m: 0,
              wolseAvgDeposit12m: null,
              wolseAvgRent12m: null,
              wolseLastDeposit: null,
              wolseLastRent: null,
              wolseLastAt: null,
              areaTypes: [],
            },
          });
        },
        // 기본 5,000ms interactive-transaction 타임아웃은 운영 SSH 터널 위에서 거래가
        // 수백 건인 패자를 옮길 때 넘기기 쉽다(P2028). 넉넉히 잡는다.
        { timeout: 120_000, maxWait: 10_000 },
      );

      await updatePropertyAggregates([plan.survivor.id]);

      stats.groups++;
      stats.losers += plan.losers.length;
      stats.moved += toMove.length;
      stats.deleted += toDelete.length;

      // $transaction 커밋 + 집계 갱신이 모두 끝난 뒤에만 찍는다. 이 줄이 로그에 있으면
      // 그 그룹은 완전히 끝난 것 — 중단된 실행을 이어서 정리할 때 마지막 줄 다음부터
      // 다시 봐야 한다는 뜻이다.
      logger.info(
        { name: g.nameNorm, address: g.address, survivor: String(plan.survivor.id),
          losers: loserIds.map(String), move: toMove.length, del: toDelete.length },
        'group merged',
      );
    } catch (err) {
      stats.failed++;
      logger.error(
        { err, propertyType: g.propertyType, name: g.nameNorm, address: g.address, regionCode: g.regionCode },
        'group merge failed — skipping',
      );
    }
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
