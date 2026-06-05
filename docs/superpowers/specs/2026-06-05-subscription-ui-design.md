# 청약 List·Detail 화면 설계 (Subscription UI)

> 작성일 2026-06-05. 수집된 `SubscriptionNotice`/`SubscriptionUnit` 데이터를 활용한 청약 목록·상세 화면. 실거래가(`/list`, `/apt/[id]`) 화면과 시각적·구조적 통일을 목표로 한다.

## 목표

청약/분양 공고 데이터를 풍부하게 노출하는 목록·상세 화면을 추가하고, 상단 메뉴를 `홈 · 실거래가 · 청약 · 생활편의` 순으로 재정렬하여 `청약`을 라이브 링크로 전환한다. 상세 화면에는 다른 상세 화면과 동일하게 지도·주변 실거래가·주변 편의시설을 포함한다. **모바일에서 한글 글자단위 세로 줄바꿈과 가로 오버플로우가 발생하지 않도록 보장한다.**

## 데이터 현황 (운영 DB, 2026-06-05 수집 중)

- `SubscriptionNotice` 761건+ (apt 런 수집 진행 중 → 추가 예정), `SubscriptionUnit` 2,856건+, 좌표 보유 496건.
- 유형별: 임의공급 572 · 공공·민간임대 168 · 오피스텔·도시형 18 · LH 사전청약 3 (+ 아파트/무순위 수집 중).
- 대부분 공고는 접수 마감 상태(현재 접수중 ~9건). → 목록은 **전체 노출 + 상태 배지** 방식.

## 라우트 & 메뉴

- 목록: `/subscription`
- 상세: `/subscription/[id]`
- 메뉴(`nav.tsx`, `mobile-drawer.tsx`): 순서 `홈 · 실거래가 · 청약 · 생활편의`. `청약`의 `Soon` 배지 제거 → `/subscription` 라이브 `Link`.

## 데이터 레이어 — `lib/subscription.ts`

### 유형 라벨
6종 카테고리 → 한글 라벨/표시순서 매핑.

| Category | 라벨 |
|---|---|
| APT | 아파트 |
| OFFICETEL_ETC | 오피스텔·도시형 |
| REMNANT | 무순위·잔여 |
| PUB_PRIV_RENT | 공공·민간임대 |
| ARBITRARY | 임의공급 |
| LH_PRESUB | LH 사전청약 |

### 상태 도출
`deriveStatus(receiptBegin, receiptEnd, today)`:
- `receiptBegin`이 미래 → `예정`
- `today`가 `[receiptBegin, receiptEnd]` 구간 → `접수중`
- `receiptEnd`가 과거 → `마감`
- 날짜 누락 시 → `마감`(보수적). 가능하면 D-day(접수중: 마감까지, 예정: 시작까지)도 계산.

상태 enum: `OPEN | UPCOMING | CLOSED` (라벨 `접수중/예정/마감`).

### 조회 함수
- `getSubscriptionList({ categories?, sido?, status?, sort, page })` → `{ rows, total, page, perPage }`.
  - 카드 집계를 한 쿼리에 포함: `totalSupply`, 분양가 범위(units `topAmount` min~max, null 제외), 전용면적 범위(units `area` min~max), 주택형 수(units count).
  - 정렬: `recent`(기본, `receiptEnd` DESC NULLS LAST → `noticeDate` DESC), `notice`(`noticeDate` DESC).
  - 상태 필터: `deriveStatus` 로직을 SQL 날짜 비교로 표현.
  - 페이지 크기 20.
- `getSubscriptionById(id)` → notice + units(전용면적 ASC). 없으면 null.
- `getSubscriptionLatLng(id)` → `{ lat, lng } | null` (`ST_Y/ST_X(location)`).

### 주변 데이터 (재사용)
- 주변 실거래가: `getNearbyApartments(lat, lng)` (`lib/amenity/nearby.ts`) → `NearbyApartment[]`.
- 주변 편의시설: `getNearbyInfra(lat, lng, { includeChildcare: true })` → `InfraCategory[]`.

## 목록 페이지 `/subscription` (실거래가 `/list` 미러)

구조: 브레드크럼 → 헤더 카드 → 모바일 필터 시트 → 2컬럼(280px 필터 사이드바 + 본문 목록·페이지네이션). `revalidate = 300`.

### 필터 (`subscription-filter-panel`, `subscription-mobile-filter-sheet`)
- 유형: 6칩 다중 선택 (`?category=apt,opt` CSV).
- 지역: 시도 드롭다운 (`getSidoList()` 재사용, `?sido=`).
- 상태: 전체/접수중/예정/마감 (`?status=open|upcoming|closed`).
- 정렬: 접수마감일/공고일 (`?sort=recent|notice`).

URL 쿼리 기반(서버 컴포넌트), 필터 변경 시 `router.push`. `/list` 필터 패널의 상호작용·스타일을 따른다.

### 카드 (`subscription-card`)
표시: 공고명 · 유형 배지 · 지역(`regionName`) · **상태 배지(접수중/예정/마감 + D-day)** · 접수기간(`receiptBegin~receiptEnd`) · 총공급세대 · 분양가 범위 · 주택형 수. 클릭 → `/subscription/[id]`.

## 상세 페이지 `/subscription/[id]` (실거래가 `/apt/[id]` 2컬럼 미러)

`revalidate = 21600`. `generateMetadata`로 title/description 구성.

구조: Hero → 2컬럼(본문 + 320px 사이드바).

### Hero (`subscription-hero`)
공고명 · 유형 배지 · 지역 · 상태/D-day · 시행사(`developer`). (`constructor`는 원천 데이터가 항상 null이라 미노출.)

### 본문 섹션
1. **공고 개요 + 일정 타임라인** (`schedule-timeline`): 공고일 → 접수시작 → 접수마감 → 당첨발표 → 계약(시작~종료) → 입주예정(`moveInYm`). 날짜 없는 단계는 `-`/숨김.
2. **주택형별 공급 테이블** (`unit-supply-table`): 주택형 · 전용면적(평 환산, `formatPyeong`) · 일반공급 · 특별공급 · 분양가(`topAmount`, `formatBillion`/만원). **모바일 카드 리스트 + 데스크톱 테이블 이중 렌더**(아래 모바일 가드 참조).
3. **지도** (`NaverMap`): 좌표 있을 때만.
4. **주변 실거래가**: 좌표 있을 때만. `getNearbyApartments` → `NearbyApartments` 컴포넌트.
5. **주변 편의시설**: 좌표 있을 때만. `getNearbyInfra` → `NearbyInfra` 컴포넌트.

좌표 없는 공고(LH·미지오코딩): 3~5번 섹션 숨김 + "위치 정보가 없어 주변 정보를 제공하지 않습니다" 한 줄 안내.

### 사이드바 (`subscription-sidebar`, 320px)
핵심 정보(총공급·접수기간·당첨발표·입주예정) · 공고 원문 링크(청약홈 `noticeUrl` / LH `homepage`, 있을 때만) · 문의 `tel` · 출처 배지(청약홈/LH).

## 모바일 & 오버플로우 가드 (필수 제약)

코드베이스의 기존 패턴을 따른다. 모든 신규 컴포넌트는 다음을 준수한다.

1. **넓은 테이블**: 데스크톱 `<table className="hidden w-full sm:table">` + 모바일 카드 리스트 이중 렌더 (`unified-transaction-table.tsx` 방식). 또는 단일 테이블이면 `overflow-x-auto` 래퍼로 감싼다. 테이블이 절대 뷰포트를 가로로 밀어내지 않게 한다.
2. **긴 텍스트(공고명·주소)**: 부모 flex 컨테이너에 `min-w-0`, 텍스트에 `truncate`(1줄) 적용. 한글이 글자단위로 세로로 쌓이는 현상은 부모가 `min-w-0` 없이 줄어들 때 발생하므로 flex 자식에는 항상 `min-w-0`.
3. **배지·라벨·수치(상태 배지, 분양가, D-day 등)**: `whitespace-nowrap`으로 글자단위 줄바꿈 방지.
4. **긴 한국어 문장 블록**: `break-keep`(word-level)으로 단어 중간 줄바꿈 방지.
5. **칩/탭 가로 줄(유형 칩, 일정 등)**: `overflow-x-auto` + 자식 `shrink-0 whitespace-nowrap` (`nearby-infra.tsx` 탭 방식).
6. **고정 너비 금지**: 콘텐츠를 좁게 강제하는 고정 px 너비 컬럼을 두지 않는다.
7. **2컬럼 레이아웃**: `lg:` 브레이크포인트에서 2컬럼, 그 이하 1컬럼 (`/apt/[id]` 동일). 사이드바는 모바일에서 본문 아래로.

검증: 구현 후 360px 폭(모바일)에서 목록·상세를 확인하여 (a) 가로 스크롤바가 페이지 전체에 생기지 않고, (b) 어떤 텍스트도 글자단위로 세로로 쌓이지 않음을 확인한다.

## 공용 컴포넌트 재사용

`components/ui/*`: `Badge`, `Chip`, `Card`, `Pagination`(또는 `/list`의 `pagination-nav`), `NaverMap`, `NearbyInfra`, `NearbyApartments`. `lib/region`(`getSidoList`), `lib/format`(`formatBillion`/`formatPyeong`/`formatDate`/`sqmToPyeong`).

## 테스트 (vitest, 기존 스타일)

`tests/subscription/`:
- `deriveStatus` 경계값: 오늘 기준 예정/접수중/마감, 날짜 누락, D-day 계산.
- 유형 라벨 매핑 완전성(6종).
- 카드 집계 포맷: 분양가 범위(단일값/범위/null), 전용면적 범위.
- (가능하면) 목록 쿼리 필터/정렬 — 통합 테스트는 DB 의존이므로 순수 함수 위주로.

## 파일 구조

**생성**
- `lib/subscription.ts` — 데이터 레이어·타입·라벨·`deriveStatus`.
- `app/(public)/subscription/page.tsx` — 목록.
- `app/(public)/subscription/_components/`: `subscription-filter-panel.tsx`, `subscription-mobile-filter-sheet.tsx`, `subscription-list.tsx`, `subscription-card.tsx`.
- `app/(public)/subscription/[id]/page.tsx` — 상세.
- `app/(public)/subscription/[id]/_components/`: `subscription-hero.tsx`, `schedule-timeline.tsx`, `unit-supply-table.tsx`, `subscription-sidebar.tsx`.
- `tests/subscription/*.test.ts`.

**수정**
- `app/(public)/_components/nav.tsx` — 메뉴 재정렬 + 청약 라이브 링크.
- `app/(public)/_components/mobile-drawer.tsx` — 동일.

## 비범위 (YAGNI)

- 주소→`Region` FK 매칭(추후 과제, 원본 코드는 보존됨).
- 알림/관심공고/캘린더 연동.
- LH 좌표 수집(원천 데이터에 단지 지번주소 없음).
