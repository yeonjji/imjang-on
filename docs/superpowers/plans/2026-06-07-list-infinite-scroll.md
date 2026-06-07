# /list 무한 스크롤(하이브리드) + 인피드 광고 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/list` 페이지를 하이브리드 무한 스크롤(자동 3회 → "더보기")로 전환하고, 8카드마다 플레이스홀더 인피드 광고 슬롯을 삽입한다.

**Architecture:** BigInt 직렬화를 위해 `PropertyListItem` DTO + `serializeProperty`를 도입(렌더 경계에서 적용, `getPropertyList` 시그니처 불변). page 1은 SSR, 이후 페이지는 `/api/list` JSON을 클라이언트가 append. 페이지네이션 재설계(공유 컴포넌트)는 다른 6개 표면용으로 유지.

**Tech Stack:** Next.js App Router(server + `'use client'`) · Prisma · IntersectionObserver · Tailwind(CSS 변수 토큰) · vitest · Playwright.

**선행 상태:** 브랜치 `feat/pagination-redesign`. `lib/pagination.ts` + `components/ui/pagination.tsx` 재설계 머지됨(유지). 본 플랜은 이를 건드리지 않는다.

---

## File Structure

- **Create** `lib/list-params.ts` — `parseListParams(sp)` (page.tsx 인라인 파싱 추출, 공유).
- **Create** `app/api/list/route.ts` — 후속 페이지 JSON API.
- **Create** `app/(public)/list/_components/ad-slot.tsx` — 플레이스홀더 인피드 광고.
- **Create** `app/(public)/list/_components/infinite-property-list.tsx` — 클라이언트 무한 스크롤 리스트.
- **Modify** `lib/property.ts` — `PropertyListItem` DTO + `serializeProperty`, `withAdSlots` 인터리브 순수 함수.
- **Modify** `app/(public)/list/_components/property-list-card.tsx` — prop 타입 DTO.
- **Modify** `app/(public)/list/_components/property-list.tsx` — DTO 직렬화 + `InfinitePropertyList` 렌더, `PaginationNav` 제거.
- **Modify** `app/(public)/list/page.tsx` — `parseListParams` 사용 + `query` 전달.
- **Delete** `app/(public)/list/_components/pagination-nav.tsx` (고아).
- **Tests** `tests/lib/property-serialize.test.ts`, `tests/lib/list-feed.test.ts`, `tests/e2e/list.spec.ts`(교체).

---

## Task 1: 순수 로직 — `serializeProperty` + `withAdSlots`

**Files:**
- Modify: `lib/property.ts` (export 추가)
- Test: `tests/lib/property-serialize.test.ts`, `tests/lib/list-feed.test.ts`

- [ ] **Step 1: 실패 테스트 작성 (serializeProperty)**

Create `tests/lib/property-serialize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { serializeProperty } from '@/lib/property';

const row = {
  id: 123n,
  propertyType: 'APARTMENT',
  name: '래미안',
  builtYear: 2018,
  households: 500,
  txCount12m: 12,
  saleCount12m: 4,
  saleLastPrice: 1850000000n,
  saleAvgPrice12m: 1800000000n,
  jeonseCount12m: 3,
  jeonseLastDeposit: 980000000n,
  jeonseAvgDeposit12m: 970000000n,
  wolseCount12m: 2,
  wolseLastDeposit: 100000000n,
  wolseLastRent: 280,
  region: { fullName: '서울 서대문구 연희동' },
} as never;

describe('serializeProperty', () => {
  it('id는 문자열, BigInt 가격은 number로 변환', () => {
    const dto = serializeProperty(row);
    expect(dto.id).toBe('123');
    expect(dto.saleLastPrice).toBe(1850000000);
    expect(dto.jeonseAvgDeposit12m).toBe(970000000);
    expect(typeof dto.saleAvgPrice12m).toBe('number');
  });

  it('null 가격은 null 유지, Int 필드는 그대로', () => {
    const dto = serializeProperty({ ...row, saleLastPrice: null, wolseLastRent: 280 } as never);
    expect(dto.saleLastPrice).toBeNull();
    expect(dto.wolseLastRent).toBe(280);
    expect(dto.txCount12m).toBe(12);
    expect(dto.region.fullName).toBe('서울 서대문구 연희동');
  });

  it('JSON 직렬화 가능(BigInt 없음)', () => {
    expect(() => JSON.stringify(serializeProperty(row))).not.toThrow();
  });
});
```

- [ ] **Step 2: 실패 테스트 작성 (withAdSlots)**

Create `tests/lib/list-feed.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { withAdSlots } from '@/lib/property';

describe('withAdSlots', () => {
  it('interval 미만이면 광고 없음', () => {
    const out = withAdSlots([1, 2, 3], 8);
    expect(out).toHaveLength(3);
    expect(out.every((e) => e.type === 'item')).toBe(true);
  });

  it('interval마다 광고 엔트리 1개 삽입', () => {
    const items = Array.from({ length: 16 }, (_, i) => i);
    const out = withAdSlots(items, 8);
    const ads = out.filter((e) => e.type === 'ad');
    expect(ads).toHaveLength(2);
    // 8번째 item 다음(인덱스 8)이 첫 광고
    expect(out[8]).toEqual({ type: 'ad', key: 'ad-8' });
  });

  it('광고 key는 고유', () => {
    const items = Array.from({ length: 24 }, (_, i) => i);
    const keys = withAdSlots(items, 8).filter((e) => e.type === 'ad').map((e) => (e as { key: string }).key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm exec vitest run tests/lib/property-serialize.test.ts tests/lib/list-feed.test.ts`
Expected: FAIL — `serializeProperty`/`withAdSlots` is not exported.

- [ ] **Step 4: 구현 추가 (lib/property.ts 끝에 append)**

`lib/property.ts` 상단 import에 `Property, Region`이 타입으로 필요하다. 파일 상단에 이미 `import type { Prisma } from '@prisma/client';`가 있으므로, 거기에 `Property, Region`을 함께 import한다(기존 import 라인을 다음으로 교체):

```ts
import type { Prisma, Property, Region } from '@prisma/client';
```

그리고 파일 맨 끝에 추가:

```ts
export interface PropertyListItem {
  id: string;
  propertyType: PropertyType;
  name: string;
  builtYear: number | null;
  households: number | null;
  txCount12m: number;
  saleCount12m: number;
  saleLastPrice: number | null;
  saleAvgPrice12m: number | null;
  jeonseCount12m: number;
  jeonseLastDeposit: number | null;
  jeonseAvgDeposit12m: number | null;
  wolseCount12m: number;
  wolseLastDeposit: number | null;
  wolseLastRent: number | null;
  region: { fullName: string };
}

const toNum = (v: bigint | number | null): number | null => (v == null ? null : Number(v));

export function serializeProperty(p: Property & { region: Region }): PropertyListItem {
  return {
    id: p.id.toString(),
    propertyType: p.propertyType,
    name: p.name,
    builtYear: p.builtYear,
    households: p.households,
    txCount12m: p.txCount12m,
    saleCount12m: p.saleCount12m,
    saleLastPrice: toNum(p.saleLastPrice),
    saleAvgPrice12m: toNum(p.saleAvgPrice12m),
    jeonseCount12m: p.jeonseCount12m,
    jeonseLastDeposit: toNum(p.jeonseLastDeposit),
    jeonseAvgDeposit12m: toNum(p.jeonseAvgDeposit12m),
    wolseCount12m: p.wolseCount12m,
    wolseLastDeposit: toNum(p.wolseLastDeposit),
    wolseLastRent: p.wolseLastRent,
    region: { fullName: p.region.fullName },
  };
}

export type FeedEntry<T> = { type: 'item'; item: T } | { type: 'ad'; key: string };

export function withAdSlots<T>(items: T[], interval: number): FeedEntry<T>[] {
  const out: FeedEntry<T>[] = [];
  items.forEach((item, i) => {
    out.push({ type: 'item', item });
    if ((i + 1) % interval === 0) out.push({ type: 'ad', key: `ad-${i + 1}` });
  });
  return out;
}
```

> `PropertyType`은 이미 `lib/property.ts`에서 사용 중이라 import되어 있다(상단 확인). 없으면 `import { PropertyType } from '@prisma/client';`에 포함.

- [ ] **Step 5: 테스트 통과 + 타입체크**

Run: `pnpm exec vitest run tests/lib/property-serialize.test.ts tests/lib/list-feed.test.ts && pnpm typecheck`
Expected: PASS (6 tests), 타입 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add lib/property.ts tests/lib/property-serialize.test.ts tests/lib/list-feed.test.ts
git commit -m "feat(list): PropertyListItem 직렬화·withAdSlots 인터리브 순수 로직"
```

---

## Task 2: 공유 파라미터 파서 `lib/list-params.ts`

**Files:**
- Create: `lib/list-params.ts`
- Modify: `app/(public)/list/page.tsx`
- Test: `tests/lib/list-params.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `tests/lib/list-params.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseListParams } from '@/lib/list-params';

describe('parseListParams', () => {
  it('기본값: all 타입·deal all·sort recent·page 1', () => {
    const p = parseListParams({});
    expect(p.types.length).toBe(4);
    expect(p.deal).toBe('all');
    expect(p.sort).toBe('recent');
    expect(p.page).toBe(1);
  });

  it('apt 슬러그 → APARTMENT 단일, price/page 숫자 변환', () => {
    const p = parseListParams({ type: 'apt', price_min: '10000', page: '3' });
    expect(p.types).toEqual(['APARTMENT']);
    expect(p.priceMin).toBe(10000);
    expect(p.page).toBe(3);
  });

  it('page는 최소 1로 보정, q는 trim', () => {
    expect(parseListParams({ page: '0' }).page).toBe(1);
    expect(parseListParams({ q: '  연희동  ' }).q).toBe('연희동');
    expect(parseListParams({ q: '   ' }).q).toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run tests/lib/list-params.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현 작성**

Create `lib/list-params.ts`:

```ts
import { PropertyType } from '@prisma/client';
import type { DealFilter, AreaRange, SortOption } from '@/lib/property';

const TYPE_MAP: Record<string, PropertyType[]> = {
  apt: [PropertyType.APARTMENT],
  officetel: [PropertyType.OFFICETEL],
  villa: [PropertyType.ROW_HOUSE, PropertyType.MULTIPLEX],
  all: [PropertyType.APARTMENT, PropertyType.OFFICETEL, PropertyType.ROW_HOUSE, PropertyType.MULTIPLEX],
};

export interface ListSearchParams {
  type?: string;
  deal?: string;
  price_min?: string;
  price_max?: string;
  area?: string;
  sort?: string;
  region?: string;
  sido?: string;
  q?: string;
  page?: string;
}

export interface ParsedListParams {
  types: PropertyType[];
  deal: DealFilter;
  priceMin?: number;
  priceMax?: number;
  areaRange?: AreaRange;
  sort: SortOption;
  sigunguCode?: string;
  sido?: string;
  q?: string;
  page: number;
}

export function parseListParams(sp: ListSearchParams): ParsedListParams {
  const typeSlug = sp.type ?? 'all';
  return {
    types: TYPE_MAP[typeSlug] ?? TYPE_MAP.all,
    deal: (sp.deal ?? 'all') as DealFilter,
    priceMin: sp.price_min ? Number(sp.price_min) : undefined,
    priceMax: sp.price_max ? Number(sp.price_max) : undefined,
    areaRange: sp.area as AreaRange | undefined,
    sort: (sp.sort ?? 'recent') as SortOption,
    sigunguCode: sp.region,
    sido: sp.sido,
    q: sp.q?.trim() || undefined,
    page: Math.max(1, Number(sp.page ?? '1')),
  };
}
```

- [ ] **Step 4: page.tsx를 파서 사용으로 교체**

`app/(public)/list/page.tsx`에서 인라인 `TYPE_MAP`/`SearchParams` 정의와 파싱 블록을 제거하고 `parseListParams`를 사용한다. import에 추가:

```ts
import { parseListParams } from '@/lib/list-params';
```

기존 `const TYPE_MAP = {...}` 블록과 `interface SearchParams {...}` 정의를 삭제하고, 함수 시그니처의 `searchParams: Promise<SearchParams>`를 `searchParams: Promise<Record<string, string | undefined>>`로 바꾼다. 파싱 블록(typeSlug~q 계산, 약 48–56행)을 다음으로 교체:

```ts
  const { types, deal, priceMin, priceMax, areaRange, sort, sigunguCode, sido, q } =
    parseListParams(sp);
  const query = new URLSearchParams(
    Object.entries(sp).filter(([k, v]) => k !== 'page' && v != null) as [string, string][],
  ).toString();
```

그리고 `<PropertyList>`에 넘기던 `sigunguCode={sp.region} sido={sp.sido}`는 위 구조분해 값으로 바꾸고, `page={page}` 대신 `query={query}`를 전달한다(첫 렌더는 항상 page 1). 변경 후 `<PropertyList>` 호출:

```tsx
            <PropertyList
              types={types}
              deal={deal}
              priceMin={priceMin}
              priceMax={priceMax}
              areaRange={areaRange}
              sort={sort}
              sigunguCode={sigunguCode}
              sido={sido}
              q={q}
              query={query}
            />
```

> `q` 헤더 카드 문구에서 `q`를 계속 쓰므로 구조분해된 `q`로 동작한다. `page` 변수는 더 이상 쓰지 않으면 제거.

- [ ] **Step 5: 테스트 통과 + 타입체크**

Run: `pnpm exec vitest run tests/lib/list-params.test.ts && pnpm typecheck`
Expected: vitest PASS. typecheck는 `PropertyList`의 `query` prop이 아직 없어 **실패할 수 있음** → Task 4에서 prop 추가. 이 시점엔 vitest PASS만 확인하고, typecheck 실패가 `query` prop 한정인지 확인 후 진행.

- [ ] **Step 6: 커밋**

```bash
git add lib/list-params.ts tests/lib/list-params.test.ts app/\(public\)/list/page.tsx
git commit -m "feat(list): 검색 파라미터 파서 분리 + query 문자열 전달"
```

---

## Task 3: API 라우트 `app/api/list/route.ts`

**Files:**
- Create: `app/api/list/route.ts`

- [ ] **Step 1: 라우트 작성**

Create `app/api/list/route.ts`:

```ts
import { getPropertyList, serializeProperty } from '@/lib/property';
import { parseListParams } from '@/lib/list-params';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams) as Record<string, string>;
  const p = parseListParams(sp);

  const { rows, total, page, perPage, totalPages } = await getPropertyList({
    types: p.types,
    deal: p.deal,
    priceMin: p.priceMin,
    priceMax: p.priceMax,
    areaRange: p.areaRange,
    sort: p.sort,
    sigunguCode: p.sigunguCode,
    sido: p.sido,
    q: p.q,
    page: p.page,
    perPage: 30,
  });

  return Response.json(
    { items: rows.map(serializeProperty), total, page, perPage, totalPages },
    { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300' } },
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 이 파일 자체는 에러 없음(Task 2의 `query` prop 미해결 에러는 Task 4에서 해소).

- [ ] **Step 3: 커밋**

```bash
git add app/api/list/route.ts
git commit -m "feat(list): 후속 페이지 JSON API 라우트(/api/list)"
```

---

## Task 4: 클라이언트 무한 스크롤 + 광고 슬롯 + 통합

**Files:**
- Create: `app/(public)/list/_components/ad-slot.tsx`
- Create: `app/(public)/list/_components/infinite-property-list.tsx`
- Modify: `app/(public)/list/_components/property-list-card.tsx`
- Modify: `app/(public)/list/_components/property-list.tsx`
- Delete: `app/(public)/list/_components/pagination-nav.tsx`

> 이 태스크는 카드 prop 타입(DTO) 전환과 서버/클라이언트 렌더를 한꺼번에 정합시킨다(중간 상태에서 typecheck가 깨지지 않도록 묶음).

- [ ] **Step 1: AdSlot 생성**

Create `app/(public)/list/_components/ad-slot.tsx`:

```tsx
export function AdSlot() {
  return (
    <div className="rounded-[22px] border border-dashed border-[#fbbf24] bg-[#fffbeb] px-6 py-8 text-center">
      <p className="text-[11px] font-bold tracking-wide text-[#b45309]">SPONSORED</p>
      <p className="mt-1 text-sm font-semibold text-[#92700e]">광고 영역 (인피드)</p>
    </div>
  );
}
```

- [ ] **Step 2: PropertyListCard prop 타입을 DTO로 교체**

`app/(public)/list/_components/property-list-card.tsx`의 import와 Props를 변경. 6–18행의 `import type { Property, Region } from '@prisma/client';`와 `interface Props`를 다음으로 교체(본문 JSX는 그대로):

```ts
import { Badge } from '@/components/ui/badge';
import { formatBillion } from '@/lib/format';
import { typeToSlug } from '@/lib/property';
import type { DealFilter, PropertyListItem } from '@/lib/property';

const TYPE_LABEL: Record<string, string> = {
  APARTMENT: '아파트',
  OFFICETEL: '오피스텔',
  ROW_HOUSE: '다세대',
  MULTIPLEX: '다세대',
};

interface Props {
  property: PropertyListItem;
  deal?: DealFilter;
}
```

> `Link` import는 1행에 그대로 유지. 본문은 동일 필드명을 쓰므로 수정 불필요(`p.id`는 string, 가격은 number → `formatBillion` 호환).

- [ ] **Step 3: InfinitePropertyList 생성**

Create `app/(public)/list/_components/infinite-property-list.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { withAdSlots } from '@/lib/property';
import type { PropertyListItem, DealFilter } from '@/lib/property';
import { PropertyListCard } from './property-list-card';
import { AdSlot } from './ad-slot';

const AUTO_MAX = 3;
const AD_INTERVAL = 8;

interface Props {
  initialItems: PropertyListItem[];
  totalPages: number;
  deal: DealFilter;
  query: string;
}

export function InfinitePropertyList({ initialItems, totalPages, deal, query }: Props) {
  const [items, setItems] = useState(initialItems);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const done = page >= totalPages;
  const canAuto = !done && page - 1 < AUTO_MAX;

  async function loadMore() {
    if (loading || done) return;
    setLoading(true);
    setError(false);
    const next = page + 1;
    try {
      const res = await fetch(`/api/list?${query}&page=${next}`);
      if (!res.ok) throw new Error('failed');
      const data = (await res.json()) as { items: PropertyListItem[] };
      setItems((prev) => [...prev, ...data.items]);
      setPage(next);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canAuto) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
    // page가 바뀌면 새 센티넬에 다시 바인딩
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAuto, page]);

  const feed = withAdSlots(items, AD_INTERVAL);

  return (
    <>
      <div className="flex flex-col gap-3">
        {feed.map((entry) =>
          entry.type === 'ad' ? (
            <AdSlot key={entry.key} />
          ) : (
            <PropertyListCard key={entry.item.id} property={entry.item} deal={deal} />
          ),
        )}
      </div>

      {!done && (
        <div className="mt-6 flex flex-col items-center gap-3">
          {canAuto && <div ref={sentinelRef} aria-hidden className="h-1 w-full" />}
          {loading && (
            <p className="text-sm text-[var(--color-muted)]">불러오는 중…</p>
          )}
          {error && (
            <button
              onClick={loadMore}
              className="h-11 rounded-xl border border-[var(--color-line)] px-5 text-sm font-bold text-[var(--color-blue)]"
            >
              다시 시도
            </button>
          )}
          {!canAuto && !loading && !error && (
            <button
              onClick={loadMore}
              className="h-12 w-full max-w-sm rounded-2xl border border-[var(--color-blue)] bg-[var(--color-soft)] text-sm font-bold text-[var(--color-blue)] hover:bg-white"
            >
              30개 더보기 ↓
            </button>
          )}
        </div>
      )}

      {done && (
        <p className="mt-6 text-center text-sm text-[var(--color-muted)]">
          모든 결과를 불러왔습니다
        </p>
      )}
    </>
  );
}
```

- [ ] **Step 4: property-list.tsx를 DTO + InfiniteList로 교체**

`app/(public)/list/_components/property-list.tsx` 전체를 다음으로 교체:

```tsx
import type { PropertyType } from '@prisma/client';
import { getPropertyList, serializeProperty } from '@/lib/property';
import type { DealFilter, AreaRange, SortOption } from '@/lib/property';
import { InfinitePropertyList } from './infinite-property-list';

interface Props {
  types: PropertyType[];
  deal: DealFilter;
  priceMin?: number;
  priceMax?: number;
  areaRange?: AreaRange;
  sort: SortOption;
  sigunguCode?: string;
  sido?: string;
  q?: string;
  query: string;
}

export async function PropertyList({
  types,
  deal,
  priceMin,
  priceMax,
  areaRange,
  sort,
  sigunguCode,
  sido,
  q,
  query,
}: Props) {
  const { rows, total, totalPages } = await getPropertyList({
    types,
    deal,
    priceMin,
    priceMax,
    areaRange,
    sort,
    sigunguCode,
    sido,
    q,
    page: 1,
    perPage: 30,
  });

  const items = rows.map(serializeProperty);

  return (
    <>
      <div className="mb-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-3 shadow-[var(--shadow)]">
        <p className="text-base font-bold text-[var(--color-blue-dark)]">
          검색 결과 <span className="text-[var(--color-blue)]">{total.toLocaleString('ko-KR')}</span>건
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">
          조건에 맞는 매물이 없습니다.
        </div>
      ) : (
        <InfinitePropertyList
          key={query}
          initialItems={items}
          totalPages={totalPages}
          deal={deal}
          query={query}
        />
      )}
    </>
  );
}
```

- [ ] **Step 5: 고아 파일 삭제**

```bash
git rm app/\(public\)/list/_components/pagination-nav.tsx
```

- [ ] **Step 6: 타입체크 + 빌드 + 단위 회귀**

Run: `pnpm typecheck && pnpm exec vitest run tests/lib && pnpm build`
Expected: 모두 PASS. Task 2에서 보류됐던 `query` prop 타입 에러가 해소됨. `pagination-nav` 참조 잔존 없음.

- [ ] **Step 7: 커밋**

```bash
git add -A app/\(public\)/list lib
git commit -m "feat(list): 하이브리드 무한 스크롤 + 인피드 광고 슬롯 전환"
```

---

## Task 5: e2e 교체 + 최종 검증

**Files:**
- Modify: `tests/e2e/list.spec.ts`

- [ ] **Step 1: 페이지네이션 e2e → 무한 스크롤 e2e 교체**

`tests/e2e/list.spec.ts`에서 기존 모바일 페이지네이션 테스트(48–55행, `'모바일 페이지네이션: 이전/다음 버튼만 노출'`)를 **삭제**하고 아래 테스트를 파일 끝에 추가한다(나머지 필터/정렬 테스트는 유지):

```ts
test('무한 스크롤: 카드 + 인피드 광고 슬롯 노출', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/list?type=apt');
  await expect(page.getByText(/검색 결과/)).toBeVisible();
  // 시드가 30건 이상이면 8번째 뒤에 SPONSORED 슬롯이 최소 1개
  await expect(page.getByText('SPONSORED').first()).toBeVisible();
});

test('무한 스크롤: 끝까지 로드 시 종료 문구', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/list?type=apt');
  await expect(page.getByText(/검색 결과/)).toBeVisible();
  // 바닥까지 스크롤하여 자동 로드 유도
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 4000);
    await page.waitForTimeout(400);
  }
  await expect(page.getByText('모든 결과를 불러왔습니다')).toBeVisible({ timeout: 15000 });
});
```

> 시드(`tests/_helpers/seed-e2e.ts`)는 APARTMENT를 30건 이상 생성하므로 page 1(30건)에 8·16·24번째 뒤 광고 슬롯이 들어가고, 2페이지째는 자동 로드된다. 만약 SPONSORED가 안 보이면 시드 건수를 확인(≥8 필요).

- [ ] **Step 2: list e2e 실행**

Run: `pnpm test:e2e -- list.spec.ts`
Expected: 필터/정렬 + 무한 스크롤 2건 PASS.

- [ ] **Step 3: 커밋**

```bash
git add tests/e2e/list.spec.ts
git commit -m "test(e2e): /list 무한 스크롤·인피드 광고 스모크"
```

- [ ] **Step 4: 전체 검증 스윕**

Run: `pnpm typecheck && pnpm exec vitest run tests/lib && pnpm lint && pnpm build`
Expected: 모두 PASS.

- [ ] **Step 5: 회귀 스모크(다른 표면 + 검색/청약)**

Run: `pnpm test:e2e -- urban-parking-list.spec.ts search.spec.ts subscription-nav.spec.ts`
Expected: 그린(공유 Pagination 유지 확인).

- [ ] **Step 6: 수동 확인 (dev)**

`pnpm dev` 후:
- `/list` — 스크롤 시 자동 로드 3회 → "30개 더보기" 버튼 등장 → 클릭 시 추가 로드 → "모든 결과를 불러왔습니다"
- 8카드마다 SPONSORED 슬롯
- 필터 변경 시 리스트 리셋(처음부터)
- 모바일 폭에서 카드 가로 스크롤 없음

---

## Self-Review (작성자 점검)

- **Spec coverage:** 하이브리드(AUTO_MAX=3)·인피드(AD_INTERVAL=8)·BigInt 직렬화(serializeProperty)·API 라우트·파서 분리·PaginationNav 삭제·DTO 카드·e2e 교체 — 모두 태스크에 매핑.
- **Placeholder scan:** 모든 코드/명령/기대출력 구체값. 없음.
- **Type consistency:** `PropertyListItem`/`FeedEntry`/`parseListParams`/`ParsedListParams`가 정의(Task 1·2) ↔ 소비(Task 3·4)에서 일치. `withAdSlots` 반환 `{type:'item'|'ad'}` 가 InfiniteList 렌더 분기와 일치. API 응답 `{items,...}` ↔ 클라이언트 fetch 파싱 일치.
- **Green-between-tasks 주의:** Task 2 종료 시 `query` prop 미해결로 typecheck 일시 실패 가능 → Task 4에서 해소(플랜에 명시). 각 커밋 단위는 가능한 한 독립 그린, 통합 정합은 Task 4에서 원자적으로.
- **선행 유지:** `lib/pagination.ts`·`components/ui/pagination.tsx`·다른 6개 표면 불변.
