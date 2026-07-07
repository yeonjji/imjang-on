# 홈 "청약 일정을 한눈에" — 연속 일정 표기 + 더보기 제자리 펼침

## 배경 / 문제

홈 대시보드의 `WeeklySubscriptionBoard`("청약 일정을 한눈에")는 각 청약 공고를 **주간 7일 중 딱 하루**에만 놓는다. `assembleWeeklyBoard`(`lib/subscription.ts:327`)가 공고를 하나의 앵커 날짜(OPEN이면 `receiptEnd`, UPCOMING이면 `receiptBegin`)로 축소하기 때문이다.

이로 인해 두 가지 문제:

1. **연속 확인 불가.** 신제주 동문디이스트(접수 7/3~7/6, 진행중)는 3·4·5일 칸엔 아무 표기가 없고, 마감일인 6일에만 "오늘 마감"으로 뜬다. 접수 기간을 날짜별로 훑을 수 없다.
2. **D-day가 그날 기준이 아님.** D-day 배지(`ddayLabel`)는 항상 **오늘 기준**으로 계산되어 마감일 칸에 붙는다. 특정 날짜 칸의 배지가 "그 날짜 기준"이 아니라 헷갈린다. (예: 당산역 더클래스 한강이 오늘(6일) 칸엔 안 뜨고, 마감일 칸의 D-day만 보임.)

세 번째, 별개의 UX 문제:

3. **더보기가 이동해버림.** 날짜별 `+N건 더보기`와 상단 `전체 보기 →`가 **모두** `/subscription` 목록으로 네비게이션한다. "더보기"인데 펼쳐지지 않고 페이지가 넘어가 부자연스럽다.

## 목표

- 공고를 **활성 구간 전체**에 표기해 날짜별로 연속 확인 가능하게.
- 각 날짜의 배지를 **그날 기준**으로 계산.
- **더보기는 제자리 펼침(in-place)**. 페이지 이동 없음. (상단 `전체 보기 →`는 목록 진입 어포던스로 유지.)
- 웹은 **간트형 막대**, 모바일은 **활성 기간 반복 카드**의 하이브리드. 단일 데이터 모델을 양쪽이 나눠 쓴다.

## 비목표 (YAGNI)

- `/subscription` 목록 페이지 자체 변경 없음.
- 간트 레인 패킹(한 행에 여러 막대 배치) 안 함 — **공고 1건 = 1행**.
- 주간 범위(오늘 ±3일) 변경 없음.

---

## 설계

### 1. 데이터 레이어 (`lib/subscription.ts`)

#### 1-1. 조회 쿼리 버그 수정

현재 `getWeeklySubscriptions`(`:404-405`)는 `receiptBegin` **또는** `receiptEnd`가 주간 안에 있어야 잡는다. 주 전체를 관통하는 긴 공고(시작=지난주, 마감=다음주)가 누락된다. 구간 겹침(interval overlap) 조건으로 교체:

```sql
WHERE COALESCE(n."receiptBegin", n."receiptEnd") <= :weekEnd
  AND COALESCE(n."receiptEnd", n."receiptBegin") >= :weekStart
```

(begin/end 한쪽이 null인 공고도 나머지 값으로 단일일 취급되어 포함/제외 판정된다. 둘 다 null이면 제외 — 앵커할 날짜 없음.)

#### 1-2. 그날 기준 배지 규칙

`dayBadge(begin, end, cellDate)` — 셀 날짜 기준 배지/톤을 반환:

| 조건 | 배지 | tone |
|---|---|---|
| cellDate < begin | `예정` | blue |
| cellDate == begin | `접수시작` | green |
| cellDate == end && cellDate == today | `오늘 마감` | orange |
| cellDate == end && cellDate != today | `마감일` | gray→orange* |
| 그 외 (begin < cell < end) | `D-{end−cell}` | green (D-1이면 orange) |

\* 마감일이 과거면 gray(마감), 미래면 orange(임박)로 톤 결정. 판정은 `today` 기준.

검증 예시:
- 신제주(7/3~7/6): 3일 `접수시작` · 4일 `D-2` · 5일 `D-1` · 6일 `오늘 마감`
- 당산역(마감 7/8, today=7/6): 6일 `D-2` · 7일 `D-1` · 8일 `마감일` — 사용자 요청과 일치

#### 1-3. 직렬화 모델

서버(`getWeeklySubscriptions`)에서 완성해 클라이언트로 넘긴다. **Date 객체를 클라이언트에 넘기지 않는다** — md·weekday·isToday·badge 등 표시 문자열을 전부 서버에서 계산.

```ts
interface WeekBar {
  id: string;
  name: string;
  regionShort: string | null;
  startIdx: number;        // 0~6, 주간 밖은 클램프
  endIdx: number;          // 0~6
  startsBeforeWeek: boolean; // 막대 왼쪽 화살표(◀)
  endsAfterWeek: boolean;    // 막대 오른쪽 화살표(▶)
  tone: BoardTone;           // 오늘 기준 상태색
  todayDdayLabel: string | null; // 마감칩(오늘 기준): 'D-2' | '오늘 마감' | null
}

interface DayItem {
  id: string;
  name: string;
  regionShort: string | null;
  tone: BoardTone;   // 그날 기준
  badge: string;     // 그날 기준
}

interface WeekModelDay {
  weekday: string;   // '월'
  md: string;        // '07.06'
  isToday: boolean;
  items: DayItem[];  // 그날 활성인 카드 '전부' (슬라이스 안 함)
}

interface WeekModel {
  summary: { open: number; upcoming: number; closed: number };
  total: number;
  days: WeekModelDay[];   // 모바일용
  bars: WeekBar[];        // 웹 간트용, 마감임박순 정렬
}
```

`bars` 정렬: 진행중 → 예정 → 마감(`TONE_ORDER`), 그 안에서 마감일(endIdx) 오름차순, 동률은 이름순.

기존 `assembleWeeklyBoard`/`flattenWeeklyBoard`는 이 모델 빌더로 대체(또는 내부 재작성). `deriveStatus`, `boardTone`, `parseSigungu`, `getWeekRange`는 재사용.

### 2. 웹(≥md) — 간트 뷰

7열 그리드 위에 **공고 1건 = 1행** 가로 막대.

```
        7/3   7/4   7/5   7/6★  7/7   7/8   7/9
신제주   ├─접수─────────오늘마감┤
당산역   ◀───────────── D-2 ── D-1 ──[마감]
화곡역               ├─접수──────────────── D-1 ──▶
```

- **막대 span:** `startIdx~endIdx`를 CSS grid `grid-column`으로 차지.
- **주간 경계 화살표:** `startsBeforeWeek`면 왼쪽 `◀`, `endsAfterWeek`면 오른쪽 `▶`로 "더 이어짐" 암시.
- **색:** `tone` — 진행중 green / 임박(D-1) orange / 예정 blue / 마감 gray. 기존 `--color-*` 토큰 재사용.
- **라벨:** 막대 안 왼쪽에 공고명(truncate), 오른쪽 끝(마감 지점)에 `todayDdayLabel` 칩.
- **TODAY 기준선:** 오늘 컬럼에 세로 하이라이트(`--color-soft` 배경 + `--color-blue` 라인).
- **밀집 처리:** 임박순 상위 **6행** 노출, 나머지 `+N건 더보기`로 제자리 펼침.

### 3. 모바일(<md) — 반복 카드

- 현행 일자 카드 레이아웃 유지.
- 각 날짜 셀에 그날 활성 카드를 **전부** 넣고 `badge`는 그날 기준.
- 날짜별 상위 **3개** 노출, `+N 더보기`로 **그 날짜만** 제자리 펼침.

### 4. 인터랙션 / 클라이언트화

- in-place 펼침을 위해 `WeeklySubscriptionBoard`를 `'use client'`로 전환(또는 얇은 클라이언트 래퍼 분리, 서버 컴포넌트는 데이터 조회만).
- 클라이언트는 `useState`로 펼침 상태만 관리:
  - 웹: 간트 전체 펼침(boolean).
  - 모바일: 날짜별 펼침(Set of index 또는 per-day boolean).
- 서버는 완성된 `WeekModel`을 props로 전달. Date 미전달.
- 상단 `전체 보기 →`는 `/subscription` 링크 유지(목록 진입용, 더보기와 구분).

### 5. 기본값 (조정 가능)

- 간트 노출 행 수: **6행**
- 모바일 날짜별 노출 수: **3개**

## 테스트

고정 `today` 주입으로 순수 함수 단위 테스트(기존 `deriveStatus` 테스트 패턴 재사용):

- `dayBadge`: begin/end/중간/오늘==마감/미래 마감일/예정 각 케이스 → 위 표 검증.
- 주간 모델 빌더: 신제주·당산역 시나리오가 날짜별로 기대 배지/톤을 내는지.
- 구간 겹침: 주 전체 관통 공고가 포함되는지, 주간 밖 공고가 제외되는지.
- `startsBeforeWeek`/`endsAfterWeek`/`startIdx`/`endIdx` 클램프.

## 영향 파일

- `lib/subscription.ts` — 모델 빌더 재작성, 쿼리 수정, `dayBadge` 추가
- `app/(public)/_components/weekly-subscription-board.tsx` — 간트 렌더 + 클라이언트화
- `app/(public)/_components/subscription-board-item.tsx` — 배지/톤 그대로 사용(변경 최소)
- 홈 페이지의 `getWeeklySubscriptions` 호출부 — props 타입 변경에 맞춰 조정
- 신규 테스트 파일(기존 subscription 테스트 위치 관습 따름)
