import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { geocode } from '@/scripts/ingest/geocoder';

async function main() {
  const targets = await prisma.$queryRaw<Array<{ id: bigint; address: string }>>`
    SELECT id, address FROM "Property"
    WHERE location IS NULL
    ORDER BY "createdAt" DESC
    LIMIT 500
  `;
  logger.info({ count: targets.length }, 'reconcile candidates');

  for (const t of targets) {
    const coord = await geocode(t.address);
    if (coord) {
      await prisma.$executeRaw`
        UPDATE "Property"
        SET location = ST_SetSRID(ST_MakePoint(${coord.lng}, ${coord.lat}), 4326)::geography
        WHERE id = ${t.id}
      `;
      logger.info({ id: String(t.id), coord }, 'reconciled');
    }
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'reconcile failed');
  process.exit(1);
});
