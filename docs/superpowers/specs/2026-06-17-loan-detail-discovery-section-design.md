# 서민금융 대출상품 상세 — "임장온에서 더 살펴보기" 디스커버리 섹션 설계

- 작성일: 2026-06-17
- 대상 화면: 서민금융 대출상품 상세 (`app/(public)/finance/[seq]/page.tsx`)
- 목표: 대출 정보를 본 사용자를 실거래가·청약 등 인접 콘텐츠로 자연스럽게 안내하는 하단 보조 섹션을 추가한다. 한 덩어리의 섹션 안에 ① 인기 지역(실거래가) ② 이번 주 청약(전국) 두 블록을 담고, 각 영역의 전체 페이지로 가는 링크를 둔다.

## 배경 / 데이터 현황

대출 상세 페이지에는 지역 맥락이 거의 없지만, **상품 자체가 지역 태그를 들고 있다**. 운영 DB 기준:

- 대출상품 **323개** 중 **317개(98%)**가 `regionTags` 보유.
- 그중 **`"전국"` 계열 ~130개**, **특정 시도 ~187개(58%)** (전북26·경기26·강원22·충북21·서울19·울산16·대구11 …). 지자체 상품이 시도에 묶여 있음(예: `[강원] 저소득주민 융자사업 / 영월군`, `[경남,울산] 우리지역 氣-Up 서포트론`).

따라서 "지역 조건이 있으면 그 지역 기준" 분기는 예외가 아니라 **다수 케이스**다. 이 설계는 그 분기를 1급 시민으로 다룬다.

### 확정 방향(승인됨)

| 항목 | 결정 |
|---|---|
| 실거래가 블록 | **인기 지역(시군구)** 카드. 상품 `regionTags`에 특정 시도가 있으면 그 시도 기준, 없거나(전국) 데이터 없으면 **전국 폴백** |
| 청약 블록 | **전국 "이번 주" 청약** 고정(지역 분기 없음 — 작은 시도는 그 주 청약이 비는 경우가 많아 전국으로 통일) |
| 데이터 소싱 | **A안(경량)** — 지역 케이스는 렌더 시 `Property.txCount12m` 시도-필터 groupBy, 전국 케이스는 기존 `popular_sigungus` 스냅샷 재사용. ETL·스냅샷·마이그레이션 변경 없음 |
| 레이아웃 | 하나의 틴트 컨테이너 안에 **세로 2단**(인기 지역 → 구분선 → 이번 주 청약) |
| 배치 | `<main>` 컬럼 맨 아래, `RelatedLoans` 다음 |

## 레이아웃 / 시각

위쪽 `RelatedLoans`가 이미 대출 카드 2단 그리드이므로, **같은 카드 그리드 반복을 피한다**(DESIGN.md *Don't: 똑같은 크기의 카드 그리드 반복*). 새 섹션은 하나의 옅은 틴트 컨테이너 안에 pill 묶음 + 컴팩트 리스트로 텍스처를 달리한다.

```
┌──────────────────────────────────────────────────┐  bg-[var(--color-soft)], rounded-[22px], p-6
│ 임장온에서 더 살펴보기                                │  ← 섹션 타이틀(text-lg/font-bold, blue-dark)
│                                                    │
│ 강원 인기 지역                        실거래가 더 보기 → │  ← 블록① 헤더 + 우측 링크
│ (춘천시) (원주시) (강릉시) (속초시) (동해시)            │  ← 시군구 pill 5~6개
│ ────────────────────────────────────────────────  │  ← border-[var(--color-line)] 구분선
│ 이번 주 청약                              전체 청약 → │  ← 블록② 헤더 + 우측 링크
│ ┌────────────────────┐ ┌────────────────────┐     │
│ │ [D-2] OO아파트        │ │ [예정] △△단지         │     │  ← SubscriptionBoardItem 스타일
│ │ 서울 강서구           │ │ 경기 화성시           │     │
│ └────────────────────┘ └────────────────────┘     │
│ 출처: 국토부 실거래가 · 청약홈 · LH 사전청약            │  ← SourceCaption
└──────────────────────────────────────────────────┘
```

- 컨테이너: `bg-[var(--color-soft)]`(흰 카드 그리드와 구분되는 옅은 면), `rounded-[22px]`, `p-6`. 별도 그림자 없음(*One-Shadow Rule* — 카드가 아니라 틴트 면).
- 본문 컬럼 폭(≈780px) 기준 세로 2단이라 각 블록이 전체 폭을 사용. 모바일도 동일 구조(자연 스택).

## 데이터 — `lib/loan/discovery.ts` (신규)

```ts
export interface LoanDiscoveryRegionScope {
  label: string;        // 예: '강원', '경남·울산', '전국'
  isNationwide: boolean; // 폴백 또는 전국 상품이면 true
}

export interface LoanDiscovery {
  regionScope: LoanDiscoveryRegionScope;
  popularRegions: PopularRegion[];          // 시군구 pill (최대 6)
  weeklySubscriptions: WeeklyDiscoveryItem[]; // 이번 주 청약 (최대 4)
}

export async function getLoanDiscovery(product: LoanProduct): Promise<LoanDiscovery>;
```

### 인기 지역 해석 로직

1. `specificSidos` = `product.regionTags` 중 `sidoPrefix(tag)`가 존재하는 값만(= 실제 시도). `"전국"`·`"전국(농어촌)"`은 `sidoPrefix`가 `undefined`라 자연히 제외됨.
2. `specificSidos.length > 0`:
   - `popularRegions = await getPopularSigungusBySido(specificSidos, 6)`.
   - 결과가 비어있지 않으면 → `regionScope = { label: specificSidos.join('·'), isNationwide: false }`.
   - 비어있으면 → **전국 폴백**(아래 3).
3. 전국 폴백 / 전국 상품:
   - `popularRegions = (await readHomeSnapshot()).popularRegions`(기존 스냅샷, 최대 6).
   - `regionScope = { label: '전국', isNationwide: true }`.

> `specificSidos`가 여러 개여도(예: `[경남, 울산]`) union으로 묶어 한 헤더(`경남·울산`)에 노출한다. 라벨이 너무 길어지는 극단(3개 이상)은 `label = specificSidos[0] + ' 외'`로 절단한다.

### `lib/region.ts`에 신규 — `getPopularSigungusBySido`

```ts
export async function getPopularSigungusBySido(
  sidos: string[],
  limit = 6,
): Promise<PopularRegion[]>;
```

- `sidos`(짧은 시도명) → `sidoPrefix()`로 2자리 코드 집합으로 변환.
- `Property`를 `sigunguCode`로 묶어 `SUM(txCount12m)` 내림차순 상위 `limit` 시군구를 구한다. **무거운 5M행 `Transaction` 집계가 아니라, 사전계산된 `Property.txCount12m`를 시도 prefix로 좁힌 가벼운 groupBy**(`getTopPropertiesByVolume`가 이미 같은 `sigunguCode` + `txCount12m` 접근 패턴 사용).
  - 개념적 쿼리: `WHERE LEFT("sigunguCode",2) IN (:prefixes) AND "txCount12m" > 0 GROUP BY "sigunguCode" ORDER BY SUM("txCount12m") DESC LIMIT :limit`.
  - 일반구 통합시 라벨링은 기존 `getPopularSigungus`와 동일 방식(`Region`에서 `level 2` + `level 3 …00000` 라벨 결합, 읍면동 제외)으로 `stripSido(fullName)` 적용.
- 반환은 기존 `PopularRegion`(`{ sigunguCode, sido, sigungu }`)과 동형 → pill 컴포넌트 재사용.

> 인기 기준 윈도우가 전국 스냅샷(90일 거래수)과 지역 케이스(12개월 누적 `txCount12m`)에서 미세하게 다르다. 디스커버리 위젯 성격상 사용자에게 보이지 않는 차이이며, 무거운 집계를 렌더 경로에서 피하기 위한 의도된 트레이드오프다(승인됨).

### 이번 주 청약 — 기존 자원 재사용

- `getWeeklySubscriptions()`(전국, 이미 홈에서 사용)의 결과를 **평탄화**해 컴팩트 리스트로 만든다. 일자 버킷(`days[].items`)을 펼쳐 중복 제거 후, **진행중·예정 우선**(`boardTone` order: orange→green→blue→gray) → 마감 임박 순으로 정렬해 상위 **최대 4건**.
  - 평탄화/정렬은 `lib/loan/discovery.ts`의 작은 헬퍼 또는 `lib/subscription.ts`에 `flattenWeeklyBoard(board, limit)` 추가. 기존 `WeeklyBoardItem`(`{ id, name, regionShort, tone, badge }`) 형태를 그대로 사용해 `SubscriptionBoardItem`을 재활용.
- 빈 경우(`board.total === 0` 또는 평탄화 결과 0건): 블록을 "이번 주 예정된 청약이 없습니다" 안내 + 전체 청약 링크로 대체(홈 weekly board 빈 상태와 동일 톤). 섹션 전체는 유지(인기 지역 블록은 항상 노출).

## 컴포넌트 — `_components/loan-discovery-section.tsx` (신규)

Props: `{ discovery: LoanDiscovery }`. 서버 데이터는 `page.tsx`에서 받아 props로 주입(프레젠테이션 컴포넌트).

- **블록① 인기 지역**
  - 헤더: `{regionScope.label} 인기 지역`(예: `강원 인기 지역`, `전국 인기 지역`). 우측 "실거래가 더 보기 →":
    - 지역: `/list?sido=<specificSidos[0]>` (지역 케이스 — 라벨 파싱이 아니라 첫 시도 단축명 사용)
    - 전국: `/list`
  - pill: 각 `PopularRegion` → `/list?sido=<sido>&region=<sigunguCode>` (홈 히어로 `HeroSearch`와 동일 링크/스타일: `rounded-full border bg-white px-3 py-2 text-xs font-bold text-blue-dark hover:border-blue`). 라벨은 `sigungu`.
  - `popularRegions.length === 0`(전국 스냅샷도 비어있는 초기 상태)면 블록① 미렌더, 섹션은 청약 블록만으로 유지.
- **구분선**: `border-t border-[var(--color-line)]`, `my-5`.
- **블록② 이번 주 청약**
  - 헤더: `이번 주 청약` + 우측 "전체 청약 →" = `/subscription`.
  - 리스트: `grid grid-cols-1 gap-2 sm:grid-cols-2`, 각 항목 `SubscriptionBoardItem`(→ `/subscription/<id>`). 빈 상태는 위 "이번 주 청약" 절 참조.
- **하단**: `<SourceCaption ids={['molit-rtms', 'applyhome', 'lh-presub']} />`. (실거래가=국토부, 청약=청약홈·LH. 모두 `lib/data-sources.ts`에 존재.)

## 데이터 흐름 / 페이지 연결 — `page.tsx`

1. 기존대로 `product` 로드 후, 기존 `related`(RelatedLoans) 산정에 이어 `const discovery = await getLoanDiscovery(product)` 호출.
2. 렌더 위치: `<main>` 컬럼 안, `<RelatedLoans … />` **다음** 줄에 `<LoanDiscoverySection discovery={discovery} />` 추가.
3. ISR 유지: `revalidate = 86_400`. 인기 지역(스냅샷/가벼운 groupBy)·이번 주 청약(1주 범위 쿼리) 모두 24h 캐시 허용(디스커버리 위젯이라 최대 하루 staleness 무방).
4. 견고성: `getLoanDiscovery` 내부 쿼리 실패가 페이지를 죽이지 않도록 try/catch로 빈 값(`popularRegions: []`, `weeklySubscriptions: []`)으로 폴백. 빈 값이면 섹션은 가능한 블록만 렌더(둘 다 비면 `LoanDiscoverySection`이 `null` 반환).

## 빈 상태 정리

| 상황 | 동작 |
|---|---|
| 지역 케이스, 그 시도 인기 시군구 0 | 전국 인기 시군구로 폴백(라벨 "전국 인기 지역") |
| 전국 스냅샷도 0(초기/장애) | 블록① 미렌더 |
| 이번 주 청약 0 | 블록② = "이번 주 예정된 청약이 없습니다" + 전체 청약 링크 |
| 두 블록 모두 비어있음 | `LoanDiscoverySection` → `null` |

## 접근성 / 브랜드

- pill·청약 카드 모두 `<Link>` 키보드 접근. 청약 배지는 색+텍스트 병행(*색 의존 금지*).
- *Sourced-Number Rule*: 노출 데이터(인기 지역·청약)는 하단 `SourceCaption`으로 출처 귀속.
- *Quiet-Surface / One-Shadow*: 틴트 면 1겹, 그림자 없음, 색 강조는 Signal Blue 한 종으로 절제. "급매"류 과장 어휘·프로모션 강조 금지.
- *14px Floor*: 본문 텍스트 14px 이상, `text-xs`는 pill·배지·캡션 라벨에 한정.

## 테스트

- `tests/lib/loan-discovery.test.ts` — `getLoanDiscovery` 분기(순수 로직 부분은 region 해석을 분리해 단위 테스트):
  - `regionTags=['전국']` → `isNationwide: true`, 전국 스냅샷 사용.
  - `regionTags=['강원']` + 시군구 있음 → `label: '강원'`, `isNationwide: false`.
  - `regionTags=['경남','울산']` → `label: '경남·울산'`.
  - 시도 태그 있으나 인기 시군구 0 → 전국 폴백(`label: '전국'`).
  - `regionTags=['전국(농어촌)']` → 시도 아님 → 전국.
- `getPopularSigungusBySido`: 시도 prefix 필터·정렬·limit·라벨링(일반구 통합시 누락 없음) 검증(기존 `getPopularSigungus` 테스트 패턴 준수).
- 청약 평탄화 헬퍼: 일자 버킷 펼침·중복 제거·진행중/예정 우선 정렬·limit.
- 컴포넌트 빈 상태(블록 미렌더·`null` 반환) 회귀.

## 범위 밖 (YAGNI)

- 청약 블록의 지역 분기(전국 고정으로 결정).
- 실거래가 블록을 개별 단지(`/apt/[id]`) 카드로 보여주기(인기 지역 시군구 pill로 결정).
- ETL/스냅샷 확장으로 지역 인기 시군구 사전계산(B안 — 채택 안 함). 필요 시 후속 과제.
- 인기 기준 윈도우 통일(90일 vs 12개월 — 의도된 트레이드오프).
- 디스커버리 클릭 로깅/분석, 개인화.
- 신규 DB 필드·마이그레이션·ingest 변경.
