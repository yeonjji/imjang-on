import { describe, it, expect } from 'vitest';
import { isFresh, dropStale, MAX_SOURCE_AGE_DAYS } from '@/scripts/ingest/posts/freshness';
import type { BoardCandidate } from '@/scripts/ingest/posts/candidate';

const NOW = new Date('2026-07-13T00:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * DAY_MS);
}

function cand(pubDate: Date | null, link = 'https://x/1'): BoardCandidate {
  return {
    sourceKey: 'korea',
    agency: '국토교통부',
    title: 't',
    link,
    pubDate,
    bodyText: 'b',
    dedupeKey: link,
  };
}

describe('isFresh', () => {
  it('90일 이내면 통과', () => {
    expect(isFresh(daysAgo(0), NOW)).toBe(true);
    expect(isFresh(daysAgo(30), NOW)).toBe(true);
    expect(isFresh(daysAgo(89), NOW)).toBe(true);
  });

  it('정확히 90일은 포함(경계)', () => {
    expect(isFresh(daysAgo(MAX_SOURCE_AGE_DAYS), NOW)).toBe(true);
  });

  it('90일 초과면 제외', () => {
    expect(isFresh(daysAgo(91), NOW)).toBe(false);
    expect(isFresh(daysAgo(180), NOW)).toBe(false);
  });

  it('발행일 null이면 제외(나이 보증 불가)', () => {
    expect(isFresh(null, NOW)).toBe(false);
  });

  it('미래 발행일도 통과(음수 나이)', () => {
    expect(isFresh(new Date(NOW.getTime() + DAY_MS), NOW)).toBe(true);
  });
});

describe('dropStale', () => {
  it('나이 초과·발행일 없음을 제외하고 나머지 유지', () => {
    const fresh1 = cand(daysAgo(1), 'https://x/fresh1');
    const fresh2 = cand(daysAgo(89), 'https://x/fresh2');
    const stale = cand(daysAgo(200), 'https://x/stale');
    const noDate = cand(null, 'https://x/nodate');

    const { kept, staleDropped } = dropStale([fresh1, stale, fresh2, noDate], NOW);

    expect(kept.map((c) => c.link)).toEqual(['https://x/fresh1', 'https://x/fresh2']);
    expect(staleDropped).toBe(2);
  });

  it('빈 배열은 그대로', () => {
    const { kept, staleDropped } = dropStale([], NOW);
    expect(kept).toEqual([]);
    expect(staleDropped).toBe(0);
  });
});
