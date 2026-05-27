# 생활편의 상위 메뉴 구조 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `생활인프라` 평면 링크를 `생활편의` 메가 드롭다운(데스크톱)·아코디언(모바일)으로 바꾸고, 향후 list/detail이 꽂힐 URL 계약을 코드로 고정한다.

**Architecture:** 그룹·하위·URL·Soon 여부를 `life-menu.ts` 한 곳에 정의하고, 데스크톱 `LifeDropdown`과 모바일 `MobileDrawer`가 이를 공유한다. 학교 4개 하위만 라이브 링크(`/school?kind=`), 나머지 그룹 하위는 클릭 시 기존 `SoonModal`로 가로챈다. 실제 list/detail 페이지는 만들지 않는다.

**Tech Stack:** Next.js (App Router, `app/(public)`), React client components, Tailwind CSS 변수, Vitest(`tests/lib`), Playwright(`tests/e2e`).

**스펙:** `docs/superpowers/specs/2026-05-27-life-menu-structure-design.md`

---

## File Structure

| 파일 | 책임 |
|---|---|
| `app/(public)/_components/life-menu.ts` *(신규)* | 그룹·하위·href·live·soon 정의 단일 소스 + 타입 |
| `app/(public)/_components/life-dropdown.tsx` *(신규)* | 데스크톱 메가 드롭다운 패널(버튼 + 4컬럼) |
| `app/(public)/_components/nav.tsx` *(수정)* | `생활인프라` 링크 → `LifeDropdown` 삽입, `setSoonOpen(topic)` 일반화 |
| `app/(public)/_components/mobile-drawer.tsx` *(수정)* | `생활편의` 아코디언 섹션, `onSoonClick(topic)` 일반화 |
| `tests/lib/life-menu.test.ts` *(신규)* | `LIFE_GROUPS` 구조 단위 테스트 |
| `tests/e2e/life-menu.spec.ts` *(신규)* | 데스크톱 드롭다운 + 모바일 아코디언 e2e |
| `app/(public)/_components/footer.tsx`, `app/(public)/life/page.tsx`, `app/(public)/school/**` *(수정)* | `생활인프라` → `생활편의` 라벨 일관화 |

**참고:** `soon-modal.tsx`는 이미 `topic` prop으로 제목을 만들므로(`🚧 ${topic} 정보는 곧 만나요`) **수정 불필요**.

---

## Task 1: 메뉴 정의 단일 소스 (`life-menu.ts`)

**Files:**
- Create: `app/(public)/_components/life-menu.ts`
- Test: `tests/lib/life-menu.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/life-menu.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { LIFE_GROUPS } from '@/app/(public)/_components/life-menu';

describe('LIFE_GROUPS', () => {
  it('학교·의료시설·상권·편의·도시인프라 4개 그룹을 가진다', () => {
    expect(LIFE_GROUPS.map((g) => g.label)).toEqual([
      '학교',
      '의료시설',
      '상권·편의',
      '도시인프라',
    ]);
  });

  it('학교 하위는 모두 라이브이고 /school?kind= 로 이동한다', () => {
    const school = LIFE_GROUPS.find((g) => g.route === '/school')!;
    expect(school.items.length).toBe(4);
    expect(school.items.every((i) => i.live)).toBe(true);
    expect(school.items.every((i) => i.href.startsWith('/school?kind='))).toBe(true);
  });

  it('학교 외 그룹 하위는 아직 라이브가 아니다', () => {
    const others = LIFE_GROUPS.filter((g) => g.route !== '/school');
    expect(others.flatMap((g) => g.items).every((i) => !i.live)).toBe(true);
  });

  it('데이터 없는 항목(보건소·주차장)만 soon 배지를 가진다', () => {
    const soon = LIFE_GROUPS.flatMap((g) => g.items).filter((i) => i.soon);
    expect(soon.map((i) => i.label)).toEqual(['보건소', '주차장']);
  });

  it('모든 하위 href는 자기 그룹 route 로 시작한다', () => {
    for (const g of LIFE_GROUPS) {
      for (const i of g.items) {
        expect(i.href.startsWith(g.route)).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/life-menu.test.ts`
Expected: FAIL — `Cannot find module '.../life-menu'`.

- [ ] **Step 3: Write the menu definition**

Create `app/(public)/_components/life-menu.ts`:

```typescript
export interface LifeSubItem {
  label: string;
  href: string;
  /** false면 클릭 시 SoonModal — 페이지 완성 시 true로만 전환하면 라이브 */
  live: boolean;
  /** 데이터 자체가 없는 항목(보건소·주차장)에 'Soon' 배지 */
  soon?: boolean;
}

export interface LifeGroup {
  label: string;
  route: string;
  items: LifeSubItem[];
}

export const LIFE_GROUPS: LifeGroup[] = [
  {
    label: '학교',
    route: '/school',
    items: [
      { label: '초등', href: '/school?kind=elem', live: true },
      { label: '중학교', href: '/school?kind=mid', live: true },
      { label: '고등', href: '/school?kind=high', live: true },
      { label: '특수', href: '/school?kind=special', live: true },
    ],
  },
  {
    label: '의료시설',
    route: '/medical',
    items: [
      { label: '병원·의원', href: '/medical?type=hospital', live: false },
      { label: '약국', href: '/medical?type=pharmacy', live: false },
      { label: '보건소', href: '/medical?type=health-center', live: false, soon: true },
    ],
  },
  {
    label: '상권·편의',
    route: '/amenity',
    items: [
      { label: '편의점', href: '/amenity?type=convenience', live: false },
      { label: '마트', href: '/amenity?type=mart', live: false },
      { label: '카페', href: '/amenity?type=cafe', live: false },
      { label: '전통시장', href: '/amenity?type=market', live: false },
    ],
  },
  {
    label: '도시인프라',
    route: '/urban',
    items: [
      { label: '공원', href: '/urban?type=park', live: false },
      { label: '충전소', href: '/urban?type=charger', live: false },
      { label: '주차장', href: '/urban?type=parking', live: false, soon: true },
    ],
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/life-menu.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(public)/_components/life-menu.ts" tests/lib/life-menu.test.ts
git commit -m "feat(nav): 생활편의 그룹·하위 메뉴 정의 단일 소스 추가"
```

---

## Task 2: 데스크톱 메가 드롭다운 컴포넌트 (`life-dropdown.tsx`)

**Files:**
- Create: `app/(public)/_components/life-dropdown.tsx`

이 태스크는 컴포넌트만 만들고(아직 nav에 미연결), Task 3에서 연결 후 e2e로 검증한다.

- [ ] **Step 1: Write the component**

Create `app/(public)/_components/life-dropdown.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { LIFE_GROUPS } from './life-menu';

interface Props {
  /** 비라이브 항목 클릭 시 호출 — Nav가 SoonModal을 연다 */
  onSoon: (topic: string) => void;
}

export function LifeDropdown({ onSoon }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className="inline-flex items-center gap-1"
      >
        생활편의
        <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          data-testid="life-dropdown"
          className="absolute left-0 top-[calc(100%+14px)] z-30 grid w-[640px] grid-cols-4 gap-5 rounded-2xl border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]"
        >
          {LIFE_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              <p className="mb-1 px-2 text-[13px] font-bold text-[var(--color-blue-dark)]">
                {group.label}
              </p>
              {group.items.map((item) =>
                item.live ? (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-2 py-1.5 text-[14px] text-[var(--color-text)] hover:bg-[var(--color-soft)]"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onSoon(item.label);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[14px] text-[var(--color-muted)] hover:bg-[var(--color-soft)]"
                  >
                    {item.label}
                    {item.soon && <Badge tone="gray">Soon</Badge>}
                  </button>
                ),
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm exec tsc --noEmit`
Expected: no errors referencing `life-dropdown.tsx` (component unused yet is fine).

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/_components/life-dropdown.tsx"
git commit -m "feat(nav): 데스크톱 생활편의 메가 드롭다운 컴포넌트 추가"
```

---

## Task 3: Nav 연결 + 데스크톱 e2e

**Files:**
- Modify: `app/(public)/_components/nav.tsx`
- Create: `tests/e2e/life-menu.spec.ts`

- [ ] **Step 1: Write the failing e2e test**

Create `tests/e2e/life-menu.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('데스크톱 생활편의 드롭다운', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, '모바일은 드로어 아코디언 사용');

  test('드롭다운을 열고 학교 하위로 이동한다', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '생활편의' }).click();

    const panel = page.getByTestId('life-dropdown');
    await expect(panel).toBeVisible();

    await panel.getByRole('link', { name: '초등' }).click();
    await expect(page).toHaveURL(/\/school\?kind=elem/);
  });

  test('미빌드 항목(약국) 클릭 시 Soon 모달이 뜬다', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '생활편의' }).click();
    await page.getByTestId('life-dropdown').getByRole('button', { name: '약국' }).click();
    await expect(page.getByText('약국 정보는 곧 만나요')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec playwright test tests/e2e/life-menu.spec.ts --project=chromium`
Expected: FAIL — `생활편의` 버튼이 없음(현재 `생활인프라` 링크).

> 데스크톱 프로젝트명이 다르면 `pnpm exec playwright test tests/e2e/life-menu.spec.ts -g 데스크톱` 으로 실행. 모바일 프로젝트에서는 `test.skip`으로 건너뜀.

- [ ] **Step 3: Wire LifeDropdown into Nav**

Edit `app/(public)/_components/nav.tsx`. Add import near the top:

```tsx
import { LifeDropdown } from './life-dropdown';
```

Replace the desktop `생활인프라` link line:

```tsx
            <Link href="/life">생활인프라</Link>
```

with:

```tsx
            <LifeDropdown onSoon={(topic) => setSoonOpen(topic)} />
```

Generalize the mobile drawer's soon handler. Replace:

```tsx
        onSoonClick={() => {
          setSoonOpen('청약');
          setMenuOpen(false);
        }}
```

with:

```tsx
        onSoonClick={(topic) => {
          setSoonOpen(topic);
          setMenuOpen(false);
        }}
```

(`setSoonOpen` already accepts `string | null`, so no state-type change is needed.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec playwright test tests/e2e/life-menu.spec.ts --project=chromium`
Expected: PASS (2 desktop tests). The mobile accordion test added in Task 4 will live in the same file.

- [ ] **Step 5: Commit**

```bash
git add "app/(public)/_components/nav.tsx" tests/e2e/life-menu.spec.ts
git commit -m "feat(nav): 데스크톱 생활편의 드롭다운 연결 + Soon 토픽 일반화"
```

---

## Task 4: 모바일 드로어 아코디언 + e2e

**Files:**
- Modify: `app/(public)/_components/mobile-drawer.tsx`
- Modify: `tests/e2e/life-menu.spec.ts`

- [ ] **Step 1: Write the failing e2e test**

Append to `tests/e2e/life-menu.spec.ts`:

```typescript
test.describe('모바일 생활편의 아코디언', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 9999) >= 768, '데스크톱은 드롭다운 사용');

  test('아코디언을 펼치고 학교 하위로 이동한다', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '메뉴 열기' }).click();

    const drawer = page.getByTestId('mobile-drawer');
    await drawer.getByRole('button', { name: '생활편의' }).click();
    await drawer.getByRole('link', { name: '중학교' }).click();

    await expect(page).toHaveURL(/\/school\?kind=mid/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec playwright test tests/e2e/life-menu.spec.ts --project=mobile`
Expected: FAIL — 드로어에 `생활편의` 버튼이 없음(현재 평면 `생활인프라` 링크).

> 프로젝트명이 다르면 `-g 모바일` 로 필터해 실행.

- [ ] **Step 3: Add the accordion**

Edit `app/(public)/_components/mobile-drawer.tsx`.

Change the props type so `onSoonClick` carries a topic:

```tsx
interface Props {
  open: boolean;
  onClose: () => void;
  onSoonClick: (topic: string) => void;
}
```

Add imports (top of file):

```tsx
import { useEffect, useRef, useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { LIFE_GROUPS } from './life-menu';
```

Remove `생활인프라` from the flat `links` array so it becomes:

```tsx
const links = [
  { href: '/', label: '홈' },
  { href: '/list', label: '실거래가' },
];
```

Add accordion open-state inside the component (next to the existing `closeBtnRef`):

```tsx
  const [lifeOpen, setLifeOpen] = useState(false);
```

Insert the accordion block immediately AFTER the `{links.map(...)}` block and BEFORE the 청약 button:

```tsx
        <button
          type="button"
          onClick={() => setLifeOpen((v) => !v)}
          aria-expanded={lifeOpen}
          className="inline-flex items-center justify-between rounded-lg px-2 py-3 text-left text-[15px] font-semibold text-[var(--color-text)] hover:bg-[var(--color-soft)]"
        >
          생활편의
          <ChevronDown size={18} className={`transition-transform ${lifeOpen ? 'rotate-180' : ''}`} />
        </button>

        {lifeOpen && (
          <div className="mb-1 flex flex-col gap-0.5 pl-2">
            {LIFE_GROUPS.map((group) => (
              <div key={group.label} className="py-1">
                <p className="px-2 py-1 text-xs font-bold text-[var(--color-blue-dark)]">{group.label}</p>
                {group.items.map((item) =>
                  item.live ? (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={onClose}
                      className="block rounded-lg px-3 py-2 text-[14px] text-[var(--color-text)] hover:bg-[var(--color-soft)]"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => onSoonClick(item.label)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-left text-[14px] text-[var(--color-muted)] hover:bg-[var(--color-soft)]"
                    >
                      {item.label}
                      {item.soon && <Badge tone="gray">Soon</Badge>}
                    </button>
                  ),
                )}
              </div>
            ))}
          </div>
        )}
```

Update the existing 청약 button to pass its topic:

```tsx
        <button
          onClick={() => onSoonClick('청약')}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-3 text-left text-[15px] font-semibold text-[var(--color-text)] hover:bg-[var(--color-soft)]"
        >
          청약 <Badge tone="gray">Soon</Badge>
        </button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec playwright test tests/e2e/life-menu.spec.ts --project=mobile`
Expected: PASS (mobile accordion test).

- [ ] **Step 5: Run the existing mobile-nav regression**

Run: `pnpm exec playwright test tests/e2e/mobile-nav.spec.ts`
Expected: PASS — 햄버거/오버레이 동작 회귀 없음. (`생활인프라` 링크는 제거됐지만 그 테스트는 `실거래가` 링크만 확인한다.)

- [ ] **Step 6: Commit**

```bash
git add "app/(public)/_components/mobile-drawer.tsx" tests/e2e/life-menu.spec.ts
git commit -m "feat(nav): 모바일 드로어 생활편의 아코디언 추가"
```

---

## Task 5: `생활인프라` → `생활편의` 라벨 일관화

**Files (모두 라벨 텍스트만 교체):**
- Modify: `app/(public)/_components/footer.tsx:21`
- Modify: `app/(public)/life/page.tsx` (lines 5, 6, 23, 25)
- Modify: `app/(public)/school/page.tsx` (lines 40, 45)
- Modify: `app/(public)/school/[sigunguCode]/page.tsx:52`
- Modify: `app/(public)/school/regions/page.tsx:32`
- Modify: `app/(public)/school/[sigunguCode]/[id]/page.tsx:66`

(Nav·drawer는 Task 3·4에서 이미 `생활편의`로 바뀜.)

- [ ] **Step 1: Footer 링크 라벨**

`footer.tsx`에서 `<Link href="/life">생활인프라</Link>` → `<Link href="/life">생활편의</Link>`.

- [ ] **Step 2: `/life` 허브 페이지**

`life/page.tsx`:
- 메타 title `'생활인프라 — 학교·공원·마트·충전소'` → `'생활편의 — 학교·의료·상권·도시인프라'`
- 메타 description의 `생활인프라 정보를` → `생활편의 정보를`
- 칩 `생활인프라` → `생활편의`
- H1 `우리 동네 생활인프라` → `우리 동네 생활편의`

- [ ] **Step 3: 학교 페이지 4곳의 빵부스러기/칩**

각 파일에서 빵부스러기 `<Link href="/life">생활인프라</Link>` → `<Link href="/life">생활편의</Link>`:
- `school/page.tsx:40`, `school/[sigunguCode]/page.tsx:52`, `school/regions/page.tsx:32`, `school/[sigunguCode]/[id]/page.tsx:66`

추가로 `school/page.tsx:45`의 칩 `생활인프라 · 학교찾기` → `생활편의 · 학교찾기`.

- [ ] **Step 4: 잔존 라벨 확인**

Run: `grep -rn "생활인프라" "app/"`
Expected: 결과는 **`soon-modal.tsx`의 로드맵 본문 한 줄만** 남는다(의도적으로 유지 — nav 라벨이 아니라 출시 예정 안내 문구). 다른 결과가 있으면 위 단계에서 누락된 것이니 교체한다.

- [ ] **Step 5: Commit**

```bash
git add "app/(public)/_components/footer.tsx" "app/(public)/life/page.tsx" "app/(public)/school/page.tsx" "app/(public)/school/[sigunguCode]/page.tsx" "app/(public)/school/regions/page.tsx" "app/(public)/school/[sigunguCode]/[id]/page.tsx"
git commit -m "refactor(nav): 생활인프라 → 생활편의 라벨 일관화"
```

---

## Task 6: 전체 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 타입 체크**

Run: `pnpm exec tsc --noEmit`
Expected: `tsc OK` (에러 없음).

- [ ] **Step 2: 린트**

Run: `pnpm lint`
Expected: 통과 (신규 파일 관련 에러 없음).

- [ ] **Step 3: 단위 테스트**

Run: `pnpm exec vitest run tests/lib/life-menu.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 4: e2e 전체 (드롭다운 + 아코디언 + 모바일 회귀 + 검색 회귀)**

Run: `pnpm exec playwright test tests/e2e/life-menu.spec.ts tests/e2e/mobile-nav.spec.ts tests/e2e/search.spec.ts`
Expected: 전부 PASS. 검색 드롭다운 폭 넘침 회귀 없음, 청약 SoonModal 동작 유지.

- [ ] **Step 5: 수동 확인 (UI)**

데스크톱(≥768px)·모바일(<768px) 둘 다에서:
- 데스크톱: `생활편의` 클릭 → 4컬럼 패널. 학교 하위 이동, 약국 클릭 → "약국 정보는 곧 만나요" 모달, 보건소·주차장 'Soon' 배지. Esc·외부클릭 닫힘.
- 모바일: 햄버거 → 드로어 → `생활편의` 펼침 → 학교 하위 이동, 비라이브 항목 → Soon 모달.

> dev 서버: `lsof -ti :3000 | xargs kill 2>/dev/null; pnpm dev` 후 브라우저 확인.

- [ ] **Step 6: (선택) 검증 커밋 불필요**

검증 단계는 코드 변경이 없으므로 커밋하지 않는다. 실패 시 해당 Task로 돌아가 수정.

---

## Self-Review (작성자 체크 완료)

- **스펙 커버리지:** ① 라벨 변경 → Task 3·4·5 / ② 메가 드롭다운 → Task 2·3 / ③ 모바일 아코디언 → Task 4 / ④ URL 계약(`?kind=`·`?type=`·route) → Task 1 / ⑤ 미빌드=SoonModal → Task 2·3·4 / ⑥ 단일 소스 정의 → Task 1 / ⑦ 회귀 체크리스트 → Task 6. 누락 없음.
- **플레이스홀더:** 없음 — 모든 코드/명령/기대 출력 명시.
- **타입 일관성:** `LifeGroup`/`LifeSubItem`(Task 1) ↔ `LifeDropdown` props(Task 2) ↔ `MobileDrawer` props(Task 4) 일치. `onSoon(topic)` / `onSoonClick(topic)` 시그니처가 Nav(Task 3) 사용처와 일치.
- **범위:** list/detail·데이터·Prisma 미변경 — 메뉴 구조 + URL 계약으로 한정.
