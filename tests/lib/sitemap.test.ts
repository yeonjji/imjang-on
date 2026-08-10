import { describe, it, expect } from 'vitest';
import { STATIC_ENTRIES } from '@/lib/sitemap/static-entries';
import { SOURCE_ORDER } from '@/lib/sitemap/sources';
import { LIFE_GROUPS } from '@/app/(public)/_components/life-menu';
import { SITE_URL } from '@/lib/site';
import { AMENITY_SLUGS, AMENITY_CATEGORIES, amenityListPath } from '@/lib/amenity/category';
import { URBAN_SLUGS, URBAN_CATEGORIES, urbanListPath } from '@/lib/urban/category';

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

describe('sitemap STATIC_ENTRIES 허브 정본 경로 (P1-3·P1-4)', () => {
  it('amenity·urban 허브를 canonical과 같은 정본 경로로, 카테고리당 정확히 1개씩 담는다', () => {
    // 종전에는 amenity 전부를 ?sido=서울로 넣어 전통시장(스코프 불필요)의 canonical(bare)과
    // 어긋났고, urban은 parking 하나만 들어 있었다. 사이트맵 URL ≠ canonical이면
    // '대체 페이지(적absolute canonical)' 경고가 난다.
    // 경로는 세그먼트로 정확히 비교한다 — startsWith면 '/urban/park'가 '/urban/parking'도 잡는다.
    const atPath = (path: string) =>
      STATIC_ENTRIES.filter((e) => new URL(e.url).pathname === path).map((e) => e.url);

    for (const slug of AMENITY_SLUGS) {
      const want = `${SITE_URL}${amenityListPath(AMENITY_CATEGORIES[slug])}`;
      expect(atPath(`/amenity/${slug}`), `amenity/${slug}`).toEqual([want]);
    }
    for (const slug of URBAN_SLUGS) {
      const want = `${SITE_URL}${urbanListPath(URBAN_CATEGORIES[slug])}`;
      expect(atPath(`/urban/${slug}`), `urban/${slug}`).toEqual([want]);
    }
  });

  it('시군구 파라미터(?region=) URL을 담지 않는다', () => {
    // 카테고리 × 시군구 994건은 같은 템플릿의 근접중복이라 제거했다. canonical이 정본 허브로
    // 접히므로 사이트맵에 남기면 모순이다.
    expect(STATIC_ENTRIES.filter((e) => e.url.includes('region='))).toEqual([]);
  });

  it('원본 글 허브와 생활 인프라 허브를 담는다', () => {
    // /guide 상세 28건은 사이트맵에 있는데 부모 허브가 빠져 있었다(자산 누락).
    for (const path of ['/guide', '/childcare', '/childcare/regions', '/medical/hospital']) {
      expect(STATIC_ENTRIES.some((e) => e.url === `${SITE_URL}${path}`), path).toBe(true);
    }
  });
});

describe('목록 정본 경로 헬퍼', () => {
  it('시도 스코프가 필요하면 ?sido=서울, 아니면 bare — 리다이렉트되는 URL을 정본으로 삼지 않는다', () => {
    // requiresSidoScope !== false 인 카테고리는 bare가 307이라 정본이 될 수 없다.
    expect(amenityListPath(AMENITY_CATEGORIES.convenience)).toBe('/amenity/convenience?sido=%EC%84%9C%EC%9A%B8');
    expect(amenityListPath(AMENITY_CATEGORIES.market)).toBe('/amenity/market');
    expect(urbanListPath(URBAN_CATEGORIES.parking)).toBe('/urban/parking?sido=%EC%84%9C%EC%9A%B8');
    expect(urbanListPath(URBAN_CATEGORIES.charger)).toBe('/urban/charger');
  });
});
