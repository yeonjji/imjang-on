# 대출상품(/finance) UI 통일 — 설계

날짜: 2026-06-14
브랜치: `feat/finance-ui-consistency`

## 배경 / 문제

`/finance` 리스트·상세가 청약·학교 등 다른 페이지의 하우스 패턴과 동떨어져 있다.
- 리스트: 히어로 없음, 원시 체크박스 사이드바, 2열 빈약한 카드(작은 라운드·그림자 없음), 모바일 필터 시트 없음.
- 상세: 밋밋한 단일 컬럼.

## 목표 (사용자 요청)

1. 필터를 **셀렉트 기반**으로 (모바일 선택 편의 1순위).
2. 리스트를 **2열 → 1열**.
3. 상세를 다른 상세 페이지와 **통일**.

## 결정 사항

- **필터 UI (안 A):** `자금용도/기관/지역/대상` 각 **네이티브 `<select>`** → 선택 시 "적용된 필터" 줄에 제거 가능한 칩으로 누적(**다중선택 유지**). 네이티브 select는 모바일에서 OS 피커를 띄워 값이 많아도 쉬움. 카운트는 옵션 텍스트에 `운영·시설 (90)` 형태.
- **모바일:** 청약과 동일한 `BottomSheet` 필터 시트.
- **상세:** 히어로 카드 + 2단(본문 섹션 카드 + 키팩트 사이드바). 대출은 좌표가 없어 지도·주변시세 섹션은 없음.

## 아키텍처 원칙

대출 목록은 **클라이언트 사이드 필터링(ISR 유지)** 구조를 보존한다. 청약처럼 서버사이드 필터링으로 바꾸지 않고 **UI 외형만** 하우스 패턴으로 맞춘다. `LoanExplorer`(클라이언트)가 `criteria` 상태를 소유하고, 데스크톱 사이드바 패널과 모바일 시트가 같은 상태에 바인딩된다. 필터링은 즉시 반영(live).

## 변경/신규 파일

### 리스트
- `finance/page.tsx` (수정): 브레드크럼 + 히어로 카드 추가, `LoanExplorer` 렌더. 데이터 로딩(`getLoanSummaries`/`collectFacets`)·메타·`revalidate` 유지.
- `finance/_components/loan-explorer.tsx` (재작성): criteria 소유, 데스크톱 sticky 사이드바 + 모바일 시트 + **1열 리스트** + 정렬 셀렉트. URL read/write(history.replaceState) 기존 로직 유지.
- `finance/_components/loan-filter-panel.tsx` (신규): 상품명 검색 input + facet별 add-select + 적용된 필터 칩(제거) + 초기화. 제어 컴포넌트(`criteria`, `onChange`).
- `finance/_components/loan-mobile-filter-sheet.tsx` (신규): `BottomSheet`로 패널 래핑, "필터" 버튼(활성 개수 뱃지), 푸터 "결과 N개 보기"(닫기).
- `finance/_components/loan-card.tsx` (재작성): 하우스 카드(rounded-22, `--shadow-soft`, Badge로 usage 태그, 한도 강조). 1열 가로 배치.

### 상세
- `finance/[seq]/page.tsx` (수정): 히어로 + `lg:grid-cols-[minmax(0,1fr)_320px]` 2단. 본문은 `LOAN_SECTIONS`를 `Card`로 감싸 섹션화. JSON-LD 브레드크럼·`SourceCaption`·`generateStaticParams`·메타 유지.
- `finance/[seq]/_components/loan-hero.tsx` (신규): 청약 히어로 톤(블루→스카이 그라데이션), eyebrow + 상품명 + 기관 + usage 배지.
- `finance/[seq]/_components/loan-sidebar.tsx` (신규): 핵심 정보(한도·금리·금리구분·대상·제공기관) Card + 관련 사이트 바로가기 Card.

## 디자인 가이드 준수

- 카드 22px 라운드, 그림자는 `--shadow-soft` 하나(One-Shadow Rule).
- 한글 본문 14px 이상(text-xs는 배지·라벨만).
- 색 강조는 Signal Blue 절제. 히어로 그라데이션은 기존 `SubscriptionHero`와 동일 패턴(하우스 표준).
- 출처 캡션(`SourceCaption ids={['kinfa-loan']}`) 유지.

## 범위 밖 (YAGNI)

서버사이드 필터링 전환, 페이지네이션(클라 필터라 불필요), 정렬 옵션 추가, 좌표/주변시세 섹션.

## 검증

- `pnpm lint` + 타입체크 통과.
- 데스크톱: sticky 사이드바 셀렉트로 필터 추가/칩 제거, 1열 리스트, 정렬.
- 모바일: 필터 버튼 → 바텀시트 → 셀렉트(OS 피커) 선택 → 결과 반영.
- 상세: 히어로 + 사이드바 + 섹션 카드 렌더, 관련 사이트 링크.
