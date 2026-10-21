# 청약 상세 청약 결과 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. TDD per task.

**Goal:** 청약홈 경쟁률·가점·특별공급 원응답을 공고별로 저장(`SubscriptionResult`)하고, 청약 상세 `UnitSupplyTable` 아래에 "청약 결과" 섹션을 렌더한다.
**Spec:** `docs/superpowers/specs/2026-10-20-subscription-results-design.md` · UI: `docs/superpowers/mockups/2026-10-20-subscription-results.html`

## Global Constraints
- 브랜치 `feat/subscription-results`. 머지는 전체 확인 + 사용자 승인 후.
- 경쟁률·미달은 공식값 그대로('(△n)' → '미달 n세대', '-' → '—'). 자체 계산(요약·특별공급)은 '임장ON 계산' 표기.
- 당첨 가능성·지역 평균 비교 금지. 결과 없으면 섹션 숨김.
- 새 타이머 없음 — `run-etl.sh` subscriptions 블록 끝에 실행 한 줄.

## Tasks
1. **스키마·마이그레이션:** `SubscriptionResult`(spec §2).
2. **파서·표시 모델(순수):** `lib/insights/subscription-results.ts`
   - `parseRate`, `houseTypeLabel`, `buildResultsView(category, competition, scores, special)`
   - APT: 요약(1순위 해당지역 Σ접수 ÷ 주택형당 1회 Σ공급, 최고 경쟁률, 최종 미달 = 주택형별 마지막 행 △ 합), 주택형 표(1순위 거주지역별 열은 공고에 있는 지역만 + 2순위 최종값 열은 데이터 있을 때), 가점(0·'-' 숨김, 지역 2종 이상일 때 지역 열), 특별공급(기관추천·이전기관 제외, 배정 0 숨김)
   - 그 외 유형: 일반 표(공공지원민간임대는 공급유형 열)
3. **수집:** `scripts/ingest/subscription-results/{http,runner}.ts`
   - `fetchJson`·`requireKey`는 subscriptions/http에서 export해 재사용
   - 대상 선정 SQL(spec §3), 동시성 2, 30분 예산, api_error 재시도, 이번 실행분 제외(`fetchedAt < runStart`)
4. **조회·컴포넌트·페이지:** `lib/subscription-results-query.ts`, `app/(public)/subscription/[id]/_components/subscription-results-section.tsx`, `UnitSupplyTable` 아래 배치, 출처 레지스트리는 기존 `applyhome` 사용.
5. **배선:** `run-etl.sh` subscriptions 블록, package.json `ingest:subscription-results`.
6. **e2e:** 시드 청약 공고 1건에 결과 행 → 섹션 렌더.
7. **확인·리뷰·PR:** 전체 검사, 실데이터 스모크(표본 공고 실호출), Opus 리뷰, 수정, PR.
