# List 페이지 필터 UX 개선 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** /list 페이지 사이드바 독립 스크롤 버그 수정, Nav 지역 메뉴 제거, 데스크톱 가격 범위 슬라이더 추가

**Architecture:** `lib/property.ts`의 `PriceRange` 문자열 타입을 `priceMin`/`priceMax` 숫자(만원 단위)로 교체하고, 데스크톱 전용 `PriceRangeSlider` 컴포넌트를 신규 생성하여 `list-filter-panel`에 통합한다. 모바일은 기존 칩 UI를 유지하되 동일한 파라미터 형식을 사용한다.

**Tech Stack:** Next.js 14 App Router, React Client Components, Prisma (BigInt), Tailwind CSS, Vitest, native `<input type="range">`

---

### Task 1: Nav "지역" 메뉴 제거

**Files:**
- Modify: `app/(public)/_components/nav.tsx`

- [ ] **Step 1: 지역 링크 제거**

`app/(public)/_components/nav.tsx`에서 아래 줄 삭제:

```tsx
<Link href="/region">지역</Link>
```

- [ ] **Step 2: 커밋**

```bash
git add app/(public)/_components/nav.tsx
git commit -m "fix: Nav 지역 메뉴 제거 (404 링크)"
```

---

### Task 2: 사이드바 독립 스크롤

**Files:**
- Modify: `app/(public)/list/page.tsx`

- [ ] **Step 1: aside 내부 div에 max-h + overflow-y-auto 추가**

`app/(public)/list/page.tsx`의 aside 내부 흰 카드 div 수정:

```tsx
// 변경 전
<div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow)]">

// 변경 후
<div className="max-h-[calc(100vh-104px)] overflow-y-auto rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow)]">
```

- [ ] **Step 2: 커밋**

```bash
git add app/(public)/list/page.tsx
git commit -m "fix(list): 사이드바 독립 스크롤 (max-h + overflow-y-auto)"
```

---

### Task 3: lib/property.ts 가격 파라미터 변경

**Files:**
- Modify: `lib/property.ts`
- Create: `tests/lib/property-price-filter.test.ts`

**배경:** 현재 DB 컬럼(saleAvgPrice12m 등)은 원(won) 단위 BigInt. 슬라이더 파라미터는 만원 단위 정수. 변환식: `만원 × 10,000 = 원`.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/property-price-filter.test.ts` 생성:

```typescript
import { describe, it, expect } from 'vitest';
import { buildPriceCondition } from '@/lib/property';

describe('buildPriceCondition', () => {
  it('priceMin/priceMax 미지정 시 undefined 반환', () => {
    expect(buildPriceCondition(undefined, undefined)).toBeUndefined();
  });

  it('priceMin만 지정 시 gte 조건 반환 (만원 → 원 변환)', () => {
    const result = buildPriceCondition(50_000, undefined);
    expect(result).toEqual({ gte: BigInt(500_000_000) });
  });

  it('priceMax만 지정 시 lte 조건 반환', () => {
    const result = buildPriceCondition(undefined, 100_000);
    expect(result).toEqual({ lte: BigInt(1_000_000_000) });
  });

  it('priceMin=0은 gte 조건 없이 처리 (전체 최솟값)', () => {
    const result = buildPriceCondition(0, 50_000);
    expect(result).toEqual({ lte: BigInt(500_000_000) });
  });

  it('priceMin + priceMax 둘 다 있으면 range 반환', () => {
    const result = buildPriceCondition(50_000, 100_000);
    expect(result).toEqual({
      gte: BigInt(500_000_000),
      lte: BigInt(1_000_000_000),
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pnpm test:unit
```

Expected: `buildPriceCondition` is not exported 에러로 FAIL

- [ ] **Step 3: lib/property.ts 수정**

`lib/property.ts`에서 세 곳을 수정:

**[1] `PriceRange` 타입 라인(27번) 삭제:**
```typescript
// 삭제
export type PriceRange = 'lt5' | '5to10' | '10to15' | 'gt15';
```

**[2] `PropertyListParams` 인터페이스에서 `priceRange` → `priceMin`/`priceMax`로 교체:**
```typescript
export interface PropertyListParams {
  types: PropertyType[];
  deal?: DealFilter;
  priceMin?: number;  // 만원 단위
  priceMax?: number;  // 만원 단위
  areaRange?: AreaRange;
  sort?: SortOption;
  sigunguCode?: string;
  sido?: string;
  page?: number;
  perPage?: number;
}
```

**[3] `rangeArray` 함수 위에 `buildPriceCondition` 헬퍼 추가:**
```typescript
export function buildPriceCondition(
  priceMin: number | undefined,
  priceMax: number | undefined,
): Prisma.BigIntFilter | undefined {
  if (priceMin === undefined && priceMax === undefined) return undefined;
  const cond: Prisma.BigIntFilter = {};
  if (priceMin !== undefined && priceMin > 0) {
    cond.gte = BigInt(priceMin) * BigInt(10_000);
  }
  if (priceMax !== undefined) {
    cond.lte = BigInt(priceMax) * BigInt(10_000);
  }
  return cond;
}
```

**[4] `getPropertyList` 시그니처에서 `priceRange` → `priceMin`, `priceMax`:**
```typescript
export async function getPropertyList({
  types,
  deal = 'all',
  priceMin,
  priceMax,
  areaRange,
  sort = 'recent',
  sigunguCode,
  sido,
  page = 1,
  perPage = 30,
}: PropertyListParams) {
```

**[5] 함수 내부 `priceRange` 블록(77-95번 라인) 교체:**
```typescript
// 기존 블록 삭제 후 아래로 교체
const priceCond = buildPriceCondition(priceMin, priceMax);
if (priceCond) {
  if (deal === 'jeonse') {
    where.jeonseAvgDeposit12m = priceCond;
  } else if (deal === 'wolse') {
    where.wolseAvgDeposit12m = priceCond;
  } else {
    where.saleAvgPrice12m = priceCond;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm test:unit
```

Expected: 전체 PASS (기존 + 신규 5개)

- [ ] **Step 5: 커밋**

```bash
git add lib/property.ts tests/lib/property-price-filter.test.ts
git commit -m "refactor(property): PriceRange → priceMin/priceMax (만원 단위) 교체"
```

---

### Task 4: PropertyList + list/page.tsx 파라미터 연결

**Files:**
- Modify: `app/(public)/list/_components/property-list.tsx`
- Modify: `app/(public)/list/page.tsx`

- [ ] **Step 1: PropertyList props 변경**

`app/(public)/list/_components/property-list.tsx` 전체 교체:

```tsx
import type { PropertyType } from '@prisma/client';
import { getPropertyList } from '@/lib/property';
import type { DealFilter, AreaRange, SortOption } from '@/lib/property';
import { PropertyListCard } from './property-list-card';
import { PaginationNav } from './pagination-nav';

interface Props {
  types: PropertyType[];
  deal: DealFilter;
  priceMin?: number;
  priceMax?: number;
  areaRange?: AreaRange;
  sort: SortOption;
  sigunguCode?: string;
  sido?: string;
  page: number;
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
  page,
}: Props) {
  const { rows, total, totalPages, perPage } = await getPropertyList({
    types,
    deal,
    priceMin,
    priceMax,
    areaRange,
    sort,
    sigunguCode,
    sido,
    page,
    perPage: 30,
  });

  return (
    <>
      <div className="mb-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-3 shadow-[var(--shadow)]">
        <p className="text-base font-bold text-[var(--color-blue-dark)]">
          검색 결과 <span className="text-[var(--color-blue)]">{total.toLocaleString('ko-KR')}</span>건
        </p>
      </div>

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

- [ ] **Step 2: list/page.tsx SearchParams + import 수정**

`app/(public)/list/page.tsx`에서:

**[1] import에서 `PriceRange` 제거:**
```tsx
import type { DealFilter, AreaRange, SortOption } from '@/lib/property';
```

**[2] `SearchParams` 인터페이스 교체:**
```tsx
interface SearchParams {
  type?: string;
  deal?: string;
  price_min?: string;
  price_max?: string;
  area?: string;
  sort?: string;
  region?: string;
  sido?: string;
  page?: string;
}
```

**[3] 파싱 로직 교체 (`const priceRange = ...` 라인):**
```tsx
const priceMin = sp.price_min ? Number(sp.price_min) : undefined;
const priceMax = sp.price_max ? Number(sp.price_max) : undefined;
```

**[4] `<PropertyList>` props 교체:**
```tsx
<PropertyList
  types={types}
  deal={deal}
  priceMin={priceMin}
  priceMax={priceMax}
  areaRange={areaRange}
  sort={sort}
  sigunguCode={sp.region}
  sido={sp.sido}
  page={page}
/>
```

- [ ] **Step 3: 타입 에러 없는지 확인**

```bash
pnpm tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: 출력 없음 (에러 없음)

- [ ] **Step 4: 커밋**

```bash
git add app/(public)/list/_components/property-list.tsx app/(public)/list/page.tsx
git commit -m "refactor(list): priceRange → priceMin/priceMax props 연결"
```

---

### Task 5: PriceRangeSlider 컴포넌트 생성

**Files:**
- Create: `app/(public)/list/_components/price-range-slider.tsx`

- [ ] **Step 1: 컴포넌트 생성**

`app/(public)/list/_components/price-range-slider.tsx` 신규 생성:

```tsx
'use client';

import { useState, useEffect } from 'react';

interface Props {
  min: number;
  max: number;
  step: number;
  valueMin: number;
  valueMax: number;
  onChange: (min: number, max: number) => void;
}

function formatManwon(v: number): string {
  if (v === 0) return '0원';
  if (v % 10_000 === 0) return `${v / 10_000}억`;
  if (v >= 10_000) return `${(v / 10_000).toFixed(1)}억`;
  if (v % 1_000 === 0) return `${v / 1_000}천만`;
  return `${v}만`;
}

const THUMB_STYLE =
  'pointer-events-none absolute inset-0 h-full w-full appearance-none bg-transparent ' +
  '[&::-webkit-slider-thumb]:pointer-events-auto ' +
  '[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 ' +
  '[&::-webkit-slider-thumb]:cursor-pointer ' +
  '[&::-webkit-slider-thumb]:appearance-none ' +
  '[&::-webkit-slider-thumb]:rounded-full ' +
  '[&::-webkit-slider-thumb]:bg-white ' +
  '[&::-webkit-slider-thumb]:shadow-md ' +
  '[&::-webkit-slider-thumb]:ring-2 ' +
  '[&::-webkit-slider-thumb]:ring-[var(--color-blue)]';

export function PriceRangeSlider({ min, max, step, valueMin, valueMax, onChange }: Props) {
  const [localMin, setLocalMin] = useState(valueMin);
  const [localMax, setLocalMax] = useState(valueMax);

  useEffect(() => { setLocalMin(valueMin); }, [valueMin]);
  useEffect(() => { setLocalMax(valueMax); }, [valueMax]);

  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const leftPct = pct(localMin);
  const widthPct = pct(localMax) - leftPct;
  const isDefault = localMin === min && localMax === max;
  const rangeLabel = isDefault ? '전체' : `${formatManwon(localMin)} ~ ${formatManwon(localMax)}`;

  function commit() {
    onChange(localMin, localMax);
  }

  return (
    <div className="hidden md:block space-y-3">
      <div className="flex justify-between text-xs text-[var(--color-muted)]">
        <span>{formatManwon(min)}</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">{rangeLabel}</span>
        <span>{formatManwon(max)}</span>
      </div>

      <div className="relative h-5">
        {/* 배경 트랙 */}
        <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-[var(--color-soft)]" />
        {/* 선택 구간 강조 */}
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--color-blue)]"
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        />
        {/* 최솟값 핸들 */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={localMin}
          onChange={(e) => setLocalMin(Math.min(Number(e.target.value), localMax - step))}
          onMouseUp={commit}
          onTouchEnd={commit}
          className={THUMB_STYLE}
        />
        {/* 최댓값 핸들 */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={localMax}
          onChange={(e) => setLocalMax(Math.max(Number(e.target.value), localMin + step))}
          onMouseUp={commit}
          onTouchEnd={commit}
          className={THUMB_STYLE}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

```bash
pnpm tsc --noEmit 2>&1 | grep "price-range-slider"
```

Expected: 출력 없음

- [ ] **Step 3: 커밋**

```bash
git add app/(public)/list/_components/price-range-slider.tsx
git commit -m "feat(list): PriceRangeSlider 컴포넌트 추가 (데스크톱 두 핸들)"
```

---

### Task 6: list-filter-panel.tsx 가격 섹션 교체

**Files:**
- Modify: `app/(public)/list/_components/list-filter-panel.tsx`

- [ ] **Step 1: import + 상태 변수 수정**

파일 상단 import에 추가:
```tsx
import { PriceRangeSlider } from './price-range-slider';
```

`const price = searchParams.get('price') ?? null;` 라인을 아래로 교체:
```tsx
const priceMin = searchParams.get('price_min');
const priceMax = searchParams.get('price_max');

const DEAL_SLIDER: Record<string, { max: number; step: number }> = {
  sale:   { max: 200_000, step: 10_000 },
  jeonse: { max: 100_000, step:  5_000 },
  wolse:  { max:  20_000, step:  1_000 },
  all:    { max: 200_000, step: 10_000 },
};
const slider = DEAL_SLIDER[deal] ?? DEAL_SLIDER.all;
const sliderMin = 0;
const sliderMax = slider.max;
const sliderStep = slider.step;
const sliderValMin = Math.min(priceMin ? Number(priceMin) : sliderMin, sliderMax);
const sliderValMax = Math.min(priceMax ? Number(priceMax) : sliderMax, sliderMax);
```

- [ ] **Step 2: hasActiveFilters 수정**

```tsx
// 변경 전
const hasActiveFilters =
  type !== 'all' || deal !== 'all' || !!price || !!area || sort !== 'recent' || !!region || !!sido;

// 변경 후
const hasActiveFilters =
  type !== 'all' || deal !== 'all' || !!priceMin || !!priceMax || !!area || sort !== 'recent' || !!region || !!sido;
```

- [ ] **Step 3: 거래유형 칩 onClick에 price 리셋 추가**

거래유형 4개 칩 모두 onClick에 `price_min: null, price_max: null` 추가:

```tsx
{/* 전체 */}
<Chip active={deal === 'all'} onClick={() => updateParams({ deal: 'all', price_min: null, price_max: null })}>전체</Chip>
{/* 매매 */}
<Chip active={deal === 'sale'} onClick={() => updateParams({ deal: deal === 'sale' ? 'all' : 'sale', price_min: null, price_max: null })}>매매</Chip>
{/* 전세 */}
<Chip active={deal === 'jeonse'} onClick={() => updateParams({ deal: deal === 'jeonse' ? 'all' : 'jeonse', price_min: null, price_max: null })}>전세</Chip>
{/* 월세 */}
<Chip active={deal === 'wolse'} onClick={() => updateParams({ deal: deal === 'wolse' ? 'all' : 'wolse', price_min: null, price_max: null })}>월세</Chip>
```

- [ ] **Step 4: 가격대 섹션 전체 교체**

기존 가격대 `<section>` 블록 전체를 아래로 교체:

```tsx
{/* 가격대 */}
<section>
  <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">
    가격대<span className="ml-1 text-xs text-[var(--color-muted)]">{priceLabel}</span>
  </h3>

  {/* 데스크톱: 슬라이더 */}
  <div className="mt-2">
    <PriceRangeSlider
      min={sliderMin}
      max={sliderMax}
      step={sliderStep}
      valueMin={sliderValMin}
      valueMax={sliderValMax}
      onChange={(min, max) => {
        const isDefault = min === sliderMin && max === sliderMax;
        updateParams({
          price_min: isDefault ? null : String(min),
          price_max: isDefault ? null : String(max),
        });
      }}
    />
  </div>

  {/* 모바일: 기존 칩 */}
  <div className="flex flex-wrap gap-2 mt-2 md:hidden">
    <Chip
      active={!priceMin && !priceMax}
      onClick={() => updateParams({ price_min: null, price_max: null })}
    >전체</Chip>
    <Chip
      active={!priceMin && priceMax === '50000'}
      onClick={() => updateParams({ price_min: null, price_max: '50000' })}
    >5억 이하</Chip>
    <Chip
      active={priceMin === '50000' && priceMax === '100000'}
      onClick={() => updateParams({ price_min: '50000', price_max: '100000' })}
    >5~10억</Chip>
    <Chip
      active={priceMin === '100000' && priceMax === '150000'}
      onClick={() => updateParams({ price_min: '100000', price_max: '150000' })}
    >10~15억</Chip>
    <Chip
      active={priceMin === '150000' && !priceMax}
      onClick={() => updateParams({ price_min: '150000', price_max: null })}
    >15억 이상</Chip>
  </div>
</section>
```

- [ ] **Step 5: 타입 체크**

```bash
pnpm tsc --noEmit 2>&1 | grep "list-filter-panel"
```

Expected: 출력 없음

- [ ] **Step 6: 커밋**

```bash
git add app/(public)/list/_components/list-filter-panel.tsx
git commit -m "feat(list): 가격 필터 → 데스크톱 슬라이더 + 모바일 칩 분리"
```

---

### Task 7: mobile-filter-sheet.tsx activeCount 수정

**Files:**
- Modify: `app/(public)/list/_components/mobile-filter-sheet.tsx`

- [ ] **Step 1: activeCount price 파라미터 변경**

`mobile-filter-sheet.tsx`의 `activeCount` 배열에서 `price` 항목을 교체:

```tsx
// 변경 전
!!searchParams.get('price'),

// 변경 후
!!(searchParams.get('price_min') || searchParams.get('price_max')),
```

- [ ] **Step 2: 전체 빌드 + 테스트 확인**

```bash
pnpm tsc --noEmit 2>&1 | grep -v "node_modules" && pnpm test:unit
```

Expected: 타입 에러 없음, 테스트 전체 PASS

- [ ] **Step 3: 커밋 + 푸시**

```bash
git add app/(public)/list/_components/mobile-filter-sheet.tsx
git commit -m "fix(list): 모바일 필터 배지 카운트 price_min/price_max 반영"
git push
```
