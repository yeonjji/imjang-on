# 자동 게시판 — 플랜 2: 어드민 컨펌 UI 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/posts`에서 DRAFT 글을 검토·인라인 수정한 뒤 [게시]/[반려]/[삭제]할 수 있는 어드민을 구현한다. 게시 시 공개 `/board` 경로를 ISR revalidate 한다.

**Architecture:** 기존 Basic Auth(`middleware.ts`, `/admin/*`) 뒤에 페이지를 둔다. 변이는 전부 `app/admin/posts/actions.ts`의 Server Action으로 처리해 같은 인증 경계 안에 둔다. DB 로직은 `lib/board/admin.ts`로 격리(TDD), 액션은 그 위에 revalidate/redirect만 얹는 얇은 래퍼. 편집 화면은 client 컴포넌트 `PostEditor`가 폼 상태 + 마크다운 실시간 미리보기를 담당한다.

**Tech Stack:** Next.js 15 App Router (Server Actions, React 19), Prisma 5, react-markdown(이미 설치), vitest.

> 전체 3-플랜 중 **2번**. (플랜 1: 모델+공개페이지 ✅ 완료 / 플랜 3: 생성 파이프라인). 브랜치 `feat/auto-board` 계속 사용. 설계 원본: `docs/superpowers/specs/2026-06-15-auto-board-content-pipeline-design.md` §6.

## 전제 / 패턴

- 기존 어드민 페이지는 server component + `export const dynamic = 'force-dynamic'` + 직접 `prisma` 조회 (`app/admin/ingestion/page.tsx` 참고).
- Server Action 패턴: 파일 최상단 `'use server';`, async 함수 (`app/(public)/apt/[id]/actions.ts` 참고). `revalidatePath`는 `next/cache`에서 import.
- `/admin/posts` 및 그 하위 액션은 middleware matcher `/admin/:path*`에 자동 포함 → 별도 인증 코드 불필요.
- `Post` 모델·enum(PostStatus DRAFT/PUBLISHED/REJECTED, PostType PROGRAM/TREND, PostCategory)·`lib/board/labels.ts`(`categoryLabel`,`typeLabel`,`BOARD_CATEGORIES`)는 플랜 1에서 구현됨.
- 테스트: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/<file>.test.ts`, DB는 로컬 docker. `assertLocalDatabase()` 사용.
- 라우트 파라미터 `id`는 문자열 → `BigInt(id)`로 변환.

---

### Task 1: 어드민 데이터/변이 모듈 (`lib/board/admin.ts`)

조회 + 행 단위 변이 함수. revalidate/redirect는 포함하지 않는다(액션 책임). TDD.

**Files:**
- Create: `lib/board/admin.ts`
- Test: `tests/lib/board-admin.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`tests/lib/board-admin.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { assertLocalDatabase } from '../_helpers/assert-local-db';
import {
  listPostsByStatus, getPostForAdmin, publishPostRow, rejectPostRow, updatePostRow, deletePostRow,
} from '@/lib/board/admin';
import type { Prisma } from '@prisma/client';

assertLocalDatabase();
const MARK = 'test-admin-';

function data(over: Partial<Prisma.PostCreateInput> = {}): Prisma.PostCreateInput {
  const r = Math.random().toString(36).slice(2);
  return {
    slug: `${MARK}${r}`, title: '초안 글', summary: '요약', body: '# 본문',
    type: 'PROGRAM', category: 'LOAN', status: 'DRAFT',
    sourceName: '국토교통부', sourceUrl: 'https://www.molit.go.kr/x',
    sourceDate: new Date('2026-06-12'), sourceExcerpt: '원문 발췌 전문',
    dedupeKey: `${MARK}${r}`, ...over,
  };
}
beforeEach(async () => { await prisma.post.deleteMany({ where: { slug: { startsWith: MARK } } }); });
afterEach(async () => { await prisma.post.deleteMany({ where: { slug: { startsWith: MARK } } }); });

describe('listPostsByStatus', () => {
  it('해당 상태의 글만 최신순으로 반환한다', async () => {
    await prisma.post.create({ data: data({ slug: `${MARK}d1`, status: 'DRAFT' }) });
    await prisma.post.create({ data: data({ slug: `${MARK}p1`, status: 'PUBLISHED', publishedAt: new Date() }) });
    const drafts = await listPostsByStatus('DRAFT');
    const slugs = drafts.map((r) => r.slug);
    expect(slugs).toContain(`${MARK}d1`);
    expect(slugs).not.toContain(`${MARK}p1`);
  });
});

describe('getPostForAdmin', () => {
  it('sourceExcerpt 포함 전체 필드를 반환한다', async () => {
    const c = await prisma.post.create({ data: data({ slug: `${MARK}g1` }) });
    const post = await getPostForAdmin(c.id);
    expect(post).not.toBeNull();
    expect(post!.sourceExcerpt).toBe('원문 발췌 전문');
    expect(post!.body).toBe('# 본문');
  });
  it('없는 id면 null', async () => {
    expect(await getPostForAdmin(BigInt(-1))).toBeNull();
  });
});

describe('publishPostRow', () => {
  it('PUBLISHED로 바꾸고 publishedAt·reviewedAt을 채우며 slug를 돌려준다', async () => {
    const c = await prisma.post.create({ data: data({ slug: `${MARK}pub`, status: 'DRAFT' }) });
    const res = await publishPostRow(c.id);
    expect(res.slug).toBe(`${MARK}pub`);
    const after = await prisma.post.findUnique({ where: { id: c.id } });
    expect(after!.status).toBe('PUBLISHED');
    expect(after!.publishedAt).not.toBeNull();
    expect(after!.reviewedAt).not.toBeNull();
  });
});

describe('rejectPostRow', () => {
  it('REJECTED로 바꾸고 reviewedAt을 채운다', async () => {
    const c = await prisma.post.create({ data: data({ slug: `${MARK}rej` }) });
    await rejectPostRow(c.id);
    const after = await prisma.post.findUnique({ where: { id: c.id } });
    expect(after!.status).toBe('REJECTED');
    expect(after!.reviewedAt).not.toBeNull();
  });
});

describe('updatePostRow', () => {
  it('수정 가능한 필드만 갱신한다', async () => {
    const c = await prisma.post.create({ data: data({ slug: `${MARK}upd` }) });
    await updatePostRow(c.id, { title: '수정된 제목', summary: '새 요약', body: '## 새 본문', type: 'TREND', category: 'FINANCE' });
    const after = await prisma.post.findUnique({ where: { id: c.id } });
    expect(after!.title).toBe('수정된 제목');
    expect(after!.type).toBe('TREND');
    expect(after!.category).toBe('FINANCE');
    expect(after!.body).toBe('## 새 본문');
  });
});

describe('deletePostRow', () => {
  it('행을 삭제한다', async () => {
    const c = await prisma.post.create({ data: data({ slug: `${MARK}del` }) });
    await deletePostRow(c.id);
    expect(await prisma.post.findUnique({ where: { id: c.id } })).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/board-admin.test.ts`
Expected: FAIL — `Cannot find module '@/lib/board/admin'`.

- [ ] **Step 3: 구현**

`lib/board/admin.ts`:
```ts
import { prisma } from '@/lib/db';
import type { PostStatus, PostType, PostCategory } from '@prisma/client';

export interface AdminPostRow {
  id: bigint;
  slug: string;
  title: string;
  type: PostType;
  category: PostCategory;
  status: PostStatus;
  sourceName: string;
  sourceDate: Date;
  generatedAt: Date;
}

export async function listPostsByStatus(status: PostStatus): Promise<AdminPostRow[]> {
  return prisma.post.findMany({
    where: { status },
    select: {
      id: true, slug: true, title: true, type: true, category: true,
      status: true, sourceName: true, sourceDate: true, generatedAt: true,
    },
    orderBy: { generatedAt: 'desc' },
    take: 200,
  });
}

export async function getPostForAdmin(id: bigint) {
  return prisma.post.findUnique({ where: { id } });
}

export async function publishPostRow(id: bigint): Promise<{ slug: string }> {
  const now = new Date();
  const row = await prisma.post.update({
    where: { id },
    data: { status: 'PUBLISHED', publishedAt: now, reviewedAt: now },
    select: { slug: true },
  });
  return row;
}

export async function rejectPostRow(id: bigint): Promise<void> {
  await prisma.post.update({
    where: { id },
    data: { status: 'REJECTED', reviewedAt: new Date() },
  });
}

export interface PostEditableFields {
  title: string;
  summary: string;
  body: string;
  type: PostType;
  category: PostCategory;
}

export async function updatePostRow(id: bigint, data: PostEditableFields): Promise<void> {
  await prisma.post.update({ where: { id }, data });
}

export async function deletePostRow(id: bigint): Promise<void> {
  await prisma.post.delete({ where: { id } });
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/board-admin.test.ts`
Expected: PASS (전 describe 통과).

- [ ] **Step 5: 커밋**

```bash
git add lib/board/admin.ts tests/lib/board-admin.test.ts
git commit -m "feat(board): 어드민 조회·변이 모듈"
```

---

### Task 2: Server Actions (`app/admin/posts/actions.ts`)

DB 변이 위에 입력 파싱 + revalidate + redirect만 얹는 얇은 래퍼.

**Files:**
- Create: `app/admin/posts/actions.ts`

- [ ] **Step 1: 구현**

`app/admin/posts/actions.ts`:
```ts
'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { PostType, PostCategory } from '@prisma/client';
import {
  publishPostRow, rejectPostRow, updatePostRow, deletePostRow,
} from '@/lib/board/admin';

function readFields(fd: FormData) {
  return {
    title: String(fd.get('title') ?? '').trim(),
    summary: String(fd.get('summary') ?? '').trim(),
    body: String(fd.get('body') ?? ''),
    type: String(fd.get('type') ?? 'PROGRAM') as PostType,
    category: String(fd.get('category') ?? 'FINANCE') as PostCategory,
  };
}

/** 수정 내용만 저장하고 편집 화면에 머문다. */
export async function savePostAction(fd: FormData) {
  const id = BigInt(String(fd.get('id')));
  await updatePostRow(id, readFields(fd));
  revalidatePath(`/admin/posts/${id}`);
  revalidatePath('/admin/posts');
}

/** 수정 내용 저장 후 게시 → 공개 경로 revalidate → 목록으로. */
export async function publishPostAction(fd: FormData) {
  const id = BigInt(String(fd.get('id')));
  await updatePostRow(id, readFields(fd));
  const { slug } = await publishPostRow(id);
  revalidatePath('/board');
  revalidatePath(`/board/${slug}`);
  revalidatePath('/admin/posts');
  redirect('/admin/posts');
}

export async function rejectPostAction(fd: FormData) {
  const id = BigInt(String(fd.get('id')));
  await rejectPostRow(id);
  revalidatePath('/admin/posts');
  redirect('/admin/posts');
}

export async function deletePostAction(fd: FormData) {
  const id = BigInt(String(fd.get('id')));
  await deletePostRow(id);
  revalidatePath('/admin/posts');
  revalidatePath('/board');
  redirect('/admin/posts');
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 3: 커밋**

```bash
git add app/admin/posts/actions.ts
git commit -m "feat(board): 어드민 게시/반려/수정/삭제 Server Action"
```

---

### Task 3: 목록 페이지 (`/admin/posts`)

**Files:**
- Create: `app/admin/posts/page.tsx`

- [ ] **Step 1: 구현**

`app/admin/posts/page.tsx`:
```tsx
import Link from 'next/link';
import { listPostsByStatus } from '@/lib/board/admin';
import { categoryLabel, typeLabel } from '@/lib/board/labels';
import type { PostStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

const TABS: { value: PostStatus; label: string }[] = [
  { value: 'DRAFT', label: '대기' },
  { value: 'PUBLISHED', label: '게시됨' },
  { value: 'REJECTED', label: '반려' },
];

interface Props { searchParams: Promise<{ status?: string }>; }

function isStatus(v: string | undefined): v is PostStatus {
  return v === 'DRAFT' || v === 'PUBLISHED' || v === 'REJECTED';
}

export default async function AdminPostsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const status: PostStatus = isStatus(sp.status) ? sp.status : 'DRAFT';
  const rows = await listPostsByStatus(status);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-12">
      <h1 className="text-2xl font-bold text-[var(--color-blue-dark)]">게시글 관리</h1>

      <div className="mt-5 flex gap-2">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/admin/posts?status=${t.value}`}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${
              status === t.value ? 'bg-[var(--color-blue)] text-white' : 'border border-[var(--color-line)] text-[var(--color-muted)]'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 text-[var(--color-muted)]">해당 상태의 글이 없습니다.</p>
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-[var(--color-muted)]">
              <th className="py-2">제목</th><th>유형</th><th>카테고리</th><th>출처</th><th>기준일</th><th>생성</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)} className="border-t border-[var(--color-line)]">
                <td className="py-2">
                  <Link href={`/admin/posts/${r.id}`} className="font-semibold text-[var(--color-blue)] underline">
                    {r.title}
                  </Link>
                </td>
                <td>{typeLabel(r.type)}</td>
                <td>{categoryLabel(r.category)}</td>
                <td>{r.sourceName}</td>
                <td>{r.sourceDate.toISOString().slice(0, 10)}</td>
                <td>{r.generatedAt.toISOString().slice(0, 16).replace('T', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 3: 커밋**

```bash
git add app/admin/posts/page.tsx
git commit -m "feat(board): 어드민 게시글 목록(상태 탭)"
```

---

### Task 4: 편집 client 컴포넌트 (`PostEditor`)

폼 + 마크다운 실시간 미리보기. body는 controlled(미리보기 반영), 나머지는 defaultValue.

**Files:**
- Create: `app/admin/posts/[id]/post-editor.tsx`

- [ ] **Step 1: 구현**

`app/admin/posts/[id]/post-editor.tsx`:
```tsx
'use client';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { PostType, PostCategory } from '@prisma/client';
import { BOARD_CATEGORIES } from '@/lib/board/labels';
import { savePostAction, publishPostAction, rejectPostAction, deletePostAction } from '../actions';

const TYPES: { value: PostType; label: string }[] = [
  { value: 'PROGRAM', label: '제도·상품' },
  { value: 'TREND', label: '이슈·동향' },
];

interface Props {
  id: string;
  title: string;
  summary: string;
  body: string;
  type: PostType;
  category: PostCategory;
}

export function PostEditor({ id, title, summary, body: initialBody, type, category }: Props) {
  const [body, setBody] = useState(initialBody);

  return (
    <form className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />

      <label className="text-sm font-semibold text-[var(--color-muted)]">
        제목
        <input name="title" defaultValue={title} className="mt-1 w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-base text-[var(--color-text)]" />
      </label>

      <label className="text-sm font-semibold text-[var(--color-muted)]">
        요약
        <input name="summary" defaultValue={summary} className="mt-1 w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-base text-[var(--color-text)]" />
      </label>

      <div className="flex gap-4">
        <label className="text-sm font-semibold text-[var(--color-muted)]">
          유형
          <select name="type" defaultValue={type} className="mt-1 block rounded-lg border border-[var(--color-line)] px-3 py-2 text-base">
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-[var(--color-muted)]">
          카테고리
          <select name="category" defaultValue={category} className="mt-1 block rounded-lg border border-[var(--color-line)] px-3 py-2 text-base">
            {BOARD_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <label className="text-sm font-semibold text-[var(--color-muted)]">
          본문 (마크다운)
          <textarea
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={24}
            className="mt-1 w-full rounded-lg border border-[var(--color-line)] px-3 py-2 font-mono text-sm text-[var(--color-text)]"
          />
        </label>
        <div className="text-sm font-semibold text-[var(--color-muted)]">
          미리보기
          <div className="board-prose mt-1 rounded-lg border border-[var(--color-line)] bg-white px-4 py-3 text-[15px] leading-relaxed text-[var(--color-text)]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button formAction={savePostAction} className="rounded-lg border border-[var(--color-line)] px-4 py-2 font-semibold text-[var(--color-text)]">저장</button>
        <button formAction={publishPostAction} className="rounded-lg bg-[var(--color-blue)] px-4 py-2 font-semibold text-white">게시</button>
        <button formAction={rejectPostAction} className="rounded-lg border border-[var(--color-line)] px-4 py-2 font-semibold text-[var(--color-muted)]">반려</button>
        <button formAction={deletePostAction} className="rounded-lg border border-red-300 px-4 py-2 font-semibold text-red-600">삭제</button>
      </div>
    </form>
  );
}
```
> 미리보기는 공개 상세와 동일한 `react-markdown + remarkGfm + .board-prose` 조합 → WYSIWYG 일치. `.board-prose`는 플랜 1에서 `globals.css`에 정의됨.

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 3: 커밋**

```bash
git add "app/admin/posts/[id]/post-editor.tsx"
git commit -m "feat(board): 어드민 편집 컴포넌트(마크다운 미리보기)"
```

---

### Task 5: 편집 페이지 (`/admin/posts/[id]`)

**Files:**
- Create: `app/admin/posts/[id]/page.tsx`

- [ ] **Step 1: 구현**

`app/admin/posts/[id]/page.tsx`:
```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPostForAdmin } from '@/lib/board/admin';
import { PostEditor } from './post-editor';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ id: string }>; }

export default async function AdminPostEditPage({ params }: Params) {
  const { id } = await params;
  let postId: bigint;
  try {
    postId = BigInt(id);
  } catch {
    notFound();
  }
  const post = await getPostForAdmin(postId);
  if (!post) notFound();

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-12">
      <Link href="/admin/posts" className="text-sm text-[var(--color-muted)] underline">← 목록</Link>
      <div className="mt-3 flex items-center gap-2">
        <h1 className="text-xl font-bold text-[var(--color-blue-dark)]">초안 검토</h1>
        <span className="rounded-full bg-[var(--color-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue)]">{post.status}</span>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <PostEditor
          id={String(post.id)}
          title={post.title}
          summary={post.summary}
          body={post.body}
          type={post.type}
          category={post.category}
        />
        <aside className="rounded-[18px] border border-[var(--color-line)] bg-[var(--color-soft)] p-5 text-sm">
          <p className="font-bold text-[var(--color-blue-dark)]">근거 자료</p>
          <p className="mt-2 text-[var(--color-muted)]">출처: {post.sourceName}</p>
          <p className="mt-1 text-[var(--color-muted)]">기준일: {post.sourceDate.toISOString().slice(0, 10)}</p>
          <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-[var(--color-blue)] underline">{post.sourceUrl}</a>
          <p className="mt-4 font-bold text-[var(--color-blue-dark)]">원문 발췌</p>
          <p className="mt-2 whitespace-pre-wrap text-[var(--color-text)]">{post.sourceExcerpt}</p>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입체크 + 린트**

Run: `pnpm typecheck && pnpm lint`
Expected: 0 errors.

- [ ] **Step 3: 커밋**

```bash
git add "app/admin/posts/[id]/page.tsx"
git commit -m "feat(board): 어드민 편집 페이지(근거 패널 병치)"
```

---

### Task 6: 전체 검증 (자동 + 수동)

**Files:** (없음 — 검증만)

- [ ] **Step 1: 단위 테스트 + 빌드**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/board-admin.test.ts && pnpm typecheck && pnpm lint && pnpm build`
Expected: 테스트 PASS, typecheck/lint 0, 빌드 exit 0. 빌드 라우트 목록에 `/admin/posts`, `/admin/posts/[id]` 표시.

- [ ] **Step 2: 수동 컨펌 플로우 (로컬, Basic Auth)**

로컬 docker DB에 DRAFT 1건을 시드:
```bash
cat > scripts/_tmp-seed-draft.ts <<'TS'
import { prisma } from '@/lib/db';
async function main() {
  await prisma.post.upsert({
    where: { slug: 'tmp-admin-draft' },
    update: { status: 'DRAFT' },
    create: {
      slug: 'tmp-admin-draft', title: '검토용 초안', summary: '요약',
      body: '## 한눈에 보기\n\n| 항목 | 내용 |\n|---|---|\n| 대상 | 무주택 |',
      type: 'PROGRAM', category: 'LOAN', status: 'DRAFT',
      sourceName: '국토교통부', sourceUrl: 'https://www.molit.go.kr', sourceDate: new Date('2026-06-12'),
      sourceExcerpt: '보도자료 원문 발췌 텍스트', dedupeKey: 'tmp-admin-draft',
    },
  });
  console.log('seeded'); await prisma.$disconnect();
}
main();
TS
pnpm exec dotenv -e .env.test -- tsx scripts/_tmp-seed-draft.ts
```
ADMIN 환경변수를 켜고 prod 서버를 로컬 DB로 기동:
```bash
ADMIN_USER=admin ADMIN_PASSWORD=test pnpm exec dotenv -e .env.test -- next start -p 3100
```
검증(별도 터미널, Basic Auth 헤더 포함):
```bash
AUTH=$(printf 'admin:test' | base64)
# 목록(대기 탭)에 초안 노출
curl -s -H "Authorization: Basic $AUTH" "http://localhost:3100/admin/posts" | grep -c '검토용 초안'
# 인증 없으면 401
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:3100/admin/posts"
```
브라우저(`http://localhost:3100/admin/posts`, 팝업에 admin/test 입력)에서 육안 확인:
- 대기 탭에 초안 → 클릭 → 편집 화면(좌: 폼+미리보기, 우: 근거 패널)
- 본문 textarea 수정 시 미리보기 실시간 갱신
- [저장] 후 값 유지 / [게시] 후 목록으로 이동하고 `/board/tmp-admin-draft`가 공개 200
- [반려] 시 반려 탭으로 이동

확인 후 정리:
```bash
rm scripts/_tmp-seed-draft.ts
pnpm exec dotenv -e .env.test -- tsx -e "import {prisma} from '@/lib/db'; prisma.post.deleteMany({where:{slug:'tmp-admin-draft'}}).then(r=>{console.log('deleted',r.count); return prisma.\$disconnect();})"
```

- [ ] **Step 3: 작업 트리 정리 확인**

Run: `git status` → clean. 임시 시드 스크립트가 남아있지 않은지 확인.

---

## 플랜 2 자기 검토 (작성자 체크리스트)

- **스펙 커버리지(§6):** 목록 탭(대기/게시됨/반려) → Task 3 ✅ / 인라인 수정 + 미리보기 → Task 4 ✅ / 근거 패널 병치 → Task 5 ✅ / 게시·반려·수정·삭제 Server Action + 게시 시 revalidate → Task 2 ✅ / Basic Auth 경계(`/admin` 하위) → 전 Task ✅.
- **플레이스홀더:** 없음. 모든 코드/명령/기대결과 명시.
- **타입 일관성:** `listPostsByStatus`/`getPostForAdmin`/`publishPostRow`/`rejectPostRow`/`updatePostRow`/`deletePostRow`/`PostEditableFields` 시그니처가 정의(Task 1)와 사용(Task 2·3·5)에서 일치. 액션명(`savePostAction`/`publishPostAction`/`rejectPostAction`/`deletePostAction`)이 Task 2 정의와 Task 4 사용에서 일치.

---

## 다음 플랜
- **플랜 3 — 생성 파이프라인:** 공식 피드 레지스트리 + 가드레일(TDD) + 뉴스탐지/보도자료매칭/생성 스크립트 + IngestionRun + notify + GitHub Actions 크론 + OPENAI_API_KEY. 운영 DB 마이그레이션 배포도 이 시점에 status 확인 후 진행.
