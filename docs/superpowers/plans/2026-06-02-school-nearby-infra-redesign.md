# 학교 상세 주변 생활 인프라 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학교 상세의 탭형 "주변 생활 인프라"를 요약 배지줄 + 균일 2열 그리드(8개 카테고리·cap 5·0곳 숨김·높이 자동 정렬)로 교체한다.

**Architecture:** 분류·정규화 로직은 순수 함수(`lib/amenity/infra.ts`)로 분리해 단위 테스트하고, DB 쿼리는 기존 `lib/amenity/nearby.ts` 함수를 재사용 + `getNearbyParking` 신설, 화면은 클라이언트 컴포넌트 `nearby-infra.tsx`(더보기 toggle)로 렌더한다.

**Tech Stack:** Next.js(App Router, ISR) · Prisma `$queryRaw`(PostGIS) · React + TailwindCSS · Vitest.

스펙: `docs/superpowers/specs/2026-06-02-school-nearby-infra-redesign-design.md`

---

## File Structure

- `lib/amenity/infra.ts` (신규) — 타입(`InfraItem`/`InfraCategory`), `classifyStore`, `buildInfraCategories`. **순수 함수** (DB 의존 없음, 타입만 `import type`).
- `tests/lib/amenity-infra.test.ts` (신규) — 위 순수 함수 테스트.
- `lib/amenity/nearby.ts` (수정) — `NearbyParking` 타입 + `getNearbyParking` 추가, 기존 getNearby* 에 옵셔널 `limit` 파라미터 추가(기본값=현행 유지), `getSchoolNearbyInfra` 집계 함수 추가.
- `app/(public)/school/[sigunguCode]/[id]/_components/nearby-infra.tsx` (신규) — 화면 컴포넌트.
- `app/(public)/school/[sigunguCode]/[id]/_components/nearby-amenities.tsx` (삭제) — 탭 컴포넌트 제거.
- `app/(public)/school/[sigunguCode]/[id]/page.tsx` (수정) — 데이터 호출/렌더 교체.

---

## Task 1: 순수 분류·정규화 모듈

**Files:**
- Create: `lib/amenity/infra.ts`
- Test: `tests/lib/amenity-infra.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/lib/amenity-infra.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { classifyStore, buildInfraCategories, type RawInfra } from '@/lib/amenity/infra';

describe('classifyStore', () => {
  it('편의점·마트·슈퍼 prefix는 mart', () => {
    for (const c of ['G20405', 'G20404', 'G20402', 'G2040501']) {
      expect(classifyStore(c)).toBe('mart');
    }
  });
  it('카페·기타·null은 etc', () => {
    for (const c of ['I21201', 'Z999', null]) {
      expect(classifyStore(c)).toBe('etc');
    }
  });
});

const empty: RawInfra = {
  stores: [], hospitals: [], pharmacies: [], parks: [], markets: [], chargers: [], parking: [],
};

describe('buildInfraCategories', () => {
  it('빈 카테고리는 결과에서 제외한다', () => {
    expect(buildInfraCategories(empty)).toEqual([]);
  });

  it('Store를 편의·마트(store)와 기타(etc)로 분리한다', () => {
    const cats = buildInfraCategories({
      ...empty,
      stores: [
        { id: 1n, name: 'GS25', address: '', industryCode: 'G20405', industryName: '편의점', distanceMeters: 80 },
        { id: 2n, name: '스타벅스', address: '', industryCode: 'I21201', industryName: '카페', distanceMeters: 120 },
      ],
    });
    const store = cats.find((c) => c.key === 'store');
    const etc = cats.find((c) => c.key === 'etc');
    expect(store?.items.map((i) => i.name)).toEqual(['GS25']);
    expect(etc?.items.map((i) => i.name)).toEqual(['스타벅스']);
    expect(store?.items[0]).toMatchObject({ id: '1', sub: '편의점', distanceMeters: 80 });
  });

  it('고정 순서로 반환한다(store→hospital→…→etc)', () => {
    const cats = buildInfraCategories({
      ...empty,
      stores: [{ id: 1n, name: 'GS25', address: '', industryCode: 'G20405', industryName: '편의점', distanceMeters: 80 }],
      hospitals: [{ id: 9n, name: '내과', typeName: '의원', address: '', distanceMeters: 100 }],
      parking: [{ id: 7n, name: '공영주차장', address: '', prkplceSe: '공영', prkcmprt: 120, distanceMeters: 150 }],
    });
    expect(cats.map((c) => c.key)).toEqual(['store', 'hospital', 'parking']);
    expect(cats.find((c) => c.key === 'parking')?.items[0].sub).toBe('공영 · 120면');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/amenity-infra.test.ts`
Expected: FAIL — `Cannot find module '@/lib/amenity/infra'`.

- [ ] **Step 3: Write minimal implementation**

`lib/amenity/infra.ts`:
```ts
import type {
  NearbyStore, NearbyHospital, NearbyPharmacy, NearbyPark,
  NearbyTraditionalMarket, NearbyEvCharger, NearbyParking,
} from '@/lib/amenity/nearby';

export interface InfraItem {
  id: string;
  name: string;
  sub: string | null;
  distanceMeters: number;
}

export type InfraCategoryKey =
  | 'store' | 'hospital' | 'pharmacy' | 'park'
  | 'market' | 'charger' | 'parking' | 'etc';

export interface InfraCategory {
  key: InfraCategoryKey;
  label: string;
  icon: string;
  radiusLabel: string;
  items: InfraItem[];
}

export interface RawInfra {
  stores: NearbyStore[];
  hospitals: NearbyHospital[];
  pharmacies: NearbyPharmacy[];
  parks: NearbyPark[];
  markets: NearbyTraditionalMarket[];
  chargers: NearbyEvCharger[];
  parking: NearbyParking[];
}

const MART_PREFIXES = ['G20405', 'G20404', 'G20402'];

export function classifyStore(industryCode: string | null): 'mart' | 'etc' {
  const c = industryCode ?? '';
  return MART_PREFIXES.some((p) => c.startsWith(p)) ? 'mart' : 'etc';
}

function parkSub(p: NearbyPark): string | null {
  if (p.parkType && p.area) return `${p.parkType} · ${Math.round(p.area).toLocaleString()}㎡`;
  return p.parkType ?? null;
}

function parkingSub(p: NearbyParking): string | null {
  const parts = [p.prkplceSe, p.prkcmprt ? `${p.prkcmprt}면` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export function buildInfraCategories(raw: RawInfra): InfraCategory[] {
  const mart = raw.stores.filter((s) => classifyStore(s.industryCode) === 'mart');
  const etc = raw.stores.filter((s) => classifyStore(s.industryCode) === 'etc');

  const cats: InfraCategory[] = [
    { key: 'store', label: '편의·마트', icon: '🛒', radiusLabel: '반경 500m 내',
      items: mart.map((s) => ({ id: String(s.id), name: s.name, sub: s.industryName ?? null, distanceMeters: s.distanceMeters })) },
    { key: 'hospital', label: '병원', icon: '🏥', radiusLabel: '반경 500m 내',
      items: raw.hospitals.map((h) => ({ id: String(h.id), name: h.name, sub: h.typeName ?? null, distanceMeters: h.distanceMeters })) },
    { key: 'pharmacy', label: '약국', icon: '💊', radiusLabel: '반경 500m 내',
      items: raw.pharmacies.map((p) => ({ id: String(p.id), name: p.name, sub: p.address ?? null, distanceMeters: p.distanceMeters })) },
    { key: 'park', label: '공원', icon: '🌳', radiusLabel: '반경 1km 내',
      items: raw.parks.map((p) => ({ id: String(p.id), name: p.name, sub: parkSub(p), distanceMeters: p.distanceMeters })) },
    { key: 'market', label: '전통시장', icon: '🏬', radiusLabel: '반경 1km 내',
      items: raw.markets.map((m) => ({ id: String(m.id), name: m.name, sub: m.marketType ?? null, distanceMeters: m.distanceMeters })) },
    { key: 'charger', label: '전기차 충전소', icon: '⚡', radiusLabel: '반경 500m 내',
      items: raw.chargers.map((c) => ({ id: String(c.id), name: c.name, sub: `${c.chargeSpeed} · ${c.chargerCount}기`, distanceMeters: c.distanceMeters })) },
    { key: 'parking', label: '주차장', icon: '🅿️', radiusLabel: '반경 500m 내',
      items: raw.parking.map((p) => ({ id: String(p.id), name: p.name, sub: parkingSub(p), distanceMeters: p.distanceMeters })) },
    { key: 'etc', label: '기타 생활편의', icon: '🏪', radiusLabel: '반경 500m 내',
      items: etc.map((s) => ({ id: String(s.id), name: s.name, sub: s.industryName ?? null, distanceMeters: s.distanceMeters })) },
  ];

  return cats.filter((c) => c.items.length > 0);
}
```

> 주의: `import type`만 사용해야 `nearby.ts`(값으로 `buildInfraCategories`를 import)와 런타임 순환참조가 생기지 않는다. `NearbyParking` 타입은 Task 2에서 `nearby.ts`에 추가되므로, 이 시점엔 타입 에러가 날 수 있다 — Task 2까지 마친 뒤 tsc가 통과한다. (테스트는 vitest 트랜스파일이라 타입 미존재여도 런타임 통과.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/amenity-infra.test.ts`
Expected: PASS (3 describe, 5 it).

- [ ] **Step 5: Commit**

```bash
git add lib/amenity/infra.ts tests/lib/amenity-infra.test.ts
git commit -m "feat(school): 주변 인프라 분류·정규화 순수 모듈 추가"
```

---

## Task 2: 데이터 계층 — 주차장 쿼리 + 집계 함수

**Files:**
- Modify: `lib/amenity/nearby.ts`

- [ ] **Step 1: `NearbyParking` 타입과 `getNearbyParking` 추가**

`lib/amenity/nearby.ts` 끝에 추가:
```ts
export interface NearbyParking {
  id: bigint;
  name: string;
  address: string;
  prkplceSe: string | null;
  prkcmprt: number | null;
  distanceMeters: number;
}

export async function getNearbyParking(
  lat: number,
  lng: number,
  radiusMeters = 500,
  limit = 12,
): Promise<NearbyParking[]> {
  return prisma.$queryRaw<NearbyParking[]>`
    SELECT id, name, address, "prkplceSe", "prkcmprt",
      ROUND(ST_Distance(
        location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )::numeric) AS "distanceMeters"
    FROM "Parking"
    WHERE location IS NOT NULL
      AND ST_DWithin(
        location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusMeters}
      )
    ORDER BY "distanceMeters"
    LIMIT ${limit}
  `;
}
```

- [ ] **Step 2: 재사용 쿼리에 옵셔널 `limit` 파라미터 추가 (기존 동작 보존)**

각 함수 시그니처와 `LIMIT` 절만 수정. 기본값은 현행 LIMIT 값과 동일하게 두어 다른 페이지 호출에 영향 없음.

`getNearbyEvChargers`: 시그니처를 `(lat, lng, radiusMeters = 500, limit = 10)` 로, `LIMIT 10` → `LIMIT ${limit}`.
`getNearbyTraditionalMarkets`: `(lat, lng, radiusMeters = 1000, limit = 5)`, `LIMIT 5` → `LIMIT ${limit}`.
`getNearbyStores`: `(lat, lng, radiusMeters = 300, limit = 10)`, `LIMIT 10` → `LIMIT ${limit}`.
`getNearbyParks`: `(lat, lng, radiusMeters = 1000, limit = 5)`, `LIMIT 5` → `LIMIT ${limit}`.
`getNearbyPharmacies`: `(lat, lng, radiusMeters = 500, limit = 5)`, `LIMIT 5` → `LIMIT ${limit}`.
`getNearbyHospitals`: `(lat, lng, radiusMeters = 500, limit = 5)`, `LIMIT 5` → `LIMIT ${limit}`.

- [ ] **Step 3: `getSchoolNearbyInfra` 집계 함수 추가, 기존 `getSchoolNearbyAmenities` 제거**

`lib/amenity/nearby.ts` 상단 import에 추가:
```ts
import { buildInfraCategories, type InfraCategory } from '@/lib/amenity/infra';
```

기존 `getSchoolNearbyAmenities` 함수(주석 포함, line ~191-203)를 통째로 아래로 교체:
```ts
// 학교 상세 "주변 생활 인프라" — 8개 카테고리를 정규화해 반환. 빈 카테고리는 제외됨.
export async function getSchoolNearbyInfra(lat: number, lng: number): Promise<InfraCategory[]> {
  const [stores, hospitals, pharmacies, parks, markets, chargers, parking] = await Promise.all([
    getNearbyStores(lat, lng, 500, 12),
    getNearbyHospitals(lat, lng, 500, 12),
    getNearbyPharmacies(lat, lng, 500, 12),
    getNearbyParks(lat, lng, 1000, 12),
    getNearbyTraditionalMarkets(lat, lng, 1000, 12),
    getNearbyEvChargers(lat, lng, 500, 12),
    getNearbyParking(lat, lng, 500, 12),
  ]);
  return buildInfraCategories({ stores, hospitals, pharmacies, parks, markets, chargers, parking });
}
```

- [ ] **Step 4: 타입체크 통과 확인 (집계+Task1 결합)**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 통과 (no errors). 만약 `getSchoolNearbyAmenities`를 참조하는 곳이 page.tsx 외에 있으면 Task 3/4에서 정리된다 — 이 시점에 남은 참조는 `page.tsx` 한 곳뿐임을 확인.

Run: `pnpm vitest run tests/lib/amenity-infra.test.ts`
Expected: PASS (Task 1 테스트 여전히 통과).

- [ ] **Step 5: Commit**

```bash
git add lib/amenity/nearby.ts
git commit -m "feat(school): 주차장 nearby 쿼리 + getSchoolNearbyInfra 집계 추가"
```

---

## Task 3: 화면 컴포넌트 `nearby-infra.tsx`

**Files:**
- Create: `app/(public)/school/[sigunguCode]/[id]/_components/nearby-infra.tsx`
- Delete: `app/(public)/school/[sigunguCode]/[id]/_components/nearby-amenities.tsx`

- [ ] **Step 1: `nearby-infra.tsx` 작성**

```tsx
'use client';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import type { InfraCategory } from '@/lib/amenity/infra';

const DISPLAY_CAP = 5;

export function NearbyInfra({ categories }: { categories: InfraCategory[] }) {
  if (categories.length === 0) return null;
  return (
    <Card id="poi">
      <h2 className="text-lg font-bold text-[var(--color-blue-dark)]">주변 생활 인프라</h2>
      <p className="mb-3 text-xs text-[var(--color-muted)]">반경 500m~1km · 가까운 순</p>

      <div className="mb-4 -mx-1 flex gap-2 overflow-x-auto border-b border-[var(--color-line)] px-1 pb-4">
        {categories.map((c) => (
          <span
            key={c.key}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-1.5 text-xs font-bold text-[var(--color-blue-dark)]"
          >
            <span>{c.icon}</span>
            {c.label}
            <span className="text-[var(--color-blue)]">{c.items.length} · {c.items[0].distanceMeters}m</span>
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 [grid-auto-rows:1fr] md:grid-cols-2">
        {categories.map((c) => (
          <InfraBlock key={c.key} category={c} />
        ))}
      </div>
    </Card>
  );
}

function InfraBlock({ category }: { category: InfraCategory }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? category.items : category.items.slice(0, DISPLAY_CAP);
  const hiddenCount = category.items.length - DISPLAY_CAP;

  return (
    <div className="flex flex-col rounded-2xl border border-[var(--color-line)] bg-[var(--color-soft)] p-3.5">
      <div className="mb-1.5 text-sm font-bold text-[var(--color-blue-dark)]">
        <span className="mr-1">{category.icon}</span>
        {category.label}
        <span className="ml-1 text-xs font-semibold text-[var(--color-muted)]">{category.items.length}곳</span>
      </div>
      <ul>
        {visible.map((it) => (
          <li
            key={it.id}
            className="flex items-center justify-between gap-2.5 border-b border-[var(--color-line)] py-2 last:border-0"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--color-text)]">{it.name}</p>
              {it.sub && <p className="truncate text-[11px] text-[var(--color-muted)]">{it.sub}</p>}
            </div>
            <span className="shrink-0 rounded-full bg-[var(--color-sky-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-blue)]">
              {it.distanceMeters}m
            </span>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && !expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="mt-auto pt-2 text-left text-xs font-bold text-[var(--color-blue)]"
        >
          +{hiddenCount}곳 더보기 →
        </button>
      ) : (
        <p className="mt-auto pt-2 text-[11px] text-[var(--color-muted)]">
          {category.radiusLabel} {category.items.length}곳
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 기존 탭 컴포넌트 삭제**

```bash
git rm "app/(public)/school/[sigunguCode]/[id]/_components/nearby-amenities.tsx"
```

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/school/[sigunguCode]/[id]/_components/nearby-infra.tsx"
git commit -m "feat(school): 주변 인프라 요약줄+그리드 컴포넌트 추가, 탭 컴포넌트 제거"
```

---

## Task 4: 페이지 연결

**Files:**
- Modify: `app/(public)/school/[sigunguCode]/[id]/page.tsx`

- [ ] **Step 1: import 교체**

`page.tsx` line 6 (`getNearbyApartments, getSchoolNearbyAmenities, getNearbyChildcare`)에서 `getSchoolNearbyAmenities` → `getSchoolNearbyInfra` 로 변경:
```ts
import { getNearbyApartments, getSchoolNearbyInfra, getNearbyChildcare } from '@/lib/amenity/nearby';
```
line 11 교체:
```ts
import { NearbyInfra } from './_components/nearby-infra';
```
(`NearbyAmenities` import 제거)

- [ ] **Step 2: 데이터 호출 교체**

`Promise.all`(line 59-66)의 amenities 항목을 교체:
```ts
  const [apts, infra, nearbyChildren, otherList] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
    coord ? getSchoolNearbyInfra(coord.lat, coord.lng) : Promise.resolve([]),
    coord ? getNearbyChildcare(coord.lat, coord.lng, 1000, 5) : Promise.resolve([]),
    getSchoolList({ sigunguCode }, 1),
  ]);
```

- [ ] **Step 3: 렌더 교체**

line 93 (`<NearbyAmenities .../>`)를 교체:
```tsx
          {coord && <NearbyInfra categories={infra} />}
```

- [ ] **Step 4: 타입체크 + 린트**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 통과 (no errors, `getSchoolNearbyAmenities`/`NearbyAmenities` 미참조 확인).

Run: `pnpm lint`
Expected: 통과 (no errors).

- [ ] **Step 5: Commit**

```bash
git add "app/(public)/school/[sigunguCode]/[id]/page.tsx"
git commit -m "feat(school): 상세 페이지에 주변 인프라 섹션 연결"
```

---

## Task 5: 최종 검증

- [ ] **Step 1: 전체 단위 테스트**

Run: `pnpm vitest run tests/lib/amenity-infra.test.ts`
Expected: PASS.

- [ ] **Step 2: dev 서버에서 육안 확인**

Run: `pnpm dev` 후 데이터가 풍부한 학교 상세(예: 강남구) URL 접속.
확인 항목:
- 탭이 사라지고 요약 배지줄 + 2열 그리드가 보인다.
- 5곳 초과 카테고리에 `+N곳 더보기`가 있고 클릭 시 펼쳐진다.
- 0곳 카테고리는 블록/배지 모두 없다.
- 한 행의 두 블록 높이가 같다(1곳 vs 5곳이어도 ragged 없음).
- 항목 이름이 진한색으로 또렷하다.

- [ ] **Step 3: 모바일 폭 확인**

브라우저 375px 또는 DevTools 모바일 뷰: 그리드 1열, 요약줄 가로 스크롤, 깨짐 없음.

- [ ] **Step 4: 좌표 없는 학교 확인**

`location`이 없는 학교 상세에서 섹션이 미렌더(에러 없이)됨을 확인.

---

## Self-Review (작성자 점검 결과)

- **스펙 커버리지:** 레이아웃(요약줄+그리드)=Task3, 카테고리 8종/순서=Task1, cap5+더보기=Task3, 0곳 숨김=Task1(filter)+Task3(early return), 높이 정렬(`[grid-auto-rows:1fr]`)=Task3, 데이터계층(재사용+주차장+집계)=Task2, 가독성(진한색)=Task3, SEO(초기5개 SSR/더보기만 client)=Task3 구조, 모바일=Task3 클래스 → 전 항목 매핑됨.
- **Placeholder 스캔:** 없음(모든 코드 전문 기재).
- **타입 일관성:** `InfraCategory`/`InfraItem`/`RawInfra`/`NearbyParking` 시그니처가 Task1·2·3에서 일치. `getSchoolNearbyInfra` 반환 `InfraCategory[]`를 Task4가 `categories` prop으로 전달 — 일치.
- **알려진 순서 의존성:** Task1의 `infra.ts`는 `NearbyParking`(Task2 추가)을 `import type` 하므로, Task2 완료 전에는 tsc가 실패할 수 있음 → tsc 검증은 Task2 Step4부터 수행하도록 배치함.
