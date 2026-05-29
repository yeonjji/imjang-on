# 어린이집 LIST/DETAIL 설계

**날짜**: 2026-05-29
**범위**: `/childcare` 라우트 신설 (전국 LIST · 시군구 LIST · 시군구별 grid · DETAIL) + `lib/childcare.ts` 헬퍼 + `school` DETAIL에 "주변 어린이집" 카드 추가
**선행 작업**: `2026-05-28-childcare-ingest-design.md` (`Childcare` 테이블·`cpmsapi030` 수집 — 완료)
**디자인 source of truth**: 어린이집용 HTML 시안은 없음 → `html/school-list.html`, `html/school-detail.html` 패턴을 그대로 차용. 어린이집 고유 카드(연령별·입소대기·교직원)는 `html/detail.html`의 카드 톤(`Card` 컴포넌트, `--color-blue-dark`/`--color-soft`/`--color-line`)을 따른다.

---

## 목표

`2026-05-28-childcare-ingest-design.md`로 적재된 `Childcare` 테이블을 사용자에게 노출한다. 학교(`/school`) 라우트와 자매 관계로, education 그룹 안에서 동일한 UX·라우팅 패턴을 갖는다. life-menu의 어린이집 항목을 `live: true`로 전환한다.

### 비-목표
- 어린이집 → 매물 상세에서 "주변 어린이집" 표시 (별도 PR — 이번에 lib만 노출, 호출은 추후)
- 어린이집 비교 / 즐겨찾기
- 통학 거리 계산
- 시안 신규 제작 — 학교 시안 재사용

---

## 라우팅

학교 패턴을 1:1 적용한다.

| Route | 역할 | revalidate |
|---|---|---|
| `/childcare` | 전국 LIST. sido 필터 + sub-filter(유형). "지역별 찾기" 링크. | `21_600` (6h) |
| `/childcare/regions` | 시군구별 grid (count 포함) | `21_600` |
| `/childcare/[sigunguCode]` | 시군구 LIST. sub-filter(유형) + 폐지·휴지 토글. | `21_600` |
| `/childcare/[sigunguCode]/[id]` | DETAIL. Hero·기본정보·시설·연령별·입소대기·교직원·지도·주변. | `86_400` (24h) |

- 모든 라우트는 `app/(public)` 그룹 — 헤더·푸터 자동 적용.
- `[sigunguCode]`는 `getSigunguByCode` 검증. 미존재 또는 `Childcare.sigunguCode`와 불일치 시 `notFound()`.
- DETAIL의 `[id]`는 `BigInt(id)` 캐스팅 후 row의 `sigunguCode`와 URL의 `sigunguCode`가 다르면 `notFound()` (학교 detail과 동일 가드).

---

## 라이브러리: `lib/childcare.ts`

`lib/school.ts`와 동일한 외형. 함수 시그니처:

```ts
export type ChildcareTypeSlug =
  | 'all'
  | 'public'        // 국공립
  | 'legalwelfare'  // 사회복지법인
  | 'legalorg'      // 법인·단체등
  | 'private'       // 민간
  | 'home'          // 가정
  | 'coop'          // 부모협동
  | 'workplace';    // 직장

export interface ChildcareFilter {
  sido?: string;
  sigunguCode?: string;
  type?: ChildcareTypeSlug;
  q?: string;
  /** 'true'면 운영중지(휴지)·폐지 포함, 미지정·기타는 정상·재개만 */
  includeInactive?: string;
}

export interface ChildcareListItem {
  id: bigint;
  name: string;
  address: string;
  sigunguCode: string | null;
  sigungu: string | null;
  crType: string | null;
  status: string | null;
  capacity: number | null;
  currentCount: number | null;
}

export interface ChildcareDetailItem extends ChildcareListItem {
  vehicleOp: string | null;
  services: string | null;
  zipcode: string | null;
  sido: string | null;
  tel: string | null;
  fax: string | null;
  homepage: string | null;
  repName: string | null;
  roomCount: number | null;
  roomSize: number | null;
  playgroundCount: number | null;
  cctvCount: number | null;
  staffCount: number | null;
  confirmDate: Date | null;
  // 연령별 반·아동수·대기
  classCnt00: number | null; /* …Tot까지 11개 */
  childCnt00: number | null; /* …Tot까지 11개 */
  waitCnt00:  number | null; /* …Tot까지 8개 */
  // 교직원
  emRoleDirector:    number | null; /* …Tot까지 10개 */
  emTenure0y:        number | null; /* …6y까지 5개 */
}

export interface ChildcareListResult {
  rows: ChildcareListItem[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface ChildcareTypeCount {
  total: number;
  byType: Record<ChildcareTypeSlug, number>;
}

export function getChildcareList(filter: ChildcareFilter, page: number): Promise<ChildcareListResult>;
export function getChildcareById(id: bigint): Promise<ChildcareDetailItem | null>;
export function getChildcareLatLng(id: bigint): Promise<{ lat: number; lng: number } | null>;
export function getChildcareCountsBySigungu(filter?: { sido?: string }): Promise<Map<string, number>>;
export function getChildcareTypeCounts(sigunguCode?: string): Promise<ChildcareTypeCount>;
export function getChildcareTypeLabel(slug: ChildcareTypeSlug): string;
export function getChildcareTypeFromDB(crType: string | null): ChildcareTypeSlug;
```

### 정원·현원 처리

- `currentCount === null` 또는 `capacity === null|0` → 충원율 표시 안 함 (`'-'`).
- 충원율 = `Math.round(currentCount / capacity * 100)`. 100 초과(과원)도 그대로 표시.

### 페이지네이션

- `perPage = 20` (학교와 동일).
- `prisma.childcare.findMany` + `select` 화이트리스트 (BigInt JSON 직렬화 방지를 위해 client component 경계에서 `String()` 변환).

### 운영상태 필터 기본값

- `includeInactive !== 'true'` → `WHERE status IN ('정상', '재개', NULL)` (NULL은 API가 status 누락한 신규 등록 케이스 — 보수적으로 노출).
- `includeInactive === 'true'` → status 필터 없음.

### 유형 슬러그 ↔ DB `crType` 매핑

API의 `crtypename`은 한국어 문자열. 슬러그 매핑:

| Slug | crType 매칭값 |
|---|---|
| `public`       | `국공립` |
| `legalwelfare` | `사회복지법인` |
| `legalorg`     | `법인·단체등` |
| `private`      | `민간` |
| `home`         | `가정` |
| `coop`         | `협동` (API 실데이터 기준 — 명세상 "부모협동"이나 응답은 "협동"으로만 옴) |
| `workplace`    | `직장` |

쿼리는 정확 일치(`equals`). 미매칭 row는 `getChildcareTypeFromDB`에서 `'all'`로 떨어지나, sub-filter 적용 시 비노출.

---

## 페이지 컴포넌트

`app/(public)/childcare/_components/`에 학교 컴포넌트와 1:1 대응으로 생성:

```
childcare-card.tsx            ChildcareListItem 1건. 학교 카드와 동일 톤. capacity/currentCount 표시, 폐지 배지.
childcare-filter-panel.tsx    sido(전국 LIST만) + region(시군구) + type + includeInactive 토글 + q.
childcare-mobile-filter-sheet.tsx  모바일 시트 (school과 동일 패턴).
childcare-pagination.tsx      페이지네이션 (school-pagination 카피).
childcare-hero.tsx            DETAIL Hero — 이름, 유형 배지, 운영상태 배지, 충원율 게이지.
childcare-info.tsx            DETAIL 기본정보 그리드 (주소·전화·팩스·홈페이지·인가일·통학차량).
childcare-facility.tsx        DETAIL 시설 카드 (보육실·놀이터·CCTV·교직원수).
childcare-age-breakdown.tsx   DETAIL 연령별 반/아동수 표 (만0~5세 + 영아혼합·영유아혼합·유아혼합·특수 + 합계).
childcare-wait-list.tsx       DETAIL 입소대기 (연령별).
childcare-staff.tsx           DETAIL 교직원 (직역별 / 근속년수별).
childcare-detail-sidebar.tsx  같은 시군구 내 다른 어린이집 4건 (school-detail-sidebar 카피).
```

> 8~10개 컴포넌트지만 학교 컴포넌트 카피 + 어린이집 고유 4개(`hero`/`age-breakdown`/`wait-list`/`staff`) 추가 형태. card·filter·pagination·sidebar는 거의 그대로.

### DETAIL 카드 7개 구성 (school detail 레이아웃 + 어린이집 고유 카드)

```
<main>
  <Hero>                              ← 이름·유형·상태·충원율
  <Info>                              ← 기본정보 (주소·전화·홈페이지·인가일·통학차량)
  <Facility>                          ← 보육실·놀이터·CCTV·교직원수
  <AgeBreakdown>                      ← 연령별 반/아동수 (어린이집 핵심)
  <WaitList>                          ← 입소대기 (전부 0이면 카드 숨김)
  <Staff>                             ← 교직원 (직역·근속년수)
  <Card id="map"><NaverMap /></Card>  ← 좌표 있을 때만
  <NearbyApartments items={apts} />   ← 학교 detail과 공통
  <NearbyAmenities ... />             ← 주변 학교·마트·공원 (학교 detail의 mixed 재사용)
</main>
<aside><ChildcareDetailSidebar /></aside>  ← 같은 시군구 다른 어린이집 4건
```

**카드 노출 규칙**:
- `WaitList`: `waitCntTot` null 또는 0이면 카드 자체 비노출 (대부분 어린이집은 대기 없음).
- `AgeBreakdown`: `classCntTot` 또는 `childCntTot` 중 하나라도 있으면 노출. 둘 다 null이면 "공시 데이터 없음" placeholder.
- `Staff`: `emRoleTot` 있으면 직역, `emTenure0y..6y` 합이 있으면 근속년수. 양쪽 다 없으면 카드 비노출.
- `map`: `getChildcareLatLng`가 null 반환 시 비노출 (학교 detail과 동일).
- `NearbyApartments` / `NearbyAmenities`: 좌표 없으면 비노출.

---

## 학교 DETAIL에 "주변 어린이집" 추가

`app/(public)/school/[sigunguCode]/[id]/page.tsx`의 nearby 영역에 어린이집을 추가한다. 두 가지 방식 중 **B**.

**A. `getSchoolNearbyAmenities`에 `childcare`를 끼움**
- 장점: 한 카드(`NearbyAmenities`) 안에 학교가 가진 모든 주변 카테고리가 모인다.
- 단점: 학교용으로 만든 mixed 카드의 슬롯 구조(`parks/mart/chargers`)를 깨야 함. 다른 학교 detail에서 미사용 분기 발생.

**B. 별도 `NearbyChildcare` 카드 추가** ← 채택
- 학교 detail의 `NearbyAmenities` 바로 위 또는 아래에 별도 카드.
- `lib/amenity/nearby.ts`에 `getNearbyChildcare(lat, lng, radiusMeters=1000, limit=5)` 추가 — `Childcare` 테이블에 `ST_DWithin`. 정상·재개만.
- school detail 페이지의 `Promise.all`에 한 줄 추가.
- 어린이집 detail에서도 동일 카드 재사용(같은 컴포넌트, 라벨만 다름 → "근처 어린이집"). 단 어린이집 detail에서는 자기 자신 제외.

`NearbyChildcare` 컴포넌트:
```
근처 어린이집 (1km)
- 천사어린이집 · 법인·단체등 · 정원 61
- 행복가정어린이집 · 가정 · 정원 18
...
```
링크는 `/childcare/[sigunguCode]/[id]`.

---

## sibling tabs (education 그룹)

`/childcare`·`/school` 양쪽에서 그룹 내 자매 라우트를 노출.

- `app/(public)/_components/sibling-tabs.tsx` (이미 존재, life-group-hub PR에서 도입)는 `LIFE_GROUPS`에서 현재 라우트가 속한 그룹을 찾아 형제 항목을 렌더링한다.
- 어린이집 LIST를 `live: true`로 전환하면 학교 LIST에서도 자동으로 어린이집 탭이 노출된다 (역방향 동일).
- `currentHref="/childcare"` 또는 `currentHref="/school"`은 페이지 component에서 전달.

---

## SEO / 메타데이터

학교와 동일한 패턴.

| Route | title | description |
|---|---|---|
| `/childcare` | `어린이집찾기 — 전국 국공립·민간·가정` | `지역·유형으로 어린이집을 찾고, 주변 아파트 실거래가까지 확인하세요.` |
| `/childcare/regions` | `지역별 어린이집` | `시·도와 시군구별 어린이집 분포를 한눈에.` |
| `/childcare/[sigunguCode]` | `${region.fullName} 어린이집 — 국공립·민간·가정` | `${region.fullName}의 어린이집 목록과 위치, 주변 아파트 실거래가.` |
| `/childcare/[sigunguCode]/[id]` | `${name} — ${crType} 정원 ${capacity}` | `${name}(${address})의 보육정보·정원·교직원·주변 아파트.` |

`alternates.canonical`은 query string 제외 경로.

---

## 데이터 무결성 / 엣지케이스

| 케이스 | 처리 |
|---|---|
| `Childcare.location IS NULL` | DETAIL: 지도·NearbyApartments·NearbyAmenities 카드 비노출. LIST 정렬에서 영향 없음. |
| `crType` API에 없음 (NULL) | 카드 배지 비노출, sub-filter "전체"에만 포함. |
| `status` NULL | 배지 `정상` 디폴트 (API 누락 케이스 — 신규 등록 후 status 미반영) |
| `capacity = 0` 또는 NULL | 충원율·정원 표기 `-`. |
| 폐지(`status='폐지'`)/휴지(`status='휴지'`) | LIST 기본 제외. DETAIL은 직접 URL 접근 가능(SEO 가치 보존), Hero 배지 `폐지`/`휴지` 표시 + Info 상단 안내 배너. |
| `sigunguCode` 와 URL 불일치 | `notFound()` |
| `BigInt` 직렬화 | client component 경계에서 `String(id)` 변환 (school detail 패턴 동일). |
| 매우 긴 이름·서비스 문자열 | Tailwind `truncate` + Hero는 `line-clamp-2`. |

---

## 모바일 레이아웃

LIST·필터·sidebar·Hero·Info·Facility는 학교 페이지 패턴을 그대로 차용하므로 자동 대응(`grid-cols-1 ... lg:grid-cols-[1fr_320px]`, `md:block` aside, `mobile-filter-sheet`). 아래는 어린이집 고유 카드의 모바일 처리.

### 데이터-dense 카드 (`AgeBreakdown` / `WaitList` / `Staff`)

데스크톱은 가로 표, **모바일(`< md`)은 세로 stack + 아코디언 그룹** 형태로 재배열한다.

- **`AgeBreakdown`**
  - 데스크톱: `<table>` 행=만0~5세·혼합·특수·합계, 열=반수·아동수
  - 모바일: 각 연령 그룹이 카드 행이 되고, 한 행 안에 「만 0세 · 반 2개 · 아동 12명」 형식. 헤더(연령) tap → 펼쳐서 상세(반수·아동수 raw 값) 노출은 불필요(이미 한 행에 다 보임). 아코디언은 "혼합·특수" 묶음(잘 안 쓰이는 그룹)에만 적용 — 기본은 접힌 상태.
- **`WaitList`**
  - 카드 자체가 `waitCntTot===0`이면 비노출(데스크톱·모바일 공통).
  - 모바일: "총 18명 대기" 한 줄 + 아코디언 헤더 → 펼치면 연령별 리스트(만0세 0명 / 만1세 4명 ...).
- **`Staff`**
  - 데스크톱: 두 개의 작은 표(직역별 / 근속년수별) 가로 배치
  - 모바일: 두 표를 세로로 쌓고 각각 아코디언. 헤더에 "교직원 13명 · 원장 1·보육교사 4·..." 1줄 요약, 펼치면 전체 직역. 근속년수도 동일 패턴(요약 줄 + 펼침).

### 아코디언 구현 노트
- 신규 컴포넌트(`mobile-accordion-section.tsx`)를 만들거나, 기존 amenity·school detail에 이미 쓰는 패턴(있다면)을 따른다. 없으면 native `<details><summary>` 기반 + Tailwind 스타일링이 가장 가볍다(JS 없이 작동).
- 데스크톱(`md:`)에서는 `details`가 항상 `open` 상태로 보이도록 `[&[open]]:` 또는 `md:[&>summary]:hidden md:[&>div]:!block` 같은 변형 적용.

### 텍스트·여백
- Hero `line-clamp-2`(이미 명시), Card 내부 `text-sm md:text-base`, padding `p-5 md:p-7`.
- 모바일 nav(브레드크럼)는 `truncate` + 마지막 한 줄만 강조.

---

## 데이터 채움률 검증 (구현 직전 1회 — plan Task 0)

`Childcare` 적재가 완료된 후 plan의 첫 task로 컬럼 채움률을 조사한다. 결과에 따라 spec의 카드 비노출 규칙을 한 번 조정한다.

```sql
SELECT
  COUNT(*) AS total,
  COUNT("classCnt00")  AS cls00,  -- 이하 각 개별 연령·근속·대기 컬럼
  COUNT("classCntTot") AS clsTot,
  COUNT("childCntTot") AS chdTot,
  COUNT("waitCntTot")  AS wait_with,
  COUNT(*) FILTER (WHERE "waitCntTot" > 0) AS wait_pos,
  COUNT("emTenure0y")  AS tenure_with,
  COUNT("emRoleTot")   AS role_with,
  COUNT(location)      AS with_loc
FROM "Childcare";
```

**조정 규칙**:
- 개별 연령 셀(`classCnt00` 등) 비율 < 20% → `AgeBreakdown`은 Tot/합계만 표시, 개별 연령은 카드에서 제거.
- `tenure_with` 비율 < 20% → `Staff`의 근속년수 섹션 제거(직역만 노출).
- `wait_pos / total` < 5% → `WaitList`는 기본적으로 거의 비노출 — UI엔 영향 없으나 카드 코드는 그대로 유지(렌더 시 `null|0` 체크).

이 단계는 PR 본격 코딩 전 ~수 분이면 끝나며, 결과는 plan의 Task 0 로그에 남긴다.

---

## life-menu 활성화

`app/(public)/_components/life-menu.ts:27`:

```diff
- { label: '어린이집', href: '/childcare', live: false, soon: true },
+ { label: '어린이집', href: '/childcare', live: true },
```

이 단일 변경으로 모바일 드로어·`/life` 허브·sibling-tabs·desktop nav가 모두 라이브로 전환된다.

---

## 테스트

`tests/lib/childcare.test.ts`:

- `getChildcareTypeFromDB`: `'국공립'→'public'`, `'민간'→'private'`, `null→'all'` 등 7개 + null.
- `getChildcareList`:
  - 운영중지 기본 제외 (`includeInactive`가 falsy면 `status='폐지'` row가 결과에 없다).
  - `includeInactive='true'`이면 폐지·휴지 포함.
  - `type` 필터가 정확 일치 매핑을 사용.
  - `q` 텍스트 검색이 name·address ILIKE.
- `getChildcareTypeCounts`: 7종 + `total`의 합이 일치.

`tests/lib/childcare/seed.ts` (테스트 fixture):
- 7가지 유형 한 row씩 + 폐지 1건 + 휴지 1건 = 9 row, 모두 단일 sigunguCode(`11710`).

`tests/e2e/childcare.spec.ts`:
- `/childcare` 진입 → 카드 ≥ 1, 어린이집 탭이 sibling-tabs에 표시.
- `/childcare?type=public` → 카드 1건 + 유형 배지 `국공립`.
- `/childcare/11710` → 시군구명 노출.
- `/childcare/11710/[seedId]` → Hero·Info·AgeBreakdown(또는 placeholder) 노출, h1에 이름.
- `/school/11710/[schoolSeedId]` → "근처 어린이집" 카드 노출 (반경 내 시드가 있을 때).

E2E 시드는 `tests/e2e/seed.ts` 패턴을 따른다 (sigunguCode는 명시 — `Childcare.sigunguCode`는 GENERATED column 아님, 일반 VARCHAR).

---

## 구현 순서 (plan에서 task로 풀 항목)

1. `lib/childcare.ts` — 헬퍼 + 단위 테스트 (TDD)
2. `app/(public)/childcare/page.tsx` 전국 LIST + 컴포넌트 (`card`, `filter-panel`, `mobile-filter-sheet`, `pagination`)
3. `app/(public)/childcare/regions/page.tsx` 시군구 grid
4. `app/(public)/childcare/[sigunguCode]/page.tsx` 시군구 LIST
5. `app/(public)/childcare/[sigunguCode]/[id]/page.tsx` DETAIL + 컴포넌트 (`hero`, `info`, `facility`, `age-breakdown`, `wait-list`, `staff`, `detail-sidebar`)
6. `lib/amenity/nearby.ts`에 `getNearbyChildcare` 추가 + 컴포넌트 `nearby-childcare.tsx`
7. school DETAIL에 `<NearbyChildcare>` 추가
8. life-menu `live: true` 전환
9. E2E spec
10. 최종 검증 (tsc, vitest, playwright, lint)

---

## 향후 확장 (이번 범위 밖)

- 매물 상세에서 "주변 어린이집" 카드 (별도 PR — `lib/amenity/nearby.ts` 함수는 이번에 추가, 호출은 다음에)
- 충원율 시각화 강화 (히트맵·차트)
- 인가일 기준 신규 어린이집 정렬·배지
- 운영중지·폐지 어린이집의 "히스토리" 뷰
- 통학 거리(도보 m) 계산 — 학교/어린이집 공통

