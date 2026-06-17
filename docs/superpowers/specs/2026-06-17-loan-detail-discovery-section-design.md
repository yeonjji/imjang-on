# 서민금융 대출상품 상세 — "임장온에서 더 살펴보기" 디스커버리 섹션 설계

- 작성일: 2026-06-17
- 대상 화면: 서민금융 대출상품 상세 (`app/(public)/finance/[seq]/page.tsx`)
- 목표: 대출 정보를 본 사용자를 실거래가·청약 등 인접 콘텐츠로 자연스럽게 안내하는 하단 보조 섹션을 추가한다. 한 덩어리의 섹션 안에 ① 실거래 매물(단지) ② 이번 주 청약(전국) 두 블록을 담고, 각 영역의 전체 페이지로 가는 링크를 둔다.

## 개정 이력

- **2026-06-17 (1차)**: 블록①을 "인기 지역(시군구) pill"로 설계 → 구현·머지(PR #130).
- **2026-06-17 (2차, 현재)**: 블록①을 시군구 pill 대신 **실제 단지 매물 카드 리스트**로 변경. 사용자가 "지역만 고르게 하는 pill 말고 청약처럼 실매물 목록을 바로 보여달라"고 요청. 이에 따라 `getPopularSigungusBySido`(시군구 pill 전용)는 제거하고, 거래량 상위 단지를 `getTopPropertiesByVolume`(시도 prefix 스코프)로 가져와 `PropertyCard`로 노출한다. `resolveLoanRegionScope`·`flattenWeeklyBoard`·전체 레이아웃 골격은 유지.

## 배경 / 데이터 현황

대출 상세 페이지에는 지역 맥락이 거의 없지만, **상품 자체가 지역 태그를 들고 있다**. 운영 DB 기준:

- 대출상품 **323개** 중 **317개(98%)**가 `regionTags` 보유.
- 그중 **`"전국"` 계열 ~130개**, **특정 시도 ~187개(58%)** (전북26·경기26·강원22·충북21·서울19·울산16·대구11 …). 지자체 상품이 시도에 묶여 있음(예: `[강원] 저소득주민 융자사업 / 영월군`, `[경남,울산] 우리지역 氣-Up 서포트론`).

따라서 "지역 조건이 있으면 그 지역 매물" 분기는 예외가 아니라 **다수 케이스**다. 이 설계는 그 분기를 1급 시민으로 다룬다.

### 확정 방향(승인됨)

| 항목 | 결정 |
|---|---|
| 실거래가 블록 | **거래량 상위 단지(아파트·오피스텔·빌라) 카드 리스트**. 상품 `regionTags`에 특정 시도가 있으면 그 시도 기준, 없거나(전국) 데이터 없으면 **전국 폴백** |
| 청약 블록 | **전국 "이번 주" 청약** 고정(지역 분기 없음 — 작은 시도는 그 주 청약이 비는 경우가 많아 전국으로 통일) |
| 데이터 소싱 | `getTopPropertiesByVolume`에 시도 prefix 스코프 옵션 추가. 사전계산된 `Property.txCount12m` 내림차순. **ETL·스냅샷·마이그레이션 변경 없음** |
| 정렬 / 종류 | 거래량(`txCount12m`) 상위 / 아파트·오피스텔·빌라 전체 |
| 레이아웃 | 하나의 틴트 컨테이너 안에 **세로 2단**(실거래 매물 → 구분선 → 이번 주 청약) |
| 배치 | `<main>` 컬럼 맨 아래, `RelatedLoans` 다음 |

## 레이아웃 / 시각

새 섹션은 하나의 옅은 틴트 컨테이너 안에 두 블록을 담고, 두 블록 모두 "디테일 페이지로 가는 카드 리스트"로 통일한다(실거래=단지 카드, 청약=청약 카드). 컨테이너 틴트 면 + 섹션 헤더가 위쪽 `RelatedLoans`(대출 카드)와 맥락을 구분한다.

```
┌──────────────────────────────────────────────────┐  bg-[var(--color-soft)], rounded-[22px], p-6
│ 임장온에서 더 살펴보기                                │  ← 섹션 타이틀(text-lg/font-bold, blue-dark)
│                                                    │
│ 강원 실거래가                         실거래가 더 보기 → │  ← 블록① 헤더 + 우측 링크
│ ┌────────────────────┐ ┌────────────────────┐     │
│ │ 부영6단지   [42건]    │ │ 메이플밸리부영 [31건] │     │  ← PropertyCard(단지명·거래건수
│ │ 강원 춘천시 · 2004년   │ │ 강원 원주시 · 2018년   │     │     ·매매/전세/월세 시세)
│ │ 매매 평균 2.1억 …      │ │ 매매 평균 3.4억 …      │     │  → /apt|/officetel|/villa /[id]
│ └────────────────────┘ └────────────────────┘     │
│ ────────────────────────────────────────────────  │  ← border-[var(--color-line)] 구분선
│ 이번 주 청약                              전체 청약 → │  ← 블록② 헤더 + 우측 링크
│ ┌────────────────────┐ ┌────────────────────┐     │
│ │ [D-2] OO아파트        │ │ [예정] △△단지         │     │  ← SubscriptionBoardItem 스타일
│ │ 서울 강서구           │ │ 경기 화성시           │     │  → /subscription/<id>
│ └────────────────────┘ └────────────────────┘     │
│ 출처: 국토부 실거래가 · 청약홈 · LH 사전청약            │  ← SourceCaption
└──────────────────────────────────────────────────┘
```

- 컨테이너: `bg-[var(--color-soft)]`, `rounded-[22px]`, `p-6`. 컨테이너 자체엔 그림자 없음(*One-Shadow Rule* — 틴트 면). 내부 `PropertyCard`/`SubscriptionBoardItem`은 기존대로 흰 카드(틴트 면 위 흰 카드는 중첩 카드 아님).
- 본문 컬럼 폭(≈780px) 기준 세로 2단. 각 블록 카드 리스트는 `sm:grid-cols-2`. 모바일은 1열 스택.

## 데이터 — `lib/loan/discovery.ts`

```ts
export interface ResolvedRegionScope {
  specificSidos: string[]; // regionTags 중 실제 시도(단축명)만. 비면 전국.
  label: string;           // '강원' | '경남·울산' | '서울 외' | '전국'
}
export function resolveLoanRegionScope(regionTags: string[]): ResolvedRegionScope;

// getTopPropertiesByVolume가 반환하는 단지(지역 포함) 형태.
export type DiscoveryProperty = Awaited<ReturnType<typeof getTopPropertiesByVolume>>[number];

export interface LoanDiscoveryRegionScope {
  label: string;
  isNationwide: boolean;
  sido: string | null;   // "실거래가 더 보기" 링크용 첫 시도. 전국이면 null.
}

export interface LoanDiscovery {
  regionScope: LoanDiscoveryRegionScope;
  properties: DiscoveryProperty[];       // 거래량 상위 단지 (최대 4)
  weeklySubscriptions: WeeklyBoardItem[]; // 이번 주 청약 (최대 4)
}

export async function getLoanDiscovery(product: { regionTags: string[] }): Promise<LoanDiscovery>;
```

### `getLoanDiscovery` 로직

`DISCOVERY_TYPES = [APARTMENT, OFFICETEL, ROW_HOUSE, MULTIPLEX]`, `MAX_PROPERTIES = 4`. 각 DB 호출은 `safe()`로 감싸 실패 시 빈 값으로 강등(ISR 페이지가 죽지 않게 — 홈 `page.tsx`의 `safe<T>`와 동일 패턴).

1. `resolved = resolveLoanRegionScope(product.regionTags)`.
2. `resolved.specificSidos.length > 0`이면 시도 단축명을 `sidoPrefix()`로 2자리 코드로 변환해
   `getTopPropertiesByVolume({ types: DISCOVERY_TYPES, sidoPrefixes, limit: 4 })` 호출.
3. 결과가 있으면 → `regionScope = { label: resolved.label, isNationwide: false, sido: specificSidos[0] }`.
4. 결과가 비었거나(또는 전국 상품) → `getTopPropertiesByVolume({ types: DISCOVERY_TYPES, limit: 4 })`(전국 상위)로 폴백,
   `regionScope = { label: '전국', isNationwide: true, sido: null }`.
5. `board = await getWeeklySubscriptions()`; `weeklySubscriptions = flattenWeeklyBoard(board, 4)`(전국, 지역 분기 없음).

`specificSidos`가 여러 개여도(예: `[경남, 울산]`) prefix를 union해 그 시도들의 단지를 함께 조회한다. 헤더 라벨은 `경남·울산`, 3개 이상은 `첫시도 외`로 절단(`resolveLoanRegionScope`).

### `lib/property.ts` — `getTopPropertiesByVolume`에 시도 스코프 추가

기존 시그니처에 **선택적** `sidoPrefixes?: string[]`만 추가(기존 호출부 무영향). 값이 있으면 `WHERE` 절에
`OR: sidoPrefixes.map((p) => ({ sigunguCode: { startsWith: p } }))`를 AND로 더한다. 그 외(정렬 `txCount12m desc`, `include: { region }`)는 그대로. 사전계산된 `txCount12m`를 시도 prefix로 좁힌 가벼운 쿼리라 ISR 렌더 경로에서 안전(5M행 `Transaction` 집계 아님).

### 이번 주 청약 — 기존 자원 재사용

- `getWeeklySubscriptions()`(전국, 홈에서 사용)의 `WeeklyBoard`를 `flattenWeeklyBoard(board, 4)`로 평탄화: 일자 버킷(`days[].items`)을 펼쳐 id 중복 제거 후 **진행중·예정 우선**(`TONE_ORDER` orange→green→blue→gray) → 이름 순으로 정렬해 상위 4건. `flattenWeeklyBoard`는 `TONE_ORDER`가 모듈-프라이빗인 `lib/subscription.ts`에 둔다. 기존 `WeeklyBoardItem` + `SubscriptionBoardItem` 재사용.
- 빈 경우(평탄화 0건): 블록②를 "이번 주 예정된 청약이 없습니다" 안내로 대체. 섹션 전체는 유지.

## 컴포넌트 — `_components/loan-discovery-section.tsx`

Props: `{ discovery: LoanDiscovery }`. 서버 컴포넌트(프레젠테이션). `discovery`는 `page.tsx`에서 주입.

- **블록① 실거래 매물**
  - 헤더: `{regionScope.label} 실거래가`(예: `강원 실거래가`, `전국 실거래가`). 우측 "실거래가 더 보기 →": 지역이면 `/list?sido=<regionScope.sido>`, 전국이면 `/list`.
  - 리스트: `grid grid-cols-1 gap-3 sm:grid-cols-2`, 각 항목 `PropertyCard`(기존 컴포넌트 재사용 — 단지명·지역·준공/세대·거래건수 배지·매매/전세/월세 시세). `PropertyCard`가 `typeToSlug`로 `/apt|/officetel|/villa /<id>`로 라우팅.
  - `properties.length === 0`(전국 폴백도 비어있는 장애)면 블록① 미렌더.
- **구분선**: `border-t border-[var(--color-line)]`, `my-5`(블록①이 있을 때만).
- **블록② 이번 주 청약**
  - 헤더: `이번 주 청약` + 우측 "전체 청약 →" = `/subscription`.
  - 리스트: `grid grid-cols-1 gap-2 sm:grid-cols-2`, 각 항목 `SubscriptionBoardItem`(→ `/subscription/<id>`). 빈 상태는 위 절 참조.
- **하단**: `<SourceCaption ids={['molit-rtms', 'applyhome', 'lh-presub']} />`(실거래가=국토부, 청약=청약홈·LH. 모두 `lib/data-sources.ts`에 존재).

## 데이터 흐름 / 페이지 연결 — `page.tsx`

1. 기존 `related`(RelatedLoans) 산정에 이어 `const discovery = await getLoanDiscovery(product)` 호출.
2. 렌더 위치: `<main>` 컬럼 안, `<RelatedLoans … />` **다음** 줄에 `<LoanDiscoverySection discovery={discovery} />`.
3. ISR 유지: `revalidate = 86_400`. 단지 쿼리(시도-스코프 또는 전국, 사전계산값)·이번 주 청약(1주 범위) 모두 24h 캐시 허용.
4. 견고성: `getLoanDiscovery` 내부 쿼리 실패는 `safe()`로 빈 값 폴백. 둘 다 비면 `LoanDiscoverySection`이 `null` 반환.

## 빈 상태 정리

| 상황 | 동작 |
|---|---|
| 지역 케이스, 그 시도 단지 0 | 전국 상위 단지로 폴백(라벨 "전국 실거래가") |
| 전국 폴백도 0(장애) | 블록① 미렌더 |
| 이번 주 청약 0 | 블록② = "이번 주 예정된 청약이 없습니다" + 전체 청약 링크 |
| 두 블록 모두 비어있음 | `LoanDiscoverySection` → `null` |

## 접근성 / 브랜드

- 단지·청약 카드 모두 `<Link>` 키보드 접근. 청약 배지·거래건수 배지는 색+텍스트 병행(*색 의존 금지*).
- *Sourced-Number Rule*: 노출 데이터(실거래가·청약)는 하단 `SourceCaption`으로 출처 귀속.
- *Quiet-Surface / One-Shadow*: 틴트 면 1겹, 색 강조는 Signal Blue 절제. "급매"류 과장 어휘 금지.
- *14px Floor*: 본문 텍스트 14px 이상, `text-xs`는 배지·캡션 라벨에 한정.

## 테스트

- `tests/lib/loan-discovery.test.ts` — `resolveLoanRegionScope` 순수 단위(유지): `['전국']`/`['강원']`/`['경남','울산']`/3개+ 절단/`['전국(농어촌)']`/혼합.
- `tests/lib/subscription-flatten.test.ts` — `flattenWeeklyBoard` 순수 단위(유지): 진행중/예정 우선 정렬·중복 제거·limit.
- DB 함수(`getTopPropertiesByVolume` 시도 스코프, `getLoanDiscovery` 오케스트레이션)는 기존 레포 관행대로 tsc + 라이브 렌더로 검증(지역 seq·전국 seq 각 1건). 단위 테스트 추가 없음(`getTopPropertiesByVolume` 등 DB 함수에 단위 테스트가 없는 관행 준수).

## 범위 밖 (YAGNI)

- 청약 블록의 지역 분기(전국 고정으로 결정).
- 인기 지역(시군구) pill 노출(1차 설계 → 단지 매물 리스트로 대체).
- 개별 실거래(거래 1건 단위) 피드 / 최근 거래순 정렬(거래량 상위로 결정).
- 디스커버리 클릭 로깅/분석, 개인화.
- 신규 DB 필드·마이그레이션·ingest 변경.
