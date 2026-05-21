# 모바일 필터 UX 개선 — pending 방식 + 조회 버튼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모바일 바텀시트에서 필터 변경을 로컬 상태로 보류하다가 "조회" 버튼 클릭 시 한 번에 URL 반영 + 시트 닫힘.

**Architecture:** `ListFilterPanel`에 `params`/`onParamsChange` 선택 prop을 추가해 deferred 모드를 지원한다. 데스크톱 사이드바는 prop 없이 기존 즉시 반영 방식을 유지하고, `MobileFilterSheet`가 `pendingParams` 상태를 관리해 prop으로 주입한다. `BottomSheet`는 `footer` slot과 스크롤 가능한 레이아웃을 갖춘다.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, vaul (Drawer)

---

## File Map

| 파일 | 변경 유형 | 역할 |
|------|-----------|------|
| `components/ui/bottom-sheet.tsx` | Modify | `footer` slot 추가, `max-h-[85vh] flex flex-col` 레이아웃 |
| `app/(public)/list/_components/list-filter-panel.tsx` | Modify | `params`/`onParamsChange` prop 추가, deferred 모드 분기 |
| `app/(public)/list/_components/mobile-filter-sheet.tsx` | Modify | `pendingParams` 상태, `handleApply`/`handleReset`, footer 전달 |

> **참고:** 이 프로젝트의 `test:unit`은 `tests/lib`, `tests/ingest`의 순수 TS 로직만 커버하므로, UI 컴포넌트 검증은 `pnpm tsc --noEmit`(타입 검사)와 브라우저 수동 확인으로 대체한다.

---

### Task 1: BottomSheet — `footer` slot + 스크롤 레이아웃

**Files:**
- Modify: `components/ui/bottom-sheet.tsx`

- [ ] **Step 1: 파일 확인**

```bash
cat components/ui/bottom-sheet.tsx
```

- [ ] **Step 2: BottomSheet 전체 교체**

`components/ui/bottom-sheet.tsx`를 아래 내용으로 교체한다:

```tsx
'use client';

import { Drawer } from 'vaul';
import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

export interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function BottomSheet({ open, onOpenChange, title, children, footer }: BottomSheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Drawer.Content
          className={cn(
            'fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-white shadow-[var(--shadow-soft)]',
            'max-h-[85vh] flex flex-col',
          )}
        >
          <div className="mx-auto mt-3 mb-2 h-1.5 w-12 shrink-0 rounded-full bg-[var(--color-line)]" />
          {title && (
            <Drawer.Title className="shrink-0 px-6 pb-3 text-lg font-bold text-[var(--color-blue-dark)]">
              {title}
            </Drawer.Title>
          )}
          <div className="flex-1 overflow-y-auto px-6 pb-4">
            {children}
          </div>
          {footer && (
            <div className="shrink-0 border-t border-[var(--color-line)] px-6 py-4">
              {footer}
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

- [ ] **Step 3: 타입 검사**

```bash
pnpm tsc --noEmit 2>&1 | grep -v node_modules | head -20
```

Expected: 오류 없음

- [ ] **Step 4: Commit**

```bash
git add components/ui/bottom-sheet.tsx
git commit -m "feat(ui): BottomSheet footer slot + max-h scroll layout"
```

---

### Task 2: ListFilterPanel — deferred mode props 추가

**Files:**
- Modify: `app/(public)/list/_components/list-filter-panel.tsx`

- [ ] **Step 1: Props 인터페이스 + effectiveParams 읽기 추가**

`Props` 인터페이스를 교체하고, `useSearchParams` 이후에 `effectiveParams` 한 줄을 추가한다:

```tsx
// Props 인터페이스 교체
interface Props {
  sidoList: SidoItem[];
  params?: URLSearchParams;
  onParamsChange?: (next: URLSearchParams) => void;
}

// 함수 시그니처 교체
export function ListFilterPanel({ sidoList, params: externalParams, onParamsChange }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const effectiveParams = externalParams ?? searchParams;
```

- [ ] **Step 2: 모든 searchParams.get() → effectiveParams.get() 교체**

`ListFilterPanel` 함수 본문에서 아래 6개 변수가 `searchParams.get()`을 사용하고 있다. 모두 `effectiveParams.get()`으로 바꾼다:

```tsx
const type = effectiveParams.get('type') ?? 'all';
const deal = effectiveParams.get('deal') ?? 'all';
const priceMin = effectiveParams.get('price_min');
const priceMax = effectiveParams.get('price_max');
const area = effectiveParams.get('area') ?? null;
const sort = effectiveParams.get('sort') ?? 'recent';
const region = effectiveParams.get('region') ?? null;
const sido = effectiveParams.get('sido') ?? null;
```

- [ ] **Step 3: updateParams 함수 교체**

기존 `updateParams` 함수를 아래로 교체한다:

```tsx
function updateParams(updates: Record<string, string | null>) {
  const base = externalParams ?? searchParams;
  const next = new URLSearchParams(base.toString());
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  next.delete('page');
  if (onParamsChange) {
    onParamsChange(next);
  } else {
    router.push(`/list?${next.toString()}`);
  }
}
```

- [ ] **Step 4: "필터 초기화" 버튼 조건 수정**

JSX 하단의 `hasActiveFilters &&` 블록을 아래로 교체한다 (`onParamsChange` 있을 때는 숨김 — 모바일 시트 footer가 대신함):

```tsx
{hasActiveFilters && !onParamsChange && (
  <Button variant="ghost" size="sm" onClick={() => router.push('/list')}>
    필터 초기화
  </Button>
)}
```

- [ ] **Step 5: 타입 검사**

```bash
pnpm tsc --noEmit 2>&1 | grep -v node_modules | head -20
```

Expected: 오류 없음

- [ ] **Step 6: Commit**

```bash
git add app/\(public\)/list/_components/list-filter-panel.tsx
git commit -m "feat(list): ListFilterPanel deferred mode via params/onParamsChange props"
```

---

### Task 3: MobileFilterSheet — pending 상태 + 조회/초기화 footer

**Files:**
- Modify: `app/(public)/list/_components/mobile-filter-sheet.tsx`

- [ ] **Step 1: import 추가**

파일 상단 import를 아래로 교체한다:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { ListFilterPanel } from './list-filter-panel';
```

- [ ] **Step 2: MobileFilterSheet 함수 전체 교체**

```tsx
export function MobileFilterSheet({ sidoList }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [pendingParams, setPendingParams] = useState(
    () => new URLSearchParams(searchParams.toString()),
  );

  useEffect(() => {
    if (open) {
      setPendingParams(new URLSearchParams(searchParams.toString()));
    }
  }, [open, searchParams]);

  const activeCount = [
    (searchParams.get('type') ?? 'all') !== 'all',
    (searchParams.get('deal') ?? 'all') !== 'all',
    !!(searchParams.get('price_min') || searchParams.get('price_max')),
    !!searchParams.get('area'),
    (searchParams.get('sort') ?? 'recent') !== 'recent',
    !!(searchParams.get('region') || searchParams.get('sido')),
  ].filter(Boolean).length;

  function handleApply() {
    router.push(`/list?${pendingParams.toString()}`);
    setOpen(false);
  }

  function handleReset() {
    setPendingParams(new URLSearchParams());
  }

  const footer = (
    <div className="flex gap-3">
      <Button variant="ghost" size="sm" onClick={handleReset} className="shrink-0">
        필터 초기화
      </Button>
      <Button onClick={handleApply} className="flex-1">
        조회
      </Button>
    </div>
  );

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
      <BottomSheet open={open} onOpenChange={setOpen} title="필터" footer={footer}>
        <ListFilterPanel
          sidoList={sidoList}
          params={pendingParams}
          onParamsChange={setPendingParams}
        />
      </BottomSheet>
    </div>
  );
}
```

- [ ] **Step 3: 타입 검사**

```bash
pnpm tsc --noEmit 2>&1 | grep -v node_modules | head -20
```

Expected: 오류 없음

- [ ] **Step 4: 브라우저 수동 확인 (모바일 뷰포트)**

```bash
pnpm dev
```

확인 항목:
1. "필터" 버튼 탭 → 바텀시트 열림
2. 칩 선택 → URL 변경 없음 (주소창 그대로)
3. "조회" 탭 → URL 반영 + 시트 닫힘 + 목록 필터링
4. 시트 다시 열기 → 직전 조회한 필터 상태로 초기화됨
5. "필터 초기화" 탭 → 시트 내 칩 전체 해제, URL 변경 없음
6. 스와이프다운으로 dismiss → URL 변경 없음
7. 데스크톱(md 이상): 사이드바 칩 클릭 즉시 반영 확인 (동작 무변경)

- [ ] **Step 5: Commit**

```bash
git add app/\(public\)/list/_components/mobile-filter-sheet.tsx
git commit -m "feat(list): 모바일 필터 pending 방식 + 조회/초기화 버튼"
```
