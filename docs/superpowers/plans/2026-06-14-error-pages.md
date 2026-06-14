# 에러 페이지 (404 / 500) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 404·500 에러 화면을 브랜드 톤의 공용 중앙 카드 컴포넌트로 통일하고, 루트 레이아웃 크래시 폴백(`global-error.tsx`)을 추가한다.

**Architecture:** 훅 없는 순수 컴포넌트 `ErrorState`(기존 `components/ui/card.tsx`의 `Card` 사용)를 만들고, `not-found.tsx`(404, 서버)·`(public)/error.tsx`(500, client)·`global-error.tsx`(루트 폴백, client) 세 라우트가 props만 주입해 재사용한다.

**Tech Stack:** Next.js App Router, React, Tailwind(디자인 토큰 CSS 변수), 기존 `Button`/`Card` UI 컴포넌트.

**검증 방식 메모:** 이 코드베이스는 vitest `environment: 'node'`만 쓰고 컴포넌트 테스트 하니스(jsdom/RTL)가 없다. 정적 프레젠테이션 컴포넌트를 위해 새 테스트 인프라를 도입하지 않는다(Simplicity First). 검증은 `npx tsc --noEmit` + `pnpm lint` + 수동 브라우저 확인으로 한다.

---

### Task 1: `ErrorState` 공용 컴포넌트

**Files:**
- Create: `components/error-state.tsx`
- 참고(읽기): `components/ui/card.tsx`(`Card`), `components/ui/button.tsx`(`Button`), `lib/cn.ts`

- [ ] **Step 1: 컴포넌트 작성**

`components/error-state.tsx` 생성:

```tsx
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

interface ErrorStateProps {
  /** "404" | "500" 등 조용한 라벨 배지. 생략 가능 */
  code?: string;
  title: string;
  description: string;
  /** 장식용 아이콘(라인 SVG). aria-hidden 처리됨 */
  icon?: ReactNode;
  /** 버튼/링크 등 액션. 페이지마다 주입 */
  actions: ReactNode;
  /** error.digest 등 지원용 식별자. 있을 때만 표기 */
  digest?: string;
}

export function ErrorState({ code, title, description, icon, actions, digest }: ErrorStateProps) {
  return (
    <main className="grid min-h-[70vh] place-items-center px-6 py-16">
      <Card className="w-full max-w-md px-8 py-10 text-center">
        {icon && (
          <div
            aria-hidden
            className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-[var(--color-sky-soft)] text-[var(--color-blue)]"
          >
            {icon}
          </div>
        )}
        {code && (
          <p className="mb-2 text-xs font-bold tracking-wide text-[var(--color-muted)]">{code}</p>
        )}
        <h1 className="text-2xl font-black text-[var(--color-blue-dark)]">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">{description}</p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {actions}
        </div>
        {digest && (
          <p className="mt-6 text-[11px] text-[var(--color-muted)]">오류 코드: {digest}</p>
        )}
      </Card>
    </main>
  );
}
```

근거: `Card`는 `cn`(tailwind-merge)을 쓰므로 `px-8 py-10`이 기본 `p-6`을 덮어쓴다. 아이콘 원형 배경에는 그림자를 얹지 않는다(One-Shadow Rule).

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"`
Expected: `0`

- [ ] **Step 3: 커밋**

```bash
git add components/error-state.tsx
git commit -m "feat(error-pages): 공용 ErrorState 컴포넌트 추가"
```

---

### Task 2: 404 — `not-found.tsx` 재작성

**Files:**
- Modify(전체 교체): `app/not-found.tsx`

- [ ] **Step 1: 파일 재작성**

`app/not-found.tsx` 내용을 아래로 교체:

```tsx
import Link from 'next/link';
import { ErrorState } from '@/components/error-state';

export default function NotFound() {
  return (
    <ErrorState
      code="404"
      title="페이지를 찾을 수 없어요"
      description="요청하신 페이지가 존재하지 않거나 주소가 변경되었어요."
      icon={
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      }
      actions={
        <>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--color-blue)] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[var(--color-blue-dark)]"
          >
            홈으로
          </Link>
          <Link
            href="/region"
            className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--color-line)] bg-white px-5 py-2.5 text-sm font-bold text-[var(--color-blue-dark)] transition hover:bg-[var(--color-soft)]"
          >
            지역 둘러보기
          </Link>
        </>
      }
    />
  );
}
```

근거: `not-found.tsx`는 서버 컴포넌트 유지(데이터 의존 없음). 링크는 `next/link`. 버튼 스타일은 `components/ui/button.tsx`의 primary(`bg-[var(--color-blue)] ... hover:bg-[var(--color-blue-dark)]`)·secondary(`border ... bg-white hover:bg-[var(--color-soft)]`) variant와 동일한 클래스를 사용해 톤을 맞춘다.

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"`
Expected: `0`

- [ ] **Step 3: 커밋**

```bash
git add app/not-found.tsx
git commit -m "feat(error-pages): 404 화면 브랜드 톤 카드로 재작성"
```

---

### Task 3: 500 — `(public)/error.tsx` 재작성

**Files:**
- Modify(전체 교체): `app/(public)/error.tsx`

- [ ] **Step 1: 파일 재작성**

`app/(public)/error.tsx` 내용을 아래로 교체:

```tsx
'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      code="500"
      title="문제가 발생했어요"
      description="일시적인 오류일 수 있어요. 잠시 후 다시 시도해주세요."
      digest={error.digest}
      icon={
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      }
      actions={
        <>
          <Button onClick={reset}>다시 시도</Button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--color-line)] bg-white px-5 py-2.5 text-sm font-bold text-[var(--color-blue-dark)] transition hover:bg-[var(--color-soft)]"
          >
            홈으로
          </Link>
        </>
      }
    />
  );
}
```

근거: client 컴포넌트라 `reset`을 `Button`의 `onClick`으로 직접 연결. 기존 `console.error(error)` 로깅 유지. `error.digest`를 `digest` prop으로 전달.

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"`
Expected: `0`

- [ ] **Step 3: 커밋**

```bash
git add "app/(public)/error.tsx"
git commit -m "feat(error-pages): 500 에러 화면 브랜드 톤 카드로 재작성"
```

---

### Task 4: 루트 폴백 — `global-error.tsx` 신규

**Files:**
- Create: `app/global-error.tsx`

- [ ] **Step 1: 파일 작성**

`app/global-error.tsx` 생성:

```tsx
'use client';

import './globals.css';
import { useEffect } from 'react';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ko">
      <body>
        <ErrorState
          code="500"
          title="문제가 발생했어요"
          description="페이지를 불러오는 중 문제가 발생했어요. 잠시 후 다시 시도해주세요."
          digest={error.digest}
          icon={
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          }
          actions={
            <>
              <Button onClick={reset}>다시 시도</Button>
              <a
                href="/"
                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--color-line)] bg-white px-5 py-2.5 text-sm font-bold text-[var(--color-blue-dark)] transition hover:bg-[var(--color-soft)]"
              >
                홈으로
              </a>
            </>
          }
        />
      </body>
    </html>
  );
}
```

근거(핵심 함정): `global-error.tsx`는 루트 레이아웃을 **대체**하므로 `<html><body>`를 직접 렌더하고 `import './globals.css'`로 디자인 토큰을 직접 불러와야 한다(누락 시 토큰 미적용). 루트 폴백 안정성을 위해 홈 이동은 `next/link` 대신 `<a href="/">`로 처리.

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"`
Expected: `0`

- [ ] **Step 3: 커밋**

```bash
git add app/global-error.tsx
git commit -m "feat(error-pages): 루트 크래시 폴백 global-error 추가"
```

---

### Task 5: 최종 검증

**Files:** 없음(검증 전용)

- [ ] **Step 1: 타입체크 + lint**

Run:
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"
pnpm lint 2>&1 | tail -3
```
Expected: 타입 에러 `0`, lint 에러 없음.

- [ ] **Step 2: 수동 브라우저 확인**

```bash
pnpm dev
```
- 존재하지 않는 경로(예: `http://localhost:3000/__nope__`) → 404 카드(아이콘·"404"·홈으로·지역 둘러보기) 렌더 확인.
- 의도적 오류 페이지 또는 throw가 있는 경로 → 500 카드 + "다시 시도" 클릭 시 `reset` 동작 확인.
- 모바일 폭(개발자도구)에서 버튼이 세로 스택으로 정상 표시되는지 확인.
- (선택) `global-error`는 루트 레이아웃 크래시 시에만 표시되므로, 토큰 적용 여부는 코드 리뷰로 갈음.

- [ ] **Step 3: 확인 사항 보고**

검증 결과(타입/ lint 통과 여부, 수동 확인 스크린샷 또는 관찰)를 사용자에게 보고. 별도 코드 변경이 없으면 커밋 없음.
