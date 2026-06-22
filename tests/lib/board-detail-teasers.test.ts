import { describe, it, expect } from 'vitest';
import {
  pickNearestSubscription,
  getSubscriptionTeaser,
  getTransactionTeaser,
} from '@/lib/board/detail-teasers';
import type { SubscriptionListItem, SubscriptionListResult } from '@/lib/subscription';
import type { MarketBriefing } from '@/lib/briefing';

function item(over: Partial<SubscriptionListItem> = {}): SubscriptionListItem {
  return {
    id: '1',
    name: '테스트단지',
    category: 'APT',
    regionName: '서울특별시',
    receiptBegin: new Date('2026-07-01'),
    receiptEnd: new Date('2026-07-10'),
    totalSupply: 100,
    unitCount: 3,
    minPrice: 50000,
    maxPrice: 90000,
    minArea: 59,
    maxArea: 84,
    ...over,
  };
}
function listResult(rows: SubscriptionListItem[]): SubscriptionListResult {
  return { rows, total: rows.length, totalPages: 1, page: 1, perPage: 1 };
}

describe('pickNearestSubscription', () => {
  it('OPEN이 있으면 OPEN을 고른다', () => {
    const open = [item({ name: '접수중단지' })];
    const upcoming = [item({ name: '예정단지' })];
    expect(pickNearestSubscription(open, upcoming)).toEqual({ item: open[0], status: 'OPEN' });
  });
  it('OPEN이 없으면 UPCOMING을 고른다', () => {
    const upcoming = [item({ name: '예정단지' })];
    expect(pickNearestSubscription([], upcoming)).toEqual({ item: upcoming[0], status: 'UPCOMING' });
  });
  it('둘 다 없으면 null', () => {
    expect(pickNearestSubscription([], [])).toBeNull();
  });
});

describe('getSubscriptionTeaser (주입형)', () => {
  it('OPEN을 우선 선택한다', async () => {
    const open = item({ name: '접수중' });
    const fakeList = async (opts: { status?: string }): Promise<SubscriptionListResult> =>
      opts.status === 'OPEN' ? listResult([open]) : listResult([item({ name: '예정' })]);
    expect(await getSubscriptionTeaser(fakeList as never)).toEqual({ item: open, status: 'OPEN' });
  });
  it('조회가 throw하면 null', async () => {
    const thrower = async (): Promise<SubscriptionListResult> => {
      throw new Error('db blip');
    };
    expect(await getSubscriptionTeaser(thrower as never)).toBeNull();
  });
});

describe('getTransactionTeaser (주입형)', () => {
  it('briefing을 그대로 반환한다', async () => {
    const briefing = { refDate: '2026-06-21' } as MarketBriefing;
    expect(await getTransactionTeaser(async () => ({ briefing }))).toBe(briefing);
  });
  it('조회가 throw하면 null', async () => {
    expect(
      await getTransactionTeaser(async () => {
        throw new Error('blip');
      }),
    ).toBeNull();
  });
});
