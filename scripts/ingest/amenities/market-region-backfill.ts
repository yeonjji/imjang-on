import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { matchSigunguCode, type RegionRef } from './match-sigungu';

const READ_BATCH = 2000;
const UPDATE_CHUNK = 1000;

async function main() {
  const regionRows = await prisma.region.findMany({
    where: { level: 2, isAbolished: false, sigunguCode: { not: null } },
    select: { sido: true, sigungu: true, sigunguCode: true },
  });
  const regions: RegionRef[] = regionRows
    .filter((r) => !!r.sigungu && !!r.sigunguCode)
    .map((r) => ({ sido: r.sido, sigungu: r.sigungu as string, sigunguCode: r.sigunguCode as string }));
  logger.info({ regions: regions.length }, 'market backfill: regions loaded');

  const byCode = new Map<string, bigint[]>();
  let matched = 0;
  let unmatched = 0;
  const unmatchedSamples: string[] = [];
  let cursor = 0n;

  for (;;) {
    const rows = await prisma.traditionalMarket.findMany({
      where: { id: { gt: cursor } },
      select: { id: true, address: true },
      orderBy: { id: 'asc' },
      take: READ_BATCH,
    });
    if (rows.length === 0) break;
    for (const m of rows) {
      const code = matchSigunguCode(m.address, regions);
      if (code) {
        const arr = byCode.get(code) ?? [];
        arr.push(m.id);
        byCode.set(code, arr);
        matched++;
      } else {
        unmatched++;
        if (unmatchedSamples.length < 20) unmatchedSamples.push(m.address);
      }
    }
    cursor = rows[rows.length - 1].id;
  }
  logger.info({ matched, unmatched, codes: byCode.size }, 'market backfill: matching done');

  for (const [code, ids] of byCode) {
    for (let i = 0; i < ids.length; i += UPDATE_CHUNK) {
      const chunk = ids.slice(i, i + UPDATE_CHUNK);
      await prisma.$executeRaw`
        UPDATE "TraditionalMarket" SET "sigunguCode" = ${code}
        WHERE id IN (${Prisma.join(chunk)})
      `;
    }
  }

  logger.info({ matched, unmatched, unmatchedSamples }, 'market backfill done');
  await prisma.$disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'market backfill fatal');
  process.exit(1);
});
