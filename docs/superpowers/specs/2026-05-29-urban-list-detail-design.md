# 도시인프라 · 주차장 LIST/DETAIL 페이지 설계

작성일: 2026-05-29
상태: 설계 확정 대기 (사용자 리뷰 중)

## 1. 배경 & 목표

상권·편의 4종(`/amenity/[category]`) LIST/DETAIL이 안정 동작 중인 다음 단계로, **도시인프라 그룹의 주차장**(`/urban/parking`)을 라이브 전환한다. 직전 PR `#18`로 `Parking` 테이블(33컬럼)이 전국 적재 완료됐고, 컬럼 풍부도가 amenity 4종보다 훨씬 높아 — **데이터 풀 활용**을 통한 "이 위치에 살면 주차는 어떻게 풀리나"를 디테일하게 보여주는 것이 본 작업의 가치 제안이다.

라우팅·필터·sibling 탭은 amenity 패턴을 미러링해 통일성을 유지하면서, 주차장 고유의 운영시간 표·요금 그리드·부대정보 섹션은 카테고리 전용 컴포넌트로 분리한다. 공원·충전소는 동일 `lib/urban/*` 레지스트리 슬롯을 두지만 본 spec 범위는 주차장 1종이다.

## 2. 범위

### 포함
- `/urban/[category]` 동형 라우트 (`[category]` = `parking` 1종 라이브)
- `lib/urban/{category,list,detail,nearby}.ts` + `adapters/parking.ts`
- LIST: amenity 미러 골격 (Hero / sibling 탭 / 좌 필터 / 카드 / 페이지네이션 / 모바일 필터 시트)
- DETAIL: Hero · 기본정보 · **운영시간 표** · **요금 그리드** · **부대정보+특기사항** · 지도 · 주변 아파트 · 주변 상권·편의 혼합 · 주변 주차장 · 사이드바
- `life-menu.ts` urban items href 갱신 (`/urban?type=…` → `/urban/{slug}`), 주차장만 `live: true`
- 단위 + E2E 테스트 (Vitest + Playwright)
- sitemap에 `/urban/parking` LIST + sido 17개 variant 추가

### 제외 (후속 작업)
- 공원(`/urban/park`) LIST/DETAIL — `Park` 테이블에 sigunguCode가 없어 별도 backfill spec 후 합류
- 충전소(`/urban/charger`) LIST/DETAIL — `EvCharger`+`EvChargerUnit`은 데이터 모양이 달라 별도 spec
- Parking row 단위 `sigunguCode` 컬럼 추가 + GIST 기반 정확한 시군구 join (본 spec은 주소 prefix 매칭으로 우선 동작)
- DETAIL row 13만+ 개별 sitemap chunk
- `/search` 통합 (주차장 검색은 후속)
- 의료시설 그룹

## 3. 정보구조(IA) & 라우팅

```
/life
└── 도시인프라 그룹
    ├── 주차장 → /urban/parking          ← live
    ├── 공원   → /urban/park             ← soon
    └── 충전소 → /urban/charger          ← soon
```

```
/urban/[category]                  LIST (필터 · 페이지네이션 · sibling 탭)
/urban/[category]/[id]             DETAIL
```

- `[category]`가 등록된 슬러그가 아니면 `notFound()`.
- `/urban/parking` 진입 시 `sido`·`region` 미지정이면 `?sido=서울`로 redirect (amenity와 동일, `requiresSidoScope=true`).
- amenity·childcare처럼 region picker first 패턴은 채택하지 않음 (parking은 광역 탐색 비중이 크고 시군구 prefix 매칭의 정확도 한계가 있음).

## 4. 데이터 모델 사용

| 컬럼 | 용도 | LIST 필터 | DETAIL 표시 위치 |
|---|---|---|---|
| `name` | 식별 | `q` (contains) | Hero h1, 카드 제목, breadcrumb |
| `prkplceSe` | 공영/민영 | chip `sub` 또는 advanced | Hero 배지, 카드 배지 |
| `prkplceType` | 노외/노상/부설 | chip advanced | Hero 배지 |
| `rdnmadr`/`lnmadr`/`address` | 주소 | sido prefix | Hero/info, 카드 라인 |
| `location` (geography) | 지도/주변 | sido 매칭(주소 기반) | NaverMap, nearby* |
| `prkcmprt` | 구획수 | — | Hero meta, 카드 meta |
| `feedingSe`/`chargeInfo` | 유료/무료 | chip advanced | Hero 배지, fee-grid |
| `enforceSe` | 단속여부 | — | Hero meta, extras 배지 |
| `operDay` | 운영 요일 | — | hours-table 상단 칩 |
| `weekday/sat/holidayOpen/CloseHhmm` | 요일별 시간 | "24시간" advanced | hours-table |
| `basicTime`/`basicCharge`/`addUnitTime`/`addUnitCharge` | 시간 요금 | — | fee-grid 기본/추가 |
| `dayCmmtkt`/`monthCmmtkt` | 정기권 | — | fee-grid 일주차/월정기 |
| `metpay` | 결제수단 | — | info chip 행 |
| `spcmnt` | 특기사항 | — | extras 본문 (120자+ expand) |
| `pwdbsPpkZoneYn` | 장애인전용 | checkbox advanced | Hero 배지, extras |
| `institutionNm`/`insttNm`/`insttCode` | 운영기관 | — | info `${institutionNm ?? insttNm}` |
| `phoneNumber` | 전화 | — | info `tel:` 링크 |
| `referenceDate` | 기준일자 | — | info, 카드 footer 가능 |

**sigunguCode 처리**: Parking은 현재 sigunguCode 컬럼이 없다. 본 spec에서는:
- (A) `rdnmadr LIKE '${sidoFullName} ${sigunguName}%'` prefix 매칭으로 처리. 빠르지만 표기 변동에 취약.
- (B) 정확한 ST_Within(`location`, sigungu polygon)는 region 폴리곤 테이블이 없어 본 spec 미적용. 후속 backfill spec에서 sigunguCode 컬럼 추가 + list filter를 (B)로 교체.

→ 본 spec은 **(A) 적용**. region 코드 → fullName 조회는 기존 `getSigunguByCode` 재사용.

## 5. 디렉터리 구조

```
app/(public)/urban/
  [category]/
    page.tsx                          ← LIST
    [id]/page.tsx                     ← DETAIL
    _components/
      urban-card.tsx
      urban-filter-panel.tsx          ← 좌 데스크탑 패널
      urban-mobile-filter-sheet.tsx   ← 모바일 드로어
      urban-pagination.tsx
      urban-hero.tsx
      urban-info.tsx                  ← def.detailFields 그리드
      urban-detail-sidebar.tsx
      urban-same-category-nearby.tsx
      parking-hours-table.tsx         ← 카테고리 전용
      parking-fee-grid.tsx            ← 카테고리 전용
      parking-extras.tsx              ← 카테고리 전용

lib/urban/
  category.ts                         ← UrbanCategoryDef registry
  list.ts                             ← getUrbanList
  detail.ts                           ← getUrbanById, getUrbanLatLng
  nearby.ts                           ← getSameCategoryNearbyUrban
  adapters/
    parking.ts                        ← parkingDef
```

amenity의 `NearbyApartments`, `NaverMap`, `NearbyAmenitiesMixed`는 공유 컴포넌트로 그대로 import. amenity 자체 카드/필터/시트는 fork (코드량 작아 결합도 회피).

## 6. 타입 & 어댑터

```ts
// lib/urban/category.ts
export type UrbanSlug = 'parking' | 'park' | 'charger';

export interface UrbanListFilter {
  sigunguCode?: string;
  sido?: string;
  q?: string;
  sub?: string;
  // advanced
  prkplceSe?: '공영' | '민영';
  chargeInfo?: '유료' | '무료';
  prkplceType?: '노외' | '노상' | '부설';
  open24?: boolean;
  pwdOnly?: boolean;
}

export interface UrbanItem<TRow = unknown> {
  id: bigint;
  name: string;
  address: string;
  sigunguCode: string | null;
  raw: TRow;
}

export interface UrbanCategoryDef<TRow = unknown> {
  slug: UrbanSlug;
  label: string;
  emoji: string;
  breadcrumbLabel: string;
  subFilters?: AmenitySubFilterDef;
  requiresSidoScope?: boolean;
  getList(filter: UrbanListFilter, page: number): Promise<UrbanListResult<TRow>>;
  getById(id: bigint): Promise<TRow | null>;
  getLatLng(id: bigint): Promise<{ lat: number; lng: number } | null>;
  detailFields(row: TRow, ctx: { regionFullName: string }): Array<{ label: string; value: string }>;
  renderRichSections(row: TRow): ReactNode; // server component tree
  inferRowSummary(row: TRow): string | null;
}

export const URBAN_SLUGS = ['parking'] as const satisfies readonly UrbanSlug[];
export const URBAN_CATEGORIES: Record<UrbanSlug, UrbanCategoryDef> = { parking: parkingDef };
```

`parkingDef`는 Prisma `parking` 위에서:
- `getList`: `where` 빌드 — `sido`/`region` prefix, `prkplceSe`, `chargeInfo`, `prkplceType`, `pwdbsPpkZoneYn`, 24시간(`weekdayOpenHhmm='0000' AND weekdayCloseHhmm='2400'`), `q`(name contains). `orderBy` name asc, `take=20`, `skip=(page-1)*20`.
- `getById`: `findUnique({ id })` raw 전체.
- `getLatLng`: PostGIS `ST_Y(location)` / `ST_X(location)` (raw SQL, amenity getLatLng와 동일 패턴).
- `detailFields(row, ctx)`: 도로명 / 지번 / 시군구(ctx.regionFullName) / 운영기관 / 전화(tel:) / 기준일자 / 결제수단(chip 줄 별도이지만 here는 라벨/value 형태) — 7 행.
- `renderRichSections(row)`: `<ParkingHoursTable row={row} /> <ParkingFeeGrid row={row} /> <ParkingExtras row={row} />`.
- `inferRowSummary(row)`: `prkcmprt`면수 + `chargeInfo` (카드 meta 한 줄용).

## 7. LIST 페이지

### 7.1 라우트 & 쿼리

`app/(public)/urban/[category]/page.tsx` — server component, `revalidate = 21_600`.

- `generateStaticParams` → `[{ category: 'parking' }]`
- `generateMetadata` → title `${scope} 주차장`, description, canonical
- 진입 가드: `getCategoryDef(category)` 실패 → `notFound()`
- `requiresSidoScope` && !`sido` && !`region` → `redirect('/urban/parking?sido=' + encodeURIComponent('서울'))`

### 7.2 레이아웃

```
breadcrumb: 홈 › 생활편의 › 도시인프라 › 주차장
hero: 🅿️ {scope} 주차장  · "총 N개"
sibling tabs (도시인프라)
desktop:
  [좌 280px 필터 패널 + 광고]  [우 카드 + 페이지네이션]
mobile:
  [필터 시트 트리거 버튼]
  [카드 stack]
  [페이지네이션]
```

### 7.3 필터 컨트롤

| 영역 | 컨트롤 | 컬럼 | URL key |
|---|---|---|---|
| 시도 | select (default 서울) | (주소 prefix) | `sido` |
| 시군구 | listbox + 카운트 | (주소 prefix) | `region` |
| 운영 형태 (chip, top) | 공영 / 민영 | `prkplceSe` | `sub` |
| 요금 | chip | `chargeInfo` | `charge` |
| 주차장 종류 | chip | `prkplceType` | `type` |
| 부가 | ♿장애인전용 / ⏰24시간 | `pwdbsPpkZoneYn` / 시간 | `pwd`, `open24` |
| 검색 | text | `name` contains | `q` |

`sub` chip은 `subFilters` 정의에 등록 (공영/민영/전체), 나머지 advanced는 패널 안 + 모바일 시트에서 제어. URL ↔ 상태 동기화는 amenity와 동일 (search params).

### 7.4 카드

```
[공영] [유료]
○○○ 공영주차장
서울 마포구 ○○로 12
구획 120면 · 30분 500원 · ♿
```

- 첫 줄 배지: `prkplceSe` + `chargeInfo` (+ `prkplceType` 옵션, 좁아지면 hide)
- 본문 라인: 도로명 우선, 없으면 지번
- meta: `prkcmprt`면수 + 무료시 "무료" / 유료시 "기본 {basicTime}분 {basicCharge}원" + 장애인 ♿ + 24시간 ⏰
- 클릭 영역: 카드 전체 → `/urban/parking/${id}`

### 7.5 페이지네이션

`urban-pagination`은 `AmenityPagination`을 fork (per-page 20, prev/next/숫자, URL 쿼리 보존). 상한 페이지는 `Math.ceil(total / 20)`.

### 7.6 빈 결과 / 에러

- `rows.length === 0`: amenity와 동일 카피 ("조건에 맞는 주차장이 없습니다.")
- def lookup 실패: `notFound()`

## 8. DETAIL 페이지

### 8.1 라우트

`app/(public)/urban/[category]/[id]/page.tsx`, `revalidate = 86_400`.

- 가드: def 미존재 / `getById` null → `notFound()`
- `generateStaticParams`: 빈 배열 — 빌드 시 SSG 안 함, 첫 hit에 ISR 생성
- `generateMetadata`: title/description/canonical(`/urban/parking/${id}`)

### 8.2 데이터 로딩 (병렬)

```ts
const row = await def.getById(itemId);
if (!row) notFound();

// rdnmadr/lnmadr prefix → sigunguCode 해석 (lib/urban/region-from-address.ts)
const sigunguCode = resolveSigunguFromAddress(row.rdnmadr ?? row.lnmadr ?? row.address);

const [region, coord] = await Promise.all([
  sigunguCode ? getSigunguByCode(sigunguCode) : Promise.resolve(null),
  def.getLatLng(itemId),
]);

const emptyMixed = { convenience: [], mart: [], cafe: [], market: [] };
const emptyList = { rows: [], total: 0, page: 1, perPage: 0, totalPages: 0 };

const [apts, mixed, sameCat, others] = await Promise.all([
  coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([]),
  coord ? getMixedNearbyForDetail('parking', coord.lat, coord.lng) : Promise.resolve(emptyMixed),
  coord ? getSameCategoryNearbyUrban('parking', coord.lat, coord.lng, itemId) : Promise.resolve([]),
  sigunguCode ? def.getList({ sigunguCode }, 1) : Promise.resolve(emptyList),
]);
```

`resolveSigunguFromAddress`는 `lib/region`의 시도+시군구 카탈로그를 prefix 매칭해 sigunguCode를 돌려준다. 매칭 실패 시 null — sidebar/시군구 표시는 skip.

### 8.3 섹션 구성 (렌더 순서)

| # | 컴포넌트 | 내용 | 표시 조건 |
|---|---|---|---|
| 1 | breadcrumb | 홈 › 생활편의 › 도시인프라 › 주차장 › {region} › {name} | 항상 |
| 2 | `<UrbanHero />` | 🅿️ + 이름 / 배지(공영·유료·종류·♿) / 주소 / meta(구획·단속·24시간) | 항상 |
| 3 | `<UrbanInfo />` | 기본정보 grid (`def.detailFields`) | 항상 |
| 4 | `<ParkingHoursTable />` | 평일/토/공휴일 3행 + operDay 칩 | hours 컬럼 1개 이상 |
| 5 | `<ParkingFeeGrid />` | 무료시 단일 카드 / 유료시 기본·추가·일주차·월정기 grid (2×2 데스크탑, 1열 모바일) | 항상 (요금 컬럼 전부 null + chargeInfo null → "요금 정보 없음") |
| 6 | `<ParkingExtras />` | ♿단속 배지 줄 + spcmnt 본문 (120자+ expand) | spcmnt 또는 부가 컬럼 1개 이상 |
| 7 | `<NaverMap />` | 지도 + 마커 | coord 존재 |
| 8 | `<NearbyApartments />` | 1km 아파트 + 실거래가 | coord & 결과 ≥ 1 |
| 9 | `<NearbyAmenitiesMixed />` | 편의점/마트/카페/시장 mixed | coord |
| 10 | `<UrbanSameCategoryNearby />` | 1km 다른 주차장 최대 6 | coord & 결과 ≥ 1 |
| 11 | sidebar | 같은 시군구 다른 주차장 4건 + sibling 안내 | desktop only — mobile은 main 끝에 stack |

### 8.4 모바일 stack 순서

데스크탑 main 1열 + sidebar를 그대로 vertical stack (1 → 11). Hero 배지는 `flex-wrap`, hours 표는 2열 유지 (구분 + 시간), 요금 grid는 1열.

### 8.5 데이터 충돌·결손 정책

| 케이스 | 처리 |
|---|---|
| location null | 지도/주변* 모두 미렌더, "위치 정보가 등록되어 있지 않습니다" 단일 안내 카드 |
| weekday/sat/holiday hours 전부 null | hours-table 미렌더, Hero에 "운영시간 미상" 칩 |
| 요금 컬럼 전부 null & chargeInfo null | fee-grid → "요금 정보 없음" 단일 카드 |
| `chargeInfo='무료'` 면서 `basicCharge` 값 존재 | `chargeInfo` 우선 → "무료" 표시 (충돌 spcmnt에 노출되는 경우 있음) |
| `spcmnt` 빈 문자열/null | extras 본문 미렌더 (배지 줄만 남음) |
| `prkcmprt = 0` 또는 null | "구획수 미상" 표기 |
| 미존재 id | `notFound()` |

## 9. 메뉴 / 메타 / 사이트맵

### 9.1 life-menu 업데이트

`app/(public)/_components/life-menu.ts`:

```ts
{
  slug: 'urban',
  label: '도시인프라',
  intro: '공원·충전소·주차장 — 동네 인프라 한눈에.',
  items: [
    { label: '주차장', href: '/urban/parking', live: true },
    { label: '공원',   href: '/urban/park',    live: false },
    { label: '충전소', href: '/urban/charger', live: false },
  ],
}
```

- 기존 `parking: soon=true`는 제거 (데이터 적재 완료). park/charger 모두 데이터는 있고 페이지만 미구축 → `live: false` 만 (SoonModal 동작), `soon` 배지 없음 (`LifeSubItem.soon` 주석상 "데이터 자체가 없는 항목").
- `LIFE_ITEM_EMOJI`는 그대로 (`주차장: 🅿️` 등 매핑 유지).

### 9.2 sibling 탭

`getSiblingTabs('/urban/parking')` 호출이 자동으로 도시인프라 그룹 형제 탭을 반환. LIST·DETAIL 양쪽에 `<SiblingTabs currentHref="/urban/parking" />` 마운트.

### 9.3 그룹 허브

`/life/urban` 그룹 hub는 기존 코드가 LIFE_GROUPS를 그대로 읽으므로 자동 반영. 공원·충전소는 SoonModal로 동작.

### 9.4 sitemap

`app/sitemap.ts`에 추가:
- `/urban/parking` (priority 0.7)
- `/urban/parking?sido=서울`…(17개 sido variant, priority 0.6)

DETAIL row 13만+는 본 spec 비범위.

## 10. 테스트 전략

### 10.1 단위 (Vitest)

- `lib/urban/adapters/parking.test.ts`
  - 24시간 helper (`isOpen24` from hhmm pair)
  - sido prefix 매칭 (`서울` → `rdnmadr LIKE '서울특별시%'`)
  - fee normalize: `chargeInfo='무료'` 우선 → fee-grid 무료 카드
  - filter SQL where 빌더 (각 advanced 필터 조합 3-4건)
- `lib/urban/category.test.ts`
  - slug guard, registry lookup
- `app/(public)/_components/life-menu.test.ts` 갱신
  - urban.items 3개, parking live, charger soon

### 10.2 E2E (Playwright, `tests/e2e/`)

- `urban-parking-list.spec.ts`
  - `/urban/parking` 진입 시 `?sido=서울` redirect
  - region 클릭 → URL 동기화 + 카드 갱신
  - 운영 형태 chip 클릭 → URL `sub` + 결과 필터
  - 빈 결과 케이스 (`q=zzzzzzz`) 카피 확인
- `urban-parking-detail.spec.ts`
  - 카드 클릭 → DETAIL 진입
  - Hero h1·배지 가시성
  - hours-table 3행 렌더
  - fee-grid 4칸(또는 무료 카드)
  - NaverMap mount (시드 row 좌표 보장)
- `urban-parking-mobile.spec.ts` (chromium-mobile)
  - 필터 시트 드로어 open/close
  - 카드 stacking (gap 확인)
  - Hero badges wrap

### 10.3 시드

기존 e2e 시드(`tests/e2e/seed.ts`)에 parking 3-4건 추가 (좌표 + 컬럼 다양화: 무료 1, 유료 1, 24시간 1, 장애인전용 1).

## 11. 단계별 구현 순서 (참고 — 본 spec은 설계만)

본 spec 승인 후 `docs/superpowers/plans/2026-05-29-urban-parking-list-detail.md`에서 태스크 분해 예정.

대략적 단계:
1. `lib/urban/category.ts` + `parkingDef` 기본 골격 (테스트 우선)
2. LIST 페이지 + 카드/필터 panel
3. 모바일 필터 시트
4. DETAIL 페이지 hero/info + 운영시간 표
5. 요금 그리드 + 부대정보
6. 지도/주변 아파트/주변 상권 혼합/주변 주차장
7. 사이드바
8. life-menu 갱신 + sibling 탭 결선
9. sitemap + metadata + 시드 갱신
10. E2E

## 12. 부록: 24시간 판정 규칙

`isOpen24Hours(weekdayOpen, weekdayClose, satOpen, satClose, holidayOpen, holidayClose)`:
- 모든 6개 값이 `('0000', '2400')` 또는 `(null, null)` 중 적어도 평일·토·공휴일 모두 `0000-2400`이면 true.
- LIST advanced 필터는 보수적으로 평일 0000-2400만 충족하면 true로 표시.
- DETAIL `<ParkingHoursTable />`에서는 각 행마다 0000-2400이면 "24시간 운영" 라벨로 치환.

## 13. 비결정 사항 (구현 단계에서 결정)

- 카드 meta 라인의 우선순위 (구획·요금·24시간 ⏰ 어느 것부터 자를지)
- 사이드바 광고 영역 유지 여부 (amenity는 유지 — 도시인프라도 동일하게 유지 추천)
- `urban-detail-sidebar`의 "공원·충전소 곧 출시" 안내 카드 노출 여부 (Soon UX 일관성)
