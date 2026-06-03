# 도시인프라(주차장·공원·충전소) 상세 — "주변 생활 인프라" 적용

- 작성일: 2026-06-03
- 대상:
  - `app/(public)/urban/[category]/[id]/page.tsx` (주차장 `parking`·공원 `park`)
  - `app/(public)/urban/charger/[id]/page.tsx` (충전소 `charger`)
- 레퍼런스: 학교(PR #20)·병원·약국(PR #23)·상권/편의(PR #24)에 적용한 공용 `NearbyInfra` 패턴
- 설계 근거: `docs/superpowers/specs/2026-06-03-amenity-nearby-infra-design.md`,
  `docs/nearby-infra-rollout-prompts.md` (③ 표의 충전소·주차장 행)

## 1. 배경 / 문제

현재 도시인프라 상세(주차장·공원·충전소)의 주변 정보는 두 섹션으로 나뉘어 있다:

1. **주변 상권(#poi)** — `NearbyAmenitiesMixed` 옛 4탭(편의점/마트/카페/전통시장). 탭 전환 필요, 한 번에 보이는 양이 적고, DB가 보유한 병원·약국·공원·충전소·주차장·어린이집·기타가 화면에 안 나온다.
2. **가까운 {카테고리}(#same)** — `UrbanSameCategoryNearby`(공원/주차장) · `ChargerNearby`(충전소). 같은 카테고리 가까운 N건.

학교·병원·약국·상권/편의는 이미 공용 `NearbyInfra`(요약 배지줄 + 균일 2열 그리드, 전체 카테고리 노출)로 통일됐다. 도시인프라만 옛 패턴으로 남아 일관성이 깨지고, 노출 정보량도 적다.

또한 amenity 마이그레이션(PR #24) 당시 이 두 urban 페이지가 아직 쓰고 있어 **보류했던** 옛 공용 자산(`getMixedNearbyForDetail`, `NearbyAmenitiesMixed`)이, 이번 작업 후 완전 미사용이 된다.

## 2. 목표

- 옛 "주변 상권" 탭과 "가까운 {카테고리}" 섹션을 **제거**하고, 다른 상세와 동일한 공용 `NearbyInfra` **리스트 하나**로 통일한다.
- DB가 보유한 인프라 카테고리를 **최대한 노출**(편의·마트 · 카페 · 병원 · 약국 · 공원 · 전통시장 · 전기차 충전소 · 주차장 · 어린이집 · 기타).
- 자기 자신(현재 상세 항목)을 자기 카테고리에서 제외한다(공원→park, 주차장→parking, 충전소→charger).
- 모바일에서 깨지지 않고 화면 오버플로우가 없게 한다(공용 컴포넌트가 이미 보장).
- 이번 마이그레이션으로 완전 고아가 되는 옛 자산을 같은 PR에서 제거한다.

## 3. 설계

### 3.1 데이터 계층 — `lib/amenity/nearby.ts`

`getNearbyInfra(lat, lng, opts)`에 자기 제외 옵션 3개를 추가한다(기본 미제외, 기존 옵션과 동형):

```ts
opts: {
  excludeHospitalId?: bigint;
  excludePharmacyId?: bigint;
  excludeStoreId?: bigint;
  excludeMarketId?: bigint;
  excludeParkId?: bigint;       // 신규 — 공원 상세
  excludeParkingId?: bigint;    // 신규 — 주차장 상세
  excludeChargerId?: bigint;    // 신규 — 충전소 상세
  includeChildcare?: boolean;
}
```

**제외 방식: 내부 배열 필터**(쿼리 시그니처는 건드리지 않음 — 가장 surgical, `excludeStoreId`/`excludeMarketId`와 동일).
`getNearbyInfra` 내부에서 `getNearbyParks`/`getNearbyParking`/`getNearbyEvChargers` 결과를 받은 뒤, 해당 exclude id가 주어지면 그 id를 가진 row를 필터링한 배열을 `buildInfraCategories`에 넘긴다.

```ts
const filteredParks =
  opts.excludeParkId != null ? parks.filter((p) => p.id !== opts.excludeParkId) : parks;
const filteredParking =
  opts.excludeParkingId != null ? parking.filter((p) => p.id !== opts.excludeParkingId) : parking;
const filteredChargers =
  opts.excludeChargerId != null ? chargers.filter((c) => c.id !== opts.excludeChargerId) : chargers;
```

> 주의: `getNearbyParks`/`getNearbyParking`/`getNearbyEvChargers`의 fetch `LIMIT`은 `INFRA_FETCH_LIMIT`(12). 자기 자신이 12위 안에 포함돼 1건 빠지면 11건이 될 수 있으나, 화면 cap(5)·요약 배지에 영향이 미미하므로 LIMIT+1 보정은 생략한다(자기 자신은 거의 항상 0m로 1위라 빠져도 무방 — amenity와 동일 결정).

`buildInfraCategories`(순수 로직, `lib/amenity/infra.ts`)는 **수정 불필요**.

추가로, 이 파일의 `getMixedNearbyForDetail` 함수를 **삭제**(§3.4).

### 3.2 페이지 — `app/(public)/urban/[category]/[id]/page.tsx` (주차장·공원)

- import 교체: `getMixedNearbyForDetail` 제거(다른 import에서 `getNearbyApartments`는 유지), `getSameCategoryNearbyParking`/`getSameCategoryNearbyPark` 제거 → `getNearbyInfra` 추가. `NearbyAmenitiesMixed`, `UrbanSameCategoryNearby` import 제거 → `NearbyInfra`(`@/components/ui/nearby-infra`) 추가.
- `Promise.all`:
  - `getMixedNearbyForDetail('parking', …)` / `getSameCategoryNearbyPark|Parking(…)` 항목 제거.
  - `coord ? getNearbyInfra(coord.lat, coord.lng, { ...exclude, includeChildcare: true }) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>)` 추가.
  - 자기 제외 분기: `def.slug === 'park'` → `{ excludeParkId: itemId }`, 그 외(`parking`) → `{ excludeParkingId: itemId }`.
- 본문 렌더: `{coord && <NearbyAmenitiesMixed {...mixed} />}` + `{coord && <UrbanSameCategoryNearby items={sameCat} def={def} />}` 두 줄 제거 → `{coord && <NearbyInfra categories={infra} />}` 한 줄.
- 내 변경으로 안 쓰이게 된 지역 변수/상수 정리: `mixed`, `sameCat`, `emptyMixed`.

### 3.3 페이지 — `app/(public)/urban/charger/[id]/page.tsx` (충전소)

- import 교체: `getMixedNearbyForDetail` 제거, `getSameCategoryNearbyCharger` 제거 → `getNearbyInfra` 추가. `NearbyAmenitiesMixed`, `ChargerNearby` import 제거 → `NearbyInfra` 추가.
- `Promise.all`: `getMixedNearbyForDetail('charger', …)` / `getSameCategoryNearbyCharger(…)` 제거 → `getNearbyInfra(coord.lat, coord.lng, { excludeChargerId: itemId, includeChildcare: true })`(좌표 없으면 빈 배열) 추가.
- 본문 렌더: `{coord && <NearbyAmenitiesMixed {...mixed} />}` + `{coord && <ChargerNearby items={sameCat} />}` 두 줄 제거 → `{coord && <NearbyInfra categories={infra} />}` 한 줄.
- 안 쓰이게 된 `mixed`, `sameCat`, `emptyMixed` 정리. (`statuses`/`lastUpdated` 등 충전소 현황 로직은 그대로 유지.)

### 3.4 정리 (orphan) — 전부 삭제

이번 변경으로 완전 미사용이 되는 자산을 같은 PR에서 제거한다. **삭제 직전 각 항목을 `grep`으로 참조 0건 재확인.**

- `lib/amenity/nearby.ts`의 `getMixedNearbyForDetail` 함수(+ 이 함수 전용 helper가 같은 파일 안에만 있고 다른 곳에서 안 쓰이면 함께 정리).
- `app/(public)/amenity/[category]/_components/nearby-amenities-mixed.tsx` (`NearbyAmenitiesMixed`) — `git rm`.
- `lib/urban/nearby.ts`의 `getSameCategoryNearbyParking`/`getSameCategoryNearbyPark`/`getSameCategoryNearbyCharger` 함수. (같은 파일의 다른 export가 여전히 쓰이면 그것은 보존.)
- `app/(public)/urban/[category]/_components/urban-same-category-nearby.tsx` (`UrbanSameCategoryNearby`) — `git rm`.
- `app/(public)/urban/charger/[id]/_components/charger-nearby.tsx` (`ChargerNearby`) — `git rm`.

### 3.5 사이드바 TOC 앵커

- `urban/[category]/[id]/page.tsx`의 `PARK_ANCHORS`:
  - `{ href: '#poi', label: '주변 상권' }` → `label: '주변 생활 인프라'`.
  - `{ href: '#same', label: '가까운 공원' }` 항목 **제거**.
- `urban/charger/[id]/page.tsx`의 `CHARGER_ANCHORS`:
  - `{ href: '#poi', label: '주변 상권' }` → `label: '주변 생활 인프라'`.
  - `{ href: '#same', label: '가까운 충전소' }` 항목 **제거**.
- `urban/[category]/_components/urban-detail-sidebar.tsx`의 `DEFAULT_ANCHORS`(주차장 상세가 `anchors` 미전달로 사용):
  - `{ href: '#poi', label: '주변 상권' }` → `label: '주변 생활 인프라'`.
  - `{ href: '#same', label: '가까운 주차장' }` 항목 **제거**.

> `DEFAULT_ANCHORS`는 charger(CHARGER_ANCHORS)·park(PARK_ANCHORS)가 명시 anchors를 넘기므로 사실상 주차장 전용 fallback이라 수정해도 다른 상세에 영향 없음.

### 3.6 모바일 / 오버플로우

공용 `NearbyInfra`(`components/ui/nearby-infra.tsx`)가 이미 보장하므로 **추가 작업 없음**:
- 그리드 `grid-cols-1 md:grid-cols-2` (모바일 1열).
- 요약 배지줄 `overflow-x-auto` + 칩 `shrink-0 whitespace-nowrap` (가로 스크롤).
- `[grid-auto-rows:1fr]` + 더보기/안내문구 `mt-auto` (블록 높이 정렬).
- 항목 이름 `truncate`, 거리 배지 `shrink-0` (가로 오버플로우 차단).

## 4. 컴포넌트 / 데이터 흐름 요약

```
page.tsx (server)
  └ getNearbyInfra(lat, lng, { excludeParkId|excludeParkingId|excludeChargerId, includeChildcare:true })
      └ getNearbyStores / Hospitals / Pharmacies / Parks / Markets / EvChargers / Parking / Childcare
      └ (park/parking/charger 자기 제외 필터)
      └ buildInfraCategories(...) → InfraCategory[]  // 빈 카테고리 제외
  └ <NearbyInfra categories={infra} />  // client, 더보기 toggle
```

## 5. 테스트

`buildInfraCategories`(순수 로직)에는 변경이 없고, 신규 제외는 `getNearbyInfra` 내부 `.filter`(통합 성격)라 순수 단위 테스트가 어렵다. amenity 때와 동일하게 가볍게:
- `tests/lib/amenity-infra.test.ts`에 park/parking/charger를 raw에서 뺀 입력과 안 뺀 입력의 결과 차이(분류·정규화 보존)를 확인하는 케이스를 추가. (필터 자체가 1줄이라 회귀 위험이 낮으므로 분류 로직 보존 확인 수준으로 가볍게.)

## 6. 검증 (필수)

1. `tsc --noEmit` 통과.
2. `pnpm lint` 통과.
3. `pnpm vitest run` 전체 통과(사전 환경 실패 4종은 부모 커밋과 동일한지 비교해 회귀 아님 확인).
4. dev 서버 + Playwright로 주차장·공원·충전소 상세 각각 데스크탑·모바일 스크린샷:
   - 옛 "주변 상권" 탭 / "가까운 {카테고리}" 섹션이 사라지고 `주변 생활 인프라` 리스트만 노출.
   - 요약 배지줄, 더보기, 0곳 카테고리 숨김, 블록 높이 정렬, 자기 제외(현재 항목이 자기 카테고리 목록에 없음), N+ 배지 확인.
   - 375px 모바일에서 1열 + 요약줄 가로 스크롤, 오버플로우 없음.
5. 회귀: 학교/병원/약국/amenity 상세 영향 없음(공용 `NearbyInfra`/`getNearbyInfra`만 확장). 삭제한 고아 참조가 어디에도 안 남아 빌드/타입 통과.

## 7. 성공 기준

1. 주차장·공원·충전소 3개 상세에서 탭/`#same`이 사라지고, 데이터가 있는 인프라 카테고리가 요약줄 + 균일 그리드로 노출된다.
2. 현재 보고 있는 항목 자신이 자기 카테고리에서 제외된다(공원→park, 주차장→parking, 충전소→charger).
3. 어린이집이 인프라에 포함된다(0곳이면 자동 숨김).
4. 375px 모바일에서 깨짐/오버플로우 없이 표시된다.
5. 고아 5종(함수 3·컴포넌트 파일 2) 완전 삭제, 빌드·타입 통과.
6. `tsc --noEmit` / `pnpm lint` / `pnpm vitest run` 통과.

## 8. 범위 밖 (Out of scope)

- 아파트·오피스텔/빌라 상세 적용(별도 작업).
- 주변 아파트 섹션 변경, 지도 위 POI 표시.
- 충전소 실시간 현황(`fetchChargerStatus`)·`revalidate` 값 변경.
