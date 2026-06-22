import { readHomeSnapshot } from '@/lib/dashboard-snapshot';
import { getSubscriptionList, type SubscriptionListItem } from '@/lib/subscription';
import type { MarketBriefing } from '@/lib/briefing';

export interface SubscriptionTeaser {
  item: SubscriptionListItem;
  status: 'OPEN' | 'UPCOMING';
}

/** OPEN 우선, 없으면 UPCOMING, 둘 다 없으면 null. (순수 선택 규칙) */
export function pickNearestSubscription(
  open: SubscriptionListItem[],
  upcoming: SubscriptionListItem[],
): SubscriptionTeaser | null {
  if (open.length > 0) return { item: open[0], status: 'OPEN' };
  if (upcoming.length > 0) return { item: upcoming[0], status: 'UPCOMING' };
  return null;
}

type ListFn = typeof getSubscriptionList;

/** 가장 가까운 청약 1건. 조회 실패 시 null(카드 미렌더). */
export async function getSubscriptionTeaser(
  listFn: ListFn = getSubscriptionList,
): Promise<SubscriptionTeaser | null> {
  try {
    const [open, upcoming] = await Promise.all([
      listFn({ status: 'OPEN', sort: 'recent', perPage: 1 }),
      listFn({ status: 'UPCOMING', sort: 'recent', perPage: 1 }),
    ]);
    return pickNearestSubscription(open.rows, upcoming.rows);
  } catch (err) {
    console.error('[board-detail] subscription teaser fetch failed', err);
    return null;
  }
}

type ReadSnapshotFn = () => Promise<{ briefing: MarketBriefing | null }>;

/** 오늘의 실거래가 브리핑. 조회 실패 시 null(카드 미렌더). */
export async function getTransactionTeaser(
  readSnapshot: ReadSnapshotFn = readHomeSnapshot,
): Promise<MarketBriefing | null> {
  try {
    const { briefing } = await readSnapshot();
    return briefing;
  } catch (err) {
    console.error('[board-detail] transaction teaser fetch failed', err);
    return null;
  }
}
