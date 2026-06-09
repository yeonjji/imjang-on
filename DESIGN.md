---
name: imjang-on
description: 공공데이터 부동산 정보를 신뢰할 수 있게 검색·탐색하는 통합 플랫폼
colors:
  blue: "#2563eb"
  blue-dark: "#1e3a8a"
  sky: "#38bdf8"
  sky-soft: "#e0f2fe"
  bg: "#f7fbff"
  card: "#ffffff"
  soft: "#f1f7ff"
  text: "#172033"
  muted: "#64748b"
  line: "#dbeafe"
  green: "#0f9f6e"
  red: "#ef4444"
typography:
  display:
    fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', sans-serif"
    fontSize: "2.25rem"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Pretendard, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Pretendard, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Pretendard, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Pretendard, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.3
rounded:
  field: "12px"
  card: "22px"
  pill: "9999px"
spacing:
  card-padding: "24px"
  field-x: "16px"
  field-y: "10px"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.card}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.blue-dark}"
    textColor: "{colors.card}"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.blue-dark}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
  chip-active:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.card}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  chip-inactive:
    backgroundColor: "{colors.card}"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
    padding: "{spacing.card-padding}"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.field}"
    padding: "10px 16px"
  badge-blue:
    backgroundColor: "{colors.sky-soft}"
    textColor: "{colors.blue-dark}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
---

# Design System: imjang-on

## 1. Overview

**Creative North Star: "공공기록의 열람실"**

imjang-on은 흩어진 정부 부동산 데이터(실거래가, 청약, 학군·생활 인프라)를 한 곳에 모아 보여주는 열람실이다. 조용하고 단단하다. 인터페이스는 자신을 내세우지 않고, 데이터와 그 출처를 또렷하게 비춘다. 맑은 블루 계열의 차분한 바탕 위에 흰 카드가 떠 있고, 그림자는 종이가 책상 위에 살짝 들린 정도로만 옅게 깔린다. 모든 숫자 옆에는 어디서 온 값인지가 적혀 있다. 신뢰는 장식이 아니라 출처와 정확성에서 나온다.

이 시스템은 두 부류의 방문자를 같은 화면에서 맞는다. 이사·매수를 앞두고 단지를 깊게 파고드는 검토자에게는 상세와 출처를, 시세·동향을 둘러보는 탐색층에게는 빠른 검색과 한눈 요약을 동시에 내준다. 강조는 색을 켜거나 점멸시켜서가 아니라 위계와 여백, 굵기 대비로 만든다.

명시적으로 거부하는 것: 빨간 "급매!" 배너와 과장 카피로 사람을 부추기는 **자극적 부동산 광고**의 어휘, 그리고 보라/파랑 그라데이션·똑같은 카드 그리드·히어로-메트릭 템플릿으로 대표되는 **전형적 AI SaaS 룩**.

**Key Characteristics:**
- 맑은 블루 바탕(#f7fbff) 위에 흰 카드, 옅은 블루 틴트 그림자
- 단일 패밀리(Pretendard)를 굵기 대비로 운용하는 타이포
- 알약형(pill) 버튼·칩, 22px 둥근 카드
- 색은 정보 전달용(거래유형·상태)이며 분위기 연출용이 아니다
- 모든 핵심 수치에 출처 캡션이 따라붙는다

## 2. Colors

맑고 차가운 블루 단색 위주에, 정보 구분을 위한 시맨틱 색을 최소한으로 더한 절제된 팔레트.

### Primary
- **Signal Blue** (#2563eb): 1차 행동·활성 상태·링크의 핵심 색. 버튼 기본, 활성 칩, 강조 텍스트. 화면에서 가장 의지가 실린 색이다.
- **Deep Archive Blue** (#1e3a8a): 제목·헤딩과 버튼 hover의 짙은 블루. 위계의 최상단과 눌림 상태를 나타낸다.

### Secondary
- **Sky** (#38bdf8) / **Sky Soft** (#e0f2fe): 보조 강조와 정보 배지(파랑 톤) 배경, 입력 포커스 링. 가볍게 환기하는 역할.

### Tertiary
- **Verify Green** (#0f9f6e): 전세 등 긍정·정상 상태. **Alert Red** (#ef4444): 오류·경고. 둘 다 정보 구분 목적에 한정.

### Neutral
- **Ink** (#172033): 본문 기본 텍스트. 배경 대비 충분(≥4.5:1).
- **Muted Slate** (#64748b): 보조 텍스트·플레이스홀더. 흰 배경에서만 본문급으로 쓰고, 틴트 배경 위에서는 본문에 쓰지 않는다.
- **Reading-Room Blue** (#f7fbff): 페이지 바탕. 흰색이 아니라 아주 옅은 블루 틴트.
- **Soft Blue** (#f1f7ff): 카드 내부 구획·hover 면.
- **Line** (#dbeafe): 보더·구분선. 블루 계열의 옅은 선.
- **Card White** (#ffffff): 카드·입력·표면.

### Named Rules
**The Sourced-Number Rule.** 화면에 노출되는 모든 핵심 수치에는 출처(`lib/data-sources.ts` 레지스트리 + SourceCaption)가 인라인으로 붙는다. 출처 없는 숫자는 두지 않는다.

**The Quiet-Surface Rule.** 바탕은 자극하지 않는다. 빨강·주황은 거래유형/경고 같은 정보 신호에만 쓰고, 프로모션·어그로 목적의 강조색으로는 절대 쓰지 않는다.

## 3. Typography

**Display / Body / Label Font:** Pretendard (fallback: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif)

**Character:** 단일 한글 최적화 산세리프를 굵기 대비로만 운용한다. 별도의 디스플레이 서체를 더하지 않는다. 위계는 폰트 교체가 아니라 크기·굵기 단계로 만든다(`font-black`/`bold`/`semibold`/`normal`). 한글 본문 가독성을 위해 본문은 14px 이상을 기본으로 한다.

### Hierarchy
- **Display** (800, 2.25rem / `text-4xl`, lh 1.15, -0.02em): 히어로·페이지 최상단 헤딩. 큰 한글 단어가 좁은 그리드에서 넘치지 않는지 모든 브레이크포인트에서 확인.
- **Headline** (700, 1.5rem / `text-2xl`, lh 1.25): 섹션 대제목.
- **Title** (700, 1.125rem / `text-lg`, lh 1.3, Deep Archive Blue): 카드 제목(`CardTitle`)·서브섹션.
- **Body** (400, 0.875rem / `text-sm`~`15px`, lh 1.6): 본문·설명. 긴 산문은 65–75ch로 제한.
- **Label** (700, 0.75rem / `text-xs`, lh 1.3): 메타·캡션·배지 텍스트. 한글이므로 ALL CAPS는 쓰지 않는다.

### Named Rules
**The 14px Floor Rule.** 한글 본문 텍스트는 14px 미만으로 두지 않는다. `text-xs`(12px)는 라벨·캡션·배지에 한정하고 읽어야 하는 문장에는 쓰지 않는다.

**The Weight-Not-Family Rule.** 위계와 강조는 두 번째 서체가 아니라 굵기·크기로만 만든다. 폰트 패밀리는 하나다.

## 4. Elevation

거의 평평하다. 깊이는 두 가지로만 표현한다: 흰 카드와 옅은 블루 바탕의 톤 차이, 그리고 단 하나의 옅은 블루 틴트 그림자. 검정 그림자는 쓰지 않는다.

### Shadow Vocabulary
- **Soft Lift** (`box-shadow: 0 14px 34px rgba(37, 99, 235, 0.10)`): 카드·드롭다운·모달·바텀시트의 유일한 그림자(`--shadow-soft`). 색이 블루 계열이라 바탕과 한 몸처럼 떠 있는 느낌을 준다.

### Named Rules
**The One-Shadow Rule.** 그림자는 `--shadow-soft` 하나뿐이다. 표면마다 새 그림자를 만들지 않는다. 로고·아이콘·배지·바탕에는 그림자를 얹지 않는다.

## 5. Components

### Buttons
- **Shape:** 알약형(`rounded-full`). 모든 버튼은 완전한 둥근 모서리.
- **Primary:** Signal Blue 배경 + 흰 텍스트, `px-4 py-2.5`(md), `font-bold`. 1차 행동.
- **Hover / Focus:** hover 시 Deep Archive Blue로 어두워짐(`transition`). disabled는 `opacity-50` + `cursor-not-allowed`.
- **Secondary:** 흰 배경 + Deep Archive Blue 텍스트 + Line 보더, hover 시 Soft Blue 면.
- **Ghost:** 투명 배경 + Muted 텍스트, hover 시 Ink로 진해짐.
- **Sizes:** sm(`px-3 py-1.5`) / md(`px-4 py-2.5`) / lg(`px-5 py-3`).

### Chips
- **Style:** 알약형, `text-sm font-semibold`, `px-3 py-1.5`. 필터 토글용.
- **State:** active = Signal Blue 배경 + 흰 텍스트; inactive = 흰 배경 + Muted 텍스트 + Line 보더, hover 시 Ink. `aria-pressed`로 상태 노출.

### Cards / Containers
- **Corner Style:** 22px(`--radius-card`).
- **Background:** Card White.
- **Shadow Strategy:** Soft Lift 하나(Elevation 참고). 중첩 카드 금지.
- **Border:** 기본 없음. 필요 시 Line(#dbeafe) 1px.
- **Internal Padding:** 24px(`p-6`)가 기본 리듬.

### Inputs / Fields
- **Style:** 흰 배경 + Line 보더 + 12px 라운드(`rounded-xl`), `px-4 py-2.5 text-sm`.
- **Focus:** 보더가 Signal Blue로 바뀌고 Sky Soft 2px 링(`focus:ring-2`). 글로우 없음.
- **Placeholder:** Muted Slate. 대비 4.5:1 유지.

### Navigation
- 상단 네비 + 모바일 드로어/드롭다운 구조. 활성 항목은 Signal Blue, 기본은 Ink/Muted. 데스크톱은 인라인 메뉴, 모바일은 서랍.

### Signature: SourceCaption
출처 표기 인라인 캡션. 수치·표·카드 하단에 데이터 출처를 Label 크기·Muted 색으로 붙인다. `lib/data-sources.ts` 레지스트리가 단일 진실원(SSOT)이며, 새 소스는 레지스트리에 한 줄 추가하면 캡션이 따라온다.

## 6. Do's and Don'ts

### Do:
- **Do** 모든 핵심 수치에 출처 캡션(SourceCaption)을 붙인다. The Sourced-Number Rule.
- **Do** 강조는 위계·여백·굵기로 만든다. 색 강조는 Signal Blue 하나로 절제한다.
- **Do** 카드 그림자는 `--shadow-soft` 하나만 쓴다. The One-Shadow Rule.
- **Do** 한글 본문은 14px 이상. `text-xs`는 라벨·캡션·배지에만.
- **Do** 거래유형·상태는 색 + 라벨/아이콘을 함께 써서 색에만 의존하지 않는다(매매=blue, 전세=green, 월세=orange).
- **Do** 버튼·칩은 알약형, 카드는 22px 라운드로 통일한다.

### Don't:
- **Don't** 빨간 "급매!" 배너, 과장 카피, 깜빡이는 프로모션 같은 **자극적 부동산 광고** 어휘를 쓰지 않는다.
- **Don't** 보라/파랑 그라데이션, 똑같은 크기의 카드 그리드 반복, 히어로-메트릭 템플릿, 섹션마다 붙는 대문자 eyebrow 같은 **전형적 AI SaaS 룩**을 쓰지 않는다.
- **Don't** `background-clip: text` 그라데이션 텍스트를 쓰지 않는다. 강조는 단색 + 굵기.
- **Don't** 1px을 넘는 색 띠 사이드 보더(`border-left`/`border-right` 스트라이프)를 쓰지 않는다. 전체 보더나 배경 틴트로 대체.
- **Don't** 검정 그림자나 표면마다 다른 그림자를 만들지 않는다.
- **Don't** 빨강·주황을 프로모션 강조색으로 전용하지 않는다. 정보 신호 전용. The Quiet-Surface Rule.
