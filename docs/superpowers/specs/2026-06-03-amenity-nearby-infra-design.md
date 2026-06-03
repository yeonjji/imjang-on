# 상권·편의 상세 — "주변 생활 인프라" 적용

- 작성일: 2026-06-03
- 대상: `app/(public)/amenity/[category]/[id]` 상세 페이지 (편의점·마트·카페·전통시장)
- 레퍼런스: 학교(PR #20)·병원·약국(PR #23)에 적용한 공용 `NearbyInfra` 패턴
- 설계 근거: `docs/superpowers/specs/2026-06-02-school-nearby-infra-redesign-design.md`,
  `docs/nearby-infra-rollout-prompts.md` (② amenity 행)

## 1. 배경 / 문제

현재 상권·편의 상세의 주변 정보는 두 섹션으로 나뉘어 있다:

1. **주변 상권 종합(#poi)** — `NearbyAmenitiesMixed` 옛 4탭(편의점/마트/카페/전통시장). 탭 전환 필요, 한 번에 보이는 양이 적고, DB가 보유한 병원·약국·공원·충전소·주차장·어린이집·기타가 화면에 안 나온다.
2. **가까운 {카테고리}(#same)** — `SameCategoryNearby`. 같은 카테고리 가까운 5건.

학교·병원·약국은 이미 공용 `NearbyInfra`(요약 배지줄 + 균일 2열 그리드, 전체 카테고리 노출)로 통일됐다. 상권·편의만 옛 패턴으로 남아 일관성이 깨지고, 노출 정보량도 적다.

## 2. 목표

- 옛 "주변 상권 종합" 탭과 "가까운 {카테고리}" 섹션을 **제거**하고, 학교/병원/약국과 동일한 공용 `NearbyInfra` **리스트 하나**로 통일한다.
- DB가 보유한 인프라 카테고리를 **최대한 노출**(편의·마트 · 카페 · 병원 · 약국 · 공원 · 전통시장 · 전기차 충전소 · 주차장 · 어린이집 · 기타).
- 자기 자신(현재 상세 항목)은 인프라 결과에서 제외한다.
- 모바일에서 깨지지 않고 화면 오버플로우가 없게 한다(공용 컴포넌트가 이미 보장).

## 3. 설계

### 3.1 데이터 계층 — `lib/amenity/nearby.ts`

`getNearbyInfra(lat, lng, opts)`에 자기 제외 옵션 2개를 추가한다(기본 미제외, 기존 `excludeHospitalId`/`excludePharmacyId`/`includeChildcare`와 동형):

```ts
opts: {
  excludeHospitalId?: bigint;
  excludePharmacyId?: bigint;
  excludeStoreId?: bigint;    // 신규 — 편의/마트/카페 상세
  excludeMarketId?: bigint;   // 신규 — 전통시장 상세
  includeChildcare?: boolean;
}
```

**제외 방식: 내부 배열 필터** (쿼리 시그니처는 건드리지 않음 — 가장 surgical).
`getNearbyInfra` 내부에서 `getNearbyStores`/`getNearbyTraditionalMarkets` 결과를 받은 뒤, `excludeStoreId`/`excludeMarketId`가 주어지면 해당 id를 가진 row를 필터링한 배열을 `buildInfraCategories`에 넘긴다.

> 주의: `getNearbyStores`/`getNearbyTraditionalMarkets`의 `LIMIT`은 `INFRA_FETCH_LIMIT`(12). 자기 자신이 12위 안에 포함돼 1건 빠지면 11건이 될 수 있으나, 화면 cap(5)·요약 배지에 영향이 미미하므로 LIMIT+1 보정은 생략한다(병원/약국은 보정하지만, 여기선 단순 필터로 충분 — 자기 자신은 거의 항상 0m로 1위라 빠져도 무방). 단위 테스트로 제외 동작만 보장한다.

`buildInfraCategories`(순수 로직, `lib/amenity/infra.ts`)는 **수정 불필요**.

### 3.2 페이지 — `app/(public)/amenity/[category]/[id]/page.tsx`

- import 교체: `getMixedNearbyForDetail`, `getSameCategoryNearby` 제거 → `getNearbyInfra` 추가. `NearbyAmenitiesMixed`, `SameCategoryNearby` import 제거 → `NearbyInfra`(`@/components/ui/nearby-infra`) 추가.
- `Promise.all`:
  - `getMixedNearbyForDetail(...)` / `getSameCategoryNearby(...)` 제거.
  - `coord ? getNearbyInfra(coord.lat, coord.lng, { ...exclude, includeChildcare: true }) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>)` 추가.
  - 자기 제외 분기: `def.slug === 'market'` → `{ excludeMarketId: itemId }`, 그 외(`convenience`/`mart`/`cafe`) → `{ excludeStoreId: itemId }`.
- 본문 렌더: `{coord && <NearbyAmenitiesMixed {...mixed} />}` + `{coord && <SameCategoryNearby items={sameCat} def={def} />}` 두 줄 제거 → `{coord && <NearbyInfra categories={infra} />}` 한 줄.
- 내 변경으로 안 쓰이게 된 지역 변수/타입 정리: `mixed`, `sameCat`, `MixedT`, `SameT`. `AmenitySlug` import는 다른 곳에서 여전히 쓰는지 확인 후 미사용이면 제거.

### 3.3 정리 (orphan)

내 변경으로 **amenity 전용**이던 다음 자산이 완전 고아가 된다 → 삭제:
- `app/(public)/amenity/[category]/_components/same-category-nearby.tsx`
- `lib/amenity/nearby.ts`의 `getSameCategoryNearby` 함수

**유지(삭제 금지)** — urban 페이지가 아직 사용 중:
- `app/(public)/amenity/[category]/_components/nearby-amenities-mixed.tsx` (`NearbyAmenitiesMixed`)
- `lib/amenity/nearby.ts`의 `getMixedNearbyForDetail`
  (`urban/[category]/[id]`, `urban/charger/[id]`가 import)

### 3.4 사이드바 TOC — `_components/amenity-detail-sidebar.tsx`

`ANCHORS` 수정:
- `{ href: '#poi', label: '주변 상권 종합' }` → `label: '주변 생활 인프라'`.
- `{ href: '#same', label: '같은 카테고리' }` 항목 **제거**.

### 3.5 모바일 / 오버플로우

공용 `NearbyInfra`(`components/ui/nearby-infra.tsx`)가 이미 보장하므로 **추가 작업 없음**:
- 그리드 `grid-cols-1 md:grid-cols-2` (모바일 1열).
- 요약 배지줄 `overflow-x-auto` + 칩 `shrink-0 whitespace-nowrap` (가로 스크롤).
- `[grid-auto-rows:1fr]` + 더보기/안내문구 `mt-auto` (블록 높이 정렬, 세로 깨짐 없음).
- 항목 이름 `truncate`, 거리 배지 `shrink-0` (가로 오버플로우 차단).

## 4. 컴포넌트 / 데이터 흐름 요약

```
page.tsx (server)
  └ getNearbyInfra(lat, lng, { excludeStoreId|excludeMarketId, includeChildcare:true })
      └ getNearbyStores / Hospitals / Pharmacies / Parks / Markets / EvChargers / Parking / Childcare
      └ (store/market 자기 제외 필터)
      └ buildInfraCategories(...) → InfraCategory[]  // 빈 카테고리 제외
  └ <NearbyInfra categories={infra} />  // client, 더보기 toggle
```

## 5. 테스트

- `tests/lib/amenity-infra.test.ts`: 순수 로직(`buildInfraCategories`)에는 변경이 없으나, getNearbyInfra의 store/market 제외는 통합 성격이라 순수하게 테스트하기 어렵다. **`buildInfraCategories`에 제외된 입력을 넘겼을 때 결과에 빠지는지**를 검증하는 케이스로 대체(필터 책임을 명확히): 같은 id를 가진 store/market을 raw에서 뺀 입력과 안 뺀 입력의 결과 차이를 확인. (필터 자체가 `getNearbyInfra` 내부 1줄 `.filter`라 회귀 위험이 낮으므로, 테스트는 분류 로직 보존 확인 수준으로 가볍게.)

## 6. 검증 (필수)

1. `tsc --noEmit` 통과.
2. `pnpm lint` 통과.
3. `pnpm vitest run` 전체 통과.
4. dev 서버 + Playwright로 4개 카테고리(편의점/마트/카페/전통시장) 상세 각각 데스크탑·모바일 스크린샷:
   - 옛 탭/“가까운 카테고리” 섹션이 사라지고 `주변 생활 인프라` 리스트만 노출.
   - 요약 배지줄, 더보기, 0곳 카테고리 숨김, 블록 높이 정렬, 자기 제외(현재 항목이 목록에 없음) 확인.
   - 375px 모바일에서 1열 + 요약줄 가로 스크롤, 오버플로우 없음.
5. 회귀: urban(충전소/주차장) 상세가 여전히 `NearbyAmenitiesMixed`로 정상 동작(공유 자산 미삭제), 학교/병원/약국 상세 영향 없음.

## 7. 성공 기준

1. 상권·편의 4개 카테고리 상세에서 탭/`#same`이 사라지고, 데이터가 있는 인프라 카테고리가 요약줄 + 균일 그리드로 노출된다.
2. 현재 보고 있는 항목 자신은 인프라 목록에서 제외된다(편의/마트/카페 → store, 전통시장 → market).
3. 어린이집이 인프라에 포함된다(0곳이면 자동 숨김).
4. 375px 모바일에서 깨짐/오버플로우 없이 표시된다.
5. urban 페이지 회귀 없음(공유 컴포넌트·함수 유지).
6. `tsc --noEmit` / `pnpm lint` / `pnpm vitest run` 통과.

## 8. 범위 밖 (Out of scope)

- urban(충전소/주차장)·아파트·오피스텔/빌라 상세 적용(별도 작업).
- 주변 아파트 섹션 변경.
- 지도 위 POI 표시.
