# 임장ON 브리핑 — 문구 통일 + 게시글 상세 카드 보강 (설계)

- **작성일:** 2026-06-22
- **대상 기능:** 자동 게시판 `/board` (임장ON 브리핑) — 관련 메모리 `project-auto-board`, `project_data_source_attribution`
- **브랜치(예정):** `feat/board-briefing-detail-cards`

## 1. 배경 / 목표

`/board`는 공공 보도자료·우리 DB 집계를 사실 위주로 정리하는 "임장ON 브리핑" 게시판이다. 내비게이션은 이미 **"임장ON 브리핑"**으로 부르는데, 목록 화면 헤딩은 아직 "오늘의 이슈", 상세 상단 라벨은 "임장ON 소식"으로 이름이 갈려 있다. 또한 게시글 상세는 본문과 출처만 있고 다른 코너로 이어지는 통로가 없어, 글을 다 읽은 사용자가 실거래가·청약 등 핵심 기능으로 자연스럽게 넘어갈 동선이 없다.

두 가지를 한다.

1. **문구 통일** — 목록·상세의 게시판 명칭을 내비와 동일한 **"임장ON 브리핑"**으로 맞춘다.
2. **상세 하단 카드 보강** — 게시글 본문·출처 아래에 ① 오늘의 실거래가(실데이터) ② 가장 가까운 청약(실데이터) ③ 금융정보 바로가기 ④ 다른 브리핑 글 카드를 추가해, 읽고 난 사용자를 핵심 코너로 잇는다.

**성공 기준:** 목록·상세에서 게시판 명칭이 "임장ON 브리핑"으로 일관되고, 상세 하단에 위 4블록이 디자인 시스템에 맞게 렌더되며, 데이터가 비거나 DB 블립이 나도 글 본문은 깨지지 않는다. typecheck·빌드·유닛 테스트 green.

## 2. 비목표 (Out of scope)

- 게시글 본문 생성 파이프라인·가드레일·어드민 검수 흐름은 손대지 않는다.
- 게시판 공개 토글(`NEXT_PUBLIC_BOARD_ENABLED`)·미리보기 토큰 로직은 그대로.
- "오늘의 실거래가/가장 가까운 청약"용 **새 집계 쿼리나 스냅샷 ETL을 만들지 않는다.** 기존 `readHomeSnapshot`·`getSubscriptionList`·`getHomeLatestPosts`를 재사용한다.
- OG 이미지/썸네일 폴백 alt 문자열(`'임장ON 소식'`)은 게시글이 없을 때만 쓰이는 폴백이라 이번 범위에서 제외(브랜드 일관성 차원의 후속 정리 후보로만 기록).

## 3. 변경 1 — 문구 통일 ("오늘의 이슈"/"임장ON 소식" → "임장ON 브리핑")

내비(`nav.tsx`)와 동일하게 **띄어쓰기 포함 "임장ON 브리핑"**으로 통일한다.

| 파일 | 위치 | 현재 | 변경 후 |
| --- | --- | --- | --- |
| `app/(public)/board/page.tsx` | `metadata.title` (L17) | `'소식 — 오늘의 이슈'` | `'임장ON 브리핑'` |
| `app/(public)/board/page.tsx` | `<h1>` (L75) | `오늘의 이슈` | `임장ON 브리핑` |
| `app/(public)/board/page.tsx` | `<caption>` sr-only (L103) | `오늘의 이슈 목록` | `임장ON 브리핑 목록` |
| `app/(public)/board/[id]/page.tsx` | 상단 라벨 (L68) | `임장ON 소식` | `임장ON 브리핑` |

- 목록 h1 위 작은 키커 `소식`(L73)은 **유지**(헤딩 위 짧은 한글 라벨이라 DESIGN.md가 금지하는 "대문자 eyebrow"에 해당하지 않음).
- 상세 메타 타이틀은 `post.title` 기반이라 변경 불필요. 상세 상단 라벨 줄(L69의 `분류 · sourceName`)은 그대로.

## 4. 변경 2 — 게시글 상세 하단 카드 보강

`app/(public)/board/[id]/page.tsx`에서 `<PostSource …/>` 아래에 새 영역을 추가한다.

### 4.1 레이아웃

```
[ 게시글 본문 (board-prose) ]
[ PostSource (출처·기준일) ]
───────────────────────────────  (구분 여백)
┌────────────────────┬────────────────────┐
│ 📊 오늘의 실거래가      │ 🏠 가장 가까운 청약     │   ← 실데이터 카드 (md 2열, 모바일 1열)
│ 6월 21일 수집 기준 …   │ OO단지 · 접수중 D-7 …  │
│ N건 · 최고가 …         │ 지역 · 공급 …          │
│ 출처: 국토교통부       │ 출처: 한국부동산원      │
│ 실거래가 보기 →        │ 청약 일정 보기 →       │
└────────────────────┴────────────────────┘
[ 💳 금융정보도 둘러보세요 → ]                       ← 슬림 링크 카드 (전체폭)
───────────────────────────────
다른 브리핑 글                                       ← BoardBriefingSection 재사용
[카드][카드][카드][카드]   (최신 4건 · 현재 글 제외)
```

상세 본문은 `max-w-[760px]` `<article>` 안이다. 추가 영역도 같은 폭 안에 둔다(목록의 풀폭 그리드가 아니라 읽기 폭 유지).

### 4.2 블록별 명세

#### A. 오늘의 실거래가 (실데이터 카드)
- **데이터:** `readHomeSnapshot().briefing`(사전계산 스냅샷, `MarketBriefing | null`). 새 쿼리 없음.
- **표시:** 최대 3개 수치를 한 줄 요약 — 거래 건수(`summary.txCount`), 최고가(`summary.highest`, `formatBillion(amountManwon)` + `regionLabel·propertyName`), 가장 많이 거래된 지역(`summary.topRegion`, `label·count건`). 표시 텍스트는 `lib/format`의 `formatBillion` 재사용. **요약 문장은 `text-sm`(14px) 이상, 배지·기준일·출처만 `text-xs`**(14px Floor Rule).
- **기준일 카피(정확성):** `briefing.refDate`는 '오늘'이 아니라 데이터가 있는 최근일로 폴백될 수 있다(`isFallback`). 따라서 "오늘 N건"으로 단정하지 말고, 홈 `MarketBriefing`과 동일한 정직 카피 — `"{M}월 {D}일{ isFallback ? ' 최근' : '' } 수집 기준"` — 를 카드 메타에 표기한다(과장 금지·출처 정확 원칙).
- **출처 캡션:** `SourceCaption ids={['molit-rtms']}` → 렌더 라벨은 레지스트리 provider인 **"국토교통부"**(레지스트리가 SSOT이므로 라벨을 따로 만들지 않는다). `SourceCaption`은 날짜를 렌더하지 않으므로 기준일은 위 카피로 별도 표기. The Sourced-Number Rule 준수.
- **링크:** 카드 전체 또는 CTA가 `/list`로 이동.
- **빈/에러 처리:** `briefing`이 `null`이면 카드 미렌더. 데이터 조회는 try/catch로 감싸 실패 시 `null` 취급(글 본문 영향 없음).

#### B. 가장 가까운 청약 (실데이터 카드)
- **데이터·선택 규칙(명시):** `recent` 정렬은 OPEN/UPCOMING을 한 그룹(0)에서 `receiptEnd ASC`로 섞으므로 "첫 행 = 가장 임박한 접수중"이 보장되지 않는다. 따라서 **상태별로 좁혀 LIMIT 1로 조회**한다:
  1. `getSubscriptionList({ status: 'OPEN', sort: 'recent', perPage: 1 })` → 마감 임박 접수중 1건.
  2. 1이 비면 `getSubscriptionList({ status: 'UPCOMING', sort: 'recent', perPage: 1 })` → 임박 예정 1건.
  3. 둘 다 비면 카드 미렌더.
  (각 쿼리 인덱스 정렬 + LIMIT 1이라 가볍다.)
- **표시:** 단지명(`name`), 지역(`regionName`), 상태 배지(`STATUS_LABEL`/`STATUS_TONE`: 접수중=green, 예정=blue) + D-day(`ddayLabel`: "D-7"/"오늘 마감"/"N일 후"). 색에만 의존하지 않도록 배지에 텍스트 라벨 동반(DESIGN.md "색+라벨"). 단지명·지역 등 읽는 문장은 `text-sm` 이상, 배지·D-day·출처는 `text-xs`.
- **출처 캡션:** `SourceCaption ids={['applyhome']}` → 렌더 라벨은 레지스트리 provider **"한국부동산원"**(청약홈 운영 기관). 레지스트리 SSOT를 따르고 '청약홈' 문자열을 새로 만들지 않는다.
- **링크:** CTA "청약 일정 보기 →" → `/subscription`(목록). 개별 공고 상세로의 분기는 하지 않는다.
- **빈/에러 처리:** A와 동일하게 try/catch + 빈 결과 시 미렌더.

#### C. 금융정보 바로가기 (링크 카드)
- 데이터 없음. "금융정보도 둘러보세요" 한 줄 + 화살표, 전체폭 슬림 카드 → `/finance`.

#### D. 다른 브리핑 글
- **기존 `BoardBriefingSection`(최신 4건) 재사용.** board 상세에는 현재 import가 없으므로 **import 신규 추가**(§10 반영).
- 현재 보고 있는 글이 끼지 않도록 **`excludeId` 옵션 추가**:
  - `lib/board/post.ts` `getHomeLatestPosts(limit, excludeId?)` — `excludeId` 있으면 `where`에 `id: { not: excludeId }` 추가. 다른 호출부(홈 등) 기본 동작 불변.
  - `BoardBriefingSection`에 `excludeId?: bigint` prop 추가 → `getHomeLatestPosts(4, excludeId)` 호출. 기존 13개 호출부는 prop 미전달이라 영향 없음.
- **헤딩(확정):** `BoardBriefingSection`에 `heading?: string` prop을 추가하고, board 상세에서는 `heading="다른 브리핑 글"`로 렌더(§4.1 레이아웃과 일치). prop 미전달 시 기존 문구 "최신 부동산·청약·금융 소식" 유지(다른 페이지 불변).

### 4.3 컴포넌트·파일 구조

- **신규(확정):** `app/(public)/board/[id]/_components/board-detail-cta.tsx` — A·B·C 카드를 묶는 **단일** async 서버 컴포넌트. (카드별 파일 분리는 하지 않는다.)
  - 데이터 fetch는 **별도 helper 함수로 분리**해 에러 경로를 단위 테스트 가능하게 한다:
    - `getTransactionTeaser()` → `MarketBriefing | null` (내부 try/catch, 실패 시 `null`)
    - `getSubscriptionTeaser()` → `{ item, status } | null` (§4.2.B 선택 규칙, 내부 try/catch, 실패 시 `null`)
  - D는 기존 `BoardBriefingSection` 재사용(분리 파일 아님).
- **수정:**
  - `app/(public)/board/[id]/page.tsx` — `<PostSource/>` 아래에 `<BoardDetailCta />` + `<BoardBriefingSection heading="다른 브리핑 글" excludeId={post.id} />` 추가(둘 다 **신규 import**), 상세 라벨 문구 변경(변경 1).
  - `app/(public)/board/page.tsx` — 문구 3곳(변경 1).
  - `lib/board/post.ts` — `getHomeLatestPosts`에 `excludeId` 옵션.
  - `app/(public)/_components/board-briefing-section.tsx` — `excludeId`·`heading` prop.

## 5. 데이터 · 쿼리 · 성능

- 상세 페이지는 현행 **ISR `revalidate = 3600`** 유지. 추가 데이터 카드도 같은 ISR 사이클(시간당 1회 재생성)에서 채워지므로 "오늘의 실거래가/가장 가까운 청약"은 최대 1시간 stale — 변동이 느린 값이라 허용 가능.
- 쿼리 비용: A = `dashboardSnapshot` 단건 읽기(가벼움), B = `getSubscriptionList` LIMIT 5(인덱스 정렬, 가벼움), D = `getHomeLatestPosts` LIMIT 4(가벼움). 새 무거운 집계 없음.
- **안전장치:** 상세는 force-dynamic이 아니라 ISR이므로, 재생성 중 한 쿼리가 throw하면 페이지 렌더가 통째로 실패할 수 있다. 따라서 A·B의 데이터 조회를 **각각 try/catch로 감싸 실패 시 `null` 반환 → 해당 카드만 미렌더**한다(홈 `page.tsx`의 `safe()`와 동일 취지). 본문·출처는 항상 표시.

## 6. 디자인 시스템 준수 (DESIGN.md / PRODUCT.md)

- **카드:** 흰 배경, Line(`--color-line`) 1px 보더, 단일 그림자 `--shadow-soft`, 중첩 카드 금지. **라운드는 바로 아래 이웃인 `BoardBriefingSection` 카드와 동일하게 `rounded-[20px]`로 맞춘다**(DESIGN.md 명목값은 22px이나, 인접 board 카드 일관성·surgical 원칙을 우선 — 공용 `BoardBriefingSection`의 라운드/그림자는 건드리지 않는다). 참고: sibling `market-briefing.tsx`가 `--shadow`를 쓰는 드리프트는 기존 이슈로 이번 범위에서 손대지 않는다.
- **The Sourced-Number Rule:** 실데이터 카드(A·B)의 수치에는 `SourceCaption`을 붙인다(A=`['molit-rtms']`→"국토교통부", B=`['applyhome']`→"한국부동산원"). 라벨은 `lib/data-sources.ts` 레지스트리(SSOT)의 provider를 그대로 쓰고 새 문자열을 만들지 않는다. 출처 없는 숫자를 두지 않는다.
- **색 절제:** 강조는 Signal Blue(`--color-blue`) 하나. 청약 상태 배지만 정보 신호로 green/blue 사용하되 **반드시 텍스트 라벨 동반**(색만으로 정보 전달 금지).
- **14px Floor:** 읽는 문장은 14px 이상. `text-xs`는 라벨·캡션·배지·출처에 한정.
- **안티레퍼런스 회피:** 그라데이션 텍스트·좌측 색 띠 보더·과장 카피·대문자 eyebrow 사용 금지. 조용한 정보 안내자 톤 유지.

## 7. 접근성 (WCAG 2.1 AA)

- 카드 링크는 키보드 포커스 가능, 텍스트 대비 ≥ 4.5:1.
- 청약 상태는 색 + 라벨 병행. 아이콘(이모지)은 장식이며 의미는 텍스트로 전달.
- `BoardBriefingSection` 등 기존 패턴의 접근성 마크업을 따른다.

## 8. 검증 기준

1. `pnpm typecheck` 통과.
2. 클린 빌드 green, `/board`·`/board/[id]` 라우트 정상.
3. 유닛 테스트 green:
   - `getHomeLatestPosts(limit, excludeId)` — `excludeId` 전달 시 해당 글 제외, 미전달 시 기존 동작 불변.
   - `getSubscriptionTeaser()` 선택 규칙 — OPEN 우선, OPEN 없을 때 UPCOMING, 둘 다 없을 때 `null`(§4.2.B).
   - 데이터 helper 에러 경로 — `getTransactionTeaser`/`getSubscriptionTeaser`가 조회 throw 시 예외를 삼키고 `null` 반환(카드 미렌더 근거). throw 주입으로 확인.
4. 로컬 dev 스모크: 목록 헤딩 "임장ON 브리핑", 상세 상단 라벨 "임장ON 브리핑", 상세 하단 4블록 렌더, 데이터 빈/에러 시 해당 카드만 빠지고 본문은 정상.

## 9. 위험 및 완화

| 위험 | 완화 |
| --- | --- |
| ISR 재생성 중 DB 블립으로 상세 페이지 전체 실패 | A·B 데이터 조회를 try/catch로 감싸 카드 단위 폴백 |
| 청약 카드가 마감/엉뚱한 공고 노출 | OPEN→UPCOMING 순 상태별 LIMIT 1 조회로 선택(§4.2.B), 둘 다 없으면 미렌더 |
| `BoardBriefingSection`에 현재 글이 섞여 자기참조 | `excludeId`로 현재 글 제외 |
| `getHomeLatestPosts` 시그니처 변경이 다른 호출부 깨뜨림 | `excludeId`는 선택 인자, 기본 동작 불변(기존 호출부 무수정) |
| 출처 라벨이 레지스트리와 불일치 | A·B는 `SourceCaption` + 레지스트리 provider 라벨(국토교통부/한국부동산원)만 사용, 임의 문자열('청약홈' 등) 금지 |
| 실거래가 카드가 폴백일 때 '오늘'로 오인 표기 | `isFallback` 시 "최근 수집 기준"으로 카피 분기, `refDate` 노출(§4.2.A) |

## 10. 변경 파일 목록 (예상)

- `app/(public)/board/page.tsx` (문구 3곳)
- `app/(public)/board/[id]/page.tsx` (라벨 문구 + `BoardDetailCta`·`BoardBriefingSection` **import 신규 추가** + 하단 영역 삽입)
- `app/(public)/board/[id]/_components/board-detail-cta.tsx` (신규 — A·B·C + 데이터 helper 2개)
- `app/(public)/_components/board-briefing-section.tsx` (`excludeId`·`heading` prop)
- `lib/board/post.ts` (`getHomeLatestPosts` `excludeId` 옵션)
- 관련 유닛 테스트(`getHomeLatestPosts` excludeId, `getSubscriptionTeaser` 선택/에러 경로)
