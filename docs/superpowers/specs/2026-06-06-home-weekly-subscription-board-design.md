# 메인 주간 청약 보드 설계

작성일: 2026-06-06

## 목적

메인화면 "생활권까지 함께 보기"(`AmenityHub`) **위쪽**에 이번 주(월~일) 청약 일정을 한눈에 보여주는 보드를 추가한다. 각 청약을 누르면 해당 청약 상세(`/subscription/[id]`)로 이동한다.

## 핵심 결정

- **모바일 레이아웃: 7행 타임라인(G안).** 가로 스크롤 없이 하루 = 한 줄. 왼쪽 요일/날짜, 오른쪽에 그 날 청약을 `[상태배지] 매물명 · 지역` 형태로 세로 스택. 일주일이 한 화면에 세로로 쌓인다.
- **데스크탑 레이아웃: 7열 그리드.** 기존 `preview.html` 시안과 동일하게 7개 날짜 칼럼을 한 줄에 펼쳐 "달력처럼 한눈에" 본다.
- 두 레이아웃은 **동일한 데이터와 동일한 청약 아이템 링크 컴포넌트**를 공유하고, CSS 반응형으로 전환한다(`md` 분기).
- **상단 요약 강조:** 진행중 / 예정 / 마감 3개를 큰 숫자 + 색면 카드 + 상태점으로 표시. 진행중 카드는 그라데이션 + "진행중" 라벨로 한 번 더 부각(가시성 요청 반영).

## 데이터

### 신규 함수 — `lib/subscription.ts`

```
getWeeklySubscriptions(today?: Date): Promise<WeeklyBoard>
```

반환 형태:

```ts
interface WeeklyBoardItem {
  id: string;            // /subscription/[id] 링크용
  name: string;          // 매물명
  category: SubscriptionCategory;
  regionShort: string | null; // 구/군 (예: "마포구"). address에서 구/군 토큰 파싱, 실패 시 regionName(시도) 폴백, 둘 다 없으면 null
  status: SubscriptionStatus; // OPEN | UPCOMING | CLOSED
  badge: string;         // "진행중" | "예정" | "마감" | "D-1" | "오늘 마감"
  tone: 'green' | 'blue' | 'gray' | 'warning';
}

interface WeeklyBoardDay {
  date: Date;            // 해당 날짜 (월~일 중 하루)
  weekday: string;       // "월"~"일"
  isToday: boolean;
  items: WeeklyBoardItem[];
}

interface WeeklyBoard {
  weekStart: Date;       // 이번 주 월요일
  weekEnd: Date;         // 이번 주 일요일
  days: WeeklyBoardDay[]; // 항상 7개
  summary: { open: number; upcoming: number; closed: number };
}
```

### 주(week) 범위

- 오늘이 포함된 **월요일~일요일** 7일. 기존 `dateInt`/`dayDiff` 헬퍼와 동일한 UTC 기준 날짜 계산을 사용한다.

### 보드 포함 조건 & 날짜 배치(anchor)

- `receiptBegin` 또는 `receiptEnd`가 이번 주 범위와 겹치는 `SubscriptionNotice`를 포함한다.
- 각 공고는 **딱 한 날에만** 표시한다. anchor 날짜:
  - `UPCOMING`(접수 시작 전) → `receiptBegin`
  - 그 외(`OPEN`/`CLOSED`) → `receiptEnd` (이번 주 안에 있으면 그 날, 아니면 주 범위로 클램프)
- 상태는 기존 `deriveStatus(receiptBegin, receiptEnd, today)`로 도출.
- 배지/톤:
  - `UPCOMING` → 파랑 "예정"
  - `OPEN` 이고 마감까지 `dday <= 1` → warning 톤 + `ddayLabel`("D-1" / "오늘 마감")
  - `OPEN` 그 외 → 초록 "진행중"
  - `CLOSED` → 회색 "마감"

### 하루 다건 처리

- 한 날에 청약이 여러 건이면 **최대 3건**까지 이름을 노출하고, 초과 시 마지막에 `+N건` 표시(전체 청약 목록 `/subscription`로 이동). 진행중/마감임박을 우선 정렬해 위로 올린다.

### 요약 카운트

- 이번 주 보드에 포함된 공고를 상태별로 집계해 `summary`에 담는다.

## 컴포넌트 구조

`app/(public)/_components/` 아래:

- `weekly-subscription-board.tsx` — 서버 컴포넌트. `WeeklyBoard`를 props로 받아 요약 헤더 + 데스크탑 그리드 / 모바일 타임라인을 렌더. 반응형은 Tailwind `hidden md:block` / `md:hidden`로 분기.
- `subscription-board-item.tsx` — 청약 1건 링크(`<Link href={/subscription/${id}}>`). 배지/매물명/지역 표시. 데스크탑·모바일 공용.

`app/(public)/page.tsx`:

- 기존 `Promise.all`에 `getWeeklySubscriptions()` 추가.
- `<MarketBriefing>`·`<AmenityHub>` **위쪽**(생활권 섹션 위)에 `<WeeklySubscriptionBoard board={...} />` 삽입.

## 상태/빈 화면

- 특정 날짜에 청약이 없으면 그 줄/칸에 "청약 일정 없음"(연한 톤) 표시.
- 이번 주 전체에 청약이 하나도 없으면 보드 대신 "이번 주 등록된 청약이 없습니다" 한 줄 + "전체 청약 일정 보기" CTA(`/subscription`).
- 보드 하단(또는 헤더 우측)에 "전체 청약 일정 보기" 링크(`/subscription`).

## 렌더링 / 성능

- 홈은 이미 `export const revalidate = 3600`(ISR). 보드도 이 주기로 갱신된다. 날짜 경계는 최대 1시간 지연 가능하나 메인 요약 용도로 허용한다.
- 쿼리는 기존 `getSubscriptionList`/`getNearbySubscriptions`와 동일한 `$queryRaw` + `SubscriptionUnit` 조인 패턴을 재사용한다(매물명·지역·접수일만 필요하므로 유닛 집계는 불필요, 가벼운 단일 쿼리).

## 테스트

- `getWeeklySubscriptions` 단위 테스트(`pnpm test:unit`, 기존 패턴):
  - 주 범위 계산(월~일), 오늘 표시.
  - anchor 배치(UPCOMING=시작일, OPEN/CLOSED=마감일), 주 경계 클램프.
  - 상태/배지/톤 도출(D-1·오늘 마감 warning 포함).
  - 요약 카운트, 하루 다건 정렬·`+N건` 컷오프.
- 데이터는 기존 테스트 시드/팩토리 방식에 맞춰 `SubscriptionNotice` 픽스처로 구성.

## 범위 밖 (이번 작업 아님)

- 청약 상세 페이지 변경 없음(기존 `/subscription/[id]` 그대로).
- 알림/구독(이메일) 연동 없음.
- 주 이동(이전/다음 주) 네비게이션 없음 — 이번 주 고정.
