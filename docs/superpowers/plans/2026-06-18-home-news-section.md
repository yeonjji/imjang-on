# 홈 하단 '오늘의 소식' 섹션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공개 게시판(`/board`)의 PUBLISHED 글 최신 5건을 홈 맨 아래(생활권 섹션 다음, 푸터 직전)에 '오늘의 소식' 섹션으로 노출한다.

**Architecture:** 데이터 헬퍼(`getHomeLatestPosts`)를 `lib/board/post.ts`에 추가 → 서버 컴포넌트 `HomeNews`가 대표글 1 + 리스트 4로 렌더 → 홈 `page.tsx`의 기존 `Promise.all`/`safe()` 패턴에 끼워넣는다. 읽기 전용 노출만 추가하고 게시판 생성·검수 파이프라인은 건드리지 않는다.

**Tech Stack:** Next.js(App Router, 서버 컴포넌트, `force-dynamic`), Prisma + PostgreSQL, Tailwind v4, Vitest(로컬 `.env.test` docker DB).

**Spec:** `docs/superpowers/specs/2026-06-18-home-news-section-design.md`
**목업:** `.superpowers/brainstorm/2904-1781785425/content/article-section-c-real.html`

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `lib/board/post.ts` | 게시글 조회 헬퍼 모음 | `HomePostItem` 타입 + `getHomeLatestPosts()` 추가 |
| `tests/lib/board-post.test.ts` | 위 헬퍼들의 단위 테스트 | `getHomeLatestPosts` describe 블록 추가 |
| `app/(public)/_components/home-news.tsx` | '오늘의 소식' 섹션 표현(서버 컴포넌트) | **신규** |
| `app/(public)/page.tsx` | 홈 조립 | import + `Promise.all` 항목 + `<HomeNews>` 렌더 |

각 파일은 단일 책임만 갖는다. 컴포넌트는 데이터를 받기만 하고(프롭 주입) 자체 쿼리하지 않는다 — 홈의 다른 섹션(MarketBriefing 등)과 동일한 패턴.

> **참고(테스트 전략):** 이 레포는 표현용 홈 컴포넌트(MarketBriefing·AmenityHub 등)에 단위/e2e 테스트를 두지 않는다(vitest 환경 `node`, testing-library 없음, e2e 시드에 Post 없음). 따라서 `HomeNews`는 **타입체크 + 수동 시각 확인**으로 검증하고, 로직이 든 데이터 헬퍼만 TDD한다.

---

## Task 1: `getHomeLatestPosts` 데이터 헬퍼 (TDD)

**Files:**
- Test: `tests/lib/board-post.test.ts` (기존 파일 끝에 describe 추가)
- Modify: `lib/board/post.ts` (파일 끝에 타입 + 함수 추가)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/board-post.test.ts` 의 import 줄(4행)에 `getHomeLatestPosts` 를 추가한다:

```ts
import { listPublishedPosts, getPublishedPostBySlug, normalizeSlug, PAGE_SIZE, getBoardCategoryCounts, getBoardSourceOrgs, getHomeLatestPosts } from '@/lib/board/post';
```

파일 맨 끝(136행 이후)에 아래 describe 블록을 추가한다. 공유 DB·병렬 실행을 고려해, 내 글이 항상 상위에 오도록 `publishedAt`을 먼 미래(2999년)로 두고 내 slug 기준으로만 단언한다(기존 테스트들의 격리 패턴과 동일):

```ts
describe('getHomeLatestPosts', () => {
  it('PUBLISHED만 노출하고 DRAFT는 제외한다', async () => {
    await prisma.post.create({ data: postData({ slug: `${MARK}home-pub`, status: 'PUBLISHED', publishedAt: new Date('2999-01-02') }) });
    await prisma.post.create({ data: postData({ slug: `${MARK}home-draft`, status: 'DRAFT', publishedAt: new Date('2999-01-03') }) });
    const rows = await getHomeLatestPosts(5);
    const slugs = rows.map((r) => r.slug);
    expect(slugs).toContain(`${MARK}home-pub`);
    expect(slugs).not.toContain(`${MARK}home-draft`);
  });

  it('publishedAt 내림차순으로 정렬하고 limit을 지킨다', async () => {
    await prisma.post.create({ data: postData({ slug: `${MARK}home-A`, publishedAt: new Date('2999-02-01') }) });
    await prisma.post.create({ data: postData({ slug: `${MARK}home-B`, publishedAt: new Date('2999-02-05') }) });
    const rows = await getHomeLatestPosts(2);
    expect(rows).toHaveLength(2);              // DB에 최소 내 2건 → limit으로 정확히 2건만
    expect(rows[0].slug).toBe(`${MARK}home-B`); // 더 최신(2999-02-05)이 맨 앞
    expect(rows[1].slug).toBe(`${MARK}home-A`);
  });

  it('대표 카드용 summary를 포함한다', async () => {
    await prisma.post.create({ data: postData({ slug: `${MARK}home-sum`, summary: '홈요약텍스트', publishedAt: new Date('2999-03-01') }) });
    const rows = await getHomeLatestPosts(5);
    const mine = rows.find((r) => r.slug === `${MARK}home-sum`);
    expect(mine?.summary).toBe('홈요약텍스트');
  });

  it('기본 limit은 5 이하의 배열을 반환한다', async () => {
    const rows = await getHomeLatestPosts();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeLessThanOrEqual(5);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/board-post.test.ts -t "getHomeLatestPosts"`
Expected: FAIL — `getHomeLatestPosts is not a function` / import 에러.

> 로컬 docker DB가 떠 있어야 한다. 안 떠 있으면 `assertLocalDatabase()`가 막거나 연결 에러가 난다. (메모리 규칙: 검증은 `.env.test`)

- [ ] **Step 3: 최소 구현 추가**

`lib/board/post.ts` 맨 끝(93행 이후)에 추가한다. 기존 `PostListItem`/`listPublishedPosts`는 건드리지 않는다(표는 summary 불필요):

```ts
export interface HomePostItem {
  slug: string;
  title: string;
  summary: string;
  category: PostCategory;
  sourceName: string;
  publishedAt: Date;
}

/** 홈 '오늘의 소식'용: PUBLISHED 글 최신 N건(대표 카드 summary 포함). */
export async function getHomeLatestPosts(limit = 5): Promise<HomePostItem[]> {
  const rows = await prisma.post.findMany({
    where: { status: 'PUBLISHED' },
    select: { slug: true, title: true, summary: true, category: true, sourceName: true, publishedAt: true },
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });
  return rows.map((r) => ({ ...r, publishedAt: r.publishedAt! }));
}
```

`PostCategory` 타입은 이미 파일 상단 2행에서 import되어 있으므로 추가 import 불필요.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/board-post.test.ts -t "getHomeLatestPosts"`
Expected: PASS (4 tests).

- [ ] **Step 5: 커밋**

```bash
git add lib/board/post.ts tests/lib/board-post.test.ts
git commit -m "feat(board): getHomeLatestPosts 헬퍼 추가(홈 최신 게시글)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `HomeNews` 서버 컴포넌트

**Files:**
- Create: `app/(public)/_components/home-news.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`app/(public)/_components/home-news.tsx` 신규 생성. 전체 코드:

```tsx
import Link from 'next/link';
import type { HomePostItem } from '@/lib/board/post';
import { categoryLabel } from '@/lib/board/labels';

/** publishedAt → "MM.DD" (등록일 보조 표기). */
function shortDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}.${dd}`;
}

/** 홈 맨 아래 '오늘의 소식': 대표글 1 + 리스트 4. 글이 없으면 렌더하지 않는다. */
export function HomeNews({ posts }: { posts: HomePostItem[] }) {
  if (posts.length === 0) return null;
  const [featured, ...rest] = posts;
  const list = rest.slice(0, 4);

  return (
    <section className="mt-16">
      <div className="flex flex-wrap items-end justify-between gap-x-2.5 gap-y-1">
        <div>
          <h2 className="text-xl font-black tracking-tight md:text-[22px]">📰 오늘의 소식</h2>
          <p className="mt-1 text-[13px] text-[var(--color-muted)]">공공기관 보도자료·고시를 사실 위주로 정리</p>
        </div>
        <Link href="/board" className="text-[13px] font-bold text-[var(--color-blue)] hover:underline">
          전체 보기 →
        </Link>
      </div>

      <div className="mt-[18px] grid grid-cols-1 gap-5 md:grid-cols-[1.12fr_0.88fr] md:items-stretch">
        {/* 대표(최신 1건) */}
        <Link
          href={`/board/${featured.slug}`}
          className="flex flex-col rounded-[20px] border border-[var(--color-line)] bg-[var(--color-soft)] p-5 shadow-[var(--shadow-soft)] transition hover:border-[var(--color-blue)]"
        >
          <span className="inline-block w-fit rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue)]">
            {categoryLabel(featured.category)}
          </span>
          <h3 className="mt-2.5 text-[17px] font-black leading-snug tracking-tight text-[var(--color-blue-dark)] md:text-lg">
            {featured.title}
          </h3>
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[var(--color-text)]">
            {featured.summary}
          </p>
          <span className="mt-auto flex items-center gap-1.5 pt-3 text-xs text-[var(--color-muted)]">
            <span className="truncate">{featured.sourceName}</span>
            <span>·</span>
            <span className="whitespace-nowrap">{shortDate(featured.publishedAt)}</span>
          </span>
        </Link>

        {/* 리스트(다음 4건) */}
        {list.length > 0 && (
          <ul className="rounded-[20px] border border-[var(--color-line)] bg-white p-3 shadow-[var(--shadow-soft)]">
            {list.map((p) => (
              <li key={p.slug} className="border-b border-[var(--color-line)] last:border-0">
                <Link
                  href={`/board/${p.slug}`}
                  className="flex items-center gap-2.5 px-2 py-3 transition hover:bg-[var(--color-soft)]"
                >
                  <span className="inline-block flex-none rounded-full bg-[var(--color-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue)]">
                    {categoryLabel(p.category)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--color-blue-dark)]">
                    {p.title}
                  </span>
                  <span className="flex-none whitespace-nowrap text-[11px] text-[var(--color-muted)]">
                    {shortDate(p.publishedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
```

설계 메모:
- `mt-16` / `rounded-[20px]` / `shadow-[var(--shadow-soft)]` / 칩 색상은 MarketBriefing·board 표와 동일 토큰(시각 통일).
- `line-clamp-3`은 Tailwind v4 내장(이미 `line-clamp-2` 사용 중이라 안전).
- 그림자는 `--shadow-soft` 하나만(PRODUCT 원칙).
- 1건이면 `list`가 비어 리스트 `<ul>`은 렌더되지 않음 → 대표 카드만 1열로.

- [ ] **Step 2: 타입체크 통과 확인**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음(특히 `home-news.tsx` 관련 0건).

- [ ] **Step 3: 커밋**

```bash
git add "app/(public)/_components/home-news.tsx"
git commit -m "feat(board): 홈 '오늘의 소식' HomeNews 컴포넌트

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 홈 페이지에 연결

**Files:**
- Modify: `app/(public)/page.tsx`

- [ ] **Step 1: import 추가**

`app/(public)/page.tsx` 상단 import 블록(1~11행)에 3줄을 추가한다. 기존 `_components` import들 사이/뒤, 그리고 lib import 그룹에 맞춰 넣는다:

```tsx
import { AmenityHub } from './_components/amenity-hub';
import { HomeNews } from './_components/home-news';            // ← 추가
```
```tsx
import { readHomeSnapshot } from '@/lib/dashboard-snapshot';
import { getHomeLatestPosts } from '@/lib/board/post';          // ← 추가
import { isBoardPublic } from '@/lib/board/visibility';         // ← 추가
```

- [ ] **Step 2: `Promise.all`에 항목 추가**

37~49행의 `Promise.all` 배열과 구조분해를 아래처럼 바꾼다. 게시판 비공개면 쿼리 자체를 건너뛰고(`Promise.resolve([])`), DB 블립 시 `safe(..., [])`로 빈 배열 폴백:

```tsx
  const [sidoList, stats, snapshot, weeklyBoard, latestPosts] = await Promise.all([
    getSidoList(),
    safe(getHomeStats(), { transactions: 0, properties: 0, schools: 0, lifeFacilities: 0 }),
    // 브리핑·인기지역은 5M행 집계라 요청 경로에서 너무 느리다. 일일 ingest가 미리 계산해 둔 스냅샷을 즉시 읽는다.
    safe(readHomeSnapshot(), { briefing: null, popularRegions: [] }),
    safe(getWeeklySubscriptions(), {
      weekStart: new Date(),
      weekEnd: new Date(),
      days: [],
      summary: { open: 0, upcoming: 0, closed: 0 },
      total: 0,
    }),
    safe(isBoardPublic() ? getHomeLatestPosts(5) : Promise.resolve([]), []),
  ]);
```

- [ ] **Step 3: `<AmenityHub />` 다음에 컴포넌트 렌더**

70행의 `<AmenityHub />` 바로 아래(섹션의 맨 끝)에 추가한다:

```tsx
      <AmenityHub />

      <HomeNews posts={latestPosts} />
    </section>
```

- [ ] **Step 4: 타입체크 + 빌드**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 0건.

Run: `pnpm build`
Expected: 빌드 성공(`prisma generate && next build`). 홈은 `force-dynamic`이라 프리렌더 경고 없음.

- [ ] **Step 5: 수동 시각 확인**

```bash
pnpm exec dotenv -e .env.local -- next dev
```
- 브라우저로 `http://localhost:3000` 열기 → 맨 아래로 스크롤.
- 확인 항목:
  - "생활권까지 함께 보기" 다음, 푸터 위에 **📰 오늘의 소식** 섹션이 보인다.
  - 좌측 대표 카드(분류 칩 + 제목 + 요약 3줄 + 출처 · MM.DD), 우측 리스트 4건(칩 + 제목 + 날짜).
  - "전체 보기 →" 클릭 시 `/board`, 각 글 클릭 시 `/board/{slug}` 이동.
  - 목업(`article-section-c-real.html`)과 레이아웃이 일치.

> 운영 DB에 PUBLISHED 11건이 있으므로 5건이 채워진다. (게시글이 0건인 환경이라면 섹션이 보이지 않는 게 정상.)

- [ ] **Step 6: 커밋**

```bash
git add "app/(public)/page.tsx"
git commit -m "feat(board): 홈 맨 아래 '오늘의 소식' 섹션 연결

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 최종 검증

- [ ] **Step 1: 관련 단위 테스트 전체 실행**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/board-post.test.ts`
Expected: 기존 + 신규 `getHomeLatestPosts` 테스트 모두 PASS.

- [ ] **Step 2: 회귀 확인(빌드)**

Run: `pnpm build`
Expected: 성공.

- [ ] **Step 3: 변경 요약 확인**

Run: `git log --oneline -4`
Expected: Task 1~3 커밋 3건이 보인다. 작업 트리 clean.

---

## Self-Review (작성자 체크 — 완료)

- **스펙 커버리지:** 레이아웃(C) → Task 2 / 데이터·최신순·limit·summary → Task 1 / 홈 연결·맨 아래 배치 → Task 3 / 폴백(0건·비공개) → Task 3 Step 2 + Task 2 `posts.length===0` / 검증 → Task 1·4. 누락 없음.
- **플레이스홀더:** 모든 코드·명령·기대 출력 명시. TODO/TBD 없음.
- **타입 일관성:** `HomePostItem`(Task 1) ↔ `HomeNews({ posts }: { posts: HomePostItem[] })`(Task 2) ↔ `latestPosts`(Task 3) 일치. `getHomeLatestPosts`/`isBoardPublic`/`categoryLabel` 시그니처 실제 파일과 일치 확인.
