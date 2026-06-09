---
target: 홈
total_score: 28
p0_count: 0
p1_count: 3
timestamp: 2026-06-09T12-27-51Z
slug: app-public-page-tsx
---
# Critique: 홈 (`app/(public)/page.tsx`)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | 필터 상태·시군구 로드 반영. 단 검색 결과 건수 프리뷰·로딩 표시 없음 |
| 2 | Match System / Real World | 4 | 한국 부동산 도메인 언어 자연스러움(실거래가·전세·평수) |
| 3 | User Control and Freedom | 3 | 칩 토글 해제·거래유형 변경 시 금액 초기화. "전체 초기화" 버튼 없음 |
| 4 | Consistency and Standards | 2 | 아이콘 2종(이모지/Lucide), radius 제각각(28/26/20/18, 토큰 22px 미사용), 히어로 CTA가 Button 컴포넌트와 다른 모양 |
| 5 | Error Prevention | 3 | 금액 min/max 교차 비활성화 처리 좋음 |
| 6 | Recognition Rather Than Recall | 3 | 필터·라벨 가시적 |
| 7 | Flexibility and Efficiency | 3 | 진입점 다수(유연하나 중복). 키보드 단축 없음 |
| 8 | Aesthetic and Minimalist Design | 2 | 홈이 검색+대시보드+브리핑+캘린더+디렉터리를 한 페이지에. 섹션 위계 평평, 이모지 과다 |
| 9 | Error Recovery | 3 | 청약 보드 빈 상태 있음, 브리핑은 없으면 섹션 소멸 |
| 10 | Help and Documentation | 2 | 출처 캡션이 청약 보드에만. 핵심 수치엔 출처 없음 |
| **Total** | | **28/40** | **Good (하단)** |

## Anti-Patterns Verdict

**LLM assessment:** "AI가 만들었다"까지는 아니지만 몇 가지 뚜렷한 reflex가 있다. (1) **섹션마다 작은 블루 eyebrow + h2** 패턴이 5개 섹션 반복(실거래가 통합검색/유형별/생활편의/청약 캘린더) — impeccable이 금지하는 "모든 섹션 eyebrow" 그래머. (2) **이모지가 사실상 아이콘 시스템** (📍📊🏢🎓🔥📉🚀💡📈📅) — 그러나 AmenityHub만 Lucide 아이콘. 한 페이지에 두 아이콘 언어가 공존. (3) **MarketBriefing 카드1의 5-타일**은 큰 숫자+라벨+서브의 hero-metric 템플릿을 그대로 5번. (4) 히어로·인기동네 진행바에 장식 그라데이션.

**Deterministic scan:** `detect.mjs`가 홈 페이지 + `_components/` 전체를 스캔 → **0건(클린)**. 사이드 스트라이프·그라데이션 텍스트·하드코딩 색 등 자동 탐지 슬롭은 없음. eyebrow 반복·아이콘 혼용·위계 평평함은 디텍터가 못 잡는 구조적 문제라 LLM 리뷰가 보완.

**Visual overlays:** dev 서버 미실행 + force-dynamic(DB 필요)으로 브라우저 주입 생략. 소스 기반 리뷰로 대체.

## Overall Impression
탄탄한 데이터 제품의 홈이다. 컴포넌트는 깨끗하고 접근성 기본기(aria-label, aria-hidden)도 챙겼다. 가장 큰 문제는 **홈이 다섯 가지 일을 동시에 하려 한다**는 것: 검색 도구 + 통계 + 브리핑 + 청약 캘린더 + 생활편의 디렉터리. 그 결과 위계가 평평하고(모든 h2가 text-2xl font-black), 같은 목적지(type=apt/officetel/villa)로 가는 입구가 3~4곳 중복된다. 그리고 **자기 브랜드 1원칙("모든 수치에 출처")을 홈의 가장 큰 숫자들이 어긴다** — StatsBar·MarketBriefing엔 출처가 없다.

## What's Working
- **필터 UX의 디테일:** 금액 min/max 교차 비활성화, 거래유형 변경 시 금액 초기화, 칩 재클릭 해제. 진짜 도구다운 배려.
- **접근성 기본기:** 장식 이모지 `aria-hidden`, select `aria-label`, 링크 `aria-label`. Sam(스크린리더) 기본 통과.
- **청약 보드:** 빈 상태 + 모바일/데스크톱 분리 레이아웃 + SourceCaption까지. 이 섹션이 모범.

## Priority Issues

- **[P1] 핵심 수치에 출처 없음 — 자기 브랜드 1원칙 위반**
  - **왜 중요:** PRODUCT.md/DESIGN.md의 The Sourced-Number Rule이 "모든 핵심 수치에 출처". 그런데 홈에서 가장 큰 숫자인 StatsBar(실거래 데이터 N건 등 4개)와 MarketBriefing(오늘 실거래 건수·최고가·최저가 금액)에 출처 캡션이 없다. 청약 보드에만 있다. 신뢰가 핵심 가치인 제품에서 가장 눈에 띄는 숫자가 무출처.
  - **Fix:** StatsBar 하단과 MarketBriefing 섹션 하단에 `SourceCaption`(국토부 실거래가 등) 추가. 이미 `lib/data-sources.ts` + `SourceCaption` 존재.
  - **Suggested command:** /impeccable polish

- **[P1] 컴포넌트 어휘 불일치 — 같은 시스템이 두 얼굴**
  - **왜 중요:** (a) radius가 28/26/20/18px 제각각이고 디자인 토큰 `--radius-card: 22px`를 쓰는 곳이 없다. (b) 히어로 CTA는 raw `<button class="rounded-xl bg-blue">`인데 디자인 시스템 `Button`은 알약형(rounded-full) — "저장 버튼이 두 곳에서 다르면 하나는 틀린 것". (c) 이모지 vs Lucide 아이콘 혼용. (d) TypeIconGrid가 `--shadow` 대신 bespoke 그림자(One-Shadow Rule 위반).
  - **Fix:** 카드 radius를 토큰(22px)으로 수렴, 히어로 CTA를 `Button` 컴포넌트로 교체, 아이콘 시스템 하나로(Lucide 권장, 전문 톤에 부합), 그림자는 `--shadow` 하나로.
  - **Suggested command:** /impeccable polish

- **[P1] 인지 과부하 + IA 중복 — 홈이 다섯 가지 일을 한다**
  - **왜 중요:** type=apt/officetel/villa 목적지가 TypeIconGrid(8칸)·TypeHub(3카드)·MainSearchFilter(유형 칩) 3~4곳에 중복. 단일 초점이 없고("주 행동이 검색? 둘러보기?") 결정 지점마다 옵션 4개 초과. Casey(모바일)는 스크롤 피로, Jordan(초행자)은 "뭘 먼저?"에서 멈춘다.
  - **Fix:** 유형 진입을 한 곳으로 통합(예: TypeHub 또는 TypeIconGrid 중 하나), 섹션 우선순위를 정해 2차 섹션은 시각적으로 강등. 홈의 1차 행동을 "검색"으로 명확히.
  - **Suggested command:** /impeccable distill

- **[P2] 섹션 위계 평평 — 모든 h2가 같은 무게**
  - **왜 중요:** MainSearchFilter·TypeHub·WeeklySubscriptionBoard·AmenityHub의 h2가 전부 `text-2xl font-black tracking-tight blue-dark`. 히어로 다음으로 시선을 끄는 단일 초점이 없어 전체가 균일한 소음.
  - **Fix:** 섹션 위계를 크기·여백으로 차등(주 섹션 vs 보조). font-black 남용을 줄이고 bold/semibold로 단계 분리.
  - **Suggested command:** /impeccable layout

- **[P2] 14px 미만 한글 텍스트 — 가독성·AA·자기 규칙 위반**
  - **왜 중요:** WeeklySubscriptionBoard의 날짜 `text-[10px]`, TODAY 배지 `text-[8px]`/`text-[9px]`, 그리고 페이지 전반의 `text-xs`(12px) 본문성 텍스트(StatsBar 라벨·TypeHub 설명·브리핑 서브). DESIGN.md The 14px Floor Rule과 WCAG AA 가독성에 어긋남. `text-muted(#64748b)`를 sky-soft 같은 틴트 위에 쓰면 대비도 위태.
  - **Fix:** 본문성 텍스트 14px+로, 초소형(8~10px) 제거. 색-위 텍스트 대비 4.5:1 확인.
  - **Suggested command:** /impeccable typeset

## Persona Red Flags

**Jordan (초행자):** 첫 화면에서 "지금 뭘 해야 하나"가 5초 안에 안 잡힘 — 히어로 검색창, "실거래가 찾기" 버튼, 아래 통합검색 패널, 8칸 아이콘 그리드가 동시에 1차 행동을 주장. 유형 진입이 3곳이라 "이것들이 다른 건가?" 혼동.

**Casey (모바일):** 세로로 매우 긴 페이지(히어로+통계+필터+유형+브리핑+7일 캘린더+생활편의). 청약 7일 그리드는 모바일에서 카드 스택으로 잘 분기했으나 TODAY 배지 8px는 엄지로 읽기 어렵다. 1차 행동(검색) 버튼이 필터 패널 맨 아래라 thumb zone 밖.

**진입 검토자(프로젝트 페르소나, 이사·매수 앞):** 큰 통계 숫자(실거래 N건, 최고가 금액)를 보고 "이거 어디 출처지?"를 바로 묻는데 캡션이 없다. 신뢰 판단의 첫 단계에서 근거가 빠짐 — 이 제품의 핵심 약속과 정면 충돌.

## Minor Observations
- 히어로 eyebrow "📍 실거래가·생활권 정보 통합 플랫폼" + 이모지 CTA("🔍 실거래가 찾기")가 '전문·정직' 톤보다 캐주얼 프로모션 쪽으로 살짝 기운다.
- MarketBriefing이 데이터 없을 때 `null` 반환 → 섹션이 통째로 사라짐. 홈 구성이 들쭉날쭉해질 수 있음(빈 상태 또는 항상 표시 고려).
- 인기동네 진행바 그라데이션(blue→sky)은 장식적. 단색으로도 충분.

## Questions to Consider
- 홈의 **단 하나의** 1차 행동은 무엇인가? 검색인가, 둘러보기인가? 그 하나를 위해 나머지를 강등할 수 있나?
- 유형 진입(아파트/오피스텔/다세대)이 정말 3~4곳 다 필요한가?
- 가장 큰 숫자에 출처가 없는데, 그 숫자를 신뢰할 이유를 사용자는 어디서 얻나?
