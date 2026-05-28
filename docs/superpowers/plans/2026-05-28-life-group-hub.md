# 생활편의 그룹 허브 + sibling 탭 — 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PR #5가 만든 `LIFE_GROUPS` 위에 (1) 드롭다운 그룹 라벨 시각 분리, (2) `/life/[group]` 별도 허브 페이지, (3) LIST 상단 sibling underline 탭을 추가한다.

**Architecture:** `LIFE_GROUPS`를 단일 진실 소스로 유지하고, 그룹 슬러그/하위 항목 `href`로부터 (a) 정적 라우트 4개 자동 생성, (b) LIST sibling 탭 자동 도출, (c) sitemap 엔트리 자동 생성한다. SiblingTabs 컴포넌트는 클라이언트에서 SoonModal 상태를 자체 hoist해 서버 컴포넌트(`amenity/[category]/page.tsx`, `school/page.tsx`)에서 prop 없이 마운트 가능하다.

**Tech Stack:** Next.js 14 App Router (server components + 'use client'), TypeScript, Tailwind (CSS vars), Vitest (node, `tests/lib/*.test.ts`), Playwright (`tests/e2e/*.spec.ts`, chromium-desktop + chromium-mobile 두 프로젝트), pnpm.

**Spec:** `docs/superpowers/specs/2026-05-28-life-group-hub-design.md`

---

## File Structure

**Create:**
- `app/(public)/life/[group]/page.tsx` — 그룹 허브 페이지 (4 슬러그 정적 생성 + 404)
- `lib/life/sibling-tabs.ts` — `getSiblingTabs(currentHref)` 헬퍼 (서버 import 가능)
- `app/(public)/_components/sibling-tabs.tsx` — underline 탭 클라이언트 컴포넌트 (SoonModal 자체 hoist)
- `tests/lib/life/sibling-tabs.test.ts` — 헬퍼 단위 테스트
- `tests/lib/sitemap.test.ts` — sitemap STATIC_ENTRIES 단위 테스트
- `tests/e2e/life-group-hub.spec.ts` — 그룹 허브 4개 + 404 + sibling 탭 e2e

**Modify:**
- `app/(public)/_components/life-menu.ts` — `LifeGroup`에 `intro: string` 필드 추가 + 4그룹 값 + `LIFE_ITEM_EMOJI` 매핑 export
- `app/(public)/_components/life-dropdown.tsx` — 그룹 라벨 `href`를 `/life/${slug}`로, 스타일 시안 A (14px + 라벨 아래 `border-b`)
- `app/(public)/_components/mobile-drawer.tsx` — 동일 (그룹 라벨 href + 스타일 톤 일치)
- `app/(public)/life/page.tsx` — 각 그룹 섹션 헤더에 "더보기 →" 링크 추가, 인라인 `ITEM_EMOJI`를 `LIFE_ITEM_EMOJI` import로 교체
- `app/(public)/amenity/[category]/page.tsx` — hero 박스 바로 아래에 `<SiblingTabs currentHref={`/amenity/${category}`} />` 마운트
- `app/(public)/school/page.tsx` — hero 박스 바로 아래에 `<SiblingTabs currentHref="/school" />` 마운트
- `app/sitemap.ts` — `STATIC_ENTRIES`에 4개 그룹 허브 URL 추가, 테스트 가능하도록 `STATIC_ENTRIES`를 `export`
- `tests/lib/life-menu.test.ts` — `intro` 필드 invariant 추가
- `tests/e2e/life-menu.spec.ts` — 새 구조에 맞춰 갱신 (그룹 라벨 → `/life/${slug}`)

---

## Task 1: `LifeGroup`에 `intro` 필드 추가 + emoji 매핑 추출

**Files:**
- Modify: `app/(public)/_components/life-menu.ts`
- Modify: `tests/lib/life-menu.test.ts`

- [ ] **Step 1: 실패 테스트 추가**

`tests/lib/life-menu.test.ts`의 마지막 `it(...)` 뒤에 다음을 추가:

```ts
  it('모든 그룹은 비어있지 않은 intro(소개 1줄)를 가진다', () => {
    for (const g of LIFE_GROUPS) {
      expect(typeof g.intro).toBe('string');
      expect(g.intro.length).toBeGreaterThan(0);
    }
  });
```

또한 같은 파일 최상단의 기존 import 라인을 다음으로 교체 (`LIFE_ITEM_EMOJI` 추가):

```ts
import { LIFE_GROUPS, LIFE_ITEM_EMOJI } from '@/app/(public)/_components/life-menu';
```

그리고 마지막 `it` 다음에 emoji 매핑 invariant 추가:

```ts
  it('LIFE_ITEM_EMOJI는 모든 하위 항목 label에 대해 이모지를 가진다', () => {
    const labels = LIFE_GROUPS.flatMap((g) => g.items.map((i) => i.label));
    for (const label of labels) {
      expect(LIFE_ITEM_EMOJI[label], `emoji missing for ${label}`).toBeTruthy();
    }
  });
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `pnpm vitest --run tests/lib/life-menu.test.ts`
Expected: FAIL — `intro` 속성 없음 / `LIFE_ITEM_EMOJI` undefined.

- [ ] **Step 3: `life-menu.ts` 수정**

`app/(public)/_components/life-menu.ts` 전체를 다음으로 교체:

```ts
export interface LifeSubItem {
  label: string;
  href: string;
  /** false면 클릭 시 SoonModal — 페이지 완성 시 true로만 전환하면 라이브 */
  live: boolean;
  /** 데이터 자체가 없는 항목에 'Soon' 배지 */
  soon?: boolean;
}

export type LifeGroupSlug = 'education' | 'medical' | 'amenity' | 'urban';

export interface LifeGroup {
  slug: LifeGroupSlug;
  label: string;
  /** 그룹 허브 페이지 hero용 1줄 설명 */
  intro: string;
  items: LifeSubItem[];
}

export const LIFE_GROUPS: LifeGroup[] = [
  {
    slug: 'education',
    label: '교육시설',
    intro: '아이의 통학 동선과 학군을 한 화면에서.',
    items: [
      { label: '학교', href: '/school', live: true },
      { label: '어린이집', href: '/childcare', live: false, soon: true },
    ],
  },
  {
    slug: 'medical',
    label: '의료시설',
    intro: '병원·약국·보건소까지, 우리 동네 의료 인프라.',
    items: [
      { label: '병원·의원', href: '/medical?type=hospital', live: false },
      { label: '약국', href: '/medical?type=pharmacy', live: false },
      { label: '보건소', href: '/medical?type=health-center', live: false, soon: true },
    ],
  },
  {
    slug: 'amenity',
    label: '상권·편의',
    intro: '편의점·마트·카페·전통시장 — 일상 동선을 한눈에.',
    items: [
      { label: '편의점', href: '/amenity/convenience', live: true },
      { label: '마트', href: '/amenity/mart', live: true },
      { label: '카페', href: '/amenity/cafe', live: true },
      { label: '전통시장', href: '/amenity/market', live: true },
    ],
  },
  {
    slug: 'urban',
    label: '도시인프라',
    intro: '공원·충전소·주차장 — 동네 인프라 한눈에.',
    items: [
      { label: '공원', href: '/urban?type=park', live: false },
      { label: '충전소', href: '/urban?type=charger', live: false },
      { label: '주차장', href: '/urban?type=parking', live: false, soon: true },
    ],
  },
];

/** 하위 항목 label → emoji 매핑 (그룹 허브, /life 인덱스, sibling 탭 공용) */
export const LIFE_ITEM_EMOJI: Record<string, string> = {
  '학교': '🏫', '어린이집': '👶',
  '병원·의원': '🏥', '약국': '💊', '보건소': '🩺',
  '편의점': '🏪', '마트': '🛒', '카페': '☕', '전통시장': '🏬',
  '공원': '🌳', '충전소': '⚡', '주차장': '🅿️',
};
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `pnpm vitest --run tests/lib/life-menu.test.ts`
Expected: PASS — 모든 it 블록 그린.

- [ ] **Step 5: 기존 인라인 ITEM_EMOJI 정리 (DRY)**

`app/(public)/life/page.tsx`의 인라인 `const ITEM_EMOJI: Record<string, string> = { ... };` 블록을 삭제하고, 사용처(`ITEM_EMOJI[item.label]`)를 `LIFE_ITEM_EMOJI[item.label]`로 교체. import 라인도 갱신:

```ts
import { LIFE_GROUPS, LIFE_ITEM_EMOJI } from '../_components/life-menu';
```

- [ ] **Step 6: tsc 확인 + 커밋**

Run: `pnpm tsc --noEmit`
Expected: 0 error.

```bash
git add app/\(public\)/_components/life-menu.ts app/\(public\)/life/page.tsx tests/lib/life-menu.test.ts
git commit -m "feat(life-menu): LifeGroup.intro 필드 + LIFE_ITEM_EMOJI 공용 매핑"
```

---

## Task 2: `lib/life/sibling-tabs.ts` 헬퍼

**Files:**
- Create: `lib/life/sibling-tabs.ts`
- Create: `tests/lib/life/sibling-tabs.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`tests/lib/life/sibling-tabs.test.ts` 전체:

```ts
import { describe, it, expect } from 'vitest';
import { getSiblingTabs } from '@/lib/life/sibling-tabs';

describe('getSiblingTabs', () => {
  it('/school은 교육시설 그룹을 반환하고 학교가 활성이다', () => {
    const r = getSiblingTabs('/school');
    expect(r).not.toBeNull();
    expect(r!.group.slug).toBe('education');
    expect(r!.activeLabel).toBe('학교');
    expect(r!.items.map((i) => i.label)).toEqual(['학교', '어린이집']);
  });

  it('/amenity/convenience는 상권·편의 그룹을 반환하고 편의점이 활성이다', () => {
    const r = getSiblingTabs('/amenity/convenience');
    expect(r).not.toBeNull();
    expect(r!.group.slug).toBe('amenity');
    expect(r!.activeLabel).toBe('편의점');
    expect(r!.items).toHaveLength(4);
  });

  it('/amenity/mart, /amenity/cafe, /amenity/market 모두 상권·편의 그룹으로 매칭된다', () => {
    for (const href of ['/amenity/mart', '/amenity/cafe', '/amenity/market']) {
      const r = getSiblingTabs(href);
      expect(r?.group.slug, href).toBe('amenity');
    }
  });

  it('LIFE_GROUPS에 등록되지 않은 path는 null을 반환한다', () => {
    expect(getSiblingTabs('/unknown')).toBeNull();
    expect(getSiblingTabs('/amenity/convenience?sido=서울')).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `pnpm vitest --run tests/lib/life/sibling-tabs.test.ts`
Expected: FAIL — 모듈을 찾을 수 없음.

- [ ] **Step 3: 헬퍼 구현**

`lib/life/sibling-tabs.ts` 전체:

```ts
import { LIFE_GROUPS, type LifeGroup, type LifeSubItem } from '@/app/(public)/_components/life-menu';

export interface SiblingTabsResult {
  group: LifeGroup;
  items: LifeSubItem[];
  activeLabel: string;
}

/**
 * 주어진 `currentHref`가 LIFE_GROUPS에 등록된 하위 항목 href와 정확히 일치하면
 * 그 그룹의 형제 탭 정보를 돌려준다. 매칭 실패 시 null (탭 미마운트).
 *
 * - 정확 일치 비교: '/amenity/convenience?sido=서울' 같은 쿼리 포함 href는 의도적으로 매칭 안 됨.
 *   호출부(LIST 페이지)는 경로 부분만 넘긴다.
 */
export function getSiblingTabs(currentHref: string): SiblingTabsResult | null {
  for (const group of LIFE_GROUPS) {
    const hit = group.items.find((it) => it.href === currentHref);
    if (hit) {
      return { group, items: group.items, activeLabel: hit.label };
    }
  }
  return null;
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `pnpm vitest --run tests/lib/life/sibling-tabs.test.ts`
Expected: PASS — 4개 it 모두 그린.

- [ ] **Step 5: 커밋**

```bash
git add lib/life/sibling-tabs.ts tests/lib/life/sibling-tabs.test.ts
git commit -m "feat(life): getSiblingTabs 헬퍼 — LIFE_GROUPS에서 형제 탭 역추출"
```

---

## Task 3: `SiblingTabs` 클라이언트 컴포넌트

**Files:**
- Create: `app/(public)/_components/sibling-tabs.tsx`

> 환경 제약상 컴포넌트 단위 테스트는 vitest로 실행되지 않는다 (`tests/**/*.test.ts`만 inclusion + node env). 따라서 이 task는 구현 + tsc 통과만 검증하고, 동작 검증은 Task 7/8의 playwright e2e에서 한다.

- [ ] **Step 1: 컴포넌트 작성**

`app/(public)/_components/sibling-tabs.tsx` 전체:

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { SoonModal } from './soon-modal';
import { getSiblingTabs } from '@/lib/life/sibling-tabs';

interface Props {
  /** 현재 LIST의 정확한 path (쿼리 제외). 예: '/amenity/convenience', '/school' */
  currentHref: string;
}

export function SiblingTabs({ currentHref }: Props) {
  const tabs = getSiblingTabs(currentHref);
  const [soonTopic, setSoonTopic] = useState<string | null>(null);
  if (!tabs) return null;

  return (
    <>
      <div
        data-testid="sibling-tabs"
        className="mb-4 rounded-[18px] border border-[var(--color-line)] bg-white px-4 shadow-[var(--shadow-soft)]"
      >
        <div className="flex gap-6 overflow-x-auto">
          {tabs.items.map((item) => {
            const active = item.href === currentHref;
            const base = '-mb-px py-3 text-sm whitespace-nowrap';
            const cls = active
              ? `${base} border-b-2 border-[var(--color-blue)] text-[var(--color-blue-dark)] font-extrabold`
              : `${base} border-b-2 border-transparent text-[var(--color-muted)] font-semibold hover:text-[var(--color-blue-dark)]`;
            if (item.live) {
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={(e) => { if (active) e.preventDefault(); }}
                  aria-current={active ? 'page' : undefined}
                  className={cls}
                >
                  {item.label}
                </Link>
              );
            }
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => setSoonTopic(item.label)}
                className={`${cls} inline-flex items-center gap-1.5`}
              >
                {item.label}
                {item.soon && <Badge tone="gray">Soon</Badge>}
              </button>
            );
          })}
        </div>
      </div>
      <SoonModal open={!!soonTopic} topic={soonTopic} onClose={() => setSoonTopic(null)} />
    </>
  );
}
```

- [ ] **Step 2: tsc 확인**

Run: `pnpm tsc --noEmit`
Expected: 0 error.

- [ ] **Step 3: 커밋**

```bash
git add app/\(public\)/_components/sibling-tabs.tsx
git commit -m "feat(life): SiblingTabs 클라이언트 컴포넌트 (underline 탭 + SoonModal 자체 hoist)"
```

---

## Task 4: `/life/[group]` 그룹 허브 페이지

**Files:**
- Create: `app/(public)/life/[group]/page.tsx`
- Create: `tests/e2e/life-group-hub.spec.ts`

- [ ] **Step 1: 실패 e2e 작성**

`tests/e2e/life-group-hub.spec.ts` 전체:

```ts
import { test, expect } from '@playwright/test';

test.describe('생활편의 그룹 허브 /life/[group]', () => {
  test('education: 학교/어린이집만 노출, 다른 그룹 카드 없음', async ({ page }) => {
    await page.goto('/life/education');
    await expect(page.getByRole('heading', { level: 1, name: '교육시설' })).toBeVisible();
    await expect(page.getByText('학교')).toBeVisible();
    await expect(page.getByText('어린이집')).toBeVisible();
    await expect(page.getByText('편의점')).toHaveCount(0);
    await expect(page.getByText('공원')).toHaveCount(0);
  });

  test('amenity: 편의점/마트/카페/전통시장 4개만 노출', async ({ page }) => {
    await page.goto('/life/amenity');
    await expect(page.getByRole('heading', { level: 1, name: '상권·편의' })).toBeVisible();
    for (const label of ['편의점', '마트', '카페', '전통시장']) {
      await expect(page.getByText(label, { exact: false })).toBeVisible();
    }
    await expect(page.getByText('학교')).toHaveCount(0);
  });

  test('medical: 병원·의원/약국/보건소만 노출', async ({ page }) => {
    await page.goto('/life/medical');
    await expect(page.getByRole('heading', { level: 1, name: '의료시설' })).toBeVisible();
    await expect(page.getByText('병원·의원')).toBeVisible();
    await expect(page.getByText('약국')).toBeVisible();
    await expect(page.getByText('보건소')).toBeVisible();
  });

  test('urban: 공원/충전소/주차장만 노출', async ({ page }) => {
    await page.goto('/life/urban');
    await expect(page.getByRole('heading', { level: 1, name: '도시인프라' })).toBeVisible();
    for (const label of ['공원', '충전소', '주차장']) {
      await expect(page.getByText(label)).toBeVisible();
    }
  });

  test('잘못된 그룹 slug는 404', async ({ page }) => {
    const res = await page.goto('/life/foo');
    expect(res?.status()).toBe(404);
  });

  test('breadcrumb에 홈 / 생활편의 / 그룹 라벨이 있다', async ({ page }) => {
    await page.goto('/life/amenity');
    await expect(page.getByRole('link', { name: '홈' })).toBeVisible();
    await expect(page.getByRole('link', { name: '생활편의' })).toBeVisible();
  });
});
```

- [ ] **Step 2: e2e 실행해서 실패 확인**

Run: `pnpm playwright test tests/e2e/life-group-hub.spec.ts --project=chromium-desktop`
Expected: FAIL — 페이지 404.

- [ ] **Step 3: 페이지 구현**

`app/(public)/life/[group]/page.tsx` 전체:

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { LIFE_GROUPS, LIFE_ITEM_EMOJI } from '../../_components/life-menu';
import { LifeItemCard } from '../_components/life-item-card';
import type { Metadata } from 'next';

export const revalidate = 86_400;

interface Params { params: Promise<{ group: string }>; }

export async function generateStaticParams() {
  return LIFE_GROUPS.map((g) => ({ group: g.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { group } = await params;
  const g = LIFE_GROUPS.find((x) => x.slug === group);
  if (!g) return {};
  return {
    title: `${g.label} — 우리 동네 생활편의`,
    description: g.intro,
    alternates: { canonical: `/life/${g.slug}` },
  };
}

export default async function LifeGroupHubPage({ params }: Params) {
  const { group } = await params;
  const g = LIFE_GROUPS.find((x) => x.slug === group);
  if (!g) notFound();

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-12">
      <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">{g.label}</span>
      </nav>
      <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">생활편의</p>
      <h1 className="mb-3 text-3xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-4xl">{g.label}</h1>
      <p className="mb-8 text-sm text-[var(--color-muted)]">{g.intro}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {g.items.map((item) => (
          <LifeItemCard key={item.label} item={item} emoji={LIFE_ITEM_EMOJI[item.label] ?? '📍'} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: tsc + e2e 통과 확인**

Run: `pnpm tsc --noEmit`
Expected: 0 error.

Run: `pnpm playwright test tests/e2e/life-group-hub.spec.ts --project=chromium-desktop`
Expected: PASS — 6 tests.

- [ ] **Step 5: 커밋**

```bash
git add app/\(public\)/life/\[group\]/page.tsx tests/e2e/life-group-hub.spec.ts
git commit -m "feat(life): /life/[group] 그룹 허브 페이지 (4 slug 정적 + 404)"
```

---

## Task 5: 드롭다운/드로어 그룹 라벨 href + 시각 분리

**Files:**
- Modify: `app/(public)/_components/life-dropdown.tsx`
- Modify: `app/(public)/_components/mobile-drawer.tsx`
- Modify: `tests/e2e/life-menu.spec.ts`

- [ ] **Step 1: e2e 갱신**

`tests/e2e/life-menu.spec.ts` 전체를 다음으로 교체:

```ts
import { test, expect } from '@playwright/test';

test.describe('데스크톱 생활편의 드롭다운', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, '모바일은 드로어 아코디언 사용');

  test('그룹 라벨 클릭 → /life/${slug} 허브 이동', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '생활편의' }).click();
    const panel = page.getByTestId('life-dropdown');
    await expect(panel).toBeVisible();

    await panel.getByRole('link', { name: /교육시설/ }).click();
    await expect(page).toHaveURL('/life/education');
  });

  test('하위 항목(학교) 클릭 → /school LIST', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '생활편의' }).click();
    await page.getByTestId('life-dropdown').getByRole('link', { name: '학교' }).click();
    await expect(page).toHaveURL('/school');
  });

  test('미빌드 항목(약국) 클릭 시 Soon 모달이 뜬다', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '생활편의' }).click();
    await page.getByTestId('life-dropdown').getByRole('button', { name: '약국' }).click();
    await expect(page.getByText('약국 정보는 곧 만나요')).toBeVisible();
  });
});

test.describe('모바일 생활편의 아코디언', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 9999) >= 768, '데스크톱은 드롭다운 사용');

  test('아코디언을 펼치고 그룹 라벨로 /life/${slug} 이동', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '메뉴 열기' }).click();
    const drawer = page.getByTestId('mobile-drawer');
    await drawer.getByRole('button', { name: '생활편의' }).click();
    await drawer.getByRole('link', { name: /상권·편의/ }).click();
    await expect(page).toHaveURL('/life/amenity');
  });

  test('아코디언에서 하위 항목(편의점)으로 LIST 이동', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '메뉴 열기' }).click();
    const drawer = page.getByTestId('mobile-drawer');
    await drawer.getByRole('button', { name: '생활편의' }).click();
    await drawer.getByRole('link', { name: '편의점' }).click();
    await expect(page).toHaveURL(/\/amenity\/convenience/);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm playwright test tests/e2e/life-menu.spec.ts`
Expected: FAIL — 그룹 라벨 href가 아직 `/life#${slug}`라 `/life/education`이 아니라 `/life#education`으로 가서 URL 매칭 실패.

- [ ] **Step 3: `life-dropdown.tsx` 수정**

`app/(public)/_components/life-dropdown.tsx`의 그룹 라벨 `<Link>` 블록을 다음으로 교체. (현재 `href={`/life#${group.slug}`}` + `className="mb-1 inline-flex ... text-[13px] font-bold ..."` 부분)

```tsx
              <Link
                href={`/life/${group.slug}`}
                onClick={() => setOpen(false)}
                className="mb-1 flex items-center justify-between gap-1 border-b border-[var(--color-line)] px-2 pb-1.5 text-[14px] font-bold text-[var(--color-blue-dark)] hover:bg-[var(--color-soft)]"
              >
                {group.label}
                <span aria-hidden className="text-[var(--color-muted)]">›</span>
              </Link>
```

- [ ] **Step 4: `mobile-drawer.tsx` 수정**

`app/(public)/_components/mobile-drawer.tsx`의 그룹 라벨 `<Link>` 블록을 다음으로 교체. (현재 `href={`/life#${group.slug}`}` 라인)

```tsx
                <Link
                  href={`/life/${group.slug}`}
                  onClick={onClose}
                  className="mb-1 flex items-center justify-between rounded-lg border-b border-[var(--color-line)] px-2 py-3 text-[14px] font-bold text-[var(--color-blue-dark)] hover:bg-[var(--color-soft)]"
                >
                  {group.label}
                  <span aria-hidden className="text-[var(--color-muted)]">›</span>
                </Link>
```

- [ ] **Step 5: e2e 통과 확인**

Run: `pnpm playwright test tests/e2e/life-menu.spec.ts`
Expected: PASS — 5 tests (데스크톱 3 + 모바일 2).

- [ ] **Step 6: tsc 확인 + 커밋**

Run: `pnpm tsc --noEmit`
Expected: 0 error.

```bash
git add app/\(public\)/_components/life-dropdown.tsx app/\(public\)/_components/mobile-drawer.tsx tests/e2e/life-menu.spec.ts
git commit -m "feat(nav): 그룹 라벨을 /life/[group] 허브로 + 14px·구분선 시각 분리"
```

---

## Task 6: `/life` 인덱스 섹션 헤더에 "더보기 →" 링크

**Files:**
- Modify: `app/(public)/life/page.tsx`

> e2e는 Task 4의 spec과 겹쳐 별도 spec 추가 X — 대신 `life-menu.spec.ts`에 1개 시나리오 추가.

- [ ] **Step 1: 실패 e2e 추가**

`tests/e2e/life-menu.spec.ts`의 마지막에 다음 describe 추가:

```ts
test.describe('/life 인덱스 → 그룹 허브', () => {
  test('각 그룹 섹션 헤더의 "더보기" 링크가 /life/[group]으로 이동한다', async ({ page }) => {
    await page.goto('/life');
    const moreLinks = page.getByRole('link', { name: /더보기/ });
    await expect(moreLinks).toHaveCount(4);

    await page.goto('/life');
    await page.locator('section#amenity').getByRole('link', { name: /더보기/ }).click();
    await expect(page).toHaveURL('/life/amenity');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm playwright test tests/e2e/life-menu.spec.ts -g "더보기"`
Expected: FAIL — "더보기" 링크 0개.

- [ ] **Step 3: `life/page.tsx` 수정**

`app/(public)/life/page.tsx`의 그룹 섹션 렌더 부분(`<h2 ...>{group.label}</h2>` 직후)을 다음으로 교체. 기존 `<h2>{group.label}</h2>`를 헤더 줄로 감싸 "더보기 →" 링크 추가:

```tsx
import Link from 'next/link';
// ... (기존 import에 Link 없으면 추가)

// ... 그룹 섹션 매핑 안에서:
        {LIFE_GROUPS.map((group) => (
          <section key={group.slug} id={group.slug} className="scroll-mt-20">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="text-xl font-bold text-[var(--color-blue-dark)]">{group.label}</h2>
              <Link
                href={`/life/${group.slug}`}
                className="text-sm font-semibold text-[var(--color-blue)] hover:underline"
              >
                더보기 →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {group.items.map((item) => (
                <LifeItemCard key={item.label} item={item} emoji={LIFE_ITEM_EMOJI[item.label] ?? '📍'} />
              ))}
            </div>
          </section>
        ))}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm playwright test tests/e2e/life-menu.spec.ts -g "더보기"`
Expected: PASS — 1 test.

- [ ] **Step 5: tsc + 커밋**

Run: `pnpm tsc --noEmit`
Expected: 0 error.

```bash
git add app/\(public\)/life/page.tsx tests/e2e/life-menu.spec.ts
git commit -m "feat(life): /life 섹션 헤더에 '더보기 →' 링크 (각 그룹 허브 연결)"
```

---

## Task 7: amenity LIST에 SiblingTabs 마운트

**Files:**
- Modify: `app/(public)/amenity/[category]/page.tsx`
- Create: `tests/e2e/sibling-tabs.spec.ts`

- [ ] **Step 1: 실패 e2e 작성**

`tests/e2e/sibling-tabs.spec.ts` 전체:

```ts
import { test, expect } from '@playwright/test';

test.describe('amenity LIST sibling 탭', () => {
  test('편의점 LIST에 4개 상권·편의 탭, 편의점이 활성', async ({ page }) => {
    await page.goto('/amenity/convenience');
    const tabs = page.getByTestId('sibling-tabs');
    await expect(tabs).toBeVisible();
    for (const label of ['편의점', '마트', '카페', '전통시장']) {
      await expect(tabs.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(tabs.getByText('편의점', { exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('편의점 LIST에서 마트 탭 클릭 → /amenity/mart 이동', async ({ page }) => {
    await page.goto('/amenity/convenience');
    await page.getByTestId('sibling-tabs').getByRole('link', { name: '마트', exact: true }).click();
    await expect(page).toHaveURL(/\/amenity\/mart/);
  });

  test('활성 탭(편의점) 클릭은 no-op (URL 변화 없음)', async ({ page }) => {
    await page.goto('/amenity/convenience');
    await page.waitForURL(/\/amenity\/convenience/);
    await page.getByTestId('sibling-tabs').getByRole('link', { name: '편의점', exact: true }).click();
    // 살짝 기다린 뒤 여전히 같은 URL
    await page.waitForTimeout(200);
    expect(page.url()).toMatch(/\/amenity\/convenience/);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm playwright test tests/e2e/sibling-tabs.spec.ts -g "amenity"`
Expected: FAIL — `data-testid="sibling-tabs"` 요소 없음.

- [ ] **Step 3: amenity LIST 페이지 수정**

`app/(public)/amenity/[category]/page.tsx`의 import 블록에 추가:

```ts
import { SiblingTabs } from '../../_components/sibling-tabs';
```

그리고 hero 박스(`<div className="mb-6 rounded-[26px] border ...">...</div>`) 직후, `<Suspense><AmenityMobileFilterSheet ... /></Suspense>` 직전에 다음 한 줄 추가:

```tsx
      <SiblingTabs currentHref={`/amenity/${category}`} />
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm playwright test tests/e2e/sibling-tabs.spec.ts -g "amenity"`
Expected: PASS — 3 tests.

- [ ] **Step 5: tsc + 커밋**

Run: `pnpm tsc --noEmit`
Expected: 0 error.

```bash
git add app/\(public\)/amenity/\[category\]/page.tsx tests/e2e/sibling-tabs.spec.ts
git commit -m "feat(amenity): LIST hero 아래 sibling 탭 마운트 (상권·편의 4종)"
```

---

## Task 8: school LIST에 SiblingTabs 마운트 + Soon 탭 e2e

**Files:**
- Modify: `app/(public)/school/page.tsx`
- Modify: `tests/e2e/sibling-tabs.spec.ts`

- [ ] **Step 1: 실패 e2e 추가**

`tests/e2e/sibling-tabs.spec.ts` 마지막에 다음 describe 추가:

```ts
test.describe('school LIST sibling 탭', () => {
  test('학교 LIST에 학교/어린이집(Soon) 탭, 학교가 활성', async ({ page }) => {
    await page.goto('/school');
    const tabs = page.getByTestId('sibling-tabs');
    await expect(tabs).toBeVisible();
    await expect(tabs.getByText('학교', { exact: true })).toBeVisible();
    await expect(tabs.getByText('어린이집')).toBeVisible();
    await expect(tabs.getByText('Soon')).toBeVisible();
    await expect(tabs.getByRole('link', { name: '학교', exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('어린이집(Soon) 탭 클릭 → SoonModal', async ({ page }) => {
    await page.goto('/school');
    await page.getByTestId('sibling-tabs').getByRole('button', { name: /어린이집/ }).click();
    await expect(page.getByText('어린이집 정보는 곧 만나요')).toBeVisible();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm playwright test tests/e2e/sibling-tabs.spec.ts -g "school"`
Expected: FAIL — `sibling-tabs` 미마운트.

- [ ] **Step 3: school LIST 수정**

`app/(public)/school/page.tsx`의 import 블록에 추가:

```ts
import { SiblingTabs } from '../_components/sibling-tabs';
```

그리고 hero 박스(`<div className="mb-6 rounded-[26px] border ...">...</div>`) 직후, `<Suspense><SchoolMobileFilterSheet ... /></Suspense>` 직전에 추가:

```tsx
      <SiblingTabs currentHref="/school" />
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm playwright test tests/e2e/sibling-tabs.spec.ts -g "school"`
Expected: PASS — 2 tests.

- [ ] **Step 5: tsc + 커밋**

Run: `pnpm tsc --noEmit`
Expected: 0 error.

```bash
git add app/\(public\)/school/page.tsx tests/e2e/sibling-tabs.spec.ts
git commit -m "feat(school): LIST hero 아래 sibling 탭 (학교 + 어린이집 Soon)"
```

---

## Task 9: sitemap에 그룹 허브 4 URL 추가

**Files:**
- Modify: `app/sitemap.ts`
- Create: `tests/lib/sitemap.test.ts`

- [ ] **Step 1: `STATIC_ENTRIES` export 가능하도록 분리 + 실패 테스트 작성**

`tests/lib/sitemap.test.ts` 전체:

```ts
import { describe, it, expect } from 'vitest';
import { STATIC_ENTRIES } from '@/app/sitemap';
import { LIFE_GROUPS } from '@/app/(public)/_components/life-menu';

describe('sitemap STATIC_ENTRIES', () => {
  it('/life 자체 URL을 포함한다', () => {
    expect(STATIC_ENTRIES.some((e) => e.url.endsWith('/life'))).toBe(true);
  });

  it('LIFE_GROUPS의 4개 그룹 허브 URL을 모두 포함한다', () => {
    for (const g of LIFE_GROUPS) {
      expect(
        STATIC_ENTRIES.some((e) => e.url.endsWith(`/life/${g.slug}`)),
        `missing entry for /life/${g.slug}`,
      ).toBe(true);
    }
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest --run tests/lib/sitemap.test.ts`
Expected: FAIL — `STATIC_ENTRIES`가 export되지 않음 또는 `/life/[group]` 엔트리 없음.

- [ ] **Step 3: `app/sitemap.ts` 수정**

`STATIC_ENTRIES` 선언을 `export const STATIC_ENTRIES`로 변경하고, 배열 안 `{ url: `${SITE}/life`, ... }` 줄 바로 다음에 4 그룹 허브 URL을 LIFE_GROUPS 기반으로 추가. 파일 상단 import에 `LIFE_GROUPS` 추가:

```ts
import { LIFE_GROUPS } from '@/app/(public)/_components/life-menu';
```

그리고 `STATIC_ENTRIES`를 다음으로 교체:

```ts
export const STATIC_ENTRIES: MetadataRoute.Sitemap = [
  { url: `${SITE}/`, changeFrequency: 'daily', priority: 1.0 },
  { url: `${SITE}/apt`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE}/officetel`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE}/villa`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE}/region`, changeFrequency: 'weekly', priority: 0.8 },
  { url: `${SITE}/life`, changeFrequency: 'weekly', priority: 0.8 },
  ...LIFE_GROUPS.map((g) => ({
    url: `${SITE}/life/${g.slug}`,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  })),
  { url: `${SITE}/school`, changeFrequency: 'weekly', priority: 0.8 },
  { url: `${SITE}/school/regions`, changeFrequency: 'weekly', priority: 0.7 },
  ...AMENITY_SLUGS.flatMap((slug) => [
    { url: `${SITE}/amenity/${slug}`, changeFrequency: 'weekly' as const, priority: 0.8 },
    { url: `${SITE}/amenity/${slug}/regions`, changeFrequency: 'weekly' as const, priority: 0.7 },
  ]),
];
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest --run tests/lib/sitemap.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: tsc + 커밋**

Run: `pnpm tsc --noEmit`
Expected: 0 error.

```bash
git add app/sitemap.ts tests/lib/sitemap.test.ts
git commit -m "feat(sitemap): /life/[group] 4개 그룹 허브 URL 추가"
```

---

## Task 10: 최종 검증 + PR open

**Files:** 없음 — 검증만.

- [ ] **Step 1: 전체 vitest**

Run: `pnpm vitest --run`
Expected: 신규 `life/sibling-tabs.test.ts`, 수정 `life-menu.test.ts`, 신규 `sitemap.test.ts` 모두 PASS. 기존 무관 실패(`tests/ingest/property-matcher.test.ts`)는 main 동일이라 무시.

- [ ] **Step 2: 전체 tsc**

Run: `pnpm tsc --noEmit`
Expected: 0 error.

- [ ] **Step 3: 새로 추가/수정한 e2e 스펙만 빠르게**

Run: `pnpm playwright test tests/e2e/life-menu.spec.ts tests/e2e/life-group-hub.spec.ts tests/e2e/sibling-tabs.spec.ts`
Expected: 전부 PASS (chromium-desktop + chromium-mobile 양 프로젝트, skip 적절히).

- [ ] **Step 4: 브랜치 push + PR open**

```bash
git push -u origin feature/life-group-hub
gh pr create --base feature/amenity-flow-redesign --head feature/life-group-hub --title "feat(life): 그룹 허브 페이지 + LIST sibling 탭 (PR #5 후속)" --body "$(cat <<'EOF'
## Summary

- 드롭다운/드로어 그룹 라벨(`교육시설`/`의료시설`/`상권·편의`/`도시인프라`)을 14px + 라벨 아래 구분선으로 시각 분리
- 그룹 라벨 클릭 → `/life/[group]` **신규 허브 페이지** (해당 그룹 하위 카테고리만 노출). slug 4개 정적 생성, 잘못된 slug → 404
- LIST 화면(`/school`, `/amenity/[category]`) hero 박스 바로 아래에 **underline sibling 탭** 마운트 — 같은 그룹의 live + Soon 모두 표시, Soon 클릭 시 SoonModal
- `LIFE_GROUPS` 단일 진실 소스가 nav/`/life` 인덱스/그룹 허브/sibling 탭/sitemap 5곳을 자동 동기화

## 주요 변경

**데이터/헬퍼**
- `LifeGroup.intro` 필드 추가, `LIFE_ITEM_EMOJI` 공용 매핑 export
- `lib/life/sibling-tabs.ts` — `getSiblingTabs(currentHref)` (LIFE_GROUPS에서 href 정확 일치로 그룹 역추출)

**라우트**
- `/life/[group]/page.tsx` 신규 — `generateStaticParams` 4개, `notFound()`, canonical `/life/${slug}`

**컴포넌트**
- `SiblingTabs` — underline 탭, 활성 클릭 = preventDefault (no-op), Soon = 자체 SoonModal hoist

**기타**
- `/life` 인덱스 각 그룹 섹션 헤더에 "더보기 →" 링크
- `app/sitemap.ts` STATIC_ENTRIES에 4개 그룹 허브 URL

## 검증

- vitest: 신규 `lib/life/sibling-tabs.test.ts`, 갱신 `lib/life-menu.test.ts`, 신규 `lib/sitemap.test.ts` PASS
- tsc: 0 error
- playwright: `life-menu.spec.ts` 갱신, `life-group-hub.spec.ts` 신규, `sibling-tabs.spec.ts` 신규 PASS

## Test Plan

- [ ] 데스크톱 드롭다운 `상권·편의` 라벨 → `/life/amenity` (4 카드만)
- [ ] 모바일 드로어 `상권·편의` 라벨 → `/life/amenity`
- [ ] `/life` 각 섹션 헤더 "더보기 →" → `/life/[group]`
- [ ] `/life/foo` → 404
- [ ] `/amenity/convenience` LIST에 4개 sibling 탭, 마트 클릭 → `/amenity/mart`
- [ ] `/school` LIST에 학교(active) + 어린이집(Soon) 탭, 어린이집 클릭 → SoonModal
- [ ] 활성 탭(편의점) 클릭 = no-op
- [ ] 모바일 LIST 탭도 동일 동작

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR open. URL을 사용자에게 보고.

---

## 작업 완료 후 (Notes)

- 이 PR은 `feature/amenity-flow-redesign` (PR #5)을 베이스로 한다. PR #5가 머지되면 base 브랜치가 자동으로 main으로 떨어진다 (또는 머지 시점에 rebase).
- DETAIL 페이지에는 의도적으로 sibling 탭을 마운트하지 않음 (스펙 §9 — 스코프 가드).
- `lib/life/sibling-tabs.ts`의 정확 일치 매칭은 호출부가 path 부분만 넘긴다는 전제다. 쿼리/해시가 포함되면 의도적으로 null을 반환해 탭이 마운트되지 않는다.
