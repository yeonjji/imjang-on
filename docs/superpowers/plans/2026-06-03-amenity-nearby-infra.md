# 상권·편의 상세 — 주변 생활 인프라 적용 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상권·편의 상세(`amenity/[category]/[id]`)의 옛 "주변 상권 종합" 탭과 "가까운 카테고리" 섹션을 학교/병원/약국과 동일한 공용 `NearbyInfra` 리스트 하나로 교체하고, 현재 항목 자기 제외 + 어린이집 포함을 적용한다.

**Architecture:** `getNearbyInfra(lat, lng, opts)`에 `excludeStoreId`/`excludeMarketId` 옵션을 추가(내부 배열 필터)하고, 페이지는 슬러그에 따라 자기 id를 넘긴다. 페이지 본문은 `<NearbyAmenitiesMixed>` + `<SameCategoryNearby>` 두 섹션을 `<NearbyInfra categories={infra} />` 하나로 대체한다. amenity 전용으로 고아가 되는 컴포넌트/함수는 삭제하되, urban이 공유하는 자산은 유지한다.

**Tech Stack:** Next.js (App Router, RSC), Prisma + PostGIS raw query, TypeScript, Tailwind, Vitest.

**스펙:** `docs/superpowers/specs/2026-06-03-amenity-nearby-infra-design.md`

**브랜치:** `feat/amenity-nearby-infra` (이미 생성됨, 스펙 커밋 완료).

---

## File Structure

| 파일 | 변경 | 책임 |
|---|---|---|
| `lib/amenity/nearby.ts` | Modify | `getNearbyInfra`에 store/market 자기 제외 옵션 추가 |
| `app/(public)/amenity/[category]/[id]/page.tsx` | Modify | 옛 두 섹션 제거 → `NearbyInfra` 단일 렌더, 자기 제외 분기 |
| `app/(public)/amenity/[category]/_components/same-category-nearby.tsx` | Delete | amenity 전용 고아 컴포넌트 |
| `app/(public)/amenity/[category]/_components/amenity-detail-sidebar.tsx` | Modify | TOC 앵커 `#poi` 라벨 변경, `#same` 제거 |

**삭제 금지(urban 공유):** `_components/nearby-amenities-mixed.tsx`(`NearbyAmenitiesMixed`), `lib/amenity/nearby.ts`의 `getMixedNearbyForDetail`.

**테스트 메모:** `lib/amenity/nearby.ts`의 함수들은 PostGIS raw query라 DB 의존적이며 현재 코드베이스에서 단위 테스트가 없다(기존 `getNearbyHospitals` 등의 excludeId 필터도 미테스트). 따라서 자기 제외 필터는 단위 테스트를 추가하지 않고 `tsc` + Task 3의 실데이터 Playwright로 검증한다. 순수 로직(`buildInfraCategories`)은 변경이 없으므로 기존 `tests/lib/amenity-infra.test.ts` 전체가 그대로 통과하면 된다(회귀 가드).

---

## Task 1: `getNearbyInfra`에 자기 제외 옵션 추가

**Files:**
- Modify: `lib/amenity/nearby.ts` (현재 396–418행, `getNearbyInfra`)

- [ ] **Step 1: opts 타입과 내부 필터 추가**

`lib/amenity/nearby.ts`의 `getNearbyInfra` 전체를 아래로 교체한다(주석 줄 포함):

```ts
// 상세 "주변 생활 인프라" — 카테고리를 정규화해 반환. 빈 카테고리는 제외됨. (좌표만 받는 범용)
export async function getNearbyInfra(
  lat: number,
  lng: number,
  opts: {
    excludeHospitalId?: bigint;
    excludePharmacyId?: bigint;
    excludeStoreId?: bigint;
    excludeMarketId?: bigint;
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
  const filteredStores =
    opts.excludeStoreId != null ? stores.filter((s) => s.id !== opts.excludeStoreId) : stores;
  const filteredMarkets =
    opts.excludeMarketId != null ? markets.filter((m) => m.id !== opts.excludeMarketId) : markets;
  return buildInfraCategories({
    stores: filteredStores,
    hospitals,
    pharmacies,
    parks,
    markets: filteredMarkets,
    chargers,
    parking,
    childcare,
  });
}
```

- [ ] **Step 2: 타입 체크**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음(통과). 호출부는 Task 2에서 갱신하므로 기존 호출부(`excludeStoreId` 미사용)는 옵셔널이라 영향 없음.

- [ ] **Step 3: 회귀 테스트(순수 로직 변경 없음 확인)**

Run: `pnpm vitest run tests/lib/amenity-infra.test.ts`
Expected: 전체 PASS (변경 없음).

- [ ] **Step 4: 커밋**

```bash
git add lib/amenity/nearby.ts
git commit -m "feat(amenity): getNearbyInfra에 store/market 자기 제외 옵션 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 페이지 교체 + 사이드바 TOC + 고아 정리

**Files:**
- Modify: `app/(public)/amenity/[category]/[id]/page.tsx`
- Modify: `app/(public)/amenity/[category]/_components/amenity-detail-sidebar.tsx`
- Delete: `app/(public)/amenity/[category]/_components/same-category-nearby.tsx`
- Modify: `lib/amenity/nearby.ts` (`getSameCategoryNearby` 삭제)

- [ ] **Step 1: page.tsx import 교체**

`app/(public)/amenity/[category]/[id]/page.tsx` 상단 import 블록에서:

제거할 import 항목:
```ts
import {
  getNearbyApartments,
  getMixedNearbyForDetail,   // ← 제거
  getSameCategoryNearby,     // ← 제거
} from '@/lib/amenity/nearby';
import { NearbyAmenitiesMixed } from '../_components/nearby-amenities-mixed';  // ← 제거
import { SameCategoryNearby } from '../_components/same-category-nearby';      // ← 제거
import type { AmenitySlug } from '@/lib/amenity/category';                     // ← 제거(아래 캐스트 삭제로 미사용)
```

교체 후 해당 영역:
```ts
import { getNearbyApartments, getNearbyInfra } from '@/lib/amenity/nearby';
import { NearbyApartments } from '@/components/ui/nearby-apartments';
import { NearbyInfra } from '@/components/ui/nearby-infra';
```
(`getNearbyApartments`는 유지. `NearbyApartments`/`AmenityHero`/`AmenityInfo`/`AmenityDetailSidebar`/`NaverMap`/`Card`/`getNearbyApartments` 등 기존 import는 그대로 둔다. `getCategoryDef`, `getAmenityById`, `getAmenityLatLng`, `getAmenityList`, `getSigunguByCode`, `NearbyApartment` 타입 import도 유지.)

- [ ] **Step 2: 데이터 페치(Promise.all) 교체**

현재 블록(56–65행 부근):
```ts
  type MixedT = Awaited<ReturnType<typeof getMixedNearbyForDetail>>;
  type SameT = Awaited<ReturnType<typeof getSameCategoryNearby>>;
  const [apts, mixed, sameCat, otherList] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
    coord ? getMixedNearbyForDetail(def.slug as AmenitySlug, coord.lat, coord.lng) : Promise.resolve({ convenience: [], mart: [], cafe: [], market: [] } as MixedT),
    coord ? getSameCategoryNearby(def.slug as AmenitySlug, coord.lat, coord.lng, itemId) : Promise.resolve([] as SameT),
    item.sigunguCode
      ? getAmenityList(def.slug, { sigunguCode: item.sigunguCode }, 1)
      : Promise.resolve({ rows: [], total: 0, page: 1, perPage: 0, totalPages: 0 }),
  ]);
```

교체 후:
```ts
  const exclude =
    def.slug === 'market' ? { excludeMarketId: itemId } : { excludeStoreId: itemId };
  const [apts, infra, otherList] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
    coord
      ? getNearbyInfra(coord.lat, coord.lng, { ...exclude, includeChildcare: true })
      : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
    item.sigunguCode
      ? getAmenityList(def.slug, { sigunguCode: item.sigunguCode }, 1)
      : Promise.resolve({ rows: [], total: 0, page: 1, perPage: 0, totalPages: 0 }),
  ]);
```

- [ ] **Step 3: 본문 렌더 교체**

현재(104–105행):
```tsx
          <NearbyApartments items={apts} />
          {coord && <NearbyAmenitiesMixed {...mixed} />}
          {coord && <SameCategoryNearby items={sameCat} def={def} />}
```

교체 후:
```tsx
          <NearbyApartments items={apts} />
          {coord && <NearbyInfra categories={infra} />}
```

- [ ] **Step 4: 사이드바 TOC 앵커 수정**

`app/(public)/amenity/[category]/_components/amenity-detail-sidebar.tsx`의 `ANCHORS`(5–11행)를 교체:

```ts
const ANCHORS = [
  { href: '#info', label: '기본 정보' },
  { href: '#map', label: '위치' },
  { href: '#apt', label: '주변 아파트' },
  { href: '#poi', label: '주변 생활 인프라' },
];
```
(`#poi` 라벨 변경 + `#same` 줄 제거. `#info` 앵커는 기존대로 둔다 — AmenityInfo가 해당 id를 갖는지는 변경 대상 아님.)

- [ ] **Step 5: 고아 컴포넌트 삭제**

```bash
git rm "app/(public)/amenity/[category]/_components/same-category-nearby.tsx"
```

- [ ] **Step 6: 고아 함수 삭제 (`getSameCategoryNearby`)**

`lib/amenity/nearby.ts`에서 `getSameCategoryNearby` 함수 전체(현재 266–293행, 바로 위 JSDoc 주석 `/** "같은 카테고리 가까운 N건" ... */` 포함)를 삭제한다. `getNearbyStores`/`getNearbyTraditionalMarkets`는 다른 곳에서 쓰이므로 그대로 둔다.

> 확인: `getMixedNearbyForDetail`(200행 부근)과 `_components/nearby-amenities-mixed.tsx`는 **삭제하지 않는다**(urban 페이지가 import 중).

- [ ] **Step 7: 타입 체크 + 린트**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: 둘 다 통과. (미사용 import/변수 남아 있으면 여기서 잡힌다 — 있으면 제거.)

- [ ] **Step 8: 회귀 — 남은 참조 없음 확인**

Run: `grep -rn "SameCategoryNearby\|getSameCategoryNearby\b" "app/(public)/amenity" "lib/amenity"`
Expected: 출력 없음(amenity 범위에서 완전히 사라짐). urban의 `getSameCategoryNearbyParking` 등은 `lib/urban/nearby.ts` 소속이라 무관.

Run: `pnpm vitest run`
Expected: 전체 PASS.

- [ ] **Step 9: 커밋**

```bash
git add -A
git commit -m "feat(amenity): 상권·편의 상세 주변 인프라를 NearbyInfra로 교체

- 옛 주변 상권 종합 탭(NearbyAmenitiesMixed)·가까운 카테고리 섹션 제거
- 공용 NearbyInfra 단일 리스트로 통일(자기 제외·어린이집 포함)
- amenity 전용 SameCategoryNearby/getSameCategoryNearby 삭제
- 사이드바 TOC #poi 라벨 변경, #same 제거

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 실데이터 시각 검증 (Playwright 데스크탑·모바일)

**Files:** 없음(검증 전용).

- [ ] **Step 1: dev 서버 기동**

Run: `pnpm dev` (백그라운드). 기동 로그에서 포트 확인(기본 `http://localhost:3000`).

- [ ] **Step 2: 4개 카테고리 상세에서 좌표가 있는 실제 row 1건씩 확보**

각 슬러그(`convenience`, `mart`, `cafe`, `market`)의 목록 페이지(`/amenity/<slug>?region=...`)에서 항목 하나의 상세로 진입할 URL을 얻는다. (예: `/amenity/convenience/<id>`.)

- [ ] **Step 3: 데스크탑(1280) + 모바일(375) 스크린샷**

Playwright로 각 상세 페이지를 1280px·375px로 캡처. 확인 항목:
- 옛 "주변 상권 종합" 탭과 "가까운 {카테고리}" 섹션이 **없음**.
- "주변 생활 인프라" 카드 하나만 노출, 요약 배지줄 + 2열(데스크탑)/1열(375) 그리드.
- 더보기 토글 동작, 0곳 카테고리 미노출, 같은 행 블록 높이 정렬.
- **자기 제외**: 현재 보고 있는 항목 이름이 인프라 목록(편의·마트 또는 카페 또는 전통시장)에 없음.
- 375px에서 가로 오버플로우 없음(요약줄만 가로 스크롤).
- 사이드바 "바로가기"에 `주변 생활 인프라`가 있고 `같은 카테고리`가 없음.

- [ ] **Step 4: 회귀 — 공유 자산 사용 페이지 확인**

urban 충전소(`/urban/charger/<id>`)·주차장(`/urban/<category>/<id>`) 상세를 열어 `NearbyAmenitiesMixed`(주변 상권 종합 탭)가 여전히 정상 렌더되는지 확인. 학교/병원/약국 상세는 변경이 없으나 한 곳씩 열어 인프라 섹션 정상 확인.

- [ ] **Step 5: dev 서버 종료**

---

## Task 4: 마무리 (PR)

**Files:** 없음.

- [ ] **Step 1: 최종 검증 한 번 더**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm vitest run`
Expected: 모두 통과.

- [ ] **Step 2: 푸시 + PR**

`superpowers:finishing-a-development-branch` 가이드에 따라 브랜치를 푸시하고 PR을 생성한다(`main` 대상). PR 본문에 변경 요약·검증 결과·스크린샷을 포함하고, "urban 공유 자산(NearbyAmenitiesMixed/getMixedNearbyForDetail) 미삭제"를 명시한다.

---

## Self-Review

**Spec coverage:**
- §3.1 데이터 계층(excludeStoreId/excludeMarketId, 내부 필터) → Task 1. ✅
- §3.2 페이지(import/Promise.all/렌더 교체, 슬러그별 자기 제외, includeChildcare) → Task 2 Step 1–3. ✅
- §3.3 정리(SameCategoryNearby·getSameCategoryNearby 삭제, mixed/urban 자산 유지) → Task 2 Step 5–6, Step 8 grep. ✅
- §3.4 사이드바 TOC(#poi 라벨, #same 제거) → Task 2 Step 4. ✅
- §3.5 모바일/오버플로우(공용 컴포넌트 보장) → Task 3 Step 3 시각 확인. ✅
- §6 검증(tsc/lint/vitest/Playwright/urban 회귀) → Task 1 Step 2–3, Task 2 Step 7–8, Task 3, Task 4. ✅

**Placeholder scan:** 모든 코드 스텝에 실제 코드/명령 포함. "적절한 처리" 류 없음. ✅

**Type consistency:** `getNearbyInfra` opts 이름(`excludeStoreId`/`excludeMarketId`/`includeChildcare`)이 Task 1 정의와 Task 2 호출에서 일치. `exclude` 분기는 `{ excludeMarketId }` | `{ excludeStoreId }`로 `getNearbyInfra` opts 부분집합. `def.slug`는 `AmenitySlug`라 `=== 'market'` 비교 안전. ✅
