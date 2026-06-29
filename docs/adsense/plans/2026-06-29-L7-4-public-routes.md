# L7 Plan 4 — Guide 공개 라우트(/guide 목록·상세 + JSON-LD + 나브 + 사이트맵) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 검수·게시된 가이드를 **공개·색인**되게 한다 — `/guide` 목록 + `/guide/[slug]` 상세(SSR·JSON-LD), 헤더 "가이드" 메뉴, 사이트맵 guide 소스. 이로써 원본 콘텐츠 앵커가 검색/AdSense에 노출된다.

**Architecture:** Plan 3의 `lib/guide/queries.ts`(listPublishedGuides·getPublishedGuideBySlug)를 소비하는 공개 라우트 2개(board 라우트 미러, 단 공개라 preview/visibility 게이팅 없음). 상세는 ReactMarkdown 본문 + `PostSource` 출처 + Article/Breadcrumb JSON-LD. 사이트맵은 `lib/sitemap/sources.ts`에 `dbSource` 1개를 **SOURCE_ORDER 끝에** 추가(기존 샤드 인덱스 불변).

**Tech Stack:** Next.js App Router 서버컴포넌트, ReactMarkdown+remark-gfm(board와 동일), `lib/seo/json-ld.tsx`, vitest(`tests/lib` 사이트맵 테스트).

> **설계 출처:** `docs/adsense/guide-system-design.md` §5. **선행:** Plan 3(queries·labels) 완료. **후속(분리):** Plan 5 = POI 상세 "관련 가이드" 블록(L4 — `RelatedGuides` + `guideCategoryForPage`·`getGuidesByCategory`로 ~11개 상세 페이지 배선). 본 플랜에 POI 배선은 포함하지 않는다.

---

## File Structure
- **Modify:** `lib/seo/json-ld.tsx` — `guideArticleSchema()` 추가(@type Article).
- **Create:** `app/(public)/guide/page.tsx` — 가이드 목록(카테고리 칩 + 카드/표 + 페이지네이션).
- **Create:** `app/(public)/guide/[slug]/page.tsx` — 상세(SSR, 본문 마크다운, 출처, JSON-LD).
- **Modify:** `app/(public)/_components/nav.tsx` — 헤더에 "가이드" 링크.
- **Modify:** `lib/sitemap/sources.ts` — `guide` dbSource를 SOURCE_ORDER 끝에 추가.

## 배경(엔지니어용)
- 미러 원본: `app/(public)/board/page.tsx`(목록)·`app/(public)/board/[id]/page.tsx`(상세). **가이드는 공개**라 board의 `canViewBoard(preview)`·`isBoardPublic()` 게이팅을 쓰지 않는다. 상세 키는 **slug**(board는 id) — `getPublishedGuideBySlug(slug)` 사용, slug는 `normalizeSlug` 정규화 후 조회(queries.ts가 이미 처리).
- **slug-path 선택(설계 결정):** board는 한글 slug의 URL 퍼센트인코딩 취약성 때문에 id-path로 옮겼으나, 가이드는 SEO가 핵심 목적이라 slug-path를 택한다. 수신 param의 디코딩은 `normalizeSlug`(decodeURIComponent+NFC, board의 레거시 slug 조회로 검증된 경로)가 처리하므로 % 깨짐 위험은 흡수된다. 가이드는 수십 편 규모라 리스크가 작다.
- 재사용: `lib/guide/queries.ts`(listPublishedGuides·getPublishedGuideBySlug·GUIDE_PAGE_SIZE), `lib/guide/labels.ts`(GUIDE_CATEGORIES·guideCategoryLabel), `@/components/ui/post-source`(PostSource — sourceName/sourceUrl/sourceDate), `@/lib/seo/json-ld`(JsonLd·breadcrumbSchema).
- 사이트맵: `dbSource({key,count,findMany,toEntry})` 헬퍼 + `SOURCE_ORDER` 배열. **끝에만 추가**(주석: "끝에 추가 — 기존 샤드 인덱스 불변"). guide URL = `/guide/<slug>`.
- 사이트맵 테스트가 소스 키/순서를 단언할 수 있음(`tests/lib/sitemap*.test.ts`) — 깨지면 guide 소스를 반영해 fixture 최소 수정.

---

## Task 1: `guideArticleSchema` JSON-LD (TDD)

**Files:** Modify `lib/seo/json-ld.tsx`, Create `tests/lib/guide-jsonld.test.ts`

- [ ] **Step 1: 실패 테스트** — `tests/lib/guide-jsonld.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { guideArticleSchema } from '@/lib/seo/json-ld';

describe('guideArticleSchema', () => {
  it('Article 타입 JSON-LD를 만든다', () => {
    const s = guideArticleSchema({
      headline: '실거래가 읽는 법',
      url: 'https://imjangon.co.kr/guide/실거래가-읽는-법',
      description: '실거래가의 의미',
      datePublished: '2026-06-29',
    });
    expect(s['@type']).toBe('Article');
    expect(s.headline).toBe('실거래가 읽는 법');
    expect((s.publisher as { name: string }).name).toBe('임장ON');
  });
});
```

- [ ] **Step 2: 실행 → 실패** — `pnpm exec vitest run tests/lib/guide-jsonld.test.ts` → FAIL(함수 없음).

- [ ] **Step 3: 구현** — `lib/seo/json-ld.tsx`의 `articleSchema` 아래(JsonLd 위)에 추가:

```tsx
/** 상록 가이드용 Article JSON-LD(board의 NewsArticle과 구분). */
export function guideArticleSchema(input: {
  headline: string;
  url: string;
  description: string;
  datePublished: string; // YYYY-MM-DD
  dateModified?: string;
  image?: string;
}): Json {
  return {
    ...ctx,
    '@type': 'Article',
    headline: input.headline,
    description: input.description,
    url: input.url,
    datePublished: input.datePublished,
    ...(input.dateModified ? { dateModified: input.dateModified } : {}),
    ...(input.image ? { image: input.image } : {}),
    publisher: { '@type': 'Organization', name: '임장ON', url: SITE_URL },
  };
}
```

- [ ] **Step 4: 실행 → 통과** — `pnpm exec vitest run tests/lib/guide-jsonld.test.ts` → PASS.
- [ ] **Step 5: 커밋**
  ```bash
  git add lib/seo/json-ld.tsx tests/lib/guide-jsonld.test.ts
  git commit -m "feat(guide): Article JSON-LD 스키마 (L7-4)"
  ```

## Task 2: `/guide/[slug]` 상세 라우트

**Files:** Create `app/(public)/guide/[slug]/page.tsx`

- [ ] **Step 1: 구현** — `app/(public)/guide/[slug]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getPublishedGuideBySlug } from '@/lib/guide/queries';
import { guideCategoryLabel } from '@/lib/guide/labels';
import { PostSource } from '@/components/ui/post-source';
import { JsonLd, guideArticleSchema, breadcrumbSchema } from '@/lib/seo/json-ld';
import { SITE_URL } from '@/lib/site';
import type { Metadata } from 'next';

export const revalidate = 86_400;

interface Params { params: Promise<{ slug: string }>; }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const guide = await getPublishedGuideBySlug(slug).catch(() => null);
  if (!guide) return {};
  return {
    title: `${guide.title} — 임장ON 가이드`,
    description: guide.summary,
    alternates: { canonical: `/guide/${guide.slug}` },
  };
}

export default async function GuideDetailPage({ params }: Params) {
  const { slug } = await params;
  const guide = await getPublishedGuideBySlug(slug);
  if (!guide) notFound();

  const url = `${SITE_URL}/guide/${guide.slug}`;
  const published = guide.publishedAt.toISOString().slice(0, 10);

  return (
    <article className="mx-auto max-w-[760px] px-6 py-12">
      <JsonLd
        data={[
          guideArticleSchema({ headline: guide.title, url, description: guide.summary, datePublished: published }),
          breadcrumbSchema([
            { name: '홈', url: `${SITE_URL}/` },
            { name: '가이드', url: `${SITE_URL}/guide` },
            { name: guide.title, url },
          ]),
        ]}
      />
      <span className="inline-block rounded-full bg-[var(--color-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue)]">
        {guideCategoryLabel(guide.category)}
      </span>
      <h1 className="mt-3 text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">
        {guide.title}
      </h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">임장ON 가이드 · {guideCategoryLabel(guide.category)}</p>
      <div className="board-prose mt-8 text-[15px] leading-relaxed text-[var(--color-text)]">
        <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{guide.body}</ReactMarkdown>
      </div>
      <PostSource sourceName={guide.sourceName} sourceUrl={guide.sourceUrl} sourceDate={guide.sourceDate} />
    </article>
  );
}
```

- [ ] **Step 2: 타입체크** — `pnpm typecheck` → 에러 없음.
- [ ] **Step 3: 커밋**
  ```bash
  git add "app/(public)/guide/[slug]/page.tsx"
  git commit -m "feat(guide): /guide/[slug] 공개 상세 라우트(SSR·JSON-LD) (L7-4)"
  ```

## Task 3: `/guide` 목록 라우트

**Files:** Create `app/(public)/guide/page.tsx`

- [ ] **Step 1: 구현** — `app/(public)/guide/page.tsx`:

```tsx
import Link from 'next/link';
import { listPublishedGuides } from '@/lib/guide/queries';
import { GUIDE_CATEGORIES, guideCategoryLabel } from '@/lib/guide/labels';
import type { GuideCategory } from '@prisma/client';
import type { Metadata } from 'next';

export const revalidate = 3_600;

export const metadata: Metadata = {
  title: '생활·부동산 가이드',
  description: '부동산 실거래가·청약·금융·의료·보육·학교·생활 정보를 쉽게 풀어 설명하는 상록 가이드.',
  alternates: { canonical: '/guide' },
};

interface Props { searchParams: Promise<{ category?: string; page?: string }>; }

function isCategory(v: string | undefined): v is GuideCategory {
  return !!v && GUIDE_CATEGORIES.some((c) => c.value === v);
}

function buildHref(opts: { category?: GuideCategory; page?: number }): string {
  const params = new URLSearchParams();
  if (opts.category) params.set('category', opts.category);
  if (opts.page && opts.page > 1) params.set('page', String(opts.page));
  const qs = params.toString();
  return qs ? `/guide?${qs}` : '/guide';
}

function chipClass(active: boolean): string {
  return `rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
    active ? 'bg-[var(--color-blue)] text-white' : 'border border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-blue)]'
  }`;
}

function pageNums(current: number, total: number): number[] {
  const lo = Math.max(1, current - 2);
  const hi = Math.min(total, current + 2);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

export default async function GuideListPage({ searchParams }: Props) {
  const sp = await searchParams;
  const parsedPage = Number(sp.page ?? 1);
  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? Math.floor(parsedPage) : 1;
  const category = isCategory(sp.category) ? sp.category : undefined;

  const { rows, totalPages } = await listPublishedGuides({ page, category });

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] md:p-7">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">가이드</p>
        <h1 className="text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">생활·부동산 가이드</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">공공데이터를 토대로 개념·절차를 쉽게 풀어 설명합니다.</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link href={buildHref({})} className={chipClass(!category)}>전체</Link>
        {GUIDE_CATEGORIES.map((c) => (
          <Link key={c.value} href={buildHref({ category: c.value })} className={chipClass(category === c.value)}>
            {c.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">
          아직 게시된 가이드가 없습니다.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {rows.map((g) => (
            <li key={g.slug} className="rounded-[18px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] transition hover:border-[var(--color-blue)]">
              <span className="inline-block rounded-full bg-[var(--color-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue)]">
                {guideCategoryLabel(g.category)}
              </span>
              <Link href={`/guide/${g.slug}`} className="mt-2 block text-lg font-bold text-[var(--color-blue-dark)] hover:underline">
                {g.title}
              </Link>
              <p className="mt-1 line-clamp-2 text-sm text-[var(--color-muted)]">{g.summary}</p>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {pageNums(page, totalPages).map((p) => (
            <Link
              key={p}
              href={buildHref({ category, page: p })}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
                page === p ? 'bg-[var(--color-blue)] text-white' : 'border border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-blue)]'
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입체크** — `pnpm typecheck` → 에러 없음.
- [ ] **Step 3: 커밋**
  ```bash
  git add "app/(public)/guide/page.tsx"
  git commit -m "feat(guide): /guide 공개 목록 라우트 (L7-4)"
  ```

## Task 4: 헤더 "가이드" 메뉴

**Files:** Modify `app/(public)/_components/nav.tsx`

- [ ] **Step 1: 데스크톱 메뉴에 링크 추가** — `nav.tsx`의 `<Link href="/subscription">청약</Link>` 다음 줄에 추가:

```tsx
            <Link href="/guide">가이드</Link>
```

(board 링크처럼 `isBoardPublic()` 게이팅 없이 항상 노출 — 가이드는 공개.)

- [ ] **Step 2: 타입체크** — `pnpm typecheck` → 에러 없음.
- [ ] **Step 3: 커밋**
  ```bash
  git add "app/(public)/_components/nav.tsx"
  git commit -m "feat(guide): 헤더에 가이드 메뉴 추가 (L7-4)"
  ```

> 참고: 모바일 드로어(`mobile-drawer.tsx`)에도 동일 링크가 필요하면 같은 패턴으로 추가. 데스크톱 네비가 1차 목표이며, 모바일은 별도 확인(이 플랜은 데스크톱 nav만 필수).

## Task 5: 사이트맵 guide 소스

**Files:** Modify `lib/sitemap/sources.ts`

- [ ] **Step 1: `guide` dbSource 추가** — `lib/sitemap/sources.ts`의 `jeonseGuarantee` dbSource 정의 **다음**에 추가:

```ts
const guide = dbSource({
  key: 'guide',
  count: () => prisma.guide.count({ where: { status: 'PUBLISHED' } }),
  findMany: (skip, take) =>
    prisma.guide.findMany({
      where: { status: 'PUBLISHED' },
      select: { slug: true, updatedAt: true },
      orderBy: { id: 'asc' },
      skip,
      take,
    }),
  toEntry: (g) => ({
    url: `${SITE_URL}/guide/${g.slug}`,
    lastModified: g.updatedAt,
    changeFrequency: 'monthly',
    priority: 0.6,
  }),
});
```

- [ ] **Step 2: SOURCE_ORDER 끝에 추가** — `SOURCE_ORDER` 배열의 **마지막**(`jeonseGuarantee` 다음)에 `guide`를 추가(기존 샤드 인덱스 불변 — 반드시 끝):

```ts
  jeonseGuarantee, // 끝에 추가 — 기존 샤드 인덱스(core..post) 불변
  guide,           // 끝에 추가 — 기존 샤드 인덱스 불변
];
```

- [ ] **Step 3: 사이트맵 테스트** — `pnpm exec vitest run tests/lib/sitemap.test.ts tests/lib/sitemap-manifest.test.ts tests/lib/sitemap-post-source.test.ts` → 실행. guide 소스(현재 PUBLISHED 0건 → 0 URL)로 인해 깨지는 fixture가 있으면 **guide 소스를 반영해 최소 수정**(소스 키 목록/순서 단언에 'guide' 추가). 단언이 동적 count 기반이면 무변경.

- [ ] **Step 4: 타입체크 + 전체 단위** — `pnpm typecheck` 클린, `pnpm test:unit` 그린.
- [ ] **Step 5: 커밋**
  ```bash
  git add lib/sitemap/sources.ts tests/lib/sitemap*.test.ts
  git commit -m "feat(guide): 사이트맵 guide 소스 추가(SOURCE_ORDER 끝) (L7-4)"
  ```

## Verification
- `pnpm test:unit` 그린(guide-jsonld + 기존 사이트맵 테스트 포함).
- `pnpm typecheck` 클린.
- 라우트 컴파일: `/guide`·`/guide/[slug]`. 게시된 가이드가 있으면 목록·상세 SSR 렌더, 사이트맵에 `/guide/<slug>` 포함, 상세에 Article+Breadcrumb JSON-LD.
- 배포 후: PUBLISHED 가이드 no-JS fetch에 본문 존재 + 사이트맵에 guide URL.

## Out of scope (후속)
- **Plan 5 (L4):** POI/매물 상세 "관련 가이드" 블록 — `RelatedGuides` 서버 컴포넌트(`guideCategoryForPage`·`getGuidesByCategory`) + ~11개 상세 페이지 배선.
- 모바일 드로어 가이드 링크(데스크톱 nav 확인 후 필요 시).
- 본문 25–40편 집필·검수(운영) · 운영 DB 반영(머지 전 수동 `prisma:deploy`).
