# 전세자금보증 상세 디스커버리 섹션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전세자금보증 상품 상세 페이지(`/jeonse-guarantee/[grntDvcd]`) 하단에 실거래가·청약·서민금융·생활편의 카드형 디스커버리 섹션과 임장ON 브리핑 최신 4건을 추가한다.

**Architecture:** 페이지(서버 컴포넌트)에서 전역 티저 데이터(브리핑·이번 주 청약·대출목록)를 병렬 조회하고, 순수 함수 `relatedLoansForJeonse()`로 연관 대출을 계산한 뒤, 프레젠테이션 컴포넌트 `JeonseDiscoverySection`에 props로 넘겨 렌더한다. 보드 섹션은 기존 `BoardBriefingSection`을 재사용한다. 좌표 앵커가 없으므로 생활편의는 실데이터 없이 `/life`로 가는 안내 카드로 처리한다.

**Tech Stack:** Next.js(App Router, 서버 컴포넌트), TypeScript, Tailwind(CSS 변수 토큰), Prisma, Vitest(lib 단위테스트), Playwright(반응형 시각 검증).

**작업 브랜치:** `feat/jeonse-guarantee-discovery` (이미 생성됨, 설계 문서 커밋 `d262467` 포함).

---

## File Structure

| 파일 | 역할 | 신규/수정 |
|---|---|---|
| `lib/jeonse/related-loans.ts` | 전세보증 상품 → 합성 `LoanSummary` → `recommendLoans` 위임(순수) | **신규** |
| `tests/lib/jeonse-related-loans.test.ts` | `relatedLoansForJeonse` 단위 테스트 | **신규** |
| `app/(public)/jeonse-guarantee/[grntDvcd]/_components/jeonse-discovery-section.tsx` | 디스커버리 섹션 + 내부 소형 카드(실거래가 미니카드·생활편의 안내) | **신규** |
| `app/(public)/jeonse-guarantee/[grntDvcd]/page.tsx` | 티저 병렬 조회 + 섹션 2개 렌더 추가 | **수정** |

**재사용(수정 없음):** `SubscriptionBoardItem`, `RelatedLoanCard`, `BoardBriefingSection`, `SourceCaption`, `getTransactionTeaser`, `getWeeklySubscriptions`, `flattenWeeklyBoard`, `getLoanSummaries`, `recommendLoans`, `formatBillion`.

**확정된 타입(참고):**
- `MarketBriefing`(`lib/briefing.ts:113`): `{ refDate, isFallback, summary: { txCount, highest: TxHighlight|null, lowest, topRegion: RegionCount|null, topAreaBand }, popularRegions, surgeRegions, hashtags }`
- `TxHighlight`: `{ propertyId: string, slug: PropertyTypeSlug('apt'|'officetel'|'villa'), propertyName, regionLabel, amountManwon: number }`
- `RegionCount`: `{ code, sigunguCode, sido, label, count }`
- `WeeklyBoardItem`(`lib/subscription.ts:252`): `SubscriptionBoardItem`이 받는 타입. `{ id, tone, badge, name, regionShort }`
- `LoanSummary`(`lib/loan/list.ts:12`): `{ seq, finprdnm, ofrinstnm, instCtg, lnlmt(만원), irt, usageTags, targetTags, regionTags, operPeriod? }`
- `RelatedLoan`(`lib/loan/related.ts:17`): `LoanSummary & { reasons: RelatedLoanReason[], summaryLine: string }`
- `recommendLoans(current, all, max)` 매칭 키워드: usage `house`=`['주거','전월세','전세','월세','보증금']`, target `youth`=`['청년','대학',...]`.

---

### Task 1: 순수 함수 `relatedLoansForJeonse()` (TDD)

전세보증 상품을 합성 `LoanSummary`로 만들어 `recommendLoans`에 위임하는 순수 함수. DB 불필요 → vitest 단위 테스트.

**Files:**
- Create: `lib/jeonse/related-loans.ts`
- Test: `tests/lib/jeonse-related-loans.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/jeonse-related-loans.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { relatedLoansForJeonse } from '@/lib/jeonse/related-loans';
import type { LoanSummary } from '@/lib/loan/list';

function loan(partial: Partial<LoanSummary> & { seq: number; finprdnm: string }): LoanSummary {
  return {
    ofrinstnm: null,
    instCtg: null,
    lnlmt: null,
    irt: null,
    usageTags: [],
    targetTags: [],
    regionTags: [],
    ...partial,
  };
}

describe('relatedLoansForJeonse', () => {
  it('주거(전세) 목적 대출을 연관으로 고르고 무관 대출은 제외한다', () => {
    const all = [
      loan({ seq: 1, finprdnm: '버팀목전세자금', usageTags: ['전세', '보증금'] }), // house 매칭
      loan({ seq: 2, finprdnm: '창업운영자금', usageTags: ['창업', '운영'] }), // biz only → 제외
    ];
    const result = relatedLoansForJeonse(
      { rcmdProdNm: '일반전세자금보증', grntReqTrgtDvcd: '00', maxLoanLmtAmt: 200_000_000 },
      all,
      3,
    );
    expect(result.map((r) => r.seq)).toEqual([1]);
    expect(result[0].reasons.some((x) => x.kind === 'usage')).toBe(true);
    expect(result[0].summaryLine.length).toBeGreaterThan(0);
  });

  it('청년 대상(01)이면 청년 대출이 가점되어 상위로 온다', () => {
    const all = [
      loan({ seq: 1, finprdnm: '일반전세대출', usageTags: ['전세'] }),
      loan({ seq: 2, finprdnm: '청년전세대출', usageTags: ['전세'], targetTags: ['청년'] }),
    ];
    const result = relatedLoansForJeonse(
      { rcmdProdNm: 'x', grntReqTrgtDvcd: '01', maxLoanLmtAmt: null },
      all,
      3,
    );
    expect(result[0].seq).toBe(2);
  });

  it('대출 목록이 비면 빈 배열을 반환한다', () => {
    const result = relatedLoansForJeonse(
      { rcmdProdNm: 'x', grntReqTrgtDvcd: '00', maxLoanLmtAmt: null },
      [],
      3,
    );
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run tests/lib/jeonse-related-loans.test.ts`
Expected: FAIL — `Cannot find module '@/lib/jeonse/related-loans'` (또는 export 없음).

- [ ] **Step 3: 최소 구현 작성**

`lib/jeonse/related-loans.ts`:

```ts
import { recommendLoans, type RelatedLoan } from '@/lib/loan/related';
import type { LoanSummary } from '@/lib/loan/list';

/** 연관 대출 계산에 필요한 전세보증 상품 필드만. */
export interface JeonseProductForLoans {
  rcmdProdNm: string;
  grntReqTrgtDvcd: string | null;
  maxLoanLmtAmt: number | null;
}

/** 실제 대출과 충돌하지 않는 합성 상품 식별자(recommendLoans의 자기제외용). */
const JEONSE_SYNTHETIC_SEQ = -1;

/**
 * 전세보증 상품을 합성 LoanSummary로 변환해 연관 서민금융 대출을 고른다.
 * - 목적: 항상 '전세'(usageSlugs → 'house' 매칭).
 * - 대상: 01 청년 / 02 신혼부부 / 그 외 없음.
 * - lnlmt(만원)는 한도 근접 랭킹에만 쓰이므로 원→만원 환산.
 */
export function relatedLoansForJeonse(
  product: JeonseProductForLoans,
  allLoans: LoanSummary[],
  max = 3,
): RelatedLoan[] {
  const targetTags =
    product.grntReqTrgtDvcd === '01'
      ? ['청년']
      : product.grntReqTrgtDvcd === '02'
        ? ['신혼부부']
        : [];

  const synthetic: LoanSummary = {
    seq: JEONSE_SYNTHETIC_SEQ,
    finprdnm: product.rcmdProdNm,
    ofrinstnm: '한국주택금융공사',
    instCtg: null,
    lnlmt: product.maxLoanLmtAmt != null ? Math.round(product.maxLoanLmtAmt / 10_000) : null,
    irt: null,
    usageTags: ['전세'],
    targetTags,
    regionTags: [],
  };

  return recommendLoans(synthetic, allLoans, max);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec vitest run tests/lib/jeonse-related-loans.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 5: 커밋**

```bash
git add lib/jeonse/related-loans.ts tests/lib/jeonse-related-loans.test.ts
git commit -m "feat(jeonse): 전세보증 연관 서민금융 대출 선택 순수함수

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 프레젠테이션 컴포넌트 `JeonseDiscoverySection`

데이터를 props로 받아 4개 서브섹션 + 출처 캡션을 렌더한다. 이 저장소는 컴포넌트 단위테스트가 없으므로(tests/lib 만 운영) 검증은 타입체크로 한다. 시각 검증은 Task 4.

**Files:**
- Create: `app/(public)/jeonse-guarantee/[grntDvcd]/_components/jeonse-discovery-section.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`app/(public)/jeonse-guarantee/[grntDvcd]/_components/jeonse-discovery-section.tsx`:

```tsx
import Link from 'next/link';
import { SourceCaption } from '@/components/ui/source-caption';
import { SubscriptionBoardItem } from '@/app/(public)/_components/subscription-board-item';
import { RelatedLoanCard } from '@/app/(public)/finance/[seq]/_components/related-loan-card';
import { formatBillion } from '@/lib/format';
import type { MarketBriefing } from '@/lib/briefing';
import type { WeeklyBoardItem } from '@/lib/subscription';
import type { RelatedLoan } from '@/lib/loan/related';

interface Props {
  briefing: MarketBriefing | null;
  weeklySubscriptions: WeeklyBoardItem[];
  relatedLoans: RelatedLoan[];
}

/** 전세보증 상세 하단 '더 살펴보기' 디스커버리 섹션. 좌표 앵커가 없어 전국 기준 데이터만 노출. */
export function JeonseDiscoverySection({ briefing, weeklySubscriptions, relatedLoans }: Props) {
  const hasTx = briefing != null;
  const hasSubs = weeklySubscriptions.length > 0;
  const hasLoans = relatedLoans.length > 0;

  return (
    <section className="mt-10 rounded-[22px] bg-[var(--color-soft)] p-5 sm:p-6">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">임장ON에서 더 살펴보기</h2>

      {hasTx && (
        <DiscoveryBlock title="실거래가" moreHref="/list?deal=jeonse" moreLabel="전세 실거래가 더 보기 →">
          <TransactionTeaserCard briefing={briefing} />
        </DiscoveryBlock>
      )}

      {hasSubs && (
        <>
          {hasTx && <Divider />}
          <DiscoveryBlock title="이번 주 청약" moreHref="/subscription" moreLabel="전체 청약 →">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {weeklySubscriptions.map((item) => (
                <SubscriptionBoardItem key={item.id} item={item} />
              ))}
            </div>
          </DiscoveryBlock>
        </>
      )}

      {hasLoans && (
        <>
          {(hasTx || hasSubs) && <Divider />}
          <DiscoveryBlock title="다른 서민금융 대출상품" moreHref="/finance" moreLabel="서민금융 더 보기 →">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {relatedLoans.map((item) => (
                <RelatedLoanCard key={item.seq} item={item} />
              ))}
            </div>
          </DiscoveryBlock>
        </>
      )}

      <Divider />
      <DiscoveryBlock title="생활편의" moreHref="/life" moreLabel="둘러보기 →">
        <LifeNavCard />
      </DiscoveryBlock>

      <div className="mt-5">
        <SourceCaption ids={['molit-rtms', 'applyhome', 'lh-presub', 'kinfa-loan']} />
      </div>
    </section>
  );
}

function Divider() {
  return <div className="my-5 border-t border-[var(--color-line)]" />;
}

function DiscoveryBlock({
  title,
  moreHref,
  moreLabel,
  children,
}: {
  title: string;
  moreHref: string;
  moreLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-bold text-[var(--color-text)]">{title}</h3>
        <Link href={moreHref} className="shrink-0 py-1 text-xs font-bold text-[var(--color-blue)]">
          {moreLabel}
        </Link>
      </div>
      {children}
    </div>
  );
}

/** 전국 매매 브리핑 요약(거래건수·최고가·인기지역)을 작은 타일로. */
function TransactionTeaserCard({ briefing }: { briefing: MarketBriefing }) {
  const { summary } = briefing;
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <TxTile label="🧾 오늘 등록된 실거래" value={`${summary.txCount.toLocaleString('ko-KR')}건`} sub="전국 매매 신고분" />
      {summary.highest && (
        <TxTile
          label="🔥 최고가 거래"
          value={formatBillion(summary.highest.amountManwon)}
          sub={`${summary.highest.regionLabel} · ${summary.highest.propertyName}`}
          href={`/${summary.highest.slug}/${summary.highest.propertyId}`}
        />
      )}
      {summary.topRegion && (
        <TxTile
          label="🚀 가장 많이 거래된 지역"
          value={summary.topRegion.label}
          sub={`${summary.topRegion.count}건`}
          href={`/list?region=${summary.topRegion.sigunguCode}&sido=${encodeURIComponent(summary.topRegion.sido)}`}
        />
      )}
    </div>
  );
}

function TxTile({ label, value, sub, href }: { label: string; value: string; sub: string; href?: string }) {
  const body = (
    <div className="h-full rounded-xl border border-[var(--color-line)] bg-white px-3.5 py-3">
      <div className="text-xs text-[var(--color-muted)]">{label}</div>
      <div
        className={`mt-1 break-keep text-base font-black leading-tight tracking-tight ${
          href ? 'text-[var(--color-blue)]' : 'text-[var(--color-blue-dark)]'
        }`}
      >
        {value}
      </div>
      <div className="mt-0.5 truncate text-xs text-[var(--color-muted)]">{sub}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-xl transition hover:[&>div]:border-[var(--color-blue)]">
      {body}
    </Link>
  ) : (
    body
  );
}

/** 좌표 앵커가 없어 실데이터 대신 /life 허브로 보내는 안내 카드. */
function LifeNavCard() {
  return (
    <Link
      href="/life"
      className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] bg-white px-4 py-3.5 transition hover:border-[var(--color-blue)]"
    >
      <span className="min-w-0">
        <span className="block break-keep text-sm font-bold text-[var(--color-blue-dark)]">
          🏫 학교 · 🏥 병원 · 🚇 지하철 · 🛒 마트
        </span>
        <span className="mt-0.5 block break-keep text-sm text-[var(--color-muted)]">
          우리 동네 생활편의를 지역으로 골라 둘러보세요
        </span>
      </span>
      <span aria-hidden className="shrink-0 text-[var(--color-blue)]">
        →
      </span>
    </Link>
  );
}
```

> **참고(크로스 라우트 import):** `RelatedLoanCard`를 `finance/[seq]/_components`에서 가져온다. 경로에 대괄호가 있어도 모듈 해석은 정상이다. 만약 번들러가 해석에 실패하면(드묾) 폴백으로 동일 카드 마크업을 이 파일에 인라인한다(상품명·`한도 {lnlmt}만원`·`summaryLine`·`reasons` 배지, 링크 `/finance/{seq}`). 공용 위치로 이동하는 리팩터는 범위 밖.

- [ ] **Step 2: 타입체크 통과 확인**

Run: `pnpm typecheck`
Expected: PASS (에러 0). (이 컴포넌트는 아직 어디서도 import되지 않으므로 page 미수정 상태에서도 타입만 검증된다.)

- [ ] **Step 3: 커밋**

```bash
git add "app/(public)/jeonse-guarantee/[grntDvcd]/_components/jeonse-discovery-section.tsx"
git commit -m "feat(jeonse): 상세 디스커버리 섹션 컴포넌트

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 페이지에 데이터 조회 + 섹션 렌더 배선

**Files:**
- Modify: `app/(public)/jeonse-guarantee/[grntDvcd]/page.tsx`

- [ ] **Step 1: import 추가**

`page.tsx` 상단 import 블록(현재 `import { getJeonseProduct, getProductRegions, getAllGrntDvcds } from '@/lib/jeonse/detail';` 등)에 아래를 추가한다:

```tsx
import { getTransactionTeaser } from '@/lib/board/detail-teasers';
import { getWeeklySubscriptions, flattenWeeklyBoard } from '@/lib/subscription';
import { getLoanSummaries, type LoanSummary } from '@/lib/loan/list';
import { relatedLoansForJeonse } from '@/lib/jeonse/related-loans';
import { JeonseDiscoverySection } from './_components/jeonse-discovery-section';
import { BoardBriefingSection } from '@/app/(public)/_components/board-briefing-section';
```

- [ ] **Step 2: 티저 데이터 병렬 조회 추가**

`page.tsx`의 `JeonseGuaranteeDetailPage` 본문에서, 기존 줄

```tsx
  const regions = await getProductRegions(grntDvcd);
```

바로 아래에 다음을 삽입한다:

```tsx
  const [briefing, weeklyBoard, allLoans] = await Promise.all([
    getTransactionTeaser(),
    getWeeklySubscriptions().catch(() => null),
    getLoanSummaries().catch(() => [] as LoanSummary[]),
  ]);
  const weeklySubscriptions = weeklyBoard ? flattenWeeklyBoard(weeklyBoard, 4) : [];
  const relatedLoans = relatedLoansForJeonse(product, allLoans, 3);
```

- [ ] **Step 3: 섹션 2개 렌더 추가**

`page.tsx`에서 2단 그리드를 감싸는 `<div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]"> ... </div>`의 **닫는 `</div>` 바로 다음**(바깥 컨테이너 `<div className="mx-auto max-w-[1180px] px-6 py-12">`의 닫는 `</div>` 직전)에 삽입한다:

```tsx
      <JeonseDiscoverySection
        briefing={briefing}
        weeklySubscriptions={weeklySubscriptions}
        relatedLoans={relatedLoans}
      />

      <BoardBriefingSection heading="임장ON 브리핑" className="mt-10" />
```

- [ ] **Step 4: 타입체크 + 린트 통과 확인**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS (에러 0). `product`는 `relatedLoansForJeonse`의 `JeonseProductForLoans`(rcmdProdNm·grntReqTrgtDvcd·maxLoanLmtAmt)를 구조적으로 만족한다.

- [ ] **Step 5: 커밋**

```bash
git add "app/(public)/jeonse-guarantee/[grntDvcd]/page.tsx"
git commit -m "feat(jeonse): 상세 페이지에 디스커버리·임장ON 브리핑 섹션 배선

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 반응형 시각 검증

dev 서버를 띄워 실제 상세 페이지에서 섹션 렌더·반응형·오버플로를 확인한다. (dev는 `.env.local`=운영 Supabase를 읽으며 조회 전용이라 안전.)

**Files:** (없음 — 검증. 문제 발견 시 해당 파일 수정 후 재커밋)

- [ ] **Step 1: dev 서버 기동(백그라운드)**

Run: `pnpm dev` (백그라운드 실행). `http://localhost:3000` 준비 대기.

- [ ] **Step 2: 유효한 grntDvcd 확보**

브라우저(Playwright)로 `http://localhost:3000/jeonse-guarantee` 열고 첫 상품 카드의 링크에서 `/jeonse-guarantee/<grntDvcd>` 경로를 얻는다(또는 그 카드를 클릭).

- [ ] **Step 3: 데스크톱(1280) 확인**

상세 페이지를 1280px 폭으로 열고 확인:
- "임장ON에서 더 살펴보기" 섹션과 그 아래 "임장ON 브리핑"(최신글 카드)이 보인다.
- 실거래가 타일(거래건수·최고가·인기지역), 이번 주 청약(있으면), 서민금융 연관 카드(있으면), 생활편의 안내 카드가 보인다.
- 하단 출처 캡션이 보인다.
- 콘솔 에러 없음.

- [ ] **Step 4: 모바일(390) + 태블릿(768) 확인**

뷰포트를 390px, 768px로 바꿔 각각 스크린샷:
- 가로 스크롤 없음(문서 폭 ≤ 뷰포트).
- 디스커버리 카드가 1단으로 스택, 서민금융은 768에서 2단.
- 토픽 헤더의 "더 보기" 링크가 좁은 폭에서 줄바꿈되며 잘리지 않음.
- 읽는 텍스트가 14px 이상(타일 값·생활편의 문구).

- [ ] **Step 5: 데이터 없음 경로(스모크) 확인**

콘솔에 `[board-detail] ... teaser fetch failed` 류 에러가 떠도 페이지는 정상 렌더되는지(해당 카드만 빠짐) 확인. (강제 실패 주입은 불필요 — 코드상 각 조회가 `null`/`[]`로 폴백.)

- [ ] **Step 6: 문제 있으면 수정 후 커밋, 없으면 종료**

발견된 레이아웃/오버플로 문제만 surgical하게 수정하고:

```bash
git add -A
git commit -m "fix(jeonse): 디스커버리 섹션 반응형 보정

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

문제 없으면 커밋 없이 dev 서버 종료.

---

## Self-Review

**1. Spec coverage**

| 스펙 요구 | 구현 위치 |
|---|---|
| 실거래가 카드(전국 브리핑) | Task 2 `TransactionTeaserCard` + Task 3 `getTransactionTeaser` |
| 청약 카드 | Task 2 `SubscriptionBoardItem` 재사용 + Task 3 `getWeeklySubscriptions`+`flattenWeeklyBoard` |
| 다른 서민금융 대출상품 카드 | Task 1 `relatedLoansForJeonse` + Task 2 `RelatedLoanCard` |
| 생활편의 안내 카드(/life) | Task 2 `LifeNavCard` |
| 임장ON 브리핑 4건 | Task 3 `BoardBriefingSection heading="임장ON 브리핑"` |
| 실패 시 카드만 빠짐 | Task 3 `.catch` 폴백 + Task 2 `has*` 가드 |
| 모바일/반응형 | Task 2 grid-cols-1→sm/lg, wrap 헤더, 14px floor / Task 4 검증 |
| 디자인 토큰·SourceCaption | Task 2 CSS 변수·`SourceCaption ids=[...]` |
| 출처 4종 | Task 2 `['molit-rtms','applyhome','lh-presub','kinfa-loan']` |

> **스펙과의 의도적 차이:** 스펙 §5.2는 청약을 `getSubscriptionTeaser()`(가장 가까운 1건)로 적었으나, `SubscriptionBoardItem`이 받는 타입은 `WeeklyBoardItem`이라 `getSubscriptionTeaser`의 `SubscriptionListItem`과 비호환. 따라서 `LoanDiscoverySection`과 동일하게 `getWeeklySubscriptions()`+`flattenWeeklyBoard()`('이번 주 청약')를 쓴다 — 타입 호환·DRY·검증된 경로. 표시 단위가 "이번 주" 기준으로 바뀌며 없으면 서브섹션 숨김.

**2. Placeholder scan:** TBD/TODO/“적절히 처리” 없음. 모든 코드 스텝에 실제 코드 포함. ✅

**3. Type consistency:** `relatedLoansForJeonse(product, allLoans, 3)` 시그니처가 Task 1 정의와 Task 3 호출에서 일치. `JeonseDiscoverySection` props(`briefing`/`weeklySubscriptions`/`relatedLoans`)가 Task 2 정의와 Task 3 호출에서 일치. `WeeklyBoardItem`/`RelatedLoan`/`MarketBriefing` 타입 출처 일치. ✅

**4. 검증 게이트:** Task 1 vitest 통과 / Task 3 typecheck+lint 통과 / Task 4 시각·반응형 확인. (full `next build`는 운영 DB 접속·장시간이라 게이트에서 제외; typecheck+lint+단위테스트+시각검증으로 대체.)
