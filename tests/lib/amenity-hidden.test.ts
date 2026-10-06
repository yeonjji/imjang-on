import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

// 상권·편의(/amenity) 비공개 상태. 공개 상태는 기존 테스트가 플래그를 true로 모킹해 검증한다.
vi.mock('@/lib/amenity/visibility', () => ({ isAmenityPublic: () => false }));

import { middleware } from '@/middleware';
import { LIFE_GROUPS } from '@/app/(public)/_components/life-menu';
import { getSiblingTabs } from '@/lib/life/sibling-tabs';
import { STATIC_ENTRIES } from '@/lib/sitemap/static-entries';
import { buildInfraCategories, type RawInfra } from '@/lib/amenity/infra';

function req(pathname: string): NextRequest {
  return new NextRequest(new URL(pathname, 'http://localhost'));
}

describe('상권·편의 비공개', () => {
  it('middleware가 /amenity 하위 전부를 없는 경로로 rewrite한다(→ 사이트 404, ISR 캐시 앞단)', () => {
    for (const p of ['/amenity', '/amenity/convenience', '/amenity/market/123', '/amenity/cafe/9/']) {
      const res = middleware(req(p));
      expect(res.headers.get('x-middleware-rewrite'), p).toContain('/_amenity-hidden');
    }
  });

  it('비슷한 접두어(/amenity-x)나 다른 경로는 건드리지 않는다', () => {
    for (const p of ['/amenityx', '/urban/park', '/subscription/1']) {
      expect(middleware(req(p)).headers.get('x-middleware-rewrite'), p).toBeNull();
    }
  });

  it('생활편의 메뉴에서 상권·편의 그룹이 빠진다', () => {
    expect(LIFE_GROUPS.map((g) => g.slug)).toEqual(['education', 'medical', 'urban']);
    expect(LIFE_GROUPS.flatMap((g) => g.items).some((i) => i.href.startsWith('/amenity'))).toBe(false);
    expect(getSiblingTabs('/amenity/convenience')).toBeNull();
  });

  it('사이트맵에 /amenity URL이 없다', () => {
    expect(STATIC_ENTRIES.some((e) => e.url.includes('/amenity'))).toBe(false);
  });

  it('주변 생활 인프라에서 편의·마트·카페·전통시장 블록을 숨기고 나머지는 남긴다', () => {
    const store = (id: number, industryCode: string) => ({
      id: BigInt(id), name: `s${id}`, branchName: null, industryCode, industryName: 'x', distanceMeters: 10,
    });
    const raw = {
      stores: [store(1, 'G20405'), store(2, 'I21201'), store(3, 'Z99999')],
      hospitals: [], pharmacies: [], chargers: [], parking: [],
      parks: [{ id: BigInt(4), name: 'p', parkType: null, area: null, distanceMeters: 20 }],
      markets: [{ id: BigInt(5), name: 'm', marketType: null, distanceMeters: 30 }],
    } as unknown as RawInfra;
    const cats = buildInfraCategories(raw);
    expect(cats.map((c) => c.key)).toEqual(['park', 'etc']);
    expect(cats.flatMap((c) => c.items).some((i) => i.href?.startsWith('/amenity'))).toBe(false);
  });
});
