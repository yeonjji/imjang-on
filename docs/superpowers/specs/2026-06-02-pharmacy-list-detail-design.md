# 약국 목록/상세 페이지 설계

**작성일**: 2026-06-02
**상태**: 승인됨 (구현 대기)

## 목표

약국(Pharmacy) 목록·상세 페이지를 만든다. 기존 편의시설/병원 UI와 통일하며, 병원 페이지를 1차 템플릿으로 삼는다. 보유한 약국 데이터를 최대한 노출하고, 주변 인프라 정보를 가능한 한 전부 보여준다. 모바일에서도 레이아웃이 깨지지 않게 처리한다.

## 데이터 현황 (확인됨)

- `Pharmacy` 레코드 25,688건, 그중 25,686건이 좌표(`location`) 보유.
- `typeName`은 전부 `"약국"` 단일값 → **타입 필터는 무의미하므로 두지 않는다.**
- 사용 가능 필드: `name`, `address`, `tel`, `openedAt`, `sido`, `sigungu`, `eupmyeondong`, `sigunguCode`, `zipcode`, `typeName`(약국), `location`.
- 병원과 달리 `homepage`, 진료과, 시설, 운영시간 등 부가 테이블이 **없다.** → 상세 페이지에서 탭으로 채울 데이터가 없으므로 탭을 두지 않는다.

## 라우팅

병원 라우팅을 미러링한다.

- 목록: `/medical/pharmacy`
- 상세: `/medical/pharmacy/[sigunguCode]/[id]`
- 두 페이지 모두 `export const revalidate = 86_400;` (ISR, 병원과 동일).
- `app/(public)/_components/life-menu.ts`의 약국 항목을 `href: '/medical/pharmacy'`, `live: true`로 전환 (현재 `/medical?type=pharmacy`, `live: false`).

## 데이터 레이어: `lib/pharmacy/index.ts` (신규)

`lib/hospital/index.ts`를 미러링하되 타입 코드 관련 함수는 제외.

- `getPharmacyById(id: bigint)` — 단건 조회. 부가 relation 없음(평면 레코드).
- `getPharmacyLatLng(id: bigint): Promise<{ lat; lng } | null>` — `ST_Y/ST_X` raw 쿼리, 병원과 동일 패턴.
- `getPharmacyList(filter: { sigunguCode? }, page, perPage = 20)` — `where.sigunguCode = { not: null }` 기본, 필터 시 해당 시군구. `orderBy: { name: 'asc' }`, total/totalPages 반환.
- `getPharmacyRegions(): { sido; sigungu; sigunguCode }[]` — distinct sigunguCode, sido·sigungu 정렬.
- (타입 필터 없음 → `getPharmacyTypeCodes` 미작성.)

## 신규 nearby 헬퍼: `lib/amenity/nearby.ts`

**`getNearbyHospitals(lat, lng, radiusMeters = 500)`** 추가 — 약국 주변 병원·의원 표시용.

- 반환 인터페이스 `NearbyHospital { id: bigint; name: string; typeName: string; address: string; distanceMeters: number }`.
- `Hospital` 테이블에 `ST_DWithin` + `ST_Distance` raw 쿼리, `ORDER BY distanceMeters LIMIT 5`. 기존 `getNearbyPharmacies` 등과 동일한 패턴.

그 외 주변 카테고리는 기존 헬퍼 재사용: `getNearbyApartments`, `getNearbyParks`, `getNearbyStores`, `getNearbyTraditionalMarkets`, `getNearbyEvChargers`, `getNearbyChildcare`.

## 목록 페이지 `app/(public)/medical/pharmacy/page.tsx`

병원 목록(`medical/hospital/page.tsx`)을 복제하되 타입 필터를 제거.

- breadcrumb: 홈 › 생활편의 › 의료시설(`/life/medical`) › 약국
- hero 카드: "의료시설 · 약국" 라벨, h1 "약국", `전국 {total}개` (`toLocaleString('ko-KR')`).
- 레이아웃: `aside`(sticky, 데스크톱 전용) 지역 필터 + `main`(2열 그리드) + 페이지네이션. 병원과 동일 클래스.
- 모바일: `PharmacyMobileFilterSheet` (Suspense).
- `searchParams`: `{ region?, page? }` (type 없음).
- 빈 결과 문구: "조건에 맞는 약국이 없습니다."

### 컴포넌트 (`medical/pharmacy/_components/`)

- **`pharmacy-card.tsx`** — `HospitalCard` 구조 동일: 이름(truncate, bold) + `약국` 배지(sky-soft) + 주소 + 전화(있을 때). `href = /medical/pharmacy/{sigunguCode}/{id}`.
- **`pharmacy-filter-panel.tsx`** — 지역(시군구) 필터만. 병원 패널에서 타입 섹션 제거.
- **`pharmacy-mobile-filter-sheet.tsx`** — 지역만. 병원 bottom sheet에서 타입 제거, 활성 개수 계산도 region만.

## 상세 페이지 `app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx`

탭 없이 단일 컬럼 + 사이드바 레이아웃. 병원 상세의 골격을 따르되 탭/요약카드 부분을 정보카드로 대체.

`generateMetadata`: `{name} — 약국 정보·주변 아파트`, canonical `/medical/pharmacy/{sigunguCode}/{id}`.

`notFound()` 조건: id가 숫자 아니거나, 레코드 없거나, `sigunguCode` 불일치 (병원과 동일).

본문 순서:

1. breadcrumb: 홈 › 생활편의 › 의료시설 › 약국(`/medical/pharmacy`) › {시군구}(`?region=`) › {이름}
2. **`PharmacyHero`** — 파란(`--color-blue-dark`) hero. 상단 `약국{ · YYYY년 개설}`, h1 이름, `📍 {주소}` + `📞 {전화}`(tel: 링크). homepage 없음.
3. **`PharmacyInfo`** 카드 — 보유 데이터 전부를 정의형 리스트로: 종별(약국), 개설일(YYYY.MM.DD), 전화, 우편번호, 시도, 시군구, 읍면동. 값 없는 항목은 표시 생략.
4. **지도** — 좌표 있을 때 `Card` 안에 `NaverMap` (제목 "위치"). 병원과 동일.
5. **`PharmacyNearby` (주변 인프라)** — 좌표 있을 때. 카테고리별 거리순 최대 5개, `md:grid-cols-2` 그리드, 병원의 `NearbyCard` 패턴 재사용. **편의점/마트/카페는 각각 별도 카드로 분리** (Store `industryCode` 접두사로 분류: 편의점 `G20405`, 마트 `G20404`/`G20402`, 카페 `I21201`).
   - 🏢 주변 아파트 (region)
   - 🏥 주변 병원·의원 (typeName) — 신규 헬퍼
   - 🌳 주변 공원 (parkType)
   - 🏪 편의점
   - 🛒 마트
   - ☕ 카페
   - 🏬 전통시장 (marketType)
   - ⚡ 전기차 충전소 (chargeSpeed · n기)
   - 👶 어린이집 (crType)
   - 항목이 0건인 카테고리 카드는 렌더 생략. 전부 0건이면 섹션 자체 생략.
6. **`PharmacySidebar`** — 같은 시군구의 다른 약국 최대 4개 (현재 약국 제외). 병원 sidebar 미러.

상세 데이터 페칭: `Promise.all`로 좌표 기반 nearby 호출들 + 같은 시군구 약국 목록(`getPharmacyList({ sigunguCode }, 1, 5)`)을 병렬 실행.

## 모바일 대응

- 상세 그리드 `lg:grid-cols-[1fr_320px]` → 모바일 단일 컬럼.
- 주변 인프라 `md:grid-cols-2` → 모바일 1열.
- 목록 aside는 `hidden md:block`, 모바일은 bottom sheet 필터.
- hero/카드 텍스트 truncate 및 `flex-wrap` 유지.
- 구현 후 모바일 폭(≈375px)에서 가로 스크롤·오버플로 없음 확인.

## 검증 기준

1. `pnpm tsc --noEmit` 타입 통과.
2. `/medical/pharmacy` 목록 렌더 + 지역 필터 + 페이지네이션 동작.
3. 약국 상세 렌더 + 지도 + 주변 인프라(9개 카테고리, 데이터 있는 것만) + 사이드바.
4. 모바일 폭에서 레이아웃 깨짐 없음.
5. life-menu에서 약국 클릭 시 SoonModal 없이 라이브 이동.

## 범위 밖 (YAGNI)

- 약국 이름 검색 입력 (병원에도 없음 → 추가하지 않음).
- 운영시간/심야약국 표기 (데이터 없음).
- 약국 타입 필터 (단일값).
