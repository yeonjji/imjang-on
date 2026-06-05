import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import { geocode } from '@/scripts/ingest/geocoder';
import { APPLYHOME_CONFIG, fetchApplyhomeCategory } from './adapter-applyhome';
import { fetchLhPresub } from './adapter-lh-presub';
import { upsertNoticeWithUnits } from './upsert';
import { SUBSCRIPTION_INGEST_SOURCE } from './types';
import type { NoticeWithUnits, SubscriptionSourceKey } from './types';

const ALL_KEYS: SubscriptionSourceKey[] = ['apt', 'urbty', 'remndr', 'pblpvt', 'opt', 'lh'];

function parseArgs(): { sources: SubscriptionSourceKey[] } {
  const raw = process.argv.slice(2).find((a) => a.startsWith('--source='))?.split('=')[1] ?? 'all';
  if (raw === 'all') return { sources: ALL_KEYS };
  if (!ALL_KEYS.includes(raw as SubscriptionSourceKey)) {
    throw new Error(`--source must be one of: ${ALL_KEYS.join(', ')}, all. Got: ${raw}`);
  }
  return { sources: [raw as SubscriptionSourceKey] };
}

async function collect(key: SubscriptionSourceKey): Promise<NoticeWithUnits[]> {
  if (key === 'lh') return fetchLhPresub();
  return fetchApplyhomeCategory(APPLYHOME_CONFIG[key]);
}

// 청약홈 공고: address 로 지오코딩 (LH 는 address 없음 → 스킵)
async function geocodeItems(items: NoticeWithUnits[]): Promise<void> {
  for (const { notice } of items) {
    if (!notice.address || (notice.lat != null && notice.lng != null)) continue;
    const coord = await geocode(notice.address);
    if (coord) {
      notice.lat = coord.lat;
      notice.lng = coord.lng;
    }
  }
}

async function runOne(key: SubscriptionSourceKey): Promise<number> {
  const source = SUBSCRIPTION_INGEST_SOURCE[key];
  const run = await prisma.ingestionRun.create({
    data: { source, targetKey: 'all', status: 'RUNNING' },
  });
  try {
    const items = await collect(key);
    await geocodeItems(items);
    let upserted = 0;
    for (const item of items) {
      await upsertNoticeWithUnits(item);
      upserted++;
    }
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'OK', rowsUpserted: upserted, finishedAt: new Date() },
    });
    logger.info({ key, upserted }, 'subscription source done');
    return upserted;
  } catch (err) {
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() },
    });
    throw err;
  }
}

async function main() {
  try {
    const { sources } = parseArgs();
    logger.info({ sources }, 'subscription ingest start');
    let total = 0;
    let failed = 0;
    for (const key of sources) {
      try {
        total += await runOne(key);
      } catch (err) {
        failed++;
        logger.error({ err, key }, 'subscription source failed');
      }
    }
    const summary = { total, failed, sources };
    logger.info(summary, 'subscription ingest done');
    await notify(failed === 0 ? 'info' : 'warn', 'subscription ingest complete', summary);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  logger.error({ err }, 'subscription runner fatal');
  process.exit(1);
});
