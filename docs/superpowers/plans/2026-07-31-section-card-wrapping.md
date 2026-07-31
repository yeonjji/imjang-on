# 하단 섹션 카드화 + 대출상품 카드 높이 정렬 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상세 페이지 하단의 `최신 부동산·청약·금융 소식`·`관련 가이드` 섹션을 `근처 지하철역`과 같은 카드로 감싸고, 맞춤전세보증찾기의 FAQ를 페이지 맨 아래로 옮기고, `/finance` 대출상품 카드의 행 높이를 정렬한다.

**Architecture:** 세 변경은 서로 독립적이다. 앞의 둘은 공용 컴포넌트 2개(`board-briefing-section.tsx`, `related-guides.tsx`)만 고치면 15개 페이지에 한 번에 반영된다. 바깥은 기존 `Card` 컴포넌트를 재사용하고, 흰 카드 중첩을 피하려 안쪽 아이템 배경을 `--color-soft`로 내린다. 나머지 둘은 각각 한 파일만 손댄다.

**Tech Stack:** Next.js App Router (React Server Components), Tailwind CSS v4 (`@theme` CSS 변수), vitest + `react-dom/server` `renderToStaticMarkup` SSR 문자열 단언, pnpm

**참조 스펙:** `docs/superpowers/specs/2026-07-31-section-card-wrapping-design.md`

## Global Constraints

- 패키지 매니저는 **pnpm** 고정 (`pnpm@9.15.9`, Node >= 20). `npm`/`yarn` 사용 금지.
- 색·반경·그림자는 **`app/globals.css`의 `@theme`에 이미 있는 토큰만** 쓴다. 새 토큰 추가 금지. 쓰는 값: `--color-card` `#ffffff`, `--color-soft` `#f1f7ff`, `--color-sky-soft` `#e0f2fe`, `--color-line` `#dbeafe`, `--color-blue` `#2563eb`, `--color-blue-dark` `#1e3a8a`, `--color-muted` `#64748b`, `--radius-card` `22px`, `--shadow-soft`.
- 그림자는 `--shadow-soft` **하나만** 쓴다 (프로젝트 디자인 원칙). 단 `loan-card.tsx`의 기존 `hover:shadow-lg`는 이번 범위 밖이므로 **그대로 둔다**.
- ESLint `no-unused-vars`가 **error**다. 코드를 지운 뒤 import·변수가 미사용으로 남으면 CI lint가 막힌다. 매 태스크 끝에 `pnpm lint`를 돌린다.
- 컴포넌트 SSR 테스트는 `tests/components/*-ssr.test.ts` 규약을 따른다: 파일 상단에 `(globalThis as unknown as { React: typeof React }).React = React;` shim 필수 (vitest esbuild가 classic JSX 런타임으로 변환하기 때문).
- `pnpm test:unit`이 `tests/components`를 포함한다. 통합/e2e는 이번 변경과 무관하므로 돌리지 않는다.
- 커밋 메시지는 기존 관례대로 `type(scope): 한글 요약` 형식.
- 작업 브랜치는 `feat/section-card-wrapping`. `main`에 직접 커밋하지 않는다.

## File Structure

| 파일 | 역할 | 변경 |
|---|---|---|
| `app/(public)/_components/related-guides.tsx` | `관련 가이드` 섹션 (순수 뷰 + async 래퍼) | 수정 |
| `app/(public)/_components/board-briefing-section.tsx` | `최신 소식` 섹션 (async 단일 컴포넌트) | 수정 — 순수 뷰 분리 |
| `app/(public)/jeonse-guarantee/[grntDvcd]/page.tsx` | 전세보증 상세 페이지 | 수정 — FAQ 위치만 |
| `app/(public)/finance/_components/loan-card.tsx` | 대출상품 목록 카드 | 수정 |
| `tests/components/related-guides-ssr.test.ts` | 기존 테스트 | 케이스 추가 |
| `tests/components/board-briefing-ssr.test.ts` | 신규 | 생성 |
| `tests/components/loan-card-ssr.test.ts` | 신규 | 생성 |

**`board-briefing-section.tsx`의 뷰 분리에 대해:** 현재 이 컴포넌트는 `async` 함수 하나로, 내부에서 `getHomeLatestPosts()`(Prisma)를 호출한다. 그래서 SSR 문자열 테스트를 붙일 수 없다. 형제 파일 `related-guides.tsx`가 이미 `RelatedGuidesView`(순수) + `RelatedGuides`(async 래퍼)로 나뉘어 있으므로, 같은 형태로 맞춘다. export 이름 `BoardBriefingSection`과 시그니처는 그대로라 **호출부 15곳은 손대지 않는다.**

---

### Task 1: `관련 가이드` 섹션 카드화

**Files:**
- Modify: `app/(public)/_components/related-guides.tsx`
- Test: `tests/components/related-guides-ssr.test.ts` (기존 파일에 케이스 추가)

**Interfaces:**
- Consumes: `Card` (`components/ui/card.tsx`) — `({ className, ...props }: HTMLAttributes<HTMLDivElement>) => JSX.Element`. `rounded-[var(--radius-card)] bg-[var(--color-card)] shadow-[var(--shadow-soft)] p-6`을 `cn()`으로 `className`과 합쳐 `<div>`를 렌더한다.
- Produces: `RelatedGuidesView({ items: RelatedGuideItem[], className?: string })` — 시그니처 변경 없음. Task 2가 여기서 확정한 타일 클래스 문자열을 그대로 재사용한다:
  `flex flex-col rounded-[16px] border border-[var(--color-line)] bg-[var(--color-soft)] p-4 transition hover:border-[var(--color-blue)] hover:bg-[var(--color-sky-soft)]`

- [ ] **Step 1: 작업 브랜치 생성**

```bash
git switch -c feat/section-card-wrapping
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/components/related-guides-ssr.test.ts`의 마지막 `it(...)` 블록 뒤, `describe` 닫는 괄호 **앞**에 아래 두 케이스를 추가한다.

```ts
  it('섹션 전체를 Card(흰 배경 + shadow-soft)로 감싼다', () => {
    const items: RelatedGuideItem[] = [{ id: 1n, slug: 'a', title: '가이드 A' }];
    const html = renderToStaticMarkup(createElement(RelatedGuidesView, { items }));
    expect(html).toMatch(/^<div class="[^"]*bg-\[var\(--color-card\)\]/);
    expect(html).toMatch(/^<div class="[^"]*shadow-\[var\(--shadow-soft\)\]/);
  });

  it('안쪽 타일은 흰 카드가 아니라 연한 배경을 쓴다', () => {
    const items: RelatedGuideItem[] = [{ id: 1n, slug: 'a', title: '가이드 A' }];
    const html = renderToStaticMarkup(createElement(RelatedGuidesView, { items }));
    expect(html).toContain('bg-[var(--color-soft)]');
    expect(html).not.toContain('bg-white');
  });
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

```bash
pnpm exec dotenv -e .env.test -- vitest run tests/components/related-guides-ssr.test.ts
```

Expected: 새 케이스 2개 FAIL. 첫 번째는 루트가 아직 `<section class="...">`라 정규식 불일치, 두 번째는 타일이 아직 `bg-white`라 `not.toContain('bg-white')` 실패.

- [ ] **Step 4: 구현**

`app/(public)/_components/related-guides.tsx`의 상단 import에 `Card`를 추가하고 `RelatedGuidesView`를 아래로 교체한다. 파일 하단의 `RelatedGuides` async 래퍼는 **건드리지 않는다.**

```tsx
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { guideCategoryForPage } from '@/lib/guide/page-category';
import { getGuidesByCategory, type RelatedGuideItem } from '@/lib/guide/queries';

/**
 * POI/매물 상세 하단 '관련 가이드' 섹션의 순수 표현 뷰.
 * items가 비면 렌더하지 않는다(빈 블록 금지).
 */
export function RelatedGuidesView({
  items,
  className,
}: {
  items: RelatedGuideItem[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <Card className={className}>
      <div className="flex flex-wrap items-end justify-between gap-x-2.5 gap-y-1">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-blue-dark)]">관련 가이드</h2>
          <p className="mt-1 text-[13px] text-[var(--color-muted)]">실제 절차·개념을 정리한 안내 글</p>
        </div>
        <Link href="/guide" className="text-[13px] font-bold text-[var(--color-blue)] hover:underline">
          전체 보기 →
        </Link>
      </div>

      <div className="mt-[18px] grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((g) => (
          <Link
            key={g.slug}
            href={`/guide/${g.slug}`}
            className="flex flex-col rounded-[16px] border border-[var(--color-line)] bg-[var(--color-soft)] p-4 transition hover:border-[var(--color-blue)] hover:bg-[var(--color-sky-soft)]"
          >
            <h3 className="line-clamp-2 text-[15px] font-black leading-snug tracking-tight text-[var(--color-blue-dark)]">
              {g.title}
            </h3>
          </Link>
        ))}
      </div>
    </Card>
  );
}
```

바뀐 곳 요약: 루트 `<section>` → `<Card>`, `<h2>` `text-xl font-black tracking-tight md:text-[22px]` → `text-lg font-bold text-[var(--color-blue-dark)]`, 격자 `gap-4` → `gap-3`, 타일 `rounded-[20px] ... bg-white p-5 shadow-[var(--shadow-soft)]` → `rounded-[16px] ... bg-[var(--color-soft)] p-4` + `hover:bg-[var(--color-sky-soft)]` 추가.

- [ ] **Step 5: 테스트 통과 확인**

```bash
pnpm exec dotenv -e .env.test -- vitest run tests/components/related-guides-ssr.test.ts
```

Expected: 4개 케이스 모두 PASS.

- [ ] **Step 6: lint · typecheck**

```bash
pnpm lint && pnpm typecheck
```

Expected: 둘 다 통과. (실패 시 흔한 원인 — `Card` import 누락, 또는 `cn` 미사용 import 잔존)

- [ ] **Step 7: 커밋**

```bash
git add app/\(public\)/_components/related-guides.tsx tests/components/related-guides-ssr.test.ts
git commit -m "feat(ui): 관련 가이드 섹션을 Card로 감싸고 타일을 연한 배경으로"
```

---

### Task 2: `최신 소식` 섹션 카드화 (+ 순수 뷰 분리)

**Files:**
- Modify: `app/(public)/_components/board-briefing-section.tsx`
- Create: `tests/components/board-briefing-ssr.test.ts`

**Interfaces:**
- Consumes: `Card` (Task 1과 동일). `HomePostItem` (`lib/board/post.ts`) — `{ id: bigint; slug: string; title: string; summary: string; category: PostCategory; sourceName: string; publishedAt: Date }`. `PostCategory`는 `'FINANCE' | 'LOAN' | 'ECONOMY' | 'SUBSCRIPTION' | 'REALESTATE'`.
- Produces:
  - `BoardBriefingView({ posts: HomePostItem[], className?: string, heading?: string })` — 신규 export, 순수 동기 컴포넌트.
  - `BoardBriefingSection({ className?, excludeId?: bigint, heading?: string })` — **기존 시그니처 그대로**. 호출부 15곳 무변경.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/components/board-briefing-ssr.test.ts` 를 새로 만든다.

```ts
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BoardBriefingView } from '@/app/(public)/_components/board-briefing-section';
import type { HomePostItem } from '@/lib/board/post';

// 컴포넌트는 자동 JSX 런타임을 쓰지만 vitest(esbuild)는 classic 런타임으로 변환해
// React.createElement를 전역에서 찾는다. (related-guides-ssr.test.ts와 동일 shim)
(globalThis as unknown as { React: typeof React }).React = React;

const posts: HomePostItem[] = [
  {
    id: 1n,
    slug: 'busan-center',
    title: '부산 서민금융 복합지원센터 개소',
    summary: '',
    category: 'LOAN',
    sourceName: '정책브리핑',
    // 로컬 타임존 기준으로 고정(UTC 문자열은 shortDate가 TZ에 따라 밀린다)
    publishedAt: new Date(2026, 6, 30),
  },
];

describe('BoardBriefingView SSR', () => {
  it('헤딩·카테고리 배지·제목·/board/{id} 링크를 렌더한다', () => {
    const html = renderToStaticMarkup(createElement(BoardBriefingView, { posts }));
    expect(html).toContain('최신 부동산·청약·금융 소식');
    expect(html).toContain('부산 서민금융 복합지원센터 개소');
    expect(html).toContain('대출'); // categoryLabel('LOAN')
    expect(html).toContain('href="/board/1"');
  });

  it('heading prop으로 제목을 갈아끼울 수 있다', () => {
    const html = renderToStaticMarkup(
      createElement(BoardBriefingView, { posts, heading: '임장ON 브리핑' }),
    );
    expect(html).toContain('임장ON 브리핑');
    expect(html).not.toContain('최신 부동산·청약·금융 소식');
  });

  it('섹션 전체를 Card(흰 배경 + shadow-soft)로 감싼다', () => {
    const html = renderToStaticMarkup(createElement(BoardBriefingView, { posts }));
    expect(html).toMatch(/^<div class="[^"]*bg-\[var\(--color-card\)\]/);
    expect(html).toMatch(/^<div class="[^"]*shadow-\[var\(--shadow-soft\)\]/);
  });

  it('타일은 연한 배경, 카테고리 배지는 흰 배경으로 대비를 유지한다', () => {
    const html = renderToStaticMarkup(createElement(BoardBriefingView, { posts }));
    expect(html).toContain('bg-[var(--color-soft)]');
    expect(html).toContain('rounded-full bg-white');
  });

  it('글이 없으면 아무것도 렌더하지 않는다', () => {
    const html = renderToStaticMarkup(createElement(BoardBriefingView, { posts: [] }));
    expect(html).toBe('');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
pnpm exec dotenv -e .env.test -- vitest run tests/components/board-briefing-ssr.test.ts
```

Expected: FAIL — `BoardBriefingView` export가 없어 import 에러 (`does not provide an export named 'BoardBriefingView'`).

- [ ] **Step 3: 구현**

`app/(public)/_components/board-briefing-section.tsx` 전체를 아래로 교체한다.

```tsx
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { isBoardPublic } from '@/lib/board/visibility';
import { getHomeLatestPosts, type HomePostItem } from '@/lib/board/post';
import { boardPath } from '@/lib/board/slug';
import { canonicalizeSourceName } from '@/lib/board/source-name';
import { categoryLabel } from '@/lib/board/labels';

/** publishedAt → "MM.DD" (등록일 보조 표기). */
function shortDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}.${dd}`;
}

/**
 * '최신 부동산·청약·금융 소식' 섹션의 순수 표현 뷰.
 * posts가 비면 렌더하지 않는다(빈 블록 금지).
 */
export function BoardBriefingView({
  posts,
  className,
  heading,
}: {
  posts: HomePostItem[];
  className?: string;
  heading?: string;
}) {
  if (posts.length === 0) return null;

  return (
    <Card className={className}>
      <div className="flex flex-wrap items-end justify-between gap-x-2.5 gap-y-1">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-blue-dark)]">
            {heading ?? '최신 부동산·청약·금융 소식'}
          </h2>
          <p className="mt-1 text-[13px] text-[var(--color-muted)]">공공기관 보도자료·고시를 사실 위주로 정리</p>
        </div>
        <Link href="/board" className="text-[13px] font-bold text-[var(--color-blue)] hover:underline">
          전체 보기 →
        </Link>
      </div>

      <div className="mt-[18px] grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {posts.map((p) => (
          <Link
            key={p.slug}
            href={boardPath(p.id)}
            className="flex flex-col rounded-[16px] border border-[var(--color-line)] bg-[var(--color-soft)] p-4 transition hover:border-[var(--color-blue)] hover:bg-[var(--color-sky-soft)]"
          >
            <span className="inline-block w-fit rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue)]">
              {categoryLabel(p.category)}
            </span>
            <h3 className="mt-2.5 line-clamp-2 text-[15px] font-black leading-snug tracking-tight text-[var(--color-blue-dark)]">
              {p.title}
            </h3>
            <span className="mt-auto flex items-center gap-1.5 pt-3 text-xs text-[var(--color-muted)]">
              <span className="truncate">{canonicalizeSourceName(p.sourceName)}</span>
              <span>·</span>
              <span className="whitespace-nowrap">{shortDate(p.publishedAt)}</span>
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

/**
 * 상세 페이지 하단 '최신 부동산·청약·금융 소식' 섹션(async 데이터 래퍼).
 * 카테고리 매칭 없이 PUBLISHED 글 최신 4건을 노출한다.
 * 게시판이 비공개이거나 글이 없으면 렌더하지 않는다.
 */
export async function BoardBriefingSection({
  className,
  excludeId,
  heading,
}: {
  className?: string;
  excludeId?: bigint;
  heading?: string;
}) {
  if (!isBoardPublic()) return null;
  const posts = await getHomeLatestPosts(4, excludeId);
  return <BoardBriefingView posts={posts} className={className} heading={heading} />;
}
```

주의: `posts.length === 0` 조기 반환이 async 래퍼에서 뷰로 옮겨갔다. 동작은 동일하다(빈 배열 → `null`).

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm exec dotenv -e .env.test -- vitest run tests/components/board-briefing-ssr.test.ts
```

Expected: 5개 케이스 모두 PASS.

- [ ] **Step 5: 전체 unit 테스트로 회귀 확인**

```bash
pnpm test:unit
```

Expected: 전부 PASS. 특히 `weekly-board-ssr.test.ts`가 게시판 관련이라 함께 본다.

- [ ] **Step 6: lint · typecheck**

```bash
pnpm lint && pnpm typecheck
```

Expected: 둘 다 통과.

- [ ] **Step 7: 커밋**

```bash
git add app/\(public\)/_components/board-briefing-section.tsx tests/components/board-briefing-ssr.test.ts
git commit -m "feat(ui): 최신 소식 섹션을 Card로 감싸고 순수 뷰 분리"
```

---

### Task 3: 맞춤전세보증찾기 FAQ를 페이지 맨 아래로

**Files:**
- Modify: `app/(public)/jeonse-guarantee/[grntDvcd]/page.tsx` (line 188 제거, line 243 아래에 추가)

**Interfaces:**
- Consumes: `Faq` (`app/(public)/_components/faq.tsx`) — `({ category?, items?, title? })`. 자체적으로 `mt-12`를 가진 `<section>`을 렌더하고 `FAQPage` JSON-LD를 함께 내보낸다. `RelatedGuides` (Task 1의 async 래퍼).
- Produces: 없음 (페이지 레벨 변경).

**자동 테스트 없음 — 이유:** 이 페이지는 HF 상품 데이터를 DB에서 읽는 async 서버 컴포넌트다. SSR 문자열 테스트를 붙이려면 Prisma 모킹이 필요하고, e2e를 붙이려면 `jeonse_guarantee` 시드가 필요한데 `tests/e2e`에 해당 시드가 없다. 렌더 순서만 바뀌는 변경이라 **diff 확인 + 로컬 브라우저 육안 확인**으로 검증한다.

- [ ] **Step 1: 현재 FAQ 위치 확인**

```bash
grep -n "jeonseFaq\|<Faq\|RelatedGuides\|BoardBriefingSection\|SourceCaption" "app/(public)/jeonse-guarantee/[grntDvcd]/page.tsx"
```

Expected: `{jeonseFaq && <Faq items={jeonseFaq} />}` 가 188행 근처, `<SourceCaption ids={['hf-jeonse-guarantee']} />`(189행)와 `</main>`(190행) **위**에 있다.

- [ ] **Step 2: `<main>`에서 FAQ 제거**

아래 한 줄을 삭제한다. `<SourceCaption ...>`은 `<main>`에 그대로 남긴다(왼쪽 본문의 출처이므로).

```tsx
          {jeonseFaq && <Faq items={jeonseFaq} />}
```

- [ ] **Step 3: 하단 블록 맨 끝에 FAQ 추가**

파일 하단의 전폭 블록을 아래처럼 만든다. `<RelatedGuides ... />` 바로 다음 줄에 추가한다.

```tsx
      <div className="lg:w-[calc(100%_-_352px)]">
        <JeonseDiscoverySection
          briefing={briefing}
          weeklySubscriptions={weeklySubscriptions}
          relatedLoans={relatedLoans}
        />

        <BoardBriefingSection heading="임장ON 브리핑" className="mt-10" />
        <RelatedGuides pageKey="jeonse-guarantee" className="mt-10" />
        {jeonseFaq && <Faq items={jeonseFaq} />}
      </div>
```

`Faq`(내부 `FaqList`)가 자체 `mt-12`를 갖고 있어 추가 마진 지정은 하지 않는다.

- [ ] **Step 4: 이동 결과 확인**

```bash
grep -n "jeonseFaq\|<Faq\|RelatedGuides\|SourceCaption\|</main>" "app/(public)/jeonse-guarantee/[grntDvcd]/page.tsx"
```

Expected: `<Faq items={jeonseFaq} />`의 행 번호가 `<RelatedGuides ...>`보다 **크고**, `</main>`보다도 크다. `import { Faq }`(13행)와 `composeDetailFaq`/`buildJeonseFaq` 사용은 그대로 남아 있다.

- [ ] **Step 5: lint · typecheck**

```bash
pnpm lint && pnpm typecheck
```

Expected: 둘 다 통과. `Faq` import가 여전히 쓰이므로 미사용 경고는 없어야 한다.

- [ ] **Step 6: 커밋**

```bash
git add "app/(public)/jeonse-guarantee/[grntDvcd]/page.tsx"
git commit -m "fix(ui): 전세보증 상세 FAQ를 관련 가이드 아래로 이동"
```

---

### Task 4: 대출상품 카드 높이 정렬

**Files:**
- Modify: `app/(public)/finance/_components/loan-card.tsx`
- Create: `tests/components/loan-card-ssr.test.ts`

**Interfaces:**
- Consumes: `LoanSummary` (`lib/loan/list.ts`) — `{ seq: number; finprdnm: string; ofrinstnm: string | null; instCtg: string | null; lnlmt: number | null; irt: string | null; usageTags: string[]; targetTags: string[]; regionTags: string[]; operPeriod: string | null }`. `targetLabels(tags: string[]): string[]` (`lib/loan/categories.ts`). `Badge({ tone })` (`components/ui/badge.tsx`).
- Produces: `LoanCard({ item: LoanSummary })` — 시그니처 변경 없음. 호출부는 `loan-explorer.tsx:105`의 `grid grid-cols-1 gap-4 sm:grid-cols-2` 하나뿐이며 **그리드는 손대지 않는다**.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/components/loan-card-ssr.test.ts` 를 새로 만든다.

```ts
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoanCard } from '@/app/(public)/finance/_components/loan-card';
import type { LoanSummary } from '@/lib/loan/list';

// 컴포넌트는 자동 JSX 런타임을 쓰지만 vitest(esbuild)는 classic 런타임으로 변환해
// React.createElement를 전역에서 찾는다. (loan-explorer-ssr.test.ts와 동일 shim)
(globalThis as unknown as { React: typeof React }).React = React;

const base: LoanSummary = {
  seq: 1,
  finprdnm: '햇살론유스',
  ofrinstnm: '서민금융진흥원',
  instCtg: '공공기관',
  lnlmt: 1200,
  irt: '3.5',
  usageTags: ['생계'],
  targetTags: [],
  regionTags: [],
  operPeriod: '상시',
};

describe('LoanCard SSR', () => {
  it('그리드 행 높이를 채우도록 링크와 article 모두 h-full을 갖는다', () => {
    const html = renderToStaticMarkup(createElement(LoanCard, { item: base }));
    expect(html).toMatch(/<a [^>]*class="block h-full"/);
    expect(html).toMatch(/<article class="[^"]*\bh-full\b[^"]*\bflex-col\b/);
  });

  it('용도 배지 블록이 mt-auto로 카드 바닥에 정렬된다', () => {
    const html = renderToStaticMarkup(createElement(LoanCard, { item: base }));
    expect(html).toMatch(/<div class="mt-auto [^"]*"/);
    expect(html).toContain('생계');
  });

  it('용도 배지가 없는 상품은 mt-auto 블록 없이 렌더된다', () => {
    const html = renderToStaticMarkup(
      createElement(LoanCard, { item: { ...base, usageTags: [] } }),
    );
    expect(html).toContain('햇살론유스');
    expect(html).not.toContain('mt-auto');
  });

  it('기본 정보(기관·금리·한도·운영기간)를 그대로 렌더한다', () => {
    const html = renderToStaticMarkup(createElement(LoanCard, { item: base }));
    expect(html).toContain('서민금융진흥원');
    expect(html).toContain('공공기관');
    expect(html).toContain('금리 3.5');
    expect(html).toContain('1,200');
    expect(html).toContain('상시');
    expect(html).toContain('href="/finance/1"');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
pnpm exec dotenv -e .env.test -- vitest run tests/components/loan-card-ssr.test.ts
```

Expected: 앞 두 케이스 FAIL — 현재 `<a class="block">`이고 `<article>`에 `h-full`/`flex-col`이 없으며 배지 `<div>`에 `mt-auto`가 없다. 뒤 두 케이스는 PASS (세 번째는 현재도 `mt-auto`가 없어서 통과 — 회귀 방지용).

- [ ] **Step 3: 구현**

`app/(public)/finance/_components/loan-card.tsx` 전체를 아래로 교체한다.

```tsx
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { targetLabels } from '@/lib/loan/categories';
import type { LoanSummary } from '@/lib/loan/list';

export function LoanCard({ item }: { item: LoanSummary }) {
  const targets = targetLabels(item.targetTags);
  const regions = item.regionTags.filter((r) => r !== '전국');
  const hasSub = targets.length > 0 || regions.length > 0;
  return (
    <Link href={`/finance/${item.seq}`} className="block h-full">
      <article className="flex h-full flex-col rounded-[22px] border border-[var(--color-line)] bg-white px-6 py-5 shadow-[var(--shadow-soft)] transition hover:shadow-lg">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h3 className="break-keep text-lg font-bold text-[var(--color-blue-dark)]">
            {item.finprdnm}
          </h3>
          {item.lnlmt != null && (
            <span className="shrink-0 whitespace-nowrap text-sm font-bold tabular-nums text-[var(--color-blue)]">
              한도 {item.lnlmt.toLocaleString()}만원
            </span>
          )}
        </div>
        <p className="text-sm text-[var(--color-muted)]">
          {item.ofrinstnm ?? '—'}
          {item.instCtg ? ` · ${item.instCtg}` : ''}
          {item.irt ? ` · 금리 ${item.irt}` : ''}
        </p>
        {hasSub && (
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {targets.length > 0 && (
              <>
                <span className="font-semibold">대상</span> {targets.slice(0, 2).join('·')}
                {targets.length > 2 ? ' 외' : ''}
              </>
            )}
            {targets.length > 0 && regions.length > 0 ? ' · ' : ''}
            {regions.length > 0
              ? `${regions.slice(0, 2).join('·')}${regions.length > 2 ? ' 외' : ''}`
              : ''}
          </p>
        )}
        {item.operPeriod && (
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            <span className="font-semibold">운영기간</span> · {item.operPeriod}
          </p>
        )}
        {item.usageTags.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
            {item.usageTags.map((t) => (
              <Badge key={t} tone="blue">
                {t}
              </Badge>
            ))}
          </div>
        )}
      </article>
    </Link>
  );
}
```

바뀐 곳 요약:
1. `<Link className="block">` → `"block h-full"`
2. `<article>`에 `flex h-full flex-col` 추가
3. 배지 `<div>`에 `mt-auto ... pt-3` 추가
4. 뒤 요소의 존재 여부로 `mb-1`/`mb-3`을 계산하던 삼항 3곳을 제거하고, 뒤 요소에 `mt-1`을 붙이는 방식으로 단순화. `hasSub`/`targets`/`regions`는 렌더 조건과 본문에 계속 쓰이므로 미사용이 되지 않는다.

`hover:shadow-lg`는 기존 그대로 둔다(이번 범위 밖).

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm exec dotenv -e .env.test -- vitest run tests/components/loan-card-ssr.test.ts tests/components/loan-explorer-ssr.test.ts
```

Expected: 두 파일 모두 PASS. `loan-explorer-ssr.test.ts`가 `LoanCard`를 통해 렌더되므로 회귀 여부를 같이 본다.

- [ ] **Step 5: lint · typecheck**

```bash
pnpm lint && pnpm typecheck
```

Expected: 둘 다 통과.

- [ ] **Step 6: 커밋**

```bash
git add app/\(public\)/finance/_components/loan-card.tsx tests/components/loan-card-ssr.test.ts
git commit -m "fix(ui): 대출상품 카드 행 높이 정렬 및 배지 바닥 정렬"
```

---

### Task 5: 통합 검증 (육안 확인)

**Files:** 없음 (검증 전용). 문제 발견 시 해당 태스크로 되돌아간다.

**Interfaces:**
- Consumes: Task 1~4의 결과 전부.
- Produces: 없음.

**주의:** 로컬 dev는 운영 DB를 SSH 터널 + read-only 세션으로 붙여 띄운다. env 파일은 반드시 `.env.*.local`을 쓴다(`.env.qa`는 커밋되는 파일이다). 운영 도메인(`imjangon.co.kr`)에 curl 버스트를 날리지 않는다.

- [ ] **Step 1: 전체 테스트 · lint · typecheck**

```bash
pnpm test:unit && pnpm lint && pnpm typecheck
```

Expected: 전부 통과.

- [ ] **Step 2: 빌드 확인**

```bash
pnpm build
```

Expected: 통과. (`ci.yml`에 `pnpm build`가 없어서 CI 초록이 빌드 성공을 보장하지 않는다 — 여기서 직접 확인한다.)

- [ ] **Step 3: dev 서버 기동**

```bash
pnpm dev
```

- [ ] **Step 4: 데스크톱(1280px) 육안 확인**

브라우저에서 아래를 열고 각 항목을 확인한다. 각 URL의 id는 목록 페이지에서 아무 항목이나 눌러 얻는다 — `/apt`(실거래가 목록), `/jeonse-guarantee`(전세보증 목록), `/guide`(가이드 목록), `/board`(게시판 목록).

| URL | 확인 |
|---|---|
| `/apt/<임의 id>` | `최신 소식`·`관련 가이드`가 위쪽 `근처 지하철역`과 같은 카드 모양(같은 모서리 반경·그림자)인가. 안쪽 타일이 카드 배경에 묻히지 않고 경계가 보이는가. 카테고리 배지(`대출`/`부동산`/`청약`)가 읽히는가. |
| `/jeonse-guarantee/<임의 grntDvcd>` | 순서가 `전세보증 탐색 → 임장ON 브리핑 → 관련 가이드 → 자주 묻는 질문`인가. 왼쪽 본문에 FAQ가 남아 있지 않은가. |
| `/finance` | 같은 행의 두 카드 높이가 같은가. 용도 배지가 카드 바닥에 정렬되는가. |
| `/guide/<임의 slug>` | `관련 가이드`가 카드로 감싸져 있고 본문과 충돌하지 않는가. |
| `/board/<임의 id>` | `다른 브리핑 글` 섹션이 카드로 감싸져 있는가. |

- [ ] **Step 5: 모바일(375px) 육안 확인**

DevTools 반응형 375px로 `/apt/<id>`와 `/finance`를 본다.

Expected: 1단 격자로 떨어질 때 카드 `p-6` + 타일 `p-4` 이중 여백이 과하지 않은가. 제목·본문 줄바꿈이 깨지지 않는가. 가로 스크롤이 생기지 않는가.

- [ ] **Step 6: 결과 보고**

문제가 없으면 사용자에게 확인 결과를 보고하고 PR 생성 여부를 묻는다. 문제가 있으면 해당 태스크로 돌아가 고친 뒤 Step 1부터 다시 돌린다.

---

## 참고: PR 생성 (사용자 승인 후에만)

이 저장소는 `feat/*` → `main` 직접 PR로 머지 즉시 배포되는 단일 트렁크다. 통합 브랜치를 만들지 않는다. 이번 변경에는 Prisma 마이그레이션이 없으므로 머지 전 `prisma:deploy`는 필요 없다.
