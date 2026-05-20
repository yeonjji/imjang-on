# /list 페이지 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/list` 페이지의 모바일 카드 깨짐 수정, 모바일 필터 접근성 추가, 지역 드릴다운 필터, 정렬 옵션 강화, 페이지네이션 모바일 간소화, 스켈레톤 로딩을 한 번에 개선한다.

**Architecture:** 기존 구조를 유지하면서 수정. `lib/property.ts`에 SortOption·sido 필터 추가 → 새 API 라우트(`/api/regions`) 추가 → UI 컴포넌트 수정·신규 추가 → `list/page.tsx`에서 `Suspense` 경계 + 모바일 필터 버튼 통합. 데이터 페칭은 새 서버 컴포넌트 `PropertyList`로 분리해 `Suspense` fallback이 동작하도록 한다.

**Tech Stack:** Next.js 15 App Router · React 19 · TypeScript · Prisma 5 · Tailwind v4 · vaul(BottomSheet) · Vitest · Playwright

**Spec reference:** `docs/superpowers/specs/2026-05-20-list-page-improvement-design.md`

---

## File Map

| 파일 | 변경 |
|------|------|
| `lib/property.ts` | 수정 — SortOption 2개 추가, PropertyListParams에 `sido` 추가, orderBy 분기 확장 |
| `app/api/regions/route.ts` | 신규 — `?sido=` 쿼리로 시군구 목록 반환 |
| `components/ui/pagination.tsx` | 수정 — 모바일(< md) 이전/페이지수/다음 간소화 |
| `app/(public)/list/_components/list-skeleton.tsx` | 신규 — 카드 모양 스켈레톤 5개 |
| `app/(public)/list/_components/property-list-card.tsx` | 수정 — `grid-cols-1 md:grid-cols-[1fr_200px]` 반응형 |
| `app/(public)/list/_components/list-filter-panel.tsx` | 수정 — `sidoList` prop 추가, 지역 드릴다운 UI, 정렬 2개 추가 |
| `app/(public)/list/_components/mobile-filter-sheet.tsx` | 신규 — 모바일 필터 버튼 + BottomSheet 래퍼 |
| `app/(public)/list/_components/property-list.tsx` | 신규 — getPropertyList를 담당하는 async 서버 컴포넌트 |
| `app/(public)/list/page.tsx` | 수정 — Suspense + PropertyList + MobileFilterSheet + sidoList 페칭 |
| `tests/e2e/list.spec.ts` | 수정 — 정렬·지역·모바일 필터 E2E 추가 |

---

## Task 1: lib/property.ts — SortOption 확장 + sido 필터

**Files:**
- Modify: `lib/property.ts`

- [ ] **Step 1: SortOption 타입에 `price_desc`, `price_asc` 추가**

`lib/property.ts` 29번째 줄을 수정:

```ts
export type SortOption = 'recent' | 'volume' | 'price_desc' | 'price_asc';
```

- [ ] **Step 2: PropertyListParams에 `sido` 추가**

```ts
export interface PropertyListParams {
  types: PropertyType[];
  deal?: DealFilter;
  priceRange?: PriceRange;
  areaRange?: AreaRange;
  sort?: SortOption;
  sigunguCode?: string;
  sido?: string;      // ← 추가: 시도 단위 필터 (시군구 미선택 시 사용)
  page?: number;
  perPage?: number;
}
```

- [ ] **Step 3: getPropertyList 함수에 sido 필터 조건 추가**

`where.sigunguCode = sigunguCode;` 라인(현재 69번째 줄)을 아래로 교체:

```ts
  if (sigunguCode) {
    where.sigunguCode = sigunguCode;
  } else if (sido) {
    where.region = { sido };
  }
```

- [ ] **Step 4: orderBy 분기에 price_desc / price_asc 추가**

`let orderBy: Prisma.PropertyOrderByWithRelationInput;` 아래 if-else 블록 전체를 아래로 교체:

```ts
  let orderBy: Prisma.PropertyOrderByWithRelationInput;

  if (sort === 'price_desc' || sort === 'price_asc') {
    const direction = sort === 'price_desc' ? ('desc' as const) : ('asc' as const);
    if (deal === 'jeonse') {
      orderBy = { jeonseLastDeposit: { sort: direction, nulls: 'last' } };
    } else if (deal === 'wolse') {
      orderBy = { wolseLastDeposit: { sort: direction, nulls: 'last' } };
    } else {
      orderBy = { saleLastPrice: { sort: direction, nulls: 'last' } };
    }
  } else if (deal === 'sale') {
    orderBy = sort === 'volume' ? { saleCount12m: 'desc' } : { saleLastAt: 'desc' };
  } else if (deal === 'jeonse') {
    orderBy = sort === 'volume' ? { jeonseCount12m: 'desc' } : { jeonseLastAt: 'desc' };
  } else if (deal === 'wolse') {
    orderBy = sort === 'volume' ? { wolseCount12m: 'desc' } : { wolseLastAt: 'desc' };
  } else {
    orderBy = sort === 'volume' ? { txCount12m: 'desc' } : { lastTxAt: 'desc' };
  }
```

- [ ] **Step 5: typecheck 통과 확인**

```bash
pnpm typecheck
```

Expected: 에러 없음

- [ ] **Step 6: Commit**

```bash
git add lib/property.ts
git commit -m "feat(list): SortOption price_desc/price_asc 추가 + sido 단위 region 필터"
```

---

## Task 2: app/api/regions/route.ts — 시군구 조회 API

**Files:**
- Create: `app/api/regions/route.ts`

- [ ] **Step 1: 파일 생성**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSigungusBySido } from '@/lib/region';

export async function GET(request: NextRequest) {
  const sido = request.nextUrl.searchParams.get('sido');
  if (!sido) return NextResponse.json([]);
  const list = await getSigungusBySido(sido);
  return NextResponse.json(list);
}
```

- [ ] **Step 2: dev 서버에서 동작 확인**

```bash
curl "http://localhost:3000/api/regions?sido=서울특별시" | head -c 200
```

Expected: `[{"code":"...","sigungu":"강남구",...}` 형태의 JSON 배열

- [ ] **Step 3: Commit**

```bash
git add app/api/regions/route.ts
git commit -m "feat(api): /api/regions 시군구 조회 엔드포인트 추가"
```

---

## Task 3: components/ui/pagination.tsx — 모바일 간소화

**Files:**
- Modify: `components/ui/pagination.tsx`

- [ ] **Step 1: return 블록 전체 교체**

`Pagination` 컴포넌트의 return문을 아래로 교체:

```tsx
  return (
    <div className="py-3">
      {/* 모바일: 이전 / 페이지수 / 다음 */}
      <div className="flex md:hidden items-center justify-between w-full">
        <IconBtn label="prev" onClick={() => onChange(current - 1)} disabled={disabled || current === 1}>
          <ChevronLeft size={16} />
        </IconBtn>
        <span className="text-sm font-semibold text-[var(--color-blue-dark)]">
          {current} / {totalPages}
        </span>
        <IconBtn label="next" onClick={() => onChange(current + 1)} disabled={disabled || current === totalPages}>
          <ChevronRight size={16} />
        </IconBtn>
      </div>

      {/* 데스크톱: 기존 전체 */}
      <div className="hidden md:flex items-center justify-between gap-3">
        <nav className="flex items-center gap-1" aria-label="pagination">
          <IconBtn label="first" onClick={() => onChange(1)} disabled={disabled || current === 1}>
            <ChevronsLeft size={14} />
          </IconBtn>
          <IconBtn label="prev" onClick={() => onChange(current - 1)} disabled={disabled || current === 1}>
            <ChevronLeft size={14} />
          </IconBtn>
          {window.map((p, i) =>
            p === '…' ? (
              <span key={`g${i}`} className="px-2 text-sm text-[var(--color-muted)]">…</span>
            ) : (
              <button
                key={p}
                onClick={() => onChange(p)}
                disabled={disabled}
                aria-current={p === current ? 'page' : undefined}
                className={cn(
                  'min-w-[32px] rounded-lg px-2.5 py-1 text-sm font-semibold',
                  p === current
                    ? 'bg-[var(--color-blue)] text-white'
                    : 'text-[var(--color-muted)] hover:bg-[var(--color-soft)]',
                )}
              >
                {p}
              </button>
            ),
          )}
          <IconBtn label="next" onClick={() => onChange(current + 1)} disabled={disabled || current === totalPages}>
            <ChevronRight size={14} />
          </IconBtn>
          <IconBtn label="last" onClick={() => onChange(totalPages)} disabled={disabled || current === totalPages}>
            <ChevronsRight size={14} />
          </IconBtn>
        </nav>
        <span className="text-xs text-[var(--color-muted)]">
          {totalItems}건 중 {start}–{end} 표시
        </span>
      </div>
    </div>
  );
```

- [ ] **Step 2: typecheck 통과 확인**

```bash
pnpm typecheck
```

Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add components/ui/pagination.tsx
git commit -m "feat(ui): pagination 모바일 간소화 (이전/페이지수/다음)"
```

---

## Task 4: list-skeleton.tsx — 스켈레톤 신규

**Files:**
- Create: `app/(public)/list/_components/list-skeleton.tsx`

- [ ] **Step 1: 파일 생성**

```tsx
export function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-[22px] border border-[var(--color-line)] bg-white px-6 py-5 shadow-[var(--shadow)]"
        >
          <div className="flex flex-col gap-3">
            <div className="h-5 w-16 rounded-lg bg-[var(--color-soft)]" />
            <div className="h-6 w-48 rounded-lg bg-[var(--color-soft)]" />
            <div className="h-4 w-64 rounded-lg bg-[var(--color-soft)]" />
            <div className="grid grid-cols-3 gap-3">
              <div className="h-14 rounded-[14px] bg-[var(--color-soft)]" />
              <div className="h-14 rounded-[14px] bg-[var(--color-soft)]" />
              <div className="h-14 rounded-[14px] bg-[var(--color-soft)]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: typecheck 통과 확인**

```bash
pnpm typecheck
```

Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add app/(public)/list/_components/list-skeleton.tsx
git commit -m "feat(list): ListSkeleton 스켈레톤 컴포넌트 추가"
```

---

## Task 5: property-list-card.tsx — 모바일 반응형

**Files:**
- Modify: `app/(public)/list/_components/property-list-card.tsx`

- [ ] **Step 1: article 태그 className 수정**

```tsx
<article className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-4 md:gap-6 items-start md:items-center rounded-[22px] border border-[var(--color-line)] bg-white px-6 py-5 shadow-[var(--shadow)] transition hover:shadow-lg">
```

- [ ] **Step 2: 오른쪽 요약 박스 모바일 레이아웃 수정**

```tsx
{/* 오른쪽 요약 박스 */}
<div className="rounded-[18px] bg-[#eff6ff] px-4 py-3 text-sm text-[var(--color-muted)] leading-relaxed flex flex-row md:flex-col items-center md:items-start justify-between md:justify-center gap-2 md:gap-1 md:self-stretch">
  <p className="font-semibold text-[var(--color-blue-dark)] whitespace-nowrap">12개월 거래 {p.txCount12m}건</p>
  <div className="flex flex-row md:flex-col gap-3 md:gap-0">
    {p.saleCount12m > 0 && <p>매매 {p.saleCount12m}건</p>}
    {p.jeonseCount12m > 0 && <p>전세 {p.jeonseCount12m}건</p>}
    {p.wolseCount12m > 0 && <p>월세 {p.wolseCount12m}건</p>}
  </div>
</div>
```

- [ ] **Step 3: typecheck 통과 확인**

```bash
pnpm typecheck
```

Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add app/(public)/list/_components/property-list-card.tsx
git commit -m "fix(list): 모바일 카드 grid-cols-1 반응형 수정"
```

---

## Task 6: list-filter-panel.tsx — 지역 드릴다운 + 정렬 확장

**Files:**
- Modify: `app/(public)/list/_components/list-filter-panel.tsx`

- [ ] **Step 1: 파일 전체 교체**

```tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Chip } from '@/components/ui/chip';
import { Button } from '@/components/ui/button';

interface SidoItem {
  code: string;
  sido: string;
  fullName: string;
}

interface SigunguItem {
  code: string;
  sigungu: string;
  fullName: string;
  sigunguCode: string;
}

interface Props {
  sidoList: SidoItem[];
}

export function ListFilterPanel({ sidoList }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const type = searchParams.get('type') ?? 'all';
  const deal = searchParams.get('deal') ?? 'all';
  const price = searchParams.get('price') ?? null;
  const area = searchParams.get('area') ?? null;
  const sort = searchParams.get('sort') ?? 'recent';
  const region = searchParams.get('region') ?? null;
  const sido = searchParams.get('sido') ?? null;

  const [sigunguList, setSigunguList] = useState<SigunguItem[]>([]);

  useEffect(() => {
    if (!sido) { setSigunguList([]); return; }
    fetch(`/api/regions?sido=${encodeURIComponent(sido)}`)
      .then((r) => r.json())
      .then((data: SigunguItem[]) => setSigunguList(data));
  }, [sido]);

  const hasActiveFilters =
    type !== 'all' || deal !== 'all' || !!price || !!area || sort !== 'recent' || !!region || !!sido;

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    params.delete('page');
    router.push(`/list?${params.toString()}`);
  }

  const priceLabel =
    deal === 'jeonse' ? '전세 보증금 기준'
    : deal === 'wolse' ? '월세 보증금 기준'
    : '매매가 기준';

  return (
    <div className="flex flex-col gap-6">
      {/* 주거유형 */}
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">주거유형</h3>
        <div className="flex flex-wrap gap-2 mt-2">
          <Chip active={type === 'all'} onClick={() => updateParams({ type: 'all' })}>전체</Chip>
          <Chip active={type === 'apt'} onClick={() => updateParams({ type: type === 'apt' ? 'all' : 'apt' })}>아파트</Chip>
          <Chip active={type === 'officetel'} onClick={() => updateParams({ type: type === 'officetel' ? 'all' : 'officetel' })}>오피스텔</Chip>
          <Chip active={type === 'villa'} onClick={() => updateParams({ type: type === 'villa' ? 'all' : 'villa' })}>다세대</Chip>
        </div>
      </section>

      {/* 거래유형 */}
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">거래유형</h3>
        <div className="flex flex-wrap gap-2 mt-2">
          <Chip active={deal === 'all'} onClick={() => updateParams({ deal: 'all' })}>전체</Chip>
          <Chip active={deal === 'sale'} onClick={() => updateParams({ deal: deal === 'sale' ? 'all' : 'sale' })}>매매</Chip>
          <Chip active={deal === 'jeonse'} onClick={() => updateParams({ deal: deal === 'jeonse' ? 'all' : 'jeonse' })}>전세</Chip>
          <Chip active={deal === 'wolse'} onClick={() => updateParams({ deal: deal === 'wolse' ? 'all' : 'wolse' })}>월세</Chip>
        </div>
      </section>

      {/* 지역 */}
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">지역</h3>
        <div className="flex flex-col gap-2 mt-2">
          <select
            value={sido ?? ''}
            onChange={(e) =>
              updateParams({ sido: e.target.value || null, region: null })
            }
            className="w-full rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-blue-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue)]"
          >
            <option value="">시도 전체</option>
            {sidoList.map((s) => (
              <option key={s.code} value={s.sido}>{s.fullName}</option>
            ))}
          </select>
          {sigunguList.length > 0 && (
            <select
              value={region ?? ''}
              onChange={(e) =>
                updateParams({ region: e.target.value || null })
              }
              className="w-full rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-blue-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue)]"
            >
              <option value="">시군구 전체</option>
              {sigunguList.map((sg) => (
                <option key={sg.code} value={sg.sigunguCode}>{sg.sigungu}</option>
              ))}
            </select>
          )}
        </div>
      </section>

      {/* 가격대 */}
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">
          가격대<span className="ml-1 text-xs text-[var(--color-muted)]">{priceLabel}</span>
        </h3>
        <div className="flex flex-wrap gap-2 mt-2">
          <Chip active={price === 'lt5'} onClick={() => updateParams({ price: price === 'lt5' ? null : 'lt5' })}>5억 이하</Chip>
          <Chip active={price === '5to10'} onClick={() => updateParams({ price: price === '5to10' ? null : '5to10' })}>5~10억</Chip>
          <Chip active={price === '10to15'} onClick={() => updateParams({ price: price === '10to15' ? null : '10to15' })}>10~15억</Chip>
          <Chip active={price === 'gt15'} onClick={() => updateParams({ price: price === 'gt15' ? null : 'gt15' })}>15억 이상</Chip>
        </div>
      </section>

      {/* 면적 */}
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">면적</h3>
        <div className="flex flex-wrap gap-2 mt-2">
          <Chip active={area === 'small'} onClick={() => updateParams({ area: area === 'small' ? null : 'small' })}>~59㎡</Chip>
          <Chip active={area === 'medium'} onClick={() => updateParams({ area: area === 'medium' ? null : 'medium' })}>60~84㎡</Chip>
          <Chip active={area === 'large'} onClick={() => updateParams({ area: area === 'large' ? null : 'large' })}>85~114㎡</Chip>
          <Chip active={area === 'xlarge'} onClick={() => updateParams({ area: area === 'xlarge' ? null : 'xlarge' })}>115㎡~</Chip>
        </div>
      </section>

      {/* 정렬 */}
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">정렬</h3>
        <div className="flex flex-wrap gap-2 mt-2">
          <Chip active={sort === 'recent'} onClick={() => updateParams({ sort: 'recent' })}>최신거래순</Chip>
          <Chip active={sort === 'volume'} onClick={() => updateParams({ sort: 'volume' })}>거래많은순</Chip>
          <Chip active={sort === 'price_desc'} onClick={() => updateParams({ sort: 'price_desc' })}>가격 높은순</Chip>
          <Chip active={sort === 'price_asc'} onClick={() => updateParams({ sort: 'price_asc' })}>가격 낮은순</Chip>
        </div>
      </section>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={() => router.push('/list')}>
          필터 초기화
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: typecheck 통과 확인**

```bash
pnpm typecheck
```

Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add app/(public)/list/_components/list-filter-panel.tsx
git commit -m "feat(list): 지역 드릴다운 필터 + 가격 높은순/낮은순 정렬 추가"
```

---

## Task 7: mobile-filter-sheet.tsx — 모바일 바텀시트 신규

**Files:**
- Create: `app/(public)/list/_components/mobile-filter-sheet.tsx`

- [ ] **Step 1: 파일 생성**

```tsx
'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { ListFilterPanel } from './list-filter-panel';

interface SidoItem {
  code: string;
  sido: string;
  fullName: string;
}

interface Props {
  sidoList: SidoItem[];
}

export function MobileFilterSheet({ sidoList }: Props) {
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();

  const activeCount = [
    (searchParams.get('type') ?? 'all') !== 'all',
    (searchParams.get('deal') ?? 'all') !== 'all',
    !!searchParams.get('price'),
    !!searchParams.get('area'),
    (searchParams.get('sort') ?? 'recent') !== 'recent',
    !!searchParams.get('region'),
    !!searchParams.get('sido'),
  ].filter(Boolean).length;

  return (
    <div className="flex md:hidden items-center gap-2 mb-4">
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl bg-[var(--color-blue-dark)] px-4 py-2 text-sm font-semibold text-white"
      >
        필터
        {activeCount > 0 && (
          <span className="rounded-full bg-white px-1.5 py-0.5 text-xs font-bold leading-none text-[var(--color-blue-dark)]">
            {activeCount}
          </span>
        )}
      </button>
      <BottomSheet open={open} onOpenChange={setOpen} title="필터">
        <ListFilterPanel sidoList={sidoList} />
      </BottomSheet>
    </div>
  );
}
```

- [ ] **Step 2: typecheck 통과 확인**

```bash
pnpm typecheck
```

Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add app/(public)/list/_components/mobile-filter-sheet.tsx
git commit -m "feat(list): MobileFilterSheet 모바일 바텀시트 필터 추가"
```

---

## Task 8: property-list.tsx — 서버 컴포넌트 분리 (Suspense 용)

**Files:**
- Create: `app/(public)/list/_components/property-list.tsx`

- [ ] **Step 1: 파일 생성**

현재 `list/page.tsx`에서 `getPropertyList` 호출과 카드 목록 렌더링을 이 컴포넌트로 분리한다.

```tsx
import { PropertyType } from '@prisma/client';
import { getPropertyList } from '@/lib/property';
import type { DealFilter, PriceRange, AreaRange, SortOption } from '@/lib/property';
import { PropertyListCard } from './property-list-card';
import { PaginationNav } from './pagination-nav';

interface Props {
  types: PropertyType[];
  deal: DealFilter;
  priceRange?: PriceRange;
  areaRange?: AreaRange;
  sort: SortOption;
  sigunguCode?: string;
  sido?: string;
  page: number;
}

export async function PropertyList({
  types,
  deal,
  priceRange,
  areaRange,
  sort,
  sigunguCode,
  sido,
  page,
}: Props) {
  const { rows, total, totalPages, perPage } = await getPropertyList({
    types,
    deal,
    priceRange,
    areaRange,
    sort,
    sigunguCode,
    sido,
    page,
    perPage: 30,
  });

  return (
    <>
      {/* 결과 건수 */}
      <div className="mb-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-3 shadow-[var(--shadow)]">
        <p className="text-base font-bold text-[var(--color-blue-dark)]">
          검색 결과 <span className="text-[var(--color-blue)]">{total.toLocaleString('ko-KR')}</span>건
        </p>
      </div>

      {/* 카드 목록 */}
      {rows.length === 0 ? (
        <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">
          조건에 맞는 매물이 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((p) => (
            <PropertyListCard key={String(p.id)} property={p} deal={deal} />
          ))}
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="mt-6">
          <PaginationNav
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

- [ ] **Step 2: typecheck 통과 확인**

```bash
pnpm typecheck
```

Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add app/(public)/list/_components/property-list.tsx
git commit -m "refactor(list): PropertyList 서버 컴포넌트 분리 (Suspense 경계 준비)"
```

---

## Task 9: list/page.tsx — 통합 (Suspense + MobileFilterSheet + sidoList)

**Files:**
- Modify: `app/(public)/list/page.tsx`

- [ ] **Step 1: 파일 전체 교체**

```tsx
import Link from 'next/link';
import { Suspense } from 'react';
import { PropertyType } from '@prisma/client';
import { ListFilterPanel } from './_components/list-filter-panel';
import { MobileFilterSheet } from './_components/mobile-filter-sheet';
import { PropertyList } from './_components/property-list';
import { ListSkeleton } from './_components/list-skeleton';
import { getSidoList } from '@/lib/region';
import type { DealFilter, PriceRange, AreaRange, SortOption } from '@/lib/property';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '부동산 실거래가 검색',
  description: '유형·지역·가격으로 필터링한 부동산 실거래가 결과',
  robots: { index: false, follow: true },
  alternates: { canonical: '/list' },
};

const TYPE_MAP: Record<string, PropertyType[]> = {
  apt: [PropertyType.APARTMENT],
  officetel: [PropertyType.OFFICETEL],
  villa: [PropertyType.ROW_HOUSE, PropertyType.MULTIPLEX],
  all: [PropertyType.APARTMENT, PropertyType.OFFICETEL, PropertyType.ROW_HOUSE, PropertyType.MULTIPLEX],
};

interface SearchParams {
  type?: string;
  deal?: string;
  price?: string;
  area?: string;
  sort?: string;
  region?: string;
  sido?: string;
  page?: string;
}

export const revalidate = 60;

export default async function ListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [sp, sidoList] = await Promise.all([searchParams, getSidoList()]);

  const typeSlug = sp.type ?? 'all';
  const types = TYPE_MAP[typeSlug] ?? TYPE_MAP.all;
  const deal = (sp.deal ?? 'all') as DealFilter;
  const priceRange = sp.price as PriceRange | undefined;
  const areaRange = sp.area as AreaRange | undefined;
  const sort = (sp.sort ?? 'recent') as SortOption;
  const page = Math.max(1, Number(sp.page ?? '1'));

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      {/* breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link>
        <span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">실거래가 목록</span>
      </nav>

      {/* 상단 헤더 카드 */}
      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow)]">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">부동산 통합 검색</p>
        <h1 className="text-3xl font-black tracking-tight text-[var(--color-blue-dark)]">실거래가 목록</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          아파트, 오피스텔, 다세대의 매매·전세·월세 실거래가를 한 번에 확인하세요.
        </p>
      </div>

      {/* 모바일 필터 버튼 */}
      <Suspense>
        <MobileFilterSheet sidoList={sidoList} />
      </Suspense>

      {/* 2컬럼 */}
      <div className="flex gap-6 items-start">
        {/* 사이드바 280px */}
        <aside className="hidden md:block w-[280px] shrink-0 sticky top-[88px]">
          <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow)]">
            <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-[var(--color-soft)]" />}>
              <ListFilterPanel sidoList={sidoList} />
            </Suspense>
          </div>
          <div className="mt-4 rounded-[22px] border border-dashed border-[#93c5fd] bg-white/65 p-5 text-center text-xs text-[var(--color-muted)]">
            광고 영역
          </div>
        </aside>

        {/* 메인 영역 */}
        <main className="min-w-0 flex-1">
          <Suspense fallback={<ListSkeleton />}>
            <PropertyList
              types={types}
              deal={deal}
              priceRange={priceRange}
              areaRange={areaRange}
              sort={sort}
              sigunguCode={sp.region}
              sido={sp.sido}
              page={page}
            />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: typecheck + 빌드 확인**

```bash
pnpm typecheck && pnpm build 2>&1 | tail -20
```

Expected: 에러 없음, 빌드 성공

- [ ] **Step 3: Commit**

```bash
git add app/(public)/list/page.tsx
git commit -m "feat(list): Suspense 스켈레톤 + MobileFilterSheet + sido 파라미터 통합"
```

---

## Task 10: tests/e2e/list.spec.ts — E2E 테스트 확장

**Files:**
- Modify: `tests/e2e/list.spec.ts`

- [ ] **Step 1: 파일 전체 교체**

```ts
import { test, expect } from '@playwright/test';

test('list filter page renders results', async ({ page }) => {
  await page.goto('/list?type=apt');
  await expect(page.getByText(/건 발견|검색 결과/)).toBeVisible();
});

test('정렬: 가격 높은순 칩 클릭 시 URL에 sort=price_desc 반영', async ({ page }) => {
  await page.goto('/list');
  // 데스크톱 사이드바 필터에서 정렬 선택
  await page.getByText('가격 높은순').first().click();
  await expect(page).toHaveURL(/sort=price_desc/);
});

test('정렬: 가격 낮은순 칩 클릭 시 URL에 sort=price_asc 반영', async ({ page }) => {
  await page.goto('/list');
  await page.getByText('가격 낮은순').first().click();
  await expect(page).toHaveURL(/sort=price_asc/);
});

test('지역 필터: 시도 선택 시 URL에 sido 파라미터 반영', async ({ page }) => {
  await page.goto('/list');
  const sidoSelect = page.locator('select').first();
  await sidoSelect.selectOption({ label: /서울/ });
  await expect(page).toHaveURL(/sido=/);
});

test('모바일: 필터 버튼 노출 + 클릭 시 바텀시트 열림', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/list');
  const filterBtn = page.getByRole('button', { name: /필터/ });
  await expect(filterBtn).toBeVisible();
  await filterBtn.click();
  // 바텀시트 내부 필터 항목 노출 확인
  await expect(page.getByText('주거유형')).toBeVisible();
});

test('모바일: 카드 가로 스크롤 없음 (375px)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/list?type=apt');
  const body = page.locator('body');
  const scrollWidth = await body.evaluate((el) => el.scrollWidth);
  const clientWidth = await body.evaluate((el) => el.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
});

test('모바일 페이지네이션: 이전/다음 버튼만 노출', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/list?page=2');
  await expect(page.getByRole('button', { name: 'prev' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'next' })).toBeVisible();
});
```

- [ ] **Step 2: E2E 테스트 실행**

```bash
pnpm test:e2e --grep "list" 2>&1 | tail -30
```

Expected: 모든 테스트 PASS (dev 서버 실행 중 상태에서)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/list.spec.ts
git commit -m "test(e2e): /list 페이지 개선 E2E 테스트 추가"
```
