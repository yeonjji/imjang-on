# 서민금융 대출상품 상세 — "조건 기반 추천 상품" 섹션 설계

- 작성일: 2026-06-17
- 대상 화면: 서민금융 대출상품 상세 (`app/(public)/finance/[seq]/page.tsx`)
- 목표: 현재 보고 있는 상품과 조건이 비슷하거나 함께 비교할 만한 다른 대출상품을, 기존 공개 태그로 산정해 하단 보조 섹션으로 노출한다.

## 배경 / 데이터 현황

요청된 추천 기준 6개 중 **구조화 필드로 깔끔하게 받쳐주는 건 3개**다. 나머지는 `rawJson` 자유텍스트라 신뢰성 있는 매칭이 어렵다.

| 요청 기준 | 데이터 실체 | 매칭 |
|---|---|---|
| 대출목적 / 주거목적 | `usageTags`(원본 `usge`) → `USAGE_CATEGORIES` 5종(창업·운영/주거·전월세/학자금/대환·전환/생활안정) | ✅ 구조화 |
| 지원대상 | `targetTags`(원본 `trgt`) → `TARGET_CATEGORIES` 5종(청년·대학생/소상공인·자영업/근로자·연금/금융취약·채무조정/기타) | ✅ 구조화 |
| (지역) | `regionTags`(시도) | ✅ 구조화 |
| 연령 | `rawJson.age` — 자유텍스트("만 19~34세" 류) | ⚠️ target=청년으로 흡수 |
| 근로형태 | 별도 필드 없음 | ⚠️ target(근로자/자영업) 프록시 |
| 소득 | `rawJson.incm` — 자유텍스트, 표기 들쭉날쭉 | ❌ 제외 |

확정 방향(승인됨): **A안 — 구조화된 파생 카테고리(usage·target)+지역+한도로 유사도 점수화.** 스키마·ingest 변경 없음. `age`/`incm` 파싱 구조화는 범위 밖.

데이터 규모: 서민금융 상품은 소량(수백 건)이며 목록 페이지가 이미 `getLoanSummaries()`로 전량을 메모리에 올려 in-memory 필터링한다. 추천도 동일하게 전량 로드 후 메모리 점수화한다. 상세는 ISR(`revalidate 86_400`)이라 빌드/재검증 시 1회 수행된다.

## 매칭 로직 — `lib/loan/related.ts` (순수 함수, DB 무관)

임의 상품 x에 대한 파생 집합:

- `U(x)` = `new Set(usageSlugs(x.usageTags))` — 비어 있을 수 있음(폴백 없음).
- `T(x)` = `new Set(targetSlugs(x.targetTags))` **에서 `'etc'` 제외** — `targetSlugs`는 미분류 시 `'etc'`로 폴백하므로, `'etc'`는 의미 있는 공통점으로 보지 않는다.
- `R(x)` = `new Set(x.regionTags)`.

현재 상품 P, 후보 C(`C.seq !== P.seq`)에 대해:

- `sharedU` = `|U(P) ∩ U(C)|`
- `sharedT` = `|T(P) ∩ T(C)|`  (etc 제외 후)
- `sharedRegion` = `(R(P) ∩ R(C))` 비어있지 않으면 1, 아니면 0
- **후보 자격**: `sharedU + sharedT >= 1` (usage 또는 etc-제외 target을 최소 1개 공유). 지역·한도만 겹치는 건 제외.
- **점수**: `score = 2*sharedU + 2*sharedT + 1*sharedRegion`
- **한도 근접(tie-break)**: `lnlmtDelta = (P.lnlmt != null && C.lnlmt != null) ? Math.abs(P.lnlmt - C.lnlmt) : Number.POSITIVE_INFINITY`

**정렬**: `score` desc → `lnlmtDelta` asc → `finprdnm` asc(`localeCompare(…, 'ko')`).
**개수**: 상위 **최대 4개**(`MAX_RELATED = 4` 상수, 요청 3~5 범위 내). 자격 후보 0개면 빈 배열.

반환:

```ts
export interface RelatedLoanReason {
  kind: 'usage' | 'target' | 'region';
  label: string; // 예: '같은 목적·주거·전월세', '같은 대상·청년·대학생', '같은 지역'
}
export interface RelatedLoan extends LoanSummary {
  reasons: RelatedLoanReason[]; // 최대 2개
  summaryLine: string;
}
export function recommendLoans(
  current: LoanSummary,
  all: LoanSummary[],
  max?: number, // 기본 MAX_RELATED(4)
): RelatedLoan[];
```

### 추천 이유 배지(`reasons`) 생성

매칭된 차원에서 우선순위 순으로 만들고 **앞에서 2개만** 취한다(강조 절제 — *Weight-Not-Family*/조용한 표면).

1. 공유 usage 슬러그마다 → `{ kind:'usage', label:'같은 목적·' + USAGE 라벨 }` (def 순서)
2. 공유 target 슬러그(etc 제외)마다 → `{ kind:'target', label:'같은 대상·' + TARGET 라벨 }` (def 순서)
3. `sharedRegion`이면 → `{ kind:'region', label:'같은 지역' }`

`reasons = [...usage, ...target, ...region].slice(0, 2)`. 자격 조건상 최소 1개는 보장된다.

### 한 줄 요약(`summaryLine`) 생성 — 후보 C 자신의 태그 조합

C의 **자기 정체성**을 한 줄로(배지는 P와의 교집합, 요약은 C가 무엇인지 — 역할 구분; 일부 겹침은 승인된 트레이드오프).

- `usageLabels` = `U(C)`의 USAGE 라벨(def 순서), `targetLabels` = `T(C)`(etc 제외)의 TARGET 라벨(def 순서).
- 조립: `parts = []`; usageLabels 있으면 `parts.push(usageLabels.join('·'))`; targetLabels 있으면 `parts.push(targetLabels.join('·') + ' 대상')`; `summaryLine = parts.join(' · ')`.
  - 예: `"주거·전월세 · 청년·대학생 대상"`.
- 둘 다 비면(usage 없음 + target 전부 etc) 폴백: 후보 C의 `ofrinstnm ?? '서민금융 대출상품'`.

슬러그→라벨 변환은 `categories.ts`에 작은 헬퍼(`labelOf(slug, defs)`)를 추가하거나 def 배열에서 조회해 재사용한다.

## 카드 표시 항목 — `_components/related-loan-card.tsx`

```
┌──────────────────────────────────────────────┐
│ 청년 전월세보증금 대출            한도 7,000만원 │  ← finprdnm + lnlmt
│ 주거·전월세 · 청년·대학생 대상                   │  ← summaryLine
│ 금리 연 1.2~2.1%                                │  ← irt 원문(있을 때만)
│ [같은 목적·주거·전월세] [같은 대상·청년·대학생]   │  ← reasons(최대 2), Badge tone="blue"
└──────────────────────────────────────────────┘
```

- 카드 전체 `<Link href={`/finance/${seq}`}>`. 스타일은 기존 `LoanCard` 토큰과 일치: `rounded-[22px] border border-[var(--color-line)] bg-white shadow-[var(--shadow-soft)]`, hover 상승.
- 한도: `한도 {lnlmt.toLocaleString()}만원`(있을 때). 금리: `금리 {irt}`(있을 때). 배지: 색+텍스트 병행(색 의존 금지).
- 별도 카드 컴포넌트로 두는 이유: 기존 `LoanCard`는 요약줄·금리·이유 배지를 표현하지 않으며, 요구 항목이 달라 확장보다 전용 카드가 단순하다.

## 섹션 컴포넌트 — `_components/related-loans.tsx`

Props: `{ items: RelatedLoan[] }`.

- `items.length === 0` 이면 `return null`(빈 박스 미렌더).
- 헤더: `함께 비교할 만한 상품`(과장 없는 톤). 카드 그리드: `grid grid-cols-1 gap-4 sm:grid-cols-2`.
- 하단에 `<SourceCaption ids={['kinfa-loan']} />` + "추천 순서는 임장온이 공개 태그(목적·대상·지역)로 산정" 한 줄 주석(우리 산정임을 명시 — 출처 수치와 산정 로직 구분).

## 데이터 흐름 / 페이지 연결 — `page.tsx`

1. 기존대로 `const product = await getLoanProduct(Number(seq))`; `if (!product) notFound()`.
2. 그 후 `const all = await getLoanSummaries()`.
3. `product`에서 `LoanSummary` 형태(`seq, finprdnm, ofrinstnm, instCtg, lnlmt, irt, usageTags, targetTags, regionTags`)를 구성해 `recommendLoans(currentSummary, all, MAX_RELATED)` 호출.
4. 렌더 위치: 상세 본문 그리드(`<main>`+`<aside>`) **다음**, 페이지 컨테이너(`max-w-[1180px]`) **하단**에 전체 폭으로 `<RelatedLoans items={related} />` 삽입(가로 카드 묶음이라 좁은 main 컬럼보다 전체 폭이 적합).

`getLoanSummaries()`가 전량을 로드하지만 데이터가 소량이고 ISR 캐시되므로 추가 부담은 무시할 수준이다.

## 빈 상태

- 자격 후보 0개(공통 usage/target 없음) → 섹션 미렌더(`return null`). 별도 "추천 없음" 문구는 두지 않는다.

## 접근성 / 브랜드

- 카드 `<Link>` 키보드 접근, 배지는 색+텍스트.
- *Sourced-Number Rule*: 노출 한도·금리는 `kinfa-loan` 출처 캡션으로 귀속. 추천 순서는 산정 로직임을 캡션에 명시.
- *One-Shadow / Quiet-Surface*: 카드 그림자 `--shadow-soft` 하나, 색 강조는 Signal Blue 배지로 절제.

## 테스트

`tests/lib/loan-related.test.ts`(기존 `loan-list`/`loan-detail` 평면 네이밍 준수) — `recommendLoans` 순수 단위 테스트:

- 동일 상품(`current.seq`) 결과에서 제외.
- usage 공유 후보가 지역만 겹치는 후보보다 상위.
- target `'etc'`만 공유 → 비자격(미노출). 지역-only / 한도-only → 비자격.
- `max` 초과 시 cap, 점수 동률은 한도 근접 → 상품명 순.
- 자격 0개 → `[]`.
- `reasons` 최대 2개·usage 우선. `summaryLine` 포맷(usage+target 조합, 폴백).

## 범위 밖 (YAGNI)

- `rawJson.age`/`incm` 자유텍스트 파싱·구조화, 소득 기반 매칭(A안에서 제외).
- 로그인 사용자 프로필 기반 개인화 — 상품↔상품 유사도만.
- 신규 DB 필드·마이그레이션·ingest 변경.
- 추천 클릭 로깅/분석.
