# /faq 데이터 근거형 문구 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. TDD per task.

**Goal:** /faq와 목록 페이지 FAQ를 시안 문구로 교체하고, 숫자는 `getFaqStats()`(24h 캐시)로 채운다.
**Spec:** `docs/superpowers/specs/2026-10-23-faq-page-data-design.md` · 시안: `docs/superpowers/mockups/2026-10-23-faq-page.html`

## Global Constraints
- 브랜치 `feat/faq-page-data`. 머지는 전체 확인 + 사용자 승인 후.
- 문구는 시안 그대로. stats가 null이면 숫자 없는 대체 문장.
- 집계는 운영 실측 0.05초 미만 쿼리만. 실거래 총건수 금지. `unstable_cache` 결과는 JSON 직렬화 가능(BigInt → number).

## Tasks
1. **stats:** `lib/faq/stats.ts` — `FaqStats`(숫자 필드 + `asOf` KST 날짜), `queryFaqStats()`, `getFaqStats()`(unstable_cache 86400, 실패 null). 통합 테스트(시드 집계).
2. **data:** `lib/faq/data.ts` 시안 38문항. `a: string | ((s: FaqStats | null) => string)`, `resolveFaq(category, stats): FaqItem[]`. 유닛: null/값 두 경우, 문항 무결성 테스트 갱신.
3. **render:** `Faq`는 items 전용 + `showAllLink`(기본 true). `CategoryFaq`(async, stats → resolveFaq, 링크 없음) — 목록 10곳 교체. /faq는 async + revalidate 86400 + 기준일 문구. SSR·e2e.
4. **확인·리뷰·PR:** 전체 검사, 실데이터 화면, Opus 리뷰, PR.
