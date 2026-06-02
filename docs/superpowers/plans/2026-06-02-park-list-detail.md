# 공원 목록·상세 화면 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/urban/park` 목록 및 `/urban/park/[id]` 상세 페이지 구현 — 사이드바 필터 + 심플 카드 목록, 상세에는 지도·주변아파트·주변편의시설·같은지역공원 포함.

**Architecture:** 기존 urban 카테고리 시스템(`UrbanCategoryDef`)에 `'park'` slug를 추가해 목록 라우트는 재사용하고, 카드(ParkCard)·상세 섹션(ParkInfo)만 신규 작성. 상세 페이지는 `def.slug` 분기로 주차장 전용 컴포넌트와 공원 전용 컴포넌트를 구분해 렌더링.

**Tech Stack:** Next.js 15 (App Router), Prisma/MySQL, Tailwind CSS, Vitest

---

## 파일 구조

**신규 생성:**
- `lib/urban/adapters/park.ts` — parkDef + ParkRaw 타입 + PARK_TYPE_EMOJI + formatArea
- `app/(public)/urban/[category]/_components/park-card.tsx` — 목록 카드
- `app/(public)/urban/[category]/_components/park-info.tsx` — 상세 기본정보 섹션
- `tests/lib/park-adapter.test.ts` — inferRowSummary·detailFields 단위 테스트

**수정:**
- `lib/urban/category.ts` — UrbanSlug에 `'park'` 추가, parkDef 등록
- `lib/urban/nearby.ts` — NearbyPark 타입 + getSameCategoryNearbyPark 추가
- `app/(public)/urban/[category]/_components/urban-same-category-nearby.tsx` — 타입 일반화
- `app/(public)/urban/[category]/_components/urban-card.tsx` — park 분기 추가
- `app/(public)/urban/[category]/_components/urban-hero.tsx` — 주차장 전용 배지 가드
- `app/(public)/urban/[category]/[id]/page.tsx` — 공원 섹션 분기 배선
- `app/(public)/_components/life-menu.ts` — park live: true

---

## Task 1: 공원 어댑터 (`lib/urban/adapters/park.ts`)

**Files:**
- Create: `lib/urban/adapters/park.ts`
- Create: `tests/lib/park-adapter.test.ts`

- [ ] **Step 1: 테스트 파일 작성 (실패 확인용)**

```ts
// tests/lib/park-adapter.test.ts
import { describe, it, expect } from 'vitest';
import { parkDef } from '@/lib/urban/adapters/park';
import type { ParkRaw } from '@/lib/urban/adapters/park';

function makeItem(raw: Partial<ParkRaw>) {
  return { id: 1n, name: '테스트공원', address: '서울', sigunguCode: null, raw: raw as ParkRaw };
}

describe('parkDef.inferRowSummary', () => {
  it('area가 있으면 "N ㎡" 형식으로 반환', () => {
    expect(parkDef.inferRowSummary(makeItem({ area: 415466 }))).toBe('415,466 ㎡');
  });
  it('area가 null이면 null 반환', () => {
    expect(parkDef.inferRowSummary(makeItem({ area: null }))).toBeNull();
  });
  it('area가 0이면 null 반환', () => {
    expect(parkDef.inferRowSummary(makeItem({ area: 0 }))).toBeNull();
  });
});

describe('parkDef.detailFields', () => {
  it('parkType·area 모두 있으면 두 항목 반환', () => {
    const fields = parkDef.detailFields(
      makeItem({ parkType: '근린공원', area: 100000 }),
      { regionFullName: '서울 동작구' },
    );
    expect(fields).toEqual([
      { label: '공원 유형', value: '근린공원' },
      { label: '면적', value: '100,000 ㎡' },
    ]);
  });
  it('parkType·area 모두 null이면 빈 배열', () => {
    const fields = parkDef.detailFields(
      makeItem({ parkType: null, area: null }),
      { regionFullName: '' },
    );
    expect(fields).toEqual([]);
  });
  it('parkType만 있으면 한 항목 반환', () => {
    const fields = parkDef.detailFields(
      makeItem({ parkType: '어린이공원', area: null }),
      { regionFullName: '' },
    );
    expect(fields).toEqual([{ label: '공원 유형', value: '어린이공원' }]);
  });
});
```

- [ ] **Step 2: 테스트 실행 — FAIL 확인**

```bash
pnpm test -- tests/lib/park-adapter.test.ts 2>&1 | grep -E "PASS|FAIL|Cannot find"
```
Expected: `FAIL` (모듈 없음)

- [ ] **Step 3: park 어댑터 구현**

```ts
// lib/urban/adapters/park.ts
import type { Park, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { UrbanCategoryDef, UrbanItem, UrbanListFilter, UrbanListResult } from '@/lib/urban/category';

export type ParkRaw = Park;

const PER_PAGE = 20;

export const PARK_TYPE_EMOJI: Record<string, string> = {
  근린공원: '🌳',
  어린이공원: '🌿',
  체육공원: '🏃',
  역사공원: '🏛️',
  소공원: '🌳',
};

export function formatArea(area: number | null | undefined): string | null {
  if (!area) return null;
  return `${area.toLocaleString('ko-KR')} ㎡`;
}

const SIDO_FULL: Record<string, string> = {
  서울: '서울특별시', 부산: '부산광역시', 대구: '대구광역시', 인천: '인천광역시',
  광주: '광주광역시', 대전: '대전광역시', 울산: '울산광역시', 세종: '세종특별자치시',
  경기: '경기도', 강원: '강원특별자치도', 충북: '충청북도', 충남: '충청남도',
  전북: '전북특별자치도', 전남: '전라남도', 경북: '경상북도', 경남: '경상남도',
  제주: '제주특별자치도',
};

function fullSidoName(s: string): string { return SIDO_FULL[s] ?? s; }

async function resolveAddrPrefix(f: UrbanListFilter): Promise<string | null | '__NO_MATCH__'> {
  if (!f.sigunguCode) return null;
  const region = await prisma.region.findUnique({
    where: { code: f.sigunguCode },
    select: { sido: true, sigungu: true },
  });
  if (!region?.sido || !region?.sigungu) return '__NO_MATCH__';
  return `${region.sido} ${region.sigungu}`;
}

function buildWhere(f: UrbanListFilter, addrPrefix: string | null): Prisma.ParkWhereInput {
  const conditions: Prisma.ParkWhereInput[] = [];
  if (addrPrefix) {
    conditions.push({ address: { startsWith: addrPrefix } });
  } else if (f.sido) {
    conditions.push({ address: { startsWith: fullSidoName(f.sido) } });
  }
  if (f.sub && f.sub !== 'all') {
    conditions.push({ parkType: { contains: f.sub } });
  }
  if (f.q) {
    conditions.push({ name: { contains: f.q } });
  }
  return conditions.length > 0 ? { AND: conditions } : {};
}

function toItem(row: ParkRaw): UrbanItem<ParkRaw> {
  return { id: row.id, name: row.name, address: row.address, sigunguCode: null, raw: row };
}

async function getList(f: UrbanListFilter, page: number): Promise<UrbanListResult<ParkRaw>> {
  const addrPrefix = await resolveAddrPrefix(f);
  if (addrPrefix === '__NO_MATCH__') {
    return { rows: [], total: 0, page, perPage: PER_PAGE, totalPages: 0 };
  }
  const where = buildWhere(f, addrPrefix);
  const [rows, total] = await Promise.all([
    prisma.park.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
    prisma.park.count({ where }),
  ]);
  return { rows: rows.map(toItem), total, page, perPage: PER_PAGE, totalPages: Math.ceil(total / PER_PAGE) };
}

async function getById(id: bigint): Promise<UrbanItem<ParkRaw> | null> {
  const row = await prisma.park.findUnique({ where: { id } });
  return row ? toItem(row) : null;
}

async function getLatLng(id: bigint): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "Park" WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
}

export const parkDef: UrbanCategoryDef<ParkRaw> = {
  slug: 'park',
  label: '공원',
  emoji: '🌳',
  breadcrumbLabel: '공원',
  requiresSidoScope: true,
  subFilters: {
    paramKey: 'sub',
    defaultSlug: 'all',
    label: '공원 유형',
    options: [
      { slug: 'all', label: '전체' },
      { slug: '근린공원', label: '근린공원' },
      { slug: '어린이공원', label: '어린이공원' },
      { slug: '체육공원', label: '체육공원' },
      { slug: '소공원', label: '소공원' },
      { slug: '역사공원', label: '역사공원' },
      { slug: '묘지공원', label: '묘지공원' },
      { slug: '문화공원', label: '문화공원' },
    ],
  },
  getList,
  getById,
  getLatLng,
  inferRowSummary: (item) => formatArea(item.raw.area),
  detailFields: (item) => {
    const r = item.raw;
    const fields: Array<{ label: string; value: string }> = [];
    if (r.parkType) fields.push({ label: '공원 유형', value: r.parkType });
    const area = formatArea(r.area);
    if (area) fields.push({ label: '면적', value: area });
    return fields;
  },
  renderRichSections: () => null,
};
```

- [ ] **Step 4: 테스트 실행 — PASS 확인**

```bash
pnpm test -- tests/lib/park-adapter.test.ts 2>&1 | grep -E "PASS|FAIL"
```
Expected: `PASS`

- [ ] **Step 5: 타입 체크**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```
Expected: 오류 없음

- [ ] **Step 6: 커밋**

```bash
git add lib/urban/adapters/park.ts tests/lib/park-adapter.test.ts
git commit -m "feat(park): park 어댑터 추가 (parkDef, inferRowSummary, detailFields)"
```

---

## Task 2: Category 시스템에 park 등록 (`lib/urban/category.ts`)

**Files:**
- Modify: `lib/urban/category.ts`

- [ ] **Step 1: UrbanSlug에 'park' 추가 및 parkDef 등록**

`lib/urban/category.ts`에서 다음 세 곳을 수정:

```ts
// 1. import 추가 (chargerDef import 바로 아래)
import { parkDef } from './adapters/park';

// 2. UrbanSlug 타입 변경
export type UrbanSlug = 'parking' | 'charger' | 'park';

// 3. URBAN_SLUGS 배열에 추가
export const URBAN_SLUGS = ['parking', 'charger', 'park'] as const satisfies readonly UrbanSlug[];

// 4. URBAN_CATEGORIES에 park 추가
export const URBAN_CATEGORIES: Record<UrbanSlug, UrbanCategoryDef> = {
  parking: parkingDef,
  charger: chargerDef,
  park: parkDef,
};
```

- [ ] **Step 2: 타입 체크**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```
Expected: 오류 없음

- [ ] **Step 3: 커밋**

```bash
git add lib/urban/category.ts
git commit -m "feat(park): UrbanSlug에 park 추가, category 레지스트리 등록"
```

---

## Task 3: NearbyPark + UrbanSameCategoryNearby 일반화

**Files:**
- Modify: `lib/urban/nearby.ts`
- Modify: `app/(public)/urban/[category]/_components/urban-same-category-nearby.tsx`

- [ ] **Step 1: `lib/urban/nearby.ts`에 NearbyPark 타입 및 쿼리 추가**

파일 맨 끝에 추가:

```ts
// lib/urban/nearby.ts 맨 끝에 추가
export interface NearbyPark {
  id: bigint;
  name: string;
  address: string;
  parkType: string | null;
  distanceMeters: number;
}

export async function getSameCategoryNearbyPark(
  lat: number,
  lng: number,
  excludeId: bigint,
  radiusMeters = 1000,
  limit = 6,
): Promise<NearbyPark[]> {
  const rows = await prisma.$queryRaw<NearbyPark[]>`
    SELECT id, name, address, "parkType",
      ROUND(ST_Distance(
        location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )::numeric)::int AS "distanceMeters"
    FROM "Park"
    WHERE location IS NOT NULL
      AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusMeters})
    ORDER BY "distanceMeters"
    LIMIT ${limit + 1}
  `;
  return rows.filter((r) => r.id !== excludeId).slice(0, limit);
}
```

- [ ] **Step 2: `UrbanSameCategoryNearby` 타입 일반화**

`urban-same-category-nearby.tsx`에서 `NearbyParking` import 제거 후 인라인 타입으로 교체:

```tsx
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import type { UrbanCategoryDef } from '@/lib/urban/category';

type NearbyItem = {
  id: bigint;
  name: string;
  address: string;
  distanceMeters: number;
  prkplceSe?: string | null;
  chargeInfo?: string | null;
};

export function UrbanSameCategoryNearby({ items, def }: { items: NearbyItem[]; def: UrbanCategoryDef }) {
  if (items.length === 0) return null;
  return (
    <Card id="same">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">{def.emoji} 가까운 {def.label}</h2>
      <ul className="divide-y divide-[var(--color-line)]">
        {items.map((it) => (
          <li key={String(it.id)}>
            <Link href={`/urban/${def.slug}/${it.id}`} className="flex items-center justify-between py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--color-blue-dark)]">{it.name}
                  <span className="ml-2 rounded-md bg-[var(--color-sky-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--color-blue)]">{it.distanceMeters}m</span>
                </p>
                <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">
                  {it.address}
                  {(it.prkplceSe || it.chargeInfo) && (
                    <> · {[it.prkplceSe, it.chargeInfo].filter(Boolean).join(' · ')}</>
                  )}
                </p>
              </div>
              <span className="shrink-0 text-xs text-[var(--color-muted)]">상세 →</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

- [ ] **Step 3: 타입 체크**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```
Expected: 오류 없음

- [ ] **Step 4: 커밋**

```bash
git add lib/urban/nearby.ts app/\(public\)/urban/\[category\]/_components/urban-same-category-nearby.tsx
git commit -m "feat(park): NearbyPark 타입·쿼리 추가, UrbanSameCategoryNearby 타입 일반화"
```

---

## Task 4: ParkCard 컴포넌트 + UrbanCard 분기

**Files:**
- Create: `app/(public)/urban/[category]/_components/park-card.tsx`
- Modify: `app/(public)/urban/[category]/_components/urban-card.tsx`

- [ ] **Step 1: `park-card.tsx` 작성**

```tsx
// app/(public)/urban/[category]/_components/park-card.tsx
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { UrbanItem } from '@/lib/urban/category';
import { PARK_TYPE_EMOJI, formatArea, type ParkRaw } from '@/lib/urban/adapters/park';

export function ParkCard({ item }: { item: UrbanItem<ParkRaw> }) {
  const r = item.raw;
  const emoji = (r.parkType && PARK_TYPE_EMOJI[r.parkType]) ?? '🌳';
  const area = formatArea(r.area);

  return (
    <Link href={`/urban/park/${item.id}`}>
      <article className="flex items-center gap-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-4 shadow-[var(--shadow-soft)] transition hover:border-[var(--color-sky)]">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--color-sky-soft)] text-2xl">{emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {r.parkType && <Badge tone="green">{r.parkType}</Badge>}
            {area && <Badge tone="gray">{area}</Badge>}
            <h3 className="text-base font-bold text-[var(--color-blue-dark)]">{item.name}</h3>
          </div>
          <p className="mt-1.5 truncate text-sm text-[var(--color-muted)]">{item.address}</p>
        </div>
        <span className="shrink-0 text-xs text-[var(--color-muted)]">상세 →</span>
      </article>
    </Link>
  );
}
```

- [ ] **Step 2: `urban-card.tsx` 상단에 park 분기 추가**

`urban-card.tsx` 파일 상단 import에 추가하고, 함수 첫 줄에 분기 삽입:

```tsx
// 추가할 import (기존 import 뒤에)
import { ParkCard } from './park-card';
import type { ParkRaw } from '@/lib/urban/adapters/park';

// UrbanCard 함수 최상단에 추가 (const r = ... 위)
export function UrbanCard({ item, def }: { item: UrbanItem; def: UrbanCategoryDef }) {
  if (def.slug === 'park') return <ParkCard item={item as UrbanItem<ParkRaw>} />;

  const r = item.raw as ParkingRaw;
  // ... 이하 기존 코드 그대로
```

- [ ] **Step 3: 타입 체크**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```
Expected: 오류 없음

- [ ] **Step 4: 커밋**

```bash
git add app/\(public\)/urban/\[category\]/_components/park-card.tsx app/\(public\)/urban/\[category\]/_components/urban-card.tsx
git commit -m "feat(park): ParkCard 컴포넌트 추가, UrbanCard에 park 분기 연결"
```

---

## Task 5: ParkInfo 컴포넌트 + UrbanHero 시간 배지 가드

**Files:**
- Create: `app/(public)/urban/[category]/_components/park-info.tsx`
- Modify: `app/(public)/urban/[category]/_components/urban-hero.tsx`

- [ ] **Step 1: `park-info.tsx` 작성**

```tsx
// app/(public)/urban/[category]/_components/park-info.tsx
import { Card } from '@/components/ui/card';
import type { UrbanItem } from '@/lib/urban/category';
import { formatArea, type ParkRaw } from '@/lib/urban/adapters/park';

export function ParkInfo({ item }: { item: UrbanItem<ParkRaw> }) {
  const r = item.raw;
  return (
    <Card id="info">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">공원 기본정보</h2>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <div className="flex justify-between border-b border-[var(--color-line)] pb-2.5">
          <span className="text-sm text-[var(--color-muted)]">공원 유형</span>
          <span className="text-sm font-semibold text-[var(--color-text)]">{r.parkType ?? '-'}</span>
        </div>
        <div className="flex justify-between border-b border-[var(--color-line)] pb-2.5">
          <span className="text-sm text-[var(--color-muted)]">면적</span>
          <span className="text-sm font-semibold text-[var(--color-text)]">{formatArea(r.area) ?? '-'}</span>
        </div>
        <div className="flex justify-between border-b border-[var(--color-line)] pb-2.5 sm:col-span-2">
          <span className="text-sm text-[var(--color-muted)]">주소</span>
          <span className="text-sm font-semibold text-[var(--color-text)]">{r.address}</span>
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: `urban-hero.tsx` 시간 배지를 parking 전용으로 가드**

`UrbanHero` 함수 시그니처에 `def` prop이 이미 있으므로, `allDay24`·`noHours` 배지 두 곳에 조건 추가:

```tsx
// 변경 전
{allDay24 && <Badge tone="blue">⏰ 24시간</Badge>}
{noHours && <Badge tone="gray">운영시간 미상</Badge>}

// 변경 후
{def.slug === 'parking' && allDay24 && <Badge tone="blue">⏰ 24시간</Badge>}
{def.slug === 'parking' && noHours && <Badge tone="gray">운영시간 미상</Badge>}
```

- [ ] **Step 3: 타입 체크**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```
Expected: 오류 없음

- [ ] **Step 4: 커밋**

```bash
git add app/\(public\)/urban/\[category\]/_components/park-info.tsx app/\(public\)/urban/\[category\]/_components/urban-hero.tsx
git commit -m "feat(park): ParkInfo 컴포넌트 추가, UrbanHero 운영시간 배지 parking 전용 가드"
```

---

## Task 6: 상세 페이지 배선 (`[id]/page.tsx`)

**Files:**
- Modify: `app/(public)/urban/[category]/[id]/page.tsx`

현재 `[id]/page.tsx`는 주차장 전용 컴포넌트를 하드코딩. 공원 전용 분기를 추가한다.

- [ ] **Step 1: import 추가**

파일 상단 import 섹션에 추가:

```tsx
import { ParkInfo } from '../_components/park-info';
import type { ParkRaw } from '@/lib/urban/adapters/park';
import { getSameCategoryNearbyPark } from '@/lib/urban/nearby';
```

- [ ] **Step 2: sameCat 쿼리 분기**

현재 코드:
```tsx
const [apts, mixed, sameCat, otherList] = await Promise.all([
  coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
  coord ? getMixedNearbyForDetail('parking', coord.lat, coord.lng).catch(() => emptyMixed) : Promise.resolve(emptyMixed),
  coord ? getSameCategoryNearbyParking(coord.lat, coord.lng, itemId) : Promise.resolve([]),
  sigunguCode ? getUrbanList(def.slug, { sigunguCode }, 1) : Promise.resolve(emptyList),
]);
```

변경 후:
```tsx
const [apts, mixed, sameCat, otherList] = await Promise.all([
  coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
  coord ? getMixedNearbyForDetail('parking', coord.lat, coord.lng).catch(() => emptyMixed) : Promise.resolve(emptyMixed),
  coord
    ? def.slug === 'park'
      ? getSameCategoryNearbyPark(coord.lat, coord.lng, itemId)
      : getSameCategoryNearbyParking(coord.lat, coord.lng, itemId)
    : Promise.resolve([]),
  sigunguCode ? getUrbanList(def.slug, { sigunguCode }, 1) : Promise.resolve(emptyList),
]);
```

- [ ] **Step 3: main 섹션에 공원 전용 컴포넌트 분기 추가**

현재 코드 (ParkingHoursTable 앞뒤):
```tsx
<UrbanInfo item={item} def={def} regionFullName={region?.fullName ?? ''} />
<ParkingHoursTable row={r} />
<ParkingFeeGrid row={r} />
<ParkingExtras row={r} />
{coord ? (
```

변경 후:
```tsx
{def.slug === 'park' ? (
  <ParkInfo item={item as import('@/lib/urban/category').UrbanItem<ParkRaw>} />
) : (
  <>
    <UrbanInfo item={item} def={def} regionFullName={region?.fullName ?? ''} />
    <ParkingHoursTable row={r} />
    <ParkingFeeGrid row={r} />
    <ParkingExtras row={r} />
  </>
)}
{coord ? (
```

- [ ] **Step 4: 사이드바에 공원 전용 앵커 전달**

현재 `UrbanDetailSidebar`는 기본 앵커(hours·fee·extras 포함)를 사용.
공원은 이 앵커들이 없으므로 커스텀 앵커를 전달:

```tsx
// 상세 페이지 내 UrbanDetailSidebar 호출 부분 변경
const PARK_ANCHORS = [
  { href: '#info', label: '공원 정보' },
  { href: '#map',  label: '위치' },
  { href: '#apt',  label: '주변 아파트' },
  { href: '#poi',  label: '주변 상권' },
  { href: '#same', label: '가까운 공원' },
];

<aside>
  <UrbanDetailSidebar
    others={others}
    def={def}
    sigunguCode={sigunguCode}
    anchors={def.slug === 'park' ? PARK_ANCHORS : undefined}
  />
</aside>
```

- [ ] **Step 5: 타입 체크**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```
Expected: 오류 없음

- [ ] **Step 6: 커밋**

```bash
git add app/\(public\)/urban/\[category\]/\[id\]/page.tsx
git commit -m "feat(park): 상세 페이지에 공원 전용 섹션 분기 배선 (ParkInfo, sameCategoryNearbyPark, 앵커)"
```

---

## Task 7: 공원 페이지 활성화

**Files:**
- Modify: `app/(public)/_components/life-menu.ts`

- [ ] **Step 1: life-menu.ts에서 park live: true로 변경**

```ts
// 변경 전
{ label: '공원', href: '/urban/park', live: false },

// 변경 후
{ label: '공원', href: '/urban/park', live: true },
```

- [ ] **Step 2: 빌드 타입 체크 최종 확인**

```bash
pnpm tsc --noEmit 2>&1 | head -30
```
Expected: 오류 없음

- [ ] **Step 3: 전체 테스트 실행**

```bash
pnpm test -- tests/lib/park-adapter.test.ts tests/lib/urban-category.test.ts 2>&1 | grep -E "PASS|FAIL"
```
Expected: 모두 `PASS`

- [ ] **Step 4: 커밋**

```bash
git add app/\(public\)/_components/life-menu.ts
git commit -m "feat(park): 공원 페이지 활성화 (live: true)"
```

---

## 자기검토 체크리스트

**스펙 커버리지:**
- [x] `/urban/park` 목록 — Task 1·2·4
- [x] `/urban/park/[id]` 상세 — Task 5·6
- [x] 사이드바 필터 + 공원유형 서브필터 — Task 1 (parkDef.subFilters)
- [x] ParkCard (이름·유형배지·면적배지·주소) — Task 4
- [x] ParkInfo (공원유형·면적·주소) — Task 5
- [x] 지도 (NaverMap 재사용) — 기존 코드 그대로, 좌표 없으면 미표시
- [x] 주변 아파트·편의시설 — 기존 코드 그대로
- [x] 같은 지역 공원 — Task 3·6
- [x] 모바일 필터 바텀시트 — parkDef.subFilters 등록으로 UrbanMobileFilterSheet 자동 작동
- [x] life-menu.ts live: true — Task 7
