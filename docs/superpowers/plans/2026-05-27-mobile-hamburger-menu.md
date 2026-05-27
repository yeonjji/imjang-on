# 모바일 햄버거 메뉴 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모바일(`<768px`) 헤더에 햄버거 버튼과 오른쪽 슬라이드 서랍을 추가해, 데스크톱 동작은 그대로 둔 채 모바일에서도 메뉴(검색·홈·실거래가·생활인프라·청약)에 접근할 수 있게 한다.

**Architecture:** `Nav`에 `menuOpen` 상태와 햄버거 버튼(`md:hidden`)을 추가하고, 서랍 UI는 신규 `MobileDrawer` 컴포넌트로 분리한다. 서랍은 항상 렌더되며 `translate-x` 트랜지션으로 열고 닫는다. 닫힘 상태에서는 래퍼에 `aria-hidden`을 걸어 접근성 트리·Playwright role 쿼리에서 제외한다. 검색창(`SearchInput`)과 청약 `SoonModal`은 기존 컴포넌트를 재사용한다.

**Tech Stack:** Next.js (App Router, client component), Tailwind CSS, lucide-react 아이콘, Playwright e2e (`chromium-mobile` = Pixel 5 프로젝트 기존 설정 활용).

**설계 문서:** `docs/superpowers/specs/2026-05-27-mobile-hamburger-menu-design.md`

---

## 사전 컨텍스트 (구현자 필독)

- 현재 `app/(public)/_components/nav.tsx`는 데스크톱 링크를 `hidden ... md:flex`로 감추고, 모바일에는 로고 + 검색창만 노출 → 메뉴 진입 불가.
- `tests/e2e/soon-modal.spec.ts:5`에 `test.skip(... < 768, 'mobile nav not implemented in Phase 1')`이 있고 주석에 "모바일 nav는 Phase 2에서 bottom tab bar로 별도 구현 예정"이라 적혀 있다. **본 작업이 그 모바일 nav를 서랍 방식으로 대체한다.** soon-modal 테스트는 데스크톱 전용이므로 그대로 둔다(수정 불필요).
- 사용 가능한 CSS 변수(`app/globals.css`): `--color-text`(#172033), `--color-muted`, `--color-line`, `--color-soft`, `--color-blue-dark`, `--color-sky`, `--shadow-soft`(search-input에서 사용 중).
- 재사용 컴포넌트: `SearchInput`(`./search-input`), `Badge`(`@/components/ui/badge`, `tone="gray"`), `SoonModal`(`./soon-modal`). lucide-react는 이미 의존성에 있음(`Search` 아이콘 사용 중).
- 테스트 명령: 모바일 e2e = `pnpm exec playwright test --project=chromium-mobile`, 데스크톱 = `--project=chromium-desktop`. 타입체크 = `pnpm exec tsc --noEmit`(또는 `pnpm build`), 린트 = `pnpm lint`.

## File Structure

- **Create** `app/(public)/_components/mobile-drawer.tsx` — 오버레이 + 슬라이드 패널. 검색창·링크·청약 버튼 포함. 스크롤 잠금/Esc 처리. props: `{ open, onClose, onSoonClick }`.
- **Modify** `app/(public)/_components/nav.tsx` — `menuOpen` 상태, 햄버거 버튼(`md:hidden`), 헤더 검색창을 `hidden md:block`으로, `MobileDrawer` 마운트.
- **Create** `tests/e2e/mobile-nav.spec.ts` — 모바일 뷰포트 전용 e2e(서랍 열기/이동, 오버레이 닫기).

---

### Task 1: 모바일 햄버거 메뉴 (TDD)

**Files:**
- Test: `tests/e2e/mobile-nav.spec.ts` (create)
- Create: `app/(public)/_components/mobile-drawer.tsx`
- Modify: `app/(public)/_components/nav.tsx`

- [ ] **Step 1: 실패하는 e2e 테스트 작성**

Create `tests/e2e/mobile-nav.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

// 모바일 뷰포트(<768px)에서만 실행. 데스크톱은 기존 인라인 메뉴 사용.
test.describe('모바일 햄버거 메뉴', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 9999) >= 768, '데스크톱은 기존 인라인 메뉴 사용');

  test('햄버거로 서랍을 열고 메뉴로 이동한다', async ({ page }) => {
    await page.goto('/');

    const burger = page.getByRole('button', { name: '메뉴 열기' });
    await expect(burger).toBeVisible();

    await burger.click();

    const drawer = page.getByTestId('mobile-drawer');
    await expect(drawer).toBeInViewport();

    await drawer.getByRole('link', { name: '실거래가' }).click();
    await expect(page).toHaveURL(/\/list/);
  });

  test('오버레이를 탭하면 서랍이 닫힌다', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '메뉴 열기' }).click();

    const drawer = page.getByTestId('mobile-drawer');
    await expect(drawer).toBeInViewport();

    await page.getByTestId('mobile-drawer-overlay').click();
    await expect(drawer).not.toBeInViewport();
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `pnpm exec playwright test --project=chromium-mobile mobile-nav`
Expected: FAIL — `getByRole('button', { name: '메뉴 열기' })` 가 보이지 않음(버거 버튼 미존재).

- [ ] **Step 3: `MobileDrawer` 컴포넌트 생성**

Create `app/(public)/_components/mobile-drawer.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SearchInput } from './search-input';

interface Props {
  open: boolean;
  onClose: () => void;
  onSoonClick: () => void;
}

const links = [
  { href: '/', label: '홈' },
  { href: '/list', label: '실거래가' },
  { href: '/life', label: '생활인프라' },
];

export function MobileDrawer({ open, onClose, onSoonClick }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <div className="md:hidden" aria-hidden={!open}>
      <div
        data-testid="mobile-drawer-overlay"
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/45 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <div
        data-testid="mobile-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="모바일 메뉴"
        className={`fixed right-0 top-0 z-40 flex h-full w-[78%] max-w-[320px] flex-col gap-1 bg-white p-5 shadow-[var(--shadow-soft)] transition-transform ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="mb-2 flex justify-end">
          <button
            onClick={onClose}
            aria-label="메뉴 닫기"
            className="grid h-9 w-9 place-items-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-soft)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mb-3">
          <SearchInput />
        </div>

        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            onClick={onClose}
            className="rounded-lg px-2 py-3 text-[15px] font-semibold text-[var(--color-text)] hover:bg-[var(--color-soft)]"
          >
            {l.label}
          </Link>
        ))}

        <button
          onClick={onSoonClick}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-3 text-left text-[15px] font-semibold text-[var(--color-text)] hover:bg-[var(--color-soft)]"
        >
          청약 <Badge tone="gray">Soon</Badge>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `Nav`에 버거 버튼 + 서랍 배선**

Replace the full contents of `app/(public)/_components/nav.tsx` with:

```tsx
'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SearchInput } from './search-input';
import { useState } from 'react';
import { SoonModal } from './soon-modal';
import { MobileDrawer } from './mobile-drawer';

export function Nav() {
  const [soonOpen, setSoonOpen] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-white/85 backdrop-blur">
        <nav className="mx-auto flex h-[72px] max-w-[1180px] items-center gap-6 px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-[34px] w-[34px] place-items-center rounded-xl bg-gradient-to-br from-[var(--color-blue)] to-[var(--color-sky)] text-base font-black text-white">
              임
            </span>
            <span className="text-[22px] font-black tracking-tighter text-[var(--color-blue-dark)]">
              임장온
            </span>
          </Link>

          <div className="hidden gap-6 text-[15px] font-semibold text-[var(--color-muted)] md:flex md:items-center">
            <Link href="/">홈</Link>
            <Link href="/list">실거래가</Link>
            <Link href="/life">생활인프라</Link>
            <button onClick={() => setSoonOpen('청약')} className="inline-flex items-center gap-1.5">
              청약 <Badge tone="gray">Soon</Badge>
            </button>
          </div>

          <div className="ml-auto hidden w-48 md:block lg:w-64">
            <SearchInput />
          </div>

          <button
            onClick={() => setMenuOpen(true)}
            aria-label="메뉴 열기"
            aria-expanded={menuOpen}
            className="ml-auto grid h-10 w-10 place-items-center rounded-lg text-[var(--color-text)] hover:bg-[var(--color-soft)] md:hidden"
          >
            <Menu size={22} />
          </button>
        </nav>
      </header>

      <MobileDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSoonClick={() => {
          setSoonOpen('청약');
          setMenuOpen(false);
        }}
      />

      <SoonModal open={!!soonOpen} topic={soonOpen} onClose={() => setSoonOpen(null)} />
    </>
  );
}
```

- [ ] **Step 5: 모바일 e2e 통과 확인**

Run: `pnpm exec playwright test --project=chromium-mobile mobile-nav`
Expected: PASS (2 tests).

- [ ] **Step 6: 데스크톱 회귀 확인 (기존 soon-modal/search 미파손)**

Run: `pnpm exec playwright test --project=chromium-desktop`
Expected: PASS — 데스크톱 메뉴는 변경 없음. (검색창 div는 `md:block`이라 데스크톱에서 그대로 노출. soon-modal 데스크톱 테스트 정상.)

- [ ] **Step 7: 커밋**

```bash
git add app/(public)/_components/mobile-drawer.tsx app/(public)/_components/nav.tsx tests/e2e/mobile-nav.spec.ts
git commit -m "feat(nav): 모바일 햄버거 메뉴(오른쪽 슬라이드 서랍) 추가"
```

---

### Task 2: 회귀·빌드 검증

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 타입체크**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 2: 린트**

Run: `pnpm lint`
Expected: 에러 없음.

- [ ] **Step 3: 프로덕션 빌드**

Run: `pnpm build`
Expected: 빌드 성공.

- [ ] **Step 4: 수동 확인 (브라우저)**

`pnpm dev` 후 브라우저 너비를 ~390px로 줄여:
1. 헤더에 햄버거(☰)만 보이고 검색창은 숨겨짐
2. ☰ 탭 → 오른쪽에서 서랍 슬라이드, 배경 어두워짐, 본문 스크롤 잠김
3. 서랍 맨 위 검색창 동작, 링크 탭 시 이동 + 서랍 닫힘
4. 청약 탭 → SoonModal 열림 + 서랍 닫힘
5. Esc / 오버레이 탭으로 닫힘
6. 너비를 ≥768px로 늘리면 햄버거 사라지고 기존 데스크톱 메뉴 + 검색창 노출

- [ ] **Step 5: (변경 있으면) 커밋**

검증 중 수정이 없었다면 추가 커밋 불필요.

---

## Self-Review 메모

- **Spec 커버리지:** 열림 방식(서랍, Task1 Step3), 검색창 서랍 상단(Step3 SearchInput), 헤더 검색 `hidden md:block`(Step4), 브레이크포인트 `md`(md:hidden / hidden md:flex), 청약 Soon→SoonModal(`onSoonClick`), 스크롤 잠금·Esc(useEffect), 닫기 트리거 4종(오버레이·X·링크·Esc), e2e(Task1 테스트) 모두 태스크에 매핑됨.
- **타입 일관성:** `MobileDrawer` props `{ open, onClose, onSoonClick }`가 `Nav`의 마운트부와 일치.
- **회귀 안전:** 모바일에선 데스크톱 링크가 `display:none`, 데스크톱에선 서랍 래퍼가 `md:hidden`(display:none)이라 `청약` 버튼이 뷰포트별로 정확히 1개만 매칭 → 기존 soon-modal 테스트 strict mode 충돌 없음.
