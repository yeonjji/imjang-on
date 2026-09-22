# 홈 히어로 레이아웃 재구성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈 히어로와 「동네별 최근 실거래가」 카드를 형제로 분리하고, 통계 바를 두 영역 아래 전체폭 밴드로 옮겨 158px 죽은 여백을 없앤다.

**Architecture:** `HeroSection`에서 `panelSlot`·`statsSlot` 슬롯 prop을 걷어내 순수한 왼쪽 박스로 되돌린다. 2열 배치와 폴백 판단은 `page.tsx`가 갖고, 그 판단 규칙만 순수 함수로 뽑아 테스트한다. `StatsBar`는 자기 컨테이너 컨텍스트를 스스로 소유하게 만들어, 어디에 놓이든 4열/2열 전환이 깨지지 않게 한다.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS v4(컨테이너 쿼리 내장), vitest(`environment: 'node'`, `@testing-library` 없음 — SSR 계약은 `renderToStaticMarkup`으로 검증), Playwright MCP(브라우저 실측).

## Global Constraints

- 두 칸 전환은 **`xl`(1280px)** 부터다. `lg`(1024px)는 실측상 필터 1줄(258px)이 카드 콘텐츠 폭(248px)을 넘겨 줄바꿈되고 거래 행이 카드 밖으로 넘친다.
- 2열 비율은 **`xl:grid-cols-[69fr_31fr]`**, 간격은 **`xl:gap-10`**, 정렬은 **`xl:items-start`**.
- 카드 노출은 **4건**. 5건 이상일 때만 「거래 내역 더보기」를 둔다.
- 더보기는 **추가 요청 없는 클라이언트 토글**이다. 서버가 내려준 배열을 잘라 보여주다 펼친다.
- 조회 상한은 **12**다(`app/api/dong-transactions/route.ts`와 `app/(public)/page.tsx` 프리렌더 양쪽).
- 필터는 3줄 고정: `시도+시군구` / `동+유형` / `거래유형 탭`.
- 필터(`sigunguCode`·`umd`·`propertyType`·`deal`)가 바뀌면 더보기 펼침 상태를 **접는다**.
- 패널이 `null`이면 2열 그리드 클래스를 **켜지 않는다**. 명시적 `31fr` 트랙은 콘텐츠가 없어도 자기 몫을 차지해 오른쪽에 빈 칸을 남긴다.
- `StatsBar`의 `@4xl`(896px) 임계값은 **바꾸지 않는다**.
- 애드센스 심사 중이다. 검색·인기지역·카테고리 이동, 조회 API의 조회 방식과 응답 형식, 필터 동작, 상세 이동, 통계 수치, SEO·URL·사이트맵, ISR·캐싱 정책, 디자인 토큰을 **건드리지 않는다**.
- `git add`는 파일 경로를 명시해서만 한다. `git add .`는 금지다 — 저장소에 사용자가 커밋하지 않은 `.superpowers/brainstorm/…` 변경이 있다.
- 기존 DB 상태 의존 flake(`tests/lib/briefing.test.ts`, `hub-summary-amenity`, `merge-duplicate-properties`, `property-matcher`)는 이 작업과 무관하다. 고치려 하지 마라.

## 스펙과 다르게 가는 점 (의도된 이탈)

스펙 §6은 "새 밴드 래퍼에 `@container`를 붙인다"고 적었다. 이 계획은 대신 **`StatsBar`가 자기 `@container`를 소유하게** 한다.

이유: `@4xl:`의 유일한 소비자가 `StatsBar`이고 유일한 제공자가 `hero-section.tsx`라, 둘이 떨어져 있는 한 "옮길 때 같이 옮겨야 하는 것"이 영원히 남는다. 제공자를 소비자 안에 넣으면 그 결합이 사라진다 — 어디에 놓든 깨지지 않는다. 스펙이 요구한 것("밴드에서 4열이 나올 것")은 그대로 충족하면서 함정만 제거한다.

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `app/(public)/_components/stats-bar.tsx` | 통계 4칸 + 출처 한 줄. 자기 컨테이너 컨텍스트 소유 | 수정 |
| `app/(public)/_components/home-layout.ts` | 2열/1열 판단 규칙(순수 함수) | **신규** |
| `app/(public)/_components/hero-section.tsx` | 파란 히어로 박스만 | 수정 |
| `app/(public)/_components/dong-transaction-panel.tsx` | 카드 전체 | 수정 |
| `app/(public)/page.tsx` | 홈 배치 + 서버 데이터 | 수정 |
| `app/api/dong-transactions/route.ts` | 조회 상한 | 수정 |
| `tests/components/stats-bar.test.tsx` | 컨테이너 소유 계약 | **신규** |
| `tests/components/home-layout.test.ts` | 폴백 규칙 | **신규** |
| `tests/components/hero-section.test.tsx` | 새 시그니처 | 수정 |
| `tests/components/dong-transaction-panel.test.tsx` | 4건·더보기 | 수정 |

---

### Task 1: StatsBar가 자기 컨테이너를 소유한다

통계가 히어로 밖으로 나가기 **전에** 먼저 한다. 순서가 반대면 중간 커밋에서 통계가 2열로 깨진 상태가 된다.

**Files:**
- Modify: `app/(public)/_components/stats-bar.tsx`
- Test: `tests/components/stats-bar.test.tsx` (신규)

**Interfaces:**
- Consumes: 없음
- Produces: `StatsBar({ stats }: { stats: HomeStats })` — 시그니처 불변. 렌더 결과의 **최상위가 `@container` div**가 된다(지금은 Fragment).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/components/stats-bar.test.tsx`:

```tsx
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { StatsBar } from '@/app/(public)/_components/stats-bar';

(globalThis as unknown as { React: typeof React }).React = React;

const STATS = { transactions: 7670000, properties: 278000, schools: 13000, lifeFacilities: 622000 };

describe('StatsBar', () => {
  // @4xl:는 container-type 조상이 없으면 조용히 무시된다 — 빌드도 린트도 통과하고
  // 폭이 1132px이어도 2열로 렌더된다. 그 조상을 컴포넌트가 직접 들고 있어야
  // 어디에 놓여도 깨지지 않는다.
  it('자기 컨테이너 컨텍스트를 스스로 갖는다', () => {
    const out = renderToStaticMarkup(<StatsBar stats={STATS} />);
    expect(out).toContain('@container');
  });

  it('컨테이너가 4열 그리드의 조상이다(형제가 아니다)', () => {
    const out = renderToStaticMarkup(<StatsBar stats={STATS} />);
    const container = out.indexOf('@container');
    const grid = out.indexOf('@4xl:grid-cols-4');
    expect(container).toBeGreaterThan(-1);
    expect(grid).toBeGreaterThan(container);
  });

  it('네 항목과 출처 링크를 보여준다', () => {
    const out = renderToStaticMarkup(<StatsBar stats={STATS} />);
    expect(out).toContain('실거래 데이터');
    expect(out).toContain('아파트/오피스텔/다세대');
    expect(out).toContain('학교 정보');
    expect(out).toContain('생활편의시설');
    expect(out).toContain('/data-source');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/stats-bar.test.tsx`
Expected: FAIL — `'자기 컨테이너 컨텍스트를 스스로 갖는다'`가 `@container`를 못 찾는다.

- [ ] **Step 3: Fragment를 @container div로 바꾼다**

`stats-bar.tsx`에서 `return (` 다음의 `<>`를 `<div className="@container">`로, 닫는 `</>`를 `</div>`로 바꾼다. 그리고 그리드 div 위의 긴 주석을 아래로 교체한다(지금 주석은 "히어로 왼쪽 열 안에서 쓰인다"고 적혀 있는데 더 이상 사실이 아니다):

```tsx
export function StatsBar({ stats }: { stats: HomeStats }) {
  return (
    <div className="@container">
      {/*
        4열/2열은 뷰포트가 아니라 이 컴포넌트가 실제로 받은 폭으로 정한다. 같은
        뷰포트에서도 놓이는 자리에 따라 폭이 크게 달라지기 때문이다 — 히어로
        왼쪽 열 안이면 약 630px, 전체폭 밴드면 1132px다.

        @container를 이 컴포넌트가 직접 들고 있는 것이 핵심이다. container-type
        조상이 없으면 @4xl:은 조용히 무시된다(빌드·린트·런타임 모두 통과하는데
        폭이 1132px이어도 2열로 렌더된다). 부모에게 맡기면 옮길 때마다 같이
        옮겨야 하는 결합이 남는다.

        임계 @3xl(768px)로는 부족했다 — 실측에서 컨테이너 768px는 라벨박스 107px로
        "아파트/오피스텔/다세대"가 단어 중간에서 깨지고, 800px(111px)은 돼야 한 줄이었다.
        @4xl(896px)은 그 위로 잡은 여유값이다.
      */}
      <div className="grid grid-cols-2 overflow-hidden rounded-[20px] border border-[var(--color-line)] bg-white shadow-[var(--shadow)] @4xl:grid-cols-4">
```

나머지(`ITEMS.map`, 출처 `<p>`)는 그대로 두고, 파일 끝의 `</>`만 `</div>`로 바꾼다.

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/stats-bar.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: 히어로의 @container를 뺀다**

`hero-section.tsx`에서 `<div className="@container">`를 `<div>`로 되돌리고 바로 위의 `{/* @container: … */}` 주석 두 줄을 지운다. 이제 `StatsBar`가 스스로 들고 있으므로 히어로에는 소비자가 없다.

- [ ] **Step 6: 전체 테스트와 빌드를 돌린다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components && pnpm typecheck && pnpm lint`
Expected: 전부 통과. `hero-section.test.tsx`는 아직 옛 시그니처를 쓰지만 이 단계에서는 깨지지 않는다(prop을 아직 안 지웠다).

- [ ] **Step 7: 커밋**

```bash
git add app/\(public\)/_components/stats-bar.tsx app/\(public\)/_components/hero-section.tsx tests/components/stats-bar.test.tsx
git commit -m "refactor(home): StatsBar가 자기 컨테이너 컨텍스트를 소유한다"
```

---

### Task 2: HeroSection에서 슬롯 prop 두 개를 제거한다

**Files:**
- Modify: `app/(public)/_components/hero-section.tsx`
- Test: `tests/components/hero-section.test.tsx`

**Interfaces:**
- Consumes: Task 1이 `@container`를 히어로에서 뺀 상태
- Produces: `HeroSection({ popularRegions }: { popularRegions: PopularRegion[] })` — `panelSlot`·`statsSlot` 없음. 렌더 결과에 그리드 클래스 없음.

- [ ] **Step 1: 테스트를 새 시그니처로 다시 쓴다**

`tests/components/hero-section.test.tsx` 전체를 아래로 교체한다:

```tsx
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';

// HeroSearch(자식)가 next/navigation의 useRouter를 쓴다. renderToStaticMarkup은
// App Router 컨텍스트 없이 호출되므로 실제 훅을 그대로 두면 "invariant expected
// app router to be mounted"로 죽는다. router.push만 있으면 되므로 최소로 스텁한다.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
}));

import { HeroSection } from '@/app/(public)/_components/hero-section';

(globalThis as unknown as { React: typeof React }).React = React;

const html = () => renderToStaticMarkup(<HeroSection popularRegions={[]} />);

describe('HeroSection', () => {
  // 2열 배치는 page.tsx의 래퍼가 정한다. 히어로가 스스로 그리드가 되면 자기 높이가
  // 옆 카드에 끌려가 아래에 죽은 여백이 생긴다(이 작업이 없애려는 바로 그 문제).
  it('스스로 2열 그리드가 되지 않는다', () => {
    const out = html();
    expect(out).not.toContain('grid-cols-');
  });

  it('통계를 품지 않는다 — 통계는 히어로 밖 전체폭 밴드로 갔다', () => {
    const out = html();
    expect(out).not.toContain('실거래 데이터');
    expect(out).not.toContain('생활편의시설');
  });

  it('검색·버튼·카테고리는 그대로 있다', () => {
    const out = html();
    expect(out).toContain('임장ON');
    expect(out).toContain('실거래가 찾기');
    expect(out).toContain('청약 일정 보기');
    expect(out).toContain('EV충전소');
  });

  it('popularRegions가 비어 있어도 렌더가 죽지 않는다', () => {
    expect(() => html()).not.toThrow();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/hero-section.test.tsx`
Expected: FAIL — `HeroSection`이 아직 `statsSlot`·`panelSlot`을 필수 prop으로 요구해 타입 에러가 나거나, `grid-cols-`가 남아 있다.

- [ ] **Step 3: 컴포넌트를 고친다**

`hero-section.tsx`를 아래로 교체한다:

```tsx
import Link from 'next/link';
import { HeroSearch } from './hero-search';
import type { PopularRegion } from '@/lib/region';
import { TypeIconGrid } from './type-icon-grid';

/**
 * 홈 히어로의 파란 박스. 검색과 보조 탐색만 담는다.
 *
 * 2열 배치(오른쪽 동네 거래 카드와 나란히)는 page.tsx의 래퍼가 정한다. 히어로가
 * 스스로 그리드가 되면 카드가 이 박스의 패딩 안에 들어가고, 그러면 박스 전체가
 * 카드 높이에 끌려 부풀어 왼쪽 아래에 죽은 여백이 남는다(실측 158px).
 */
export function HeroSection({ popularRegions }: { popularRegions: PopularRegion[] }) {
  return (
    <section className="rounded-[28px] border border-[var(--color-line)] bg-gradient-to-br from-[#eaf2ff] via-[#f3f8ff] to-white p-6 md:p-10">
      <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--color-sky-soft)] px-3.5 py-2 text-xs font-extrabold text-[var(--color-blue-dark)]">
        📍 실거래가·생활권 정보 통합 플랫폼
      </span>
      <h1 className="text-2xl font-black leading-tight tracking-tight text-[var(--color-blue-dark)] md:text-4xl">
        어디든, <span className="text-[var(--color-blue)]">임장ON</span>에서 바로 검색하세요
      </h1>

      <HeroSearch popularRegions={popularRegions} />

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/list"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-blue)] px-6 py-3.5 font-extrabold text-white"
        >
          🔍 실거래가 찾기
        </Link>
        <Link
          href="/subscription"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--color-line)] bg-white px-6 py-3.5 font-extrabold text-[var(--color-blue-dark)]"
        >
          📅 청약 일정 보기
        </Link>
      </div>

      {/* 아이콘은 보조 탐색 수단이다. 키우지 않는다 — 커지면 검색 영역이 아래로
          길어져 오른쪽 카드와의 높이 균형이 무너진다. */}
      <div className="mt-6">
        <TypeIconGrid />
      </div>
    </section>
  );
}
```

바뀐 것: `ReactNode` import 제거, 두 slot prop 제거, 조건부 그리드 클래스 제거, 왼쪽 열을 감싸던 `<div>` 래퍼 제거(이제 `<section>`이 곧 왼쪽 열이다), `statsSlot`·`panelSlot` 렌더 지점 제거.

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/hero-section.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: 타입 에러 위치를 확인한다**

Run: `pnpm typecheck`
Expected: **FAIL** — `app/(public)/page.tsx`가 아직 `statsSlot`·`panelSlot`을 넘긴다. Task 3에서 고친다. 이 실패는 예상된 것이니 여기서 page.tsx를 고치지 마라.

- [ ] **Step 6: 커밋**

```bash
git add app/\(public\)/_components/hero-section.tsx tests/components/hero-section.test.tsx
git commit -m "refactor(home): HeroSection에서 슬롯 prop 두 개 제거"
```

---

### Task 3: 2열 래퍼와 전체폭 통계 밴드를 page.tsx에 배치한다

**Files:**
- Create: `app/(public)/_components/home-layout.ts`
- Create: `tests/components/home-layout.test.ts`
- Modify: `app/(public)/page.tsx`

**Interfaces:**
- Consumes: Task 2의 `HeroSection({ popularRegions })`, Task 1의 `StatsBar({ stats })`
- Produces: `heroRowClass(hasPanel: boolean): string`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/components/home-layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { heroRowClass } from '@/app/(public)/_components/home-layout';

describe('heroRowClass', () => {
  // 명시적 31fr 트랙은 콘텐츠가 비어도 자기 몫의 공간을 그대로 차지한다. 패널이
  // 없을 때 그리드를 켜 두면 1280px 이상에서 오른쪽에 약 340px 빈 칸이 남는다.
  it('패널이 없으면 그리드를 켜지 않는다', () => {
    expect(heroRowClass(false)).toBe('');
  });

  it('패널이 있으면 xl부터 69:31 두 칸으로 나눈다', () => {
    const cls = heroRowClass(true);
    expect(cls).toContain('xl:grid');
    expect(cls).toContain('xl:grid-cols-[69fr_31fr]');
    expect(cls).toContain('xl:gap-10');
  });

  // 각 열이 자기 콘텐츠 높이를 갖게 하는 것이 이 작업의 목적이다. stretch(기본값)로
  // 두면 짧은 쪽이 긴 쪽에 맞춰 늘어나 여백 문제가 그대로 남는다.
  it('두 열의 높이를 서로에게 맞추지 않는다', () => {
    expect(heroRowClass(true)).toContain('xl:items-start');
  });

  // lg(1024px)에서 나누면 카드 콘텐츠가 248px인데 필터 1줄이 258px이라 줄바꿈되고
  // 거래 행이 카드 밖으로 넘친다(실측).
  it('lg에서는 나누지 않는다', () => {
    expect(heroRowClass(true)).not.toContain('lg:grid');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/home-layout.test.ts`
Expected: FAIL — 모듈이 없다.

- [ ] **Step 3: 순수 함수를 만든다**

`app/(public)/_components/home-layout.ts`:

```ts
/**
 * 히어로와 동네 거래 카드를 담는 행의 클래스.
 *
 * 두 칸 전환이 xl(1280px)부터인 이유는 실측이다. 컨테이너 내부 1132px에서 gap 40을
 * 빼고 69:31로 나누면 카드는 바깥 339px·콘텐츠 297px인데, 필터 첫 줄(시도 155 +
 * 시군구 95 + 간격 8 = 258px)이 여기 들어간다. lg(1024px)에서는 카드 콘텐츠가
 * 248px로 줄어 그 줄이 깨지고 거래 행이 카드 밖으로 넘친다.
 *
 * hasPanel이 false면 빈 문자열이다. 명시적 31fr 트랙은 콘텐츠가 없어도 자기 몫을
 * 차지해 오른쪽에 빈 칸을 남긴다.
 */
export function heroRowClass(hasPanel: boolean): string {
  return hasPanel ? 'xl:grid xl:grid-cols-[69fr_31fr] xl:gap-10 xl:items-start' : '';
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/home-layout.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: page.tsx를 배선한다**

import에 한 줄을 추가한다:

```ts
import { heroRowClass } from './_components/home-layout';
```

`return (` 이하의 `<HeroSection …/>` 블록 전체를 아래로 교체한다. `<MarketBriefing briefing={briefing} />`부터 그 아래는 손대지 않는다:

```tsx
  const panel =
    top && topDong ? (
      <DongTransactionPanel
        initialSido={top.sido}
        initialSigunguCode={top.sigunguCode}
        initialSigunguName={top.sigungu}
        initialUmd={topDong.umd}
        initialDongs={dongs}
        initialItems={dongItems}
        sidoList={sidoList}
      />
    ) : null;

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-12">
      <div className={heroRowClass(panel !== null)}>
        <HeroSection popularRegions={popularRegions} />
        {panel}
      </div>

      {/* 통계는 두 영역 아래 전체폭(1132px) 밴드다. 히어로 안에 있으면 히어로가
          길어져 오른쪽 카드와의 높이 균형이 무너진다. */}
      <div className="mt-6">
        <StatsBar stats={stats} />
      </div>

      <MarketBriefing briefing={briefing} />
```

`const panel = …`은 `const dongItems = …` 다음, `return (` 앞에 둔다.

- [ ] **Step 6: 타입·린트·빌드를 확인한다**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: 전부 통과. Task 2에서 예상했던 타입 에러가 여기서 해소된다.

- [ ] **Step 7: 커밋**

```bash
git add app/\(public\)/_components/home-layout.ts app/\(public\)/page.tsx tests/components/home-layout.test.ts
git commit -m "feat(home): 히어로와 카드를 형제로 분리하고 통계를 전체폭 밴드로"
```

---

### Task 4: 카드 4건 노출 + 「거래 내역 더보기」 + 상한 12

**Files:**
- Modify: `app/(public)/_components/dong-transaction-panel.tsx`
- Modify: `app/api/dong-transactions/route.ts:24` (`limit: 8`)
- Modify: `app/(public)/page.tsx` (프리렌더 `limit: 8`)
- Test: `tests/components/dong-transaction-panel.test.tsx`

**Interfaces:**
- Consumes: `DongTransaction`(`@/lib/transaction/dong`), `resolvePanelView`(같은 파일, 변경 없음)
- Produces: `VISIBLE_COUNT = 4` (export 안 함), 렌더에 「거래 내역 더보기」 버튼

- [ ] **Step 1: 기존 테스트의 의도를 다시 쓴다**

`dong-transaction-panel.test.tsx`의 `it('「더 보기」 링크를 두지 않는다', …)`를 아래로 교체한다.

**그냥 지우지 마라.** 이 단언이 지키려던 것은 "다른 화면으로 떠나보내는 링크를 두지 않는다"이고, 그 규칙은 여전히 유효하다. 이번에 추가하는 것은 같은 자리에서 펼치는 버튼이라 그 규칙과 충돌하지 않는다. (원 설계 §6.8이 "추가 탐색이 필요해지면 현재 필터를 유지한 채 같은 자리에서 확장한다 — 별도 과제다"라고 적어 둔 그 별도 과제다.)

```tsx
  // 원 설계 §6.8: /list는 건물 목록이지 거래 목록이라, 거기로 보내면 사용자가
  // 따라가던 탐색의 성격이 바뀐다. 같은 자리에서 펼치는 더보기는 그 규칙과 다르다.
  it('다른 화면으로 떠나보내는 링크를 두지 않는다', () => {
    const out = html(ITEMS);
    expect(out).not.toContain('전체 보기');
    expect(out).not.toContain('매물 보기');
    expect(out).not.toContain('href="/list');
  });
```

- [ ] **Step 2: 4건·더보기 테스트를 쓴다**

같은 `describe('DongTransactionPanel', …)` 안, Step 1에서 고친 테스트 뒤에 붙인다. 파일 상단의 `ITEMS`는 2건뿐이므로 6건짜리 배열을 따로 만든다:

```tsx
  const six: DongTransaction[] = Array.from({ length: 6 }, (_, i) => ({
    id: String(100 + i),
    propertyId: String(200 + i),
    propertyName: `테스트단지${i}`,
    dealType: 'SALE' as const,
    propertyType: 'APARTMENT' as const,
    dealAmount: 90000 + i,
    deposit: null,
    monthlyRent: null,
    exclusiveArea: 84,
    floor: 10,
    contractDate: '2026-09-09',
  }));

  it('6건이 와도 4건만 그린다', () => {
    const out = html(six);
    expect(out).toContain('테스트단지0');
    expect(out).toContain('테스트단지3');
    expect(out).not.toContain('테스트단지4');
    expect(out).not.toContain('테스트단지5');
  });

  it('5건 이상이면 더보기 버튼을 둔다', () => {
    expect(html(six)).toContain('거래 내역 더보기');
  });

  it('4건 이하면 더보기 버튼을 두지 않는다', () => {
    expect(html(six.slice(0, 4))).not.toContain('거래 내역 더보기');
    expect(html(ITEMS)).not.toContain('거래 내역 더보기');
  });

  it('0건이면 더보기 버튼을 두지 않는다', () => {
    expect(html([])).not.toContain('거래 내역 더보기');
  });
```

- [ ] **Step 3: 실패를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/dong-transaction-panel.test.tsx`
Expected: FAIL — `'6건이 와도 4건만 그린다'`가 `테스트단지4`를 찾아내고, `'5건 이상이면 더보기 버튼을 둔다'`가 버튼을 못 찾는다.

- [ ] **Step 4: 상수와 상태를 넣는다**

`dong-transaction-panel.tsx`의 `type Status = 'idle' | 'loading' | 'error';` 바로 위에 상수를 둔다:

```tsx
/**
 * 첫 화면 노출 개수. 통계를 뺀 히어로가 607px인데 행 하나가 약 71px이라, 4건일 때
 * 카드가 606px로 히어로와 1px 차이다. 5건이면 64px, 6건이면 136px 길어진다.
 */
const VISIBLE_COUNT = 4;
```

`const [retryTick, setRetryTick] = useState(0);` 다음 줄에 상태를 추가한다:

```tsx
  const [expanded, setExpanded] = useState(false);
```

- [ ] **Step 5: 필터가 바뀌면 접는다**

거래 목록 조회 `useEffect`(`}, [sigunguCode, umd, propertyType, deal, retryTick]);`로 끝나는 것) **바로 위**에 별도 effect를 추가한다:

```tsx
  // 필터가 바뀌면 펼침을 접는다. 펼친 채로 지역이 바뀌면 새 결과 12건이 한꺼번에
  // 쏟아져 앞 결과의 연장처럼 읽힌다. retryTick은 넣지 않는다 — 같은 필터의
  // 재조회라 사용자가 펼쳐 둔 상태를 유지하는 편이 맞다.
  useEffect(() => {
    setExpanded(false);
  }, [sigunguCode, umd, propertyType, deal]);
```

- [ ] **Step 6: 목록과 버튼을 고친다**

`{view === 'results' && (` 블록 전체를 아래로 교체한다:

```tsx
        {view === 'results' && (
          <>
            <ul className="divide-y divide-[var(--color-line)]">
              {(expanded ? items : items.slice(0, VISIBLE_COUNT)).map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/${SLUG[t.propertyType] ?? 'apt'}/${t.propertyId}`}
                      className="block truncate text-sm font-bold text-[var(--color-blue-dark)] hover:underline"
                    >
                      {t.propertyName}
                    </Link>
                    <p className="mt-0.5 text-xs text-[var(--color-muted)]">{formatDongMeta(t)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${DEAL_BADGE[t.dealType]}`}>
                      {DEAL_LABEL[t.dealType]}
                    </span>
                    <p className="mt-0.5 whitespace-nowrap text-sm font-bold text-[var(--color-blue-dark)]">
                      {formatDongPrice(t)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            {!expanded && items.length > VISIBLE_COUNT && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="mt-3 w-full rounded-lg border border-[var(--color-line)] bg-white py-2 text-xs font-bold text-[var(--color-blue-dark)] hover:bg-[var(--color-soft)]"
              >
                거래 내역 더보기
              </button>
            )}
          </>
        )}
```

서버가 이미 내려준 배열을 자르는 것이므로 추가 요청이 없다. 펼친 뒤 다시 접는 버튼은 두지 않는다 — 접을 이유가 없고 상태가 하나 더 늘어난다.

- [ ] **Step 7: 스켈레톤을 4행으로 줄인다**

같은 파일의 로딩 스켈레톤에서 `{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (`를 아래로 바꾼다. 8행짜리 스켈레톤이 4행 결과로 바뀌면 화면이 크게 튄다:

```tsx
            {[0, 1, 2, 3].map((i) => (
```

- [ ] **Step 8: 통과를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/dong-transaction-panel.test.tsx`
Expected: PASS (기존 25개 + 신규 4개 = 29 tests)

- [ ] **Step 9: 조회 상한을 12로 올린다**

`app/api/dong-transactions/route.ts`에서 `limit: 8,`을 `limit: 12,`로 바꾸고 위에 한 줄 주석을 단다:

```ts
      // 홈 패널은 4건만 그리고 나머지는 「거래 내역 더보기」로 펼친다. 추가 요청을
      // 하지 않으므로 그 여분까지 한 번에 내려준다.
      limit: 12,
```

`app/(public)/page.tsx`의 `getDongTransactions({ … limit: 8, … })`도 `limit: 12,`로 바꾼다. 서버 프리렌더와 클라이언트 조회가 같은 개수여야 첫 화면과 첫 필터 변경 결과의 더보기 유무가 일치한다.

- [ ] **Step 10: 전체 게이트를 돌린다**

Run: `pnpm typecheck && pnpm lint && pnpm build && pnpm exec dotenv -e .env.test -- vitest run tests/components`
Expected: 전부 통과.

- [ ] **Step 11: 커밋**

```bash
git add app/\(public\)/_components/dong-transaction-panel.tsx app/api/dong-transactions/route.ts app/\(public\)/page.tsx tests/components/dong-transaction-panel.test.tsx
git commit -m "feat(home): 카드 4건 노출 + 거래 내역 더보기, 조회 상한 12"
```

---

### Task 5: 필터 3줄 고정 + 다섯 폭 실측 검증

**Files:**
- Modify: `app/(public)/_components/dong-transaction-panel.tsx` (필터 마크업)

**Interfaces:**
- Consumes: Task 4까지의 결과 전체
- Produces: 없음 (최종 검증)

- [ ] **Step 1: 필터를 3줄로 나눈다**

지금은 `div.mt-3`(시도·시군구·동)와 `div.mt-2`(유형·탭) 두 덩어리이고, 폭에 따라 `flex-wrap`이 줄을 나눈다. 아래처럼 세 덩어리로 명시한다. 셀렉트와 탭의 클래스는 그대로 두고 감싸는 div만 재배치한다:

```tsx
      {/* 카드 콘텐츠 폭이 297px이라 3줄로 고정한다. flex-wrap에 맡기면 시도 셀렉트
          폭(최장 옵션 "전남광주통합특별시" 기준 155px)에 따라 줄이 들쭉날쭉해진다. */}
      <div className="mt-3 flex gap-2 text-sm">
        <label className="sr-only" htmlFor="sido-select">시도</label>
        <select id="sido-select" … >…</select>

        <label className="sr-only" htmlFor="sigungu-select">시군구</label>
        <select id="sigungu-select" … >…</select>
      </div>

      <div className="mt-2 flex gap-2 text-sm">
        <label className="sr-only" htmlFor="dong-select">읍·면·동·리</label>
        <select id="dong-select" … >…</select>

        <label className="sr-only" htmlFor="type-select">건물 유형</label>
        <select id="type-select" … >…</select>
      </div>

      <div className="mt-2">
        <div className="flex gap-1 rounded-lg bg-[var(--color-soft)] p-1">
          {DEAL_TABS.map((t) => (…))}
        </div>
      </div>
```

`…` 자리는 기존 셀렉트·탭의 속성과 클래스를 **그대로** 옮겨 온다. `type-select`의 `text-sm`은 이제 부모 div가 주므로 중복이면 빼도 된다. `flex-wrap`은 세 줄 모두에서 뺀다 — 고정이 목적이다.

- [ ] **Step 2: 유닛 테스트가 깨지지 않았는지 본다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components && pnpm typecheck && pnpm lint`
Expected: 전부 통과. 마크업 재배치라 단언은 영향받지 않아야 한다.

- [ ] **Step 3: 로컬에 실데이터를 넣고 dev 서버를 띄운다**

로컬 DB는 비어 있어 패널이 렌더되지 않는다. 운영에서 읽기 전용으로 슬라이스를 복사한다 — 방법은 팀리드에게 요청하라(운영 접속 자격이 필요하다). 슬라이스가 준비되면:

```bash
pnpm dev
```

- [ ] **Step 4: 다섯 폭에서 측정한다**

Playwright MCP로 `http://localhost:3000/`을 열고 1440 / 1280 / 1024 / 768 / 390px에서 아래를 모두 확인한다. **눈으로 스크린샷을 읽어라** — 계산으로 갈음하지 마라.

| 폭 | 기대 |
|---|---|
| 1440 | 2열. 히어로 753px / 카드 339px. 통계 밴드 1132px **4열** |
| 1280 | 2열. 폭은 1440과 동일(컨테이너가 1180에서 잠긴다). 통계 4열 |
| 1024 | **1열**. 히어로 → 카드 → 통계 순서. 통계 976px 4열 |
| 768 | 1열. 통계 720px **2×2** |
| 390 | 1열. 통계 342px 2×2. **가로 스크롤 없음** |

모든 폭에서 공통으로:
- `document.documentElement.scrollWidth <= innerWidth` (가로 스크롤 없음)
- 카드 안의 셀렉트·거래 행·더보기 버튼이 카드 경계를 넘지 않음
- 필터가 정확히 3줄 (`sido`와 `sigungu`의 `getBoundingClientRect().top`이 같고, `dong`과 `type`이 같고, 탭이 그 아래)
- 히어로와 카드의 높이가 서로에게 끌려가지 않음(1440에서 약 607 / 606)

- [ ] **Step 5: 통계 4열을 실제 계산값으로 확인한다**

이게 이 작업에서 조용히 깨질 수 있는 유일한 지점이다. 클래스 존재가 아니라 **계산된 열 수**를 본다:

```js
getComputedStyle(document.querySelector('[class*="@4xl:grid-cols-4"]')).gridTemplateColumns.split(' ').length
```

1440·1280·1024에서 `4`, 768·390에서 `2`여야 한다.

- [ ] **Step 6: 폴백 경로를 확인한다**

패널이 없는 경우(인기 지역 스냅샷이 비었을 때)를 브라우저에서 재현한다 — 1440px에서 패널 DOM을 지우고 래퍼의 그리드 클래스를 떼면 히어로가 전체폭 1132px로 늘어나고 오른쪽에 빈 칸이 없어야 한다. 이때 통계 밴드는 그대로 1132px 4열이어야 한다.

- [ ] **Step 7: 커밋**

```bash
git add app/\(public\)/_components/dong-transaction-panel.tsx
git commit -m "style(home): 카드 필터를 3줄로 고정"
```

- [ ] **Step 8: 측정 결과를 보고한다**

다섯 폭의 스크린샷과 Step 4·5의 수치를 보고서에 남긴다. 기대와 다른 값이 하나라도 있으면 커밋하지 말고 보고하라.

---

## Self-Review

**스펙 커버리지**

| 스펙 | 태스크 |
|---|---|
| §3 새 구조 / 슬롯 prop 제거 | Task 2, 3 |
| §3 폴백 래퍼 이관 | Task 3 (`heroRowClass`), Task 5 Step 6 |
| §3.1 69:31 비율 | Task 3, Task 5 Step 4 |
| §4.1 4건 + 더보기 + 상한 12 + 접힘 리셋 | Task 4 |
| §4.2 필터 3줄 | Task 5 Step 1 |
| §4.3 출처 표기 유지 | 변경 없음(`SourceCaption` 그대로) |
| §5 xl 유지 / 1열 순서 | Task 3, Task 5 Step 4 |
| §6 컨테이너 쿼리 | Task 1 (스펙보다 강한 방식 — 위 "의도된 이탈" 참고) |
| §7 검증 | Task 5 |
| §8 하지 않는 것 | Global Constraints |

**빠진 것 없음 확인:** 스켈레톤 8행이 4행 결과로 튀는 문제는 스펙에 없었지만 4건 노출의 직접 결과라 Task 4 Step 7로 넣었다.

**타입 일관성:** `heroRowClass(hasPanel: boolean): string`은 Task 3에서 정의하고 같은 태스크에서만 쓴다. `VISIBLE_COUNT`는 Task 4 안에서만 쓰며 export하지 않는다. `StatsBar`·`HeroSection`·`DongTransactionPanel`의 prop 이름은 각 태스크의 Interfaces 블록과 코드가 일치한다.

**중간 상태 주의:** Task 2 종료 시점에 `pnpm typecheck`가 **의도적으로 실패**한다(page.tsx가 아직 옛 prop을 넘긴다). Task 3에서 해소된다. 이 순서를 바꾸면 한 커밋에 두 파일이 섞인다.
