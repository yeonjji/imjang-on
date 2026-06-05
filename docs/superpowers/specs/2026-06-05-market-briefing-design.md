# 오늘의 부동산 한입 브리핑 — 설계 문서

- 작성일: 2026-06-05
- 상태: 승인됨 (구현 계획 대기)
- 목업: `docs/superpowers/mockups/market-briefing-mock.html`

## 1. 목표

메인 페이지(`app/(public)/page.tsx`)에 **"오늘의 부동산 한입 브리핑"** 섹션을 추가한다.
숫자만 나열하는 대신 "오늘 시장에서 무슨 일이 있었는지"를 보여주는 것이 목적이며,
모든 수치는 **실제 DB 집계**로 채운다. 더미/하드코딩 금지.

배치: 검색 필터 행(`#search-filter` + `TypeHub`) **바로 아래**, `AmenityHub`(주변 인프라) **위**.

## 2. 범위 (확정된 결정)

| 항목 | 결정 |
|---|---|
| "오늘" 정의 | **수집일 = `Transaction.createdAt`이 오늘(KST)** 인 거래. 당일 0건이면 `createdAt` 최신 날짜로 폴백하고 기준일을 "○월 ○일 수집 기준"으로 표기 |
| 거래 유형 | **매매(`dealType = 'SALE'`)만** |
| 지역 단위 | **시군구**(`Region.level = 2`), `sigunguCode`로 그룹핑 |
| v1 위젯 | ① 오늘의 실거래 한눈에 ② 인기 동네 TOP5 ③ 거래량 급증 동네 |
| 제외 (v2) | 신고가 TOP3 (역대 최고가 판정은 별도 집계 필요) |

## 3. 위젯별 데이터 정의

전부 **매매(SALE)** 기준.

### 3-1. 오늘의 실거래 한눈에 (카드1)
기준 시점: 수집일(`createdAt` ∈ 오늘 KST, 폴백 시 최신 수집일).
- **오늘 등록된 실거래 건수**: 위 윈도우의 SALE 거래 수.
- **최고가 거래**: `dealAmount` 최대 1건. 단지명 + 시군구 표시, `/apt/[propertyId]` 링크.
- **최저가 거래**: `dealAmount` 최소 1건(0/NULL 제외). 동일 링크.
- **가장 많이 거래된 지역**: `sigunguCode`별 건수 1위 시군구 + 건수.
- **최다 거래 평형**: 전용면적(`exclusiveArea`)을 구간으로 버킷팅해 최빈 구간.
  - 버킷: `~60` / `60–85` / `85–102` / `102–135` / `135~` (㎡, 전용면적 기준)
  - 라벨: 대표 평형대 표기(예: "84㎡대" = 60–85㎡ 구간). 라벨 매핑은 구현 시 상수로 정의.

### 3-2. 인기 동네 TOP5 (카드2)
기준 시점: 수집일(카드1과 동일 윈도우).
- `sigunguCode`별 SALE 건수 내림차순 상위 5.
- 표기: 시군구명(`Region.fullName` 또는 sido+sigungu 축약), 건수, 막대(최대값 대비 비율).
- 행 클릭 → `/region/[code]`.

### 3-3. 거래량 급증 동네 — "오늘의 발견" (카드3)
기준 시점: **계약일(`contractDate`)** — 수집일이 아님.
- 최근 30일 = `[today-30d, today]`, 직전 30일 = `[today-60d, today-30d]` (KST 기준).
- `sigunguCode`별 두 윈도우 SALE 건수 집계 → 증감률 `(recent - prev) / prev`.
- 노이즈 필터: `recent >= 30건` 이상만 후보(임계값은 구현 시 상수, 데이터 보고 조정 가능).
- 증감률 내림차순 상위 3. 부제에 "최근 30일 N건 (직전 M건)" 근거 표기.
- 행 클릭 → `/region/[code]`.
- **계약일 기준 이유**: 30일 추세는 시장 활동(계약 시점)을 봐야 의미가 있고, 수집일 기준은 백필 타이밍에 왜곡된다.

## 4. 아키텍처

**접근: 페이지 ISR 라이브 집계** (스냅샷 테이블은 v2 후보).

- `lib/briefing.ts` 신설 → `getMarketBriefing(): Promise<MarketBriefing | null>`.
  - 내부에서 위 3개 위젯 데이터를 `Promise.all`로 병렬 집계.
  - 폴백 후에도 데이터 0건이면 `null` 반환.
- `page.tsx`에서 `getHomeStats()`와 함께 `Promise.all`로 호출. 기존 `revalidate = 3600`(1시간 ISR)에 그대로 캐시됨 → 쿼리는 시간당 1회만 실제 실행.
- KST 일자 경계 계산 헬퍼(예: `lib/date` 또는 briefing 내 로컬 함수). `createdAt`/`contractDate`는 UTC 저장 → KST 보정 후 비교.
- 집계는 가능하면 `prisma.transaction.groupBy` / 인덱스 활용. 필요한 인덱스(`createdAt`, `contractDate`, `sigunguCode`+`dealType`)가 없으면 마이그레이션으로 추가.

### 타입 (초안)
```ts
interface MarketBriefing {
  refDate: string;        // 기준 수집일 (YYYY-MM-DD)
  isFallback: boolean;    // 오늘 0건이라 최신일로 폴백했는지
  summary: {
    txCount: number;
    highest: TxHighlight | null;   // 최고가
    lowest: TxHighlight | null;    // 최저가
    topRegion: RegionCount | null; // 최다 거래 지역
    topAreaBand: { label: string; count: number } | null;
  };
  popularRegions: RegionCount[];   // 최대 5
  surgeRegions: SurgeRegion[];     // 최대 3
  hashtags: string[];              // 데이터에서 자동 생성
}
interface TxHighlight { propertyId: string; propertyName: string; regionLabel: string; amountManwon: number; }
interface RegionCount { code: string; label: string; count: number; }
interface SurgeRegion { code: string; label: string; recent: number; prev: number; changePct: number; }
```

## 5. UI / 컴포넌트

- 새 서버 컴포넌트 `app/(public)/_components/market-briefing.tsx`.
- `page.tsx`에서 검색 필터 행 `</div>` 뒤, `<AmenityHub />` 앞에 렌더.
- `briefing == null`이면 섹션 미렌더(기존 "이 지역 청약" 빈 상태 패턴과 동일).
- 디자인: 기존 토큰 재사용(`--blue/--green/--red`, `rounded-[20px]`, `shadow`, `.tag` 칩). 목업과 일치.
  - 모바일: 카드 3장 세로 스택. 한눈에는 2열 타일.
  - 데스크톱(≥760px): 한눈에 풀폭(타일 가로 배치) + 인기/급증 2열.
- 해시태그: 헤더 아래 칩 줄. 데이터 기반 자동 생성(예: `#매매`, `#최고가 {시군구}`, `#{평형대} 최다`, `#{최다지역}`).
- 포맷: `formatBillion`(억/만원), `formatArea` 재사용.

## 6. 빈/에러 처리

- 폴백 후에도 0건 → 섹션 미렌더.
- 각 위젯 개별 결손 허용: 최고가/최저가/지역 등이 비면 해당 타일만 생략하거나 "—" 표기(섹션 전체는 유지).

## 7. 테스트

- `lib/briefing.ts` 단위 테스트: 윈도우 경계(KST), 폴백 분기, 버킷팅, 증감률·노이즈 필터.
- 검증 DB는 `.env.test`(로컬 docker) 기준 (프로젝트 규칙).
- 가능하면 메인 페이지에 섹션 렌더/미렌더 e2e 최소 1건.

## 8. 비범위 (Out of scope)

- 신고가 TOP3 (v2).
- 신도시/택지지구 브랜드명 매핑(데이터에 없음 — 행정구역명으로 대체).
- 전세/월세 거래량 포함.
- 스냅샷 사전계산 테이블.
