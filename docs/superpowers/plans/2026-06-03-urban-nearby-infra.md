# 도시인프라(주차장·공원·충전소) 주변 생활 인프라 적용 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 도시인프라 상세(주차장·공원·충전소)의 옛 "주변 상권" 탭 + "가까운 {카테고리}" 섹션을 공용 `NearbyInfra` 단일 리스트로 교체하고, 자기 제외를 추가하며, 완전 고아가 된 옛 자산을 삭제한다.

**Architecture:** 기존 공용 `getNearbyInfra(lat, lng, opts)`에 `excludeParkId`/`excludeParkingId`/`excludeChargerId`를 내부 배열 필터 방식으로 추가(쿼리 시그니처 불변). 두 urban 페이지가 이 함수 + `NearbyInfra` 컴포넌트를 호출하도록 교체. 사이드바 앵커 3곳(PARK_ANCHORS·CHARGER_ANCHORS·DEFAULT_ANCHORS) 보정. 마지막에 미사용이 된 `getMixedNearbyForDetail`·`NearbyAmenitiesMixed`·`lib/urban/nearby.ts` 전체·관련 컴포넌트 2개 삭제.

**Tech Stack:** Next.js 15 App Router (RSC), Prisma + PostGIS raw queries, Vitest, pnpm.

**설계 스펙:** `docs/superpowers/specs/2026-06-03-urban-nearby-infra-design.md`

---

## 사전 컨텍스트 (모든 태스크 공통)

- 공용 컴포넌트: `components/ui/nearby-infra.tsx` 의 `NearbyInfra({ categories })` — 수정 불필요.
- 순수 로직: `lib/amenity/infra.ts` 의 `buildInfraCategories(raw)` — 수정 불필요.
- 집계 함수: `lib/amenity/nearby.ts` 의 `getNearbyInfra(lat, lng, opts)` — Task 1에서 옵션 추가.
- `getNearbyInfra`는 현재 `excludeHospitalId`/`excludePharmacyId`/`excludeStoreId`/`excludeMarketId`/`includeChildcare`를 받고, `stores`/`markets`는 결과 배열을 `.filter`로 자기 제외한다(병원/약국은 쿼리에서 제외). park/parking/charger도 동일하게 **결과 배열 필터**로 추가한다.
- 사전 환경 테스트 실패(`property-matcher`, `childcare`, `urban-parking-adapter`, `urban-region-from-address` — `DATABASE_URL` 미설정)는 기존부터 있던 것으로 회귀가 아니다. Task의 vitest 검증은 `tests/lib/amenity-infra.test.ts` 통과 + 위 4종이 부모 커밋과 동일하게 실패하는지로 판단.

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `lib/amenity/nearby.ts` | 좌표 기반 인프라 집계 | `getNearbyInfra`에 exclude 3종 추가; `getMixedNearbyForDetail` 삭제 + `AmenitySlug` import 삭제 |
| `tests/lib/amenity-infra.test.ts` | 순수 로직 단위 테스트 | park/parking/charger 제외 입력 케이스 1개 추가 |
| `app/(public)/urban/[category]/[id]/page.tsx` | 주차장·공원 상세 | NearbyInfra로 교체, PARK_ANCHORS 보정 |
| `app/(public)/urban/[category]/_components/urban-detail-sidebar.tsx` | urban 사이드바 | DEFAULT_ANCHORS 보정(주차장 fallback) |
| `app/(public)/urban/charger/[id]/page.tsx` | 충전소 상세 | NearbyInfra로 교체, CHARGER_ANCHORS 보정 |
| `lib/urban/nearby.ts` | 같은 카테고리 근접(구) | **파일 삭제**(전 export 고아) |
| `app/(public)/amenity/[category]/_components/nearby-amenities-mixed.tsx` | 옛 혼합 탭 | **파일 삭제** |
| `app/(public)/urban/[category]/_components/urban-same-category-nearby.tsx` | 옛 같은카테고리(공원/주차장) | **파일 삭제** |
| `app/(public)/urban/charger/[id]/_components/charger-nearby.tsx` | 옛 같은카테고리(충전소) | **파일 삭제** |

---

## Task 1: `getNearbyInfra`에 park/parking/charger 자기 제외 옵션 추가

**Files:**
- Modify: `lib/amenity/nearby.ts` (opts 타입 + 필터 로직, 현재 367–404행)
- Test: `tests/lib/amenity-infra.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`tests/lib/amenity-infra.test.ts`의 `describe('buildInfraCategories', …)` 블록 안(마지막 `it` 뒤, 닫는 `});` 앞)에 추가. 이 테스트는 "park/parking/charger를 raw에서 제외한 입력이 결과 카테고리에서 빠지고, 제외 안 한 입력은 포함된다"를 검증해 `getNearbyInfra` 필터 책임을 순수 로직 레벨에서 고정한다.

```ts
  it('park/parking/charger는 raw에서 제외하면 결과 카테고리에서 빠진다(getNearbyInfra 필터 책임 고정)', () => {
    const base = {
      ...empty,
      parks: [{ id: 1n, name: '서울숲', address: '', parkType: '근린공원', area: 1000, distanceMeters: 50 }],
      parking: [{ id: 2n, name: '공영주차장', address: '', prkplceSe: '공영', prkcmprt: 100, distanceMeters: 60 }],
      chargers: [{ id: 3n, name: '급속충전소', address: '', chargeSpeed: '급속', chargerCount: 2, operatorName: null, distanceMeters: 70 }],
    };
    const withAll = buildInfraCategories(base);
    expect(withAll.find((c) => c.key === 'park')?.items.map((i) => i.id)).toEqual(['1']);
    expect(withAll.find((c) => c.key === 'parking')?.items.map((i) => i.id)).toEqual(['2']);
    expect(withAll.find((c) => c.key === 'charger')?.items.map((i) => i.id)).toEqual(['3']);

    // 자기 제외를 모사: 해당 id row를 뺀 입력이면 카테고리 자체가 사라진다.
    const excluded = buildInfraCategories({
      ...base,
      parks: base.parks.filter((p) => p.id !== 1n),
      parking: base.parking.filter((p) => p.id !== 2n),
      chargers: base.chargers.filter((c) => c.id !== 3n),
    });
    expect(excluded.find((c) => c.key === 'park')).toBeUndefined();
    expect(excluded.find((c) => c.key === 'parking')).toBeUndefined();
    expect(excluded.find((c) => c.key === 'charger')).toBeUndefined();
  });
```

> 참고(필수 필드 — 객체 리터럴이라 전부 채워야 tsc 통과): `NearbyPark` = `{ id, name, address, parkType, area, distanceMeters }`, `NearbyParking` = `{ id, name, address, prkplceSe, prkcmprt, distanceMeters }`, `NearbyEvCharger` = `{ id, name, address, chargeSpeed, chargerCount, operatorName, distanceMeters }`. 정의는 `lib/amenity/nearby.ts`.

- [ ] **Step 2: 테스트 실행 — 통과 확인(순수 로직은 이미 정상)**

Run: `pnpm vitest run tests/lib/amenity-infra.test.ts`
Expected: 신규 케이스 PASS (이 테스트는 순수 로직 보존 확인용이라 즉시 통과해야 정상). 만약 필드명 mismatch로 타입/런타임 에러가 나면 interface에 맞춰 수정.

- [ ] **Step 3: `getNearbyInfra` opts 타입에 3종 추가**

`lib/amenity/nearby.ts`의 `getNearbyInfra` opts 타입(현재 370–376행)을 아래로 교체:

```ts
  opts: {
    excludeHospitalId?: bigint;
    excludePharmacyId?: bigint;
    excludeStoreId?: bigint;
    excludeMarketId?: bigint;
    excludeParkId?: bigint;
    excludeParkingId?: bigint;
    excludeChargerId?: bigint;
    includeChildcare?: boolean;
  } = {},
```

- [ ] **Step 4: 필터 로직 추가**

같은 함수에서 `filteredMarkets` 정의 직후(현재 393행 뒤), `buildInfraCategories` 호출 전에 추가:

```ts
  const filteredParks =
    opts.excludeParkId != null ? parks.filter((p) => p.id !== opts.excludeParkId) : parks;
  const filteredParking =
    opts.excludeParkingId != null ? parking.filter((p) => p.id !== opts.excludeParkingId) : parking;
  const filteredChargers =
    opts.excludeChargerId != null ? chargers.filter((c) => c.id !== opts.excludeChargerId) : chargers;
```

그리고 `buildInfraCategories` 호출 인자(현재 394–403행)에서 `parks`/`chargers`/`parking`을 필터본으로 교체:

```ts
  return buildInfraCategories({
    stores: filteredStores,
    hospitals,
    pharmacies,
    parks: filteredParks,
    markets: filteredMarkets,
    chargers: filteredChargers,
    parking: filteredParking,
    childcare,
  });
```

- [ ] **Step 5: 타입·린트·테스트**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm vitest run tests/lib/amenity-infra.test.ts`
Expected: tsc/lint PASS, amenity-infra 테스트 전부 PASS.

- [ ] **Step 6: 커밋**

```bash
git add lib/amenity/nearby.ts tests/lib/amenity-infra.test.ts
git commit -m "feat(infra): getNearbyInfra에 park/parking/charger 자기 제외 옵션 추가"
```

---

## Task 2: 주차장·공원 상세 페이지 교체

**Files:**
- Modify: `app/(public)/urban/[category]/[id]/page.tsx`
- Modify: `app/(public)/urban/[category]/_components/urban-detail-sidebar.tsx`

이 태스크는 페이지가 NearbyInfra를 쓰도록 바꾸되, 아직 옛 컴포넌트 파일/함수는 삭제하지 않는다(Task 4에서 일괄 삭제). 빌드는 계속 green.

- [ ] **Step 1: import 교체**

`app/(public)/urban/[category]/[id]/page.tsx`:
- 8행 `import { getSameCategoryNearbyParking } from '@/lib/urban/nearby';` **삭제**.
- 27행 `import { getSameCategoryNearbyPark } from '@/lib/urban/nearby';` **삭제**.
- 17행 `import { UrbanSameCategoryNearby } from '../_components/urban-same-category-nearby';` **삭제**.
- 20행 `import { NearbyAmenitiesMixed } from '@/app/(public)/amenity/[category]/_components/nearby-amenities-mixed';` **삭제**.
- 10행을 `import { getNearbyApartments } from '@/lib/amenity/nearby';`로 변경(= `getMixedNearbyForDetail` 제거).
- import 블록 끝(예: 22행 `import { Card } …` 다음 줄)에 추가:

```ts
import { getNearbyInfra } from '@/lib/amenity/nearby';
import { NearbyInfra } from '@/components/ui/nearby-infra';
```

- [ ] **Step 2: 데이터 패치 교체**

현재 63–75행:

```ts
  const emptyMixed = { convenience: [], mart: [], cafe: [], market: [] };
  const emptyList = { rows: [], total: 0, page: 1, perPage: 0, totalPages: 0 };

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

→ 아래로 교체:

```ts
  const emptyList = { rows: [], total: 0, page: 1, perPage: 0, totalPages: 0 };

  const exclude =
    def.slug === 'park' ? { excludeParkId: itemId } : { excludeParkingId: itemId };

  const [apts, infra, otherList] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
    coord
      ? getNearbyInfra(coord.lat, coord.lng, { ...exclude, includeChildcare: true })
      : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
    sigunguCode ? getUrbanList(def.slug, { sigunguCode }, 1) : Promise.resolve(emptyList),
  ]);
```

- [ ] **Step 3: PARK_ANCHORS 보정**

현재 79–85행:

```ts
  const PARK_ANCHORS = [
    { href: '#info', label: '공원 정보' },
    { href: '#map',  label: '위치' },
    { href: '#apt',  label: '주변 아파트' },
    { href: '#poi',  label: '주변 상권' },
    { href: '#same', label: '가까운 공원' },
  ];
```

→ `#poi` 라벨 변경 + `#same` 줄 삭제:

```ts
  const PARK_ANCHORS = [
    { href: '#info', label: '공원 정보' },
    { href: '#map',  label: '위치' },
    { href: '#apt',  label: '주변 아파트' },
    { href: '#poi',  label: '주변 생활 인프라' },
  ];
```

- [ ] **Step 4: 본문 렌더 교체**

현재 123–124행:

```tsx
          {coord && <NearbyAmenitiesMixed {...mixed} />}
          {coord && <UrbanSameCategoryNearby items={sameCat} def={def} />}
```

→ 한 줄로 교체:

```tsx
          {coord && <NearbyInfra categories={infra} />}
```

- [ ] **Step 5: DEFAULT_ANCHORS 보정 (주차장 fallback)**

`app/(public)/urban/[category]/_components/urban-detail-sidebar.tsx`의 `DEFAULT_ANCHORS`(현재 5–14행 부근):
- `{ href: '#poi', label: '주변 상권' }` → `label: '주변 생활 인프라'`.
- `` { href: '#same', label: `가까운 주차장` } `` 줄 **삭제**.

- [ ] **Step 6: 타입·린트**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: PASS. (옛 컴포넌트 파일은 아직 존재하므로 빌드 green.)

- [ ] **Step 7: 커밋**

```bash
git add "app/(public)/urban/[category]/[id]/page.tsx" "app/(public)/urban/[category]/_components/urban-detail-sidebar.tsx"
git commit -m "feat(urban): 주차장·공원 상세 주변 인프라를 NearbyInfra로 교체"
```

---

## Task 3: 충전소 상세 페이지 교체

**Files:**
- Modify: `app/(public)/urban/charger/[id]/page.tsx`

- [ ] **Step 1: import 교체**

`app/(public)/urban/charger/[id]/page.tsx`:
- 6행 `import { getSameCategoryNearbyCharger } from '@/lib/urban/nearby';` **삭제**.
- 16행 `import { ChargerNearby } from './_components/charger-nearby';` **삭제**.
- 20행 `import { NearbyAmenitiesMixed } from '@/app/(public)/amenity/[category]/_components/nearby-amenities-mixed';` **삭제**.
- 9행을 `import { getNearbyApartments } from '@/lib/amenity/nearby';`로 변경(= `getMixedNearbyForDetail` 제거).
- import 블록 끝(22행 `import { Card } …` 다음)에 추가:

```ts
import { getNearbyInfra } from '@/lib/amenity/nearby';
import { NearbyInfra } from '@/components/ui/nearby-infra';
```

- [ ] **Step 2: CHARGER_ANCHORS 보정**

현재 27–34행:

```ts
const CHARGER_ANCHORS = [
  { href: '#status', label: '충전기 현황' },
  { href: '#info',   label: '기본 정보' },
  { href: '#map',    label: '위치' },
  { href: '#apt',    label: '주변 아파트' },
  { href: '#poi',    label: '주변 상권' },
  { href: '#same',   label: '가까운 충전소' },
];
```

→ `#poi` 라벨 변경 + `#same` 줄 삭제:

```ts
const CHARGER_ANCHORS = [
  { href: '#status', label: '충전기 현황' },
  { href: '#info',   label: '기본 정보' },
  { href: '#map',    label: '위치' },
  { href: '#apt',    label: '주변 아파트' },
  { href: '#poi',    label: '주변 생활 인프라' },
];
```

- [ ] **Step 3: 데이터 패치 교체**

현재 66–74행:

```ts
  const emptyMixed = { convenience: [], mart: [], cafe: [], market: [] };
  const emptyList = { rows: [], total: 0, page: 1, perPage: 0, totalPages: 0 };

  const [apts, mixed, sameCat, otherList] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
    coord ? getMixedNearbyForDetail('charger', coord.lat, coord.lng).catch(() => emptyMixed) : Promise.resolve(emptyMixed),
    coord ? getSameCategoryNearbyCharger(coord.lat, coord.lng, itemId) : Promise.resolve([]),
    sigunguCode ? getUrbanList('charger', { sigunguCode }, 1) : Promise.resolve(emptyList),
  ]);
```

→ 아래로 교체:

```ts
  const emptyList = { rows: [], total: 0, page: 1, perPage: 0, totalPages: 0 };

  const [apts, infra, otherList] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
    coord
      ? getNearbyInfra(coord.lat, coord.lng, { excludeChargerId: itemId, includeChildcare: true })
      : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
    sigunguCode ? getUrbanList('charger', { sigunguCode }, 1) : Promise.resolve(emptyList),
  ]);
```

> `statuses`/`lastUpdated`/`others` 등 나머지 로직은 그대로 둔다.

- [ ] **Step 4: 본문 렌더 교체**

현재 111–112행:

```tsx
          {coord && <NearbyAmenitiesMixed {...mixed} />}
          {coord && <ChargerNearby items={sameCat} />}
```

→ 한 줄로 교체:

```tsx
          {coord && <NearbyInfra categories={infra} />}
```

- [ ] **Step 5: 타입·린트**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add "app/(public)/urban/charger/[id]/page.tsx"
git commit -m "feat(urban): 충전소 상세 주변 인프라를 NearbyInfra로 교체"
```

---

## Task 4: 고아 코드 삭제

**Files:**
- Modify: `lib/amenity/nearby.ts` (`getMixedNearbyForDetail` 함수 + `AmenitySlug` import 삭제)
- Delete: `lib/urban/nearby.ts`
- Delete: `app/(public)/amenity/[category]/_components/nearby-amenities-mixed.tsx`
- Delete: `app/(public)/urban/[category]/_components/urban-same-category-nearby.tsx`
- Delete: `app/(public)/urban/charger/[id]/_components/charger-nearby.tsx`

- [ ] **Step 1: 삭제 전 참조 0건 재확인**

Run:
```bash
grep -rn "getMixedNearbyForDetail\|NearbyAmenitiesMixed\|getSameCategoryNearby\|UrbanSameCategoryNearby\|ChargerNearby\|@/lib/urban/nearby" app lib components --include="*.ts" --include="*.tsx"
```
Expected: 정의부(`lib/amenity/nearby.ts`의 `getMixedNearbyForDetail`, 삭제 대상 4개 파일 내부)만 나오고 **소비처는 0건**. 소비처가 남아 있으면 멈추고 원인 파악(Task 2/3 누락).

- [ ] **Step 2: `getMixedNearbyForDetail` + `AmenitySlug` import 삭제**

`lib/amenity/nearby.ts`:
- `getMixedNearbyForDetail` 함수 전체(현재 196–226행, JSDoc 주석 196–199행 포함) 삭제.
- 3행 `import type { AmenitySlug } from '@/lib/amenity/category';` 삭제(이 함수가 유일 사용처였음).

> `getNearbyStores`/`getNearbyTraditionalMarkets`는 `getNearbyInfra`가 계속 쓰므로 **삭제 금지**.

- [ ] **Step 3: 고아 파일 삭제**

```bash
git rm "lib/urban/nearby.ts" \
  "app/(public)/amenity/[category]/_components/nearby-amenities-mixed.tsx" \
  "app/(public)/urban/[category]/_components/urban-same-category-nearby.tsx" \
  "app/(public)/urban/charger/[id]/_components/charger-nearby.tsx"
```

- [ ] **Step 4: 전체 빌드·타입·린트·테스트**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm vitest run`
Expected:
- tsc/lint PASS (삭제 후 잔여 참조 없음).
- vitest: `tests/lib/amenity-infra.test.ts` 등 통과, 사전 환경 실패 4종(`property-matcher`/`childcare`/`urban-parking-adapter`/`urban-region-from-address`)만 부모 커밋과 동일하게 실패. 그 외 신규 실패 0.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "refactor(infra): NearbyInfra 마이그레이션으로 고아가 된 옛 혼합/같은카테고리 자산 삭제"
```

---

## Task 5: 실데이터 QA (Playwright)

**전제:** dev 서버 기동(기존 서버가 3000을 점유하면 3001 등 다른 포트 사용). 좌표가 있는 주차장·공원·충전소 상세 URL을 각 목록 페이지에서 하나씩 확보.

- [ ] **Step 1: dev 서버 기동**

Run(백그라운드): `pnpm dev`
서버 포트 확인.

- [ ] **Step 2: 데스크탑 검증 (3개 상세)**

각 상세(주차장/공원/충전소)에서:
- 옛 "주변 상권" 탭 / "가까운 {카테고리}" 섹션이 **사라지고** `주변 생활 인프라` 리스트만 노출.
- 요약 배지줄, 카테고리당 더보기(>5), 0곳 카테고리 숨김, 블록 높이 정렬(`[grid-auto-rows:1fr]`), fetch 한도 도달 시 `N+` 배지.
- **자기 제외**: 현재 보고 있는 항목이 자기 카테고리(공원→공원, 주차장→주차장, 충전소→전기차 충전소) 목록에 없음.
- 콘솔에 Decimal 직렬화 경고 등 신규 에러 없음.
- 스크린샷 저장.

- [ ] **Step 3: 모바일(375px) 검증**

`browser_resize` 375px 후 3개 상세:
- 1열 그리드, 요약줄 가로 스크롤, 가로 오버플로우 없음(`document.documentElement.scrollWidth === window.innerWidth === 375`).
- 스크린샷 저장.

- [ ] **Step 4: 회귀 스팟 체크**

- 학교/병원/약국/amenity 상세 1건씩 열어 `주변 생활 인프라`가 정상 노출(공용 함수 변경 회귀 없음).
- 충전소 상세의 `충전기 현황`(실시간) 섹션이 그대로 동작.

- [ ] **Step 5: dev 서버 종료**

---

## Self-Review (작성자 점검 결과)

- **스펙 커버리지:** §3.1 데이터→Task1, §3.2 주차장·공원→Task2, §3.3 충전소→Task3, §3.4 고아삭제→Task4, §3.5 앵커→Task2(PARK·DEFAULT)+Task3(CHARGER), §6 검증→각 Task + Task5. 누락 없음.
- **플레이스홀더:** 없음(모든 코드 블록 실제 내용).
- **타입 일관성:** opts 필드명(`excludeParkId`/`excludeParkingId`/`excludeChargerId`)이 Task1 정의와 Task2/3 호출에서 일치. `getNearbyInfra` 반환 타입은 `Awaited<ReturnType<typeof getNearbyInfra>>`로 페이지에서 참조.
- **삭제 안전성:** `lib/urban/nearby.ts`는 전 export가 Task2/3에서 참조 제거 + 삭제 대상 컴포넌트만 쓰던 것으로 확인되어 파일 전체 삭제 가능. `getNearbyStores`/`getNearbyTraditionalMarkets`는 `getNearbyInfra`가 계속 사용하므로 보존.
