# 게시글 구조·디자인 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 브리핑(board)·가이드(guide) 글을 「핵심 요약 콜아웃 + 섹션 소제목 + 출처/관련글」 구조로 통일한다(신규는 생성 프롬프트, 기존은 재구조화 스크립트, 모든 글은 렌더링 개선).

**Architecture:** 본문은 그대로 마크다운(`Post.body`/`Guide.body`)에 저장한다. (1) 순수 함수가 본문 맨 앞 `## 핵심 요약` 블록을 분리하고, 상세 페이지가 이를 콜아웃 `<aside>`로 렌더한다. (2) `.board-prose` CSS를 강화한다. (3) 생성 프롬프트를 섹션 골격을 강제하도록 교체한다. (4) 1회성 재구조화 스크립트가 기존 게시글을 LLM으로 재배열해 DRAFT로 되돌려 어드민 재검수 큐에 넣는다.

**Tech Stack:** Next.js 15 App Router(서버 컴포넌트), TypeScript, ReactMarkdown + remark-gfm, Tailwind v4 `@theme` 토큰, Vitest(node 환경, `renderToStaticMarkup`), Prisma, OpenAI(json_schema).

## Global Constraints

- DESIGN.md 준수: 색은 정보 전달용, 그림자는 `--shadow-soft` 하나만, 한글 본문 ≥14px, 접근성 WCAG 2.1 AA.
- 본문 저장 형식·스키마 불변: 마크다운 문자열 `body`만 사용, 새 컬럼/마이그레이션 없음.
- 가드레일 유지: 금지표현(전망·추천·유망 등) + 분량 공백 제외 800–2200자(`lib/board/guardrails.ts` 그대로).
- 사실 원칙 유지: 자료에 없는 구체 수치·고유 사실을 새로 만들지 않는다. 재구조화는 **사실 보존·추가 금지**.
- 핵심요약(`## 핵심 요약`)이 없는 글은 콜아웃을 생략하고 본문 전체를 일반 렌더(graceful).
- Vitest는 node 환경이며 include는 `tests/**/*.test.ts`만(.tsx 아님). 컴포넌트 테스트는 `renderToStaticMarkup` + React 전역 shim 패턴을 따른다(`tests/components/hospital-tabs-ssr.test.ts` 참조).
- 적용 범위: board(Post) + guide(Guide) 둘 다.

---

## File Structure

- `lib/board/summary-split.ts` (신규) — 본문에서 `## 핵심 요약` 블록 분리하는 순수 함수.
- `app/(public)/_components/article-summary.tsx` (신규) — 핵심 요약 콜아웃 `<aside>` 서버 컴포넌트.
- `app/globals.css` (수정) — `.board-prose` 타이포 강화.
- `app/(public)/board/[id]/page.tsx` (수정) — 콜아웃 분리·렌더 배선.
- `app/(public)/guide/[slug]/page.tsx` (수정) — 콜아웃 분리·렌더 배선.
- `lib/board/generate.ts` (수정) — board SYSTEM_PROMPT 섹션 골격화 + 테스트용 export.
- `lib/guide/generate.ts` (수정) — guide SYSTEM_PROMPT 섹션 골격화 + 테스트용 export.
- `lib/board/restructure.ts` (신규) — `restructureBody()` 재구조화 함수(+프롬프트).
- `scripts/board/restructure.ts` (신규) — board 게시글 1회성 재구조화 CLI.
- `scripts/guide/restructure.ts` (신규) — guide 게시글 1회성 재구조화 CLI.
- 테스트: `tests/lib/summary-split.test.ts`, `tests/components/article-summary-ssr.test.ts`, `tests/lib/generate-prompts.test.ts`, `tests/lib/restructure.test.ts`.

---

## Task 1: 핵심 요약 분리 순수 함수

**Files:**
- Create: `lib/board/summary-split.ts`
- Test: `tests/lib/summary-split.test.ts`

**Interfaces:**
- Produces: `export interface SplitResult { summary: string | null; rest: string }` 및 `export function splitSummary(body: string): SplitResult`. `summary`는 `## 핵심 요약` 헤딩을 **제외한** 그 섹션의 마크다운 내용(불릿 등), `rest`는 핵심요약 섹션을 제거한 나머지 본문. 핵심요약이 없으면 `{ summary: null, rest: body }`(원본 그대로).

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/summary-split.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { splitSummary } from '@/lib/board/summary-split';

describe('splitSummary', () => {
  it('맨 앞 ## 핵심 요약 블록을 분리하고 헤딩은 제거한다', () => {
    const body = '## 핵심 요약\n- 첫째 **키워드**\n- 둘째\n\n## 배경\n본문 단락.\n';
    const r = splitSummary(body);
    expect(r.summary).toBe('- 첫째 **키워드**\n- 둘째');
    expect(r.rest).toBe('## 배경\n본문 단락.');
  });

  it('선행 공백이 있어도 분리한다', () => {
    const r = splitSummary('\n\n## 핵심 요약\n- 하나\n\n## 영향\n끝.');
    expect(r.summary).toBe('- 하나');
    expect(r.rest).toBe('## 영향\n끝.');
  });

  it('핵심 요약이 본문 맨 앞이 아니면 분리하지 않는다', () => {
    const body = '리드 문단.\n\n## 핵심 요약\n- 하나\n';
    const r = splitSummary(body);
    expect(r.summary).toBeNull();
    expect(r.rest).toBe(body);
  });

  it('핵심 요약만 있고 다른 섹션이 없으면 rest는 빈 문자열', () => {
    const r = splitSummary('## 핵심 요약\n- 하나\n- 둘');
    expect(r.summary).toBe('- 하나\n- 둘');
    expect(r.rest).toBe('');
  });

  it('### 소제목은 다음 섹션 경계로 보지 않는다(h2만 경계)', () => {
    const r = splitSummary('## 핵심 요약\n- 하나\n### 메모\n부가\n## 배경\n본문');
    expect(r.summary).toBe('- 하나\n### 메모\n부가');
    expect(r.rest).toBe('## 배경\n본문');
  });

  it('핵심 요약 헤딩만 있고 내용이 비면 분리하지 않는다', () => {
    const body = '## 핵심 요약\n\n## 배경\n본문';
    const r = splitSummary(body);
    expect(r.summary).toBeNull();
    expect(r.rest).toBe(body);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run tests/lib/summary-split.test.ts`
Expected: FAIL — "Cannot find module '@/lib/board/summary-split'" 또는 splitSummary undefined.

- [ ] **Step 3: 최소 구현 작성**

`lib/board/summary-split.ts`:
```ts
export interface SplitResult {
  summary: string | null;
  rest: string;
}

const HEAD = '## 핵심 요약';

/**
 * 본문 맨 앞의 `## 핵심 요약` 섹션을 분리한다.
 * - summary: 핵심 요약 헤딩을 제외한 그 섹션 마크다운 내용(없으면 null)
 * - rest: 핵심 요약 섹션을 제거한 나머지 본문
 * 핵심 요약이 맨 앞이 아니거나 내용이 비면 분리하지 않고 원본을 그대로 둔다.
 */
export function splitSummary(body: string): SplitResult {
  const head = body.replace(/^\s+/, '');
  if (!head.startsWith(HEAD)) return { summary: null, rest: body };

  const nl = head.indexOf('\n');
  if (nl === -1) return { summary: null, rest: body }; // 헤딩 한 줄뿐
  const after = head.slice(nl + 1);

  // 다음 h2(`## `) 경계 — 줄 시작의 `## ` 만. `### `는 매칭되지 않는다(세 번째 문자가 공백 아님).
  const m = after.match(/^##\s/m);
  let summary: string;
  let rest: string;
  if (m && m.index !== undefined) {
    summary = after.slice(0, m.index).trim();
    rest = after.slice(m.index).trim();
  } else {
    summary = after.trim();
    rest = '';
  }

  if (!summary) return { summary: null, rest: body };
  return { summary, rest };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec vitest run tests/lib/summary-split.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: 커밋**

```bash
git add lib/board/summary-split.ts tests/lib/summary-split.test.ts
git commit -m "feat(article): 핵심 요약 블록 분리 순수 함수 splitSummary"
```

---

## Task 2: 핵심 요약 콜아웃 컴포넌트

**Files:**
- Create: `app/(public)/_components/article-summary.tsx`
- Test: `tests/components/article-summary-ssr.test.ts`

**Interfaces:**
- Consumes: 없음(마크다운 문자열을 prop으로 받음).
- Produces: `export function ArticleSummary({ markdown }: { markdown: string }): JSX.Element`. 부드러운 배경의 `<aside>` 콜아웃에 "핵심 요약" 라벨 + `markdown`을 ReactMarkdown으로 렌더. `markdown`이 빈 문자열이면 `null` 반환.

- [ ] **Step 1: 실패하는 SSR 테스트 작성**

`tests/components/article-summary-ssr.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArticleSummary } from '@/app/(public)/_components/article-summary';

// 컴포넌트는 자동 JSX 런타임을 쓰지만 vitest(esbuild)는 classic 런타임으로 변환한다. 전역 shim.
(globalThis as unknown as { React: typeof React }).React = React;

describe('ArticleSummary SSR', () => {
  it('"핵심 요약" 라벨과 마크다운 불릿을 렌더한다', () => {
    const html = renderToStaticMarkup(
      createElement(ArticleSummary, { markdown: '- 첫째 **키워드**\n- 둘째' }),
    );
    expect(html).toContain('핵심 요약');
    expect(html).toContain('첫째');
    expect(html).toContain('<aside');
    expect(html).toContain('<strong>키워드</strong>');
  });

  it('빈 마크다운이면 아무것도 렌더하지 않는다', () => {
    const html = renderToStaticMarkup(createElement(ArticleSummary, { markdown: '' }));
    expect(html).toBe('');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run tests/components/article-summary-ssr.test.ts`
Expected: FAIL — "Cannot find module '@/app/(public)/_components/article-summary'".

- [ ] **Step 3: 최소 구현 작성**

`app/(public)/_components/article-summary.tsx`:
```tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** 본문 맨 앞 '핵심 요약'을 콜아웃 박스로 보여준다. DESIGN.md: 색은 정보 전달용, 그림자 없음. */
export function ArticleSummary({ markdown }: { markdown: string }) {
  if (!markdown.trim()) return null;
  return (
    <aside className="mt-8 rounded-[18px] border border-[var(--color-line)] bg-[var(--color-soft)] px-5 py-4">
      <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-blue)]">핵심 요약</p>
      <div className="board-prose mt-2 text-[15px] leading-relaxed text-[var(--color-text)]">
        <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{markdown}</ReactMarkdown>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec vitest run tests/components/article-summary-ssr.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: 커밋**

```bash
git add "app/(public)/_components/article-summary.tsx" tests/components/article-summary-ssr.test.ts
git commit -m "feat(article): 핵심 요약 콜아웃 컴포넌트 ArticleSummary"
```

---

## Task 3: `.board-prose` 타이포 강화

**Files:**
- Modify: `app/globals.css:40-50`

**Interfaces:**
- Consumes/Produces: 없음(CSS만). H2를 키우고 구분선·여백을 더한다. 기존 셀렉터 이름(`.board-prose ...`) 유지.

CSS는 단위 테스트 대상이 아니다. 검증은 빌드 성공 + 시각 확인 + 토큰 준수(새 그림자·강한 색 금지)로 한다.

- [ ] **Step 1: CSS 수정**

`app/globals.css`의 기존 `.board-prose h2`·`.board-prose h3` 두 줄(41–42행)을 아래로 교체하고, 나머지 `.board-prose` 규칙(43–50행: p/ul/ol/li/table/th/td/a/strong)은 그대로 둔다:
```css
/* 게시글 마크다운 본문 — 표·목록 가독성(브랜드 톤) */
.board-prose h2 {
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--color-blue-dark);
  margin: 2.5rem 0 1rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--color-line);
  line-height: 1.35;
}
.board-prose h2:first-child { margin-top: 0; }
.board-prose h3 {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--color-blue-dark);
  margin: 1.75rem 0 0.6rem;
}
```

- [ ] **Step 2: 빌드/타입 확인**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음(CSS는 타입 영향 없음 — 회귀 없음 확인용).

- [ ] **Step 3: 토큰 준수 확인**

Run: `git diff app/globals.css`
Expected: 추가된 색·테두리는 `var(--color-blue-dark)`·`var(--color-line)`만, 새 `box-shadow` 없음, 본문 폰트 하향(<14px) 없음.

- [ ] **Step 4: 커밋**

```bash
git add app/globals.css
git commit -m "style(article): board-prose H2 강화(크기·구분선·여백)"
```

---

## Task 4: 상세 페이지 콜아웃 배선(board + guide)

**Files:**
- Modify: `app/(public)/board/[id]/page.tsx:85-87`
- Modify: `app/(public)/guide/[slug]/page.tsx:59-61`

**Interfaces:**
- Consumes: `splitSummary` (Task 1), `ArticleSummary` (Task 2).
- Produces: 없음(페이지 렌더만).

페이지는 DB 의존 async 서버 컴포넌트라 단위 테스트하지 않는다(분리 로직은 Task 1·2에서 검증). 검증은 typecheck + build.

- [ ] **Step 1: board 상세 페이지 수정**

`app/(public)/board/[id]/page.tsx` 상단 import에 추가(11행 `JsonLd` import 부근):
```tsx
import { splitSummary } from '@/lib/board/summary-split';
import { ArticleSummary } from '@/app/(public)/_components/article-summary';
```
`const post = await getPublishedPostById(BigInt(id));` 직후(47행 다음)에 추가:
```tsx
  const { summary, rest } = splitSummary(post.body);
```
기존 본문 블록(85–87행)을 아래로 교체(핵심 요약 콜아웃은 본문 **아래**, 출처 위에 둔다):
```tsx
      <div className="board-prose mt-8 text-[15px] leading-relaxed text-[var(--color-text)]">
        <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{rest}</ReactMarkdown>
      </div>
      {summary && <ArticleSummary markdown={summary} />}
```
(다음 줄의 `<PostSource ... />`는 그대로 둔다 — 순서는 본문 → 핵심 요약 → 출처.)

- [ ] **Step 2: guide 상세 페이지 수정**

`app/(public)/guide/[slug]/page.tsx` 상단 import에 추가(7행 부근):
```tsx
import { splitSummary } from '@/lib/board/summary-split';
import { ArticleSummary } from '@/app/(public)/_components/article-summary';
```
`if (!guide) notFound();` 직후(29행 다음)에 추가:
```tsx
  const { summary, rest } = splitSummary(guide.body);
```
기존 본문 블록(59–61행)을 아래로 교체(핵심 요약 콜아웃은 본문 **아래**, 출처 위에 둔다):
```tsx
      <div className="board-prose mt-8 text-[15px] leading-relaxed text-[var(--color-text)]">
        <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{rest}</ReactMarkdown>
      </div>
      {summary && <ArticleSummary markdown={summary} />}
```
(다음 줄의 `<PostSource ... />`는 그대로 둔다 — 순서는 본문 → 핵심 요약 → 출처.)

- [ ] **Step 3: 타입 확인**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: 단위 테스트 회귀 확인**

Run: `pnpm exec vitest run tests/lib/summary-split.test.ts tests/components/article-summary-ssr.test.ts`
Expected: PASS(8 tests) — 배선 후에도 분리/콜아웃 동작 불변.

- [ ] **Step 5: 커밋**

```bash
git add "app/(public)/board/[id]/page.tsx" "app/(public)/guide/[slug]/page.tsx"
git commit -m "feat(article): 상세 페이지에 핵심 요약 콜아웃 배선(board+guide)"
```

---

## Task 5: 생성 프롬프트 섹션 골격화(board + guide)

**Files:**
- Modify: `lib/board/generate.ts:37-59`
- Modify: `lib/guide/generate.ts:25-42`
- Test: `tests/lib/generate-prompts.test.ts`

**Interfaces:**
- Produces: `lib/board/generate.ts`와 `lib/guide/generate.ts`에서 `SYSTEM_PROMPT`를 **named export**로 노출(테스트용). 동작(generateDraft/generateGuideDraft 시그니처)은 불변.

- [ ] **Step 1: 실패하는 프롬프트 회귀 테스트 작성**

`tests/lib/generate-prompts.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT as BOARD_PROMPT } from '@/lib/board/generate';
import { SYSTEM_PROMPT as GUIDE_PROMPT } from '@/lib/guide/generate';

describe('생성 프롬프트 섹션 골격', () => {
  it('board 프롬프트는 핵심 요약·참고 자료 섹션을 강제한다', () => {
    expect(BOARD_PROMPT).toContain('## 핵심 요약');
    expect(BOARD_PROMPT).toContain('## 참고 자료');
  });

  it('guide 프롬프트는 핵심 요약·참고 자료 섹션을 강제한다', () => {
    expect(GUIDE_PROMPT).toContain('## 핵심 요약');
    expect(GUIDE_PROMPT).toContain('## 참고 자료');
  });

  it('board 프롬프트는 사실 원칙·금지표현을 유지한다', () => {
    expect(BOARD_PROMPT).toContain('추측');
    expect(BOARD_PROMPT).toContain('전망');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run tests/lib/generate-prompts.test.ts`
Expected: FAIL — `SYSTEM_PROMPT`가 export 안 됨(undefined) 또는 `## 핵심 요약` 미포함.

- [ ] **Step 3: board 프롬프트 교체**

`lib/board/generate.ts`에서 `const SYSTEM_PROMPT = ...`(37행)을 `export const SYSTEM_PROMPT =`로 바꾸고 내용을 아래로 교체:
```ts
export const SYSTEM_PROMPT = `당신은 공공데이터 보도자료를 바탕으로 부동산·금융 기사를 쓰는 한국어 기자다.
독자가 끝까지 읽도록 '핵심 요약 → 섹션별 소제목' 구조로 정리된 한 편의 기사를 쓴다.

[사실 원칙 — 반드시 지킨다]
1. 제공된 '근거 자료'에 있는 사실만 쓴다. 자료에 없는 내용은 절대 추측·추가하지 않는다.
2. 집값 전망·투자 조언·추천·예측 등 의견성 문장을 쓰지 않는다. 사실만 전달한다.
3. "~으로 보입니다 / 가능성이 있습니다 / 예상됩니다 / 전망 / 추천 / 유망" 같은 표현을 절대 쓰지 않는다.
4. 모든 수치·날짜·금액은 자료에 적힌 그대로 옮긴다.

[구조 — 이 골격을 지킨다]
5. 맨 위에 '## 핵심 요약' 섹션을 두고, 글의 요점을 3~4개 불릿(- )으로 정리한다. 각 불릿의 핵심어는 **굵게** 표시한다.
6. 이어서 본문을 2~4개의 '## 소제목' 섹션으로 나눈다. 흐름은 보통 배경 → 주요 내용 → 영향받는 대상 → 마무리 순으로 자연스럽게 잇되, 소제목 문구는 내용에 맞게 자유롭게 붙인다.
7. 각 섹션 본문은 문단 중심의 산문으로 서술한다. 한 섹션 안에서 정보를 잘게 토막내지 말고 문장으로 연결해 읽히게 쓴다.
8. 표는 여러 항목의 수치를 한눈에 비교해야 할 때만 1개 정도 쓴다. 어려운 용어는 문장 안에서 풀어 설명한다.
9. 맨 끝에 '## 참고 자료' 섹션을 두고 출처와 기준일을 한 줄로 밝힌다.
10. 분량은 공백 제외 한글 최소 1,000자(2,000자 안팎, 최대 2,200자). 자료의 고유 사실이 적으면 등장한 제도·상품·용어의 구조와 작동 방식, 적용 대상·일정·절차, 일반적으로 알려진 유의점을 문장으로 풀어 채운다. 단 자료에 없는 구체 수치·고유 사실은 새로 만들지 않는다.

[분류 — 태깅용]
- type: PROGRAM(신청 대상·방법이 있는 제도/상품) 또는 TREND(신청이 없는 이슈/통계). PROGRAM이면 신청 대상·기간·방법 같은 실용 정보를 섹션 안에 자연스럽게 녹인다.
- category: 주제에 맞게 FINANCE/LOAN/ECONOMY/SUBSCRIPTION/REALESTATE 중 하나.

[출력] body는 마크다운. title은 기사 제목처럼 25자 내외, summary는 기사를 한 문장으로 요약.`;
```

- [ ] **Step 4: guide 프롬프트 교체**

`lib/guide/generate.ts`에서 `const SYSTEM_PROMPT = ...`(25행)을 `export const SYSTEM_PROMPT =`로 바꾸고 내용을 아래로 교체:
```ts
export const SYSTEM_PROMPT = `당신은 공공데이터를 바탕으로 부동산·생활 정보를 쉽게 풀어 설명하는 한국어 가이드 작성자다.
독자가 끝까지 읽는 '상록(evergreen) 설명 글'을 '핵심 요약 → 섹션별 소제목' 구조로 쓴다. 특정 날짜의 뉴스가 아니라 언제 읽어도 유효한 개념·절차·유의점을 설명한다.

[허용 — 가이드 장르]
1. 개념 풀이, 단계별 방법(how-to), 일반적으로 알려진 유의점·비교를 문장으로 설명한다.

[금지 — 반드시 지킨다]
2. 집값·시세의 상승/하락 단정 전망을 쓰지 않는다("오를 것/내릴 것/급등/유망" 등 금지).
3. 매수·매도 권유나 투자 조언("지금이 기회/사두면/추천" 등)을 쓰지 않는다.
4. "무조건/보장/확실히 이득/최고의" 같은 과장 표현을 쓰지 않는다.
5. 제공된 근거 자료의 사실 범위를 벗어나는 구체 수치·고유 사실을 지어내지 않는다. 일반 원리는 풀어 쓰되 특정 수치는 자료에 있는 것만.

[구조 — 이 골격을 지킨다]
6. 맨 위에 '## 핵심 요약' 섹션을 두고 글의 요점을 3~4개 불릿(- )으로 정리한다. 각 불릿의 핵심어는 **굵게** 표시한다.
7. 이어서 본문을 2~4개의 '## 소제목' 섹션으로 나눈다(예: 개념 → 방법·절차 → 유의점). 소제목 문구는 내용에 맞게 자유롭게 붙인다.
8. 각 섹션 본문은 문단 중심 산문으로 쓰고, 어려운 용어는 문장 안에서 풀어 설명한다.
9. 맨 끝에 '## 참고 자료' 섹션을 두고 출처와 기준을 한 줄로 밝힌다.
10. 분량은 공백 제외 한글 최소 1,000자(2,000자 안팎, 최대 2,200자).

[출력] body는 마크다운. title은 25자 내외, summary는 한 문장 요약.`;
```

- [ ] **Step 5: 테스트 통과 + 타입 확인**

Run: `pnpm exec vitest run tests/lib/generate-prompts.test.ts && pnpm exec tsc --noEmit`
Expected: PASS(3 tests), 타입 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add lib/board/generate.ts lib/guide/generate.ts tests/lib/generate-prompts.test.ts
git commit -m "feat(article): 생성 프롬프트를 핵심요약+섹션 골격으로 교체(board+guide)"
```

---

## Task 6: 기존 글 재구조화 함수 + CLI 스크립트

**Files:**
- Create: `lib/board/restructure.ts`
- Create: `scripts/board/restructure.ts`
- Create: `scripts/guide/restructure.ts`
- Test: `tests/lib/restructure.test.ts`

**Interfaces:**
- Consumes: `OpenAiLike`(from `@/lib/board/generate`), `runGuardrails`(from `@/lib/board/guardrails`).
- Produces: `export async function restructureBody(client: OpenAiLike, body: string, model: string): Promise<string>` — 기존 본문을 핵심요약+섹션 구조로 재배열한 마크다운 문자열을 반환(사실 보존, 추가 금지). `export const RESTRUCTURE_SYSTEM_PROMPT: string`.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/restructure.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { restructureBody, RESTRUCTURE_SYSTEM_PROMPT } from '@/lib/board/restructure';
import type { OpenAiLike } from '@/lib/board/generate';

function mockClient(returnText: string, capture?: (args: unknown) => void): OpenAiLike {
  return {
    chat: {
      completions: {
        create: async (args: unknown) => {
          capture?.(args);
          return { choices: [{ message: { content: JSON.stringify({ body: returnText }) } }] };
        },
      },
    },
  };
}

describe('restructureBody', () => {
  it('재구조화된 body 문자열을 반환한다', async () => {
    const out = await restructureBody(mockClient('## 핵심 요약\n- 하나\n\n## 배경\n본문'), '원본 본문', 'gpt-x');
    expect(out).toBe('## 핵심 요약\n- 하나\n\n## 배경\n본문');
  });

  it('프롬프트는 사실 보존·추가 금지를 명시한다', () => {
    expect(RESTRUCTURE_SYSTEM_PROMPT).toContain('보존');
    expect(RESTRUCTURE_SYSTEM_PROMPT).toContain('## 핵심 요약');
  });

  it('원본 본문을 user 메시지로 전달한다', async () => {
    let seen: unknown;
    await restructureBody(mockClient('x', (a) => { seen = a; }), '원본 사실 ABC', 'gpt-x');
    const messages = (seen as { messages: { role: string; content: string }[] }).messages;
    const user = messages.find((m) => m.role === 'user');
    expect(user?.content).toContain('원본 사실 ABC');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run tests/lib/restructure.test.ts`
Expected: FAIL — "Cannot find module '@/lib/board/restructure'".

- [ ] **Step 3: 재구조화 함수 구현**

`lib/board/restructure.ts`:
```ts
import type { OpenAiLike } from '@/lib/board/generate';

const RESTRUCTURE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['body'],
  properties: { body: { type: 'string' } },
} as const;

export const RESTRUCTURE_SYSTEM_PROMPT = `당신은 이미 작성된 한국어 기사/가이드 본문을 '핵심 요약 → 섹션별 소제목' 구조로 다시 정리하는 편집자다.

[절대 원칙]
1. 원문에 있는 사실·수치·날짜·금액·고유명사를 그대로 보존한다. 새 사실·수치·해석을 추가하지 않는다.
2. 의견·전망·추천 표현을 새로 만들지 않는다("보입니다/예상/전망/추천/유망" 등 금지).
3. 문장을 더 읽기 쉽게 다듬을 수는 있으나, 정보의 양은 늘리지도 줄이지도 않는다.

[구조]
4. 맨 위에 '## 핵심 요약' 섹션 — 원문의 요점을 3~4개 불릿(- )으로, 핵심어는 **굵게**.
5. 본문을 2~4개의 '## 소제목' 섹션으로 재배열한다(소제목 문구는 내용에 맞게).
6. 원문에 출처/기준일이 있으면 맨 끝 '## 참고 자료' 섹션으로 옮긴다.
7. 분량은 공백 제외 한글 최대 2,200자를 넘기지 않는다(원문이 그 이하이면 늘리지 않는다).

[출력] body는 재구조화된 마크다운 전문.`;

export async function restructureBody(client: OpenAiLike, body: string, model: string): Promise<string> {
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: RESTRUCTURE_SYSTEM_PROMPT },
      { role: 'user', content: `다음 본문을 위 규칙대로 재구조화하라.\n\n=== 원문 시작 ===\n${body}\n=== 원문 끝 ===` },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'restructured_article', strict: true, schema: RESTRUCTURE_JSON_SCHEMA } },
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('restructureBody: empty completion');
  const parsed = JSON.parse(content) as { body: string };
  return parsed.body;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec vitest run tests/lib/restructure.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: board CLI 스크립트 작성**

`scripts/board/restructure.ts`:
```ts
/**
 * 1회성: 게시된(PUBLISHED) board 글을 핵심요약+섹션 구조로 재구조화한다.
 * 결과는 status=DRAFT, reviewedAt=null로 되돌려 /admin/posts 검수 큐로 보낸다(어드민이 재게시).
 * 사실은 보존하고 구조만 바꾼다(추가·삭제 금지).
 *
 * 실행(OPENAI_API_KEY 필요):
 *   pnpm dlx dotenv -e .env.local -- tsx scripts/board/restructure.ts --limit 5 --dry-run
 *   pnpm dlx dotenv -e .env.local -- tsx scripts/board/restructure.ts --limit 5
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import { createOpenAiClient } from '@/lib/board/generate';
import { restructureBody } from '@/lib/board/restructure';
import { runGuardrails } from '@/lib/board/guardrails';

function argNum(flag: string, def: number): number {
  const i = process.argv.indexOf(flag);
  if (i === -1) return def;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : def;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const limit = argNum('--limit', 5);
  const client = createOpenAiClient(env.OPENAI_API_KEY);

  // 아직 핵심요약이 없는 게시글만(재실행 안전). 오래된 글부터.
  const posts = await prisma.post.findMany({
    where: { status: 'PUBLISHED', NOT: { body: { contains: '## 핵심 요약' } } },
    orderBy: { publishedAt: 'asc' },
    take: limit,
  });
  logger.info({ count: posts.length, dryRun }, 'board restructure 대상');

  for (const post of posts) {
    const newBody = await restructureBody(client, post.body, env.OPENAI_MODEL);
    const guard = runGuardrails({ body: newBody, sourceName: post.sourceName, sourceUrl: post.sourceUrl });
    const charCount = newBody.replace(/\s/g, '').length;
    logger.info({ id: String(post.id), title: post.title, charCount, guardOk: guard.ok }, 'restructured');
    console.log(`\n[#${post.id}] ${post.title}\n${'-'.repeat(60)}\n${newBody}\n${'-'.repeat(60)}\n가드레일: ${guard.ok ? 'PASS ✅' : 'FAIL ❌ → ' + guard.violations.join(', ')} (공백제외 ${charCount}자)\n`);

    if (dryRun) continue;
    if (!guard.ok) {
      logger.warn({ id: String(post.id), violations: guard.violations }, '가드레일 실패 — 건너뜀(원본 유지)');
      continue;
    }
    await prisma.post.update({
      where: { id: post.id },
      data: { body: newBody, status: 'DRAFT', reviewedAt: null },
    });
    logger.info({ id: String(post.id) }, 'DRAFT로 되돌림 — /admin/posts에서 검수');
  }
}

main()
  .catch((err) => { logger.error({ err }, 'board restructure fatal'); process.exit(1); })
  .finally(() => { void prisma.$disconnect(); });
```

- [ ] **Step 6: guide CLI 스크립트 작성**

`scripts/guide/restructure.ts`:
```ts
/**
 * 1회성: 게시된(PUBLISHED) guide 글을 핵심요약+섹션 구조로 재구조화한다.
 * 결과는 status=DRAFT, reviewedAt=null로 되돌려 어드민 검수 큐로 보낸다.
 *
 * 실행(OPENAI_API_KEY 필요):
 *   pnpm dlx dotenv -e .env.local -- tsx scripts/guide/restructure.ts --limit 5 --dry-run
 *   pnpm dlx dotenv -e .env.local -- tsx scripts/guide/restructure.ts --limit 5
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import { createOpenAiClient } from '@/lib/board/generate';
import { restructureBody } from '@/lib/board/restructure';
import { runGuardrails } from '@/lib/board/guardrails';

function argNum(flag: string, def: number): number {
  const i = process.argv.indexOf(flag);
  if (i === -1) return def;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : def;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const limit = argNum('--limit', 5);
  const client = createOpenAiClient(env.OPENAI_API_KEY);

  const guides = await prisma.guide.findMany({
    where: { status: 'PUBLISHED', NOT: { body: { contains: '## 핵심 요약' } } },
    orderBy: { publishedAt: 'asc' },
    take: limit,
  });
  logger.info({ count: guides.length, dryRun }, 'guide restructure 대상');

  for (const guide of guides) {
    const newBody = await restructureBody(client, guide.body, env.OPENAI_MODEL);
    const guard = runGuardrails({ body: newBody, sourceName: guide.sourceName, sourceUrl: guide.sourceUrl });
    const charCount = newBody.replace(/\s/g, '').length;
    logger.info({ id: String(guide.id), title: guide.title, charCount, guardOk: guard.ok }, 'restructured');
    console.log(`\n[#${guide.id}] ${guide.title}\n${'-'.repeat(60)}\n${newBody}\n${'-'.repeat(60)}\n가드레일: ${guard.ok ? 'PASS ✅' : 'FAIL ❌ → ' + guard.violations.join(', ')} (공백제외 ${charCount}자)\n`);

    if (dryRun) continue;
    if (!guard.ok) {
      logger.warn({ id: String(guide.id), violations: guard.violations }, '가드레일 실패 — 건너뜀(원본 유지)');
      continue;
    }
    await prisma.guide.update({
      where: { id: guide.id },
      data: { body: newBody, status: 'DRAFT', reviewedAt: null },
    });
    logger.info({ id: String(guide.id) }, 'DRAFT로 되돌림 — 어드민에서 검수');
  }
}

main()
  .catch((err) => { logger.error({ err }, 'guide restructure fatal'); process.exit(1); })
  .finally(() => { void prisma.$disconnect(); });
```

- [ ] **Step 7: 타입 확인**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음. (`env.OPENAI_MODEL`·`env.OPENAI_API_KEY`는 `generate-topic.ts`에서 이미 사용 중 — 존재 확인됨.)

- [ ] **Step 8: 커밋**

```bash
git add lib/board/restructure.ts scripts/board/restructure.ts scripts/guide/restructure.ts tests/lib/restructure.test.ts
git commit -m "feat(article): 기존 글 재구조화 함수+CLI(board/guide, DRAFT 재검수)"
```

---

## Task 7: 전체 단위 테스트 + 빌드 검증

**Files:** 없음(검증만).

- [ ] **Step 1: 전체 유닛 테스트**

Run: `pnpm test:unit`
Expected: 신규 테스트 포함 전부 PASS(기존 테스트 회귀 없음).

- [ ] **Step 2: 타입체크**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 빌드**

Run: `pnpm build`
Expected: 성공.

- [ ] **Step 4: (선택) 시각 확인**

`pnpm dev` 후 핵심요약을 포함한 board/guide 글 상세를 열어 콜아웃·H2 구분선·섹션 간격을 확인한다. 핵심요약이 없는 기존 글은 콜아웃 없이 정상 렌더되는지 확인(graceful).

---

## Self-Review (작성자 체크)

**Spec coverage:**
- 콘텐츠 구조(생성 프롬프트) → Task 5 ✅
- 시각 개선: board-prose 강화 → Task 3 ✅ / 핵심요약 콜아웃 → Task 1·2·4 ✅
- 기존 글 재구조화(DRAFT 재검수, dry-run, 배치) → Task 6 ✅
- 범위(board+guide) → Task 4·5·6 모두 양쪽 ✅
- graceful(핵심요약 없으면 콜아웃 생략) → Task 1(null 반환)·Task 4(`{summary && ...}`) ✅
- 가드레일·분량 유지 → Task 5·6에서 `runGuardrails` 사용, 프롬프트에 최대 2,200자 명시 ✅

**Placeholder scan:** 모든 코드 단계에 실제 코드 포함, TBD 없음 ✅

**Type consistency:**
- `splitSummary(body): { summary: string|null; rest: string }` — Task 1 정의, Task 4 소비 일치 ✅
- `ArticleSummary({ markdown })` — Task 2 정의, Task 4 소비 일치 ✅
- `restructureBody(client, body, model): Promise<string>` — Task 6 정의·소비 일치 ✅
- `SYSTEM_PROMPT` named export — Task 5 정의, 테스트 소비 일치 ✅
