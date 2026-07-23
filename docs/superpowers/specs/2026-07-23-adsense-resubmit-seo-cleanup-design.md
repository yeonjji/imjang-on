# 애드센스 재신청 전 SEO 마감 — 설계 스펙

- 날짜: 2026-07-23
- 상태: 설계 승인됨 (구현 계획 대기)
- 목표: imjangon.co.kr 애드센스 재신청 전, thin-content를 색인에서 제거하고 파생수치·일관성 결함을 정리한다.
- 비목표: 완료된 프로즈/출처 JSON-LD 시스템의 재작업, 표·지도 UI 변경, 주차/충전 신규 프로즈 생성.

## 배경

애드센스 재심사의 실질 블로커는 low-value/thin content. 어린이집·아파트 해석 프로즈와 출처 JSON-LD는 이미 완료(재작업 금지). 남은 마감은 (1) 프로즈가 없는 얇은 페이지를 색인에서 빼고, (2) sitemap을 index 페이지만 남기고, (3) raw float 노출과 (4) 도보시간·어린이집 프로즈의 일관성 결함을 고치고, (5) 검증하는 것.

## 확정된 결정

1. **색인 범위**: 프로즈 없는 카테고리는 전부 noindex. 주차장·충전소·전통시장 신규 프로즈는 만들지 않음(별도 후속).
2. **충원율 벤치마크 기준**: 같은 시군구 중앙값(공간쿼리 없이 groupBy).
3. **도보 상수**: 80 m/분으로 통일. 완료된 프로즈 숫자는 불변, 배지 계산만 동일 유틸로 맞춤.
4. **sitemap 정합**: noindex URL 포함 0건을 최우선. 페이지 index 조건보다 **더 보수적인 부분집합 프록시**를 적용(마이그레이션 없음). 일부 index 가능 페이지가 sitemap에서 빠지는 것은 허용. `count()`와 `page()`의 WHERE는 동일.
5. **검증**: CI 그린이 머지 게이트. 실제 마크업은 배포 후 프로덕션 소수 표본으로 확인(버스트 금지).

## 용어 정정 (원 요청 ↔ 코드)

- **음식점(restaurant)**: 카테고리 없음(생활편의 = 편의점·마트·카페·전통시장) → 대상 없음.
- **지하철**: 상세 페이지 없음(인접 인프라 입력으로만 존재) → noindex/index 대상 아님.
- **전통시장**: amenity의 일부이며 기본 noindex로 처리(marketType만 있어 프로즈 불가).

---

## WS1. 중앙 색인 규칙 (최우선)

**현재 상태**
- 글로벌 기본값 `{ index:true, follow:true }` — `app/layout.tsx:23`.
- 이미 게이트 있음(`narrative && fired.length >= N` → index, else `{index:false, follow:true}`):
  - apt `app/(public)/apt/[id]/page.tsx:59,72`, officetel `.../officetel/[id]/page.tsx:65,78`, villa `.../villa/[id]/page.tsx:65,78`
  - school `.../school/[sigunguCode]/[id]/page.tsx:51,58`, hospital `.../medical/hospital/[sigunguCode]/[id]/page.tsx:42,47`, childcare `.../childcare/[sigunguCode]/[id]/page.tsx:52,62`
  - park(=urban, minFired 2) `.../urban/[category]/[id]/page.tsx:59,65`
- 항상 noindex: 약국 `.../medical/pharmacy/[sigunguCode]/[id]/page.tsx:45`, `/list` `.../list/page.tsx:15`.
- **게이트 없음(기본 index 상속) = 이번 작업 대상**: amenity 상세 `.../amenity/[category]/[id]/page.tsx`(robots 미설정), urban 비-park 분기 `.../urban/[category]/[id]/page.tsx:69-73`(주차장), 충전소 전용 `.../urban/charger/[id]/page.tsx`.

**설계**
- 신규 순수 모듈 `lib/seo/indexable.ts`:
  - `isNarrativeIndexable(narrative: Narrative | null, minFired = 3): boolean` = `!!narrative && narrative.fired.length >= minFired`
  - `robotsFor(indexable: boolean)` → `{ index: indexable, follow: true }`
- 기존 5종(+park)의 generateMetadata 인라인 게이트를 위 함수 호출로 교체. **동작 불변**(park는 `minFired=2` 전달). 규칙을 한 곳으로 모아 테스트 가능하게.
- 신규 noindex 부여(항상 `{index:false, follow:true}` — narrative 없음):
  - amenity `[category]/[id]` (편의점·마트·카페·전통시장)
  - urban `[category]/[id]`의 **park 외**(주차장) — 현재 `:69-73` fall-through 제거하고 명시 noindex
  - urban `charger/[id]` 전용 라우트
- **robots.txt 무변경**: 위 경로들을 Disallow하지 않는다(크롤을 허용해야 Googlebot이 SSR noindex 메타를 읽고 색인에서 뺀다). noindex는 전부 Next `metadata.robots`(SSR 메타태그).
- 결과: index 가능 = 완료 프로즈 5종(apt·officetel·villa·childcare·school·hospital)+park만. 그 외 생활 카테고리는 전부 noindex. 약국/list 유지.

**검증(CI)**: `isNarrativeIndexable` 단위테스트 — null→noindex, fired<3→noindex, fired≥3→index, park minFired=2 경계.

---

## WS2. sitemap = index 페이지만 (noindex 0건 우선)

**현재 상태**
- 인덱스 `app/sitemap.xml/route.ts`(revalidate 86400) → 샤드 `app/sitemaps/[id]/route.ts`. 샤딩 `lib/sitemap/manifest.ts`(글로벌 순차 id, `count===0`이면 샤드 미생성). 소스 `lib/sitemap/sources.ts`(`CHUNK_SIZE=10000` `:11`, `SOURCE_ORDER` `:304-317`), 정적 엔트리 `lib/sitemap/static-entries.ts`.
- 정합 상태:
  - subscription `sources.ts:125-146` — 페이지 조건과 정확히 일치 ✓
  - pharmacy `sources.ts:193` — `count:0` 완전 제외 ✓
  - **property `sources.ts:99-121`** — `txCount12m>0 && saleLastAt not null`가 페이지 게이트(`fired≥3`)보다 **느슨** → noindex URL 잔존 가능 ✗
  - **school `:149-166` / childcare `:168-184` / hospital `:210-227`** — fired 게이트 **없음** → noindex URL 다수 잔존 ✗
  - amenity/urban 상세는 **원래 sitemap 미등재**(core 소스의 허브 URL만) → WS1 noindex와 자동 정합, 작업 없음 ✓

**설계 — 보수적 부분집합 프록시**
- 핵심 원리: 페이지 index 게이트(`fired≥3`)는 자체컬럼 발화 모듈 + nearby(공간) 발화 모듈의 합. **nearby 모듈은 fired를 더하기만 하고 빼지 않으므로**, "자체컬럼만으로 ≥3개 모듈이 확정 발화"하는 행은 nearby 결과와 무관하게 항상 index다. 따라서 sitemap 프록시를 **자체컬럼 기반 ≥3 모듈 발화 조건**으로 잡으면 페이지 게이트의 확정 부분집합이 된다(공간쿼리 불필요, 마이그레이션 불필요).
- 편향: 애매하면 **제외**(under-inclusion). noindex 포함 0건이 최우선, index 페이지 일부 누락은 허용.
- 대상별 자체컬럼 모듈 후보(정확 필드/임계값은 계획 단계에서 각 `lib/insights/*.ts` 발화 가드를 읽어 확정):
  - property(apt): 가격추세(12m 평균)·전세가율(전세 데이터)·층프리미엄(층 회귀 데이터)·이상거래 등 자체 모듈 중 ≥3 발화를 보장하는 필드 동시 존재.
  - childcare: 충원율(capacity+currentCount)·교사비율(emRoleTeacher)·시설(cctv/roomSize) 등 ≥3.
  - hospital: 병상·의사수·전문의비율 등 ≥3.
  - school: 자체 규모/유형 필드 기반 ≥3.
- 각 소스의 `count()`와 `page()`는 **동일한 WHERE 프래그먼트 상수**를 공유(샤딩 정합 필수).
- property는 기존 느슨한 프록시를 **폐기하고 위 보수적 조건으로 교체**(현행 유지 안 함).
- 배포 후 **GSC sitemap 재제출**.

**부분집합 보장의 CI 근거**
- 접근: "프록시 필드 조건 C_i ⇒ 모듈 M_i 발화"를 모듈별 단위테스트로 증명(픽스처, DB 불필요). 프록시가 ≥3개의 C_i를 요구 ⇒ fired≥3 ⇒ index. 합성으로 부분집합 성립.
- 보강: 통합테스트가 프록시 WHERE를 만족하는 시드 행에 실제 `buildXNarrative`를 돌려 전부 `fired≥3`임을 표본 검증(자체 시드 필수 — 통합테스트는 앰비언트 DB에 의존하지 않는다).
- 패리티 테스트: 각 소스의 count/page가 동일 WHERE 상수를 참조하는지 확인.

---

## WS3. 파생수치 raw float 반올림

**현재 상태**
- 파생 지표는 `lib/transaction.ts`에서 raw float 산출: 전세가율 `:198-201`, 변동률 `:193-196`, 층프리미엄 `:349`, 이상거래편차 `:414`. UI 렌더 지점(area-comparison.tsx, floor-premium.tsx, transaction-flags.tsx)은 **이미 반올림**.
- **버그 단일 소스**: `lib/faq/builders/apt.ts:47` — `전세가율은 약 ${ratio}%`에서 `ratio=jeonseRatioPct`를 무반올림 보간 → `"57.61439522661714%"`.

**설계**
- `lib/faq/builders/apt.ts:47` → `${Math.round(ratio)}%`(UI `toFixed(0)`와 일치).
- 전역 점검: `lib/faq/builders/jeonse.ts:27,39`의 rate 필드(`rentGrntMaxLoanLmtRate`, `exptGrfeRateCont`)도 방어적 반올림.
- 회귀 방지 단위테스트: FAQ 빌더 산출 문자열에 긴 소수(`/\d+\.\d{3,}/`) 없음.

---

## WS4. 일관성

### 4a. 도보시간 단일 유틸 (80 m/분)
- 현재: 프로즈 `lib/insights/apt.ts:69`, `lib/insights/shared.ts:17`가 `distance/80`; 배지 `components/ui/nearby-subway.tsx:9-11`가 `distance/67`(렌더 `:87`). 같은 `station.distanceMeters`, 제수만 달라 17분 vs 21분.
- 설계: 공용 `walkMinutes(distanceMeters: number): number = Math.max(1, Math.round(distanceMeters / 80))` 신설(예: `lib/geo.ts` 또는 기존 포맷 유틸). 세 지점 모두 이 함수로 교체. **80 m/분 채택 → 프로즈 숫자 불변, 배지가 /67→/80으로 이동**.
- 주의: 발화 게이트가 분(minute) 임계값을 쓰지 않고 거리 기준임을 확인(표시용만 변경, 색인 조건 불변).
- 검증(CI): `walkMinutes` 경계 단위테스트(예: 1360m→17, 하한 1분).

### 4b. 어린이집 충원율 → 같은 시군구 중앙값 벤치마크
- 현재: `lib/insights/childcare.ts:28-36` `occupancy()`가 절대값 + 고정 임계값(0.9/0.7). loader `lib/insights/childcare-loader.ts:41`는 nearby 어린이집 미주입.
- 설계: `ChildcareInsightInput`(`lib/insights/childcare.ts:4-17`)에 `sigunguFillMedian?: number` 추가. loader에서 같은 `sigunguCode` 어린이집의 `currentCount/capacity` 중앙값을 `percentile_cont(0.5)`로 조회(capacity>0). `occupancy()`를 "충원율 X% — 같은 시군구 중앙값 Y%보다 {높음/비슷/낮음}"으로 재작성(출처 표기 유지). 중앙값 부재 시 기존 절대 서술로 폴백.

### 4c. 어린이집 교사비율 → 보육교사 기준
- 현재: `lib/insights/childcare.ts:52-56` `ratio()` 분모가 `staffCount`(= `chcrtescnt`, 전체 교직원). 보육교사 필드 `emRoleTeacher`(ingest `scripts/ingest/amenities/adapter-childcare.ts:136`, 소스 `em_cnt_a2`)는 존재하나 InsightInput/loader 미주입.
- 설계: `ChildcareInsightInput`에 `emRoleTeacher?: number` 추가, loader 배선. `ratio()` 분모를 `emRoleTeacher`로, 문구 "보육교사 N명 기준 1인당 원아 약 R명". `emRoleTeacher` null/0이면 해당 문장 스킵(폴백).
- 검증(CI): occupancy 벤치마크 문구/분기, ratio 분모 및 null 폴백 단위테스트.

---

## WS5. 검증

**머지 게이트 = CI 그린.** CI가 실제로 커버:
- `isNarrativeIndexable` 규칙(경계 포함)
- `walkMinutes` 경계
- FAQ 반올림(긴 소수 부재)
- 어린이집 충원율 벤치마크/교사비율(+null 폴백)
- sitemap: 모듈별 "필드조건⇒발화" 단위테스트 + 프록시 시드 행 `fired≥3` 통합 표본 + count/page WHERE 패리티
- 기존 스위트 무회귀(표·지도 UI 불변 확인)

**배포 후 프로덕션 소수 표본(버스트 금지, 유형별 1~2건):**
- view-source(JS off): apt(정상)=index + 프로즈 + JSON-LD 노출 / cafe=noindex / childcare=프로즈 노출 / parking=noindex
- Rich Results Test 1~2건(JSON-LD 유효)
- robots.txt 확인(대상 경로 Disallow 없음) + sitemap 샤드 표본에 noindex URL 부재
- GSC sitemap 재제출

**배포 흐름**: `feat/*` → main PR → CI 그린 → merge → 자동배포(main push→OCI) → 프로덕션 표본 검증 → GSC 재제출.

## 손대지 않는 것

- 기존 표·지도 UI, 완료된 프로즈 시스템 구조(문구 튜닝 4b·4c 제외), 출처 JSON-LD 배관, 주차/충전 신규 프로즈, 약국·`/list`(이미 noindex), robots.txt의 기존 allow/disallow/봇 규칙.

## 성공 기준 (검증 가능)

1. amenity 4종·주차장·충전소 상세가 SSR로 `noindex,follow`; 완료 프로즈 5종+park는 게이트대로 index. (단위테스트 + 배포후 view-source 표본)
2. sitemap 샤드에 noindex URL 0건(표본); count/page WHERE 동일. (단위·통합테스트 + 배포후 표본)
3. FAQ 전세가율이 정수%로 노출, 긴 소수 없음. (단위테스트 + 표본)
4. 같은 페이지 도보시간이 프로즈=배지(80 m/분). (단위테스트 + 표본)
5. 어린이집 프로즈: 충원율=시군구 중앙값 대비, 교사비율=보육교사 기준. (단위테스트 + 표본)
6. CI 그린으로 머지, 배포 후 표본 검증 통과, GSC 재제출 완료.

## 리스크 / 유의

- sitemap 보수 프록시는 index 페이지 일부를 누락시킬 수 있음(허용). noindex 0건이 우선.
- 통합 표본 검증은 CI 시드 데이터가 대표성이 낮을 수 있으므로, 부분집합 보장의 1차 근거는 "필드조건⇒발화" 픽스처 단위테스트에 둔다.
- 도보 상수 변경이 발화 게이트에 영향 없어야 함(거리 기준 확인).
- 프로덕션 표본 검증은 소수 요청만(자동 챌린지/버스트 금지). 배포/크롤 확인은 GitHub API·GSC 우선.
