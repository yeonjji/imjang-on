# 홈 청약 보드 — 웹도 날짜별 카드로 통일

## 배경

PR #207에서 청약 보드가 두 단계로 진화했다.
1. **연속 일정 모델**(커밋 `f509cc5`): 공고를 신청기간 내 모든 날짜에 표기 + 날짜별 D-day 배지. 웹=간트, 모바일=날짜별 카드.
2. **2단 재구성**(그 위 커밋들): 상단 4개 큰 숫자 요약 + 하단 간트로 개편, 모바일 카드 제거.

사용자는 2단 재구성 방향을 **폐기**하고, 웹도 모바일처럼 **날짜별 카드**로 신청기간 전체를 보여주는 방향으로 가기로 했다. 더보기 제자리 펼침은 유지한다.

작업 기준점: 복구 지점 `backup/weekly-board-207-snapshot`(= 커밋 `f509cc5`). 이 지점으로 브랜치를 되돌린 뒤 진행한다.

## 목표

웹·모바일 모두 **날짜별 카드 목록** 하나로 통일한다. 각 공고는 신청기간 내 모든 날짜 칸에 표기되고, 칸마다 그날 기준 D-day 배지가 붙는다.

## 비목표 (YAGNI)

- `/subscription` 목록 페이지 변경 없음.
- 데스크톱 2열 배치 없음(세로 1열 유지, "모바일처럼").
- 주간 범위(오늘 ±3일) 변경 없음.
- 데이터 모델(`buildWeekModel`의 날짜별 버킷·`dayBadge`) 로직 변경 없음 — 이미 원하는 대로 동작.

## 설계

### 1. 리젝(되돌리기)

- 현재 브랜치 `feat/home-weekly-board-continuous-schedule`를 `backup/weekly-board-207-snapshot`(`f509cc5`)로 하드 리셋.
- 원격 PR 브랜치를 force-push로 덮는다. 되돌린 결과에는 연속 일정 모델·모바일 카드·요약 칩(진행중/예정/마감)·간트가 모두 존재.

### 2. 웹도 날짜별 카드로 (간트 제거)

리셋 후 유일한 변경:

- **컴포넌트 정리:** `weekly-board-mobile.tsx` → `weekly-board-days.tsx`로 이름 변경, 컴포넌트명 `WeeklyBoardMobile` → `WeeklyBoardDays`. 최상위 래퍼에서 `md:hidden` 제거하여 전 화면폭에서 렌더.
- **간트 제거:** `weekly-board-gantt.tsx` 및 SSR 테스트(`tests/components/weekly-board-gantt-ssr.test.ts`) 삭제.
- **모델 정리:** `buildWeekModel`/`WeekModel`에서 간트 전용 `bars` 필드와 `WeekBar` 타입, `TONE_ORDER` 기반 bars 정렬을 제거. `days`·`summary`·`total`은 유지. (`days[i].items`의 tone 정렬에 쓰는 `TONE_ORDER`는 남긴다.)
- **조립부:** `weekly-subscription-board.tsx` 본문을 `<WeeklyBoardDays days={board.days} />` 하나로. 헤더(제목·부제·요약 칩·전체보기)와 빈 상태(`total===0`)·`SourceCaption`은 유지. `WeeklyBoardGantt`·`WeeklyBoardMobile` import 제거하고 `WeeklyBoardDays` import.
- **fallback:** `app/(public)/page.tsx`의 `safe(getHomeWeekBoard(), fallback)`에서 fallback의 `bars: []` 제거(모델에서 bars 삭제에 맞춤). `summary`·`total`·`days`는 유지.

### 3. 유지 (백업에 이미 존재)

- 공고를 신청기간 내 모든 날짜 칸에 표기(`for i = startIdx..endIdx` 버킷 채움).
- 날짜별 D-day 배지(`dayBadge`): 7/6→D-2, 7/7→D-1, 마감일→오늘마감, 마감 후→마감(회색).
- 더보기 = 날짜 칸별 제자리 펼침(각 `DayRow`의 `useState` 토글, 기본 `perDay=3`).
- 요약 칩(진행중/예정/마감), 전체보기 링크, 빈 상태.

## 컴포넌트 인터페이스

- `WeeklyBoardDays({ days, perDay = 3 })` — `days: WeekModelDay[]`. 날짜 행마다 왼쪽 날짜 열 + 오른쪽 카드 스택, 오늘 행 강조. props는 기존 `WeeklyBoardMobile`과 동일.
- `WeekModelDay { weekday, md, isToday, items }`, `WeeklyBoardItem { id, name, regionShort, tone, badge }` — 무변경.

## 테스트

- `subscription-week-model.test.ts`: bars 관련 단언 제거, `days[i].items`가 신청기간 전체 날짜에 채워지고 날짜별 배지가 맞는지 확인하는 케이스 유지/보강.
- `weekly-board-days-ssr.test.ts`(기존 mobile SSR 테스트를 이름·import만 갱신): 날짜 행 렌더, 카드 상위 `perDay` 노출·초과분 `+N건 더보기` 접힘, 오늘 행 강조 요소.
- `weekly-board-gantt-ssr.test.ts` 삭제.
- 회귀: `subscription.test.ts`/`subscription-flatten.test.ts`(shared API) green 유지.
- 게이트: `pnpm test`, `pnpm typecheck`, `pnpm lint` green.
- 시각 검증(dev, 운영 데이터): 웹·모바일 모두 날짜별 카드, 공고가 신청기간 전체 날짜에 표기, 오늘 행 강조, 날짜 칸별 더보기 in-place.

## 영향 파일 요약

- 리셋으로 복원: `weekly-board-mobile.tsx`, `WeekModelDay.items`·`dayBadge`(lib)
- 이름변경 `weekly-board-mobile.tsx` → `weekly-board-days.tsx` (+ `md:hidden` 제거)
- 삭제 `weekly-board-gantt.tsx` + `tests/components/weekly-board-gantt-ssr.test.ts`
- 변경 `lib/subscription.ts` — `bars`/`WeekBar` 제거
- 변경 `weekly-subscription-board.tsx` — 본문 `WeeklyBoardDays` 하나로
- 변경 `app/(public)/page.tsx` — fallback에서 `bars` 제거
- 이름변경 `tests/components/weekly-board-mobile-ssr.test.ts` → `weekly-board-days-ssr.test.ts`
- 갱신 `tests/lib/subscription-week-model.test.ts` — bars 단언 제거
