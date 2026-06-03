# 아파트 상세 — 거래유형 탭 필터 설계

날짜: 2026-06-03
대상 화면: `/apt/[id]` (아파트 실거래가 상세)

## 배경 / 목표

상세 화면의 두 섹션을 거래유형(전체/매매/전세/월세) 탭으로 필터링할 수 있게 한다.

1. **최근 실거래 내역** — 현재 매매·전세·월세를 유형 구분 없이 한꺼번에 최신순으로 표시. → 탭 추가.
2. **주변 단지 실거래가 비교** — 현재 매매가(큰 글씨) + 전세가(작은 글씨)만 표시. → 탭 추가 + 월세 노출.

### 데이터 가용성 확인 (사전 검증 완료)

- `Transaction.dealType` 으로 모든 거래가 유형 구분되어 저장됨.
- `Property` 모델에 세 유형 모두 비정규화 저장됨:
  - 매매: `saleLastPrice`, `saleAvgPrice12m`
  - 전세: `jeonseLastDeposit`, `jeonseAvgDeposit12m`
  - 월세: `wolseLastDeposit`, `wolseLastRent`, `wolseAvgDeposit12m`, `wolseAvgRent12m`
- 결론: 두 섹션 모두 전체/매매/전세/월세 탭 분리 가능. 주변 단지 비교에서 월세도 표시 가능.

## 결정 사항

| 항목 | 결정 |
|---|---|
| 빈 데이터 처리 (주변단지) | 전 단지(10개) 항상 표시, 해당 유형 데이터 없으면 `-` |
| 전체 탭 표시 (주변단지) | 매매·전세·월세 모두 한 줄에 표시 |
| 주변단지 목록 개수 | 10개 유지 (현행) |
| 건수 표시 (실거래내역) | 선택된 탭의 건수로 갱신 |
| 탭 순서 | 전체 / 매매 / 전세 / 월세 |

## 섹션 1 — 최근 실거래 내역 (탭 필터)

### 데이터 계층

- `lib/transaction.ts`
  - `getUnifiedTransactions(propertyId, { page, perPage, dealType? })` — `dealType?: DealType` 옵션 추가. 전달되면 `where`에 `dealType` 필터 적용, 없으면 전체(현행 동작 유지). `count` 도 동일 조건.
  - `getTransactionCounts` (기존) 재사용 — 유형별 건수 맵 `{ SALE, JEONSE, WOLSE }` 반환. 전체 건수는 합으로 계산.
- `app/(public)/apt/[id]/actions.ts`
  - `fetchUnifiedTxPage(propertyId, page, dealType?)` — `dealType` 인자 추가하여 `getUnifiedTransactions` 에 전달.

### 페이지 (`page.tsx`)

- 유형별 건수 맵을 서버에서 계산해(`getTransactionCounts`) `UnifiedTransactionTable` 에 prop으로 전달.
- 초기 `unified` 조회는 현행대로 전체 1페이지.

### 컴포넌트 (`unified-transaction-table.tsx`)

- 탭 state 추가: `'ALL' | 'SALE' | 'JEONSE' | 'WOLSE'`, 초기값 `ALL`.
- 헤더 `(전체 N건)` → 선택된 탭의 건수로 표시. 건수는 props 카운트 맵에서 읽음(재조회 불필요).
- 탭 전환 시:
  - `page=1` 로 리셋.
  - 서버액션 `fetchUnifiedTxPage(propertyId, 1, dealType)` 호출 (전체 탭은 `dealType` 미전달).
  - rows 교체.
- 페이지네이션 `totalPages` 는 선택 탭 건수 / `PER_PAGE` 기준.
- 표/모바일 카드 마크업, 유형 뱃지, 가격 포맷(`formatPrice`)은 그대로 재사용.
- 탭 UI: 표 위 가로 버튼 그룹.

## 섹션 2 — 주변 단지 실거래가 비교 (탭 필터)

### 데이터 계층 (`lib/nearby.ts`)

- `NearbyProperty` 인터페이스에 추가: `wolseLastDeposit: number | null`, `wolseLastRent: number | null`.
- `getNearbyProperties` 쿼리 SELECT에 `p."wolseLastDeposit"`, `p."wolseLastRent"` 추가.
- 정렬·필터 조건(`txCount12m > 0`, 거리순)·`limit = 10` 은 현행 유지.

### 컴포넌트 (`nearby-price-comparison.tsx`)

- `'use client'` 로 전환 (탭 인터랙션). 데이터는 props로 한 번에 전달(10개, 가벼움) — 추가 서버 호출 없음.
- 탭 state: `'ALL' | 'SALE' | 'JEONSE' | 'WOLSE'`, 초기값 `ALL`.
- 모든 단지(10개)는 모든 탭에서 항상 표시. 데이터 없으면 `-`.
- 탭별 우측 가격 표시:
  - **전체:** `매매 X · 전세 Y · 월세 보Z/월W` (없는 유형은 `-`)
  - **매매:** `saleLastPrice` 또는 `-`
  - **전세:** `jeonseLastDeposit` 또는 `-`
  - **월세:** `보 {wolseLastDeposit} / 월 {wolseLastRent}` 또는 `-`
- 가격 포맷은 기존 `formatBillion` 재사용, 월세 월 임대료는 `toLocaleString('ko-KR')` + `만`.
- 탭 UI: 제목 아래 가로 버튼 그룹.

## 공통

- 탭 UI는 두 섹션 동일 스타일(가로 버튼 그룹). 유형 색상 팔레트(매매=파랑, 전세=초록, 월세=주황) 톤과 어울리게.
- 변경 파일: `lib/transaction.ts`, `lib/nearby.ts`, `app/(public)/apt/[id]/actions.ts`, `app/(public)/apt/[id]/_components/unified-transaction-table.tsx`, `app/(public)/apt/[id]/_components/nearby-price-comparison.tsx`, `app/(public)/apt/[id]/page.tsx`.

## 범위 메모

- 오피스텔/빌라 상세 화면: `UnifiedTransactionTable`·`NearbyPriceComparison`를 공유하므로 두 페이지도 동일하게 탭이 적용됨(의도된 동작). 각 page.tsx에서 `getTransactionCounts`를 추가로 전달.

## 비범위 (Out of scope)

- 평형별 비교(`area-comparison`)·가격 흐름 그래프(`price-charts`)는 변경 없음.
- DB 스키마 변경 없음(필요한 컬럼 모두 존재).

## 검증

- `.env.test`(로컬 docker) 기준으로 확인.
- 빌드 타입체크: `npx tsc --noEmit`.
- 수동: 탭 전환 시 (1) 실거래내역 건수·행 갱신, 페이지 리셋 (2) 주변단지 유형별 가격/`-` 표시 확인.
