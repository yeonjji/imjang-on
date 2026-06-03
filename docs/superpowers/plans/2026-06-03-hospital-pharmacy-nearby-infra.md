# 병원·약국 주변 생활 인프라 (NearbyInfra) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 병원·약국 상세의 옛 주변-인프라 컴포넌트를 공용 `NearbyInfra`로 교체하고, 카페 독립 카테고리 추가 + 어린이집 opt-in 포함 + 자기 카테고리 자기 제외를 적용한다.

**Architecture:** 공용 순수 로직(`lib/amenity/infra.ts`)에 `cafe`(전역)·`childcare`(opt-in) 카테고리를 추가하고, 공용 집계(`lib/amenity/nearby.ts`)의 `getNearbyInfra`에 `excludeHospitalId`/`excludePharmacyId`/`includeChildcare` 옵션을 더한다. 두 상세 page.tsx는 옛 컴포넌트를 제거하고 `<NearbyApartments>`(아파트 별도 유지) + `<NearbyInfra>`로 재구성한다.

**Tech Stack:** Next.js(App Router, RSC), TypeScript, Prisma + PostGIS raw query, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-03-hospital-pharmacy-nearby-infra-design.md`

---

## File Structure

- `lib/amenity/infra.ts` (modify) — 순수 분류/정규화. `cafe`·`childcare` 카테고리 추가.
- `tests/lib/amenity-infra.test.ts` (modify) — cafe/childcare 케이스 추가, 기존 cafe→etc 기대값 갱신.
- `lib/amenity/nearby.ts` (modify) — `getNearbyHospitals`/`getNearbyPharmacies` excludeId, `getNearbyInfra` opts.
- `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx` (modify) — NearbyInfra 적용.
- `app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-nearby.tsx` (delete).
- `app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx` (modify) — NearbyInfra 적용.
- `app/(public)/medical/pharmacy/[sigunguCode]/[id]/_components/pharmacy-nearby.tsx` (delete).

---

## Task 1: `cafe` 카테고리 (전역, 순수 로직)

**Files:**
- Modify: `lib/amenity/infra.ts`
- Test: `tests/lib/amenity-infra.test.ts`

- [ ] **Step 1: 기존 테스트의 cafe 기대값을 갱신하고 실패하는 테스트를 추가한다**

`tests/lib/amenity-infra.test.ts`의 `classifyStore` describe 블록에서 `'카페·기타·null은 etc'` 테스트를 아래로 교체:

```ts
  it('카페 prefix는 cafe', () => {
    for (const c of ['I21201', 'I2120101']) {
      expect(classifyStore(c)).toBe('cafe');
    }
  });
  it('기타·null은 etc', () => {
    for (const c of ['Z999', null]) {
      expect(classifyStore(c)).toBe('etc');
    }
  });
```

같은 파일 `buildInfraCategories` describe의 `'Store를 편의·마트(store)와 기타(etc)로 분리한다'` 테스트를 아래로 교체(스타벅스는 이제 cafe):

```ts
  it('Store를 편의·마트(store)·카페(cafe)·기타(etc)로 분리한다', () => {
    const cats = buildInfraCategories({
      ...empty,
      stores: [
        { id: 1n, name: 'GS25', address: '', industryCode: 'G20405', industryName: '편의점', distanceMeters: 80 },
        { id: 2n, name: '스타벅스', address: '', industryCode: 'I21201', industryName: '카페', distanceMeters: 120 },
        { id: 3n, name: '무인문구', address: '', industryCode: 'Z999', industryName: '기타', distanceMeters: 200 },
      ],
    });
    const store = cats.find((c) => c.key === 'store');
    const cafe = cats.find((c) => c.key === 'cafe');
    const etc = cats.find((c) => c.key === 'etc');
    expect(store?.items.map((i) => i.name)).toEqual(['GS25']);
    expect(cafe?.items.map((i) => i.name)).toEqual(['스타벅스']);
    expect(etc?.items.map((i) => i.name)).toEqual(['무인문구']);
  });
```

`'의료·약국 Store는 기타(etc)에서 제외한다'` 테스트도 cafe 분리에 맞게 교체(커피빈은 이제 cafe, etc는 비어 사라짐):

```ts
  it('의료·약국 Store는 기타·카페에서 제외한다', () => {
    const cats = buildInfraCategories({
      ...empty,
      stores: [
        { id: 1n, name: '커피빈', address: '', industryCode: 'I21201', industryName: '카페', distanceMeters: 100 },
        { id: 2n, name: '수서가정의학과의원', address: '', industryCode: 'Q10209', industryName: '기타 의원', distanceMeters: 120 },
        { id: 3n, name: '국송약국', address: '', industryCode: 'G21501', industryName: '약국', distanceMeters: 130 },
      ],
    });
    expect(cats.find((c) => c.key === 'cafe')?.items.map((i) => i.name)).toEqual(['커피빈']);
    expect(cats.find((c) => c.key === 'etc')).toBeUndefined();
  });
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm vitest run tests/lib/amenity-infra.test.ts`
Expected: FAIL — `classifyStore('I21201')` 가 `'etc'` 반환(아직 cafe 미구현), cafe 카테고리 없음.

- [ ] **Step 3: `infra.ts`에 cafe 분류·카테고리를 구현한다**

`lib/amenity/infra.ts` 상단 상수에 cafe prefix 추가(`MART_PREFIXES` 아래):

```ts
const MART_PREFIXES = ['G20405', 'G20404', 'G20402'];
const CAFE_PREFIXES = ['I21201'];
// 병원(Q101)·의원/한의원(Q102)·약국(G21501)은 전용 카테고리(병원/약국)로 노출되므로 기타에서 제외.
const MEDICAL_PREFIXES = ['Q101', 'Q102', 'G21501'];
```

`InfraCategoryKey` 유니온에 `'cafe'` 추가:

```ts
export type InfraCategoryKey =
  | 'store' | 'cafe' | 'hospital' | 'pharmacy' | 'park'
  | 'market' | 'charger' | 'parking' | 'etc';
```

`classifyStore` 반환 타입·분기 갱신:

```ts
export function classifyStore(industryCode: string | null): 'mart' | 'cafe' | 'medical' | 'etc' {
  const c = industryCode ?? '';
  if (MART_PREFIXES.some((p) => c.startsWith(p))) return 'mart';
  if (CAFE_PREFIXES.some((p) => c.startsWith(p))) return 'cafe';
  if (MEDICAL_PREFIXES.some((p) => c.startsWith(p))) return 'medical';
  return 'etc';
}
```

`buildInfraCategories` 안에서 cafe 분리 + cats 배열에 cafe 카테고리 추가(`store` 바로 뒤):

```ts
  const mart = raw.stores.filter((s) => classifyStore(s.industryCode) === 'mart');
  const cafe = raw.stores.filter((s) => classifyStore(s.industryCode) === 'cafe');
  // 'medical' Store는 의도적으로 제외 — 병원/약국은 Hospital/Pharmacy 전용 카테고리로 노출됨.
  const etc = raw.stores.filter((s) => classifyStore(s.industryCode) === 'etc');
```

cats 배열에서 `store` 항목 바로 다음 줄에 삽입:

```ts
    { key: 'cafe', label: '카페', icon: '☕', radiusLabel: '반경 500m 내',
      items: cafe.map((s) => ({ id: String(s.id), name: s.name, sub: s.industryName ?? null, distanceMeters: s.distanceMeters })) },
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `pnpm vitest run tests/lib/amenity-infra.test.ts`
Expected: PASS (전체 통과).

- [ ] **Step 5: 커밋**

```bash
git add lib/amenity/infra.ts tests/lib/amenity-infra.test.ts
git commit -m "feat(infra): 카페를 주변 인프라 독립 카테고리로 분리

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `childcare` 카테고리 (opt-in, 순수 로직)

**Files:**
- Modify: `lib/amenity/infra.ts`
- Test: `tests/lib/amenity-infra.test.ts`

- [ ] **Step 1: 실패하는 테스트를 추가한다**

`tests/lib/amenity-infra.test.ts` 상단 import에 타입을 추가(있으면 생략):

```ts
import { classifyStore, buildInfraCategories, INFRA_FETCH_LIMIT, type RawInfra } from '@/lib/amenity/infra';
```

`buildInfraCategories` describe 블록 끝에 케이스 추가:

```ts
  it('childcare가 전달되면 어린이집 카테고리를, 미전달/빈배열이면 카테고리 없음', () => {
    const withCare = buildInfraCategories({
      ...empty,
      childcare: [
        { id: 5n, name: '햇살어린이집', address: '', sigunguCode: null, crType: '국공립', capacity: 60, distanceMeters: 90 },
      ],
    });
    const care = withCare.find((c) => c.key === 'childcare');
    expect(care?.items.map((i) => i.name)).toEqual(['햇살어린이집']);
    expect(care?.items[0]).toMatchObject({ id: '5', sub: '국공립', distanceMeters: 90 });

    expect(buildInfraCategories({ ...empty, childcare: [] }).find((c) => c.key === 'childcare')).toBeUndefined();
    expect(buildInfraCategories(empty).find((c) => c.key === 'childcare')).toBeUndefined();
  });

  it('어린이집은 기타 앞, 마지막 직전에 배치된다', () => {
    const cats = buildInfraCategories({
      ...empty,
      stores: [{ id: 1n, name: '무인문구', address: '', industryCode: 'Z999', industryName: '기타', distanceMeters: 200 }],
      childcare: [{ id: 5n, name: '햇살어린이집', address: '', sigunguCode: null, crType: '국공립', capacity: 60, distanceMeters: 90 }],
    });
    expect(cats.map((c) => c.key)).toEqual(['childcare', 'etc']);
  });
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm vitest run tests/lib/amenity-infra.test.ts`
Expected: FAIL — `RawInfra`에 `childcare` 없음(타입 에러) 및 childcare 카테고리 미생성.

- [ ] **Step 3: `infra.ts`에 childcare 카테고리를 구현한다**

import에 `NearbyChildcare` 타입 추가:

```ts
import type {
  NearbyStore, NearbyHospital, NearbyPharmacy, NearbyPark,
  NearbyTraditionalMarket, NearbyEvCharger, NearbyParking, NearbyChildcare,
} from '@/lib/amenity/nearby';
```

`InfraCategoryKey`에 `'childcare'` 추가:

```ts
export type InfraCategoryKey =
  | 'store' | 'cafe' | 'hospital' | 'pharmacy' | 'park'
  | 'market' | 'charger' | 'parking' | 'childcare' | 'etc';
```

`RawInfra`에 선택 필드 추가:

```ts
export interface RawInfra {
  stores: NearbyStore[];
  hospitals: NearbyHospital[];
  pharmacies: NearbyPharmacy[];
  parks: NearbyPark[];
  markets: NearbyTraditionalMarket[];
  chargers: NearbyEvCharger[];
  parking: NearbyParking[];
  childcare?: NearbyChildcare[];
}
```

`buildInfraCategories` cats 배열에서 `parking` 항목과 `etc` 항목 **사이**에 childcare 삽입:

```ts
    { key: 'childcare', label: '어린이집', icon: '👶', radiusLabel: '반경 1km 내',
      items: (raw.childcare ?? []).map((c) => ({ id: String(c.id), name: c.name, sub: c.crType ?? null, distanceMeters: c.distanceMeters })) },
```

(빈 배열·미전달 시 `items.length === 0` 이므로 기존 `.filter((c) => c.items.length > 0)`에서 자동 제외된다.)

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `pnpm vitest run tests/lib/amenity-infra.test.ts`
Expected: PASS (전체 통과).

- [ ] **Step 5: 커밋**

```bash
git add lib/amenity/infra.ts tests/lib/amenity-infra.test.ts
git commit -m "feat(infra): 어린이집 opt-in 카테고리 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `getNearbyInfra` 옵션 — 자기 제외 + 어린이집 fetch

**Files:**
- Modify: `lib/amenity/nearby.ts`

DB raw 쿼리 함수라 단위 테스트 대상이 아니다. tsc로 타입 정합성을 검증한다.

- [ ] **Step 1: `getNearbyHospitals`에 excludeId 추가**

`lib/amenity/nearby.ts`의 `getNearbyHospitals`를 `getNearbyChildcare` 패턴(limit+1 fetch 후 필터)으로 교체:

```ts
export async function getNearbyHospitals(
  lat: number,
  lng: number,
  radiusMeters = 500,
  limit = 5,
  excludeId: bigint | null = null,
): Promise<NearbyHospital[]> {
  const rows = await prisma.$queryRaw<NearbyHospital[]>`
    SELECT
      id, name, "typeName", address,
      ROUND(ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )::numeric) AS "distanceMeters"
    FROM "Hospital"
    WHERE location IS NOT NULL
      AND ST_DWithin(
        location::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${radiusMeters}
      )
    ORDER BY "distanceMeters"
    LIMIT ${limit + 1}
  `;
  return rows.filter((r) => excludeId == null || r.id !== excludeId).slice(0, limit);
}
```

- [ ] **Step 2: `getNearbyPharmacies`에 excludeId 추가**

같은 패턴으로 `getNearbyPharmacies` 교체:

```ts
export async function getNearbyPharmacies(
  lat: number,
  lng: number,
  radiusMeters = 500,
  limit = 5,
  excludeId: bigint | null = null,
): Promise<NearbyPharmacy[]> {
  const rows = await prisma.$queryRaw<NearbyPharmacy[]>`
    SELECT
      id, name, address, tel,
      ROUND(ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )::numeric) AS "distanceMeters"
    FROM "Pharmacy"
    WHERE location IS NOT NULL
      AND ST_DWithin(
        location::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${radiusMeters}
      )
    ORDER BY "distanceMeters"
    LIMIT ${limit + 1}
  `;
  return rows.filter((r) => excludeId == null || r.id !== excludeId).slice(0, limit);
}
```

- [ ] **Step 3: `getNearbyInfra`에 opts 추가**

`getNearbyInfra`를 교체:

```ts
// 상세 "주변 생활 인프라" — 카테고리를 정규화해 반환. 빈 카테고리는 제외됨. (좌표만 받는 범용)
export async function getNearbyInfra(
  lat: number,
  lng: number,
  opts: {
    excludeHospitalId?: bigint;
    excludePharmacyId?: bigint;
    includeChildcare?: boolean;
  } = {},
): Promise<InfraCategory[]> {
  const [stores, hospitals, pharmacies, parks, markets, chargers, parking, childcare] = await Promise.all([
    getNearbyStores(lat, lng, 500, INFRA_FETCH_LIMIT),
    getNearbyHospitals(lat, lng, 500, INFRA_FETCH_LIMIT, opts.excludeHospitalId ?? null),
    getNearbyPharmacies(lat, lng, 500, INFRA_FETCH_LIMIT, opts.excludePharmacyId ?? null),
    getNearbyParks(lat, lng, 1000, INFRA_FETCH_LIMIT),
    getNearbyTraditionalMarkets(lat, lng, 1000, INFRA_FETCH_LIMIT),
    getNearbyEvChargers(lat, lng, 500, INFRA_FETCH_LIMIT),
    getNearbyParking(lat, lng, 500, INFRA_FETCH_LIMIT),
    opts.includeChildcare
      ? getNearbyChildcare(lat, lng, 1000, INFRA_FETCH_LIMIT)
      : Promise.resolve([] as NearbyChildcare[]),
  ]);
  return buildInfraCategories({ stores, hospitals, pharmacies, parks, markets, chargers, parking, childcare });
}
```

- [ ] **Step 4: 타입 검사**

Run: `pnpm tsc --noEmit`
Expected: 에러 없음. (school/childcare 페이지의 `getNearbyInfra(lat,lng)` 무옵션 호출은 그대로 유효.)

- [ ] **Step 5: 커밋**

```bash
git add lib/amenity/nearby.ts
git commit -m "feat(infra): getNearbyInfra에 자기 제외·어린이집 옵션 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 병원 상세 페이지 적용

**Files:**
- Modify: `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx`
- Delete: `app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-nearby.tsx`

- [ ] **Step 1: import 정리 — 옛 nearby 호출/컴포넌트 제거, 공용 컴포넌트 추가**

`page.tsx` 상단 import 블록(3~16행)을 교체:

```ts
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getHospitalById, getHospitalLatLng, getHospitalList } from '@/lib/hospital';
import { getNearbyApartments, getNearbyInfra } from '@/lib/amenity/nearby';
import { HospitalHero } from './_components/hospital-hero';
import { HospitalSummaryCards } from './_components/hospital-summary-cards';
import { HospitalTabs } from './_components/hospital-tabs';
import { HospitalSidebar } from './_components/hospital-sidebar';
import { NearbyApartments } from '@/components/ui/nearby-apartments';
import { NearbyInfra } from '@/components/ui/nearby-infra';
import { NaverMap } from '@/components/ui/naver-map';
import { Card } from '@/components/ui/card';
import type { Metadata } from 'next';
```

- [ ] **Step 2: 데이터 fetch 교체**

`Promise.all` 블록(45~52행)을 교체:

```ts
  const [apts, infra, otherList] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([]),
    coord
      ? getNearbyInfra(coord.lat, coord.lng, { excludeHospitalId: hospital.id, includeChildcare: true })
      : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
    getHospitalList({ sigunguCode }, 1, 5),
  ]);
```

- [ ] **Step 3: 렌더링 교체 — `<HospitalNearby>` → `<NearbyApartments>` + `<NearbyInfra>`**

본문 컬럼의 `<HospitalNearby .../>` 블록(93~99행)을 교체:

```tsx
          <NearbyApartments items={apts} />
          {coord && <NearbyInfra categories={infra} />}
```

- [ ] **Step 4: 옛 컴포넌트 삭제**

```bash
git rm "app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-nearby.tsx"
```

- [ ] **Step 5: 타입·린트 검사**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: 에러 없음. (`apts`/`infra`/`others` 모두 사용됨, 미사용 import 없음.)

- [ ] **Step 6: 커밋**

```bash
git add "app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx"
git commit -m "feat(hospital): 주변 인프라를 NearbyInfra로 교체(자기 제외·어린이집 포함)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 약국 상세 페이지 적용

**Files:**
- Modify: `app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx`
- Delete: `app/(public)/medical/pharmacy/[sigunguCode]/[id]/_components/pharmacy-nearby.tsx`

- [ ] **Step 1: import 정리**

`page.tsx` 상단 import 블록(3~19행)을 교체:

```ts
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPharmacyById, getPharmacyLatLng, getPharmacyList } from '@/lib/pharmacy';
import { getNearbyApartments, getNearbyInfra } from '@/lib/amenity/nearby';
import { PharmacyHero } from './_components/pharmacy-hero';
import { PharmacyInfo } from './_components/pharmacy-info';
import { PharmacySidebar } from './_components/pharmacy-sidebar';
import { NearbyApartments } from '@/components/ui/nearby-apartments';
import { NearbyInfra } from '@/components/ui/nearby-infra';
import { NaverMap } from '@/components/ui/naver-map';
import { Card } from '@/components/ui/card';
import type { Metadata } from 'next';
```

- [ ] **Step 2: 데이터 fetch 교체 — 옛 nearby 호출·convenience/mart/cafe 필터 제거**

`Promise.all` 블록(47~56행)과 그 아래 `convenience`/`mart`/`cafe` 필터(58~63행)를 함께 교체:

```ts
  const [apts, infra, otherList] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([]),
    coord
      ? getNearbyInfra(coord.lat, coord.lng, { excludePharmacyId: pharmacy.id, includeChildcare: true })
      : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
    getPharmacyList({ sigunguCode }, 1, 5),
  ]);

  const others = otherList.rows.filter(p => p.id !== pharmacy.id).slice(0, 4);
```

(기존 64행의 `const others = ...`는 위로 합쳐졌으니 중복 줄이 남지 않게 한다.)

- [ ] **Step 3: 렌더링 교체 — `<PharmacyNearby>` → `<NearbyApartments>` + `<NearbyInfra>`**

본문 컬럼의 `<PharmacyNearby .../>` 블록(95~105행)을 교체:

```tsx
          <NearbyApartments items={apts} />
          {coord && <NearbyInfra categories={infra} />}
```

- [ ] **Step 4: 옛 컴포넌트 삭제**

```bash
git rm "app/(public)/medical/pharmacy/[sigunguCode]/[id]/_components/pharmacy-nearby.tsx"
```

- [ ] **Step 5: 타입·린트 검사**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add "app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx"
git commit -m "feat(pharmacy): 주변 인프라를 NearbyInfra로 교체(자기 제외·어린이집 포함)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 전체 검증 + 실데이터 스크린샷

**Files:** 없음(검증 전용)

- [ ] **Step 1: 전체 자동 검증**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm vitest run`
Expected: 세 명령 모두 PASS.

- [ ] **Step 2: dev 서버 기동**

Run(백그라운드): `pnpm dev`
실제 데이터가 있는 병원·약국 상세 URL을 하나씩 확보한다(예: 기존 목록 페이지에서 진입).

- [ ] **Step 3: Playwright 데스크탑·모바일 스크린샷**

병원 상세, 약국 상세 각각 데스크탑(1280)·모바일(390) 스크린샷을 찍어 확인:
- 요약 배지줄 노출, 카테고리당 더보기(+N곳), 0곳 카테고리 숨김, 균일 2열 높이 정렬, `N+` 배지.
- **카페**·**어린이집** 카테고리 노출.
- **자기 제외**: 병원 상세의 병원 카테고리에 자기 자신 미포함 / 약국 상세의 약국 카테고리에 자기 자신 미포함.
- **주변 아파트** 별도 섹션(`#apt`)이 NearbyInfra 위에 유지.
- **모바일 가로 오버플로우 없음(필수)**: 390px 뷰포트에서 `document.documentElement.scrollWidth <= window.innerWidth` 확인(가로 스크롤 발생 X). 긴 시설명/주소가 truncate되고, 요약 배지줄만 자체 가로 스크롤로 흡수되는지 확인. 모바일에서 카테고리 그리드가 1열로 떨어지는지 확인.

- [ ] **Step 4: 회귀 확인 (school·childcare)**

school 상세·childcare 상세 페이지를 열어:
- 카페가 `기타`에서 독립 `카페` 카테고리로 이동한 것 외 레이아웃 정상.
- school의 어린이집은 여전히 별도 섹션(NearbyInfra 안에 중복 없음 — school은 `includeChildcare` 미전달).

- [ ] **Step 5: PR 생성**

```bash
git push -u origin feat/hospital-pharmacy-nearby-infra
gh pr create --title "feat: 병원·약국 상세 주변 생활 인프라(NearbyInfra) 적용" --body "$(cat <<'EOF'
## 요약
- 병원·약국 상세의 옛 주변-인프라 컴포넌트를 공용 `NearbyInfra`로 교체
- 카페를 인프라 독립 카테고리로 분리(전역), 어린이집 opt-in 카테고리 추가
- 자기 카테고리 자기 제외(병원/약국)
- 주변 아파트는 학교 상세와 동일하게 별도 섹션 유지

## 검증
- tsc / lint / vitest 통과
- 병원·약국 데스크탑·모바일 스크린샷 확인(카페·어린이집·자기 제외·아파트 별도 섹션)
- school·childcare 회귀 없음

스펙: docs/superpowers/specs/2026-06-03-hospital-pharmacy-nearby-infra-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review 결과

- **Spec 커버리지:** cafe(Task1)·childcare(Task2)·getNearbyInfra 옵션/자기제외(Task3)·병원(Task4)·약국(Task5)·검증·회귀(Task6) 전부 매핑됨.
- **타입 정합성:** `excludeHospitalId`/`excludePharmacyId`/`includeChildcare` 옵션명, `RawInfra.childcare`, `InfraCategoryKey`('cafe'·'childcare'), `NearbyChildcare`(id/name/crType/distanceMeters) 사용처 일치.
- **Placeholder:** 없음(모든 코드 블록 실 코드).
- **주의:** Task1에서 **기존** 테스트의 cafe→etc 기대값을 반드시 갱신해야 함(미갱신 시 회귀 실패).
