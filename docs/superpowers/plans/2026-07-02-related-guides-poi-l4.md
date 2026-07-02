# L4 POI 관련가이드 블록 배선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** POI/매물 상세 12개 페이지 하단에, 페이지 카테고리에 매핑된 PUBLISHED 가이드 최대 3편을 링크하는 "관련 가이드" 블록을 추가한다.

**Architecture:** 신규 서버 컴포넌트 `related-guides.tsx`를 만든다. 순수 sync 뷰(`RelatedGuidesView`)가 렌더/빈-블록 가드를 담당하고, 얇은 async 래퍼(`RelatedGuides`)가 기존 헬퍼 `guideCategoryForPage`·`getGuidesByCategory`로 데이터를 조회해 뷰에 넘긴다. `BoardBriefingSection`의 self-fetch→null 패턴을 그대로 따른다.

**Tech Stack:** Next.js App Router(RSC), TypeScript, Prisma(기존 쿼리 재사용), Vitest + react-dom/server(SSR 단위 테스트).

## Global Constraints

- 헤딩 텍스트는 정확히 `관련 가이드`. 보조문구는 `실제 절차·개념을 정리한 안내 글`.
- 가이드 카드는 **제목 링크만** — 요약·날짜·카테고리 배지 금지(spec §5 YAGNI).
- 가이드 링크 경로는 `/guide/{slug}`.
- limit 기본값 3.
- 매핑 없는 pageKey거나 가이드 0편이면 **아무것도 렌더하지 않는다**(빈 `<section>` 금지).
- 각 페이지에서 `<RelatedGuides .../>`는 기존 `<BoardBriefingSection .../>` **바로 아래 줄**에 삽입한다.
- 스페이싱: sibling `BoardBriefingSection`이 쓰는 `className`을 그대로 미러링한다(bare→bare, `mt-10`→`mt-10`, `mt-16`→`mt-16`). `heading` prop은 미러링하지 않는다.
- import 경로 스타일은 각 페이지의 기존 `board-briefing-section` import 스타일과 동일하게 쓴다(alias `@/app/(public)/_components/related-guides` 또는 상대 `../../_components/related-guides`).
- urban(공원·주차장)·charger·board 페이지에는 배선하지 않는다.

---

## File Structure

- Create: `app/(public)/_components/related-guides.tsx` — 순수 뷰 + async 래퍼 두 export.
- Create: `tests/components/related-guides-ssr.test.ts` — 뷰 SSR 단위 테스트.
- Modify: 12개 POI 상세 `page.tsx` — import 1줄 + 렌더 1줄씩.

---

### Task 1: RelatedGuides 컴포넌트 + SSR 테스트

**Files:**
- Create: `app/(public)/_components/related-guides.tsx`
- Test: `tests/components/related-guides-ssr.test.ts`

**Interfaces:**
- Consumes:
  - `guideCategoryForPage(pageKey: string): GuideCategory | null` — `@/lib/guide/page-category`
  - `getGuidesByCategory(category: GuideCategory, limit?: number): Promise<RelatedGuideItem[]>` — `@/lib/guide/queries`
  - `RelatedGuideItem = { id: bigint; slug: string; title: string }` — `@/lib/guide/queries`
- Produces (later tasks rely on these exact names/props):
  - `RelatedGuides({ pageKey: string; className?: string; limit?: number })` — async 서버 컴포넌트, 기본 진입점.
  - `RelatedGuidesView({ items: RelatedGuideItem[]; className?: string })` — 순수 sync 뷰(테스트 대상).

- [ ] **Step 1: Write the failing test**

Create `tests/components/related-guides-ssr.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RelatedGuidesView } from '@/app/(public)/_components/related-guides';
import type { RelatedGuideItem } from '@/lib/guide/queries';

// 컴포넌트는 자동 JSX 런타임을 쓰지만 vitest(esbuild)는 classic 런타임으로 변환해
// React.createElement를 전역에서 찾는다. 전역 shim으로 맞춘다.(hospital-tabs-ssr.test.ts와 동일)
(globalThis as unknown as { React: typeof React }).React = React;

describe('RelatedGuidesView SSR', () => {
  it('가이드가 있으면 헤딩·제목·/guide/{slug} 링크를 렌더한다', () => {
    const items: RelatedGuideItem[] = [
      { id: 1n, slug: 'night-hospital', title: '야간·공휴일 병원 찾기' },
      { id: 2n, slug: 'pick-department', title: '진료과 선택하는 법' },
    ];
    const html = renderToStaticMarkup(createElement(RelatedGuidesView, { items }));
    expect(html).toContain('관련 가이드');
    expect(html).toContain('야간·공휴일 병원 찾기');
    expect(html).toContain('href="/guide/night-hospital"');
    expect(html).toContain('href="/guide/pick-department"');
  });

  it('가이드가 없으면 아무것도 렌더하지 않는다', () => {
    const html = renderToStaticMarkup(createElement(RelatedGuidesView, { items: [] }));
    expect(html).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/related-guides-ssr.test.ts`
Expected: FAIL — `related-guides` 모듈이 없어 import 에러("Failed to resolve import" 또는 `RelatedGuidesView is not defined").

- [ ] **Step 3: Write the component**

Create `app/(public)/_components/related-guides.tsx`:

```tsx
import Link from 'next/link';
import { guideCategoryForPage } from '@/lib/guide/page-category';
import { getGuidesByCategory, type RelatedGuideItem } from '@/lib/guide/queries';

/**
 * POI/매물 상세 하단 '관련 가이드' 섹션의 순수 표현 뷰.
 * items가 비면 렌더하지 않는다(빈 블록 금지).
 */
export function RelatedGuidesView({
  items,
  className,
}: {
  items: RelatedGuideItem[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <section className={className}>
      <div className="flex flex-wrap items-end justify-between gap-x-2.5 gap-y-1">
        <div>
          <h2 className="text-xl font-black tracking-tight md:text-[22px]">관련 가이드</h2>
          <p className="mt-1 text-[13px] text-[var(--color-muted)]">실제 절차·개념을 정리한 안내 글</p>
        </div>
        <Link href="/guide" className="text-[13px] font-bold text-[var(--color-blue)] hover:underline">
          전체 보기 →
        </Link>
      </div>

      <div className="mt-[18px] grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((g) => (
          <Link
            key={g.slug}
            href={`/guide/${g.slug}`}
            className="flex flex-col rounded-[20px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] transition hover:border-[var(--color-blue)]"
          >
            <h3 className="line-clamp-2 text-[15px] font-black leading-snug tracking-tight text-[var(--color-blue-dark)]">
              {g.title}
            </h3>
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * 관련 가이드 블록(async 데이터 래퍼).
 * pageKey가 GuideCategory에 매핑되지 않거나 PUBLISHED 가이드가 없으면 null.
 */
export async function RelatedGuides({
  pageKey,
  className,
  limit = 3,
}: {
  pageKey: string;
  className?: string;
  limit?: number;
}) {
  const category = guideCategoryForPage(pageKey);
  if (!category) return null;
  const items = await getGuidesByCategory(category, limit);
  return <RelatedGuidesView items={items} className={className} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/components/related-guides-ssr.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 5: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: 에러 없음(신규 파일 관련 에러 0).

- [ ] **Step 6: Commit**

```bash
git add app/(public)/_components/related-guides.tsx tests/components/related-guides-ssr.test.ts
git commit -m "feat(guide): 관련가이드 블록 컴포넌트(RelatedGuides/View) + SSR 테스트"
```

---

### Task 2: 12개 POI 상세 페이지에 배선

**Files (각 파일: import 1줄 추가 + `<BoardBriefingSection.../>` 아래에 렌더 1줄 추가):**
- Modify: `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx` (import 스타일: `@/app/(public)/_components/`)
- Modify: `app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx` (`@/app/(public)/_components/`)
- Modify: `app/(public)/childcare/[sigunguCode]/[id]/page.tsx` (`@/app/(public)/_components/`)
- Modify: `app/(public)/school/[sigunguCode]/[id]/page.tsx` (`@/app/(public)/_components/`)
- Modify: `app/(public)/apt/[id]/page.tsx` (`../../_components/`)
- Modify: `app/(public)/villa/[id]/page.tsx` (`../../_components/`)
- Modify: `app/(public)/officetel/[id]/page.tsx` (`../../_components/`)
- Modify: `app/(public)/subscription/[id]/page.tsx` (`../../_components/`)
- Modify: `app/(public)/finance/[seq]/page.tsx` (`../../_components/`)
- Modify: `app/(public)/jeonse-guarantee/[grntDvcd]/page.tsx` (`@/app/(public)/_components/`)
- Modify: `app/(public)/amenity/[category]/[id]/page.tsx` (`@/app/(public)/_components/`)
- Modify: `app/(public)/life/[group]/page.tsx` (`../../_components/`)

**Interfaces:**
- Consumes: `RelatedGuides({ pageKey, className?, limit? })` from Task 1.

**배선 규칙(모든 페이지 공통):**
1. 기존 `import { BoardBriefingSection } from '<X>/board-briefing-section';` 아래에 같은 스타일로 한 줄 추가:
   `import { RelatedGuides } from '<X>/related-guides';` (`<X>`는 그 페이지가 쓰는 alias 또는 상대경로와 동일).
2. 기존 `<BoardBriefingSection ... />` 렌더 **바로 아래 줄**에 `<RelatedGuides pageKey="<KEY>" ... />`를 추가. 들여쓰기는 sibling과 동일. `className`은 sibling의 것을 미러링(bare면 bare).

**페이지별 pageKey + className:**

| 페이지 | pageKey | RelatedGuides className |
|---|---|---|
| medical/hospital | `medical/hospital` | (없음) |
| medical/pharmacy | `medical/pharmacy` | (없음) |
| childcare | `childcare` | (없음) |
| school | `school` | (없음) |
| apt | `apt` | (없음) |
| villa | `villa` | (없음) |
| officetel | `officetel` | (없음) |
| subscription | `subscription` | (없음) |
| finance | `finance` | (없음) |
| amenity | `amenity` | (없음) |
| jeonse-guarantee | `jeonse-guarantee` | `mt-10` |
| life | `life` | `mt-16` |

- [ ] **Step 1: hospital 배선**

`app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx`
import(line 18 아래):
```tsx
import { RelatedGuides } from '@/app/(public)/_components/related-guides';
```
render(line 138 `<BoardBriefingSection />` 아래):
```tsx
          <RelatedGuides pageKey="medical/hospital" />
```

- [ ] **Step 2: pharmacy 배선**

`app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx`
import:
```tsx
import { RelatedGuides } from '@/app/(public)/_components/related-guides';
```
render(`<BoardBriefingSection />` 아래):
```tsx
          <RelatedGuides pageKey="medical/pharmacy" />
```

- [ ] **Step 3: childcare 배선**

`app/(public)/childcare/[sigunguCode]/[id]/page.tsx`
import:
```tsx
import { RelatedGuides } from '@/app/(public)/_components/related-guides';
```
render:
```tsx
          <RelatedGuides pageKey="childcare" />
```

- [ ] **Step 4: school 배선**

`app/(public)/school/[sigunguCode]/[id]/page.tsx`
import:
```tsx
import { RelatedGuides } from '@/app/(public)/_components/related-guides';
```
render:
```tsx
          <RelatedGuides pageKey="school" />
```

- [ ] **Step 5: apt 배선**

`app/(public)/apt/[id]/page.tsx`
import:
```tsx
import { RelatedGuides } from '../../_components/related-guides';
```
render:
```tsx
          <RelatedGuides pageKey="apt" />
```

- [ ] **Step 6: villa 배선**

`app/(public)/villa/[id]/page.tsx`
import:
```tsx
import { RelatedGuides } from '../../_components/related-guides';
```
render:
```tsx
          <RelatedGuides pageKey="villa" />
```

- [ ] **Step 7: officetel 배선**

`app/(public)/officetel/[id]/page.tsx`
import:
```tsx
import { RelatedGuides } from '../../_components/related-guides';
```
render:
```tsx
          <RelatedGuides pageKey="officetel" />
```

- [ ] **Step 8: subscription 배선**

`app/(public)/subscription/[id]/page.tsx`
import:
```tsx
import { RelatedGuides } from '../../_components/related-guides';
```
render:
```tsx
          <RelatedGuides pageKey="subscription" />
```

- [ ] **Step 9: finance 배선**

`app/(public)/finance/[seq]/page.tsx`
import:
```tsx
import { RelatedGuides } from '../../_components/related-guides';
```
render:
```tsx
          <RelatedGuides pageKey="finance" />
```

- [ ] **Step 10: amenity 배선**

`app/(public)/amenity/[category]/[id]/page.tsx`
import:
```tsx
import { RelatedGuides } from '@/app/(public)/_components/related-guides';
```
render:
```tsx
          <RelatedGuides pageKey="amenity" />
```

- [ ] **Step 11: jeonse-guarantee 배선(className mt-10)**

`app/(public)/jeonse-guarantee/[grntDvcd]/page.tsx`
import:
```tsx
import { RelatedGuides } from '@/app/(public)/_components/related-guides';
```
render(line 215 `<BoardBriefingSection heading="임장ON 브리핑" className="mt-10" />` 아래, 8칸 들여쓰기):
```tsx
        <RelatedGuides pageKey="jeonse-guarantee" className="mt-10" />
```

- [ ] **Step 12: life 배선(className mt-16)**

`app/(public)/life/[group]/page.tsx`
import:
```tsx
import { RelatedGuides } from '../../_components/related-guides';
```
render(line 48 `<BoardBriefingSection className="mt-16" />` 아래, 6칸 들여쓰기):
```tsx
      <RelatedGuides pageKey="life" className="mt-16" />
```

- [ ] **Step 13: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 14: 배선 검증(grep)**

Run:
```bash
grep -rl "RelatedGuides" "app/(public)" | grep "page.tsx" | wc -l
```
Expected: `12`

- [ ] **Step 15: Commit**

```bash
git add "app/(public)"
git commit -m "feat(guide): POI 상세 12곳에 관련가이드 블록 배선(L4)"
```

---

## Self-Review

**1. Spec coverage:**
- 컴포넌트(순수 뷰 + async 래퍼, null 가드) → Task 1 ✓
- 12개 페이지 배선(매핑 키·순서·스페이싱) → Task 2 ✓
- urban/charger/board 제외 → Task 2 대상 목록에서 배제 ✓
- 테스트(뷰 렌더/빈 null) → Task 1 Step 1 ✓; 매핑 커버리지는 기존 `guide-page-category.test.ts` 재사용(spec §4) ✓
- YAGNI(제목 링크만, 배지 없음) → 컴포넌트 카드가 `<h3>` 제목만 ✓

**2. Placeholder scan:** 모든 코드 블록이 실제 코드. TBD/TODO 없음. ✓

**3. Type consistency:** `RelatedGuidesView({ items, className })`·`RelatedGuides({ pageKey, className, limit })`가 Task 1 정의와 Task 2 사용에서 일치. `RelatedGuideItem`은 `@/lib/guide/queries`의 실제 export와 일치. ✓
