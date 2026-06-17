import { describe, it, expect, afterEach, vi } from 'vitest';
import { STATIC_ENTRIES } from '@/lib/sitemap/static-entries';
import { SOURCE_ORDER } from '@/lib/sitemap/sources';
import { LIFE_GROUPS } from '@/app/(public)/_components/life-menu';

describe('sitemap STATIC_ENTRIES', () => {
  it('/life 자체 URL을 포함한다', () => {
    expect(STATIC_ENTRIES.some((e) => e.url.endsWith('/life'))).toBe(true);
  });

  it('LIFE_GROUPS의 4개 그룹 허브 URL을 모두 포함한다', () => {
    for (const g of LIFE_GROUPS) {
      expect(
        STATIC_ENTRIES.some((e) => e.url.endsWith(`/life/${g.slug}`)),
        `missing entry for /life/${g.slug}`,
      ).toBe(true);
    }
  });

  it('/urban/parking을 포함한다', () => {
    expect(STATIC_ENTRIES.some((e) => e.url.endsWith('/urban/parking'))).toBe(true);
  });
});

describe('sitemap SOURCE_ORDER', () => {
  it('대출상품(loan) 상세 소스를 포함한다', () => {
    expect(SOURCE_ORDER.some((s) => s.key === 'loan')).toBe(true);
  });
});

describe('sitemap STATIC_ENTRIES 게시판 게이팅', () => {
  const orig = process.env.NEXT_PUBLIC_BOARD_ENABLED;
  afterEach(() => {
    if (orig === undefined) delete process.env.NEXT_PUBLIC_BOARD_ENABLED;
    else process.env.NEXT_PUBLIC_BOARD_ENABLED = orig;
    vi.resetModules();
  });

  it('게시판 비공개면 /board 를 사이트맵에서 제외한다', async () => {
    delete process.env.NEXT_PUBLIC_BOARD_ENABLED;
    vi.resetModules();
    const { STATIC_ENTRIES: entries } = await import('@/lib/sitemap/static-entries');
    expect(entries.some((e) => e.url.endsWith('/board'))).toBe(false);
  });

  it('게시판 공개면 /board 를 사이트맵에 포함한다', async () => {
    process.env.NEXT_PUBLIC_BOARD_ENABLED = 'true';
    vi.resetModules();
    const { STATIC_ENTRIES: entries } = await import('@/lib/sitemap/static-entries');
    expect(entries.some((e) => e.url.endsWith('/board'))).toBe(true);
  });
});
