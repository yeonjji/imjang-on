# 주변 생활 인프라 섹션 — 다른 상세 페이지 적용 프롬프트 모음

학교 상세에 적용한 "주변 생활 인프라" 재설계(탭 → 요약 배지줄 + 균일 2열 그리드)를
다른 상세 페이지에도 동일하게 확장하기 위한 **복사용 프롬프트**.

- 레퍼런스 구현(학교): PR #20
- 설계 스펙: `docs/superpowers/specs/2026-06-02-school-nearby-infra-redesign-design.md`
- 구현 계획: `docs/superpowers/plans/2026-06-02-school-nearby-infra-redesign.md`

> 사용법: 새 세션에서 **①을 1회** 돌려 공용화한 뒤, 적용할 페이지마다 **②를 복사 + `{{ }}` 채우기**.
> `{{ }}` 값은 **③ 표**에서 가져온다.

---

## ① (최초 1회) 공용 컴포넌트로 승격 프롬프트

```
학교 상세에 적용한 "주변 생활 인프라" 섹션을 다른 상세 페이지에도 재사용하려고 한다. 먼저 공용화부터 해줘.

현재 상태(재사용 가능한 로직은 이미 있음):
- lib/amenity/infra.ts — buildInfraCategories(raw), classifyStore, 타입 InfraCategory/InfraItem/RawInfra, 상수 INFRA_FETCH_LIMIT (전부 순수, 페이지 비종속)
- lib/amenity/nearby.ts — getSchoolNearbyInfra(lat, lng) (이름만 school일 뿐 좌표만 받는 범용 집계), 각 getNearby*에 limit 파라미터
- 컴포넌트 app/(public)/school/[sigunguCode]/[id]/_components/nearby-infra.tsx — NearbyInfra({ categories })
- 설계 근거: docs/superpowers/specs/2026-06-02-school-nearby-infra-redesign-design.md

할 일(surgical, 동작 변화 없음):
1. nearby-infra.tsx를 components/ui/nearby-infra.tsx로 이동하고, 이를 import하던 school 페이지 import 경로를 갱신.
2. lib/amenity/nearby.ts의 getSchoolNearbyInfra → getNearbyInfra로 rename(범용 이름). school 페이지 호출부도 갱신.
3. tsc --noEmit + pnpm lint + pnpm vitest run tests/lib/amenity-infra.test.ts 통과 확인.
4. 커밋: refactor(infra): 주변 인프라 컴포넌트·집계 함수 공용화

주의: childcare 상세가 아직 쓰는 옛 탭 컴포넌트(nearby-amenities.tsx)·getSchoolNearbyAmenities는 건드리지 마라(별도 작업).
```

---

## ② 페이지별 적용 템플릿 (복사해서 `{{ }}` 채우기)

```
{{대상페이지}} 상세 페이지에도 학교 상세와 동일한 "주변 생활 인프라" 섹션을 적용해줘.
디자인은 이미 확정돼 있으니 재브레인스토밍 없이 학교 구현을 레퍼런스로 그대로 따른다.

레퍼런스(그대로 재사용):
- 컴포넌트: components/ui/nearby-infra.tsx 의 NearbyInfra({ categories })
  (없으면 아직 school/[sigunguCode]/[id]/_components/에 있으니, 이번에 components/ui로 승격하고 school import도 갱신)
- 집계: lib/amenity/nearby.ts 의 getNearbyInfra(lat, lng) (구 getSchoolNearbyInfra, 좌표만 받으면 8개 카테고리 정규화 반환)
- 순수 로직: lib/amenity/infra.ts (buildInfraCategories 등) — 수정 불필요
- 설계 스펙: docs/superpowers/specs/2026-06-02-school-nearby-infra-redesign-design.md 먼저 읽어라

디자인 규칙(고정): 탭 금지 → 요약 배지줄 + 균일 2열 그리드(grid-cols-1 md:grid-cols-2 [grid-auto-rows:1fr]),
카테고리당 cap 5 + 더보기, 0곳 카테고리 숨김, 이름 진한색, 거리 배지 우측, fetch 한도 도달 시 N+ 배지, #poi 앵커 유지.

이 페이지에 맞춰 처리할 것:
1. 대상 페이지 파일: {{page.tsx 경로}}
2. 좌표(lat/lng): 이 페이지가 지도 섹션에서 이미 쓰는 좌표 취득 로직을 재사용(중복 쿼리 만들지 말 것). 좌표 없으면 섹션 미렌더.
3. 교체 대상: 기존 {{현재 nearby/탭 컴포넌트}}를 제거하고 <NearbyInfra categories={infra} />로 대체.
   제거로 안 쓰이게 된 import/함수만 정리(다른 페이지가 공유하면 남겨둘 것 — 먼저 grep으로 참조 확인).
4. 자기 자신 중복 방지: 이 상세가 인프라 카테고리에 속하면(예: 병원 상세=병원, 약국 상세=약국, 충전소 상세=충전소,
   주차장 상세=주차장, 공원/시장/마트 상세) 해당 항목 자신을 결과에서 제외해야 한다.
   getNearbyInfra에 excludeId/excludeKey 옵션이 없으면 추가하고(기본 미제외), 이 페이지에서만 자기 id를 넘겨 제외.
   school처럼 자기 카테고리가 없으면 그냥 호출.
5. SEO/문구: 섹션 제목은 "주변 생활 인프라" 유지. 사이드바 TOC가 있으면 #poi 항목 확인.

작업 방식: superpowers writing-plans로 작은 TDD 계획을 만든 뒤 subagent-driven-development로 실행.
각 태스크마다 spec/품질 리뷰. 순수 로직 변경이 있으면 tests/lib/amenity-infra.test.ts에 케이스 추가.

검증(필수): tsc --noEmit + pnpm lint + pnpm vitest run(전체) 통과
→ dev 서버 띄워 실데이터로 Playwright 데스크탑·모바일 스크린샷 확인(요약줄·더보기·0곳 숨김·높이 정렬·N+·자기 제외)
→ 공유 함수/컴포넌트 쓰는 다른 페이지 회귀 없음 확인.

마무리: 작업 브랜치 → PR 생성 → 머지 → Vercel 배포 success 확인까지.
```

---

## ③ 페이지별 채워넣기 표

| 대상페이지 | page.tsx 경로 | 교체할 기존 컴포넌트 | 자기 제외 |
|---|---|---|---|
| 병원 상세 | `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx` | `_components/hospital-nearby.tsx` | **병원**에서 자기 id 제외 |
| 약국 상세 | `app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx` | `_components/pharmacy-nearby.tsx` | **약국**에서 자기 제외 |
| ✅ amenity 상세 (PR #24, 완료) | `app/(public)/amenity/[category]/[id]/page.tsx` | ~~`nearby-amenities-mixed.tsx`~~ 삭제됨 | 현재 category(편의/마트/카페/시장)를 해당 카테고리에서 제외 |
| ✅ 충전소 상세 (완료) | `app/(public)/urban/charger/[id]/page.tsx` | ~~`charger-nearby.tsx`~~ 삭제됨 | **충전소**에서 자기 제외 |
| ✅ 주차장·공원(urban) 상세 (완료) | `app/(public)/urban/[category]/[id]/page.tsx` | ~~`urban-same-category-nearby.tsx`~~ 삭제됨 | **주차장→parking / 공원→park** 자기 제외 |
| 어린이집 상세 | `app/(public)/childcare/[sigunguCode]/[id]/page.tsx` | `NearbyAmenities`(옛 탭) — 교체 후 옛 컴포넌트·`getSchoolNearbyAmenities` **완전 제거 가능** | 어린이집은 인프라 8종에 없음 → 제외 불필요 |
| 아파트 상세 | `app/(public)/apt/[id]/page.tsx` | (별도 인프라 섹션 없으면 신규 추가) | 없음 |
| 오피스텔/빌라 | `app/(public)/officetel/[id]/page.tsx`, `app/(public)/villa/[id]/page.tsx` | (신규 추가) | 없음 |

> 팁: **childcare를 먼저** 하면 ①공용화 + 옛 탭 컴포넌트 완전 제거까지 한 번에 정리돼 깔끔.
> 그다음 병원·약국 → amenity → urban 순 추천.

---

## 참고: 재사용 자산 요약

| 자산 | 위치 | 재사용 방식 |
|---|---|---|
| 순수 분류·정규화 | `lib/amenity/infra.ts` | 그대로 사용 (수정 불필요) |
| 집계 함수 | `lib/amenity/nearby.ts` `getNearbyInfra(lat,lng)` | 모든 페이지 공통 호출 (필요 시 excludeId 옵션 추가) |
| 화면 컴포넌트 | `components/ui/nearby-infra.tsx` `NearbyInfra` | 모든 페이지 공통 import |
| 단위 테스트 | `tests/lib/amenity-infra.test.ts` | 로직 변경 시 케이스 추가 |
