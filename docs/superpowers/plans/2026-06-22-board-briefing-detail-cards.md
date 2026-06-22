# 임장ON 브리핑 문구 통일 + 게시글 상세 카드 보강 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/board`(임장ON 브리핑)의 목록·상세 명칭을 "임장ON 브리핑"으로 통일하고, 게시글 상세 하단에 실거래가·청약·금융·다른 글 카드 4블록을 추가한다.

**Architecture:** 기존 데이터 함수(`readHomeSnapshot`·`getSubscriptionList`·`getHomeLatestPosts`)를 재사용한다. 새 무거운 쿼리는 없다. 카드 데이터 조회는 주입형(DI) helper로 분리해 선택·에러 경로를 DB 없이 단위 테스트하고, 프레젠테이션은 server component로 둔다. 상세는 현행 ISR(`revalidate=3600`) 유지, 카드별 try/catch 폴백으로 데이터 블립에도 본문은 보존한다.

**Tech Stack:** Next.js App Router(server components), Prisma, vitest(로컬 docker DB + 순수/주입형 단위 테스트), Tailwind(프로젝트 CSS 변수 토큰).

**Spec:** `docs/superpowers/specs/2026-06-22-board-briefing-rename-and-detail-cards-design.md`

---

## File Structure

**신규**
- `lib/board/detail-teasers.ts` — 상세 카드용 데이터 helper. `pickNearestSubscription`(순수), `getSubscriptionTeaser`(주입형), `getTransactionTeaser`(주입형). 책임: 데이터 조회 + 선택 규칙 + 에러→null.
- `app/(public)/board/[id]/_components/board-detail-cta.tsx` — A(실거래가)·B(청약)·C(금융) 카드 프레젠테이션 server component.
- `tests/lib/board-detail-teasers.test.ts` — 순수/주입형 단위 테스트(DB 불필요).
- `tests/lib/board-post.test.ts` — `getHomeLatestPosts` `excludeId` 동작(로컬 docker DB).

**수정**
- `app/(public)/board/page.tsx` — 문구 3곳.
- `app/(public)/board/[id]/page.tsx` — 상세 라벨 문구 + 하단 영역 mount(import 2개 신규).
- `lib/board/post.ts` — `getHomeLatestPosts(limit, excludeId?)`.
- `app/(public)/_components/board-briefing-section.tsx` — `excludeId`·`heading` prop.

**테스트 전제:** `tests/lib`의 DB 접촉 테스트는 `.env.test`(로컬 docker)로 실행된다. `pnpm test:unit` 전에 로컬 테스트 DB가 떠 있어야 한다(`pnpm test:db:migrate`로 스키마 적용).

---

### Task 1: 문구 통일 ("오늘의 이슈"/"임장ON 소식" → "임장ON 브리핑")

**Files:**
- Modify: `app/(public)/board/page.tsx:17,75,103`
- Modify: `app/(public)/board/[id]/page.tsx:68`

- [ ] **Step 1: 목록 메타 타이틀 변경**

`app/(public)/board/page.tsx` 17행:

```tsx
  title: '임장ON 브리핑',
```

(기존 `title: '소식 — 오늘의 이슈',`)

- [ ] **Step 2: 목록 h1 변경**

`app/(public)/board/page.tsx` 74-76행 h1 내부 텍스트:

```tsx
        <h1 className="text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">
          임장ON 브리핑
        </h1>
```

(기존 텍스트 `오늘의 이슈`. h1 위 `소식` 키커(73행)는 **그대로 둔다**.)

- [ ] **Step 3: 목록 sr-only 캡션 변경**

`app/(public)/board/page.tsx` 103행:

```tsx
                <caption className="sr-only">임장ON 브리핑 목록</caption>
```

(기존 `오늘의 이슈 목록`)

- [ ] **Step 4: 상세 상단 라벨 변경**

`app/(public)/board/[id]/page.tsx` 68행:

```tsx
        <p className="text-sm font-black tracking-tight text-[var(--color-blue)]">임장ON 브리핑</p>
```

(기존 `임장ON 소식`)

- [ ] **Step 5: 잔여 문구 없음 확인**

Run: `cd /Users/jiyeonjeong/project/imjang-on && grep -rn "오늘의 이슈\|임장ON 소식" "app/(public)/board"`
Expected: 출력 없음(0 매치).

- [ ] **Step 6: 타입체크**

Run: `pnpm typecheck 2>&1 | tail -5`
Expected: 에러 없음.

- [ ] **Step 7: Commit**

```bash
git add "app/(public)/board/page.tsx" "app/(public)/board/[id]/page.tsx"
git commit -m "feat(board): 목록·상세 명칭을 임장ON 브리핑으로 통일"
```

---

### Task 2: `getHomeLatestPosts`에 `excludeId` 옵션 추가

**Files:**
- Modify: `lib/board/post.ts:120-128`
- Test: `tests/lib/board-post.test.ts` (신규)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/board-post.test.ts` 생성:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { assertLocalDatabase } from '../_helpers/assert-local-db';
import { getHomeLatestPosts } from '@/lib/board/post';

assertLocalDatabase();
const MARK = 'test-hlp-';

async function seedPost(n: number, publishedAt: Date): Promise<bigint> {
  await prisma.post.create({
    data: {
      slug: `${MARK}${n}`,
      title: `제목${n}`,
      summary: '요약',
      body: '본문',
      type: 'TREND',
      category: 'ECONOMY',
      status: 'PUBLISHED',
      sourceName: '출처',
      sourceUrl: 'https://example.com',
      sourceDate: new Date('2026-06-01'),
      sourceExcerpt: '원문',
      dedupeKey: `${MARK}${n}`,
      publishedAt,
    },
  });
  const row = await prisma.post.findUnique({ where: { dedupeKey: `${MARK}${n}` } });
  return row!.id;
}

beforeEach(async () => {
  await prisma.post.deleteMany({ where: { dedupeKey: { startsWith: MARK } } });
});
afterEach(async () => {
  await prisma.post.deleteMany({ where: { dedupeKey: { startsWith: MARK } } });
});

describe('getHomeLatestPosts excludeId', () => {
  it('excludeId로 지정한 글은 결과에서 빠진다', async () => {
    const idA = await seedPost(1, new Date('2099-01-01'));
    const idB = await seedPost(2, new Date('2099-01-02'));
    const ids = (await getHomeLatestPosts(50, idA)).map((p) => p.id);
    expect(ids).toContain(idB);
    expect(ids).not.toContain(idA);
  });

  it('excludeId 미전달 시 둘 다 포함된다', async () => {
    const idA = await seedPost(1, new Date('2099-01-01'));
    const idB = await seedPost(2, new Date('2099-01-02'));
    const ids = (await getHomeLatestPosts(50)).map((p) => p.id);
    expect(ids).toContain(idA);
    expect(ids).toContain(idB);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/lib/board-post.test.ts`
Expected: FAIL — `getHomeLatestPosts`가 2번째 인자를 받지 않아 `idA`가 결과에 그대로 남아 `not.toContain(idA)` 실패(또는 TS 인자 개수 에러).

- [ ] **Step 3: 최소 구현**

`lib/board/post.ts` `getHomeLatestPosts`(120-128행)를 교체:

```ts
export async function getHomeLatestPosts(limit = 5, excludeId?: bigint): Promise<HomePostItem[]> {
  const rows = await prisma.post.findMany({
    where: { status: 'PUBLISHED', ...(excludeId !== undefined ? { id: { not: excludeId } } : {}) },
    select: { id: true, slug: true, title: true, summary: true, category: true, sourceName: true, publishedAt: true },
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });
  return rows.map((r) => ({ ...r, publishedAt: r.publishedAt! }));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/lib/board-post.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/board/post.ts tests/lib/board-post.test.ts
git commit -m "feat(board): getHomeLatestPosts에 excludeId 옵션 추가"
```

---

### Task 3: `BoardBriefingSection`에 `excludeId`·`heading` prop 추가

**Files:**
- Modify: `app/(public)/_components/board-briefing-section.tsx:19-30`

- [ ] **Step 1: 시그니처·호출·헤딩 변경**

`app/(public)/_components/board-briefing-section.tsx` 19행 시그니처:

```tsx
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
```

그리고 28행 h2 텍스트를 prop 기본값 처리로 변경:

```tsx
          <h2 className="text-xl font-black tracking-tight md:text-[22px]">{heading ?? '최신 부동산·청약·금융 소식'}</h2>
```

(나머지 본문·서브캡션·카드 마크업은 그대로 둔다.)

- [ ] **Step 2: 타입체크 — 기존 호출부 무영향 확인**

Run: `pnpm typecheck 2>&1 | tail -5`
Expected: 에러 없음(기존 13개 호출부는 새 prop 미전달, 선택 인자라 안전).

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/_components/board-briefing-section.tsx"
git commit -m "feat(board): BoardBriefingSection에 excludeId·heading prop 추가"
```

---

### Task 4: 상세 카드 데이터 helper (`lib/board/detail-teasers.ts`)

**Files:**
- Create: `lib/board/detail-teasers.ts`
- Test: `tests/lib/board-detail-teasers.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/board-detail-teasers.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest';
import {
  pickNearestSubscription,
  getSubscriptionTeaser,
  getTransactionTeaser,
} from '@/lib/board/detail-teasers';
import type { SubscriptionListItem, SubscriptionListResult } from '@/lib/subscription';
import type { MarketBriefing } from '@/lib/briefing';

function item(over: Partial<SubscriptionListItem> = {}): SubscriptionListItem {
  return {
    id: '1',
    name: '테스트단지',
    category: 'APT',
    regionName: '서울특별시',
    receiptBegin: new Date('2026-07-01'),
    receiptEnd: new Date('2026-07-10'),
    totalSupply: 100,
    unitCount: 3,
    minPrice: 50000,
    maxPrice: 90000,
    minArea: 59,
    maxArea: 84,
    ...over,
  };
}
function listResult(rows: SubscriptionListItem[]): SubscriptionListResult {
  return { rows, total: rows.length, totalPages: 1, page: 1, perPage: 1 };
}

describe('pickNearestSubscription', () => {
  it('OPEN이 있으면 OPEN을 고른다', () => {
    const open = [item({ name: '접수중단지' })];
    const upcoming = [item({ name: '예정단지' })];
    expect(pickNearestSubscription(open, upcoming)).toEqual({ item: open[0], status: 'OPEN' });
  });
  it('OPEN이 없으면 UPCOMING을 고른다', () => {
    const upcoming = [item({ name: '예정단지' })];
    expect(pickNearestSubscription([], upcoming)).toEqual({ item: upcoming[0], status: 'UPCOMING' });
  });
  it('둘 다 없으면 null', () => {
    expect(pickNearestSubscription([], [])).toBeNull();
  });
});

describe('getSubscriptionTeaser (주입형)', () => {
  it('OPEN을 우선 선택한다', async () => {
    const open = item({ name: '접수중' });
    const fakeList = async (opts: { status?: string }): Promise<SubscriptionListResult> =>
      opts.status === 'OPEN' ? listResult([open]) : listResult([item({ name: '예정' })]);
    expect(await getSubscriptionTeaser(fakeList as never)).toEqual({ item: open, status: 'OPEN' });
  });
  it('조회가 throw하면 null', async () => {
    const thrower = async (): Promise<SubscriptionListResult> => {
      throw new Error('db blip');
    };
    expect(await getSubscriptionTeaser(thrower as never)).toBeNull();
  });
});

describe('getTransactionTeaser (주입형)', () => {
  it('briefing을 그대로 반환한다', async () => {
    const briefing = { refDate: '2026-06-21' } as MarketBriefing;
    expect(await getTransactionTeaser(async () => ({ briefing }))).toBe(briefing);
  });
  it('조회가 throw하면 null', async () => {
    expect(
      await getTransactionTeaser(async () => {
        throw new Error('blip');
      }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/lib/board-detail-teasers.test.ts`
Expected: FAIL — `@/lib/board/detail-teasers` 모듈이 없어 import 에러.

- [ ] **Step 3: 최소 구현**

`lib/board/detail-teasers.ts` 생성:

```ts
import { readHomeSnapshot } from '@/lib/dashboard-snapshot';
import { getSubscriptionList, type SubscriptionListItem } from '@/lib/subscription';
import type { MarketBriefing } from '@/lib/briefing';

export interface SubscriptionTeaser {
  item: SubscriptionListItem;
  status: 'OPEN' | 'UPCOMING';
}

/** OPEN 우선, 없으면 UPCOMING, 둘 다 없으면 null. (순수 선택 규칙) */
export function pickNearestSubscription(
  open: SubscriptionListItem[],
  upcoming: SubscriptionListItem[],
): SubscriptionTeaser | null {
  if (open.length > 0) return { item: open[0], status: 'OPEN' };
  if (upcoming.length > 0) return { item: upcoming[0], status: 'UPCOMING' };
  return null;
}

type ListFn = typeof getSubscriptionList;

/** 가장 가까운 청약 1건. 조회 실패 시 null(카드 미렌더). */
export async function getSubscriptionTeaser(
  listFn: ListFn = getSubscriptionList,
): Promise<SubscriptionTeaser | null> {
  try {
    const [open, upcoming] = await Promise.all([
      listFn({ status: 'OPEN', sort: 'recent', perPage: 1 }),
      listFn({ status: 'UPCOMING', sort: 'recent', perPage: 1 }),
    ]);
    return pickNearestSubscription(open.rows, upcoming.rows);
  } catch (err) {
    console.error('[board-detail] subscription teaser fetch failed', err);
    return null;
  }
}

type ReadSnapshotFn = () => Promise<{ briefing: MarketBriefing | null }>;

/** 오늘의 실거래가 브리핑. 조회 실패 시 null(카드 미렌더). */
export async function getTransactionTeaser(
  readSnapshot: ReadSnapshotFn = readHomeSnapshot,
): Promise<MarketBriefing | null> {
  try {
    const { briefing } = await readSnapshot();
    return briefing;
  } catch (err) {
    console.error('[board-detail] transaction teaser fetch failed', err);
    return null;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/lib/board-detail-teasers.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/board/detail-teasers.ts tests/lib/board-detail-teasers.test.ts
git commit -m "feat(board): 상세 카드 데이터 helper(detail-teasers) 추가"
```

---

### Task 5: 상세 카드 프레젠테이션 컴포넌트 (`board-detail-cta.tsx`)

**Files:**
- Create: `app/(public)/board/[id]/_components/board-detail-cta.tsx`

> **주의:** `SourceCaption`은 내부에 `<Link>`(앵커)를 렌더한다. 카드 컨테이너를 `<Link>`로 감싸면 앵커 중첩(잘못된 HTML)이 되므로, 카드는 `<div>`로 두고 CTA `<Link>`와 `SourceCaption`을 형제로 배치한다.

- [ ] **Step 1: 컴포넌트 생성**

`app/(public)/board/[id]/_components/board-detail-cta.tsx` 생성:

```tsx
import Link from 'next/link';
import { formatBillion } from '@/lib/format';
import { deriveStatus, ddayLabel, STATUS_LABEL, STATUS_TONE } from '@/lib/subscription';
import { SourceCaption } from '@/components/ui/source-caption';
import { Badge } from '@/components/ui/badge';
import {
  getTransactionTeaser,
  getSubscriptionTeaser,
  type SubscriptionTeaser,
} from '@/lib/board/detail-teasers';
import type { MarketBriefing } from '@/lib/briefing';

const cardClass =
  'flex flex-col rounded-[20px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]';

/** refDate(YYYY-MM-DD) → "6월 21일[ 최근] 수집 기준" (isFallback 시 '오늘' 단정 회피). */
function refDateLabel(b: MarketBriefing): string {
  const [, mm, dd] = b.refDate.split('-');
  return `${Number(mm)}월 ${Number(dd)}일${b.isFallback ? ' 최근' : ''} 수집 기준`;
}

function TransactionCard({ briefing }: { briefing: MarketBriefing }) {
  const { summary } = briefing;
  return (
    <div className={cardClass}>
      <p className="text-[15px] font-black tracking-tight text-[var(--color-blue-dark)]">📊 오늘의 실거래가</p>
      <p className="mt-1 text-xs text-[var(--color-muted)]">{refDateLabel(briefing)}</p>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--color-muted)]">신고 건수</dt>
          <dd className="font-bold">{summary.txCount.toLocaleString('ko-KR')}건</dd>
        </div>
        {summary.highest && (
          <div className="flex justify-between gap-2">
            <dt className="shrink-0 text-[var(--color-muted)]">최고가</dt>
            <dd className="truncate font-bold">
              {formatBillion(summary.highest.amountManwon)} · {summary.highest.regionLabel}
            </dd>
          </div>
        )}
        {summary.topRegion && (
          <div className="flex justify-between gap-2">
            <dt className="shrink-0 text-[var(--color-muted)]">최다 거래 지역</dt>
            <dd className="truncate font-bold">
              {summary.topRegion.label} ({summary.topRegion.count}건)
            </dd>
          </div>
        )}
      </dl>
      <Link href="/list" className="mt-3 text-[13px] font-bold text-[var(--color-blue)] hover:underline">
        실거래가 보기 →
      </Link>
      <SourceCaption ids={['molit-rtms']} />
    </div>
  );
}

function SubscriptionCard({ teaser }: { teaser: SubscriptionTeaser }) {
  const { item, status } = teaser;
  const dday = ddayLabel(deriveStatus(item.receiptBegin, item.receiptEnd));
  return (
    <div className={cardClass}>
      <p className="text-[15px] font-black tracking-tight text-[var(--color-blue-dark)]">🏠 가장 가까운 청약</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
        {dday && <span className="text-xs font-bold text-[var(--color-muted)]">{dday}</span>}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-bold text-[var(--color-text)]">{item.name}</p>
      {item.regionName && <p className="mt-0.5 text-sm text-[var(--color-muted)]">{item.regionName}</p>}
      <Link href="/subscription" className="mt-3 text-[13px] font-bold text-[var(--color-blue)] hover:underline">
        청약 일정 보기 →
      </Link>
      <SourceCaption ids={['applyhome']} />
    </div>
  );
}

/** 게시글 상세 하단: 오늘의 실거래가 + 가장 가까운 청약 + 금융정보 바로가기. */
export async function BoardDetailCta() {
  const [briefing, subscription] = await Promise.all([getTransactionTeaser(), getSubscriptionTeaser()]);

  return (
    <section className="mt-12">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {briefing && <TransactionCard briefing={briefing} />}
        {subscription && <SubscriptionCard teaser={subscription} />}
      </div>
      <Link
        href="/finance"
        className="mt-4 flex items-center justify-between rounded-[20px] border border-[var(--color-line)] bg-[var(--color-soft)] px-5 py-4 transition hover:border-[var(--color-blue)]"
      >
        <span className="text-sm font-bold text-[var(--color-blue-dark)]">💳 금융정보도 둘러보세요</span>
        <span className="text-[13px] font-bold text-[var(--color-blue)]">바로가기 →</span>
      </Link>
    </section>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck 2>&1 | tail -5`
Expected: 에러 없음. (`STATUS_LABEL`·`STATUS_TONE`·`deriveStatus`·`ddayLabel`은 `@/lib/subscription` export, `Badge`는 `@/components/ui/badge` export, `formatBillion`은 `@/lib/format` export, `SubscriptionTeaser`는 Task 4에서 정의됨.)

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/board/[id]/_components/board-detail-cta.tsx"
git commit -m "feat(board): 상세 하단 카드(실거래가·청약·금융) 컴포넌트 추가"
```

---

### Task 6: 상세 페이지에 하단 영역 mount

**Files:**
- Modify: `app/(public)/board/[id]/page.tsx`

- [ ] **Step 1: import 2개 추가**

`app/(public)/board/[id]/page.tsx` 상단 import 블록(8행 `PostSource` import 부근)에 추가:

```tsx
import { PostSource } from '@/components/ui/post-source';
import { BoardDetailCta } from './_components/board-detail-cta';
import { BoardBriefingSection } from '@/app/(public)/_components/board-briefing-section';
```

(첫 줄은 기존 import. 아래 2줄을 추가한다.)

- [ ] **Step 2: `<PostSource/>` 아래에 영역 추가**

`app/(public)/board/[id]/page.tsx`의 `<PostSource … />` 블록 바로 다음, `</article>` 직전에 추가:

```tsx
      <PostSource
        sourceName={post.sourceName}
        sourceUrl={post.sourceUrl}
        sourceDate={post.sourceDate}
      />

      <BoardDetailCta />
      <BoardBriefingSection className="mt-16" heading="다른 브리핑 글" excludeId={post.id} />
    </article>
```

(첫 `<PostSource…/>`는 기존 코드. 그 뒤 두 줄을 추가한다. `post.id`는 `bigint`이므로 `excludeId` 타입과 일치한다.)

- [ ] **Step 3: 타입체크**

Run: `pnpm typecheck 2>&1 | tail -5`
Expected: 에러 없음.

- [ ] **Step 4: 클린 빌드 — board 라우트 정상 확인**

Run: `cd /Users/jiyeonjeong/project/imjang-on; rm -rf .next; pnpm build > /tmp/imjang-build-board.log 2>&1; echo "EXIT=$?"; grep -iE "/board" /tmp/imjang-build-board.log; tail -6 /tmp/imjang-build-board.log`
Expected: `EXIT=0`, `/board`·`/board/[id]` 라우트가 빌드 결과에 정상 표기, 에러 없음.

- [ ] **Step 5: Commit**

```bash
git add "app/(public)/board/[id]/page.tsx"
git commit -m "feat(board): 게시글 상세 하단에 카드·다른 브리핑 글 영역 추가"
```

---

### Task 7: 전체 검증 + 로컬 스모크

**Files:** 없음(검증 전용)

- [ ] **Step 1: 타입체크**

Run: `pnpm typecheck 2>&1 | tail -5`
Expected: 에러 없음.

- [ ] **Step 2: 단위 테스트 (로컬 docker DB)**

Run: `pnpm test:db:migrate && pnpm test:unit 2>&1 | tail -15`
Expected: 전 테스트 PASS(신규 `board-post`·`board-detail-teasers` 포함). 기존 통과 수 + 9.

- [ ] **Step 3: 클린 빌드**

Run: `cd /Users/jiyeonjeong/project/imjang-on; rm -rf .next; pnpm build > /tmp/imjang-build-final.log 2>&1; echo "EXIT=$?"; tail -6 /tmp/imjang-build-final.log`
Expected: `EXIT=0`.

- [ ] **Step 4: 로컬 dev 스모크(미리보기 토큰)**

게시판이 비공개(`NEXT_PUBLIC_BOARD_ENABLED` 미설정)일 수 있으므로 미리보기 토큰으로 확인한다. dev 서버를 띄우고:
- 목록 `/board?preview=<BOARD_PREVIEW_TOKEN>` → 헤딩 "임장ON 브리핑" 노출.
- 상세 `/board/<id>?preview=<token>` → 상단 라벨 "임장ON 브리핑", 본문 아래 ⓐ오늘의 실거래가 ⓑ가장 가까운 청약(데이터 있을 때) ⓒ금융정보 카드 + "다른 브리핑 글" 섹션(현재 글 제외) 노출.
- 출처 캡션이 "출처: 국토교통부 · 자세히 보기" / "출처: 한국부동산원 · 자세히 보기"로 표기.

Expected: 위 항목 육안 확인. 데이터가 비어도(청약 0건 등) 본문은 정상, 해당 카드만 빠짐.

- [ ] **Step 5: 최종 상태 확인**

Run: `git log --oneline -7`
Expected: Task 1~6 커밋 7개 이내가 순서대로 보임. 작업 트리 clean.

---

## 비고

- 운영 DB 마이그레이션 변경 없음(스키마 무변경, `Post`·`SubscriptionNotice` 기존 테이블 사용).
- 머지·배포는 사용자 확인 후. 게시판 공개 토글은 이번 작업과 무관(기존 동작 유지).
