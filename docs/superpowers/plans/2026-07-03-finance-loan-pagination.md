# 서민금융 대출상품 목록 페이지네이션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/finance` 대출상품 목록을 URL(`?page=N`) 기반 클라이언트 페이지네이션(페이지당 20개)으로 바꾼다. 청약 공용 `Pagination` 컴포넌트를 재사용하고, 24h ISR을 유지한다.

**Architecture:** 서버(`page.tsx`)는 지금처럼 전체 행을 로드해 넘긴다(무변경). 클라이언트 `LoanExplorer`가 필터된 배열을 순수 헬퍼 `paginate()`로 잘라 렌더하고, 페이지 상태를 `window.history.replaceState`로 URL에 기록한다(`useSearchParams`/router 미사용 → 정적 라우트 유지). 슬라이스·클램프·파싱 로직은 `lib/pagination.ts`의 순수 함수로 분리해 단위 테스트한다.

**Tech Stack:** Next.js(App Router, 클라이언트 컴포넌트), React 훅, vitest(node env), Playwright, Prisma.

**Spec:** `docs/superpowers/specs/2026-07-03-finance-loan-pagination-design.md`

## Global Constraints

- **PER_PAGE = 20** (청약과 동일).
- **정적 라우트 유지:** `page.tsx`에서 `searchParams`를 읽지 않는다. 클라이언트는 `useSearchParams`/`useRouter`/`router.push`를 쓰지 않고 **`window.location.search`(읽기) + `window.history.replaceState`(쓰기)** 만 쓴다 (기존 `loan-explorer.tsx` 패턴).
- **뒤로가기 동작 = (가) `replaceState`** (pushState/popstate 미도입).
- **`components/ui/pagination.tsx` 재사용 — 수정 금지.** 이 컴포넌트는 `totalPages <= 1`이면 스스로 `null`을 반환하므로 별도 숨김 처리 불필요.
- **`page > 1`일 때만 URL에 `page` 기록** (1페이지는 생략 → canonical `/finance` 유지).
- **page 리셋(→1)은 사용자 필터/정렬 변경에만 적용**, 마운트 URL 복원에는 적용하지 않는다.
- **새 테스트 프레임워크(jsdom/@testing-library) 도입 금지.** 컴포넌트 테스트는 `renderToStaticMarkup`(초기 상태)만, 상호작용은 e2e로.
- **접근성 WCAG 2.1 AA.** 한글 본문 14px 이상 등 기존 시각 규칙 유지(카드 마크업 무변경).
- **커밋 트레일러:** 모든 커밋 메시지 끝에 저장소 프로토콜의 `Co-Authored-By` / `Claude-Session` 트레일러를 붙인다.
- **기존 코드 스타일 준수:** 한글 주석, 기존 파일 관례를 따른다. 요청 범위 밖 리팩터 금지.

## File Structure

- **Create:**
  - `tests/lib/pagination.test.ts` — `paginate`/`parsePageParam` 단위 테스트
  - `tests/components/loan-explorer-ssr.test.ts` — LoanExplorer 초기 SSR(20개 + 페이지네이션) 테스트
  - `tests/e2e/finance-pagination.spec.ts` — 페이지 이동·URL·필터 리셋 e2e
- **Modify:**
  - `lib/pagination.ts` — 순수 헬퍼 `paginate()`, `parsePageParam()` 추가 (기존 `buildPager` 옆)
  - `app/(public)/finance/_components/loan-explorer.tsx` — 페이지네이션 배선
  - `tests/_helpers/seed-e2e.ts` — `seedLoans()`(25건) 추가 + `main()`에서 호출
- **Unchanged (건드리지 않음):** `app/(public)/finance/page.tsx`, `components/ui/pagination.tsx`, `app/(public)/finance/_components/loan-card.tsx`, `lib/loan/list.ts`

---

### Task 1: 순수 헬퍼 `paginate` + `parsePageParam`

**Files:**
- Modify: `lib/pagination.ts`
- Test: `tests/lib/pagination.test.ts` (create)

**Interfaces:**
- Produces:
  - `paginate<T>(items: T[], page: number, perPage: number): { pageItems: T[]; total: number; totalPages: number; safePage: number }`
  - `parsePageParam(search: string): number` — `search`는 `window.location.search`(예 `"?page=3"`). 정수 ≥1만 그대로, 그 외(누락·0·음수·비수·소수)는 `1`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/pagination.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { paginate, parsePageParam } from '@/lib/pagination';

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => i); // 0..24

  it('1페이지는 앞에서 perPage개', () => {
    const r = paginate(items, 1, 20);
    expect(r.pageItems).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(r.total).toBe(25);
    expect(r.totalPages).toBe(2);
    expect(r.safePage).toBe(1);
  });

  it('마지막 페이지는 나머지만', () => {
    const r = paginate(items, 2, 20);
    expect(r.pageItems).toEqual([20, 21, 22, 23, 24]);
    expect(r.safePage).toBe(2);
  });

  it('totalPages 초과 page는 마지막으로 클램프', () => {
    const r = paginate(items, 99, 20);
    expect(r.safePage).toBe(2);
    expect(r.pageItems).toEqual([20, 21, 22, 23, 24]);
  });

  it('page <= 0 / NaN 은 1로', () => {
    expect(paginate(items, 0, 20).safePage).toBe(1);
    expect(paginate(items, -5, 20).safePage).toBe(1);
    expect(paginate(items, Number.NaN, 20).safePage).toBe(1);
  });

  it('빈 배열 → totalPages 1, 항목 없음', () => {
    const r = paginate([], 1, 20);
    expect(r.total).toBe(0);
    expect(r.totalPages).toBe(1);
    expect(r.pageItems).toEqual([]);
    expect(r.safePage).toBe(1);
  });
});

describe('parsePageParam', () => {
  it.each([
    ['?page=3', 3],
    ['?page=1', 1],
    ['', 1],
    ['?page=0', 1],
    ['?page=-2', 1],
    ['?page=abc', 1],
    ['?page=2.5', 1],
    ['?foo=bar', 1],
    ['?page=2&usage=jeonse', 2],
  ])('%s → %s', (search, expected) => {
    expect(parsePageParam(search as string)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/pagination.test.ts`
Expected: FAIL — `paginate`/`parsePageParam` are not exported from `@/lib/pagination`.

- [ ] **Step 3: Add the helpers**

Append to `lib/pagination.ts` (아래에 기존 `buildPager`는 그대로 둔다):

```ts
export interface PageResult<T> {
  pageItems: T[];
  total: number;
  totalPages: number;
  safePage: number;
}

/** 배열을 page 단위로 자른다. page는 [1, totalPages]로 클램프(safePage). */
export function paginate<T>(items: T[], page: number, perPage: number): PageResult<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const raw = Number.isFinite(page) ? Math.floor(page) : 1;
  const safePage = Math.min(Math.max(1, raw), totalPages);
  const startIdx = (safePage - 1) * perPage;
  return { pageItems: items.slice(startIdx, startIdx + perPage), total, totalPages, safePage };
}

/** location.search에서 page를 읽는다. 정수 ≥1만 유효, 나머지는 1. */
export function parsePageParam(search: string): number {
  const raw = new URLSearchParams(search).get('page');
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/pagination.test.ts`
Expected: PASS (전체 케이스).

- [ ] **Step 5: Commit**

```bash
git add lib/pagination.ts tests/lib/pagination.test.ts
git commit -m "feat(pagination): paginate + parsePageParam 순수 헬퍼 추가"
```

---

### Task 2: LoanExplorer — 슬라이스 렌더 + Pagination

목록을 필터된 전체 대신 현재 페이지(20개)만 렌더하고, 하단에 `Pagination`을 붙인다. 이 시점에서 `page`는 로컬 `useState`이고 URL 동기화는 아직 없다(다음 태스크). 필터/정렬 변경 시 1페이지로 리셋한다.

**Files:**
- Modify: `app/(public)/finance/_components/loan-explorer.tsx`
- Test: `tests/components/loan-explorer-ssr.test.ts` (create)

**Interfaces:**
- Consumes: `paginate` (Task 1), `Pagination` (`@/components/ui/pagination`, props `{current,totalPages,totalItems,perPage,onChange,disabled?}`), `LoanSummary`/`LoanFacets`/`LoanFilterCriteria`/`filterLoans` (`@/lib/loan/list`).
- Produces: 초기 SSR 마크업에 첫 20개 카드 + `<nav aria-label="페이지네이션">`.

- [ ] **Step 1: Write the failing test**

Create `tests/components/loan-explorer-ssr.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoanExplorer } from '@/app/(public)/finance/_components/loan-explorer';
import type { LoanSummary, LoanFacets } from '@/lib/loan/list';

// 컴포넌트는 자동 JSX 런타임을 쓰지만 vitest(esbuild)는 classic 런타임으로 변환해
// React.createElement를 전역에서 찾는다. (hospital-tabs-ssr.test.ts와 동일 shim)
(globalThis as unknown as { React: typeof React }).React = React;

const facets: LoanFacets = { usage: [], inst: [], target: [], region: [] };
const rows: LoanSummary[] = Array.from({ length: 25 }, (_, i) => ({
  seq: i + 1,
  finprdnm: `E2E상품-${String(i + 1).padStart(2, '0')}`,
  ofrinstnm: null,
  instCtg: null,
  lnlmt: null,
  irt: null,
  usageTags: [],
  targetTags: [],
  regionTags: [],
  operPeriod: null,
}));

describe('LoanExplorer SSR 페이지네이션', () => {
  const html = renderToStaticMarkup(createElement(LoanExplorer, { rows, facets }));

  it('첫 페이지에 PER_PAGE(20)개만 렌더', () => {
    expect(html).toContain('E2E상품-01');
    expect(html).toContain('E2E상품-20');
    expect(html).not.toContain('E2E상품-21'); // 21번째는 2페이지
  });

  it('totalPages>1이면 페이지네이션 nav 렌더', () => {
    expect(html).toContain('페이지네이션'); // Pagination의 aria-label
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/loan-explorer-ssr.test.ts`
Expected: FAIL — 현재는 25개 전부 렌더(`E2E상품-21` 포함)되고 페이지네이션 nav가 없다.

- [ ] **Step 3: Rewrite `loan-explorer.tsx`**

Replace the entire file `app/(public)/finance/_components/loan-explorer.tsx` with:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  filterLoans,
  type LoanSummary,
  type LoanFacets,
  type LoanFilterCriteria,
} from '@/lib/loan/list';
import { paginate } from '@/lib/pagination';
import { Pagination } from '@/components/ui/pagination';
import { LoanCard } from './loan-card';
import { LoanFilterBar } from './loan-filter-bar';

const EMPTY: LoanFilterCriteria = { usage: null, inst: null, target: null, region: null, query: '', sort: null };
const PER_PAGE = 20;

// URL searchParams ↔ criteria (정적 ISR 유지 위해 useSearchParams 대신 location 사용).
function readFromUrl(): LoanFilterCriteria {
  if (typeof window === 'undefined') return EMPTY;
  const sp = new URLSearchParams(window.location.search);
  const sort = sp.get('sort');
  return {
    usage: sp.get('usage'),
    inst: sp.get('inst'),
    target: sp.get('target'),
    region: sp.get('region'),
    query: sp.get('q') ?? '',
    sort: sort === 'limitDesc' || sort === 'limitAsc' ? sort : null,
  };
}

function writeToUrl(c: LoanFilterCriteria): void {
  const sp = new URLSearchParams();
  if (c.usage) sp.set('usage', c.usage);
  if (c.inst) sp.set('inst', c.inst);
  if (c.target) sp.set('target', c.target);
  if (c.region) sp.set('region', c.region);
  if (c.query) sp.set('q', c.query);
  if (c.sort) sp.set('sort', c.sort);
  const qs = sp.toString();
  window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
}

export function LoanExplorer({ rows, facets }: { rows: LoanSummary[]; facets: LoanFacets }) {
  const [criteria, setCriteria] = useState<LoanFilterCriteria>(EMPTY);
  const [page, setPage] = useState(1);

  // 마운트 시 URL에서 초기 필터 복원
  useEffect(() => {
    setCriteria(readFromUrl());
  }, []);

  useEffect(() => {
    writeToUrl(criteria);
  }, [criteria]);

  const visible = useMemo(() => filterLoans(rows, criteria), [rows, criteria]);
  const { pageItems, total, totalPages, safePage } = paginate(visible, page, PER_PAGE);

  // 사용자가 필터·정렬을 바꾸면 1페이지로 리셋 (마운트 복원과 분리하려고 핸들러에서 처리)
  function updateCriteria(next: LoanFilterCriteria) {
    setCriteria(next);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-6">
      <LoanFilterBar facets={facets} criteria={criteria} onChange={updateCriteria} />

      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-[var(--color-muted)]">{total}개 상품</p>
          <select
            aria-label="정렬"
            value={criteria.sort ?? ''}
            onChange={(e) =>
              updateCriteria({ ...criteria, sort: (e.target.value || null) as LoanFilterCriteria['sort'] })
            }
            className="rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-blue-dark)] focus:border-[var(--color-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--color-sky-soft)]"
          >
            <option value="">정렬</option>
            <option value="limitDesc">한도 높은순</option>
            <option value="limitAsc">한도 낮은순</option>
          </select>
        </div>

        <div className="flex flex-col gap-4">
          {pageItems.map((item) => (
            <LoanCard key={item.seq} item={item} />
          ))}
        </div>

        {total === 0 && (
          <p className="py-12 text-center text-sm text-[var(--color-muted)]">
            조건에 맞는 상품이 없습니다.
          </p>
        )}

        <Pagination
          current={safePage}
          totalPages={totalPages}
          totalItems={total}
          perPage={PER_PAGE}
          onChange={setPage}
        />
      </div>
    </div>
  );
}
```

주의: 기존과 달라진 점만 요약 — `paginate`/`Pagination` import 추가, `PER_PAGE` 상수, `page` 상태, `visible` 대신 `pageItems` 렌더, 카운트/빈상태를 `total` 기준으로, `LoanFilterBar`·정렬 `onChange`를 `updateCriteria`로 감싸 page 리셋, 하단 `<Pagination>` 추가.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/loan-explorer-ssr.test.ts`
Expected: PASS (20개만 렌더, 페이지네이션 nav 존재).

- [ ] **Step 5: Typecheck & lint**

Run: `pnpm typecheck && pnpm lint`
Expected: 통과. (미사용 import/변수 없어야 함 — `pnpm lint`의 no-unused-vars=error 게이트.)

- [ ] **Step 6: Commit**

```bash
git add app/(public)/finance/_components/loan-explorer.tsx tests/components/loan-explorer-ssr.test.ts
git commit -m "feat(finance): 대출상품 목록 페이지네이션 렌더링(클라 slice)"
```

---

### Task 3: LoanExplorer — 페이지 URL(`?page`) 동기화 + 스크롤·포커스

`page`를 URL에 기록/복원하고, 딥링크·필터 축소를 `safePage`로 수렴시키며, 페이지 이동 시 목록 상단으로 스크롤·포커스한다. 이 태스크의 동작 검증은 typecheck/lint/build + Task 4의 e2e가 담당한다(현 하니스로는 상호작용 단위 테스트 불가).

**Files:**
- Modify: `app/(public)/finance/_components/loan-explorer.tsx`

**Interfaces:**
- Consumes: `parsePageParam` (Task 1).
- Produces: 페이지 이동/필터 변경이 `window.history.replaceState`로 URL(`?page=N`, 1페이지는 생략)에 반영되고, 마운트 시 URL의 page가 복원된다.

- [ ] **Step 1: import에 `useRef`, `parsePageParam` 추가**

`loan-explorer.tsx` 상단 import 두 줄을 수정:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
```

```tsx
import { paginate, parsePageParam } from '@/lib/pagination';
```

- [ ] **Step 2: `writeToUrl`에 page 인자 추가**

`writeToUrl` 함수를 아래로 교체 (page>1일 때만 기록):

```tsx
function writeToUrl(c: LoanFilterCriteria, page: number): void {
  const sp = new URLSearchParams();
  if (c.usage) sp.set('usage', c.usage);
  if (c.inst) sp.set('inst', c.inst);
  if (c.target) sp.set('target', c.target);
  if (c.region) sp.set('region', c.region);
  if (c.query) sp.set('q', c.query);
  if (c.sort) sp.set('sort', c.sort);
  if (page > 1) sp.set('page', String(page)); // 1페이지는 생략 → canonical URL 유지
  const qs = sp.toString();
  window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
}
```

- [ ] **Step 3: 상태·effect 블록 교체 (마운트 복원 + 단일 쓰기 + 클램프 수렴 + ref)**

컴포넌트 본문에서 기존 `const [criteria...]` 부터 `const { pageItems... } = paginate(...)` 까지를 아래로 교체:

```tsx
  const [criteria, setCriteria] = useState<LoanFilterCriteria>(EMPTY);
  const [page, setPage] = useState(1);
  const listTopRef = useRef<HTMLDivElement>(null);

  // 마운트 시 URL에서 필터·페이지를 함께 복원.
  // 이 경로는 updateCriteria를 거치지 않으므로 page 리셋(→1)이 일어나지 않는다.
  useEffect(() => {
    setCriteria(readFromUrl());
    setPage(parsePageParam(window.location.search));
  }, []);

  const visible = useMemo(() => filterLoans(rows, criteria), [rows, criteria]);
  const { pageItems, total, totalPages, safePage } = paginate(visible, page, PER_PAGE);

  // criteria/page 변화를 하나의 경로로 URL에 기록 (정규화된 safePage로).
  useEffect(() => {
    writeToUrl(criteria, safePage);
  }, [criteria, safePage]);

  // 딥링크 ?page=99 · 필터 축소로 page가 범위를 벗어나면 safePage로 수렴.
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);
```

(기존의 `useEffect(() => { writeToUrl(criteria); }, [criteria])` 단일 criteria 쓰기 effect는 위 통합 effect로 대체되어 사라진다.)

- [ ] **Step 4: 페이지 이동 핸들러 추가 + Pagination/컨테이너 배선**

`updateCriteria` 함수 아래에 핸들러를 추가:

```tsx
  function handlePageChange(next: number) {
    setPage(next);
    // 페이지 이동 시 목록 상단으로 스크롤 + 포커스 (WCAG: 위치 변화 전달)
    listTopRef.current?.scrollIntoView({ block: 'start' });
    listTopRef.current?.focus();
  }
```

리스트 섹션 래퍼 `<div>` (헤더+목록+페이지네이션을 감싸는, `<LoanFilterBar>` 바로 다음 `<div>`)에 ref·tabIndex를 부여:

```tsx
      <div ref={listTopRef} tabIndex={-1} className="scroll-mt-4 outline-none">
```

`<Pagination>`의 `onChange`를 `setPage` → `handlePageChange`로 교체:

```tsx
        <Pagination
          current={safePage}
          totalPages={totalPages}
          totalItems={total}
          perPage={PER_PAGE}
          onChange={handlePageChange}
        />
```

- [ ] **Step 5: Typecheck & lint & build**

Run: `pnpm typecheck && pnpm lint`
Expected: 통과.

Run: `pnpm build`
Expected: 성공. **특히 `/finance`가 정적(○ 또는 ISR)으로 남아야 한다** — 빌드 로그의 라우트 표에서 `/finance`가 `ƒ (Dynamic)`으로 바뀌지 않았는지 확인(useSearchParams 미사용 → 정적 유지). Dynamic으로 바뀌었다면 즉시 중단하고 원인(라우트에서 searchParams/useSearchParams 유입) 조사.

- [ ] **Step 6: Commit**

```bash
git add app/(public)/finance/_components/loan-explorer.tsx
git commit -m "feat(finance): 페이지 상태 URL(?page) 동기화 + 스크롤·포커스"
```

---

### Task 4: e2e — 대출상품 seed(25건) + 페이지네이션 스펙

**Files:**
- Modify: `tests/_helpers/seed-e2e.ts`
- Test: `tests/e2e/finance-pagination.spec.ts` (create)

**Interfaces:**
- Consumes: seed된 `LoanProduct` 25건(seq 900001–900025)으로 `/finance`가 2페이지가 됨.
- Produces: 데스크톱·모바일 두 프로젝트에서 페이지 이동·URL·필터 리셋을 검증.

- [ ] **Step 1: seed에 `seedLoans()` 추가**

`tests/_helpers/seed-e2e.ts`에 함수를 추가 (다른 `seed*` 함수들 옆, 예: `seedSubway` 아래):

```ts
// finance 페이지네이션 e2e용 — PER_PAGE(20) 초과하도록 25건. seq는 e2e 전용 대역.
// e2e DB의 대출상품을 알려진 25건으로 "전량 교체" — 잔여 loanProduct 행이 /finance 카운트를
// 흔들지 않도록(다른 시드/인제스트 테스트가 남긴 행 대비). 로컬 docker(.env.test) 전용이라 안전.
async function seedLoans() {
  await prisma.loanProduct.deleteMany();
  await prisma.loanProduct.createMany({
    data: Array.from({ length: 25 }, (_, i) => ({
      seq: 900001 + i,
      finprdnm: `E2E 대출상품 ${String(i + 1).padStart(2, '0')}`,
      rawJson: {},
    })),
  });
}
```

`main()` 안에서 다른 seed 호출들 근처(`await seedSubway();` 다음 줄)에 호출을 추가:

```ts
  await seedLoans();
```

- [ ] **Step 2: seed 실행으로 데이터 확인**

Run: `pnpm seed:e2e`
Expected: 에러 없이 완료(`e2e seed done. ...` 로그). 로컬 docker DB(.env.test)에 `LoanProduct` 25건 존재.

(선택 확인) Run: `pnpm exec dotenv -e .env.test -- tsx -e "import{prisma}from'./lib/db';prisma.loanProduct.count().then(n=>{console.log('loans=',n);return prisma.\$disconnect()})"`
Expected: `loans= 25`.

- [ ] **Step 3: Write the e2e spec**

Create `tests/e2e/finance-pagination.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

// /finance는 seed된 대출상품 25건(seq 900001~)으로 2페이지가 된다.
// 데스크톱·모바일 두 프로젝트 모두에서: 1페이지 20개 → 다음 페이지 5개 + ?page=2,
// 정렬(필터) 변경 시 page 파라미터 제거 + 1페이지 복귀를 검증한다.
// (데스크톱/모바일 페이저는 각기 다른 '다음 페이지' 버튼을 렌더하지만, 숨겨진 쪽은
//  접근성 트리에서 빠지므로 role 매칭이 뷰포트별로 보이는 버튼 하나만 잡는다.)
test('finance 목록 페이지네이션: 페이지 이동·URL·필터 리셋', async ({ page }) => {
  test.slow(); // dev on-demand 컴파일 여유

  await page.goto('/finance');
  await expect(page.getByRole('heading', { name: '서민금융 대출상품' })).toBeVisible({ timeout: 10_000 });

  // seed 카드만 카운트 (href=/finance/9000xx)
  const cards = page.locator('a[href^="/finance/9000"]');
  await expect(cards).toHaveCount(20);

  const pager = page.getByRole('navigation', { name: '페이지네이션' });
  await expect(pager).toBeVisible();

  // dev 하이드레이션 지연에 대비해 클릭+URL 검증을 재시도.
  await expect(async () => {
    await pager.getByRole('button', { name: '다음 페이지' }).click();
    await expect(page).toHaveURL(/[?&]page=2/, { timeout: 3000 });
  }).toPass({ timeout: 20_000 });

  await expect(cards).toHaveCount(5); // 25 - 20

  // 정렬(필터) 변경 → page 파라미터 제거 + 1페이지 복귀
  await page.getByLabel('정렬').selectOption('limitDesc');
  await expect(page).not.toHaveURL(/[?&]page=/);
  await expect(cards).toHaveCount(20);
});
```

- [ ] **Step 4: Run the e2e spec**

Run: `pnpm exec dotenv -e .env.test -- playwright test tests/e2e/finance-pagination.spec.ts`
Expected: PASS — chromium-desktop·chromium-mobile 두 프로젝트 모두 통과. (webServer가 `pnpm dev`를 자동 기동; 로컬 docker DB가 떠 있고 Step 2 seed가 선행돼야 함.)

- [ ] **Step 5: Commit**

```bash
git add tests/_helpers/seed-e2e.ts tests/e2e/finance-pagination.spec.ts
git commit -m "test(finance): 페이지네이션 e2e (seed 25건 + spec)"
```

---

## Self-Review (작성자 체크 — 완료)

- **Spec coverage:**
  - §4 상태 모델·`paginate` 헬퍼 → Task 1, Task 2/3.
  - §4 단일 URL 쓰기 경로(`writeToUrl(criteria, safePage)`, page>1 기록) → Task 3 Step 2·3.
  - §6.1 마운트 원자 복원(`parsePageParam`) → Task 3 Step 3.
  - §6.2 슬라이스 렌더 → Task 2 Step 3.
  - §6.3 페이지 이동 + 스크롤/포커스 → Task 3 Step 4.
  - §6.4 필터 변경 시 page 리셋(핸들러 한정, 마운트 제외) → Task 2(updateCriteria) + Task 3(마운트 경로 분리).
  - §6.5 클램프 수렴 → Task 3 Step 3.
  - §6.6 노출 조건/빈 결과 → Task 2(Pagination 자체 null 반환, `total===0` 빈상태).
  - §7 접근성(tabIndex=-1 + scrollIntoView+focus) → Task 3 Step 4.
  - §8 테스트 3층(단위·SSR·e2e, jsdom 미도입) → Task 1/2/4.
  - §9 SEO(무변경) → page.tsx·sitemap 건드리지 않음(File Structure Unchanged).
- **Placeholder scan:** TBD/TODO 없음. 모든 코드 스텝에 실제 코드 포함.
- **Type consistency:** `paginate` 반환 `{pageItems,total,totalPages,safePage}`가 Task 2/3에서 동일하게 소비됨. `writeToUrl(criteria, page)` 시그니처가 Task 3에서 일관. `Pagination` props(current=safePage,totalItems=total)가 컴포넌트 계약과 일치. `updateCriteria`/`handlePageChange` 이름이 정의·사용처에서 일치.
