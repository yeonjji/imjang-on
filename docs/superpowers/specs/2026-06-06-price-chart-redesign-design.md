# 실거래가 가격 흐름 그래프 개선 설계

작성일: 2026-06-06
대상 화면: 아파트 상세 `app/(public)/apt/[id]` — "가격 흐름 그래프" 섹션 (`#chart`)

## 배경 / 문제

현재 차트(`_components/price-charts.tsx`)는 매매/전세/월세 미니 라인차트 3개를 가로로 나열한다. 축·격자·점이 모두 숨겨져 있고 얇은 선 하나뿐이라 "단조롭고 허접해" 보인다. 동시에 정보도 빈약하다 — 현재가, 변동률, 최고/최저가, 거래량 같은 **숫자가 화면에 없다**.

추가로, 데이터 함수 `getMonthlyChartData`가 **모든 평형을 한데 섞어** 월평균을 내고 있어 작은 평·큰 평이 섞이면 시세가 왜곡된다. 정확한 숫자를 보여주려면 평형 구분이 선행되어야 한다.

## 목표

정보(숫자) + 비주얼 둘 다 끌어올린다. 구체적으로:

1. 큰 그래프 하나 + 매매/전세/월세 **탭 전환** + 하단 3유형 **비교 스트립**
2. 헤더에 풀세트 숫자: 현재가 · 변동률(최근 1년) · 최고가 · 최저가 · 거래건수 · 최근 거래월
3. 그래프에 격자 · y축 금액 눈금 · x축 월 눈금 · 면적 채움(gradient) · 끝점 강조 · 월별 최고~최저 **음영 밴드**
4. **평형 선택칩** 추가 — 그래프 전용. 기본값은 거래 최다 평형
5. 모바일/오버플로우 안전

비목표: 별도 "면적별 실거래 비교" 카드(`area-comparison.tsx`)는 변경하지 않는다. 세 유형 선 겹치기(overlay)는 스케일 차이로 가독성이 나빠 채택하지 않는다.

## 레이아웃 (확정)

단일 `Card` 안에 위→아래로:

```
┌────────────────────────────────────────────┐
│ [84㎡ 134건] [59㎡ 72건] [114㎡ 21건]  ← 평형 선택칩 (가로 스크롤)
│ [매매] [전세] [월세 보증금]            ← 유형 탭
│                                            │
│ 현재 시세  14.8억   ▲ 8.2% 최근 1년       │
│ [최고가 15.2억][최저가 11.0억][거래 37건][최근 2026.03]  ← 칩, flex-wrap
│                                            │
│  15억 ┤··············· (격자)              │
│       │        ╱‾                          │
│  13억 ┤    ╱‾  음영밴드=월최고~최저         │
│  11억 ┤╱‾                                  │
│       └─────────────────────              │
│       '24.06    '25.06    '26.03          │
│  진한 선=월평균 · 옅은 음영=최고~최저       │
│ ─────────────────────────────── (점선 구분)
│ [매매 14.8억 ▲8.2%][전세 7.1억 ▼1.4%][월세 2.0억 ▲3.0%]  ← 비교 스트립
└────────────────────────────────────────────┘
```

- 평형칩 또는 탭 또는 비교 스트립 카드 클릭 → 상단 큰 그래프와 헤더 숫자가 해당 조합으로 즉시 전환 (클라이언트 상태, 재요청 없음)
- 기본 선택: 거래 최다 평형 + 매매
- 비교 스트립의 현재가/변동률은 **현재 선택된 평형 기준**으로 세 유형을 나란히 표시

## 데이터 레이어

`lib/transaction.ts`의 `getMonthlyChartData`를 평형·통계 확장으로 교체(또는 신규 함수 추가).

평형 그룹핑은 기존 `getAreaSummary`와 동일하게 `ROUND(exclusiveArea / 3.3057851239669422)` 평수 기준.

SQL 집계(최근 24개월): `(평수, dealType, month)` 그룹별로
- `avg_value` (SALE=dealAmount, JEONSE/WOLSE=deposit 평균)
- `min_value`, `max_value` (음영 밴드용)
- `count`

반환 구조(클라이언트가 전부 받아 클라이언트에서 전환):

```ts
interface MonthPoint { month: string; avg: number; min: number; max: number; count: number; }
interface AreaSeries {
  pyeong: number;
  totalCount: number;                 // 칩 정렬·표시용
  series: Record<DealType, MonthPoint[]>;  // 월 오름차순
}
type ChartData = AreaSeries[];        // totalCount 내림차순 정렬
```

페이지(`page.tsx`)는 `getMonthlyChartData(propId)` 결과를 그대로 `<PriceCharts data={...} />`로 전달. 데이터량(평형 ~3 × 유형 3 × 24개월)은 작아 한 번에 직렬화해도 무방.

### 파생 헤더 통계 (클라이언트 계산)

선택된 `(평수, dealType)`의 `MonthPoint[]`에서:
- **현재가** = 마지막 달 `avg`
- **변동률** = 마지막 달 vs 약 12개월 전 달의 `avg` 비교 `(now-base)/base`. 12개월치가 없으면 가장 이른 달 기준으로 계산하고 라벨을 `최근 N개월`로 표기
- **최고가/최저가** = 윈도우 내 `max`의 최댓값 / `min`의 최솟값
- **거래건수** = `count` 합

## 컴포넌트 (`_components/price-charts.tsx` 재작성)

`'use client'` 유지. recharts 사용(이미 의존성에 있음, 신규 라이브러리 없음).

- 차트: `ComposedContainer`/`AreaChart` + `Area`(밴드용 min~max는 두 `Area` 또는 `Area` with `dataKey` 범위), `Line`(평균), `CartesianGrid`(가로선만), `XAxis`/`YAxis`(눈금 노출), `Tooltip`, 끝점 강조 dot
  - 음영 밴드: 각 월의 `[min, max]`를 면적으로. recharts에서는 `Area`의 `dataKey`에 `[min,max]` 튜플을 주거나, `max`를 채우고 `min`을 배경색으로 덮는 방식 중 구현 단순한 쪽 채택
- y축: `formatBillion` 기반 간략 표기(예: "15억"). 눈금 3~4개
- x축: 월 라벨 ~3~4개만 노출(`interval`로 솎아 모바일 오버플로우 방지)
- 색상 유지: 매매 `#2563eb`, 전세 `#0f9f6e`, 월세 `#ef4444`
- 스타일 토큰: 카드/텍스트는 기존 CSS 변수(`--color-blue-dark`, `--color-soft`, `--color-muted`, `--color-card`) 사용

상태: `selectedPyeong`, `selectedDealType` (둘 다 `useState`).

빈 데이터 처리:
- 선택 평형에 해당 유형 데이터 0건 → 그래프 자리에 "데이터 없음", 헤더 숫자 `-`
- 데이터 1점 → 선 없이 끝점+현재가만, 변동률 `-`
- 평형 자체가 1개뿐 → 평형칩 행 생략(또는 단일 칩 비활성 표기)

## 모바일 / 오버플로우

- 차트 폭: `ResponsiveContainer width="100%"`. 부모 컬럼이 `lg:grid-cols-[minmax(0,1fr)_320px]`의 `minmax(0,1fr)`이라 자식 오버플로우가 구조적으로 차단됨. 모바일은 단일 컬럼 풀폭, 차트 높이 고정(약 220px, 모바일 200px)
- 평형칩 행 / 유형 탭 행: 항목이 많아질 수 있어 `flex` + `overflow-x-auto`(가로 스크롤), 줄바꿈 대신 스크롤로 레이아웃 안정
- 통계 칩 4개: `flex flex-wrap gap` — 좁은 화면에서 2줄로 자연스럽게 래핑
- 비교 스트립: `grid-cols-3` 유지, 모바일에서 패딩/폰트 축소(`text-xs`)로 375px에서도 3등분 수용. 값은 "7.1억 ▲8.2%" 수준이라 수용 가능
- x축 라벨 솎기(`interval`)로 라벨 겹침/넘침 방지
- 구현 후 실제 뷰포트(375px / 768px / 1280px)에서 오버플로우 육안 확인

## 테스트 / 검증

- 단위: 파생 통계(변동률 12개월/부족분 폴백, 최고/최저, 빈 데이터) 계산 함수에 vitest
- 기존 e2e `tests/e2e/apt-detail.spec.ts`에 차트 섹션·탭 전환 스모크 보강(평형칩/탭 클릭 시 헤더 숫자 변화)
- 시각/오버플로우: 375·768·1280 폭에서 가로 스크롤바·잘림 없는지 확인

## 영향 범위

- `lib/transaction.ts` — `getMonthlyChartData` 확장(반환 타입 변경)
- `app/(public)/apt/[id]/_components/price-charts.tsx` — 재작성
- `app/(public)/apt/[id]/page.tsx` — `PriceCharts` props 전달 변경(한 줄)
- 신규: 파생 통계 계산 유틸 + 테스트
