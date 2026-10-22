# 상세 FAQ 공통 문항 제거 + 데이터 해석 문항 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. TDD per task.

**Goal:** 상세 9종 FAQ에서 공통 문항을 빼고, 아파트·오피스텔·빌라·청약에 섹션 표시 모델 값으로 만든 해석 문항을 더한다.
**Spec:** `docs/superpowers/specs/2026-10-21-detail-faq-dedupe-design.md` · UI: `docs/superpowers/mockups/2026-10-21-detail-faq.html`

## Global Constraints
- 브랜치 `feat/detail-faq-dedupe`. 머지는 전체 확인 + 사용자 승인 후.
- 새 쿼리 없음. 문장은 섹션 표시 모델 값 그대로. 뷰가 null이면 문항 없음, 값 없는 문장은 생략.
- 금지 표현: 좋다·유리·추천·당첨 가능. 직접 계산 값에는 "임장ON 계산".
- 조사는 `lib/seo/josa.ts`의 `josa()`.

## Tasks
1. **compose + 링크:** `composeDetailFaq(dynamic, minDynamic=2)` — 공통 문항 제거(카테고리 인자 삭제, 9개 호출부 수정). `Faq`가 `items`로 호출될 때(상세) 아래에 "자주 묻는 질문 전체 보기 →"(`/faq`) 링크. 테스트: compose 유닛, Faq SSR(링크·JSON-LD에 공통 문항 없음).
2. **해석 문항(순수):** `lib/faq/builders/insight.ts` — `maintenanceFaq(name, MaintenanceView|null)`, `schoolZoneFaq(name, SchoolZoneView|null)`, `buildingFaq(name, BuildingView|null)`, `subscriptionResultsFaq(name, SubscriptionResultsData|null)` → `FaqItem | null`. spec §2.2 문장 순서. 테스트: 값 있음/없음, 높음·낮음·비슷함, 세대수 미상, 학교 1곳/여러 곳/광역, 주차 총대수만, 청약 요약 숨김 공고·미달·그 외 유형, 금지 표현 부재.
3. **배선:** apt(관리비·학구도), officetel·villa(건축물), subscription(청약 결과) 페이지에서 동적 문항 뒤에 붙임.
4. **e2e·검사·리뷰·PR:** 기존 FAQ 문구 e2e 갱신, 시드 단지 새 문항 확인, 전체 검사, 로컬 화면 캡쳐, Opus 리뷰, PR.
