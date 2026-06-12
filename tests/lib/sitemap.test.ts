import { describe, it, expect } from 'vitest';
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
