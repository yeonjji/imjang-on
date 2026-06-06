import { SubscriptionCategory, SubscriptionSource } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import { geocode } from '@/scripts/ingest/geocoder';
import { APPLYHOME_CONFIG, fetchApplyhomeNotices, fetchUnits } from './adapter-applyhome';
import { fetchLhPresub } from './adapter-lh-presub';
import { computeContentHash } from './content-hash';
import { diffByHash } from './diff';
import { upsertNoticeWithUnits } from './upsert';
import { SUBSCRIPTION_INGEST_SOURCE } from './types';
import type { ExistingNotice, NoticeWithUnits, SubscriptionSourceKey } from './types';

const ALL_KEYS: SubscriptionSourceKey[] = ['apt', 'urbty', 'remndr', 'pblpvt', 'opt', 'lh'];

function parseArgs(): { sources: SubscriptionSourceKey[] } {
  const raw = process.argv.slice(2).find((a) => a.startsWith('--source='))?.split('=')[1] ?? 'all';
  if (raw === 'all') return { sources: ALL_KEYS };
  if (!ALL_KEYS.includes(raw as SubscriptionSourceKey)) {
    throw new Error(`--source must be one of: ${ALL_KEYS.join(', ')}, all. Got: ${raw}`);
  }
  return { sources: [raw as SubscriptionSourceKey] };
}

// key → SubscriptionNotice 의 (source, category) 스코프
function noticeScope(key: SubscriptionSourceKey): {
  source: SubscriptionSource;
  category: SubscriptionCategory;
} {
  if (key === 'lh') {
    return { source: SubscriptionSource.LH_PRESUB, category: SubscriptionCategory.LH_PRESUB };
  }
  return { source: SubscriptionSource.APPLYHOME, category: APPLYHOME_CONFIG[key].category };
}

// 해당 스코프의 기존 공고를 diff 비교용으로 가볍게 로드(rawJson 제외, 좌표는 lat/lng 로 환산)
async function loadExisting(
  source: SubscriptionSource,
  category: SubscriptionCategory,
): Promise<Map<string, ExistingNotice>> {
  const rows = await prisma.$queryRaw<
    { sourceKey: string; contentHash: string | null; address: string | null; lat: number | null; lng: number | null }[]
  >`
    SELECT "sourceKey", "contentHash", "address",
           ST_Y("location"::geometry) AS lat,
           ST_X("location"::geometry) AS lng
    FROM "SubscriptionNotice"
    WHERE "source" = ${source}::"SubscriptionSource"
      AND "category" = ${category}::"SubscriptionCategory"
  `;
  const map = new Map<string, ExistingNotice>();
  for (const r of rows) {
    map.set(r.sourceKey, { contentHash: r.contentHash, address: r.address, lat: r.lat, lng: r.lng });
  }
  return map;
}

// 신규/주소변경일 때만 카카오 호출, 주소 동일하면 기존 좌표 재사용
async function geocodeNotice(
  notice: NoticeWithUnits['notice'],
  prev: ExistingNotice | undefined,
): Promise<void> {
  if (!notice.address) return;
  if (prev && prev.lat != null && prev.lng != null && prev.address === notice.address) {
    notice.lat = prev.lat;
    notice.lng = prev.lng;
    return;
  }
  const coord = await geocode(notice.address);
  if (coord) {
    notice.lat = coord.lat;
    notice.lng = coord.lng;
  }
}

async function runOne(key: SubscriptionSourceKey): Promise<number> {
  const source = SUBSCRIPTION_INGEST_SOURCE[key];
  const run = await prisma.ingestionRun.create({
    data: { source, targetKey: 'all', status: 'RUNNING' },
  });
  try {
    const isLh = key === 'lh';
    const items: NoticeWithUnits[] = isLh
      ? await fetchLhPresub()
      : (await fetchApplyhomeNotices(APPLYHOME_CONFIG[key])).map((notice) => ({ notice, units: [] }));
    for (const item of items) {
      item.notice.contentHash = computeContentHash(item.notice);
    }
    logger.info({ key, fetched: items.length }, 'notices fetched');

    const { source: noticeSource, category } = noticeScope(key);
    const existing = await loadExisting(noticeSource, category);
    const { changed, skipped } = diffByHash(items, existing);
    logger.info({ key, changed: changed.length, skipped }, 'change diff');

    let upserted = 0;
    for (const item of changed) {
      if (!isLh) {
        item.units = await fetchUnits(
          APPLYHOME_CONFIG[key],
          item.notice.houseManageNo,
          item.notice.pblancNo,
        );
      }
      await geocodeNotice(item.notice, existing.get(item.notice.sourceKey));
      await upsertNoticeWithUnits(item);
      upserted++;
      if (upserted % 50 === 0) {
        logger.info({ key, upserted, total: changed.length }, 'upsert progress');
      }
    }
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'OK', rowsUpserted: upserted, finishedAt: new Date() },
    });
    logger.info({ key, upserted, skipped }, 'subscription source done');
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
    // 소스별 실패는 격리하되, 하나라도 실패하면 잡을 실패로 종료해 CI(Actions)가 잡아내도록 한다.
    if (failed > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  logger.error({ err }, 'subscription runner fatal');
  process.exit(1);
});
