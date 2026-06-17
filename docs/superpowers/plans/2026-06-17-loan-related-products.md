# 대출상품 상세 — 조건 기반 추천 섹션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서민금융 대출상품 상세 하단에, 현재 상품과 목적·대상·지역이 비슷한 다른 상품을 점수화해 최대 4개 노출하는 추천 섹션을 추가한다.

**Architecture:** 순수 함수 `recommendLoans`(DB 무관)가 기존 파생 카테고리(`usageSlugs`/`targetSlugs`)+지역+한도로 유사도를 점수화한다. 상세 페이지가 전체 상품 요약(`getLoanSummaries`)을 로드해 함수에 넘기고, 결과를 전용 카드/섹션 컴포넌트로 렌더한다. 스키마·ingest 변경 없음.

**Tech Stack:** Next.js(App Router, RSC) · TypeScript · Vitest · Tailwind(디자인 토큰 CSS 변수).

설계 출처: `docs/superpowers/specs/2026-06-17-loan-related-products-design.md`.

---

## File Structure

- **Create** `lib/loan/related.ts` — 순수 추천 로직(`recommendLoans`, 타입, `MAX_RELATED`). prisma 의존 없음(`LoanSummary`는 `import type`).
- **Create** `tests/lib/loan-related.test.ts` — `recommendLoans` 단위 테스트.
- **Create** `app/(public)/finance/[seq]/_components/related-loan-card.tsx` — 단일 추천 카드.
- **Create** `app/(public)/finance/[seq]/_components/related-loans.tsx` — 섹션 래퍼(헤더·그리드·출처·빈 상태).
- **Modify** `app/(public)/finance/[seq]/page.tsx` — 요약 로드 + `recommendLoans` 호출 + 섹션 렌더.

기존 `lib/loan/categories.ts`(USAGE/TARGET 카테고리·`usageSlugs`/`targetSlugs`)와 `lib/loan/list.ts`(`LoanSummary`·`getLoanSummaries`), `components/ui/badge.tsx`(`Badge tone="blue"`)를 재사용한다.

---

### Task 1: `recommendLoans` 순수 함수 (TDD)

**Files:**
- Create: `lib/loan/related.ts`
- Test: `tests/lib/loan-related.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/loan-related.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { recommendLoans } from '@/lib/loan/related';
import type { LoanSummary } from '@/lib/loan/list';

function row(p: Partial<LoanSummary> & { seq: number }): LoanSummary {
  return {
    finprdnm: `상품${p.seq}`,
    ofrinstnm: null,
    instCtg: null,
    lnlmt: null,
    irt: null,
    usageTags: [],
    targetTags: [],
    regionTags: [],
    ...p,
  };
}

// P(seq 1): 주거(house) + 청년(youth) + 서울
const rows: LoanSummary[] = [
  row({ seq: 1, usageTags: ['주거'], targetTags: ['청년'], regionTags: ['서울'], lnlmt: 3000 }),
  row({ seq: 2, usageTags: ['전세'], targetTags: ['청년'], regionTags: ['서울'], lnlmt: 3200, irt: '연 1.2~2.1%' }), // house+youth+region → 5
  row({ seq: 3, usageTags: ['주거'], targetTags: ['근로자'], regionTags: ['부산'], lnlmt: 9000 }), // house만 → 2
  row({ seq: 4, usageTags: ['창업'], targetTags: ['소상공인'], regionTags: ['서울'], lnlmt: 5000 }), // 지역만 → 비자격
  row({ seq: 7, usageTags: ['월세'], targetTags: ['청년'], regionTags: ['대구'], lnlmt: 3050 }), // house+youth → 4
];

describe('recommendLoans', () => {
  it('현재 상품을 결과에서 제외한다', () => {
    const r = recommendLoans(rows[0], rows);
    expect(r.some((x) => x.seq === 1)).toBe(false);
  });

  it('점수 내림차순(목적·대상·지역)으로 정렬하고 자격 미달은 제외한다', () => {
    const r = recommendLoans(rows[0], rows);
    expect(r.map((x) => x.seq)).toEqual([2, 7, 3]); // seq4(지역만)는 제외
  });

  it('지역·한도만 겹치면 제외한다', () => {
    const r = recommendLoans(rows[0], rows);
    expect(r.some((x) => x.seq === 4)).toBe(false);
  });

  it('max 개수로 자른다', () => {
    const r = recommendLoans(rows[0], rows, 2);
    expect(r.map((x) => x.seq)).toEqual([2, 7]);
  });

  it("target 'etc'만 공유하면 제외한다", () => {
    const p = row({ seq: 10, targetTags: ['미분류항목'] }); // → etc
    const c = row({ seq: 11, targetTags: ['또다른미분류'] }); // → etc
    expect(recommendLoans(p, [p, c])).toEqual([]);
  });

  it('자격 후보가 없으면 빈 배열', () => {
    const p = row({ seq: 20, usageTags: ['주거'], targetTags: ['청년'] });
    const c = row({ seq: 21, usageTags: ['창업'], targetTags: ['소상공인'] });
    expect(recommendLoans(p, [p, c])).toEqual([]);
  });

  it('reasons는 usage 우선·최대 2개', () => {
    const r = recommendLoans(rows[0], rows);
    const c2 = r.find((x) => x.seq === 2)!;
    expect(c2.reasons.map((x) => x.label)).toEqual([
      '같은 목적·주거·전월세',
      '같은 대상·청년·대학생',
    ]);
  });

  it('summaryLine은 usage·target 라벨 조합', () => {
    const r = recommendLoans(rows[0], rows);
    const c2 = r.find((x) => x.seq === 2)!;
    expect(c2.summaryLine).toBe('주거·전월세 · 청년·대학생 대상');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/loan-related.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/loan/related"` (모듈 없음).

- [ ] **Step 3: Write minimal implementation**

Create `lib/loan/related.ts`:

```ts
import {
  USAGE_CATEGORIES,
  TARGET_CATEGORIES,
  usageSlugs,
  targetSlugs,
  type CategoryDef,
} from './categories';
import type { LoanSummary } from './list';

export const MAX_RELATED = 4;

export interface RelatedLoanReason {
  kind: 'usage' | 'target' | 'region';
  label: string;
}

export interface RelatedLoan extends LoanSummary {
  reasons: RelatedLoanReason[];
  summaryLine: string;
}

function labelOf(slug: string, defs: CategoryDef[]): string {
  return defs.find((d) => d.slug === slug)?.label ?? slug;
}

// targetSlugs는 미분류 시 'etc'로 폴백한다. 'etc'는 의미 있는 공통점이 아니므로 매칭에서 뺀다.
function meaningfulTargetSlugs(tags: string[]): string[] {
  return targetSlugs(tags).filter((s) => s !== 'etc');
}

function intersect(values: string[], set: Set<string>): string[] {
  return values.filter((v) => set.has(v));
}

function summaryLineFor(item: LoanSummary): string {
  const usageLabels = usageSlugs(item.usageTags).map((s) => labelOf(s, USAGE_CATEGORIES));
  const targetLabels = meaningfulTargetSlugs(item.targetTags).map((s) =>
    labelOf(s, TARGET_CATEGORIES),
  );
  const parts: string[] = [];
  if (usageLabels.length) parts.push(usageLabels.join('·'));
  if (targetLabels.length) parts.push(`${targetLabels.join('·')} 대상`);
  return parts.length ? parts.join(' · ') : (item.ofrinstnm ?? '서민금융 대출상품');
}

export function recommendLoans(
  current: LoanSummary,
  all: LoanSummary[],
  max: number = MAX_RELATED,
): RelatedLoan[] {
  const pUsage = new Set(usageSlugs(current.usageTags));
  const pTarget = new Set(meaningfulTargetSlugs(current.targetTags));
  const pRegion = new Set(current.regionTags);

  interface Scored {
    item: LoanSummary;
    score: number;
    lnlmtDelta: number;
    reasons: RelatedLoanReason[];
  }
  const scored: Scored[] = [];

  for (const c of all) {
    if (c.seq === current.seq) continue;

    const sharedUsage = intersect(usageSlugs(c.usageTags), pUsage);
    const sharedTarget = intersect(meaningfulTargetSlugs(c.targetTags), pTarget);
    if (sharedUsage.length + sharedTarget.length < 1) continue; // 자격: usage/target 최소 1 공유

    const sharedRegion = c.regionTags.some((r) => pRegion.has(r));
    const score = 2 * sharedUsage.length + 2 * sharedTarget.length + (sharedRegion ? 1 : 0);
    const lnlmtDelta =
      current.lnlmt != null && c.lnlmt != null
        ? Math.abs(current.lnlmt - c.lnlmt)
        : Number.POSITIVE_INFINITY;

    const reasons: RelatedLoanReason[] = [
      ...sharedUsage.map(
        (s): RelatedLoanReason => ({ kind: 'usage', label: `같은 목적·${labelOf(s, USAGE_CATEGORIES)}` }),
      ),
      ...sharedTarget.map(
        (s): RelatedLoanReason => ({ kind: 'target', label: `같은 대상·${labelOf(s, TARGET_CATEGORIES)}` }),
      ),
      ...(sharedRegion ? [{ kind: 'region', label: '같은 지역' } as RelatedLoanReason] : []),
    ].slice(0, 2);

    scored.push({ item: c, score, lnlmtDelta, reasons });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.lnlmtDelta - b.lnlmtDelta ||
      a.item.finprdnm.localeCompare(b.item.finprdnm, 'ko'),
  );

  return scored.slice(0, max).map((s) => ({
    ...s.item,
    reasons: s.reasons,
    summaryLine: summaryLineFor(s.item),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/loan-related.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/loan/related.ts tests/lib/loan-related.test.ts
git commit -m "feat(finance): 대출상품 유사도 추천 순수 함수 recommendLoans"
```

---

### Task 2: 추천 카드·섹션 컴포넌트

**Files:**
- Create: `app/(public)/finance/[seq]/_components/related-loan-card.tsx`
- Create: `app/(public)/finance/[seq]/_components/related-loans.tsx`

> 기존 `_components/loan-card.tsx`에 단위 테스트가 없는 패턴을 따른다(컴포넌트는 typecheck + Task 4의 실렌더로 검증).

- [ ] **Step 1: Create the card component**

Create `app/(public)/finance/[seq]/_components/related-loan-card.tsx`:

```tsx
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { RelatedLoan } from '@/lib/loan/related';

export function RelatedLoanCard({ item }: { item: RelatedLoan }) {
  return (
    <Link href={`/finance/${item.seq}`} className="block">
      <article className="h-full rounded-[22px] border border-[var(--color-line)] bg-white px-6 py-5 shadow-[var(--shadow-soft)] transition hover:shadow-lg">
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
        <p className="text-sm text-[var(--color-muted)]">{item.summaryLine}</p>
        {item.irt && <p className="mt-1 text-sm text-[var(--color-muted)]">금리 {item.irt}</p>}
        {item.reasons.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.reasons.map((r) => (
              <Badge key={r.label} tone="blue">
                {r.label}
              </Badge>
            ))}
          </div>
        )}
      </article>
    </Link>
  );
}
```

- [ ] **Step 2: Create the section component**

Create `app/(public)/finance/[seq]/_components/related-loans.tsx`:

```tsx
import { SourceCaption } from '@/components/ui/source-caption';
import type { RelatedLoan } from '@/lib/loan/related';
import { RelatedLoanCard } from './related-loan-card';

export function RelatedLoans({ items }: { items: RelatedLoan[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">함께 비교할 만한 상품</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <RelatedLoanCard key={item.seq} item={item} />
        ))}
      </div>
      <div className="mt-4">
        <SourceCaption ids={['kinfa-loan']} />
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          추천 순서는 임장온이 공개 태그(목적·대상·지역)로 산정했습니다.
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add "app/(public)/finance/[seq]/_components/related-loan-card.tsx" "app/(public)/finance/[seq]/_components/related-loans.tsx"
git commit -m "feat(finance): 추천 상품 카드·섹션 컴포넌트"
```

---

### Task 3: 상세 페이지 연결

**Files:**
- Modify: `app/(public)/finance/[seq]/page.tsx`

- [ ] **Step 1: Add imports**

`app/(public)/finance/[seq]/page.tsx`의 import 블록(상단)에 세 줄을 추가한다. `import { LoanSidebar } ...` 다음에:

```tsx
import { LoanSidebar } from './_components/loan-sidebar';
import { getLoanSummaries } from '@/lib/loan/list';
import { recommendLoans, MAX_RELATED } from '@/lib/loan/related';
import { RelatedLoans } from './_components/related-loans';
```

- [ ] **Step 2: Compute recommendations**

`LoanDetailPage` 본문에서 `const rltsite = ...` 줄 바로 다음에 한 줄 추가한다:

```tsx
  const rltsite = isDisplayable(raw.rltsite) ? String(raw.rltsite) : null;
  const related = recommendLoans(product, await getLoanSummaries(), MAX_RELATED);
```

> `product`(Prisma `LoanProduct`)는 `LoanSummary`의 모든 필드를 구조적으로 포함하므로 그대로 인자로 넘길 수 있다.

- [ ] **Step 3: Render the section**

본문 마지막 그리드(`<main>`+`<aside>`)를 닫는 `</div>` 다음, 페이지 컨테이너를 닫는 `</div>` 앞에 섹션을 삽입한다. 기존:

```tsx
        <aside className="min-w-0">
          <LoanSidebar product={product} rltsite={rltsite} />
        </aside>
      </div>
    </div>
  );
```

변경 후:

```tsx
        <aside className="min-w-0">
          <LoanSidebar product={product} rltsite={rltsite} />
        </aside>
      </div>

      <RelatedLoans items={related} />
    </div>
  );
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add "app/(public)/finance/[seq]/page.tsx"
git commit -m "feat(finance): 상세 페이지에 조건 기반 추천 섹션 연결"
```

---

### Task 4: 전체 검증

**Files:** (없음 — 검증 전용)

- [ ] **Step 1: Unit tests**

Run: `pnpm exec vitest run tests/lib/loan-related.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: 신규 파일 관련 에러 없음.

- [ ] **Step 4: (선택) 실렌더 확인**

`NEXT_PUBLIC_BOARD_ENABLED`와 무관. 운영 데이터로 dev를 띄워 임의 `/finance/<seq>` 상세 하단에 "함께 비교할 만한 상품" 섹션이 뜨는지 육안 확인:

```bash
pnpm dev
# 브라우저에서 /finance 목록 → 아무 상품 상세 진입 → 하단 섹션 확인
```

후보가 0개인 상품에선 섹션이 보이지 않아야 정상.

---

## Self-Review

**Spec coverage:**
- 매칭 로직(usage·target·지역·한도, etc 제외, 자격·정렬·max) → Task 1.
- reasons(최대 2·usage 우선)·summaryLine(태그 조합·폴백) → Task 1.
- 카드 표시 항목(상품명·한도·금리·요약·배지) → Task 2 카드.
- 섹션(헤더·그리드·빈 상태·출처 캡션+산정 주석) → Task 2 섹션.
- 페이지 하단 전체 폭 연결 → Task 3.
- 테스트 → Task 1 + Task 4.
- 범위 밖(age/incm 파싱·스키마/ingest 변경 없음) → 플랜에서 다루지 않음(준수).

**Placeholder scan:** 모든 코드/명령 블록은 실제 내용. "TBD/적절히 처리" 없음.

**Type consistency:** `RelatedLoan`/`RelatedLoanReason`/`MAX_RELATED`/`recommendLoans`가 Task 1 정의와 Task 2·3 사용에서 동일. `Badge tone="blue"`는 `components/ui/badge.tsx`의 `Tone` 유니온과 일치. `SourceCaption ids={['kinfa-loan']}`는 기존 상세 페이지와 동일 키.
