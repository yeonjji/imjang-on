# 실거래가 페이지네이션 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공유 `Pagination` 컴포넌트를 이전/다음 중심 + 5개 번호 + 라벨형 빠른 이동(±10·처음·마지막)으로 재설계하고, 모바일에 페이지 점프 입력을 추가한다.

**Architecture:** 페이지 윈도우/빠른 이동 가시성을 결정하는 순수 로직을 `lib/pagination.ts`로 분리해 vitest로 TDD한다. `components/ui/pagination.tsx`는 그 로직을 소비하는 표현 레이어로 재작성한다. URL(`?page=`) 기반·서버 컴포넌트 구조는 그대로 유지한다.

**Tech Stack:** Next.js(App Router) · React client component · Tailwind(인라인 CSS 변수 토큰) · lucide-react 아이콘 · vitest · Playwright.

**범위 메모:** 페이지네이션 UI만. 인피드 광고·스티키 사이드바는 별도 후속. `pagination-nav.tsx`는 변경 불필요(기존 `onChange`가 임의 페이지를 URL에 반영함).

---

## File Structure

- **Create** `lib/pagination.ts` — 순수 함수 `buildPager(current, total, windowSize?)`. 페이지 번호 윈도우와 빠른 이동 버튼 가시성/타깃을 계산. UI 의존 없음.
- **Create** `tests/lib/pagination.test.ts` — `buildPager` 단위 테스트.
- **Modify** `components/ui/pagination.tsx` — 데스크톱/모바일 재설계, 한글 `aria-label`, 위치 캡션 중앙화. `buildPager` 소비.
- **Modify** `tests/e2e/list.spec.ts:48-55` — 모바일 페이지네이션 접근성 라벨 갱신 + 데스크톱 어서션 추가.

---

## Task 1: 순수 페이저 로직 (`buildPager`)

**Files:**
- Create: `lib/pagination.ts`
- Test: `tests/lib/pagination.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/lib/pagination.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildPager } from '@/lib/pagination';

describe('buildPager', () => {
  it('총 페이지가 윈도우 이하이면 모든 번호 노출, 빠른 이동 없음', () => {
    const p = buildPager(3, 5);
    expect(p.pages).toEqual([1, 2, 3, 4, 5]);
    expect(p.first).toBe(false);
    expect(p.prev10).toBeNull();
    expect(p.next10).toBeNull();
    expect(p.last).toBeNull();
  });

  it('번호 윈도우는 최대 5개이며 연속·범위 내', () => {
    const p = buildPager(50, 2389);
    expect(p.pages).toEqual([48, 49, 50, 51, 52]);
  });

  it('초반 페이지: 후방 빠른 이동 없음, 전방은 노출', () => {
    const p = buildPager(2, 2389);
    expect(p.pages).toEqual([1, 2, 3, 4, 5]);
    expect(p.first).toBe(false);
    expect(p.prev10).toBeNull();
    expect(p.next10).toBe(12);
    expect(p.last).toBe(2389);
  });

  it('깊은 페이지: 양방향 빠른 이동 노출 + clamp', () => {
    const p = buildPager(50, 2389);
    expect(p.first).toBe(true);
    expect(p.prev10).toBe(40);
    expect(p.next10).toBe(60);
    expect(p.last).toBe(2389);
  });

  it('마지막 페이지: 전방 빠른 이동/마지막 숨김, 후방은 노출', () => {
    const p = buildPager(2389, 2389);
    expect(p.pages).toEqual([2385, 2386, 2387, 2388, 2389]);
    expect(p.first).toBe(true);
    expect(p.prev10).toBe(2379);
    expect(p.next10).toBeNull();
    expect(p.last).toBeNull();
  });

  it('prev10은 current>11일 때만, next10은 total로 clamp', () => {
    expect(buildPager(11, 2389).prev10).toBeNull();
    expect(buildPager(12, 2389).prev10).toBe(2);
    expect(buildPager(2385, 2389).next10).toBe(2389);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run tests/lib/pagination.test.ts`
Expected: FAIL — `Cannot find module '@/lib/pagination'` (or `buildPager is not a function`).

- [ ] **Step 3: 최소 구현 작성**

Create `lib/pagination.ts`:

```ts
export interface Pager {
  /** 연속된 페이지 번호 윈도우 (최대 windowSize개) */
  pages: number[];
  /** 윈도우에 1페이지가 없을 때 "처음" 버튼 노출 */
  first: boolean;
  /** "-10" 버튼 타깃 (없으면 null) */
  prev10: number | null;
  /** "+10" 버튼 타깃 (없으면 null) */
  next10: number | null;
  /** "마지막" 버튼 타깃 (없으면 null) */
  last: number | null;
}

export function buildPager(current: number, total: number, windowSize = 5): Pager {
  const size = Math.min(windowSize, total);
  let startPage = Math.max(1, current - Math.floor(size / 2));
  const endPage = Math.min(total, startPage + size - 1);
  startPage = Math.max(1, endPage - size + 1);
  const pages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);

  const hasQuickJump = total > windowSize;
  const hasForward = hasQuickJump && current < total;

  return {
    pages,
    first: pages[0] > 1,
    prev10: current > 11 ? Math.max(1, current - 10) : null,
    next10: hasForward ? Math.min(total, current + 10) : null,
    last: hasForward ? total : null,
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec vitest run tests/lib/pagination.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: 커밋**

```bash
git add lib/pagination.ts tests/lib/pagination.test.ts
git commit -m "feat(pagination): 페이지 윈도우·빠른 이동 순수 로직 buildPager 추가"
```

---

## Task 2: 페이지네이션 컴포넌트 재설계

**Files:**
- Modify: `components/ui/pagination.tsx` (전체 재작성)

> 이 파일은 list 외 urban/amenity/subscription/childcare/school/apt-거래테이블 7곳이 공유한다. 빠른 이동은 `buildPager`로 조건부 렌더되어 페이지 적은 표면에선 자동으로 숨는다.

- [ ] **Step 1: 컴포넌트 전체 재작성**

Replace the entire contents of `components/ui/pagination.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buildPager } from '@/lib/pagination';

export interface PaginationProps {
  current: number;
  totalPages: number;
  totalItems: number;
  perPage: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}

export function Pagination({
  current,
  totalPages,
  totalItems,
  perPage,
  onChange,
  disabled,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pager = buildPager(current, totalPages);
  const start = (current - 1) * perPage + 1;
  const end = Math.min(current * perPage, totalItems);

  return (
    <nav className="py-3" aria-label="페이지네이션">
      {/* 위치 캡션 (중앙) */}
      <p className="mb-3 text-center text-xs text-[var(--color-muted)]">
        {totalItems.toLocaleString('ko-KR')}건 중{' '}
        <span className="font-semibold text-[var(--color-blue-dark)]">
          {start.toLocaleString('ko-KR')}–{end.toLocaleString('ko-KR')}
        </span>{' '}
        표시중
      </p>

      {/* 모바일: 이전 / 페이지 점프 / 다음 */}
      <MobilePager current={current} totalPages={totalPages} onChange={onChange} disabled={disabled} />

      {/* 데스크톱 */}
      <div className="hidden md:flex flex-wrap items-center justify-center gap-2">
        {pager.first && (
          <JumpBtn label="처음 페이지로" onClick={() => onChange(1)} disabled={disabled}>
            ⟪ 처음
          </JumpBtn>
        )}
        {pager.prev10 != null && (
          <JumpBtn label="10페이지 뒤로" onClick={() => onChange(pager.prev10!)} disabled={disabled}>
            ⟪ -10
          </JumpBtn>
        )}

        <StepBtn label="이전 페이지" onClick={() => onChange(current - 1)} disabled={disabled || current === 1}>
          <ChevronLeft size={16} /> 이전
        </StepBtn>

        {pager.pages.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            disabled={disabled}
            aria-current={p === current ? 'page' : undefined}
            className={cn(
              'h-11 min-w-[44px] rounded-xl px-2 text-sm font-bold',
              p === current
                ? 'bg-[var(--color-blue)] text-white'
                : 'text-[var(--color-muted)] hover:bg-[var(--color-soft)]',
            )}
          >
            {p}
          </button>
        ))}

        <StepBtn
          label="다음 페이지"
          onClick={() => onChange(current + 1)}
          disabled={disabled || current === totalPages}
        >
          다음 <ChevronRight size={16} />
        </StepBtn>

        {(pager.next10 != null || pager.last != null) && (
          <span className="mx-1 h-6 w-px bg-[var(--color-line)]" aria-hidden />
        )}
        {pager.next10 != null && (
          <JumpBtn label="10페이지 앞으로" onClick={() => onChange(pager.next10!)} disabled={disabled}>
            +10 ⟫
          </JumpBtn>
        )}
        {pager.last != null && (
          <JumpBtn label="마지막 페이지로" onClick={() => onChange(pager.last!)} disabled={disabled}>
            마지막 {totalPages.toLocaleString('ko-KR')} ⟫
          </JumpBtn>
        )}
      </div>
    </nav>
  );
}

function StepBtn({
  label,
  children,
  onClick,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-11 items-center gap-1 rounded-xl border border-[var(--color-blue)] px-4 text-sm font-bold text-[var(--color-blue)] hover:bg-[var(--color-soft)] disabled:border-[var(--color-line)] disabled:text-[var(--color-muted)] disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function JumpBtn({
  label,
  children,
  onClick,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="h-11 rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] px-3 text-xs font-semibold text-[var(--color-muted)] hover:bg-white disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function MobilePager({
  current,
  totalPages,
  onChange,
  disabled,
}: {
  current: number;
  totalPages: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  function submit() {
    const n = Math.min(totalPages, Math.max(1, Number(value) || current));
    setOpen(false);
    setValue('');
    onChange(n);
  }

  return (
    <div className="flex w-full items-center justify-between gap-2 md:hidden">
      <button
        aria-label="이전 페이지"
        onClick={() => onChange(current - 1)}
        disabled={disabled || current === 1}
        className="flex h-11 items-center gap-1 rounded-xl border border-[var(--color-blue)] px-4 text-sm font-bold text-[var(--color-blue)] disabled:border-[var(--color-line)] disabled:text-[var(--color-muted)] disabled:opacity-50"
      >
        <ChevronLeft size={16} /> 이전
      </button>

      {open ? (
        <div className="flex items-center gap-1">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={totalPages}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder={String(current)}
            aria-label="페이지 번호 입력"
            className="h-9 w-16 rounded-lg border border-[var(--color-line)] px-2 text-center text-sm"
          />
          <button
            onClick={submit}
            className="h-9 rounded-lg bg-[var(--color-blue)] px-3 text-sm font-bold text-white"
          >
            이동
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          aria-label="페이지 이동"
          className="text-sm font-bold text-[var(--color-blue-dark)]"
        >
          {current.toLocaleString('ko-KR')} / {totalPages.toLocaleString('ko-KR')}
        </button>
      )}

      <button
        aria-label="다음 페이지"
        onClick={() => onChange(current + 1)}
        disabled={disabled || current === totalPages}
        className="flex h-11 items-center gap-1 rounded-xl border border-[var(--color-blue)] px-4 text-sm font-bold text-[var(--color-blue)] disabled:border-[var(--color-line)] disabled:text-[var(--color-muted)] disabled:opacity-50"
      >
        다음 <ChevronRight size={16} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: PASS (no errors). 기존 `pageWindow` 제거로 인한 미사용 import 경고 없음 확인.

- [ ] **Step 3: 단위 테스트 회귀 확인**

Run: `pnpm exec vitest run tests/lib/pagination.test.ts`
Expected: PASS (Task 1 로직 그대로).

- [ ] **Step 4: 커밋**

```bash
git add components/ui/pagination.tsx
git commit -m "feat(pagination): 이전/다음·번호5·라벨형 빠른 이동·모바일 점프 재설계"
```

---

## Task 3: e2e 테스트 갱신

**Files:**
- Modify: `tests/e2e/list.spec.ts:48-55`

- [ ] **Step 1: 모바일 테스트의 접근성 라벨 교체 + 데스크톱 어서션 추가**

`tests/e2e/list.spec.ts`에서 기존 모바일 테스트(48–55행)를 아래로 교체:

```ts
test('모바일 페이지네이션: 이전/다음 버튼 노출', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/list?page=2');
  // display:none인 데스크톱 버튼은 접근성 트리에서 제외되어 모바일 버튼만 매칭됨
  await expect(page.getByRole('button', { name: '이전 페이지' })).toBeVisible();
  await expect(page.getByRole('button', { name: '다음 페이지' })).toBeVisible();
});

test('모바일 페이지네이션: 현재/총 페이지 탭 시 점프 입력 노출', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/list?page=2');
  await page.getByRole('button', { name: '페이지 이동' }).click();
  await expect(page.getByRole('spinbutton', { name: '페이지 번호 입력' })).toBeVisible();
});

test('데스크톱 페이지네이션: 현재 페이지 강조 + 다음 버튼 노출', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/list?page=2');
  await expect(page.getByRole('button', { name: '다음 페이지' })).toBeVisible();
  // 현재 페이지(2) 번호 버튼은 aria-current=page
  await expect(page.getByRole('button', { current: 'page' })).toHaveText('2');
});
```

> 주의: e2e는 `?page=2`를 사용한다. 시드 데이터가 2페이지 이상이어야 페이지네이션이 렌더된다(`totalPages <= 1`이면 `null`). 시드가 1페이지뿐이면 데스크톱/점프 어서션을 `page.goto('/list')` 후 페이지네이션 존재 조건부로 완화하지 말고, 시드를 2페이지 이상으로 맞춘다(`tests/_helpers/seed-e2e.ts` 확인).

- [ ] **Step 2: e2e 실행**

Run: `pnpm test:e2e -- list.spec.ts`
Expected: PASS — 모바일 2건 + 데스크톱 1건 포함 list 스펙 전체 그린.

- [ ] **Step 3: 커밋**

```bash
git add tests/e2e/list.spec.ts
git commit -m "test(e2e): 페이지네이션 접근성 라벨·데스크톱/점프 어서션 갱신"
```

---

## Task 4: 통합 검증 스윕

**Files:** (없음 — 검증/확인만)

- [ ] **Step 1: 전체 단위·타입·린트**

Run: `pnpm typecheck && pnpm exec vitest run tests/lib && pnpm lint`
Expected: 모두 PASS.

- [ ] **Step 2: 빌드 무결성**

Run: `pnpm build`
Expected: 성공. `components/ui/pagination.tsx`를 쓰는 7개 라우트 빌드 에러 없음.

- [ ] **Step 3: 7개 공유 표면 시각 점검 (수동)**

`pnpm dev` 후 아래를 브라우저로 확인 — 특히 페이지 수가 적은 표면에서 빠른 이동이 숨고 과밀하지 않은지:
- `/list?page=2` (데스크톱·모바일) — 번호5 + 이전/다음 + 빠른 이동, 모바일 점프 입력
- `/list?page=50` — `⟪ 처음`·`⟪ -10`·`+10 ⟫`·`마지막 N ⟫` 4개 모두 노출
- 마지막 페이지 — `+10`·`마지막` 숨김, `이전`만 활성
- apt 상세 거래 테이블, urban/amenity/subscription/childcare/school 목록 — 레이아웃 깨짐 없음

- [ ] **Step 4: 회귀 스모크**

Run: `pnpm test:e2e -- search.spec.ts subscription-nav.spec.ts`
Expected: 기존 nav 스모크 그린 유지.

- [ ] **Step 5: 검증 결과 기록 (커밋 불필요)**

각 검증 명령의 실제 출력으로 통과를 확인했는지 점검. 실패 시 해당 Task로 돌아가 수정.

---

## Self-Review (작성자 점검 완료)

- **Spec coverage:** 패러다임 유지(설명 명시) · 데스크톱 A안(Task 2) · 빠른 이동 ±10/처음/마지막 조건부(Task 1·2) · 모바일 점프(Task 2) · 카운트 중앙 캡션(Task 2) · 엣지케이스(Task 1 테스트) · a11y 한글 라벨(Task 2·3) · 7표면 검증(Task 4). 모두 매핑됨.
- **Placeholder scan:** 코드/명령/기대출력 모두 구체값. 플레이스홀더 없음.
- **Type consistency:** `Pager` 필드(`pages/first/prev10/next10/last`)가 Task 1 정의 ↔ Task 2 소비에서 일치. `buildPager` 시그니처 일관.
- **Deviation from spec:** `pagination-nav.tsx`는 변경 불필요(기존 `onChange`가 임의 페이지 반영) — 더 surgical하게 축소.
