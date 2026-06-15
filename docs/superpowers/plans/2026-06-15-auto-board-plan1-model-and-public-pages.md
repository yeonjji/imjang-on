# 자동 게시판 — 플랜 1: 데이터 모델 + 공개 게시판 페이지 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Post` 데이터 모델과 공개 게시판(`/board` 목록 + `/board/[slug]` 상세 + OG 썸네일 + 사이트맵/SEO)을 구현해, DB에 PUBLISHED 글이 있으면 공개적으로 읽히는 동작하는 게시판을 만든다.

**Architecture:** 기존 공개 페이지 패턴(ISR + `generateMetadata` canonical + `JsonLd` + 기존 list/detail 레이아웃)을 그대로 따른다. 데이터 접근은 `lib/board/*` 모듈로 격리하고, 사이트맵은 기존 `SitemapSource` 인터페이스에 소스 한 개를 추가한다. 본문은 마크다운 단일 문자열로 저장하고 `react-markdown`으로 렌더한다.

**Tech Stack:** Next.js 15 App Router, Prisma 5 + PostgreSQL(Supabase/로컬 docker), vitest(node env), react-markdown + remark-gfm.

> 이 플랜은 전체 3-플랜 중 **1번**이다. (플랜 2: 어드민 컨펌 UI / 플랜 3: 생성 파이프라인 + GitHub Actions). 플랜 1만으로도 "DB에 글이 있으면 공개 노출되는 게시판"이라는 동작하는 소프트웨어가 완성된다. 설계 원본: `docs/superpowers/specs/2026-06-15-auto-board-content-pipeline-design.md`.

## 전제 / 주의사항

- 브랜치 `feat/auto-board`에서 작업한다(이미 생성됨).
- **DB 마이그레이션 주의(프로젝트 메모리):** `prisma migrate dev`는 `.env.local`(운영 Supabase)을 가리킨다. 마이그레이션은 **로컬 docker(.env.test)에서 먼저** 만들고 검증한 뒤, 운영 배포는 새 마이그레이션 폴더만 좁게 add + `migrate status` 확인 후 진행한다. 이 플랜의 Task 2는 로컬까지만 다룬다(운영 배포는 플랜 3 직전 또는 머지 시).
- 단위 테스트는 `.env.test`(로컬 docker DB)로 돈다. DB-touching 테스트는 `assertLocalDatabase()`로 운영 DB 오염을 막고, 자기 데이터를 마커(`slug` prefix `test-`)로 생성·삭제한다.
- 모든 파일 경로는 정확히 표기. 기존 스타일(한글 주석, CSS 변수 `var(--color-*)`)을 따른다.

---

### Task 1: 마크다운 렌더링 의존성 추가

**Files:**
- Modify: `package.json` (dependencies)

- [ ] **Step 1: 의존성 설치**

Run:
```bash
cd /Users/jiyeonjeong/project/imjang-on
pnpm add react-markdown remark-gfm
```
Expected: `package.json`의 `dependencies`에 `react-markdown`, `remark-gfm` 추가. (remark-gfm은 템플릿이 표를 쓰므로 GFM 표 지원에 필요.)

- [ ] **Step 2: 설치 확인**

Run: `node -e "console.log(require('react-markdown/package.json').version, require('remark-gfm/package.json').version)"`
Expected: 두 버전 번호 출력(에러 없음).

- [ ] **Step 3: 커밋**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(board): react-markdown + remark-gfm 추가"
```

---

### Task 2: Prisma `Post` 모델 + 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma` (파일 끝에 enum 3개 + model Post 추가)
- Create: `prisma/migrations/<timestamp>_add_post_model/migration.sql` (마이그레이션 생성으로 자동)

- [ ] **Step 1: schema.prisma 끝에 enum + 모델 추가**

`prisma/schema.prisma` 맨 아래에 추가:
```prisma
enum PostStatus {
  DRAFT
  PUBLISHED
  REJECTED
}

enum PostType {
  PROGRAM
  TREND
}

enum PostCategory {
  FINANCE
  LOAN
  ECONOMY
  SUBSCRIPTION
  REALESTATE
}

model Post {
  id       BigInt       @id @default(autoincrement())
  slug     String       @unique @db.VarChar(200)
  title    String       @db.VarChar(200)
  summary  String       @db.Text
  body     String       @db.Text
  type     PostType
  category PostCategory
  status   PostStatus   @default(DRAFT)

  // 근거(출처) — 모든 글에 필수
  sourceName    String   @db.VarChar(120)
  sourceUrl     String   @db.VarChar(500)
  sourceDate    DateTime @db.Date
  sourceExcerpt String   @db.Text

  // 중복 방지
  dedupeKey String @unique @db.VarChar(120)

  // 운영 메타
  detectedFrom String?   @db.VarChar(200)
  generatedAt  DateTime  @default(now())
  publishedAt  DateTime?
  reviewedAt   DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@index([status, publishedAt(sort: Desc)])
  @@index([category, status])
}
```

- [ ] **Step 2: 로컬 docker DB에 마이그레이션 생성**

Run:
```bash
dotenv -e .env.test -- prisma migrate dev --name add_post_model --create-only
```
Expected: `prisma/migrations/<ts>_add_post_model/migration.sql` 생성. `--create-only`로 SQL만 만들고 적용은 보류(내용 검토용).

- [ ] **Step 3: 생성된 SQL 검토**

Run: `cat prisma/migrations/*_add_post_model/migration.sql`
Expected: `CREATE TYPE "PostStatus"`, `"PostType"`, `"PostCategory"`, `CREATE TABLE "Post"` + 2개 인덱스 + 2개 unique. **다른 테이블 변경(DROP/ALTER)이 섞여 있으면 중단**하고 원인 확인(메모리: docker 잔여 마이그레이션 흡수 주의).

- [ ] **Step 4: 로컬 DB에 적용 + 클라이언트 생성**

Run:
```bash
dotenv -e .env.test -- prisma migrate deploy
dotenv -e .env.test -- prisma generate
```
Expected: `Applying migration ..._add_post_model` / `Generated Prisma Client`.

- [ ] **Step 5: 타입체크로 클라이언트 반영 확인**

Run: `pnpm typecheck`
Expected: 에러 0 (또는 기존과 동일한 무관 에러만). `prisma.post` / `PostStatus` 등이 타입에 존재.

- [ ] **Step 6: 커밋**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(board): Post 모델 + 마이그레이션 추가"
```

---

### Task 3: 라벨·카테고리 헬퍼 (`lib/board/labels.ts`)

순수 함수만. enum → 한글 라벨 매핑과 카테고리 목록 제공.

**Files:**
- Create: `lib/board/labels.ts`
- Test: `tests/lib/board-labels.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/board-labels.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  categoryLabel,
  typeLabel,
  BOARD_CATEGORIES,
} from '@/lib/board/labels';

describe('categoryLabel', () => {
  it('카테고리를 한글 라벨로 변환한다', () => {
    expect(categoryLabel('FINANCE')).toBe('금융');
    expect(categoryLabel('LOAN')).toBe('대출');
    expect(categoryLabel('ECONOMY')).toBe('경제');
    expect(categoryLabel('SUBSCRIPTION')).toBe('청약');
    expect(categoryLabel('REALESTATE')).toBe('부동산');
  });
});

describe('typeLabel', () => {
  it('유형을 한글 라벨로 변환한다', () => {
    expect(typeLabel('PROGRAM')).toBe('제도·상품');
    expect(typeLabel('TREND')).toBe('이슈·동향');
  });
});

describe('BOARD_CATEGORIES', () => {
  it('5개 카테고리를 노출 순서대로 가진다', () => {
    expect(BOARD_CATEGORIES.map((c) => c.value)).toEqual([
      'FINANCE', 'LOAN', 'ECONOMY', 'SUBSCRIPTION', 'REALESTATE',
    ]);
    for (const c of BOARD_CATEGORIES) expect(c.label.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `dotenv -e .env.test -- vitest run tests/lib/board-labels.test.ts`
Expected: FAIL — `Cannot find module '@/lib/board/labels'`.

- [ ] **Step 3: 구현**

`lib/board/labels.ts`:
```ts
import type { PostCategory, PostType } from '@prisma/client';

const CATEGORY_LABEL: Record<PostCategory, string> = {
  FINANCE: '금융',
  LOAN: '대출',
  ECONOMY: '경제',
  SUBSCRIPTION: '청약',
  REALESTATE: '부동산',
};

const TYPE_LABEL: Record<PostType, string> = {
  PROGRAM: '제도·상품',
  TREND: '이슈·동향',
};

export function categoryLabel(category: PostCategory): string {
  return CATEGORY_LABEL[category];
}

export function typeLabel(type: PostType): string {
  return TYPE_LABEL[type];
}

/** 목록 필터 탭 노출 순서(고정). */
export const BOARD_CATEGORIES: { value: PostCategory; label: string }[] = (
  ['FINANCE', 'LOAN', 'ECONOMY', 'SUBSCRIPTION', 'REALESTATE'] as PostCategory[]
).map((value) => ({ value, label: CATEGORY_LABEL[value] }));
```

- [ ] **Step 4: 통과 확인**

Run: `dotenv -e .env.test -- vitest run tests/lib/board-labels.test.ts`
Expected: PASS (3 describe 통과).

- [ ] **Step 5: 커밋**

```bash
git add lib/board/labels.ts tests/lib/board-labels.test.ts
git commit -m "feat(board): 카테고리·유형 라벨 헬퍼"
```

---

### Task 4: 데이터 접근 모듈 (`lib/board/post.ts`)

공개 페이지가 쓰는 조회 함수. PUBLISHED만 노출, 카테고리 필터, 페이지네이션, slug 단건 조회.

**Files:**
- Create: `lib/board/post.ts`
- Test: `tests/lib/board-post.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/board-post.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { assertLocalDatabase } from '../_helpers/assert-local-db';
import { listPublishedPosts, getPublishedPostBySlug, PAGE_SIZE } from '@/lib/board/post';
import type { Prisma } from '@prisma/client';

assertLocalDatabase();

const MARK = 'test-board-';

function postData(over: Partial<Prisma.PostCreateInput>): Prisma.PostCreateInput {
  return {
    slug: `${MARK}${Math.random().toString(36).slice(2)}`,
    title: '테스트 글',
    summary: '요약',
    body: '# 본문\n\n내용',
    type: 'PROGRAM',
    category: 'LOAN',
    status: 'PUBLISHED',
    sourceName: '국토교통부',
    sourceUrl: 'https://www.molit.go.kr/x',
    sourceDate: new Date('2026-06-12'),
    sourceExcerpt: '원문 발췌',
    dedupeKey: `${MARK}${Math.random().toString(36).slice(2)}`,
    publishedAt: new Date(),
    ...over,
  };
}

beforeEach(async () => {
  await prisma.post.deleteMany({ where: { slug: { startsWith: MARK } } });
});
afterEach(async () => {
  await prisma.post.deleteMany({ where: { slug: { startsWith: MARK } } });
});

describe('listPublishedPosts', () => {
  it('PUBLISHED만 노출하고 DRAFT/REJECTED는 제외한다', async () => {
    await prisma.post.create({ data: postData({ slug: `${MARK}pub`, status: 'PUBLISHED' }) });
    await prisma.post.create({ data: postData({ slug: `${MARK}draft`, status: 'DRAFT' }) });
    const { rows, total } = await listPublishedPosts({ page: 1 });
    const slugs = rows.map((r) => r.slug);
    expect(slugs).toContain(`${MARK}pub`);
    expect(slugs).not.toContain(`${MARK}draft`);
    expect(total).toBeGreaterThanOrEqual(1);
  });

  it('카테고리로 필터한다', async () => {
    await prisma.post.create({ data: postData({ slug: `${MARK}loan`, category: 'LOAN' }) });
    await prisma.post.create({ data: postData({ slug: `${MARK}fin`, category: 'FINANCE' }) });
    const { rows } = await listPublishedPosts({ page: 1, category: 'FINANCE' });
    const mine = rows.filter((r) => r.slug.startsWith(MARK));
    expect(mine.every((r) => r.category === 'FINANCE')).toBe(true);
    expect(mine.some((r) => r.slug === `${MARK}fin`)).toBe(true);
  });

  it('publishedAt 내림차순으로 정렬한다', async () => {
    await prisma.post.create({ data: postData({ slug: `${MARK}old`, publishedAt: new Date('2026-01-01') }) });
    await prisma.post.create({ data: postData({ slug: `${MARK}new`, publishedAt: new Date('2026-06-01') }) });
    const { rows } = await listPublishedPosts({ page: 1 });
    const mine = rows.filter((r) => r.slug.startsWith(MARK));
    expect(mine[0].slug).toBe(`${MARK}new`);
  });
});

describe('getPublishedPostBySlug', () => {
  it('PUBLISHED 글을 slug로 가져온다', async () => {
    await prisma.post.create({ data: postData({ slug: `${MARK}one`, body: '# 제목\n표' }) });
    const post = await getPublishedPostBySlug(`${MARK}one`);
    expect(post).not.toBeNull();
    expect(post!.body).toContain('제목');
    expect(post!.sourceName).toBe('국토교통부');
  });

  it('DRAFT 글은 null을 반환한다', async () => {
    await prisma.post.create({ data: postData({ slug: `${MARK}hidden`, status: 'DRAFT' }) });
    expect(await getPublishedPostBySlug(`${MARK}hidden`)).toBeNull();
  });
});

describe('PAGE_SIZE', () => {
  it('양의 정수다', () => {
    expect(PAGE_SIZE).toBeGreaterThan(0);
  });
});
```

> 참고: `tests/_helpers/assert-local-db.ts`는 기존 파일(seed-e2e가 사용). 운영 DB면 throw하여 테스트를 막는다.

- [ ] **Step 2: 실패 확인**

Run: `dotenv -e .env.test -- vitest run tests/lib/board-post.test.ts`
Expected: FAIL — `Cannot find module '@/lib/board/post'`.

- [ ] **Step 3: 구현**

`lib/board/post.ts`:
```ts
import { prisma } from '@/lib/db';
import type { PostCategory } from '@prisma/client';

export const PAGE_SIZE = 12;

export interface PostListItem {
  slug: string;
  title: string;
  summary: string;
  category: PostCategory;
  sourceDate: Date;
  publishedAt: Date;
}

interface ListParams {
  page: number;
  category?: PostCategory;
}

export async function listPublishedPosts(
  params: ListParams,
): Promise<{ rows: PostListItem[]; total: number; totalPages: number }> {
  const page = Math.max(1, params.page);
  const where = {
    status: 'PUBLISHED' as const,
    ...(params.category ? { category: params.category } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      select: {
        slug: true,
        title: true,
        summary: true,
        category: true,
        sourceDate: true,
        publishedAt: true,
      },
      orderBy: { publishedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return {
    rows: rows.map((r) => ({ ...r, publishedAt: r.publishedAt! })),
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getPublishedPostBySlug(slug: string) {
  const post = await prisma.post.findFirst({
    where: { slug, status: 'PUBLISHED' },
    select: {
      slug: true,
      title: true,
      summary: true,
      body: true,
      type: true,
      category: true,
      sourceName: true,
      sourceUrl: true,
      sourceDate: true,
      publishedAt: true,
    },
  });
  if (!post || !post.publishedAt) return null;
  return { ...post, publishedAt: post.publishedAt };
}
```

> `getPublishedPostBySlug`는 반환 타입을 명시하지 않고 Prisma select 결과 타입을 그대로 추론시킨다. 상세 페이지(Task 8)에서 `post.body`/`post.sourceName` 등은 select에 포함돼 타입이 잡힌다. 별도 `PostDetail` 인터페이스는 만들지 않는다(불필요한 중복).

- [ ] **Step 4: 통과 확인**

Run: `dotenv -e .env.test -- vitest run tests/lib/board-post.test.ts`
Expected: PASS (전 describe 통과).

- [ ] **Step 5: 커밋**

```bash
git add lib/board/post.ts tests/lib/board-post.test.ts
git commit -m "feat(board): 게시글 조회 모듈(목록·slug 단건)"
```

---

### Task 5: Article JSON-LD 스키마 (`lib/seo/json-ld.tsx`)

**Files:**
- Modify: `lib/seo/json-ld.tsx` (export 추가)
- Test: `tests/lib/json-ld-article.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/json-ld-article.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { articleSchema } from '@/lib/seo/json-ld';

describe('articleSchema', () => {
  it('NewsArticle 스키마를 생성한다', () => {
    const s = articleSchema({
      headline: '디딤돌 대출 한도 상향',
      url: 'https://imjangon.co.kr/board/test',
      datePublished: '2026-06-12',
      description: '요약',
    });
    expect(s['@type']).toBe('NewsArticle');
    expect(s.headline).toBe('디딤돌 대출 한도 상향');
    expect(s.url).toBe('https://imjangon.co.kr/board/test');
    expect(s.datePublished).toBe('2026-06-12');
    expect((s.publisher as Record<string, unknown>)['@type']).toBe('Organization');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `dotenv -e .env.test -- vitest run tests/lib/json-ld-article.test.ts`
Expected: FAIL — `articleSchema is not a function` / not exported.

- [ ] **Step 3: 구현 — `lib/seo/json-ld.tsx`의 `JsonLd` 함수 정의 위(파일 내 export 함수 영역)에 추가**

```ts
export function articleSchema(input: {
  headline: string;
  url: string;
  datePublished: string; // YYYY-MM-DD
  description: string;
}): Json {
  return {
    ...ctx,
    '@type': 'NewsArticle',
    headline: input.headline,
    description: input.description,
    url: input.url,
    datePublished: input.datePublished,
    publisher: {
      '@type': 'Organization',
      name: '임장온',
      url: SITE_URL,
    },
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `dotenv -e .env.test -- vitest run tests/lib/json-ld-article.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add lib/seo/json-ld.tsx tests/lib/json-ld-article.test.ts
git commit -m "feat(board): NewsArticle JSON-LD 스키마"
```

---

### Task 6: 출처 표기 컴포넌트 (`components/ui/post-source.tsx`)

게시글의 출처는 글마다 동적(`sourceName`/`sourceUrl`/`sourceDate`)이라 기존 `SourceCaption`(고정 id 기반)과 다르다. 전용 컴포넌트를 만든다.

**Files:**
- Create: `components/ui/post-source.tsx`

- [ ] **Step 1: 구현 (순수 표현 컴포넌트, 테스트 생략 — 로직 없음)**

`components/ui/post-source.tsx`:
```tsx
import { externalHref } from '@/lib/external-href';

interface PostSourceProps {
  sourceName: string;
  sourceUrl: string;
  sourceDate: Date;
}

/** 게시글 하단 출처·기준일 블록. 모든 수치의 출처를 명시하는 프로젝트 원칙에 따른다. */
export function PostSource({ sourceName, sourceUrl, sourceDate }: PostSourceProps) {
  const dateStr = sourceDate.toISOString().slice(0, 10);
  return (
    <div className="mt-10 rounded-[18px] border border-[var(--color-line)] bg-[var(--color-soft)] px-5 py-4 text-sm text-[var(--color-muted)]">
      <p>
        출처:{' '}
        <a
          href={externalHref(sourceUrl)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[var(--color-text)] underline"
        >
          {sourceName}
        </a>
      </p>
      <p className="mt-1">기준일: {dateStr}</p>
    </div>
  );
}
```

> `externalHref`는 기존 `lib/external-href.ts`(메모리: 외부링크 정규화). 존재 확인: `import` 경로가 안 맞으면 `grep -r "export function externalHref" lib`로 실제 경로 확인 후 교정.

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 에러 0.

- [ ] **Step 3: 커밋**

```bash
git add components/ui/post-source.tsx
git commit -m "feat(board): 게시글 출처·기준일 컴포넌트"
```

---

### Task 7: 공개 목록 페이지 (`/board`)

**Files:**
- Create: `app/(public)/board/page.tsx`

- [ ] **Step 1: 구현 (medical/pharmacy 목록 패턴 + 카테고리 탭)**

`app/(public)/board/page.tsx`:
```tsx
import Link from 'next/link';
import { listPublishedPosts } from '@/lib/board/post';
import { BOARD_CATEGORIES, categoryLabel } from '@/lib/board/labels';
import type { PostCategory } from '@prisma/client';
import type { Metadata } from 'next';

export const revalidate = 3_600;

export const metadata: Metadata = {
  title: '소식 — 금융·부동산 이슈 해설',
  description: '금융·대출·경제·청약·부동산 분야의 공공자료 기반 이슈 해설을 매일 업데이트합니다.',
  alternates: { canonical: '/board' },
};

interface Props {
  searchParams: Promise<{ category?: string; page?: string }>;
}

function isCategory(v: string | undefined): v is PostCategory {
  return !!v && BOARD_CATEGORIES.some((c) => c.value === v);
}

function pageNums(current: number, total: number): number[] {
  const lo = Math.max(1, current - 2);
  const hi = Math.min(total, current + 2);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

export default async function BoardListPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const category = isCategory(sp.category) ? sp.category : undefined;

  const { rows, total, totalPages } = await listPublishedPosts({ page, category });

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] md:p-7">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">소식</p>
        <h1 className="text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">
          금융·부동산 이슈 해설
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          공공기관 자료에 근거한 사실 정보입니다. 전망·추천은 포함하지 않습니다.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/board"
          className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
            !category
              ? 'bg-[var(--color-blue)] text-white'
              : 'border border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-blue)]'
          }`}
        >
          전체
        </Link>
        {BOARD_CATEGORIES.map((c) => (
          <Link
            key={c.value}
            href={`/board?category=${c.value}`}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
              category === c.value
                ? 'bg-[var(--color-blue)] text-white'
                : 'border border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-blue)]'
            }`}
          >
            {c.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">
          아직 게시된 글이 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rows.map((p) => (
            <Link
              key={p.slug}
              href={`/board/${p.slug}`}
              className="block rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] transition hover:border-[var(--color-blue)]"
            >
              <span className="inline-block rounded-full bg-[var(--color-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue)]">
                {categoryLabel(p.category)}
              </span>
              <h2 className="mt-2 text-lg font-bold text-[var(--color-blue-dark)]">{p.title}</h2>
              <p className="mt-1.5 line-clamp-2 text-sm text-[var(--color-muted)]">{p.summary}</p>
              <p className="mt-3 text-xs text-[var(--color-muted)]">
                기준일 {p.sourceDate.toISOString().slice(0, 10)}
              </p>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {pageNums(page, totalPages).map((p) => {
            const params = new URLSearchParams();
            if (category) params.set('category', category);
            params.set('page', String(p));
            return (
              <Link
                key={p}
                href={`/board?${params.toString()}`}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
                  page === p
                    ? 'bg-[var(--color-blue)] text-white'
                    : 'border border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-blue)]'
                }`}
              >
                {p}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 에러 0.

- [ ] **Step 3: 커밋**

```bash
git add "app/(public)/board/page.tsx"
git commit -m "feat(board): 공개 목록 페이지 /board"
```

---

### Task 8: 공개 상세 페이지 (`/board/[slug]`)

**Files:**
- Create: `app/(public)/board/[slug]/page.tsx`

- [ ] **Step 1: 구현 (subscription 상세 패턴 + 마크다운 렌더 + Article 스키마)**

`app/(public)/board/[slug]/page.tsx`:
```tsx
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getPublishedPostBySlug } from '@/lib/board/post';
import { categoryLabel } from '@/lib/board/labels';
import { PostSource } from '@/components/ui/post-source';
import { JsonLd, articleSchema, breadcrumbSchema } from '@/lib/seo/json-ld';
import { SITE_URL } from '@/lib/site';
import type { Metadata } from 'next';

export const revalidate = 3_600;

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug).catch(() => null);
  if (!post) return {};
  return {
    title: post.title,
    description: post.summary,
    alternates: { canonical: `/board/${post.slug}` },
  };
}

export default async function BoardDetailPage({ params }: Params) {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  if (!post) notFound();

  return (
    <article className="mx-auto max-w-[760px] px-6 py-12">
      <JsonLd
        data={[
          articleSchema({
            headline: post.title,
            url: `${SITE_URL}/board/${post.slug}`,
            datePublished: post.publishedAt.toISOString().slice(0, 10),
            description: post.summary,
          }),
          breadcrumbSchema([
            { name: '홈', url: `${SITE_URL}/` },
            { name: '소식', url: `${SITE_URL}/board` },
            { name: post.title, url: `${SITE_URL}/board/${post.slug}` },
          ]),
        ]}
      />
      <span className="inline-block rounded-full bg-[var(--color-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue)]">
        {categoryLabel(post.category)}
      </span>
      <h1 className="mt-3 text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">
        {post.title}
      </h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        기준일 {post.sourceDate.toISOString().slice(0, 10)}
      </p>

      <div className="board-prose mt-8 text-[15px] leading-relaxed text-[var(--color-text)]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.body}</ReactMarkdown>
      </div>

      <PostSource
        sourceName={post.sourceName}
        sourceUrl={post.sourceUrl}
        sourceDate={post.sourceDate}
      />
    </article>
  );
}
```

- [ ] **Step 2: 마크다운 본문 스타일 추가 — `app/globals.css` 끝에 추가**

먼저 globals 위치 확인: `ls app/globals.css`. 없으면 `find app -name 'globals.css'`로 확인. 해당 파일 끝에 추가:
```css
/* 게시글 마크다운 본문 — 표·목록 가독성(브랜드 톤) */
.board-prose h2 { font-size: 1.125rem; font-weight: 700; color: var(--color-blue-dark); margin: 2rem 0 0.75rem; }
.board-prose h3 { font-size: 1rem; font-weight: 700; color: var(--color-blue-dark); margin: 1.5rem 0 0.5rem; }
.board-prose p { margin: 0.75rem 0; }
.board-prose ul, .board-prose ol { margin: 0.75rem 0; padding-left: 1.25rem; list-style: revert; }
.board-prose li { margin: 0.25rem 0; }
.board-prose table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 14px; }
.board-prose th, .board-prose td { border: 1px solid var(--color-line); padding: 0.5rem 0.75rem; text-align: left; }
.board-prose th { background: var(--color-soft); font-weight: 700; }
.board-prose a { color: var(--color-blue); text-decoration: underline; }
.board-prose strong { font-weight: 700; }
```

- [ ] **Step 3: 타입체크**

Run: `pnpm typecheck`
Expected: 에러 0.

- [ ] **Step 4: 커밋**

```bash
git add "app/(public)/board/[slug]/page.tsx" app/globals.css
git commit -m "feat(board): 공개 상세 페이지 + 마크다운 렌더"
```

---

### Task 9: OG 썸네일 라우트 (`/board/[slug]/opengraph-image`)

**Files:**
- Create: `app/(public)/board/[slug]/opengraph-image.tsx`

- [ ] **Step 1: 구현 (subscription opengraph-image 패턴)**

`app/(public)/board/[slug]/opengraph-image.tsx`:
```tsx
import { ImageResponse } from 'next/og';
import { OG_SIZE, OG_CONTENT_TYPE, loadOgFonts, OgFrame } from '@/lib/seo/og';
import { getPublishedPostBySlug } from '@/lib/board/post';
import { categoryLabel } from '@/lib/board/labels';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = '임장온 소식';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug).catch(() => null);
  const title = post?.title ?? '임장온 소식';
  const subtitle = post ? categoryLabel(post.category) : '공공데이터 부동산';
  return new ImageResponse(<OgFrame title={title} subtitle={subtitle} />, {
    ...OG_SIZE,
    fonts: await loadOgFonts(),
  });
}
```

> OG 폰트는 이미 `next.config.mjs`의 `outputFileTracingIncludes`('**/opengraph-image')로 번들에 포함된다(기존 수정). 새 라우트도 자동 적용됨.

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 에러 0.

- [ ] **Step 3: 커밋**

```bash
git add "app/(public)/board/[slug]/opengraph-image.tsx"
git commit -m "feat(board): 게시글 OG 템플릿 썸네일"
```

---

### Task 10: 사이트맵에 게시글 소스 추가

**Files:**
- Modify: `lib/sitemap/sources.ts` (`post` 소스 추가 + `SOURCE_ORDER` 끝에 append)
- Test: `tests/lib/sitemap-post-source.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/sitemap-post-source.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { assertLocalDatabase } from '../_helpers/assert-local-db';
import { SOURCE_MAP } from '@/lib/sitemap/sources';

assertLocalDatabase();
const MARK = 'test-sitemap-';

afterEach(async () => {
  await prisma.post.deleteMany({ where: { slug: { startsWith: MARK } } });
});
beforeEach(async () => {
  await prisma.post.deleteMany({ where: { slug: { startsWith: MARK } } });
});

describe('sitemap post 소스', () => {
  it('SOURCE_MAP에 post 소스가 있다', () => {
    expect(SOURCE_MAP.post).toBeDefined();
  });

  it('PUBLISHED 글의 URL 엔트리를 만든다', async () => {
    await prisma.post.create({
      data: {
        slug: `${MARK}a`, title: 't', summary: 's', body: 'b',
        type: 'PROGRAM', category: 'LOAN', status: 'PUBLISHED',
        sourceName: 'x', sourceUrl: 'https://x.kr', sourceDate: new Date('2026-06-12'),
        sourceExcerpt: 'e', dedupeKey: `${MARK}a`, publishedAt: new Date(),
      },
    });
    const entries = await SOURCE_MAP.post.page(0, 100);
    const urls = entries.map((e) => String(e.url));
    expect(urls.some((u) => u.endsWith(`/board/${MARK}a`))).toBe(true);
  });

  it('DRAFT 글은 사이트맵에서 제외한다', async () => {
    await prisma.post.create({
      data: {
        slug: `${MARK}d`, title: 't', summary: 's', body: 'b',
        type: 'PROGRAM', category: 'LOAN', status: 'DRAFT',
        sourceName: 'x', sourceUrl: 'https://x.kr', sourceDate: new Date('2026-06-12'),
        sourceExcerpt: 'e', dedupeKey: `${MARK}d`,
      },
    });
    const entries = await SOURCE_MAP.post.page(0, 100);
    expect(entries.map((e) => String(e.url)).some((u) => u.endsWith(`/board/${MARK}d`))).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `dotenv -e .env.test -- vitest run tests/lib/sitemap-post-source.test.ts`
Expected: FAIL — `SOURCE_MAP.post` undefined.

- [ ] **Step 3: 구현 — `lib/sitemap/sources.ts`에 `loan` 소스 정의 다음에 `post` 추가**

`loan` 상수 정의(233행 부근) 바로 아래에 추가:
```ts
const post = dbSource({
  key: 'post',
  count: () => prisma.post.count({ where: { status: 'PUBLISHED' } }),
  findMany: (skip, take) =>
    prisma.post.findMany({
      where: { status: 'PUBLISHED' },
      select: { slug: true, updatedAt: true },
      orderBy: { id: 'asc' },
      skip,
      take,
    }),
  toEntry: (p) => ({
    url: `${SITE_URL}/board/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.6,
  }),
});
```

그리고 `SOURCE_ORDER` 배열 **맨 끝**에 `post`를 추가(주석대로 끝에만 추가 — 기존 샤드 인덱스 보존):
```ts
export const SOURCE_ORDER: SitemapSource[] = [
  core,
  property,
  subscription,
  school,
  childcare,
  pharmacy,
  hospital,
  loan,
  post,
];
```

- [ ] **Step 4: 통과 확인**

Run: `dotenv -e .env.test -- vitest run tests/lib/sitemap-post-source.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add lib/sitemap/sources.ts tests/lib/sitemap-post-source.test.ts
git commit -m "feat(board): 사이트맵에 게시글 소스 추가"
```

---

### Task 11: robots 허용 + 헤더 내비 링크

**Files:**
- Modify: `app/robots.ts` (allow에 `/board/` 추가 — 두 userAgent 블록 모두)
- Modify: `app/(public)/_components/nav.tsx` (데스크톱 메뉴에 "소식" 링크 추가)

- [ ] **Step 1: robots.ts 수정 — 두 `allow` 배열에 `/board/` 추가**

`app/robots.ts`의 `allow: ['/', '/apt/', '/officetel/', '/villa/', '/region/']` 2곳을 각각:
```ts
allow: ['/', '/apt/', '/officetel/', '/villa/', '/region/', '/board/'],
```

- [ ] **Step 2: nav.tsx에 링크 추가 — `<Link href="/finance">금융정보</Link>` 다음 줄에 추가**

```tsx
            <Link href="/finance">금융정보</Link>
            <Link href="/board">소식</Link>
```

> 모바일 드로어(`MobileDrawer`)에도 동일 항목을 추가해야 한다. `app/(public)/_components/mobile-drawer.tsx`를 열어 기존 메뉴 링크 목록(실거래가/청약/금융정보 등)에 `<Link href="/board">소식</Link>`를 같은 패턴으로 추가.

- [ ] **Step 3: 타입체크 + 린트**

Run: `pnpm typecheck && pnpm lint`
Expected: 에러 0.

- [ ] **Step 4: 커밋**

```bash
git add app/robots.ts "app/(public)/_components/nav.tsx" "app/(public)/_components/mobile-drawer.tsx"
git commit -m "feat(board): robots 허용 + 내비 '소식' 링크"
```

---

### Task 12: 전체 검증 (수동 + 자동)

**Files:** (없음 — 검증만)

- [ ] **Step 1: 전체 단위 테스트**

Run: `pnpm test:unit`
Expected: 신규 4개 테스트 파일 포함 전부 PASS. (기존 DB 집계 테스트가 병렬 flake로 간헐 실패하면 메모리대로 단독 재실행으로 확인.)

- [ ] **Step 2: 타입체크 + 빌드**

Run: `pnpm typecheck && pnpm build`
Expected: 빌드 성공(exit 0). `/board` (ƒ Dynamic 또는 ○) + `/board/[slug]` + `/board/[slug]/opengraph-image` 라우트가 빌드 출력에 보임.

- [ ] **Step 3: 로컬 시드 + 육안 확인**

로컬 docker DB에 임시 글 1건을 넣고 dev로 확인:
```bash
dotenv -e .env.test -- tsx -e "
import { prisma } from './lib/db';
await prisma.post.upsert({
  where: { slug: 'demo-didimdol' },
  update: {},
  create: {
    slug: 'demo-didimdol', title: '디딤돌 대출 한도 상향 안내',
    summary: '국토교통부가 디딤돌 대출 한도 조정을 발표했습니다.',
    body: '## 제도 한눈에 보기\n\n| 항목 | 내용 |\n|---|---|\n| 대상 | 무주택 세대 |\n\n## 유의사항\n\n- 신청 전 자격을 확인하세요.',
    type: 'PROGRAM', category: 'LOAN', status: 'PUBLISHED',
    sourceName: '국토교통부', sourceUrl: 'https://www.molit.go.kr', sourceDate: new Date('2026-06-12'),
    sourceExcerpt: '원문 발췌', dedupeKey: 'demo-didimdol', publishedAt: new Date(),
  },
});
console.log('seeded'); await prisma.\$disconnect();
"
DATABASE_URL=$(grep '^DATABASE_URL' .env.test | cut -d= -f2-) pnpm dev
```
브라우저에서 확인:
- `http://localhost:3000/board` → 카드에 글 노출, 카테고리 탭 동작
- `http://localhost:3000/board/demo-didimdol` → 제목·카테고리·기준일, 마크다운 표 렌더, 하단 출처 블록
- `http://localhost:3000/board/demo-didimdol/opengraph-image` → 200 PNG, 제목/카테고리 카드

확인 후 데모 글 삭제:
```bash
dotenv -e .env.test -- tsx -e "import {prisma} from './lib/db'; await prisma.post.deleteMany({where:{slug:'demo-didimdol'}}); await prisma.\$disconnect();"
```

- [ ] **Step 4: 플랜 1 완료 커밋(있으면) + 상태 확인**

Run: `git status && git log --oneline -12`
Expected: 작업 트리 clean, Task 1~11 커밋들이 보임.

---

## 플랜 1 자기 검토 (작성자 체크리스트)

- **스펙 커버리지:** 데이터 모델(§4) → Task 2 ✅ / 공개 목록·상세·OG(§7) → Task 7·8·9 ✅ / SEO 사이트맵·robots·내비(§7) → Task 10·11 ✅ / 마크다운 단일 본문 → Task 1·8 ✅ / 출처·기준일 표기(원칙 9) → Task 6·8 ✅. (어드민·생성 파이프라인은 플랜 2·3 범위.)
- **플레이스홀더:** 없음(모든 스텝에 실제 코드/명령/기대출력). Task 6의 `externalHref` 경로, Task 8의 globals.css 위치는 "확인 후 교정" 단서 포함.
- **타입 일관성:** `listPublishedPosts`/`getPublishedPostBySlug`/`PAGE_SIZE`/`articleSchema`/`categoryLabel`/`BOARD_CATEGORIES`/`PostSource` 시그니처가 정의 Task와 사용 Task에서 일치.

---

## 다음 플랜 (로드맵)

- **플랜 2 — 어드민 컨펌 UI:** `/admin/posts` 목록(대기/게시됨/반려 탭) + `/admin/posts/[id]` 인라인 수정 화면(근거 패널 병치) + Server Actions(`publishPost`/`rejectPost`/`updatePost`/`deletePost`, 게시 시 `/board`·`/board/[slug]` revalidate). 기존 Basic Auth(`middleware.ts`) 그대로 적용.
- **플랜 3 — 생성 파이프라인:** `lib/board/feed-registry.ts`(공식 피드 SSOT) + `lib/board/guardrails.ts`(금지표현·분량·출처 검사, TDD) + `scripts/ingest/posts/{detect-issues,match-source,generate}.ts`(뉴스 탐지 → 보도자료 매칭 → OpenAI structured output → DRAFT insert) + `IngestionRun` 기록 + `notify.ts` 알림 + `.github/workflows/generate-board-posts.yml` 크론. `OPENAI_API_KEY`는 Actions Secret. 운영 DB 마이그레이션 배포도 이 시점에 status 확인 후 진행.

각 플랜은 별도 문서로 작성하며, 플랜 1 실행·검증 완료 후 플랜 2를 작성한다.
