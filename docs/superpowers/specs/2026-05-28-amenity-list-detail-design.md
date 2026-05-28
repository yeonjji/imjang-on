# 생활편의 · 상권·편의 4종 LIST/DETAIL 페이지 설계

작성일: 2026-05-28
상태: 설계 확정 대기 (사용자 리뷰 중)

## 1. 배경 & 목표

학교(`/school`) 페이지가 완성된 다음 단계로, 이미 수집 완료된 생활편의 데이터 중 **상권·편의 4종**(편의점·마트·카페·전통시장)의 독립 LIST·DETAIL 페이지를 구축한다. 학교 페이지에서 검증된 UX(시군구 허브 → 시군구 LIST + 필터 → DETAIL에서 주변 아파트 역방향 연결)를 그대로 포팅하되, 4종이 서로 다른 테이블·필터를 가진 현실을 **카테고리 어댑터 패턴**으로 흡수한다.

핵심 가치는 학교와 동일하게 "이 위치에 살면 어떤 생활인가" — 편의점·마트·카페·시장 DETAIL에서 그 지점 주변 아파트 실거래가와 다른 상권을 함께 노출한다.

## 2. 범위

### 포함
- `/amenity/[category]` 허브 + `regions` + 시군구 LIST + DETAIL 4단계 라우트(`[category]` ∈ `convenience` | `mart` | `cafe` | `market`)
- 4개 카테고리 어댑터(`lib/amenity/adapters/*.ts`)와 통합 서비스(`lib/amenity/{category,list,detail,nearby}.ts`)
- 학교의 LIST·DETAIL UI를 카테고리 중립 컴포넌트(`amenity-*`)로 재구현
- DETAIL: Hero · 기본정보 · 지도 · 주변 아파트 · 주변 상권 종합(타 카테고리 mixed) · 같은 카테고리 가까운 N건 · 사이드바
- `life-menu.ts`의 4종 항목을 `live: true`로 전환, `href`를 `/amenity/[category]`로 변경
- 기존 `lib/amenity.ts`(`getNearby*` + `NearbyApartment` 타입)를 `lib/amenity/nearby.ts`로 이전하고 학교 DETAIL의 import 경로 갱신
- **`TraditionalMarket.sigunguCode` 컬럼 추가** (현재 스키마에 없음) + 주소 파싱 기반 백필 + Prisma migration. 시군구 LIST·DETAIL 가드의 전제 조건.

### 제외 (후속 작업)
- 도시인프라(공원·충전소·주차장)와 의료시설(병원·약국) — 4종 검증 후 별도 PR
- Store `name` 컬럼의 `pg_trgm` 인덱스 추가 — 시군구로 좁힌 뒤 `contains` 검색이 충분히 빠르지 않을 때 후속
- 단지 상세 페이지의 역방향 통합(이 작업 범위 밖, 학교 작업과 같은 분리 원칙)
- 새 카테고리 추가(약국·병원 등 추후 데이터로) — 이번 어댑터 패턴이 받침대가 됨

## 3. 정보구조(IA) & 라우팅

상위 네비는 기존 `생활편의` 드롭다운 그대로. 상권·편의 그룹 4개 항목이 라이브 전환된다.

```
/life
└── 상권·편의 그룹
    ├── 편의점  → /amenity/convenience
    ├── 마트    → /amenity/mart
    ├── 카페    → /amenity/cafe
    └── 전통시장 → /amenity/market
```

각 카테고리는 동형 라우트:

```
/amenity/[category]                       허브(시·도 → 시군구 picker + 검색 + 인기 시군구)
/amenity/[category]/regions               시·도 → 시군구 전체 트리
/amenity/[category]/[sigunguCode]         시군구 LIST (필터 · 페이지네이션)
/amenity/[category]/[sigunguCode]/[id]    DETAIL
```

- **URL은 4벌, 코드는 1벌** — Next.js의 dynamic segment `[category]`로 단일 라우트 트리가 4개 카테고리를 모두 서빙.
- `[category]`가 등록된 슬러그가 아니면 `notFound()`.

## 4. 데이터 모델 사용

| 카테고리 | 테이블 | 시군구 필터 키 | 카테고리 필터 조건 | sub-filter |
|---|---|---|---|---|
| convenience | `Store` | `sigunguCode` (기존) | `industryCode startsWith 'G20405'` | 없음 |
| mart | `Store` | `sigunguCode` (기존) | `industryCode startsWith ('G20404','G20402')` | `super`(G20404) / `hyper`(G20402) / `all` |
| cafe | `Store` | `sigunguCode` (기존) | `industryCode startsWith 'I21201'` | 없음 |
| market | `TraditionalMarket` | `sigunguCode` (**신규 컬럼**) | (전건) | `marketType` 값 매핑 → `permanent`(상설) / `periodic`(정기·N일장) / `all` |

`Store`의 industryCode 접두 상수는 기존 `lib/amenity-category.ts`의 `STORE_PREFIX`에서 가져와 어댑터 내부 상수로 재배치(혹은 그대로 참조). Store 스키마는 변경 없음.

### 4.1 `TraditionalMarket.sigunguCode` 추가 (스키마 변경)

현재 `TraditionalMarket`은 `address`와 `location`만 갖고 있어 시군구 단위 LIST·DETAIL 가드가 불가능하다. `Store`와 같이 `sigunguCode String @db.VarChar(5)` 컬럼을 추가하고 인덱스(`@@index([sigunguCode])`)를 설정한다.

- **Prisma migration**: `add_traditional_market_sigungu_code` — 컬럼 추가(NULL 허용 → 백필 후 NOT NULL 검토)
- **백필 스크립트**: `address` 문자열에서 시·도 + 시군구 토큰을 추출해 `Region.fullName` 매칭으로 `sigunguCode` 결정. 기존 Store 백필 패턴 재사용(별도 헬퍼가 있으면 그대로 호출).
- **ingest 어댑터 갱신**: 향후 새 row 적재 시 자동 채워지도록 `scripts/ingest`의 TraditionalMarket 어댑터(있는 경우)에 정규화 단계 추가.
- **데이터량**: 1,393건 — 단일 트랜잭션 백필 가능.

### 4.2 `TraditionalMarket.marketType` 값 매핑

실값 분포를 첫 어댑터 작업에서 `SELECT DISTINCT marketType FROM "TraditionalMarket"`로 확인하고 매핑 확정. 본 설계는 `상설시장`(또는 유사 토큰) → `permanent`, 그 외(정기·5일장·N일장) → `periodic`로 2그룹화한다고 가정한다. 매핑은 어댑터 내부에 상수로 보관, 새 값 출현 시 어댑터 + 어댑터 테스트만 수정.

## 5. 아키텍처

### 5.1 파일 트리

```
app/(public)/amenity/
├── [category]/
│   ├── page.tsx                 허브
│   ├── regions/page.tsx         시·도 → 시군구 트리
│   ├── [sigunguCode]/
│   │   ├── page.tsx             시군구 LIST
│   │   └── [id]/page.tsx        DETAIL
│   └── _components/             카테고리 공용 UI
│       ├── amenity-card.tsx
│       ├── amenity-filter-panel.tsx
│       ├── amenity-mobile-filter-sheet.tsx
│       ├── amenity-pagination.tsx
│       ├── amenity-hero.tsx
│       ├── amenity-info.tsx
│       ├── amenity-detail-sidebar.tsx
│       ├── nearby-amenities-mixed.tsx
│       └── same-category-nearby.tsx

components/ui/
└── nearby-apartments.tsx        학교용에서 승격(카테고리 무관)

lib/amenity/
├── category.ts                  AmenityCategoryDef + AMENITY_CATEGORIES 레지스트리 + getCategoryDef
├── adapters/
│   ├── convenience.ts
│   ├── mart.ts
│   ├── cafe.ts
│   └── market.ts
├── list.ts                      getAmenityList(category, filter, page)
├── detail.ts                    getAmenityById, getAmenityLatLng
└── nearby.ts                    기존 lib/amenity.ts 흡수 + getMixedNearbyForDetail
```

### 5.2 핵심 인터페이스 — `AmenityCategoryDef`

```ts
export interface AmenityCategoryDef<Sub extends string = string> {
  slug: 'convenience' | 'mart' | 'cafe' | 'market';
  label: string;          // '편의점', '마트', '카페', '전통시장'
  emoji: string;          // 🏪, 🛒, ☕, 🏬
  breadcrumbLabel: string;
  subFilters?: {
    paramKey: string;     // 'subType' 등 URL 쿼리 키
    options: Array<{ slug: Sub; label: string }>;
    defaultSlug: Sub;     // 보통 'all'
  };
  getList(filter: AmenityListFilter<Sub>, page: number): Promise<AmenityListResult>;
  getById(id: bigint): Promise<AmenityItem | null>;
  getLatLng(id: bigint): Promise<{ lat: number; lng: number } | null>;
  inferRowSummary(row: AmenityItem): string | null; // 카드 보조 라벨 ('대형마트', '상설시장' 등)
  detailFields(item: AmenityItem): Array<{ label: string; value: string }>; // DETAIL 기본정보 행
}
```

`AmenityListFilter`/`AmenityItem`/`AmenityListResult`는 어댑터들이 공통으로 반환하는 표준 모양(`{ id, name, address, ...optional }`). Prisma 모델별 차이는 어댑터 내부에서 흡수한다.

### 5.3 메뉴 전환

`app/(public)/_components/life-menu.ts`에서 `상권·편의` 그룹 4항목의 `href`를 `/amenity?type=*` → `/amenity/[category]`로 변경하고 `live: true`로 일괄 전환. 4종이 모두 동작하는 시점의 한 PR로 처리(중간 상태에서 깨진 링크 노출 방지).

## 6. 데이터 흐름

### LIST (`/amenity/[category]/[sigunguCode]`)
1. `params.category` → `getCategoryDef(category)`; 없으면 `notFound()`.
2. `params.sigunguCode` → `getSigunguByCode(...)`; 없거나 `sigunguCode` 미존재면 `notFound()`.
3. `searchParams`에서 `page`, `q`, def별 sub-filter 슬러그 파싱(미지정 시 def의 `defaultSlug`).
4. `getAmenityList(category, { sigunguCode, q, sub }, page)` 호출 → 어댑터가 Prisma `take/skip` + `count` 동시 실행.
5. `AmenityFilterPanel`(좌측, def에 subFilters 있을 때만 sub 섹션) + `AmenityCard[]` + `AmenityPagination`.

### DETAIL (`/amenity/[category]/[sigunguCode]/[id]`)
1. def·region 가드 + `getAmenityById(category, id)`의 `sigunguCode`와 URL `sigunguCode` 일치 검증; 불일치면 `notFound()`. 4종 모두 `sigunguCode` 컬럼을 가짐 (market은 §4.1 백필 후).
2. 1차 `Promise.all`:
   - `getAmenityById(category, id)`
   - `getAmenityLatLng(category, id)` (PostGIS raw)
   - `getAmenityList(category, { sigunguCode }, 1)` (사이드바 "같은 시군구 다른 N개")
3. 좌표 있으면 2차 `Promise.all`:
   - `getNearbyApartments(lat, lng)`
   - `getMixedNearbyForDetail(category, lat, lng)` — 현재 카테고리를 **제외**한 다른 카테고리들의 가까운 항목들 + 공원·충전소 일부(점진 확장)
   - `getSameCategoryNearby(category, lat, lng, excludeId)`
4. 좌표 없으면 지도·주변 섹션 전부 생략하고 "위치 정보 없음" 안내 카드.

### 캐싱
- 허브 `[category]/page.tsx`: `revalidate = 86_400`
- regions: `revalidate = 86_400`
- 시군구 LIST: `revalidate = 21_600` (학교와 동일, 6h)
- DETAIL: `revalidate = 86_400` (24h)

## 7. 에러 처리 / 엣지 케이스

| 케이스 | 처리 |
|---|---|
| 잘못된 `category` 슬러그 | `notFound()` (404) |
| 잘못된 `sigunguCode` | `notFound()` |
| `id`는 존재하나 `sigunguCode`가 URL과 불일치 | `notFound()` — 학교 패턴 동일 |
| `location` NULL | 지도·주변 N 섹션 생략, 안내 카드 노출 |
| LIST 결과 0건 | "조건에 맞는 {def.label}이 없습니다" 빈 상태 카드 |
| `q` 검색 성능 (Store 311k) | 시군구로 1차 좁힌 뒤 `name contains` 사용. 한 시군구당 수천~수만 건 범위. 후속 `pg_trgm` 인덱스는 별도 작업. |
| `industryCode` 접두 상수 변경 | 어댑터 상수 한 곳에서 관리, 변경 시 어댑터 + 어댑터 테스트만 수정 |
| 메뉴 라이브 전환 타이밍 | 4종 페이지가 모두 동작하는 시점에 `life-menu.ts` 한 번에 전환 |

## 8. 테스트 전략

### 어댑터 단위 (`tests/lib/amenity/adapters/*.test.ts`)
- `convenience` / `cafe`: industryCode prefix 필터 결과 검증 (Store fixture로)
- `mart`: prefix 필터 + sub-filter(슈퍼/대형/all) 분기 검증
- `market`: `marketType` 값 → 상설/정기 슬러그 매핑 검증
- 공통: `q` + `sigunguCode` 조합, 페이지네이션 경계(`page=1`, `page>totalPages`)

### 통합 (`tests/lib/amenity/list.test.ts`)
- def 디스패치: 유효 슬러그 → 어댑터 호출, 잘못된 슬러그 → throw 또는 null

### e2e (Playwright)
- 한 카테고리만 happy path (mart 선택):
  허브 → regions → 시군구 LIST → sub-filter(대형마트) 적용 → 카드 클릭 → DETAIL에서 주변 아파트 카드 존재 확인
- 다른 3 카테고리는 어댑터·렌더 스냅샷으로 커버. e2e 4벌 작성은 과잉.

### 회귀 가드
- `lib/amenity.ts` → `lib/amenity/nearby.ts` 이전 후 학교 DETAIL e2e와 단위 테스트가 모두 통과해야 함(import 경로 변경 누락 방지).

## 9. 마일스톤

1. **`TraditionalMarket.sigunguCode` 컬럼 + 백필** — Prisma migration · 백필 스크립트 · ingest 어댑터 업데이트(있는 경우). 후속 단계 전제.
2. **`lib/amenity.ts` → `lib/amenity/nearby.ts` 이전** — 학교 DETAIL import 경로 갱신, 학교 e2e 회귀 통과 확인. 별도 단계로 분리해 큰 PR과 섞이지 않도록.
3. **어댑터 + 서비스 레이어** — `lib/amenity/category.ts`, 어댑터 4개, `list.ts`, `detail.ts` + 단위 테스트.
4. **공용 UI 컴포넌트** — `amenity-*` 7개 + `NearbyApartments` 승격.
5. **라우트** — 4단계 페이지 작성. 카테고리는 dynamic segment 하나로 4종 모두 서빙.
6. **메뉴 라이브 전환** — `life-menu.ts` 4종 `live: true` + href 갱신, e2e + 시각 확인.
7. **시안 대조 + 마무리** — `html/list.html`, `html/detail.html`와 시각 정합성 점검, 브레드크럼·메타·SEO 마무리.

## 10. 참고

- 디자인 source of truth: `html/list.html`, `html/detail.html` (구조·섹션·간격·카피 그대로 포팅)
- 패턴 레퍼런스: `app/(public)/school/**`, `lib/school.ts`, `lib/amenity.ts`(현재 `getNearby*`)
- 데이터 컨텍스트: Store 311,857건, TraditionalMarket 1,393건 (2026-05-27 기준)
