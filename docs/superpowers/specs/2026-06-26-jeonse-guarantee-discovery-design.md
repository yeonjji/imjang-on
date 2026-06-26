# 전세자금보증 상세 — "더 살펴보기" 디스커버리 섹션 설계

- **날짜:** 2026-06-26
- **대상 페이지:** `app/(public)/jeonse-guarantee/[grntDvcd]/page.tsx`
- **상태:** 설계 확정 대기

## 1. 목표 & 배경

HF 전세자금보증 상품 상세 페이지 하단에, 사이트의 다른 핵심 데이터로 이어주는 **카드형 디스커버리 섹션**과 **임장ON 브리핑(보드) 최신 글 4건**을 추가한다. 단순 "바로가기" 링크가 아니라, 데이터가 있는 영역은 카드에 실데이터 일부를 노출한다.

연결 대상(사용자 요청): ① 실거래가 ② 청약 ③ 다른 서민금융 대출상품 ④ 생활편의 + 하단 임장ON 브리핑 4건.

## 2. 핵심 제약: 이 페이지에는 단일 지역 앵커가 없다

전세자금보증 상품은 **전국 대상**이며, 페이지가 가진 지역 정보는 "지역별 최대 임차보증금" 다건 표뿐이다. 즉 "내 동네" 좌표/시군구가 없다. 결론:

- **실거래가·청약**: 좌표 없이 조회 가능한 **전국 기준** 티저만 노출.
- **생활편의**: 모든 실데이터(학교·병원·지하철)가 좌표 스코프라 **실데이터를 못 보여준다** → 데이터 없는 **둘러보기 안내 카드**로 처리(가짜 "내 동네" 데이터를 만들지 않는다 — 정직성 원칙).
- **서민금융 대출상품**: 상품 속성(목적=전세, 대상=청년/신혼부부)으로 **연관 매칭**이 가능 → 유일하게 진짜 맥락형.

사용자 승인(2026-06-26): "전국 실데이터 + 생활편의는 둘러보기 카드" 방식.

## 3. 전체 구조 (배치)

현재 페이지는 컨테이너 `div.mx-auto.max-w-[1180px].px-6.py-12` 안에 `nav → 타이틀 → 2단 그리드(lg:grid-cols-[minmax(0,1fr)_320px])` 순. 2단 그리드의 닫는 `</div>` **뒤, 컨테이너 안**에 두 블록을 full-width로 추가한다. `app/(public)/finance/[seq]`의 `LoanDiscoverySection` 패턴을 따른다.

```
[기존 2단 레이아웃]
   ↓ mt-10
┌─ section.rounded-[22px].bg-[var(--color-soft)].p-5 sm:p-6 ─────┐
│  h2  임장ON에서 더 살펴보기                                      │
│  ── 실거래가 (전국 브리핑 미니카드)         더 보기 → /list?deal=jeonse
│  ──────────────────────────────────────────────────────────── │
│  ── 청약 (가장 가까운 1건)                  전체 청약 → /subscription
│  ──────────────────────────────────────────────────────────── │
│  ── 다른 서민금융 대출상품 (연관 최대 3건)   더 보기 → /finance  │
│  ──────────────────────────────────────────────────────────── │
│  ── 생활편의 (둘러보기 안내 카드)            둘러보기 → /life    │
│  SourceCaption ['molit-rtms','applyhome','lh-presub','kinfa-loan'] │
└────────────────────────────────────────────────────────────────┘
   ↓ mt-10
BoardBriefingSection (heading="임장ON 브리핑", 최신 published 4건 카드)
```

각 토픽은 세로 스택 서브섹션(구분선 `border-t border-[var(--color-line)]`로 분리). 4개 다 데이터 없으면(드물게) 디스커버리 섹션 전체 미렌더; 보드 섹션은 독립적으로 자체 렌더 판단.

## 4. 컴포넌트 / 재사용 맵

| 역할 | 신규/재사용 | 위치 |
|---|---|---|
| 디스커버리 섹션 컨테이너 | **신규** `JeonseDiscoverySection` | `app/(public)/jeonse-guarantee/[grntDvcd]/_components/jeonse-discovery-section.tsx` |
| 실거래가 미니카드 | **신규** 소형 카드(브리핑 summary 렌더) | 위 파일 내부 또는 같은 `_components/` |
| 청약 카드 | **재사용** `SubscriptionBoardItem` | `app/(public)/_components/subscription-board-item.tsx` |
| 서민금융 카드 | **재사용** `RelatedLoanCard` | `app/(public)/finance/[seq]/_components/related-loan-card.tsx` |
| 생활편의 안내 카드 | **신규** 소형 nav 카드 | 위 디스커버리 파일 내부 |
| 보드 섹션 | **재사용** `BoardBriefingSection` | `app/(public)/_components/board-briefing-section.tsx` |
| 출처 캡션 | **재사용** `SourceCaption` | `components/ui/source-caption.tsx` |

> `RelatedLoans`(섹션 래퍼)는 자체 heading("함께 비교할 만한 상품")·source caption을 갖고 있어 서브섹션엔 부적합 → **카드(`RelatedLoanCard`)만** 재사용한다.
> `MarketBriefing`(홈 컴포넌트)은 mt-16·다중 카드·해시태그를 가진 대형 블록이라 그대로 못 쓴다 → 같은 데이터 타입(`MarketBriefing`)에서 **compact 미니카드를 새로 만든다**.

## 5. 네 디스커버리 카드 (상세)

### 5.1 실거래가 (전국 브리핑 미니카드)

- **데이터:** `getTransactionTeaser()` (`lib/board/detail-teasers.ts`) → `MarketBriefing | null`. 일일 사전계산 스냅샷, 전역, 캐시. 실패 시 null.
- **렌더 필드(`briefing.summary`):**
  - `txCount` — "오늘 전국 {n.toLocaleString('ko-KR')}건" (전국 매매 신고분)
  - `highest` {`slug`, `propertyId`, `propertyName`, `regionLabel`, `amountManwon`} — "최고가 {formatBillion(amountManwon)} · {regionLabel} {propertyName}", 링크 `/${slug}/${propertyId}` (slug ∈ apt|officetel|villa)
  - `topRegion` {`label`,`count`} — "인기 {label} {count}건", 링크 `/list?region={code}&sido=...`(브리핑 컴포넌트의 `listRegionHref` 패턴)
- **레이아웃:** 한 장의 카드. 내부는 2~3개 미니 타일(거래건수 / 최고가 / 인기지역). 모바일 세로 스택, sm+ 가로.
- **더보기:** "전세 실거래가 더 보기 →" `/list?deal=jeonse` (전세 상품 맥락에 맞춤. DealFilter='jeonse').
- **트레이드오프(문서화):** 전역 브리핑은 매매 중심이라 전세 페이지에서 주제적으로 약간 느슨하다. 더보기를 전세 목록으로 보내 보완한다. 향후 전역 전세 집계가 생기면 교체.

### 5.2 청약 (가장 가까운 1건)

- **데이터:** `getSubscriptionTeaser()` → `{ item: SubscriptionListItem, status: 'OPEN'|'UPCOMING' } | null`. OPEN 우선, 없으면 UPCOMING. 전역. 실패/무 시 null.
- **렌더:** 기존 `SubscriptionBoardItem`에 `item` 전달(공고명·지역·D-day·분양가·면적 표시는 컴포넌트가 처리). 1단 그리드(단건).
- **더보기:** "전체 청약 →" `/subscription`.
- **무 데이터 처리:** teaser null이면 이 서브섹션 미렌더(LoanDiscoverySection은 "이번 주 청약 없음" 문구를 쓰지만, 여기선 빈 서브섹션 숨김으로 통일).

### 5.3 다른 서민금융 대출상품 (연관 최대 3건)

- **데이터:** `getLoanSummaries()` → `LoanSummary[]` (전역, ~100+건). 이어서 `recommendLoans(synthetic, all, 3)` (`lib/loan/related.ts`).
- **synthetic `LoanSummary`(이 상품을 표현):**
  ```ts
  {
    seq: -1,                              // 실제 대출과 충돌 없는 센티넬(자기 제외용)
    finprdnm: product.rcmdProdNm,
    ofrinstnm: '한국주택금융공사',
    instCtg: null,
    lnlmt: product.maxLoanLmtAmt != null ? Math.round(product.maxLoanLmtAmt / 10_000) : null, // 원→만원
    irt: null,
    usageTags: ['전세'],                  // usageSlugs → 'house'(주거·전월세) 매칭
    targetTags: product.grntReqTrgtDvcd === '01' ? ['청년']
              : product.grntReqTrgtDvcd === '02' ? ['신혼부부'] : [],
    regionTags: [],
  }
  ```
  - 매칭 근거: `USAGE_CATEGORIES`의 `house` 키워드에 '전세' 포함(`lib/loan/categories.ts:13`) → 'house' 공유 대출이 안정적으로 매칭됨. 청년('01')은 target 'youth'까지 매칭. 신혼부부('02')는 target 'etc'로 빠지지만 usage 매칭으로 결과는 확보.
- **렌더:** `RelatedLoanCard`(상품명·한도·summaryLine·금리·reason 배지). 링크 `/finance/{seq}`. 그리드 `grid-cols-1 sm:grid-cols-2`.
- **더보기:** "서민금융 더 보기 →" `/finance`.
- **검증 필수:** 구현 시 실제 대출 데이터로 `recommendLoans`가 ≥1건 반환하는지 확인. 만약 0건이면 폴백으로 `usageSlugs(loan.usageTags)`에 'house' 포함 대출 상위 3건 노출.

### 5.4 생활편의 (둘러보기 안내 카드)

- **데이터:** 없음(좌표 앵커 부재). 실데이터 카드 만들지 않는다.
- **렌더:** 한 장의 안내 카드 — 아이콘 + "학교·병원·지하철·마트, 우리 동네 생활편의" + 보조문구 "지역을 골라 둘러보세요". 우측 화살표.
- **링크:** 카드 전체 `/life` (생활편의 허브).

## 6. 임장ON 브리핑 (보드) 섹션

- **재사용:** `<BoardBriefingSection heading="임장ON 브리핑" className="mt-10" excludeId={undefined} />`.
- 컴포넌트가 내부에서 `getHomeLatestPosts(4)`로 최신 published 4건을 자체 조회, 반응형 카드(`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`)로 렌더. 보드 비공개(`isBoardPublic()` false)거나 글 0건이면 자동 미렌더.
- 브랜드명 "임장ON 브리핑"은 보드 리스트 페이지 h1과 동일(`app/(public)/board/page.tsx`).

## 7. 데이터 패칭 & 실패 처리

- 페이지(서버 컴포넌트)에서 `Promise.all([getTransactionTeaser(), getSubscriptionTeaser(), getLoanSummaries()])`로 병렬 조회 후, `recommendLoans`는 동기 계산. `BoardBriefingSection`은 async 서버 컴포넌트로 자체 패칭(스레딩 불필요).
- 각 teaser는 실패 시 `null` 반환(기존 헬퍼 동작) → 해당 서브섹션만 조용히 빠지고 나머지는 정상. 디스커버리 4개 전부 비면 섹션 전체 null.
- **렌더 전략:** `revalidate = 86_400` 유지. 티저는 하루 단위 갱신으로 충분(ISR 재검증 시 자동 갱신). `generateStaticParams`로 전 상품 정적 생성하는 현 구조와 호환(빌드/재검증 시 쿼리 수행).

## 8. 모바일 / 반응형 (1급 제약)

코드베이스 관행을 그대로 따른다(모바일-퍼스트: `grid-cols-1` → `sm:`/`lg:` 증강).

| 요소 | 모바일 (<640px) | sm+ (≥640px) | lg+ (≥1024px) |
|---|---|---|---|
| 디스커버리 4개 토픽 | 세로 스택(구분선) | 동일 | 동일 |
| 실거래가 미니 타일 | 세로 스택 | 가로 정렬 | — |
| 청약 카드 | 1단 | 1단(단건) | — |
| 서민금융 연관 카드 | `grid-cols-1` | `sm:grid-cols-2` | — |
| 생활편의 안내 카드 | full-width 1장 | 동일 | — |
| 보드 게시글 4건 | `grid-cols-1` | `sm:grid-cols-2` | `lg:grid-cols-4` |

- **bg-soft 래퍼 패딩:** `p-5 sm:p-6` (모바일 20px로 한 단계 완화).
- **헤더 + 더보기 링크:** 각 토픽 헤더는 `flex flex-wrap items-center justify-between gap-x-3 gap-y-1`, 링크에 `shrink-0` — 좁은 화면 자연 줄바꿈(잘림 방지).
- **가독성(14px Floor):** 카드 내 **읽는 데이터 텍스트는 `text-sm`(14px) 이상**. `text-xs`(12px)는 배지·날짜·출처·"더 보기" 라벨에만.
- **오버플로:** 단지명·공고명 `line-clamp-2`, 금액·지역 `truncate`+`break-keep`로 가로 스크롤 차단(재사용 카드가 이미 적용).
- **터치 타깃:** 카드 전체가 블록 링크(충분). 텍스트형 "더 보기"는 `py-1`로 탭 영역 확보(시각 동일).
- **검증:** 360 / 390 / 768px 폭에서 가로 스크롤 0, 읽는 텍스트 ≥14px, 더보기 줄바꿈 정상, 탭 영역 확인(Playwright 360·768 스냅샷).

## 9. 디자인 시스템 준수 (DESIGN.md / PRODUCT.md)

- 컬러·라운드·그림자 전부 기존 토큰: `--color-soft`, `--color-line`, `--color-blue`, `--color-blue-dark`, `rounded-[22px]`, `--shadow-soft`. 새 그림자·그라데이션 금지(The One-Shadow Rule).
- 모든 핵심 수치에 `SourceCaption`(The Sourced-Number Rule).
- 강조는 위계·여백·굵기로. 과장 카피·자극색 금지(The Quiet-Surface Rule).
- 생활편의는 "데이터 없는데 데이터인 척" 하지 않는다 — 명시적 둘러보기 카드(정직성).
- 섹션 heading 관행: `text-lg font-bold text-[var(--color-blue-dark)]`(서브섹션 h3는 `text-sm font-bold text-[var(--color-text)]`).

## 10. 출처(SourceCaption)

디스커버리 섹션 하단 1개: `<SourceCaption ids={['molit-rtms','applyhome','lh-presub','kinfa-loan']} />`.
보드 섹션은 보도자료 기반이라 별도 출처 캡션 없이 컴포넌트 기본 부제("공공기관 보도자료·고시를 사실 위주로 정리")로 충분.

## 11. 파일 변경 (예상)

- **신규:** `app/(public)/jeonse-guarantee/[grntDvcd]/_components/jeonse-discovery-section.tsx`
  - `JeonseDiscoverySection` (props: briefing·subscriptionTeaser·relatedLoans), 내부에 실거래가 미니카드 + 생활편의 안내 카드 소형 컴포넌트 포함.
- **수정:** `app/(public)/jeonse-guarantee/[grntDvcd]/page.tsx`
  - 상단 import 추가, 본문에서 teaser 3종 병렬 조회 + synthetic LoanSummary 구성 + `recommendLoans`.
  - 2단 그리드 뒤에 `<JeonseDiscoverySection .../>`와 `<BoardBriefingSection heading="임장ON 브리핑" className="mt-10" />` 렌더.
- **재사용(수정 없음):** `SubscriptionBoardItem`, `RelatedLoanCard`, `BoardBriefingSection`, `SourceCaption`, `getTransactionTeaser`, `getSubscriptionTeaser`, `getLoanSummaries`, `recommendLoans`.

## 12. 비목표 (Out of scope)

- 지역 선택 UI / 좌표 기반 nearby 생활편의 표시(스코프 확대, 별도 과제).
- 전역 전세 전용 실거래 집계 신설(현재 매매 브리핑 재사용).
- 기존 재사용 컴포넌트의 스타일 리팩터(예: `RelatedLoanCard`의 `hover:shadow-lg`)는 건드리지 않는다(surgical change).
- 보드 카테고리 필터링(최신 4건 그대로).

## 13. 성공 기준 & 검증

1. 상세 페이지 하단에 디스커버리 섹션 + 임장ON 브리핑 4건이 렌더된다.
2. 실거래가·청약·서민금융 카드에 실데이터 일부가 보인다(바로가기 텍스트만이 아님).
3. 생활편의는 `/life`로 가는 안내 카드(실데이터 없음, 명시적).
4. 각 데이터 조회 실패 시 해당 카드만 빠지고 페이지는 정상(런타임 에러 없음).
5. 360 / 768 / 1280px에서 레이아웃 정상(가로 스크롤 0, 14px floor 준수).
6. `recommendLoans`가 실데이터로 ≥1건 반환(아니면 폴백 동작).
7. `pnpm build`(또는 타입체크/lint) 통과, 기존 jeonse-guarantee 테스트 무영향.
