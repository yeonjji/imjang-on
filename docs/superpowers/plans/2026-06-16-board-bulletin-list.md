# 게시판형 표 리스트 리디자인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/board` 목록을 카드 그리드에서 이미지 없는 "게시판형 표 리스트"(분류·제목·출처·등록일)로 바꾸고, 오른쪽 보조 레일(안내·분야별 글 수·출처 기관)을 추가한다.

**Architecture:** 서버 컴포넌트(`app/(public)/board/page.tsx`)에서 게시글 목록 + 레일 집계 2건을 `Promise.all`로 병렬 조회해 렌더한다. 집계 쿼리는 `lib/board/post.ts`에 순수 함수로 추가한다. 상세 페이지·OG 라우트·ETL·관리자 화면은 건드리지 않는다.

**Tech Stack:** Next.js(App Router, RSC) · Prisma(MySQL) · Tailwind(CSS 변수 토큰) · Vitest(로컬 테스트 DB).

**스펙:** `docs/superpowers/specs/2026-06-16-board-list-bulletin-redesign-design.md`

---

## 사전 조건

- 작업 브랜치 `feat/board-bulletin-list` (이미 생성됨, 스펙 커밋 존재).
- 단위 테스트는 **로컬 테스트 DB(docker)** 가 떠 있어야 동작한다(`.env.test` 타깃). 테스트 명령은 `dotenv -e .env.test -- vitest ...` 형태.
- 사용 가능한 CSS 토큰: `--color-bg/-card/-text/-muted/-line/-blue/-blue-dark/-sky/-sky-soft/-soft/-green/-red`, 그림자 `--shadow-soft`.

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `lib/board/post.ts` | 게시글 목록·집계 쿼리 | 수정: `PostListItem`/`listPublishedPosts` select 조정 + 집계 함수 2개 추가 |
| `tests/lib/board-post.test.ts` | 위 쿼리들의 단위 테스트 | 수정: 신규 함수·sourceName 테스트 추가 |
| `app/(public)/board/page.tsx` | 목록 페이지 UI | 수정: 헤더·표·레일 전면 재구성 |

레일은 page.tsx 인라인으로 둔다(렌더 로직이 단순하고 한 곳에서만 쓰임). 파일이 과해지면 후속으로 `_components/board-rail.tsx` 분리 가능 — 이번 범위에서는 인라인.

---

## Task 1: 레일 집계 쿼리 2개 추가 (`lib/board/post.ts`)

순수 추가 작업. 기존 동작·페이지에 영향 없음.

**Files:**
- Modify: `lib/board/post.ts`
- Test: `tests/lib/board-post.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/board-post.test.ts` 상단 import에 신규 함수를 추가한다(line 4 교체):

```ts
import {
  listPublishedPosts,
  getPublishedPostBySlug,
  normalizeSlug,
  PAGE_SIZE,
  getBoardCategoryCounts,
  getBoardSourceOrgs,
} from '@/lib/board/post';
```

파일 끝(`PAGE_SIZE` describe 뒤)에 아래 describe 블록을 추가한다:

```ts
describe('getBoardCategoryCounts', () => {
  it('모든 카테고리 키를 0 이상의 숫자로 반환한다', async () => {
    const counts = await getBoardCategoryCounts();
    for (const key of ['FINANCE', 'LOAN', 'ECONOMY', 'SUBSCRIPTION', 'REALESTATE'] as const) {
      expect(typeof counts[key]).toBe('number');
      expect(counts[key]).toBeGreaterThanOrEqual(0);
    }
  });

  it('PUBLISHED 글을 카테고리별로 집계한다(증가분 단언)', async () => {
    // 공유 DB·병렬 실행을 고려해 정확값 대신 증가분(>=)으로 단언한다.
    const before = await getBoardCategoryCounts();
    await prisma.post.create({ data: postData({ slug: `${MARK}re1`, category: 'REALESTATE', status: 'PUBLISHED' }) });
    await prisma.post.create({ data: postData({ slug: `${MARK}re2`, category: 'REALESTATE', status: 'PUBLISHED' }) });
    await prisma.post.create({ data: postData({ slug: `${MARK}re3`, category: 'REALESTATE', status: 'DRAFT' }) });
    const after = await getBoardCategoryCounts();
    expect(after.REALESTATE - before.REALESTATE).toBeGreaterThanOrEqual(2);
  });
});

describe('getBoardSourceOrgs', () => {
  it('PUBLISHED 글의 출처기관을 distinct로 반환하고 DRAFT는 제외한다', async () => {
    // 고유 sourceName으로 격리 → 공유 DB에서도 결정적으로 검증.
    const pubOrg = `${MARK}출처PUB`;
    const draftOrg = `${MARK}출처DRAFT`;
    await prisma.post.create({ data: postData({ slug: `${MARK}o1`, sourceName: pubOrg, status: 'PUBLISHED' }) });
    await prisma.post.create({ data: postData({ slug: `${MARK}o2`, sourceName: pubOrg, status: 'PUBLISHED' }) });
    await prisma.post.create({ data: postData({ slug: `${MARK}o3`, sourceName: draftOrg, status: 'DRAFT' }) });
    const orgs = await getBoardSourceOrgs(1000);
    expect(orgs).toContain(pubOrg);
    expect(orgs).not.toContain(draftOrg);
    expect(orgs.filter((o) => o === pubOrg)).toHaveLength(1); // distinct
  });

  it('limit으로 개수를 제한한다', async () => {
    const orgs = await getBoardSourceOrgs(3);
    expect(orgs.length).toBeLessThanOrEqual(3);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `dotenv -e .env.test -- vitest run tests/lib/board-post.test.ts`
Expected: FAIL — `getBoardCategoryCounts is not a function` / `getBoardSourceOrgs is not a function` (import 해석 실패).

- [ ] **Step 3: 최소 구현 추가**

`lib/board/post.ts`의 import에 `BOARD_CATEGORIES`를 추가한다(파일 상단, 기존 import 아래):

```ts
import { BOARD_CATEGORIES } from '@/lib/board/labels';
```

(순환참조 없음 — `labels.ts`는 `@prisma/client`만 import.)

파일 끝에 아래 두 함수를 추가한다:

```ts
/** 레일용: PUBLISHED 글을 카테고리별로 집계한다(0건 카테고리도 0으로 포함). */
export async function getBoardCategoryCounts(): Promise<Record<PostCategory, number>> {
  const grouped = await prisma.post.groupBy({
    by: ['category'],
    where: { status: 'PUBLISHED' },
    _count: { _all: true },
  });
  const counts = Object.fromEntries(
    BOARD_CATEGORIES.map((c) => [c.value, 0]),
  ) as Record<PostCategory, number>;
  for (const g of grouped) counts[g.category] = g._count._all;
  return counts;
}

/** 레일용: PUBLISHED 글의 출처기관을 글 수 내림차순 distinct로 반환한다. */
export async function getBoardSourceOrgs(limit = 8): Promise<string[]> {
  const grouped = await prisma.post.groupBy({
    by: ['sourceName'],
    where: { status: 'PUBLISHED' },
    _count: { _all: true },
    orderBy: { _count: { sourceName: 'desc' } },
    take: limit,
  });
  return grouped.map((g) => g.sourceName);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `dotenv -e .env.test -- vitest run tests/lib/board-post.test.ts`
Expected: PASS (신규 4개 포함 전체 통과).

- [ ] **Step 5: 커밋**

```bash
git add lib/board/post.ts tests/lib/board-post.test.ts
git commit -m "feat(board): 레일 집계 쿼리(분야별 글 수·출처 기관) 추가"
```

---

## Task 2: 목록 페이지 표 리디자인 (`page.tsx` + 목록 select)

`listPublishedPosts`가 `sourceName`을 반환하도록 바꾸고(요약·기준일 제거), 페이지를 표+레일로 재작성한다. 두 변경은 인과적으로 묶여 한 커밋으로 간다.

**Files:**
- Modify: `lib/board/post.ts` (PostListItem + select)
- Test: `tests/lib/board-post.test.ts` (sourceName 반환 테스트)
- Modify: `app/(public)/board/page.tsx` (전면 재작성)

- [ ] **Step 1: 실패하는 테스트 작성 (목록이 sourceName 반환)**

`tests/lib/board-post.test.ts`의 `describe('listPublishedPosts', ...)` 안, 마지막 it 뒤에 추가:

```ts
  it('목록 행에 sourceName을 포함한다', async () => {
    await prisma.post.create({ data: postData({ slug: `${MARK}src`, sourceName: '금융위원회' }) });
    const { rows } = await listPublishedPosts({ page: 1 });
    const mine = rows.find((r) => r.slug === `${MARK}src`);
    expect(mine?.sourceName).toBe('금융위원회');
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `dotenv -e .env.test -- vitest run tests/lib/board-post.test.ts -t "sourceName을 포함"`
Expected: FAIL — `mine.sourceName`가 `undefined`(타입상 존재하지 않음 / select 미포함).

- [ ] **Step 3: PostListItem·select 수정**

`lib/board/post.ts`의 `PostListItem` 인터페이스를 아래로 교체(요약·기준일 제거, sourceName 추가):

```ts
export interface PostListItem {
  slug: string;
  title: string;
  category: PostCategory;
  sourceName: string;
  publishedAt: Date;
}
```

`listPublishedPosts`의 `select`를 아래로 교체:

```ts
      select: { slug: true, title: true, category: true, sourceName: true, publishedAt: true },
```

- [ ] **Step 4: 목록 테스트 통과 확인**

Run: `dotenv -e .env.test -- vitest run tests/lib/board-post.test.ts`
Expected: PASS (기존 + sourceName 테스트 전체 통과).

- [ ] **Step 5: 페이지 전면 재작성**

`app/(public)/board/page.tsx` 전체를 아래로 교체:

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  listPublishedPosts,
  getBoardCategoryCounts,
  getBoardSourceOrgs,
} from '@/lib/board/post';
import { canViewBoard } from '@/lib/board/visibility';
import { BOARD_CATEGORIES, categoryLabel } from '@/lib/board/labels';
import type { PostCategory } from '@prisma/client';
import type { Metadata } from 'next';

export const revalidate = 3_600;

export const metadata: Metadata = {
  title: '소식 — 오늘의 이슈',
  description:
    '금융·대출·경제·청약·부동산 분야의 공공자료 기반 이슈 해설을 매일 업데이트합니다.',
  alternates: { canonical: '/board' },
};

interface Props {
  searchParams: Promise<{ category?: string; page?: string; preview?: string }>;
}

function isCategory(v: string | undefined): v is PostCategory {
  return !!v && BOARD_CATEGORIES.some((c) => c.value === v);
}

function pageNums(current: number, total: number): number[] {
  const lo = Math.max(1, current - 2);
  const hi = Math.min(total, current + 2);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

/** 탭·레일·페이지네이션 링크. category·page·preview 토큰을 함께 보존한다. */
function buildHref(opts: { category?: PostCategory; page?: number; preview?: string }): string {
  const params = new URLSearchParams();
  if (opts.category) params.set('category', opts.category);
  if (opts.page && opts.page > 1) params.set('page', String(opts.page));
  if (opts.preview) params.set('preview', opts.preview);
  const qs = params.toString();
  return qs ? `/board?${qs}` : '/board';
}

function chipClass(active: boolean): string {
  return `rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
    active
      ? 'bg-[var(--color-blue)] text-white'
      : 'border border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-blue)]'
  }`;
}

export default async function BoardListPage({ searchParams }: Props) {
  const sp = await searchParams;
  if (!canViewBoard(sp.preview)) notFound();
  const page = Math.max(1, Number(sp.page ?? 1));
  const category = isCategory(sp.category) ? sp.category : undefined;
  // 미리보기 모드에서는 상세 링크에도 토큰을 이어붙여 404 방지.
  const previewQs = sp.preview ? `?preview=${encodeURIComponent(sp.preview)}` : '';

  const [{ rows, totalPages }, counts, orgs] = await Promise.all([
    listPublishedPosts({ page, category }),
    getBoardCategoryCounts(),
    getBoardSourceOrgs(8),
  ]);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] md:p-7">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">소식</p>
        <h1 className="text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">
          오늘의 이슈
        </h1>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link href={buildHref({ preview: sp.preview })} className={chipClass(!category)}>
          전체
        </Link>
        {BOARD_CATEGORIES.map((c) => (
          <Link
            key={c.value}
            href={buildHref({ category: c.value, preview: sp.preview })}
            className={chipClass(category === c.value)}
          >
            {c.label}
          </Link>
        ))}
      </div>

      <div className="lg:flex lg:items-start lg:gap-6">
        <div className="min-w-0 flex-1">
          {rows.length === 0 ? (
            <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">
              아직 게시된 글이 없습니다.
            </div>
          ) : (
            <div className="overflow-hidden border-t-2 border-[var(--color-blue-dark)] bg-white">
              <table className="w-full table-fixed">
                <caption className="sr-only">오늘의 이슈 목록</caption>
                <thead>
                  <tr className="border-b border-[var(--color-line)]">
                    <th scope="col" className="w-[84px] px-4 py-2.5 text-left text-xs font-bold text-[var(--color-muted)]">분류</th>
                    <th scope="col" className="px-2 py-2.5 text-left text-xs font-bold text-[var(--color-muted)]">제목</th>
                    <th scope="col" className="hidden w-[140px] px-2 py-2.5 text-left text-xs font-bold text-[var(--color-muted)] sm:table-cell">출처</th>
                    <th scope="col" className="w-[92px] px-4 py-2.5 text-right text-xs font-bold text-[var(--color-muted)]">등록일</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr
                      key={p.slug}
                      className="border-b border-[var(--color-line)] transition last:border-b-0 hover:bg-[var(--color-soft)]"
                    >
                      <td className="px-4 py-3 align-middle">
                        <span className="inline-block rounded-full bg-[var(--color-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue)]">
                          {categoryLabel(p.category)}
                        </span>
                      </td>
                      <td className="px-2 py-3 align-middle">
                        <Link
                          href={`/board/${p.slug}${previewQs}`}
                          className="block truncate text-sm font-semibold text-[var(--color-blue-dark)] hover:underline"
                        >
                          {p.title}
                        </Link>
                      </td>
                      <td className="hidden truncate px-2 py-3 align-middle text-xs text-[var(--color-muted)] sm:table-cell">
                        {p.sourceName}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right align-middle text-xs text-[var(--color-muted)]">
                        {p.publishedAt.toISOString().slice(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {pageNums(page, totalPages).map((p) => (
                <Link
                  key={p}
                  href={buildHref({ category, page: p, preview: sp.preview })}
                  className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
                    page === p
                      ? 'bg-[var(--color-blue)] text-white'
                      : 'border border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-blue)]'
                  }`}
                >
                  {p}
                </Link>
              ))}
            </div>
          )}
        </div>

        <aside className="mt-8 flex flex-col gap-3 lg:mt-0 lg:w-[230px] lg:shrink-0">
          <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <p className="mb-2 text-xs font-bold text-[var(--color-blue-dark)]">이 게시판은</p>
            <p className="text-sm leading-relaxed text-[var(--color-muted)]">
              공공기관 보도자료·고시를 토대로 사실만 정리합니다. 전망·투자 추천은 담지 않습니다.
            </p>
          </div>

          <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <p className="mb-2 text-xs font-bold text-[var(--color-blue-dark)]">분야별 글</p>
            <ul className="text-sm">
              {BOARD_CATEGORIES.map((c) => (
                <li key={c.value} className="border-t border-[var(--color-line)] first:border-t-0">
                  <Link
                    href={buildHref({ category: c.value, preview: sp.preview })}
                    className="flex items-center justify-between py-1.5 text-[var(--color-text)] transition hover:text-[var(--color-blue)]"
                  >
                    <span>{c.label}</span>
                    <span className="font-bold text-[var(--color-blue)]">{counts[c.value]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {orgs.length > 0 && (
            <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
              <p className="mb-2 text-xs font-bold text-[var(--color-blue-dark)]">출처 기관</p>
              <div className="flex flex-wrap gap-1.5">
                {orgs.map((o) => (
                  <span
                    key={o}
                    className="rounded-full bg-[var(--color-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-blue-dark)]"
                  >
                    {o}
                  </span>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: 린트·빌드 통과 확인**

Run: `pnpm lint && pnpm build`
Expected: 에러 없음. (`no-img-element` 경고 없음 — 목록의 `<img>`가 제거됨.)

- [ ] **Step 7: 수동 확인**

게시판은 기본 비공개이므로 다음 중 하나로 접속:
- `.env.local`에 `NEXT_PUBLIC_BOARD_ENABLED=true` 임시 설정 후 `pnpm dev` → `http://localhost:3000/board`, 또는
- `BOARD_PREVIEW_TOKEN` 값으로 `http://localhost:3000/board?preview=<토큰>`.

확인 항목:
1. 표 렌더, 행에 이미지 없음. 컬럼: 분류 배지 · 제목(링크) · 출처 · 등록일(YYYY-MM-DD).
2. 위쪽 탭 클릭 → `?category=` 필터 동작(미리보기 모드면 토큰 유지되어 404 안 남).
3. 오른쪽 레일: "이 게시판은" 안내, "분야별 글" 카운트, "출처 기관" pill 표시. 분야 클릭 시 필터.
4. 브라우저 폭을 좁히면 "출처" 컬럼이 사라지고 레일이 리스트 아래로 내려감.
5. 글이 없을 때 "아직 게시된 글이 없습니다." 빈 상태.
6. 페이지가 여러 장이면 페이지네이션이 category·preview를 유지.

- [ ] **Step 8: 커밋**

```bash
git add lib/board/post.ts tests/lib/board-post.test.ts "app/(public)/board/page.tsx"
git commit -m "feat(board): 목록을 게시판형 표 리스트로 리디자인

- 카드 그리드/썸네일 이미지 제거 → 분류·제목·출처·등록일 표
- 헤더 제목 '오늘의 이슈', 설명 문구 제거
- 오른쪽 레일(안내·분야별 글 수·출처 기관) 추가
- 탭·레일·페이지네이션 링크가 preview 토큰 보존"
```

---

## Self-Review (작성자 점검 완료)

**스펙 커버리지:**
- 헤더 "오늘의 이슈"·설명 제거 → Task 2 Step 5 ✓
- 카드→표, 이미지 제거 → Task 2 Step 5 ✓
- 위쪽 탭 유지 → Task 2 Step 5 ✓
- 등록일=publishedAt → Task 2 Step 5(`publishedAt.toISOString().slice(0,10)`) ✓
- 레일 3카드(안내·분야별 글 수·출처 기관) → Task 1(쿼리) + Task 2(렌더) ✓
- `listPublishedPosts` select 조정(sourceName 추가, summary·sourceDate 제거) → Task 2 Step 3 ✓
- 집계 함수 2개 → Task 1 ✓
- 미리보기 가드·토큰 전파 → Task 2(`canViewBoard`, `buildHref`/`previewQs`) ✓
- 모바일 출처 컬럼 접힘 → `hidden ... sm:table-cell` ✓
- 접근성(시맨틱 table, caption, scope, 색+라벨 병행, 14px floor) → Task 2 ✓

**범위 밖(미변경) 확인:** 상세 페이지·OG/thumbnail 라우트·내비 라벨·카테고리 정의·조회수 — 어떤 Task도 건드리지 않음 ✓

**플레이스홀더 스캔:** 없음. 모든 코드 단계에 실제 코드 포함.

**타입 일관성:** `PostListItem`(Task 2: slug/title/category/sourceName/publishedAt) ↔ page.tsx 소비 필드 일치. `getBoardCategoryCounts(): Record<PostCategory, number>` ↔ `counts[c.value]` 일치. `getBoardSourceOrgs(): string[]` ↔ `orgs.map` 일치.

---

## Execution Handoff

구현 시작 시 실행 방식을 선택한다.
