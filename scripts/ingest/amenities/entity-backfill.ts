import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decodeEntities } from '@/lib/text/decode-entities';

/**
 * 기존에 인코딩된 채로 저장된 상가(Store)·전통시장(TraditionalMarket)의 name·address를
 * 1회성으로 디코딩한다(예: '&lt;주&gt;세븐' → '<주>세븐'). 멱등하므로 재실행해도 안전하다.
 * sourceId는 건드리지 않는다(전통시장 sourceId는 원본 해시 기준으로 유지).
 */
const READ_BATCH = 1000;

interface Row {
  id: bigint;
  name: string;
  address: string;
}

async function backfillTable(
  label: string,
  fetchPage: (cursor: bigint) => Promise<Row[]>,
  update: (id: bigint, name: string, address: string) => Promise<unknown>,
): Promise<{ label: string; scanned: number; updated: number }> {
  let cursor = 0n;
  let scanned = 0;
  let updated = 0;

  for (;;) {
    // '&' 포함 행만 후보로 스캔. 업데이트된 행은 더 이상 매칭되지 않고 커서 뒤에 있어 재조회되지 않는다.
    const rows = await fetchPage(cursor);
    if (rows.length === 0) break;

    for (const r of rows) {
      scanned++;
      const name = decodeEntities(r.name);
      const address = decodeEntities(r.address);
      if (name !== r.name || address !== r.address) {
        await update(r.id, name, address);
        updated++;
      }
    }
    cursor = rows[rows.length - 1].id;
  }

  logger.info({ label, scanned, updated }, 'entity backfill: table done');
  return { label, scanned, updated };
}

async function main() {
  const storeRes = await backfillTable(
    'Store',
    (cursor) =>
      prisma.store.findMany({
        where: {
          id: { gt: cursor },
          OR: [{ name: { contains: '&' } }, { address: { contains: '&' } }],
        },
        select: { id: true, name: true, address: true },
        orderBy: { id: 'asc' },
        take: READ_BATCH,
      }),
    (id, name, address) => prisma.store.update({ where: { id }, data: { name, address } }),
  );

  const marketRes = await backfillTable(
    'TraditionalMarket',
    (cursor) =>
      prisma.traditionalMarket.findMany({
        where: {
          id: { gt: cursor },
          OR: [{ name: { contains: '&' } }, { address: { contains: '&' } }],
        },
        select: { id: true, name: true, address: true },
        orderBy: { id: 'asc' },
        take: READ_BATCH,
      }),
    (id, name, address) =>
      prisma.traditionalMarket.update({ where: { id }, data: { name, address } }),
  );

  logger.info({ results: [storeRes, marketRes] }, 'entity backfill: all done');
  await prisma.$disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'entity backfill fatal');
  process.exit(1);
});
