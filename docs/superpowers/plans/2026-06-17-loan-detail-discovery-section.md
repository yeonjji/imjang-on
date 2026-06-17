# 대출 상세 디스커버리 섹션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서민대출 상세 페이지 하단에 "임장온에서 더 살펴보기" 섹션(인기 지역 pill + 이번 주 청약 리스트)을 추가해 인접 콘텐츠로 안내한다.

**Architecture:** 순수 로직(지역 스코프 해석·주간보드 평탄화)은 단위 테스트로 TDD, DB 쿼리(`getPopularSigungusBySido`·`getLoanDiscovery`)는 기존 `getPopularSigungus` 패턴을 미러링하고 tsc + 로컬 렌더로 검증한다. 상품 `regionTags`에 시도가 있으면 그 시도 인기 시군구를, 없거나 데이터가 비면 기존 전국 스냅샷을 보여준다. 청약은 기존 `getWeeklySubscriptions()`를 평탄화해 전국 고정으로 노출한다.

**Tech Stack:** Next.js (App Router, ISR), Prisma(PostgreSQL), Vitest, Tailwind(CSS 변수 토큰).

**참조 스펙:** `docs/superpowers/specs/2026-06-17-loan-detail-discovery-section-design.md`

---

## File Structure

**Create**
- `lib/loan/discovery.ts` — 지역 스코프 해석(순수) + `getLoanDiscovery` 오케스트레이터 + 타입.
- `app/(public)/finance/[seq]/_components/loan-discovery-section.tsx` — 프레젠테이션 컴포넌트(서버).
- `tests/lib/loan-discovery.test.ts` — `resolveLoanRegionScope` 단위 테스트.
- `tests/lib/subscription-flatten.test.ts` — `flattenWeeklyBoard` 단위 테스트.

**Modify**
- `lib/region.ts` — `getPopularSigungusBySido(sidos, limit)` 추가.
- `lib/subscription.ts` — `flattenWeeklyBoard(board, limit)` 추가.
- `app/(public)/finance/[seq]/page.tsx` — `getLoanDiscovery` 호출 + `<LoanDiscoverySection />` 렌더.

**검증 명령(공통)**
- 타입 체크: `pnpm exec tsc --noEmit`
- 단일 테스트: `pnpm exec dotenv -e .env.test -- vitest run <파일>` (lib import 시 prisma 로드 때문에 env 필요)
- 전체 단위: `pnpm test:unit`

---

## Task 1: 지역 스코프 해석 (순수 함수, TDD)

`regionTags`에서 실제 시도만 추려 라벨을 만든다. `"전국"`·`"전국(농어촌)"`은 `sidoPrefix`가 `undefined`라 자연 제외된다.

**Files:**
- Create: `lib/loan/discovery.ts`
- Test: `tests/lib/loan-discovery.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/lib/loan-discovery.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveLoanRegionScope } from '@/lib/loan/discovery';

describe('resolveLoanRegionScope', () => {
  it('전국 태그는 시도 없음 + 라벨 "전국"', () => {
    expect(resolveLoanRegionScope(['전국'])).toEqual({ specificSidos: [], label: '전국' });
  });

  it('단일 시도는 그대로', () => {
    expect(resolveLoanRegionScope(['강원'])).toEqual({ specificSidos: ['강원'], label: '강원' });
  });

  it('두 시도는 가운뎃점으로 결합', () => {
    expect(resolveLoanRegionScope(['경남', '울산'])).toEqual({
      specificSidos: ['경남', '울산'],
      label: '경남·울산',
    });
  });

  it('세 시도 이상은 "첫시도 외"로 절단', () => {
    const r = resolveLoanRegionScope(['서울', '경기', '인천']);
    expect(r.specificSidos).toEqual(['서울', '경기', '인천']);
    expect(r.label).toBe('서울 외');
  });

  it('전국(농어촌)은 시도가 아니므로 전국', () => {
    expect(resolveLoanRegionScope(['전국(농어촌)'])).toEqual({ specificSidos: [], label: '전국' });
  });

  it('전국+시도 혼합은 시도만 추린다', () => {
    expect(resolveLoanRegionScope(['전국', '강원'])).toEqual({ specificSidos: ['강원'], label: '강원' });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/loan-discovery.test.ts`
Expected: FAIL — `resolveLoanRegionScope`가 `@/lib/loan/discovery`에 없음(모듈/Export 없음).

- [ ] **Step 3: 최소 구현**

Create `lib/loan/discovery.ts`:

```ts
import { sidoPrefix } from '@/lib/region';

export interface ResolvedRegionScope {
  /** regionTags 중 실제 시도(단축명)만. 비어 있으면 전국. */
  specificSidos: string[];
  /** 헤더 라벨. 예: '강원', '경남·울산', '서울 외', '전국'. */
  label: string;
}

const MAX_LABEL_SIDOS = 2;

export function resolveLoanRegionScope(regionTags: string[]): ResolvedRegionScope {
  const specificSidos = regionTags.filter((t) => sidoPrefix(t) !== undefined);
  const label =
    specificSidos.length === 0
      ? '전국'
      : specificSidos.length > MAX_LABEL_SIDOS
        ? `${specificSidos[0]} 외`
        : specificSidos.join('·');
  return { specificSidos, label };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/loan-discovery.test.ts`
Expected: PASS (6 passed)

- [ ] **Step 5: 커밋**

```bash
git add lib/loan/discovery.ts tests/lib/loan-discovery.test.ts
git commit -m "feat(finance): 대출 지역 스코프 해석 순수 함수 resolveLoanRegionScope

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 시도별 인기 시군구 쿼리 (DB)

`getPopularSigungus`(전국, Transaction 집계)를 미러링하되, 사전계산된 `Property.txCount12m`를 시도 prefix로 좁혀 가볍게 집계한다. DB 함수라 단위 테스트는 두지 않고(기존 `getPopularSigungus`도 동일) tsc + Task 6 렌더로 검증한다.

**Files:**
- Modify: `lib/region.ts` (파일 끝, `getPopularSigungus` 아래에 추가)

- [ ] **Step 1: 구현 추가**

`lib/region.ts` 끝에 추가(기존 `prisma`, `stripSido`, `sidoPrefix`, `sidoFromPrefix`, `PopularRegion`을 그대로 사용):

```ts
/**
 * 특정 시도(들)에 한정한 인기 시군구 상위 N개.
 * 무거운 Transaction 집계 대신 사전계산된 Property.txCount12m를 시도 prefix로 좁혀 합산한다.
 * 결과 형태는 getPopularSigungus와 동일(PopularRegion).
 */
export async function getPopularSigungusBySido(
  sidos: string[],
  limit = 6,
): Promise<PopularRegion[]> {
  const prefixes = sidos
    .map((s) => sidoPrefix(s))
    .filter((p): p is string => p !== undefined);
  if (prefixes.length === 0) return [];

  const grouped = await prisma.property.groupBy({
    by: ['sigunguCode'],
    where: {
      txCount12m: { gt: 0 },
      OR: prefixes.map((p) => ({ sigunguCode: { startsWith: p } })),
    },
    _sum: { txCount12m: true },
    orderBy: { _sum: { txCount12m: 'desc' } },
    take: limit,
  });

  const codes = grouped
    .map((g) => g.sigunguCode)
    .filter((c): c is string => c !== null);
  if (codes.length === 0) return [];

  // 일반구 통합시 라벨링은 getPopularSigungus와 동일(level-2 + 일반구 level-3 …00000, 읍면동 제외).
  const regions = await prisma.region.findMany({
    where: {
      sigunguCode: { in: codes },
      isAbolished: false,
      OR: [{ level: 2 }, { level: 3, code: { endsWith: '00000' } }],
    },
    select: { sigunguCode: true, fullName: true },
  });
  const labelByCode = new Map(
    regions
      .filter((r): r is typeof r & { sigunguCode: string } => r.sigunguCode !== null)
      .map((r) => [r.sigunguCode, stripSido(r.fullName)]),
  );

  const result: PopularRegion[] = [];
  for (const code of codes) {
    const sigungu = labelByCode.get(code);
    const sido = sidoFromPrefix(code.slice(0, 2));
    if (!sigungu || !sido) continue;
    result.push({ sigunguCode: code, sido, sigungu });
  }
  return result;
}
```

- [ ] **Step 2: 타입 체크**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음(exit 0). (`prisma.property.groupBy`의 `_sum`/`orderBy` 시그니처, `PopularRegion` 반환 일치 확인.)

- [ ] **Step 3: 커밋**

```bash
git add lib/region.ts
git commit -m "feat(region): 시도별 인기 시군구 쿼리 getPopularSigungusBySido

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 주간 청약 보드 평탄화 (순수 함수, TDD)

`getWeeklySubscriptions()`가 만드는 `WeeklyBoard`(일자 버킷)를 컴팩트 리스트로 펼친다. 진행중·예정 우선(`TONE_ORDER`)으로 정렬하고 id로 중복 제거 후 상위 N개. `TONE_ORDER`가 `lib/subscription.ts`의 모듈-프라이빗이라 함수도 같은 파일에 둔다.

**Files:**
- Modify: `lib/subscription.ts` (`assembleWeeklyBoard` 아래에 추가)
- Test: `tests/lib/subscription-flatten.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/lib/subscription-flatten.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { flattenWeeklyBoard, type WeeklyBoard, type WeeklyBoardItem } from '@/lib/subscription';

function item(p: Partial<WeeklyBoardItem> & { id: string; tone: WeeklyBoardItem['tone'] }): WeeklyBoardItem {
  return { name: `청약${p.id}`, regionShort: null, badge: '', ...p };
}

function board(itemsByDay: WeeklyBoardItem[][]): WeeklyBoard {
  const d = new Date(Date.UTC(2026, 5, 17));
  return {
    weekStart: d,
    weekEnd: d,
    days: itemsByDay.map((items) => ({ date: d, weekday: '수', isToday: false, items, overflow: 0 })),
    summary: { open: 0, upcoming: 0, closed: 0 },
    total: itemsByDay.flat().length,
  };
}

describe('flattenWeeklyBoard', () => {
  it('진행중·예정 우선(orange→green→blue→gray)으로 정렬한다', () => {
    const b = board([
      [item({ id: '1', tone: 'blue' }), item({ id: '2', tone: 'gray' })],
      [item({ id: '3', tone: 'orange' }), item({ id: '4', tone: 'green' })],
    ]);
    expect(flattenWeeklyBoard(b, 10).map((i) => i.id)).toEqual(['3', '4', '1', '2']);
  });

  it('여러 날에 걸친 동일 id는 한 번만 포함한다', () => {
    const b = board([
      [item({ id: '1', tone: 'green' })],
      [item({ id: '1', tone: 'green' }), item({ id: '2', tone: 'green' })],
    ]);
    expect(flattenWeeklyBoard(b, 10).map((i) => i.id)).toEqual(['1', '2']);
  });

  it('limit으로 상위 N개만 반환한다', () => {
    const b = board([
      [item({ id: '1', tone: 'orange' }), item({ id: '2', tone: 'green' }), item({ id: '3', tone: 'blue' })],
    ]);
    expect(flattenWeeklyBoard(b, 2).map((i) => i.id)).toEqual(['1', '2']);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/subscription-flatten.test.ts`
Expected: FAIL — `flattenWeeklyBoard`가 `@/lib/subscription`에 없음.

- [ ] **Step 3: 최소 구현**

`lib/subscription.ts`의 `assembleWeeklyBoard` 함수 정의 **뒤**에 추가(`TONE_ORDER`는 같은 모듈 상단에 이미 정의됨):

```ts
/**
 * 주간 보드(일자 버킷)를 컴팩트 리스트로 평탄화한다.
 * 진행중·예정 우선(TONE_ORDER) 정렬 후 id 중복 제거, 상위 limit개.
 */
export function flattenWeeklyBoard(board: WeeklyBoard, limit: number): WeeklyBoardItem[] {
  const seen = new Set<string>();
  const items: WeeklyBoardItem[] = [];
  for (const day of board.days) {
    for (const it of day.items) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      items.push(it);
    }
  }
  items.sort(
    (a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || a.name.localeCompare(b.name, 'ko'),
  );
  return items.slice(0, limit);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/subscription-flatten.test.ts`
Expected: PASS (3 passed)

- [ ] **Step 5: 커밋**

```bash
git add lib/subscription.ts tests/lib/subscription-flatten.test.ts
git commit -m "feat(subscription): 주간 보드 평탄화 헬퍼 flattenWeeklyBoard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 디스커버리 오케스트레이터 (DB)

지역 해석 + 인기 시군구(지역/전국 폴백) + 이번 주 청약을 하나로 묶는다. 각 쿼리는 실패해도 페이지를 죽이지 않도록 `safe`로 폴백.

**Files:**
- Modify: `lib/loan/discovery.ts` (Task 1에서 만든 파일에 타입·오케스트레이터 추가)

- [ ] **Step 1: import 및 타입 추가**

`lib/loan/discovery.ts` 상단 import 줄을 아래로 교체:

```ts
import { sidoPrefix, getPopularSigungusBySido, type PopularRegion } from '@/lib/region';
import { readHomeSnapshot } from '@/lib/dashboard-snapshot';
import {
  getWeeklySubscriptions,
  flattenWeeklyBoard,
  type WeeklyBoard,
  type WeeklyBoardItem,
} from '@/lib/subscription';
```

파일 하단(`resolveLoanRegionScope` 아래)에 타입·함수 추가:

```ts
export interface LoanDiscoveryRegionScope {
  label: string;
  isNationwide: boolean;
  /** "실거래가 더 보기" 링크용 첫 시도 단축명. 전국이면 null. */
  sido: string | null;
}

export interface LoanDiscovery {
  regionScope: LoanDiscoveryRegionScope;
  popularRegions: PopularRegion[];
  weeklySubscriptions: WeeklyBoardItem[];
}

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.error('[loan-discovery] fetch failed, using fallback', err);
    return fallback;
  }
}

export async function getLoanDiscovery(product: { regionTags: string[] }): Promise<LoanDiscovery> {
  const resolved = resolveLoanRegionScope(product.regionTags);

  let popularRegions: PopularRegion[] = [];
  if (resolved.specificSidos.length > 0) {
    popularRegions = await safe(getPopularSigungusBySido(resolved.specificSidos, 6), []);
  }

  let regionScope: LoanDiscoveryRegionScope;
  if (popularRegions.length > 0) {
    regionScope = { label: resolved.label, isNationwide: false, sido: resolved.specificSidos[0] };
  } else {
    const snapshot = await safe(readHomeSnapshot(), { briefing: null, popularRegions: [] });
    popularRegions = snapshot.popularRegions.slice(0, 6);
    regionScope = { label: '전국', isNationwide: true, sido: null };
  }

  const board = await safe<WeeklyBoard | null>(getWeeklySubscriptions(), null);
  const weeklySubscriptions = board ? flattenWeeklyBoard(board, 4) : [];

  return { regionScope, popularRegions, weeklySubscriptions };
}
```

- [ ] **Step 2: 타입 체크 + 기존 단위 테스트 회귀**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음(exit 0).

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/loan-discovery.test.ts`
Expected: PASS (Task 1 테스트 6개 여전히 통과 — import 추가가 깨뜨리지 않음).

- [ ] **Step 3: 커밋**

```bash
git add lib/loan/discovery.ts
git commit -m "feat(finance): 대출 디스커버리 오케스트레이터 getLoanDiscovery

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 디스커버리 섹션 컴포넌트

세로 2단(인기 지역 pill → 구분선 → 이번 주 청약 리스트)을 옅은 틴트 컨테이너에 담는다. 청약 아이템은 기존 `SubscriptionBoardItem` 재사용.

**Files:**
- Create: `app/(public)/finance/[seq]/_components/loan-discovery-section.tsx`

- [ ] **Step 1: 컴포넌트 작성**

Create `app/(public)/finance/[seq]/_components/loan-discovery-section.tsx`:

```tsx
import Link from 'next/link';
import { SourceCaption } from '@/components/ui/source-caption';
import { SubscriptionBoardItem } from '@/app/(public)/_components/subscription-board-item';
import type { LoanDiscovery } from '@/lib/loan/discovery';

export function LoanDiscoverySection({ discovery }: { discovery: LoanDiscovery }) {
  const { regionScope, popularRegions, weeklySubscriptions } = discovery;
  const hasRegions = popularRegions.length > 0;
  const hasSubs = weeklySubscriptions.length > 0;
  if (!hasRegions && !hasSubs) return null;

  const moreHref = regionScope.sido ? `/list?sido=${encodeURIComponent(regionScope.sido)}` : '/list';

  return (
    <section className="mt-10 rounded-[22px] bg-[var(--color-soft)] p-6">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">임장온에서 더 살펴보기</h2>

      {hasRegions && (
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-[var(--color-text)]">{regionScope.label} 인기 지역</h3>
            <Link href={moreHref} className="shrink-0 text-xs font-bold text-[var(--color-blue)]">
              실거래가 더 보기 →
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {popularRegions.map((r) => (
              <Link
                key={r.sigunguCode}
                href={`/list?sido=${encodeURIComponent(r.sido)}&region=${encodeURIComponent(r.sigunguCode)}`}
                className="rounded-full border border-[var(--color-line)] bg-white px-3 py-2 text-xs font-bold text-[var(--color-blue-dark)] transition hover:border-[var(--color-blue)]"
              >
                {r.sigungu}
              </Link>
            ))}
          </div>
        </div>
      )}

      {hasRegions && <div className="my-5 border-t border-[var(--color-line)]" />}

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-[var(--color-text)]">이번 주 청약</h3>
          <Link href="/subscription" className="shrink-0 text-xs font-bold text-[var(--color-blue)]">
            전체 청약 →
          </Link>
        </div>
        {hasSubs ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {weeklySubscriptions.map((item) => (
              <SubscriptionBoardItem key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <p className="text-sm font-medium text-[var(--color-muted)]">이번 주 예정된 청약이 없습니다.</p>
        )}
      </div>

      <div className="mt-5">
        <SourceCaption ids={['molit-rtms', 'applyhome', 'lh-presub']} />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음. (`SubscriptionBoardItem`의 `item: WeeklyBoardItem` prop, `SourceCaption`의 `ids` prop, `LoanDiscovery` 타입 일치 확인.)

- [ ] **Step 3: 커밋**

```bash
git add "app/(public)/finance/[seq]/_components/loan-discovery-section.tsx"
git commit -m "feat(finance): 대출 상세 디스커버리 섹션 컴포넌트

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 페이지 연결 + 렌더 검증

상세 페이지 `<main>` 컬럼 맨 아래(`RelatedLoans` 다음)에 섹션을 붙이고, 로컬 dev에서 실제 렌더를 확인한다.

**Files:**
- Modify: `app/(public)/finance/[seq]/page.tsx`

- [ ] **Step 1: import 추가**

`page.tsx` 상단 import 블록에서 `RelatedLoans` import 아래에 추가:

```ts
import { getLoanDiscovery } from '@/lib/loan/discovery';
import { LoanDiscoverySection } from './_components/loan-discovery-section';
```

- [ ] **Step 2: 데이터 호출 추가**

`page.tsx`의 `const related = recommendLoans(product, await getLoanSummaries(), MAX_RELATED);` **다음 줄**에 추가:

```ts
  const discovery = await getLoanDiscovery(product);
```

- [ ] **Step 3: 렌더 추가**

`<main>` 안의 `<RelatedLoans items={related} />` **바로 다음 줄**에 추가:

```tsx
          <LoanDiscoverySection discovery={discovery} />
```

(닫는 `</main>` 직전이 된다.)

- [ ] **Step 4: 타입 체크**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음(exit 0).

- [ ] **Step 5: 로컬 렌더 검증**

```bash
pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null; sleep 1
(pnpm dev > /tmp/imjang_dev.log 2>&1 &)
for i in $(seq 1 40); do grep -qiE "Ready in" /tmp/imjang_dev.log 2>/dev/null && { echo "READY ${i}s"; break; }; sleep 1; done
# 지역 상품(시도 태그)과 전국 상품 각각 한 건씩 확인:
curl -s "http://localhost:3000/finance/1" -o /tmp/finance1.html -w "HTTP %{http_code}\n"
grep -o "임장온에서 더 살펴보기" /tmp/finance1.html | head -1
grep -o "인기 지역" /tmp/finance1.html | head -1
grep -o "이번 주 청약" /tmp/finance1.html | head -1
```

Expected: `HTTP 200`, 그리고 "임장온에서 더 살펴보기"·"인기 지역"·"이번 주 청약" 문자열이 출력됨. 콘솔 로그(`/tmp/imjang_dev.log`)에 `[loan-discovery] fetch failed` 가 없어야 한다(폴백 미발동 = 쿼리 정상).

> `seq=1`이 없으면 `http://localhost:3000/finance` 목록에서 실제 seq를 하나 골라 사용한다. 가능하면 지역 태그 상품(헤더가 "강원 인기 지역" 등)과 전국 상품(헤더가 "전국 인기 지역") 두 케이스를 모두 눈으로 확인한다.

- [ ] **Step 6: 전체 단위 테스트 회귀**

Run: `pnpm test:unit`
Expected: 신규 2개 파일 포함 전체 PASS(기존 테스트 회귀 없음).

- [ ] **Step 7: 커밋**

```bash
git add "app/(public)/finance/[seq]/page.tsx"
git commit -m "feat(finance): 상세 페이지에 디스커버리 섹션 연결

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (작성자 체크 결과)

**1. 스펙 커버리지**
- 인기 지역 지역 분기 + 전국 폴백 → Task 1(해석)·2(지역 쿼리)·4(폴백 오케스트레이션). ✅
- 청약 전국 고정 + 평탄화 + 빈 상태 → Task 3·4·5. ✅
- A안 데이터 소싱(Property.txCount12m / 기존 스냅샷, ETL·마이그레이션 무변경) → Task 2·4. ✅
- 레이아웃(틴트 컨테이너·세로 2단·pill·구분선·SourceCaption) → Task 5. ✅
- 배치(`<main>` 맨 아래, RelatedLoans 다음)·ISR 유지 → Task 6. ✅
- 출처 키 `molit-rtms`/`applyhome`/`lh-presub`, 링크 패턴 `/list?sido=&region=`·`/subscription/[id]` → Task 5(코드에 명시). ✅
- 빈 상태 4종(지역0→전국폴백 / 전국0→블록 미렌더 / 청약0→안내문 / 둘다0→null) → Task 4·5 로직. ✅
- 접근성/브랜드(키보드 Link, 색+텍스트 배지=SubscriptionBoardItem 내장, 14px floor, One-Shadow=틴트면 그림자 없음) → Task 5. ✅

**2. 플레이스홀더 스캔:** TBD/TODO/"적절히 처리" 없음. 모든 코드 스텝에 완전한 코드 포함. ✅

**3. 타입 일관성:** `ResolvedRegionScope{specificSidos,label}`(T1) → `getLoanDiscovery`에서 소비(T4); `LoanDiscoveryRegionScope{label,isNationwide,sido}`(T4) → 컴포넌트에서 소비(T5); `WeeklyBoardItem`(기존, subscription.ts) → `flattenWeeklyBoard` 반환(T3)·`SubscriptionBoardItem` prop(T5) 일치; `PopularRegion`(기존) → `getPopularSigungusBySido` 반환(T2)·컴포넌트 pill(T5) 일치. ✅

**참고(범위 밖, 의도된 트레이드오프):** 인기 기준 윈도우가 전국 스냅샷(90일)과 지역(12개월 txCount12m)에서 다름 — 위젯 성격상 무시(스펙 YAGNI에 명시). 주간 보드 평탄화는 일자당 상위 3건만 보존하는 `assembleWeeklyBoard` 결과를 사용 → 한 주 4건 노출에는 충분.
