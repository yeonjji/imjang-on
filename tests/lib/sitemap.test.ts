import { describe, it, expect } from 'vitest';
import { STATIC_ENTRIES } from '@/lib/sitemap/static-entries';
import { SOURCE_ORDER } from '@/lib/sitemap/sources';
import { LIFE_GROUPS } from '@/app/(public)/_components/life-menu';

describe('sitemap STATIC_ENTRIES', () => {
  it('/life 자체 URL을 포함하지 않는다 (허브 제거)', () => {
    expect(STATIC_ENTRIES.some((e) => e.url.endsWith('/life'))).toBe(false);
  });

  it('LIFE_GROUPS의 그룹 허브 URL을 하나도 포함하지 않는다 (허브 제거)', () => {
    for (const g of LIFE_GROUPS) {
      expect(
        STATIC_ENTRIES.some((e) => e.url.endsWith(`/life/${g.slug}`)),
        `should not have entry for /life/${g.slug}`,
      ).toBe(false);
    }
  });

  it('/urban/parking 정식 URL(?sido)만 포함하고 리다이렉트되는 bare 엔트리는 제외한다', () => {
    expect(STATIC_ENTRIES.some((e) => e.url.includes('/urban/parking?sido='))).toBe(true);
    expect(STATIC_ENTRIES.some((e) => e.url.endsWith('/urban/parking'))).toBe(false);
  });
});

describe('sitemap SOURCE_ORDER', () => {
  it('대출상품(loan) 상세 소스를 포함한다', () => {
    expect(SOURCE_ORDER.some((s) => s.key === 'loan')).toBe(true);
  });
});

describe('sitemap STATIC_ENTRIES 게시판', () => {
  it('게시판은 상시 공개이므로 /board 를 사이트맵에 포함한다', () => {
    expect(STATIC_ENTRIES.some((e) => e.url.endsWith('/board'))).toBe(true);
  });
});
