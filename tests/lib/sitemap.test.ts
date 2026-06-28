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
  // thin-content 대응: 고유 서술 없는 상세는 noindex + 사이트맵 제외.
  // docs/adsense/thin-content-diagnosis.md 참고.
  it('색인 대상 소스(core·property·post)만 포함한다', () => {
    const keys = SOURCE_ORDER.map((s) => s.key);
    expect(keys).toContain('core');
    expect(keys).toContain('property');
    expect(keys).toContain('post');
  });

  it('noindex 처리한 thin 상세 소스는 사이트맵에서 제외한다', () => {
    const keys = SOURCE_ORDER.map((s) => s.key);
    for (const excluded of [
      'loan',
      'subscription',
      'school',
      'childcare',
      'pharmacy',
      'hospital',
      'jeonse-guarantee',
    ]) {
      expect(keys, `${excluded}는 noindex 대상이므로 사이트맵에서 제외되어야 함`).not.toContain(excluded);
    }
  });
});

describe('sitemap STATIC_ENTRIES 게시판', () => {
  it('게시판은 상시 공개이므로 /board 를 사이트맵에 포함한다', () => {
    expect(STATIC_ENTRIES.some((e) => e.url.endsWith('/board'))).toBe(true);
  });
});
