# 상권·편의 진입 흐름 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/amenity/[category]` 의 카테고리 허브·지역 picker 2단계 게이트를 제거하고, nav `편의점` 클릭 시 곧장 LIST(시드 `?sido=서울`)로 진입한다. nav 그룹 라벨 `상권·편의`는 `/life#amenity` 앵커로 점프하며, `/life` 는 4 그룹 섹션 구조로 재편된다. DETAIL URL 은 `[sigunguCode]` 세그먼트를 빼 `/amenity/[category]/[id]` 로 단순화한다.

**Architecture:** 카테고리별 어댑터(`lib/amenity/adapters/*.ts`)의 `buildXxxWhere` 에 `sido` 분기를 추가해 행정코드 prefix 매칭으로 시도 좁힘을 처리한다. LIST 페이지는 SSR 단에서 `?sido=서울` 시드 redirect를 강제하고, 기존 `[sigunguCode]/page.tsx` 의 LIST 로직을 부모 `[category]/page.tsx` 로 이전한다. 기존 경로(`/regions`, `/[sigunguCode]`, `/[sigunguCode]/[id]`)는 `next.config.mjs` 의 301 redirect 3종으로 새 URL 로 흡수한다. `/life` 는 `LIFE_GROUPS` 를 그대로 import 해 4 그룹 섹션을 렌더, 그룹 라벨은 nav 양쪽(`life-dropdown`, `mobile-drawer`)에서 `<Link href="/life#{slug}">` 로 전환한다.

**Tech Stack:** Next.js 15 (App Router, RSC), Prisma + PostgreSQL, Vitest, Tailwind. 데이터 마이그레이션 없음.

**참고 스펙:** `docs/superpowers/specs/2026-05-28-amenity-flow-redesign-design.md`

---

## File Structure

### 신규 작성
- `lib/region.ts` — `sidoPrefix`, `sidoFromPrefix` 함수 추가 (정적 매핑)
- `app/(public)/amenity/[category]/page.tsx` — **재작성**. LIST 페이지 (기존 [sigunguCode]/page.tsx 로직 이전 + sido 시드 redirect)
- `app/(public)/amenity/[category]/[id]/page.tsx` — DETAIL 신규 (기존 [sigunguCode]/[id]/page.tsx 로직 이전)
- `tests/lib/region.test.ts` — `sidoPrefix`, `sidoFromPrefix` 테스트

### 수정
- `lib/amenity/category.ts` — `AmenityListFilter` 에 `sido?: string` 추가
- `lib/amenity/adapters/{convenience,mart,cafe,market}.ts` — `buildXxxWhere` 에 `sido` 분기 4건
- `tests/lib/amenity/adapters/{convenience,mart,cafe,market}.test.ts` — sido 케이스 추가
- `app/(public)/_components/life-menu.ts` — `LifeGroup.slug` 필드 추가
- `app/(public)/_components/life-dropdown.tsx` — 그룹 라벨 `<p>` → `<Link>`
- `app/(public)/_components/mobile-drawer.tsx` — 그룹 라벨 `<p>` → `<Link>` + `›` 아이콘
- `app/(public)/life/page.tsx` — 4 그룹 섹션 구조로 재편
- `app/(public)/amenity/[category]/_components/amenity-card.tsx` — detail 링크 형식 변경
- `app/(public)/amenity/[category]/_components/same-category-nearby.tsx` — 링크 형식 변경
- `app/(public)/amenity/[category]/_components/amenity-detail-sidebar.tsx` — 링크 형식 변경 (필요 시)
- `app/(public)/amenity/[category]/_components/amenity-mobile-filter-sheet.tsx` — active count 확장
- `next.config.mjs` — `redirects()` 3종 추가
- `app/sitemap.ts` — URL 패턴 갱신

### 삭제
- `app/(public)/amenity/[category]/regions/page.tsx`
- `app/(public)/amenity/[category]/regions/` (폴더)
- `app/(public)/amenity/[category]/[sigunguCode]/page.tsx`
- `app/(public)/amenity/[category]/[sigunguCode]/[id]/page.tsx`
- `app/(public)/amenity/[category]/[sigunguCode]/` (폴더)

---

## Task 1: `sidoPrefix` / `sidoFromPrefix` 헬퍼

**Files:**
- Modify: `lib/region.ts`
- Test: `tests/lib/region.test.ts`

- [ ] **Step 1: 실패 테스트 작성** (`tests/lib/region.test.ts` 신규)

```ts
import { describe, it, expect } from 'vitest';
import { sidoPrefix, sidoFromPrefix } from '@/lib/region';

describe('sidoPrefix', () => {
  it('짧은 시도명', () => {
    expect(sidoPrefix('서울')).toBe('11');
    expect(sidoPrefix('경기')).toBe('41');
    expect(sidoPrefix('제주')).toBe('50');
  });

  it('풀 시도명 (행정 접미사 포함)', () => {
    expect(sidoPrefix('서울특별시')).toBe('11');
    expect(sidoPrefix('경기도')).toBe('41');
    expect(sidoPrefix('세종특별자치시')).toBe('36');
    expect(sidoPrefix('제주특별자치도')).toBe('50');
    expect(sidoPrefix('부산광역시')).toBe('26');
  });

  it('미존재 시도명', () => {
    expect(sidoPrefix('존재하지않음')).toBeUndefined();
    expect(sidoPrefix('')).toBeUndefined();
  });
});

describe('sidoFromPrefix', () => {
  it('정상 prefix', () => {
    expect(sidoFromPrefix('11')).toBe('서울');
    expect(sidoFromPrefix('41')).toBe('경기');
    expect(sidoFromPrefix('50')).toBe('제주');
  });

  it('미존재 prefix', () => {
    expect(sidoFromPrefix('99')).toBeUndefined();
    expect(sidoFromPrefix('')).toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pnpm vitest run tests/lib/region.test.ts
```
Expected: FAIL — `sidoPrefix is not a function`.

- [ ] **Step 3: 헬퍼 구현** (`lib/region.ts` 끝에 추가)

```ts
const SIDO_PREFIX: Record<string, string> = {
  '서울': '11', '부산': '26', '대구': '27', '인천': '28',
  '광주': '29', '대전': '30', '울산': '31', '세종': '36',
  '경기': '41', '강원': '51', '충북': '43', '충남': '44',
  '전북': '52', '전남': '46', '경북': '47', '경남': '48',
  '제주': '50',
};

export function sidoPrefix(sido: string): string | undefined {
  if (!sido) return undefined;
  return SIDO_PREFIX[sido]
    ?? SIDO_PREFIX[sido.replace(/(특별시|광역시|특별자치시|특별자치도|도)$/, '')];
}

const PREFIX_TO_SIDO: Record<string, string> = Object.fromEntries(
  Object.entries(SIDO_PREFIX).map(([k, v]) => [v, k]),
);

export function sidoFromPrefix(prefix: string): string | undefined {
  if (!prefix) return undefined;
  return PREFIX_TO_SIDO[prefix];
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm vitest run tests/lib/region.test.ts
```
Expected: PASS — 5 assertions.

- [ ] **Step 5: 커밋**

```bash
git add lib/region.ts tests/lib/region.test.ts
git commit -m "feat(region): sidoPrefix/sidoFromPrefix 헬퍼 추가 (행정코드 2자리 ↔ 시도명)"
```

---

## Task 2: `AmenityListFilter.sido` 필드 추가 + 어댑터 4종 분기

**Files:**
- Modify: `lib/amenity/category.ts`
- Modify: `lib/amenity/adapters/convenience.ts`
- Modify: `lib/amenity/adapters/mart.ts`
- Modify: `lib/amenity/adapters/cafe.ts`
- Modify: `lib/amenity/adapters/market.ts`
- Test: `tests/lib/amenity/adapters/{convenience,mart,cafe,market}.test.ts`

- [ ] **Step 1: 인터페이스에 sido 추가** (`lib/amenity/category.ts`)

기존 `AmenityListFilter` 를 다음으로 변경:
```ts
export interface AmenityListFilter {
  sigunguCode?: string;
  sido?: string;          // NEW: 시도명 ('서울', '경기' 등). sigunguCode 가 있으면 무시.
  q?: string;
  sub?: string;
}
```

- [ ] **Step 2: convenience 어댑터 sido 분기 실패 테스트** (`tests/lib/amenity/adapters/convenience.test.ts` 끝에 추가)

```ts
import { sidoPrefix } from '@/lib/region';

it('sido 만 있으면 prefix startsWith', () => {
  expect(buildStoreWhere({ sido: '서울' })).toEqual({
    industryCode: { startsWith: 'G20405' },
    sigunguCode: { startsWith: '11' },
  });
});

it('sigunguCode 가 있으면 sido 는 무시', () => {
  expect(buildStoreWhere({ sido: '서울', sigunguCode: '26110' })).toEqual({
    industryCode: { startsWith: 'G20405' },
    sigunguCode: '26110',
  });
});

it('미존재 시도명은 무시 (전국 fallback)', () => {
  expect(buildStoreWhere({ sido: '존재하지않음' })).toEqual({
    industryCode: { startsWith: 'G20405' },
  });
});
```

- [ ] **Step 3: convenience 실패 확인**

```bash
pnpm vitest run tests/lib/amenity/adapters/convenience.test.ts
```
Expected: FAIL — 3개 새 케이스에서 객체 모양 불일치.

- [ ] **Step 4: convenience 어댑터 구현** (`lib/amenity/adapters/convenience.ts` 의 `buildStoreWhere`)

기존:
```ts
export function buildStoreWhere(f: AmenityListFilter): Prisma.StoreWhereInput {
  const where: Prisma.StoreWhereInput = { industryCode: { startsWith: PREFIX } };
  if (f.sigunguCode) where.sigunguCode = f.sigunguCode;
  if (f.q) where.name = { contains: f.q };
  return where;
}
```

변경 후:
```ts
import { sidoPrefix } from '@/lib/region';
// ...
export function buildStoreWhere(f: AmenityListFilter): Prisma.StoreWhereInput {
  const where: Prisma.StoreWhereInput = { industryCode: { startsWith: PREFIX } };
  if (f.sigunguCode) {
    where.sigunguCode = f.sigunguCode;
  } else if (f.sido) {
    const prefix = sidoPrefix(f.sido);
    if (prefix) where.sigunguCode = { startsWith: prefix };
  }
  if (f.q) where.name = { contains: f.q };
  return where;
}
```

- [ ] **Step 5: convenience 테스트 통과 확인**

```bash
pnpm vitest run tests/lib/amenity/adapters/convenience.test.ts
```
Expected: PASS (기존 4 + 신규 3 = 7).

- [ ] **Step 6: cafe 어댑터에 sido 분기 추가**

`tests/lib/amenity/adapters/cafe.test.ts` 에 다음 3 케이스 추가:

```ts
import { sidoPrefix } from '@/lib/region';

it('sido 만 있으면 prefix startsWith', () => {
  expect(buildCafeWhere({ sido: '서울' })).toEqual({
    industryCode: { startsWith: 'I21201' },
    sigunguCode: { startsWith: '11' },
  });
});

it('sigunguCode 가 있으면 sido 는 무시', () => {
  expect(buildCafeWhere({ sido: '서울', sigunguCode: '26110' })).toEqual({
    industryCode: { startsWith: 'I21201' },
    sigunguCode: '26110',
  });
});

it('미존재 시도명은 무시 (전국 fallback)', () => {
  expect(buildCafeWhere({ sido: '존재하지않음' })).toEqual({
    industryCode: { startsWith: 'I21201' },
  });
});
```

테스트 실패 확인:
```bash
pnpm vitest run tests/lib/amenity/adapters/cafe.test.ts
```
Expected: FAIL.

`lib/amenity/adapters/cafe.ts` 의 `buildCafeWhere` 변경:
```ts
import { sidoPrefix } from '@/lib/region';
// ...
export function buildCafeWhere(f: AmenityListFilter): Prisma.StoreWhereInput {
  const where: Prisma.StoreWhereInput = { industryCode: { startsWith: PREFIX } };
  if (f.sigunguCode) {
    where.sigunguCode = f.sigunguCode;
  } else if (f.sido) {
    const prefix = sidoPrefix(f.sido);
    if (prefix) where.sigunguCode = { startsWith: prefix };
  }
  if (f.q) where.name = { contains: f.q };
  return where;
}
```

테스트 통과 확인:
```bash
pnpm vitest run tests/lib/amenity/adapters/cafe.test.ts
```
Expected: PASS.

- [ ] **Step 7: mart 어댑터에 동일 분기 추가**

`tests/lib/amenity/adapters/mart.test.ts` 에 3 케이스 추가하되, mart 는 `OR` 분기가 있어 케이스 모양 주의:

```ts
it('sido 만 있을 때 sigunguCode prefix + 마트 OR', () => {
  expect(buildMartWhere({ sido: '서울' })).toEqual({
    sigunguCode: { startsWith: '11' },
    OR: [
      { industryCode: { startsWith: 'G20404' } },
      { industryCode: { startsWith: 'G20402' } },
    ],
  });
});
it('sigunguCode 가 있으면 sido 는 무시', () => {
  expect(buildMartWhere({ sigunguCode: '11680', sido: '서울' })).toEqual({
    sigunguCode: '11680',
    OR: [
      { industryCode: { startsWith: 'G20404' } },
      { industryCode: { startsWith: 'G20402' } },
    ],
  });
});
it('sub=hyper + sido', () => {
  expect(buildMartWhere({ sido: '서울', sub: 'hyper' })).toEqual({
    sigunguCode: { startsWith: '11' },
    industryCode: { startsWith: 'G20402' },
  });
});
```

`lib/amenity/adapters/mart.ts` 의 `buildMartWhere` 에 sido 분기 추가:

```ts
import { sidoPrefix } from '@/lib/region';
// ...
export function buildMartWhere(f: AmenityListFilter): Prisma.StoreWhereInput {
  const where: Prisma.StoreWhereInput = {};
  if (f.sigunguCode) {
    where.sigunguCode = f.sigunguCode;
  } else if (f.sido) {
    const prefix = sidoPrefix(f.sido);
    if (prefix) where.sigunguCode = { startsWith: prefix };
  }
  const sub = normalizeSub(f.sub);
  if (sub === 'super') where.industryCode = { startsWith: PREFIX_SUPER };
  else if (sub === 'hyper') where.industryCode = { startsWith: PREFIX_HYPER };
  else
    where.OR = [
      { industryCode: { startsWith: PREFIX_SUPER } },
      { industryCode: { startsWith: PREFIX_HYPER } },
    ];
  if (f.q) where.name = { contains: f.q };
  return where;
}
```

```bash
pnpm vitest run tests/lib/amenity/adapters/mart.test.ts
```
Expected: PASS.

- [ ] **Step 8: market 어댑터에 동일 분기 추가**

`tests/lib/amenity/adapters/market.test.ts` 에 3 케이스 추가. market 어댑터는 `else where.sigunguCode = { not: null }` 분기가 있어 sido 분기는 그 자리를 대체:

```ts
it('sido 만 있을 때 sigunguCode prefix', () => {
  expect(buildMarketWhere({ sido: '서울' })).toEqual({
    sigunguCode: { startsWith: '11' },
  });
});
it('sigunguCode 가 있으면 sido 는 무시', () => {
  expect(buildMarketWhere({ sido: '서울', sigunguCode: '11680' })).toEqual({
    sigunguCode: '11680',
  });
});
it('sido 둘 다 없으면 sigunguCode is not null 만 (기존 동작)', () => {
  expect(buildMarketWhere({})).toEqual({
    sigunguCode: { not: null },
  });
});
```

`lib/amenity/adapters/market.ts` 의 `buildMarketWhere`:

```ts
import { sidoPrefix } from '@/lib/region';
// ...
export function buildMarketWhere(f: AmenityListFilter): Prisma.TraditionalMarketWhereInput {
  const where: Prisma.TraditionalMarketWhereInput = {};
  if (f.sigunguCode) {
    where.sigunguCode = f.sigunguCode;
  } else if (f.sido) {
    const prefix = sidoPrefix(f.sido);
    if (prefix) where.sigunguCode = { startsWith: prefix };
    else where.sigunguCode = { not: null };
  } else {
    where.sigunguCode = { not: null };
  }
  const sub = normalizeSub(f.sub);
  if (sub === 'permanent') where.marketType = { contains: '상설' };
  else if (sub === 'periodic')
    where.OR = [
      { marketType: { contains: '정기' } },
      { marketType: { contains: '일장' } },
    ];
  if (f.q) where.name = { contains: f.q };
  return where;
}
```

```bash
pnpm vitest run tests/lib/amenity/adapters/market.test.ts
```
Expected: PASS.

- [ ] **Step 9: 전체 amenity 테스트 회귀**

```bash
pnpm vitest run tests/lib/amenity
```
Expected: PASS, 회귀 없음.

- [ ] **Step 10: 커밋**

```bash
git add lib/amenity/category.ts lib/amenity/adapters tests/lib/amenity/adapters
git commit -m "feat(amenity): AmenityListFilter.sido 지원 (어댑터 4종 buildXxxWhere 분기)"
```

---

## Task 3: `LifeGroup.slug` 필드 추가

**Files:**
- Modify: `app/(public)/_components/life-menu.ts`

- [ ] **Step 1: 인터페이스에 slug 필드 추가**

기존 `LifeGroup`:
```ts
export interface LifeGroup {
  label: string;
  items: LifeSubItem[];
}
```

변경 후:
```ts
export type LifeGroupSlug = 'education' | 'medical' | 'amenity' | 'urban';

export interface LifeGroup {
  slug: LifeGroupSlug;
  label: string;
  items: LifeSubItem[];
}
```

- [ ] **Step 2: 4 그룹에 slug 추가**

```ts
export const LIFE_GROUPS: LifeGroup[] = [
  {
    slug: 'education',
    label: '교육시설',
    items: [
      { label: '학교', href: '/school', live: true },
      { label: '어린이집', href: '/childcare', live: false, soon: true },
    ],
  },
  {
    slug: 'medical',
    label: '의료시설',
    items: [
      { label: '병원·의원', href: '/medical?type=hospital', live: false },
      { label: '약국', href: '/medical?type=pharmacy', live: false },
      { label: '보건소', href: '/medical?type=health-center', live: false, soon: true },
    ],
  },
  {
    slug: 'amenity',
    label: '상권·편의',
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
    items: [
      { label: '공원', href: '/urban?type=park', live: false },
      { label: '충전소', href: '/urban?type=charger', live: false },
      { label: '주차장', href: '/urban?type=parking', live: false, soon: true },
    ],
  },
];
```

- [ ] **Step 3: 타입 체크 확인**

```bash
pnpm tsc --noEmit 2>&1 | tail -30
```
Expected: 0 error. (소비처 — life-dropdown, mobile-drawer — 가 아직 slug 를 안 쓰니 OK)

- [ ] **Step 4: 커밋**

```bash
git add app/\(public\)/_components/life-menu.ts
git commit -m "feat(life-menu): LifeGroup.slug 추가 (앵커 점프용 식별자)"
```

---

## Task 4: `/life` 4 그룹 섹션 재편

**Files:**
- Modify: `app/(public)/life/page.tsx`
- 신규 (선택): `app/(public)/life/_components/life-item-card.tsx` — 카드 한 종 추출

- [ ] **Step 1: `LifeItemCard` 컴포넌트 신규 작성** (`app/(public)/life/_components/life-item-card.tsx`)

`live` / `soon` / 비라이브 3 상태를 한 컴포넌트로 흡수. `live` 면 `<Link>`, 아니면 `SoonModal` 트리거 버튼.

```tsx
'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { SoonModal } from '../../_components/soon-modal';
import type { LifeSubItem } from '../../_components/life-menu';

export function LifeItemCard({ item, emoji }: { item: LifeSubItem; emoji: string }) {
  const [openSoon, setOpenSoon] = useState(false);

  if (item.live) {
    return (
      <Link
        href={item.href}
        className="flex h-full flex-col gap-1 rounded-2xl border border-[var(--color-line)] bg-white p-4 transition hover:border-[var(--color-sky)] hover:shadow-[var(--shadow-soft)]"
      >
        <div className="text-2xl">{emoji}</div>
        <div className="mt-1 text-sm font-bold text-[var(--color-blue-dark)]">{item.label}</div>
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpenSoon(true)}
        className="flex h-full flex-col gap-1 rounded-2xl border border-[var(--color-line)] bg-white/70 p-4 text-left transition hover:border-[var(--color-sky)]"
      >
        <div className="text-2xl opacity-70">{emoji}</div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="text-sm font-bold text-[var(--color-muted)]">{item.label}</span>
          {item.soon && <Badge tone="gray">Soon</Badge>}
        </div>
      </button>
      <SoonModal open={openSoon} onClose={() => setOpenSoon(false)} topic={item.label} />
    </>
  );
}
```

**참고:** `SoonModal` 의 import 경로는 `app/(public)/_components/soon-modal.tsx`. 실제 props 시그니처를 코드로 확인하고 정합되게 조정 (현재 코드베이스의 SoonModal API 를 한 번 읽고 맞춰라).

- [ ] **Step 2: 그룹별 emoji 매핑 정의** — 카테고리 카드 좌상단 emoji 는 `LifeSubItem` 에 emoji 필드가 없으므로 라벨 기반 매핑 또는 그룹 단위로 처리. 가장 간단한 방법은 `LifeSubItem` 에 `emoji?: string` 추가하지 않고, `/life` 페이지 안에 룩업 테이블을 둠.

`app/(public)/life/page.tsx` 안에:
```ts
const ITEM_EMOJI: Record<string, string> = {
  '학교': '🏫', '어린이집': '👶',
  '병원·의원': '🏥', '약국': '💊', '보건소': '🩺',
  '편의점': '🏪', '마트': '🛒', '카페': '☕', '전통시장': '🏬',
  '공원': '🌳', '충전소': '⚡', '주차장': '🅿️',
};
```

- [ ] **Step 3: `/life/page.tsx` 재작성**

기존 평면 5카드를 완전 대체:
```tsx
import { LIFE_GROUPS } from '../_components/life-menu';
import { LifeItemCard } from './_components/life-item-card';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '생활편의 — 학교·병원·상권·도시인프라',
  description: '아파트 주변 학교, 병원·약국, 편의점·마트·카페·전통시장, 공원·충전소 등 생활편의 정보를 한곳에서.',
  alternates: { canonical: '/life' },
};

export const revalidate = 86_400;

const ITEM_EMOJI: Record<string, string> = {
  '학교': '🏫', '어린이집': '👶',
  '병원·의원': '🏥', '약국': '💊', '보건소': '🩺',
  '편의점': '🏪', '마트': '🛒', '카페': '☕', '전통시장': '🏬',
  '공원': '🌳', '충전소': '⚡', '주차장': '🅿️',
};

export default function LifeHubPage() {
  return (
    <section className="mx-auto max-w-[1180px] px-6 py-12">
      <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">생활편의</p>
      <h1 className="mb-3 text-3xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-4xl">
        우리 동네 생활편의
      </h1>
      <p className="mb-8 text-sm text-[var(--color-muted)]">
        교육·의료·상권·도시인프라를 한 화면에서. 카테고리를 누르면 해당 목록으로 이동합니다.
      </p>

      <div className="flex flex-col gap-12">
        {LIFE_GROUPS.map((group) => (
          <section key={group.slug} id={group.slug} className="scroll-mt-20">
            <h2 className="mb-3 text-xl font-bold text-[var(--color-blue-dark)]">{group.label}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {group.items.map((item) => (
                <LifeItemCard key={item.label} item={item} emoji={ITEM_EMOJI[item.label] ?? '📍'} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: 기존 `CategoryCard` 컴포넌트 미사용 처리 확인**

```bash
grep -rn "CategoryCard\|category-card" app/ 2>/dev/null | grep -v node_modules
```
- `app/(public)/life/_components/category-card.tsx` 외 다른 import 가 없는지 확인. 없다면 함께 삭제.
- 다른 곳에서 사용 시 삭제 보류, `/life` 만 새 컴포넌트 사용.

미사용이면:
```bash
rm app/\(public\)/life/_components/category-card.tsx
```

- [ ] **Step 5: typecheck**

```bash
pnpm tsc --noEmit 2>&1 | tail -30
```
Expected: 0 error.

- [ ] **Step 6: 수동 검증 — dev 서버 띄우고 `/life` 확인**

```bash
pnpm dev
```
- 브라우저 `/life` 접속 → 4 그룹 섹션이 순서대로(교육→의료→상권·편의→도시인프라) 보임
- `/life#amenity` URL 직접 접속 → 상권·편의 섹션이 헤더에 가리지 않고 보임 (scroll-mt-20 동작)
- 모바일 뷰포트(≤375px) → `grid-cols-2` 적용
- 비라이브 카드 클릭 → SoonModal 정상 동작

확인 후 dev 종료.

- [ ] **Step 7: 커밋**

```bash
git add app/\(public\)/life/
git commit -m "refactor(life): 4 그룹 섹션 구조로 재편 (LIFE_GROUPS 단일 진실 소스 공유)"
```

---

## Task 5: `LifeDropdown` 그룹 라벨 Link 화

**Files:**
- Modify: `app/(public)/_components/life-dropdown.tsx`

- [ ] **Step 1: 그룹 라벨 `<p>` → `<Link>` 전환**

`life-dropdown.tsx:53-57` 부근:
```tsx
{LIFE_GROUPS.map((group) => (
  <div key={group.label} className="flex flex-col gap-1">
    <p className="mb-1 px-2 text-[13px] font-bold text-[var(--color-blue-dark)]">
      {group.label}
    </p>
```

변경 후:
```tsx
{LIFE_GROUPS.map((group) => (
  <div key={group.slug} className="flex flex-col gap-1">
    <Link
      href={`/life#${group.slug}`}
      onClick={() => setOpen(false)}
      className="mb-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[13px] font-bold text-[var(--color-blue-dark)] hover:bg-[var(--color-soft)]"
    >
      {group.label}
      <span aria-hidden className="text-[var(--color-muted)]">›</span>
    </Link>
```

`key` 도 `group.label` → `group.slug` 로 변경 (slug 가 더 안정적 식별자).

- [ ] **Step 2: typecheck**

```bash
pnpm tsc --noEmit 2>&1 | tail -30
```
Expected: 0 error.

- [ ] **Step 3: 수동 검증**

```bash
pnpm dev
```
- 데스크톱 뷰에서 헤더 `생활편의` → 드롭다운 펼침 → 4 컬럼 헤더(`교육시설`/`의료시설`/`상권·편의`/`도시인프라`) 가 클릭 가능, hover 시 배경 변화
- `상권·편의` 헤더 클릭 → `/life#amenity` 이동 + 드롭다운 자동 닫힘 + 상권·편의 섹션이 화면에 보임

- [ ] **Step 4: 커밋**

```bash
git add app/\(public\)/_components/life-dropdown.tsx
git commit -m "feat(nav): 데스크톱 드롭다운 그룹 라벨을 /life#slug 링크로"
```

---

## Task 6: `MobileDrawer` 그룹 라벨 Link 화

**Files:**
- Modify: `app/(public)/_components/mobile-drawer.tsx`

- [ ] **Step 1: 그룹 라벨 `<p>` → `<Link>` 전환**

`mobile-drawer.tsx:98-101` 부근:
```tsx
{LIFE_GROUPS.map((group) => (
  <div key={group.label} className="py-1">
    <p className="px-2 py-1 text-xs font-bold text-[var(--color-blue-dark)]">{group.label}</p>
```

변경 후:
```tsx
{LIFE_GROUPS.map((group) => (
  <div key={group.slug} className="py-1">
    <Link
      href={`/life#${group.slug}`}
      onClick={onClose}
      className="flex items-center justify-between rounded-lg px-2 py-2 text-xs font-bold text-[var(--color-blue-dark)] hover:bg-[var(--color-soft)]"
    >
      {group.label}
      <span aria-hidden className="text-[var(--color-muted)]">›</span>
    </Link>
```

- [ ] **Step 2: typecheck**

```bash
pnpm tsc --noEmit 2>&1 | tail -30
```
Expected: 0 error.

- [ ] **Step 3: 수동 검증** — 모바일 뷰포트(≤768px) 에서

- 햄버거 → `생활편의` 토글 펼침 → 4 그룹 라벨이 ` › ` 와 함께 표시
- `상권·편의` 라벨 탭 → 드로어 닫힘 + `/life#amenity` 이동 + 섹션 보임
- 탭 영역 최소 ~44px 확인 (`py-2` + 컨텐츠 → 약 36px, 부족하면 `py-3` 으로 키움)

`py-2` 가 너무 빠듯하면:
```diff
- className="flex items-center justify-between rounded-lg px-2 py-2 text-xs font-bold ..."
+ className="flex items-center justify-between rounded-lg px-2 py-3 text-xs font-bold ..."
```

- [ ] **Step 4: 커밋**

```bash
git add app/\(public\)/_components/mobile-drawer.tsx
git commit -m "feat(nav): 모바일 드로어 그룹 라벨을 /life#slug 링크로 (› 탭 affordance)"
```

---

## Task 7: 새 `/amenity/[category]/page.tsx` LIST 작성 (시드 redirect 포함)

**Files:**
- Modify (덮어쓰기): `app/(public)/amenity/[category]/page.tsx`

- [ ] **Step 1: 기존 hub 페이지를 LIST 로 완전 교체**

`app/(public)/amenity/[category]/page.tsx` 전체를 다음으로 대체:
```tsx
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { getSidoList, getSigunguByCode, sidoFromPrefix } from '@/lib/region';
import { getCategoryDef, toAmenityCategoryView, AMENITY_SLUGS } from '@/lib/amenity/category';
import { getAmenityList, normalizePage } from '@/lib/amenity/list';
import { AmenityFilterPanel } from './_components/amenity-filter-panel';
import { AmenityMobileFilterSheet } from './_components/amenity-mobile-filter-sheet';
import { AmenityCard } from './_components/amenity-card';
import { AmenityPagination } from './_components/amenity-pagination';
import type { Metadata } from 'next';

export const revalidate = 21_600;

interface Params {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string>>;
}

export async function generateStaticParams() {
  return AMENITY_SLUGS.map((category) => ({ category }));
}

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { category } = await params;
  const sp = await searchParams;
  const def = getCategoryDef(category);
  if (!def) return {};
  const region = sp.region ? await getSigunguByCode(sp.region).catch(() => null) : null;
  const scope = region?.fullName ?? sp.sido ?? '전국';
  return {
    title: `${scope} ${def.label}`,
    description: `${scope}의 ${def.label} 목록과 위치, 주변 아파트 실거래가.`,
    alternates: { canonical: `/amenity/${def.slug}${sp.sido ? `?sido=${encodeURIComponent(sp.sido)}` : ''}` },
  };
}

export default async function AmenityListPage({ params, searchParams }: Params) {
  const { category } = await params;
  const sp = await searchParams;
  const def = getCategoryDef(category);
  if (!def) notFound();

  // 시드: sido / region 둘 다 없으면 ?sido=서울 로 redirect (URL에 명시)
  if (!sp.sido && !sp.region) {
    redirect(`/amenity/${category}?sido=서울`);
  }

  // region 만 있을 때 sido 역추출 (redirect 경유 또는 직접 진입 케이스)
  const effectiveSido = sp.sido ?? (sp.region ? sidoFromPrefix(sp.region.slice(0, 2)) : undefined);

  const page = normalizePage(sp.page);
  const subKey = def.subFilters?.paramKey ?? 'sub';
  const basePath = `/amenity/${def.slug}`;

  const [{ rows, total, totalPages, perPage }, sidoList, region] = await Promise.all([
    getAmenityList(def.slug, {
      sigunguCode: sp.region,
      sido: effectiveSido,
      q: sp.q,
      sub: sp[subKey],
    }, page),
    getSidoList().catch(() => []),
    sp.region ? getSigunguByCode(sp.region).catch(() => null) : Promise.resolve(null),
  ]);

  const defView = toAmenityCategoryView(def);
  const scopeLabel = region?.fullName ?? (effectiveSido ?? '전국');

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href="/life#amenity">상권·편의</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">{def.breadcrumbLabel}</span>
      </nav>

      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] md:p-7">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">상권·편의 · {def.breadcrumbLabel}</p>
        <h1 className="text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">
          {def.emoji} {scopeLabel} {def.label}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          전체 {total.toLocaleString('ko-KR')}개
        </p>
      </div>

      <Suspense><AmenityMobileFilterSheet def={defView} basePath={basePath} sidoList={sidoList} /></Suspense>

      <div className="flex items-start gap-6">
        <aside className="sticky top-[88px] hidden w-[280px] shrink-0 md:block">
          <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-[var(--color-soft)]" />}>
              <AmenityFilterPanel def={defView} basePath={basePath} sidoList={sidoList} />
            </Suspense>
          </div>
          <div className="mt-4 rounded-[22px] border border-dashed border-[#93c5fd] bg-white/65 p-5 text-center text-xs text-[var(--color-muted)]">광고 영역</div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-3 shadow-[var(--shadow-soft)]">
            <p className="text-base font-bold text-[var(--color-blue-dark)]">
              <span className="text-[var(--color-blue)]">{total.toLocaleString('ko-KR')}</span>개 {def.label}
            </p>
          </div>
          {rows.length === 0 ? (
            <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">
              조건에 맞는 {def.label}이 없습니다.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {rows.map((it) => <AmenityCard key={String(it.id)} item={it} def={def} />)}
            </div>
          )}
          {totalPages > 1 && (
            <div className="mt-6">
              <Suspense><AmenityPagination basePath={basePath} current={page} totalPages={totalPages} totalItems={total} perPage={perPage} /></Suspense>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
```

**주의:** `AmenityCard` 의 prop 시그니처가 `basePath` 의존이라 다음 Task 8 에서 같이 변경된다 (현재 호출은 `basePath` 안 넘김 → Task 8 적용 전 typecheck 가 일시 깨질 수 있음, Task 8 까지 묶어 단일 커밋 권장).

- [ ] **Step 2: typecheck 일시 깨짐 확인 (Task 8 처리 예정)**

```bash
pnpm tsc --noEmit 2>&1 | tail -30
```
Expected: AmenityCard 가 `basePath` 를 받지 않게 다음 Task 에서 수정.

→ 다음 Task 8 까지 진행 후 커밋.

---

## Task 8: `AmenityCard` / `SameCategoryNearby` / `AmenityDetailSidebar` 링크 형식 변경

**Files:**
- Modify: `app/(public)/amenity/[category]/_components/amenity-card.tsx`
- Modify: `app/(public)/amenity/[category]/_components/same-category-nearby.tsx`
- Modify: `app/(public)/amenity/[category]/_components/amenity-detail-sidebar.tsx`

- [ ] **Step 1: `AmenityCard` 링크를 `/amenity/{slug}/{id}` 로 직접 조립**

기존:
```tsx
export function AmenityCard({ item, def, basePath }: { item: AmenityItem; def: AmenityCategoryDef; basePath: string }) {
  // ...
  return (
    <Link href={`${basePath}/${item.id}`}>
```

변경 후 (`basePath` prop 제거):
```tsx
export function AmenityCard({ item, def }: { item: AmenityItem; def: AmenityCategoryDef }) {
  const summary = def.inferRowSummary(item);
  return (
    <Link href={`/amenity/${def.slug}/${item.id}`}>
```

- [ ] **Step 2: `SameCategoryNearby` 링크 변경**

기존:
```tsx
export function SameCategoryNearby({ items, def, basePath }: { items: Item[]; def: AmenityCategoryDef; basePath: string }) {
  // ...
  <Link href={`${basePath}/${it.id}`} ...>
```

변경 후 (`basePath` prop 제거):
```tsx
export function SameCategoryNearby({ items, def }: { items: Item[]; def: AmenityCategoryDef }) {
  if (items.length === 0) return null;
  return (
    <Card id="same">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">{def.emoji} 가까운 {def.label}</h2>
      <ul className="divide-y divide-[var(--color-line)]">
        {items.map((it) => (
          <li key={String(it.id)}>
            <Link href={`/amenity/${def.slug}/${it.id}`} className="flex items-center justify-between py-3">
              {/* 본문 동일 */}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

- [ ] **Step 3: `AmenityDetailSidebar` 의 detail 링크 변경**

`amenity-detail-sidebar.tsx` 를 한 번 읽고 `${basePath}/${id}` 패턴이 있으면 `/amenity/${def.slug}/${id}` 로 교체, `basePath` prop 이 다른 용도(목차 등) 없이 detail 링크만 쓰는 거라면 prop 자체 제거. 다른 용도면 prop 은 유지하고 detail 링크만 새 형식으로.

- [ ] **Step 4: typecheck (이제 LIST + 컴포넌트 정합)**

```bash
pnpm tsc --noEmit 2>&1 | tail -30
```
Expected: 0 error.

- [ ] **Step 5: 커밋 (Task 7 의 LIST + Task 8 컴포넌트 prop 변경 묶기)**

```bash
git add app/\(public\)/amenity/\[category\]/page.tsx app/\(public\)/amenity/\[category\]/_components/
git commit -m "feat(amenity): LIST를 /amenity/[category]로 이전 (?sido=서울 시드 + AmenityCard 링크 단순화)"
```

---

## Task 9: 새 `/amenity/[category]/[id]/page.tsx` DETAIL 작성

**Files:**
- Create: `app/(public)/amenity/[category]/[id]/page.tsx`

- [ ] **Step 1: 새 DETAIL 페이지 작성** — 기존 `[sigunguCode]/[id]/page.tsx` 로직 이전, sigunguCode 는 `item.sigunguCode` 에서 얻음

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getCategoryDef } from '@/lib/amenity/category';
import { getAmenityById, getAmenityLatLng } from '@/lib/amenity/detail';
import { getAmenityList } from '@/lib/amenity/list';
import { getSigunguByCode } from '@/lib/region';
import {
  getNearbyApartments,
  getMixedNearbyForDetail,
  getSameCategoryNearby,
} from '@/lib/amenity/nearby';
import { AmenityHero } from '../_components/amenity-hero';
import { AmenityInfo } from '../_components/amenity-info';
import { AmenityDetailSidebar } from '../_components/amenity-detail-sidebar';
import { NearbyAmenitiesMixed } from '../_components/nearby-amenities-mixed';
import { SameCategoryNearby } from '../_components/same-category-nearby';
import { NearbyApartments } from '@/components/ui/nearby-apartments';
import { NaverMap } from '@/components/ui/naver-map';
import { Card } from '@/components/ui/card';
import type { Metadata } from 'next';
import type { NearbyApartment } from '@/lib/amenity/nearby';
import type { AmenitySlug } from '@/lib/amenity/category';

export const revalidate = 86_400;

interface Params { params: Promise<{ category: string; id: string }>; }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category, id } = await params;
  const def = getCategoryDef(category);
  if (!def) return {};
  const item = await getAmenityById(def.slug, BigInt(id)).catch(() => null);
  if (!item) return {};
  return {
    title: `${item.name} — ${def.label} 정보·주변 아파트`,
    description: `${item.name}(${item.address}) ${def.label} 정보와 주변 아파트 실거래가.`,
    alternates: { canonical: `/amenity/${def.slug}/${id}` },
  };
}

export default async function AmenityDetailPage({ params }: Params) {
  const { category, id } = await params;
  const def = getCategoryDef(category);
  if (!def) notFound();

  const itemId = BigInt(id);
  const item = await getAmenityById(def.slug, itemId);
  if (!item) notFound();

  const region = item.sigunguCode
    ? await getSigunguByCode(item.sigunguCode).catch(() => null)
    : null;

  const coord = await getAmenityLatLng(def.slug, itemId);

  type MixedT = Awaited<ReturnType<typeof getMixedNearbyForDetail>>;
  type SameT = Awaited<ReturnType<typeof getSameCategoryNearby>>;
  const [apts, mixed, sameCat, otherList] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
    coord ? getMixedNearbyForDetail(def.slug as AmenitySlug, coord.lat, coord.lng) : Promise.resolve({ convenience: [], mart: [], cafe: [], market: [] } as MixedT),
    coord ? getSameCategoryNearby(def.slug as AmenitySlug, coord.lat, coord.lng, itemId) : Promise.resolve([] as SameT),
    item.sigunguCode ? getAmenityList(def.slug, { sigunguCode: item.sigunguCode }, 1) : Promise.resolve({ rows: [], total: 0, page: 1, perPage: 0, totalPages: 0 }),
  ]);

  const others = otherList.rows.filter((s) => s.id !== item.id).slice(0, 4);
  const regionListPath = item.sigunguCode
    ? `/amenity/${def.slug}?region=${item.sigunguCode}`
    : `/amenity/${def.slug}`;

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href="/life#amenity">상권·편의</Link><span>›</span>
        <Link href={`/amenity/${def.slug}`}>{def.breadcrumbLabel}</Link><span>›</span>
        {region && (
          <>
            <Link href={regionListPath}>{region.fullName}</Link><span>›</span>
          </>
        )}
        <span className="truncate font-semibold text-[var(--color-blue-dark)]">{item.name}</span>
      </nav>

      <AmenityHero item={item} def={def} />

      <div className="mt-7 grid grid-cols-1 gap-7 lg:grid-cols-[1fr_320px]">
        <main className="flex flex-col gap-6">
          <AmenityInfo item={item} def={def} regionFullName={region?.fullName ?? ''} />
          {coord && (
            <Card id="map">
              <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">위치</h2>
              <NaverMap lat={coord.lat} lng={coord.lng} name={item.name} />
            </Card>
          )}
          {!coord && (
            <Card>
              <p className="py-6 text-center text-sm text-[var(--color-muted)]">위치 정보가 등록되어 있지 않아 지도와 주변 정보를 표시할 수 없습니다.</p>
            </Card>
          )}
          <NearbyApartments items={apts} />
          {coord && <NearbyAmenitiesMixed {...mixed} />}
          {coord && <SameCategoryNearby items={sameCat} def={def} />}
        </main>
        <aside><AmenityDetailSidebar others={others} def={def} /></aside>
      </div>
    </div>
  );
}
```

**주의:** `AmenityDetailSidebar` 의 `basePath` prop 가 step 8에서 제거됐다면 위 코드처럼 `basePath` 인자 없이 호출. prop 이 다른 용도 유지면 적절히 넘김.

- [ ] **Step 2: typecheck**

```bash
pnpm tsc --noEmit 2>&1 | tail -30
```
Expected: 0 error.

- [ ] **Step 3: 수동 검증**

```bash
pnpm dev
```
- `/amenity/convenience/1` (실제 존재 id) → DETAIL 정상 렌더 (Hero, 기본정보, 지도, 주변 아파트, 주변 상권 종합, 같은 카테고리)
- breadcrumb 의 `상권·편의` → `/life#amenity` 이동
- breadcrumb 의 `{region.fullName}` → `/amenity/convenience?region={sigunguCode}` 이동 → LIST 가 해당 시군구로 좁힘 표시
- `같은 카테고리 가까운 N건` 의 `상세 →` → 다른 편의점 DETAIL 이동

- [ ] **Step 4: 커밋**

```bash
git add app/\(public\)/amenity/\[category\]/\[id\]/
git commit -m "feat(amenity): DETAIL을 /amenity/[category]/[id]로 단순화 ([sigunguCode] 세그먼트 제거)"
```

---

## Task 10: 기존 라우트 파일 삭제

**Files:**
- Delete: `app/(public)/amenity/[category]/regions/page.tsx`
- Delete: `app/(public)/amenity/[category]/regions/` (폴더)
- Delete: `app/(public)/amenity/[category]/[sigunguCode]/page.tsx`
- Delete: `app/(public)/amenity/[category]/[sigunguCode]/[id]/page.tsx`
- Delete: `app/(public)/amenity/[category]/[sigunguCode]/` (폴더)

- [ ] **Step 1: 라우트 파일/폴더 삭제**

```bash
rm -rf app/\(public\)/amenity/\[category\]/regions
rm -rf app/\(public\)/amenity/\[category\]/\[sigunguCode\]
```

- [ ] **Step 2: typecheck — 다른 곳에서 이 경로를 import 하는지 확인**

```bash
pnpm tsc --noEmit 2>&1 | tail -30
```
Expected: 0 error.

`pnpm tsc` 가 통과해도 안전성 추가 확인:
```bash
grep -rn "amenity/.*\[sigunguCode\]\|amenity/.*regions" app/ components/ lib/ 2>/dev/null | grep -v node_modules
```
Expected: 검색 결과 0건 (또는 docs/spec 만).

- [ ] **Step 3: 커밋**

```bash
git add -A app/\(public\)/amenity/\[category\]
git commit -m "chore(amenity): 사용 안 하는 regions/ 와 [sigunguCode]/ 라우트 삭제"
```

---

## Task 11: `next.config.mjs` 의 redirects 추가

**Files:**
- Modify: `next.config.mjs`

- [ ] **Step 1: redirects 함수 추가**

기존:
```js
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: false,
  images: { remotePatterns: [] },
};
```

변경 후:
```js
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: false,
  images: { remotePatterns: [] },
  async redirects() {
    return [
      {
        source: '/amenity/:category/regions',
        destination: '/amenity/:category',
        permanent: true,
      },
      {
        source: '/amenity/:category/:sigunguCode(\\d{5})',
        destination: '/amenity/:category?region=:sigunguCode',
        permanent: true,
      },
      {
        source: '/amenity/:category/:sigunguCode(\\d{5})/:id(\\d+)',
        destination: '/amenity/:category/:id',
        permanent: true,
      },
    ];
  },
};
```

- [ ] **Step 2: 수동 검증** — dev 서버에서 redirect 동작 확인

```bash
pnpm dev
```
- `/amenity/convenience/regions` → 301 → `/amenity/convenience` (시드 redirect 합쳐 최종 `?sido=서울`)
- `/amenity/convenience/11680` (강남구 코드) → 301 → `/amenity/convenience?region=11680`
- `/amenity/convenience/11680/1234567` → 301 → `/amenity/convenience/1234567`
- 새 LIST 경로 `/amenity/convenience` 은 정상(시드 redirect만 적용)

curl 로도 검증:
```bash
curl -sI http://localhost:3000/amenity/convenience/regions | head -3
# HTTP/1.1 308 Permanent Redirect (Next.js 는 308 으로 mapping; SEO 동등)
# location: /amenity/convenience
```

`permanent: true` 는 Next.js 가 308 로 매핑한다. SEO 시그널 동등.

- [ ] **Step 3: 커밋**

```bash
git add next.config.mjs
git commit -m "feat(routing): /amenity 구 URL 3종 → 신 URL 301/308 redirect (regions, [sigungu], [sigungu]/[id])"
```

---

## Task 12: `app/sitemap.ts` URL 패턴 갱신

**Files:**
- Modify: `app/sitemap.ts`

- [ ] **Step 1: STATIC_ENTRIES 와 동적 entries 갱신**

기존:
```ts
...AMENITY_SLUGS.flatMap((slug) => [
  { url: `${SITE}/amenity/${slug}`, changeFrequency: 'weekly' as const, priority: 0.8 },
  { url: `${SITE}/amenity/${slug}/regions`, changeFrequency: 'weekly' as const, priority: 0.7 },
]),
```

변경 후 (STATIC_ENTRIES 안):
```ts
...AMENITY_SLUGS.flatMap((slug) => [
  { url: `${SITE}/amenity/${slug}?sido=서울`, changeFrequency: 'weekly' as const, priority: 0.8 },
]),
```

그리고 동적 부분 — 기존 시군구별 LIST URL 생성을 DETAIL ID 기반으로 변경하거나 일단 단순화:

기존:
```ts
for (const { slug, counts } of amenityCountsBySlug) {
  for (const [sigunguCode, count] of counts) {
    if (count <= 0) continue;
    entries.push({
      url: `${SITE}/amenity/${slug}/${sigunguCode}`,
      changeFrequency: 'weekly',
      priority: 0.6,
    });
  }
}
```

변경 후 — 시군구별 LIST 는 새 URL 패턴으로 (region 쿼리):
```ts
for (const { slug, counts } of amenityCountsBySlug) {
  for (const [sigunguCode, count] of counts) {
    if (count <= 0) continue;
    entries.push({
      url: `${SITE}/amenity/${slug}?region=${sigunguCode}`,
      changeFrequency: 'weekly',
      priority: 0.6,
    });
  }
}
```

(DETAIL ID fan-out 은 본 작업 범위 밖. 시군구별 LIST URL 까지만 새 패턴 적용.)

- [ ] **Step 2: typecheck**

```bash
pnpm tsc --noEmit 2>&1 | tail -30
```
Expected: 0 error.

- [ ] **Step 3: 수동 검증**

```bash
pnpm dev
```
브라우저 `/sitemap.xml` 접속 → `/amenity/{slug}?sido=서울` 1줄과 시군구별 `?region=` URL 패턴 확인. 기존 `/regions` 엔트리 사라짐.

- [ ] **Step 4: 커밋**

```bash
git add app/sitemap.ts
git commit -m "chore(sitemap): /amenity 시드 URL(?sido=서울) + 시군구 LIST(?region=) 패턴으로 전환"
```

---

## Task 13: 모바일 필터 시트 active count 확장

**Files:**
- Modify: `app/(public)/amenity/[category]/_components/amenity-mobile-filter-sheet.tsx`

- [ ] **Step 1: activeKeys 에 `region` 포함, 시드 기본값(`sido=서울`) 가드**

기존:
```tsx
const activeKeys = ['sido', 'q', ...(def.subFilters ? [def.subFilters.paramKey] : [])];
const activeCount = activeKeys.filter((k) => {
  const v = sp.get(k);
  return v && v !== 'all';
}).length;
```

변경 후:
```tsx
const activeKeys = ['sido', 'region', 'q', ...(def.subFilters ? [def.subFilters.paramKey] : [])];
const activeCount = activeKeys.filter((k) => {
  const v = sp.get(k);
  if (!v || v === 'all') return false;
  // 시드 기본값(sido=서울)은 사용자가 명시 변경한 게 아니므로 카운트 제외
  if (k === 'sido' && v === '서울') return false;
  return true;
}).length;
```

- [ ] **Step 2: typecheck**

```bash
pnpm tsc --noEmit 2>&1 | tail -30
```
Expected: 0 error.

- [ ] **Step 3: 수동 검증**

```bash
pnpm dev
```
모바일 뷰포트(≤768px) 에서 `/amenity/convenience` 진입:
- 초기 상태: `?sido=서울` 시드 → 필터 버튼 배지 **없음** (`activeCount === 0`)
- 시도를 경기로 바꿈 → 배지 `1`
- 시군구를 강남구로 → 배지 `2`
- 검색어 추가 → 배지 `3`

- [ ] **Step 4: 커밋**

```bash
git add app/\(public\)/amenity/\[category\]/_components/amenity-mobile-filter-sheet.tsx
git commit -m "fix(amenity): 모바일 필터 active count에 region 포함, 시드 sido=서울 제외 가드"
```

---

## Task 14: 통합 검증 + 빌드

**Files:** (수정 없음 — 검증만)

- [ ] **Step 1: 전체 테스트 회귀**

```bash
pnpm vitest run
```
Expected: 모두 PASS.

- [ ] **Step 2: 빌드**

```bash
pnpm tsc --noEmit 2>&1 | tail -30
```
Expected: 0 error.

- [ ] **Step 3: dev 서버에서 핵심 흐름 6 가지 수동 검증**

```bash
pnpm dev
```

1. **nav 그룹 라벨** (데스크톱) — `생활편의` 드롭다운 → `상권·편의` 라벨 클릭 → `/life#amenity` 이동, 상권·편의 섹션이 화면에 보임 (sticky 헤더에 가리지 않음)
2. **nav 그룹 라벨** (모바일) — 햄버거 → `생활편의` 토글 → `상권·편의` 라벨 탭 → 드로어 닫힘 + `/life#amenity` 이동
3. **nav 하위 항목** — `편의점` 탭 → `/amenity/convenience` → 즉시 301 → `/amenity/convenience?sido=서울` → 서울 편의점 LIST
4. **시군구 좁힘** — LIST 사이드바에서 시도=서울, 시군구=강남구 선택 → URL `?sido=서울&region=11680` → LIST 갱신
5. **DETAIL 진입** — LIST 카드 클릭 → `/amenity/convenience/{id}` (sigunguCode 없음) → DETAIL 정상 + breadcrumb 의 `상권·편의` 가 `/life#amenity` 로 링크
6. **구 URL 호환** — `/amenity/convenience/regions` / `/amenity/convenience/11680` / `/amenity/convenience/11680/1` 각각 새 URL 로 301 redirect

- [ ] **Step 4: 모바일 뷰포트 검증 (Chrome DevTools 또는 실제 디바이스)**

- `/life` 4 그룹 섹션, 각 그룹 `grid-cols-2`
- `/amenity/convenience` LIST 의 hero 카드 padding 분기 (`p-5` 적용)
- 필터 시트 active count 가 시드 제외 정상 동작
- 드로어 그룹 라벨 ≥ 44px 탭 영역

- [ ] **Step 5: Sentry release 태그 (선택)**

```bash
# 배포 환경이면
git tag -a "amenity-flow-redesign-2026-05-28" -m "상권·편의 진입 흐름 재설계"
```
(로컬 환경이면 생략. 배포 단계 작업.)

- [ ] **Step 6: 최종 커밋 (검증 노트)**

검증 결과 통과 시 별도 커밋 없이 종료. 추가 수정이 있었다면:
```bash
git add -A
git commit -m "fix(amenity): 통합 검증 중 발견 이슈 보정"
```

---

## Self-Review (스펙 매핑)

스펙 (`docs/superpowers/specs/2026-05-28-amenity-flow-redesign-design.md`) 각 섹션과 태스크 매핑:

| 스펙 섹션 | 태스크 |
|----|----|
| 3. IA & 라우팅 (라우트 트리, redirect 3종) | Task 7 (LIST), Task 9 (DETAIL), Task 10 (삭제), Task 11 (redirect) |
| 4. /life 4 그룹 섹션 재편 | Task 3 (LifeGroup.slug), Task 4 (/life 재편) |
| 5. nav 그룹 라벨 클릭 활성화 | Task 5 (데스크톱), Task 6 (모바일) |
| 6. /amenity/[category] LIST 재설계 | Task 1 (sidoPrefix), Task 2 (어댑터 4종 sido 분기), Task 7 (LIST) |
| 7. DETAIL 단순화 | Task 9 (DETAIL), Task 8 (카드 링크) |
| 8. 모바일 분기 | Task 6 (드로어), Task 4 (/life grid-cols), Task 13 (필터 시트), Task 7 (hero padding) |
| 9. SEO · 사이트맵 | Task 11 (redirect), Task 12 (sitemap) |
| 10. 테스트 | Task 1, 2 (단위), Task 14 (통합) |
| 11. 관측 · 롤백 | Task 14 (Sentry tag — 선택) |

스펙 미해결 항목(12절)은 후속 작업으로 본 플랜 범위 밖.
