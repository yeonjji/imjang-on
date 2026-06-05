# 청약 List·Detail 화면 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 수집된 `SubscriptionNotice`/`SubscriptionUnit` 데이터로 청약 목록(`/subscription`)·상세(`/subscription/[id]`) 화면을 추가하고 상단 메뉴를 `홈·실거래가·청약·생활편의` 순으로 재정렬한다.

**Architecture:** 실거래가 화면(`/list`, `/apt/[id]`)을 미러링. 순수 로직(상태 도출·포맷·카테고리)은 `lib/subscription.ts`에 모으고 TDD로 검증. 페이지는 서버 컴포넌트 + URL 쿼리 필터, 상세는 좌표가 있으면 기존 `NaverMap`·`getNearbyApartments`·`getNearbyInfra`를 그대로 재사용. 모든 컴포넌트는 모바일 오버플로우/한글 세로깨짐 가드를 준수.

**Tech Stack:** Next.js 15 (App Router, RSC) · Prisma 5 (`$queryRaw` + `Prisma.sql`) · PostgreSQL/PostGIS · Tailwind(CSS 변수 토큰) · Vitest.

**참고 데이터 사실 (운영 DB 2026-06-05):** 1,485공고·6,114units. `regionName`은 짧은 시도명('경기','서울',…,'전국')으로 `getSidoList().sido`와 등가. `constructor`는 항상 null(미노출). units `area` 64%·`specialSupply` 7%만 채워짐(null 처리 필수).

---

## File Structure

**생성**
- `lib/subscription.ts` — 카테고리 라벨/슬러그, `deriveStatus`/`ddayLabel`, 카드 포맷 헬퍼, 조회 함수(`getSubscriptionList`/`getSubscriptionById`/`getSubscriptionLatLng`)와 타입.
- `tests/lib/subscription.test.ts` — 순수 함수 단위 테스트(`test:unit`가 `tests/lib`를 수집).
- `app/(public)/subscription/page.tsx` — 목록 페이지(RSC).
- `app/(public)/subscription/_components/subscription-card.tsx` — 목록 카드(서버).
- `app/(public)/subscription/_components/subscription-list.tsx` — 목록 데이터 fetch + 렌더(서버).
- `app/(public)/subscription/_components/subscription-filter-panel.tsx` — 필터 패널(클라이언트).
- `app/(public)/subscription/_components/subscription-mobile-filter-sheet.tsx` — 모바일 필터 시트(클라이언트).
- `app/(public)/subscription/_components/subscription-pagination.tsx` — 페이지네이션(클라이언트, `/subscription`로 push).
- `app/(public)/subscription/[id]/page.tsx` — 상세 페이지(RSC).
- `app/(public)/subscription/[id]/_components/subscription-hero.tsx` — 상세 히어로(서버).
- `app/(public)/subscription/[id]/_components/schedule-timeline.tsx` — 일정 타임라인(서버).
- `app/(public)/subscription/[id]/_components/unit-supply-table.tsx` — 주택형별 공급(서버, 모바일 카드+데스크톱 테이블 이중 렌더).
- `app/(public)/subscription/[id]/_components/subscription-sidebar.tsx` — 상세 사이드바(서버).

**수정**
- `app/(public)/_components/nav.tsx` — 메뉴 재정렬 + 청약 라이브 링크.
- `app/(public)/_components/mobile-drawer.tsx` — 동일.

---

## Task 1: 데이터 레이어 — 카테고리 & 상태 도출 (순수)

**Files:**
- Create: `lib/subscription.ts`
- Test: `tests/lib/subscription.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/subscription.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  categoryLabel,
  slugsToCategories,
  deriveStatus,
  ddayLabel,
} from '@/lib/subscription';

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('categoryLabel / slugsToCategories', () => {
  it('6종 카테고리 라벨을 반환한다', () => {
    expect(categoryLabel('APT')).toBe('아파트');
    expect(categoryLabel('OFFICETEL_ETC')).toBe('오피스텔·도시형');
    expect(categoryLabel('REMNANT')).toBe('무순위·잔여');
    expect(categoryLabel('PUB_PRIV_RENT')).toBe('공공·민간임대');
    expect(categoryLabel('ARBITRARY')).toBe('임의공급');
    expect(categoryLabel('LH_PRESUB')).toBe('LH 사전청약');
  });
  it('슬러그 CSV를 카테고리로 변환하고 미지정은 버린다', () => {
    expect(slugsToCategories(['apt', 'opt', 'nope'])).toEqual(['APT', 'ARBITRARY']);
  });
});

describe('deriveStatus', () => {
  const today = D('2026-06-05');
  it('접수 시작 전이면 예정 + 시작까지 D-day', () => {
    expect(deriveStatus(D('2026-06-08'), D('2026-06-09'), today)).toEqual({
      status: 'UPCOMING',
      dday: 3,
    });
  });
  it('접수 구간 내면 접수중 + 마감까지 D-day', () => {
    expect(deriveStatus(D('2026-06-01'), D('2026-06-09'), today)).toEqual({
      status: 'OPEN',
      dday: 4,
    });
  });
  it('마감일이 과거면 마감', () => {
    expect(deriveStatus(D('2026-05-01'), D('2026-05-09'), today)).toEqual({
      status: 'CLOSED',
      dday: null,
    });
  });
  it('시작일 없이 마감일이 미래면 접수중', () => {
    expect(deriveStatus(null, D('2026-06-09'), today).status).toBe('OPEN');
  });
  it('날짜가 모두 없으면 마감(보수적)', () => {
    expect(deriveStatus(null, null, today)).toEqual({ status: 'CLOSED', dday: null });
  });
  it('마감일이 오늘이면 접수중 D-0', () => {
    expect(deriveStatus(D('2026-06-01'), D('2026-06-05'), today)).toEqual({
      status: 'OPEN',
      dday: 0,
    });
  });
});

describe('ddayLabel', () => {
  it('접수중 D-day 라벨', () => {
    expect(ddayLabel({ status: 'OPEN', dday: 4 })).toBe('D-4');
    expect(ddayLabel({ status: 'OPEN', dday: 0 })).toBe('오늘 마감');
  });
  it('예정 라벨', () => {
    expect(ddayLabel({ status: 'UPCOMING', dday: 3 })).toBe('3일 후');
    expect(ddayLabel({ status: 'UPCOMING', dday: 0 })).toBe('오늘 시작');
  });
  it('마감은 라벨 없음', () => {
    expect(ddayLabel({ status: 'CLOSED', dday: null })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/subscription.test.ts`
Expected: FAIL — `Cannot find module '@/lib/subscription'`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/subscription.ts`:

```ts
import type { SubscriptionCategory } from '@prisma/client';

// ---- 카테고리 ----
export interface CategoryMeta {
  slug: string;
  category: SubscriptionCategory;
  label: string;
}

export const SUBSCRIPTION_CATEGORIES: CategoryMeta[] = [
  { slug: 'apt', category: 'APT', label: '아파트' },
  { slug: 'urbty', category: 'OFFICETEL_ETC', label: '오피스텔·도시형' },
  { slug: 'remndr', category: 'REMNANT', label: '무순위·잔여' },
  { slug: 'pblpvt', category: 'PUB_PRIV_RENT', label: '공공·민간임대' },
  { slug: 'opt', category: 'ARBITRARY', label: '임의공급' },
  { slug: 'lh', category: 'LH_PRESUB', label: 'LH 사전청약' },
];

const CATEGORY_BY_SLUG = new Map(SUBSCRIPTION_CATEGORIES.map((c) => [c.slug, c.category]));
const LABEL_BY_CATEGORY = new Map(SUBSCRIPTION_CATEGORIES.map((c) => [c.category, c.label]));

export function categoryLabel(category: SubscriptionCategory): string {
  return LABEL_BY_CATEGORY.get(category) ?? category;
}

export function slugsToCategories(slugs: string[]): SubscriptionCategory[] {
  return slugs
    .map((s) => CATEGORY_BY_SLUG.get(s))
    .filter((c): c is SubscriptionCategory => c !== undefined);
}

// ---- 상태 도출 ----
export type SubscriptionStatus = 'OPEN' | 'UPCOMING' | 'CLOSED';

export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  OPEN: '접수중',
  UPCOMING: '예정',
  CLOSED: '마감',
};

export const STATUS_TONE: Record<SubscriptionStatus, 'green' | 'blue' | 'gray'> = {
  OPEN: 'green',
  UPCOMING: 'blue',
  CLOSED: 'gray',
};

function dateInt(d: Date): number {
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

function dayDiff(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / 86_400_000);
}

export interface DerivedStatus {
  status: SubscriptionStatus;
  /** OPEN: 마감까지 남은 일수, UPCOMING: 시작까지 남은 일수, CLOSED: null */
  dday: number | null;
}

export function deriveStatus(
  receiptBegin: Date | null,
  receiptEnd: Date | null,
  today: Date = new Date(),
): DerivedStatus {
  const t = dateInt(today);
  if (receiptBegin && dateInt(receiptBegin) > t) {
    return { status: 'UPCOMING', dday: dayDiff(today, receiptBegin) };
  }
  if (receiptEnd && dateInt(receiptEnd) >= t && (!receiptBegin || dateInt(receiptBegin) <= t)) {
    return { status: 'OPEN', dday: dayDiff(today, receiptEnd) };
  }
  return { status: 'CLOSED', dday: null };
}

export function ddayLabel(d: DerivedStatus): string | null {
  if (d.dday == null) return null;
  if (d.status === 'OPEN') return d.dday === 0 ? '오늘 마감' : `D-${d.dday}`;
  if (d.status === 'UPCOMING') return d.dday === 0 ? '오늘 시작' : `${d.dday}일 후`;
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/subscription.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add lib/subscription.ts tests/lib/subscription.test.ts
git commit -m "feat(subscription): 카테고리 라벨·상태 도출 순수 로직"
```

---

## Task 2: 데이터 레이어 — 카드 포맷 헬퍼 (순수)

**Files:**
- Modify: `lib/subscription.ts`
- Test: `tests/lib/subscription.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/subscription.test.ts`:

```ts
import { formatPriceRange, formatAreaRange } from '@/lib/subscription';

describe('formatPriceRange (만원 단위 topAmount)', () => {
  it('동일 값이면 단일 표기', () => {
    expect(formatPriceRange(50000, 50000)).toBe('5억');
  });
  it('범위면 최소~최대', () => {
    expect(formatPriceRange(50000, 90000)).toBe('5억~9억');
  });
  it('null이 섞이면 -', () => {
    expect(formatPriceRange(null, 90000)).toBe('-');
    expect(formatPriceRange(null, null)).toBe('-');
  });
});

describe('formatAreaRange (㎡ → 평)', () => {
  it('동일 값이면 단일 표기', () => {
    expect(formatAreaRange(84.5, 84.5)).toBe('26평');
  });
  it('범위면 최소~최대', () => {
    expect(formatAreaRange(59, 114)).toBe('18평~34평');
  });
  it('null이 섞이면 -', () => {
    expect(formatAreaRange(null, 84)).toBe('-');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/subscription.test.ts`
Expected: FAIL — `formatPriceRange` / `formatAreaRange` not exported.

- [ ] **Step 3: Write minimal implementation**

Add to the top imports of `lib/subscription.ts`:

```ts
import { formatBillion, formatPyeong } from '@/lib/format';
```

Append to `lib/subscription.ts`:

```ts
// ---- 카드 집계 포맷 ----
export function formatPriceRange(min: number | null, max: number | null): string {
  if (min == null || max == null) return '-';
  return min === max ? formatBillion(min) : `${formatBillion(min)}~${formatBillion(max)}`;
}

export function formatAreaRange(min: number | null, max: number | null): string {
  if (min == null || max == null) return '-';
  const a = formatPyeong(min);
  const b = formatPyeong(max);
  return a === b ? a : `${a}~${b}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/subscription.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/subscription.ts tests/lib/subscription.test.ts
git commit -m "feat(subscription): 분양가·면적 범위 포맷 헬퍼"
```

---

## Task 3: 데이터 레이어 — 조회 함수 (DB)

**Files:**
- Modify: `lib/subscription.ts`

> DB 통합 쿼리는 운영 데이터에 의존하므로 단위 테스트 대신 읽기전용 스모크로 검증한다(쓰기 없음, 안전).

- [ ] **Step 1: Write the query functions**

Add to the imports of `lib/subscription.ts`:

```ts
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { SubscriptionNotice, SubscriptionUnit } from '@prisma/client';
```

Append to `lib/subscription.ts`:

```ts
// ---- 조회 ----
export interface SubscriptionListItem {
  id: string;
  name: string;
  category: SubscriptionCategory;
  regionName: string | null;
  receiptBegin: Date | null;
  receiptEnd: Date | null;
  totalSupply: number | null;
  unitCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  minArea: number | null;
  maxArea: number | null;
}

export interface SubscriptionListResult {
  rows: SubscriptionListItem[];
  total: number;
  totalPages: number;
  page: number;
  perPage: number;
}

interface ListRow {
  id: bigint;
  name: string;
  category: SubscriptionCategory;
  region_name: string | null;
  receipt_begin: Date | null;
  receipt_end: Date | null;
  total_supply: number | null;
  unit_count: number;
  min_price: number | null;
  max_price: number | null;
  min_area: number | null;
  max_area: number | null;
}

export async function getSubscriptionList(opts: {
  categories?: SubscriptionCategory[];
  sido?: string;
  status?: SubscriptionStatus;
  sort?: 'recent' | 'notice';
  page?: number;
  perPage?: number;
}): Promise<SubscriptionListResult> {
  const { categories, sido, status, sort = 'recent', page = 1, perPage = 20 } = opts;
  const offset = (page - 1) * perPage;

  const where = Prisma.sql`
    WHERE 1 = 1
    ${
      categories && categories.length > 0
        ? Prisma.sql`AND n.category IN (${Prisma.join(
            categories.map((c) => Prisma.sql`${c}::"SubscriptionCategory"`),
          )})`
        : Prisma.empty
    }
    ${sido ? Prisma.sql`AND n."regionName" = ${sido}` : Prisma.empty}
    ${
      status === 'OPEN'
        ? Prisma.sql`AND n."receiptBegin" <= CURRENT_DATE AND n."receiptEnd" >= CURRENT_DATE`
        : Prisma.empty
    }
    ${status === 'UPCOMING' ? Prisma.sql`AND n."receiptBegin" > CURRENT_DATE` : Prisma.empty}
    ${
      status === 'CLOSED'
        ? Prisma.sql`AND (n."receiptEnd" < CURRENT_DATE OR n."receiptEnd" IS NULL)`
        : Prisma.empty
    }
  `;

  const orderBy =
    sort === 'notice'
      ? Prisma.sql`ORDER BY n."noticeDate" DESC NULLS LAST, n.id DESC`
      : Prisma.sql`ORDER BY n."receiptEnd" DESC NULLS LAST, n."noticeDate" DESC NULLS LAST, n.id DESC`;

  const rows = await prisma.$queryRaw<ListRow[]>(Prisma.sql`
    SELECT
      n.id, n.name, n.category,
      n."regionName" AS region_name,
      n."receiptBegin" AS receipt_begin,
      n."receiptEnd" AS receipt_end,
      n."totalSupply" AS total_supply,
      COUNT(u.id)::int AS unit_count,
      MIN(u."topAmount")::int AS min_price,
      MAX(u."topAmount")::int AS max_price,
      MIN(u.area)::float AS min_area,
      MAX(u.area)::float AS max_area
    FROM "SubscriptionNotice" n
    LEFT JOIN "SubscriptionUnit" u ON u."noticeId" = n.id
    ${where}
    GROUP BY n.id
    ${orderBy}
    LIMIT ${perPage} OFFSET ${offset}
  `);

  const totalRows = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS count FROM "SubscriptionNotice" n ${where}
  `);
  const total = totalRows[0]?.count ?? 0;

  return {
    rows: rows.map((r) => ({
      id: String(r.id),
      name: r.name,
      category: r.category,
      regionName: r.region_name,
      receiptBegin: r.receipt_begin,
      receiptEnd: r.receipt_end,
      totalSupply: r.total_supply,
      unitCount: r.unit_count,
      minPrice: r.min_price,
      maxPrice: r.max_price,
      minArea: r.min_area,
      maxArea: r.max_area,
    })),
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    page,
    perPage,
  };
}

export type SubscriptionDetail = SubscriptionNotice & { units: SubscriptionUnit[] };

export async function getSubscriptionById(id: bigint): Promise<SubscriptionDetail | null> {
  return prisma.subscriptionNotice.findUnique({
    where: { id },
    include: { units: { orderBy: [{ area: 'asc' }, { id: 'asc' }] } },
  });
}

export async function getSubscriptionLatLng(
  id: bigint,
): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<Array<{ lat: number; lng: number }>>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "SubscriptionNotice"
    WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no type errors).

- [ ] **Step 3: Read-only smoke against production data**

Run:

```bash
pnpm exec dotenv -e .env.local -- tsx -e "
import { getSubscriptionList, getSubscriptionById, getSubscriptionLatLng } from './lib/subscription';
import { prisma } from './lib/db';
(async () => {
  const list = await getSubscriptionList({ sido: '서울', sort: 'recent', page: 1, perPage: 3 });
  console.log('list.total', list.total, 'rows', list.rows.length, 'sample', JSON.stringify(list.rows[0]));
  const open = await getSubscriptionList({ status: 'OPEN' });
  console.log('open.total', open.total);
  if (list.rows[0]) {
    const d = await getSubscriptionById(BigInt(list.rows[0].id));
    console.log('detail units', d?.units.length, 'name', d?.name);
    console.log('latlng', await getSubscriptionLatLng(BigInt(list.rows[0].id)));
  }
  await prisma.\$disconnect();
})();
"
```

Expected: `list.total` > 0, a sample row with `regionName: '서울'`, `open.total` a small number, detail prints units count, latlng prints `{ lat, lng }` or `null`. No errors.

- [ ] **Step 4: Commit**

```bash
git add lib/subscription.ts
git commit -m "feat(subscription): 목록·상세·좌표 조회 함수"
```

---

## Task 4: 상단 메뉴 재정렬 + 청약 라이브

**Files:**
- Modify: `app/(public)/_components/nav.tsx`
- Modify: `app/(public)/_components/mobile-drawer.tsx`

- [ ] **Step 1: Update desktop nav order + live link**

In `app/(public)/_components/nav.tsx`, replace the desktop links block (the `<div className="hidden gap-6 ...">` contents) so 청약 comes before 생활편의 and is a live link:

```tsx
          <div className="hidden gap-6 text-[15px] font-semibold text-[var(--color-muted)] md:flex md:items-center">
            <Link href="/">홈</Link>
            <Link href="/list">실거래가</Link>
            <Link href="/subscription">청약</Link>
            <LifeDropdown onSoon={(topic) => setSoonOpen(topic)} />
          </div>
```

The `청약 Soon` button is removed. `setSoonOpen` is still used by `LifeDropdown` and the mobile drawer, so keep the `soonOpen` state and `SoonModal` as-is.

- [ ] **Step 2: Update mobile drawer**

In `app/(public)/_components/mobile-drawer.tsx`, add 청약 to the top `links` array (so it renders before 생활편의):

```tsx
const links = [
  { href: '/', label: '홈' },
  { href: '/list', label: '실거래가' },
  { href: '/subscription', label: '청약' },
];
```

Then delete the bottom 청약 Soon button (the final `<button onClick={() => onSoonClick('청약')} ...>청약 <Badge tone="gray">Soon</Badge></button>` block). Leave the 생활편의 toggle untouched so 청약 now appears above 생활편의.

- [ ] **Step 3: Verify build + lint**

Run: `pnpm lint`
Expected: PASS. If `onSoonClick` becomes unused in `mobile-drawer.tsx`, it is still used by the 생활편의 `item.live ? ... : <button onClick={() => onSoonClick(item.label)}>` branch — keep the prop. Confirm no unused-var lint error.

- [ ] **Step 4: Commit**

```bash
git add app/\(public\)/_components/nav.tsx app/\(public\)/_components/mobile-drawer.tsx
git commit -m "feat(nav): 청약 메뉴 라이브 전환 + 순서 재정렬(홈·실거래가·청약·생활편의)"
```

---

## Task 5: 목록 페이지 `/subscription`

**Files:**
- Create: `app/(public)/subscription/_components/subscription-card.tsx`
- Create: `app/(public)/subscription/_components/subscription-pagination.tsx`
- Create: `app/(public)/subscription/_components/subscription-filter-panel.tsx`
- Create: `app/(public)/subscription/_components/subscription-mobile-filter-sheet.tsx`
- Create: `app/(public)/subscription/_components/subscription-list.tsx`
- Create: `app/(public)/subscription/page.tsx`

- [ ] **Step 1: Card component**

Create `app/(public)/subscription/_components/subscription-card.tsx`:

```tsx
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import {
  categoryLabel,
  deriveStatus,
  ddayLabel,
  STATUS_LABEL,
  STATUS_TONE,
  formatPriceRange,
  formatAreaRange,
  type SubscriptionListItem,
} from '@/lib/subscription';

export function SubscriptionCard({ item }: { item: SubscriptionListItem }) {
  const st = deriveStatus(item.receiptBegin, item.receiptEnd);
  const dday = ddayLabel(st);
  const period =
    item.receiptBegin || item.receiptEnd
      ? `${formatDate(item.receiptBegin)} ~ ${formatDate(item.receiptEnd)}`
      : '일정 미정';

  return (
    <Link href={`/subscription/${item.id}`}>
      <article className="rounded-[22px] border border-[var(--color-line)] bg-white px-6 py-5 shadow-[var(--shadow)] transition hover:shadow-lg">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge tone="blue">{categoryLabel(item.category)}</Badge>
          <Badge tone={STATUS_TONE[st.status]} className="whitespace-nowrap">
            {STATUS_LABEL[st.status]}
            {dday ? ` · ${dday}` : ''}
          </Badge>
        </div>

        <h3 className="mb-1 break-keep text-xl font-bold text-[var(--color-blue-dark)]">
          {item.name}
        </h3>
        <p className="mb-4 text-sm text-[var(--color-muted)]">
          {item.regionName ?? '지역 미정'}
          {item.unitCount > 0 ? ` · 주택형 ${item.unitCount}개` : ''}
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-[14px] bg-[var(--color-soft)] px-4 py-3">
            <span className="mb-1 block text-xs text-[var(--color-muted)]">접수기간</span>
            <strong className="block break-keep text-sm font-bold text-[var(--color-blue-dark)]">
              {period}
            </strong>
          </div>
          <div className="rounded-[14px] bg-[var(--color-soft)] px-4 py-3">
            <span className="mb-1 block text-xs text-[var(--color-muted)]">분양가</span>
            <strong className="block whitespace-nowrap text-sm font-bold text-[var(--color-blue-dark)]">
              {formatPriceRange(item.minPrice, item.maxPrice)}
            </strong>
          </div>
          <div className="rounded-[14px] bg-[var(--color-soft)] px-4 py-3">
            <span className="mb-1 block text-xs text-[var(--color-muted)]">
              {item.totalSupply ? '총 공급' : '전용면적'}
            </span>
            <strong className="block whitespace-nowrap text-sm font-bold text-[var(--color-blue-dark)]">
              {item.totalSupply
                ? `${item.totalSupply.toLocaleString('ko-KR')}세대`
                : formatAreaRange(item.minArea, item.maxArea)}
            </strong>
          </div>
        </div>
      </article>
    </Link>
  );
}
```

- [ ] **Step 2: Pagination component**

Create `app/(public)/subscription/_components/subscription-pagination.tsx`:

```tsx
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pagination } from '@/components/ui/pagination';

interface Props {
  current: number;
  totalPages: number;
  totalItems: number;
  perPage: number;
}

export function SubscriptionPagination(props: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    router.push(`/subscription?${params.toString()}`);
  }

  return <Pagination {...props} onChange={handleChange} />;
}
```

- [ ] **Step 3: Filter panel**

Create `app/(public)/subscription/_components/subscription-filter-panel.tsx`:

```tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Chip } from '@/components/ui/chip';
import { Button } from '@/components/ui/button';
import { SUBSCRIPTION_CATEGORIES } from '@/lib/subscription';

interface SidoItem {
  code: string;
  sido: string;
  fullName: string;
}

interface Props {
  sidoList: SidoItem[];
  params?: URLSearchParams;
  onParamsChange?: (next: URLSearchParams) => void;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'open', label: '접수중' },
  { value: 'upcoming', label: '예정' },
  { value: 'closed', label: '마감' },
];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'recent', label: '접수마감일순' },
  { value: 'notice', label: '공고일순' },
];

export function SubscriptionFilterPanel({ sidoList, params: externalParams, onParamsChange }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const effective = externalParams ?? searchParams;

  const selectedCats = new Set((effective.get('category') ?? '').split(',').filter(Boolean));
  const sido = effective.get('sido') ?? '';
  const status = effective.get('status') ?? 'all';
  const sort = effective.get('sort') ?? 'recent';

  const hasActive = selectedCats.size > 0 || !!sido || status !== 'all' || sort !== 'recent';

  function update(updates: Record<string, string | null>) {
    const next = new URLSearchParams(effective.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    next.delete('page');
    if (onParamsChange) onParamsChange(next);
    else router.push(`/subscription?${next.toString()}`);
  }

  function toggleCategory(slug: string) {
    const next = new Set(selectedCats);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    update({ category: next.size ? [...next].join(',') : null });
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">청약 유형</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {SUBSCRIPTION_CATEGORIES.map((c) => (
            <Chip key={c.slug} active={selectedCats.has(c.slug)} onClick={() => toggleCategory(c.slug)}>
              {c.label}
            </Chip>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">지역</h3>
        <div className="mt-2">
          <select
            value={sido}
            onChange={(e) => update({ sido: e.target.value || null })}
            className="w-full rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-blue-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue)]"
          >
            <option value="">시도 전체</option>
            {sidoList.map((s) => (
              <option key={s.code} value={s.sido}>
                {s.fullName}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">접수 상태</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              active={status === o.value}
              onClick={() => update({ status: o.value === 'all' ? null : o.value })}
            >
              {o.label}
            </Chip>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">정렬</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {SORT_OPTIONS.map((o) => (
            <Chip key={o.value} active={sort === o.value} onClick={() => update({ sort: o.value })}>
              {o.label}
            </Chip>
          ))}
        </div>
      </section>

      {hasActive && !onParamsChange && (
        <Button variant="ghost" size="sm" onClick={() => router.push('/subscription')}>
          필터 초기화
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Mobile filter sheet**

Create `app/(public)/subscription/_components/subscription-mobile-filter-sheet.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { SubscriptionFilterPanel } from './subscription-filter-panel';

interface SidoItem {
  code: string;
  sido: string;
  fullName: string;
}

export function SubscriptionMobileFilterSheet({ sidoList }: { sidoList: SidoItem[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [pendingParams, setPendingParams] = useState(
    () => new URLSearchParams(searchParams.toString()),
  );

  const activeCount = [
    !!searchParams.get('category'),
    !!searchParams.get('sido'),
    (searchParams.get('status') ?? 'all') !== 'all',
    (searchParams.get('sort') ?? 'recent') !== 'recent',
  ].filter(Boolean).length;

  function handleApply() {
    const qs = pendingParams.toString();
    router.push(qs ? `/subscription?${qs}` : '/subscription');
    setOpen(false);
  }

  const footer = (
    <div className="flex gap-3">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setPendingParams(new URLSearchParams())}
        className="shrink-0"
      >
        필터 초기화
      </Button>
      <Button onClick={handleApply} className="flex-1">
        조회
      </Button>
    </div>
  );

  return (
    <div className="mb-4 flex items-center gap-2 md:hidden">
      <button
        onClick={() => {
          setPendingParams(new URLSearchParams(searchParams.toString()));
          setOpen(true);
        }}
        className="flex items-center gap-1.5 rounded-xl bg-[var(--color-blue-dark)] px-4 py-2 text-sm font-semibold text-white"
      >
        필터
        {activeCount > 0 && (
          <span className="rounded-full bg-white px-1.5 py-0.5 text-xs font-bold leading-none text-[var(--color-blue-dark)]">
            {activeCount}
          </span>
        )}
      </button>
      <BottomSheet open={open} onOpenChange={setOpen} title="필터" footer={footer}>
        <SubscriptionFilterPanel
          sidoList={sidoList}
          params={pendingParams}
          onParamsChange={setPendingParams}
        />
      </BottomSheet>
    </div>
  );
}
```

- [ ] **Step 5: List (data fetch + render)**

Create `app/(public)/subscription/_components/subscription-list.tsx`:

```tsx
import {
  getSubscriptionList,
  type SubscriptionStatus,
} from '@/lib/subscription';
import type { SubscriptionCategory } from '@prisma/client';
import { SubscriptionCard } from './subscription-card';
import { SubscriptionPagination } from './subscription-pagination';

interface Props {
  categories: SubscriptionCategory[];
  sido?: string;
  status?: SubscriptionStatus;
  sort: 'recent' | 'notice';
  page: number;
}

export async function SubscriptionList({ categories, sido, status, sort, page }: Props) {
  const { rows, total, totalPages, perPage } = await getSubscriptionList({
    categories,
    sido,
    status,
    sort,
    page,
    perPage: 20,
  });

  return (
    <>
      <div className="mb-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-3 shadow-[var(--shadow)]">
        <p className="text-base font-bold text-[var(--color-blue-dark)]">
          청약 공고 <span className="text-[var(--color-blue)]">{total.toLocaleString('ko-KR')}</span>건
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">
          조건에 맞는 청약 공고가 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((item) => (
            <SubscriptionCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6">
          <SubscriptionPagination
            current={page}
            totalPages={totalPages}
            totalItems={total}
            perPage={perPage}
          />
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 6: Page**

Create `app/(public)/subscription/page.tsx`:

```tsx
import Link from 'next/link';
import { Suspense } from 'react';
import { getSidoList } from '@/lib/region';
import { slugsToCategories, type SubscriptionStatus } from '@/lib/subscription';
import { SubscriptionFilterPanel } from './_components/subscription-filter-panel';
import { SubscriptionMobileFilterSheet } from './_components/subscription-mobile-filter-sheet';
import { SubscriptionList } from './_components/subscription-list';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '청약·분양 정보',
  description: '아파트·오피스텔·공공임대·사전청약 분양 공고를 한 곳에서. 접수 일정·분양가·주변 시세까지.',
  alternates: { canonical: '/subscription' },
};

export const revalidate = 300;

interface SearchParams {
  category?: string;
  sido?: string;
  status?: string;
  sort?: string;
  page?: string;
}

const STATUS_MAP: Record<string, SubscriptionStatus> = {
  open: 'OPEN',
  upcoming: 'UPCOMING',
  closed: 'CLOSED',
};

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [sp, sidoList] = await Promise.all([searchParams, getSidoList()]);

  const categories = slugsToCategories((sp.category ?? '').split(',').filter(Boolean));
  const sido = sp.sido || undefined;
  const status = sp.status ? STATUS_MAP[sp.status] : undefined;
  const sort = (sp.sort === 'notice' ? 'notice' : 'recent') as 'recent' | 'notice';
  const page = Math.max(1, Number(sp.page ?? '1'));

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <nav className="mb-6 flex items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link>
        <span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">청약 목록</span>
      </nav>

      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow)]">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">청약·분양 통합</p>
        <h1 className="text-3xl font-black tracking-tight text-[var(--color-blue-dark)]">청약 목록</h1>
        <p className="mt-2 break-keep text-sm text-[var(--color-muted)]">
          아파트·오피스텔·공공/민간임대·사전청약 분양 공고를 접수 일정과 분양가로 한 번에 확인하세요.
        </p>
      </div>

      <Suspense>
        <SubscriptionMobileFilterSheet sidoList={sidoList} />
      </Suspense>

      <div className="flex items-start gap-6">
        <aside className="sticky top-[88px] hidden w-[280px] shrink-0 md:block">
          <div className="max-h-[calc(100vh-104px)] overflow-y-auto rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow)]">
            <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-[var(--color-soft)]" />}>
              <SubscriptionFilterPanel sidoList={sidoList} />
            </Suspense>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <Suspense
            fallback={<div className="h-96 animate-pulse rounded-[22px] bg-[var(--color-soft)]" />}
          >
            <SubscriptionList
              categories={categories}
              sido={sido}
              status={status}
              sort={sort}
              page={page}
            />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Verify build + lint**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/\(public\)/subscription/page.tsx app/\(public\)/subscription/_components
git commit -m "feat(subscription): 청약 목록 페이지(필터·카드·페이지네이션·모바일 시트)"
```

---

## Task 6: 상세 페이지 `/subscription/[id]`

**Files:**
- Create: `app/(public)/subscription/[id]/_components/subscription-hero.tsx`
- Create: `app/(public)/subscription/[id]/_components/schedule-timeline.tsx`
- Create: `app/(public)/subscription/[id]/_components/unit-supply-table.tsx`
- Create: `app/(public)/subscription/[id]/_components/subscription-sidebar.tsx`
- Create: `app/(public)/subscription/[id]/page.tsx`

- [ ] **Step 1: Hero**

Create `app/(public)/subscription/[id]/_components/subscription-hero.tsx`:

```tsx
import { Badge } from '@/components/ui/badge';
import {
  categoryLabel,
  deriveStatus,
  ddayLabel,
  STATUS_LABEL,
  STATUS_TONE,
  type SubscriptionDetail,
} from '@/lib/subscription';

export function SubscriptionHero({ notice }: { notice: SubscriptionDetail }) {
  const st = deriveStatus(notice.receiptBegin, notice.receiptEnd);
  const dday = ddayLabel(st);

  return (
    <div className="flex min-h-[180px] items-end rounded-[26px] bg-gradient-to-br from-[#1e3a8a] to-[#38bdf8] p-7 text-white sm:p-8">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="inline-block whitespace-nowrap rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
            {categoryLabel(notice.category)}
          </span>
          <Badge tone={STATUS_TONE[st.status]} className="whitespace-nowrap">
            {STATUS_LABEL[st.status]}
            {dday ? ` · ${dday}` : ''}
          </Badge>
        </div>
        <h1 className="break-keep text-2xl font-black tracking-tight sm:text-4xl">{notice.name}</h1>
        <p className="mt-2 break-keep text-sm text-white/80">
          {notice.regionName ?? '지역 미정'}
          {notice.developer ? ` · 시행 ${notice.developer}` : ''}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Schedule timeline**

Create `app/(public)/subscription/[id]/_components/schedule-timeline.tsx`:

```tsx
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/format';
import type { SubscriptionDetail } from '@/lib/subscription';

function moveInLabel(ym: string | null): string {
  if (!ym || ym.length !== 6) return '-';
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
}

export function ScheduleTimeline({ notice }: { notice: SubscriptionDetail }) {
  const steps: { label: string; value: string }[] = [
    { label: '모집공고', value: formatDate(notice.noticeDate) },
    { label: '접수 시작', value: formatDate(notice.receiptBegin) },
    { label: '접수 마감', value: formatDate(notice.receiptEnd) },
    { label: '당첨자 발표', value: formatDate(notice.winnerDate) },
    {
      label: '계약',
      value:
        notice.contractBegin || notice.contractEnd
          ? `${formatDate(notice.contractBegin)} ~ ${formatDate(notice.contractEnd)}`
          : '-',
    },
    { label: '입주 예정', value: moveInLabel(notice.moveInYm) },
  ];

  return (
    <Card id="schedule">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">청약 일정</h2>
      <ol className="flex flex-col gap-3">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] pb-3 last:border-0 last:pb-0">
            <span className="shrink-0 text-sm font-semibold text-[var(--color-muted)]">{s.label}</span>
            <span className="break-keep text-right text-sm font-bold text-[var(--color-blue-dark)]">
              {s.value}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
```

- [ ] **Step 3: Unit supply table (모바일 카드 + 데스크톱 테이블)**

Create `app/(public)/subscription/[id]/_components/unit-supply-table.tsx`:

```tsx
import { Card } from '@/components/ui/card';
import { formatBillion, formatPyeong } from '@/lib/format';
import type { SubscriptionUnit } from '@prisma/client';

function area(u: SubscriptionUnit): string {
  return u.area != null ? formatPyeong(Number(u.area)) : '-';
}
function supply(n: number | null): string {
  return n != null && n > 0 ? `${n.toLocaleString('ko-KR')}세대` : '-';
}

export function UnitSupplyTable({ units }: { units: SubscriptionUnit[] }) {
  if (units.length === 0) return null;

  return (
    <Card id="units" className="!p-0">
      <h2 className="px-6 pt-6 text-lg font-bold text-[var(--color-blue-dark)]">주택형별 공급</h2>

      {/* 데스크톱: 테이블 */}
      <table className="mt-4 hidden w-full text-sm sm:table">
        <thead>
          <tr className="border-y border-[var(--color-line)] text-left text-xs text-[var(--color-muted)]">
            <th className="px-6 py-3 font-semibold">주택형</th>
            <th className="px-4 py-3 font-semibold">전용면적</th>
            <th className="px-4 py-3 font-semibold">일반공급</th>
            <th className="px-4 py-3 font-semibold">특별공급</th>
            <th className="px-6 py-3 text-right font-semibold">분양가</th>
          </tr>
        </thead>
        <tbody>
          {units.map((u) => (
            <tr key={String(u.id)} className="border-b border-[var(--color-line)] last:border-0">
              <td className="whitespace-nowrap px-6 py-3 font-semibold text-[var(--color-blue-dark)]">
                {u.houseType ?? '-'}
              </td>
              <td className="whitespace-nowrap px-4 py-3">{area(u)}</td>
              <td className="whitespace-nowrap px-4 py-3">{supply(u.generalSupply)}</td>
              <td className="whitespace-nowrap px-4 py-3">{supply(u.specialSupply)}</td>
              <td className="whitespace-nowrap px-6 py-3 text-right font-bold text-[var(--color-blue-dark)]">
                {formatBillion(u.topAmount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 모바일: 카드 리스트 */}
      <ul className="mt-2 divide-y divide-[var(--color-line)] sm:hidden">
        {units.map((u) => (
          <li key={String(u.id)} className="px-6 py-4">
            <div className="flex items-center justify-between gap-2">
              <span className="break-keep font-semibold text-[var(--color-blue-dark)]">
                {u.houseType ?? '-'}
              </span>
              <span className="whitespace-nowrap font-bold text-[var(--color-blue-dark)]">
                {formatBillion(u.topAmount)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]">
              <span>전용 {area(u)}</span>
              <span>일반 {supply(u.generalSupply)}</span>
              <span>특별 {supply(u.specialSupply)}</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="h-2" />
    </Card>
  );
}
```

- [ ] **Step 4: Sidebar**

Create `app/(public)/subscription/[id]/_components/subscription-sidebar.tsx`:

```tsx
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import type { SubscriptionDetail } from '@/lib/subscription';

function moveIn(ym: string | null): string {
  if (!ym || ym.length !== 6) return '-';
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
}

export function SubscriptionSidebar({ notice }: { notice: SubscriptionDetail }) {
  const info: { label: string; value: string }[] = [
    { label: '총 공급', value: notice.totalSupply ? `${notice.totalSupply.toLocaleString('ko-KR')}세대` : '-' },
    {
      label: '접수기간',
      value:
        notice.receiptBegin || notice.receiptEnd
          ? `${formatDate(notice.receiptBegin)} ~ ${formatDate(notice.receiptEnd)}`
          : '-',
    },
    { label: '당첨발표', value: formatDate(notice.winnerDate) },
    { label: '입주예정', value: moveIn(notice.moveInYm) },
  ];

  return (
    <div className="sticky top-24 flex flex-col gap-4">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">청약 정보</h3>
          <Badge tone="gray">{notice.source === 'LH_PRESUB' ? 'LH' : '청약홈'}</Badge>
        </div>
        <ul className="space-y-2 text-sm">
          {info.map((i) => (
            <li key={i.label} className="flex items-start justify-between gap-3">
              <span className="shrink-0 text-[var(--color-muted)]">{i.label}</span>
              <span className="break-keep text-right font-semibold text-[var(--color-blue-dark)]">
                {i.value}
              </span>
            </li>
          ))}
          {notice.tel && (
            <li className="flex items-start justify-between gap-3">
              <span className="shrink-0 text-[var(--color-muted)]">문의</span>
              <span className="break-keep text-right font-semibold text-[var(--color-blue-dark)]">
                {notice.tel}
              </span>
            </li>
          )}
        </ul>
      </Card>

      {(notice.noticeUrl || notice.homepage) && (
        <Card>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">공고 바로가기</h3>
          <ul className="flex flex-col gap-2">
            {notice.noticeUrl && (
              <li>
                <a
                  href={notice.noticeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl bg-[var(--color-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--color-blue-dark)] transition-colors hover:bg-[var(--color-line)]"
                >
                  공고문 원문 보기
                </a>
              </li>
            )}
            {notice.homepage && (
              <li>
                <a
                  href={notice.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl bg-[var(--color-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--color-blue-dark)] transition-colors hover:bg-[var(--color-line)]"
                >
                  분양 홈페이지
                </a>
              </li>
            )}
          </ul>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Detail page**

Create `app/(public)/subscription/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import {
  getSubscriptionById,
  getSubscriptionLatLng,
  categoryLabel,
} from '@/lib/subscription';
import { getNearbyApartments, getNearbyInfra } from '@/lib/amenity/nearby';
import { NaverMap } from '@/components/ui/naver-map';
import { NearbyApartments } from '@/components/ui/nearby-apartments';
import { NearbyInfra } from '@/components/ui/nearby-infra';
import { SubscriptionHero } from './_components/subscription-hero';
import { ScheduleTimeline } from './_components/schedule-timeline';
import { UnitSupplyTable } from './_components/unit-supply-table';
import { SubscriptionSidebar } from './_components/subscription-sidebar';
import type { Metadata } from 'next';

export const revalidate = 21_600;

interface Params {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const notice = await getSubscriptionById(BigInt(id)).catch(() => null);
  if (!notice) return {};
  return {
    title: `${notice.name} 청약 · ${categoryLabel(notice.category)}`,
    description: `${notice.regionName ?? ''} ${notice.name} 청약 공고. 접수 일정·주택형별 분양가·주변 시세를 확인하세요.`,
    alternates: { canonical: `/subscription/${notice.id}` },
  };
}

export default async function SubscriptionDetailPage({ params }: Params) {
  const { id } = await params;
  const noticeId = BigInt(id);
  const notice = await getSubscriptionById(noticeId);
  if (!notice) notFound();

  const coord = await getSubscriptionLatLng(noticeId);
  const [nearbyApts, infra] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([]),
    coord
      ? getNearbyInfra(coord.lat, coord.lng, { includeChildcare: true })
      : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
  ]);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-12">
      <SubscriptionHero notice={notice} />
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="flex min-w-0 flex-col gap-8">
          <ScheduleTimeline notice={notice} />
          <UnitSupplyTable units={notice.units} />

          {coord ? (
            <>
              <section id="map">
                <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">위치</h2>
                <NaverMap lat={coord.lat} lng={coord.lng} name={notice.name} />
              </section>
              <NearbyApartments items={nearbyApts} />
              <NearbyInfra categories={infra} />
            </>
          ) : (
            <div className="rounded-[22px] border border-dashed border-[var(--color-line)] bg-white p-8 text-center text-sm text-[var(--color-muted)]">
              위치 정보가 없어 주변 실거래가·편의시설 정보를 제공하지 않습니다.
            </div>
          )}
        </main>
        <aside className="min-w-0">
          <SubscriptionSidebar notice={notice} />
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify build + lint**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: PASS. (If `getNearbyApartments`'s empty-array branch needs an explicit type, change to `Promise.resolve([] as Awaited<ReturnType<typeof getNearbyApartments>>)`.)

- [ ] **Step 7: Commit**

```bash
git add app/\(public\)/subscription/\[id\]
git commit -m "feat(subscription): 청약 상세(일정·주택형·지도·주변 실거래가·편의시설)"
```

---

## Task 7: 통합 검증 — 빌드 · 전체 테스트 · 모바일 360px

**Files:** (none — verification only)

- [ ] **Step 1: Full unit tests**

Run: `pnpm test:unit`
Expected: PASS (기존 + `tests/lib/subscription.test.ts`).

- [ ] **Step 2: Production build**

Run: `pnpm build`
Expected: 빌드 성공. `/subscription` 와 `/subscription/[id]` 라우트가 출력에 포함됨.

- [ ] **Step 3: Manual mobile check (360px)**

`pnpm dev` 실행 후 브라우저를 360px 폭으로 줄여 확인:
- `/subscription`: 카드/필터 버튼이 가로 스크롤 없이 들어오고, 공고명·접수기간 텍스트가 글자단위로 세로로 쌓이지 않음. 모바일 "필터" 버튼 → 바텀시트 → 조회 동작.
- `/subscription/[id]` (좌표 있는 공고): 일정·주택형 카드 리스트·지도·주변 실거래가·편의시설이 1컬럼으로 쌓이고 가로 오버플로우 없음. 주택형 표가 모바일에서 카드 리스트로 렌더됨.
- 좌표 없는 공고(예: LH `source=LH_PRESUB`): 지도/주변 섹션 대신 안내 문구 표시.
- 데스크톱(≥1024px): 2컬럼(본문 + 320px 사이드바) 정상.

검증 대상 ID는 다음으로 추출:
```bash
pnpm exec dotenv -e .env.local -- tsx -e "
import { prisma } from './lib/db';
(async () => {
  const withCoord = await prisma.\$queryRaw\`SELECT id FROM \"SubscriptionNotice\" WHERE location IS NOT NULL LIMIT 1\`;
  const lh = await prisma.subscriptionNotice.findFirst({ where: { source: 'LH_PRESUB' }, select: { id: true } });
  console.log('withCoord', JSON.stringify(withCoord, (k,v)=>typeof v==='bigint'?Number(v):v), 'lh', Number(lh?.id));
  await prisma.\$disconnect();
})();
"
```

- [ ] **Step 4: Commit (if any fixups were needed)**

```bash
git add -A
git commit -m "fix(subscription): 모바일 레이아웃·오버플로우 정리"
```

(수정 사항이 없으면 이 단계는 건너뛴다.)

---

## Self-Review Notes

- **Spec coverage:** 라우트·메뉴(Task 4) / 데이터 레이어·상태도출·라벨(Task 1–3) / 목록·필터·카드·페이지네이션(Task 5) / 상세 hero·일정·주택형·지도·주변 실거래가·주변 편의시설·사이드바(Task 6) / 모바일 오버플로우 가드(전 컴포넌트 + Task 7 검증) — 모두 매핑됨.
- **데이터 정합:** `constructor` 미노출(항상 null), `area`/`specialSupply` null 처리, `regionName` 등가 필터 — 실데이터 기준 반영.
- **타입 일관:** `SubscriptionListItem`/`SubscriptionDetail`/`SubscriptionStatus`/`deriveStatus`/`ddayLabel`/`STATUS_TONE`/`STATUS_LABEL` 명칭이 Task 1·2·3에서 정의되어 5·6에서 동일하게 사용됨.
