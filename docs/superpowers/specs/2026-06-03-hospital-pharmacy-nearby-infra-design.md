# 병원·약국 상세 — 주변 생활 인프라 재설계 (NearbyInfra 적용)

- 날짜: 2026-06-03
- 대상: 병원 상세, 약국 상세
- 레퍼런스: 학교 상세 구현(PR #20), `docs/superpowers/specs/2026-06-02-school-nearby-infra-redesign-design.md`
- 롤아웃 가이드: `docs/nearby-infra-rollout-prompts.md` (②·③)

## 배경

학교·어린이집 상세는 이미 공용 `NearbyInfra`(요약 배지줄 + 균일 그리드, 8개 카테고리)와
공용 집계 `getNearbyInfra(lat,lng)`를 쓴다. 병원·약국 상세는 아직 옛 방식
(`HospitalNearby` / `PharmacyNearby` — 카테고리별 카드 grid)을 쓰고 있어 이를 교체한다.

학교 레퍼런스를 기본으로 따르되, **사용자 요청에 따른 2가지 변경**을 반영한다:

1. **어린이집을 NearbyInfra 안의 카테고리로 포함**한다(학교처럼 별도 섹션이 아님). 단 opt-in.
2. **카페를 인프라의 독립 카테고리로 추가**한다(현재는 `기타 생활편의`에 묻힘). 전역 변경.

## 카테고리 최종 집합 (NearbyInfra)

표시 순서:

`편의·마트 🛒` · `카페 ☕` · `병원 🏥` · `약국 💊` · `공원 🌳` ·
`전통시장 🏬` · `전기차 충전소 ⚡` · `주차장 🅿️` · `어린이집 👶`(opt-in) · `기타 생활편의 🏪`

- 빈 카테고리는 숨김(기존 규칙 유지).
- 카테고리당 화면 cap 5 + 더보기, fetch 한도(`INFRA_FETCH_LIMIT=12`) 도달 시 `N+` 배지(기존 규칙 유지).

## 변경 사항

### A. 공용 순수 로직 — `lib/amenity/infra.ts`

- `classifyStore(industryCode)` 반환 타입에 `'cafe'` 추가.
  - `CAFE_PREFIXES = ['I21201']` 신설. 분류 우선순위: mart → cafe → medical → etc.
  - 기존 `etc`에 들어가던 `I21201` 항목이 `cafe`로 이동(school/childcare 포함 전역 영향, 회귀 아님).
- `InfraCategoryKey`에 `'cafe'`, `'childcare'` 추가.
- `RawInfra`에 `childcare?: NearbyChildcare[]` (선택) 추가.
- `buildInfraCategories(raw)`:
  - `cafe` 카테고리(☕ 카페, 반경 500m 내) — `편의·마트` 바로 뒤에 배치.
  - `childcare` 카테고리(👶 어린이집, 반경 1km 내) — `raw.childcare`가 있고 비어있지 않을 때만 emit, `기타 생활편의` 앞에 배치.
- 빈 카테고리 필터·`capped` 계산 등 나머지 로직 불변.

### B. 공용 집계 — `lib/amenity/nearby.ts`

- `getNearbyHospitals`, `getNearbyPharmacies`에 `excludeId: bigint | null = null` 파라미터 추가.
  - 기존 `getNearbyChildcare` 패턴 그대로: `LIMIT ${limit + 1}` fetch → `excludeId` 필터 → `slice(0, limit)`.
  - 기본값 `null` → 기존 호출부 동작 불변.
- `getNearbyInfra` 시그니처 확장(모두 선택, 기본 = 현재 동작):

  ```ts
  getNearbyInfra(
    lat: number,
    lng: number,
    opts?: {
      excludeHospitalId?: bigint;
      excludePharmacyId?: bigint;
      includeChildcare?: boolean;
    },
  ): Promise<InfraCategory[]>
  ```

  - `excludeHospitalId` → `getNearbyHospitals(..., excludeHospitalId)`
  - `excludePharmacyId` → `getNearbyPharmacies(..., excludePharmacyId)`
  - `includeChildcare` → `getNearbyChildcare(lat, lng, 1000, INFRA_FETCH_LIMIT)` 추가 fetch 후 `buildInfraCategories`에 `childcare` 전달.
  - opts 미전달 시: 어린이집 미포함 + 제외 없음 → school/childcare 페이지 동작 불변.

### C. 병원 상세 — `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx`

- 제거: `getNearbyApartments` 외 옛 nearby 호출(`getNearbyPharmacies`/`getNearbyParks`/`getNearbyStores`/`getNearbyEvChargers`)과 `HospitalNearby`.
- 추가/유지:
  - `getNearbyApartments(coord)` 유지 → `<NearbyApartments items={apts} />` (학교와 동일 공용 컴포넌트).
  - `getNearbyInfra(coord.lat, coord.lng, { excludeHospitalId: hospital.id, includeChildcare: true })` → `<NearbyInfra categories={infra} />`.
  - 좌표 없으면 `<NearbyInfra>` 미렌더(기존 가드 패턴).
- `_components/hospital-nearby.tsx` 삭제(이 페이지 전용).
- 미사용된 import 정리.

### D. 약국 상세 — `app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx`

- 제거: 옛 nearby 호출(`getNearbyHospitals`/`getNearbyParks`/`getNearbyStores`/`getNearbyTraditionalMarkets`/`getNearbyEvChargers`/`getNearbyChildcare`)과 convenience/mart/cafe 필터 분기, `PharmacyNearby`.
- 추가/유지:
  - `getNearbyApartments(coord)` 유지 → `<NearbyApartments items={apts} />`.
  - `getNearbyInfra(coord.lat, coord.lng, { excludePharmacyId: pharmacy.id, includeChildcare: true })` → `<NearbyInfra categories={infra} />`.
- `_components/pharmacy-nearby.tsx` 삭제(이 페이지 전용).
- 미사용된 import 정리.

## 자기 중복 방지

- 병원 상세: `병원` 카테고리에서 자기 hospital id 제외.
- 약국 상세: `약국` 카테고리에서 자기 pharmacy id 제외.
- hospital/pharmacy id는 서로 다른 테이블의 bigint이므로 카테고리별로 스코프된 제외(`excludeHospitalId`/`excludePharmacyId`)로 충돌 방지.

## 테스트 — `tests/lib/amenity-infra.test.ts`

- `classifyStore('I21201...')` → `'cafe'`.
- 카페 store가 `cafe` 카테고리에 들어가고 `기타`에 안 들어감.
- `childcare`가 전달되면 `어린이집` 카테고리 생성, 빈 배열/미전달이면 카테고리 없음.
- 카테고리 표시 순서(편의·마트 → 카페 → … → 어린이집 → 기타) 검증.

## 검증

1. `pnpm tsc --noEmit` + `pnpm lint` + `pnpm vitest run` 전체 통과.
2. dev 서버 실데이터로 Playwright 데스크탑·모바일 스크린샷:
   - 병원·약국 각각 요약 배지줄, 더보기, 0곳 카테고리 숨김, 높이 정렬, `N+` 배지, 자기 제외, 카페·어린이집 노출, 주변 아파트 별도 섹션.
3. 회귀 확인: school·childcare 상세에서 카페가 `기타`→독립 카테고리로 이동한 것 외 레이아웃 정상, 어린이집 중복 없음(school은 여전히 별도 섹션, infra엔 미포함).

## 비목표 (out of scope)

- amenity / urban(charger·parking) / apt·officetel·villa 상세는 본 작업 범위 아님(롤아웃 ③의 별도 항목).
- `NearbyInfra` 컴포넌트의 시각 디자인 변경 없음(카테고리 추가만).
