# SEO 콘텐츠·메타 강화 설계 (imjang-on)

- 작성일: 2026-06-07
- 브랜치: `feat/seo-content-enrichment` (PR #67 `feat/seo-improvements` 위에서 시작)
- 상태: 설계 승인됨, 구현 계획 작성 대기

## 배경

PR #67(JSON-LD·동적 OG·정적 지도)로 SEO **인프라**는 갖춰졌다. 봇이 모든 상세 페이지 본문을 SSR/ISR로 읽을 수 있는 것도 확인됐다. 남은 가장 큰 약점은 **콘텐츠 가치**다:

- 상세 페이지가 표·수치 위주여서, 프로그래밍 방식 대량 생성 페이지로 보일 위험("thin/scaled content"). 이는 SEO 순위와 **AdSense 승인**의 1순위 거절 사유다.
- 지역 페이지(`/region/[code]`)는 상위 단지 12개만 나열하고 지역 단위 집계·서술이 전혀 없어 특히 빈약하다.
- 일부 메타(법적 페이지 description, `/villa/[id]`)와 구조화 데이터(청약, 시설 필드)에 빈 곳이 있다.

이 작업은 **데이터 기반 자동 서술**로 각 페이지에 고유 텍스트를 더하고, 메타·구조화 데이터의 빈 곳을 메운다. 실제 DB 데이터로 템플릿 문단 생성을 미리 검증했고(아래 부록), 거래량·전세가율·추세·인프라 유무에 따라 문장이 실제로 달라짐을 확인했다.

## 목표 / 비목표

**목표**
- 부동산 상세(apt/officetel/villa)와 지역 허브(`/region/[code]`)에 데이터 기반 고유 서술 문단 추가 → thin content 리스크 완화 + 롱테일 키워드 확보.
- 지역 단위 집계(`getRegionStats`)를 신설해 지역 페이지를 충실하게.
- 누락·빈약한 메타(법적 페이지 6종, villa 상세)와 구조화 데이터(청약, 시설 필드) 보정.

**비목표**
- LLM 기반 서술 생성(비용·신선도·배치 파이프라인 복잡 → 템플릿 방식 채택).
- 시설 상세(학교/병원/약국/어린이집) 전용 OG 이미지(현재 루트 OG fallback 정상 → 이번 범위 제외).
- 기존 SEO 인프라(사이트맵/robots/canonical/ISR) 변경.

## 생성 방식 결정 — 템플릿 기반

LLM(배치 생성+DB 저장)과 비교해 **템플릿 기반**을 채택한다. 결정적·무료·즉시·수만 페이지 대응 가능하며, 조건 분기와 수치 표현 다양화로 충분한 변별력을 얻는다. 실측 검증(부록)에서 거래 많은 단지/적은 단지/구축 단지가 서로 다른 문장을 생성함을 확인했다.

## 아키텍처

- `lib/seo/blurb.ts` — **순수 함수** `propertyBlurb(input)`, `regionBlurb(input)`. 이미 fetch된 데이터를 인자로 받아 문자열을 반환한다(추가 DB 쿼리 없음, 단위 테스트 용이).
- `lib/seo/josa.ts` — 한글 조사 선택 util(`josa(word, '은/는')` 등). 단어 끝 음절의 받침 유무로 은/는·이/가·을/를 선택.
- `lib/property.ts`(또는 인접 모듈) — 신규 집계 `getRegionStats(sigunguCode)`.
- 렌더: 서버 컴포넌트로 페이지에 인라인(`<section>`/`<p>`). 데이터는 페이지가 이미 보유(상세) 또는 신규 집계(지역)로 확보.
- 테스트: `tests/lib/blurb.test.ts`, `tests/lib/josa.test.ts`(순수 함수). `getRegionStats`는 DB 통합 테스트(선택).

## 설계

### 섹션 1 · 부동산 상세 자동 서술 (High)

**`propertyBlurb(input): string`** — 입력은 상세 페이지가 이미 fetch하는 데이터로 구성:
- property 통계: `name`, `region.fullName`, `builtYear`, `households`, `txCount12m`, `saleCount12m`, `jeonseCount12m`, `saleAvgPrice12m`, `jeonseAvgDeposit12m`
- 추세: 월별 차트 데이터(`getMonthlyChartData`)에서 최근 구간 vs 이전 구간 비교
- 인프라: `getNearbyInfra` 카테고리별 개수 + `getNearbySubwayStations` 역 수

**변별력을 위한 조건 분기:**
- 거래량: 0건 / 1~5건("드물었으며") / 6~39건("거래됐으며") / 40건+("활발하게 거래됐으며")
- 전세가율: 계산해 표기, 70%↑이면 "전세 수요가 강한" 문장 추가
- 추세: 상승 / 보합 / 하락 (월별 차트 기반)
- 인프라: 있는 카테고리만 표기, 없으면 문장 생략

**미리보기에서 도출한 다듬기(필수 반영):**
1. **조사 처리** — `josa` util로 은/는, 이/가 받침 기반 선택(현재 "은(는)" 식 표기 금지)
2. **인프라 표현** — 500m 반경 합산값은 과하게 큼. **주요 카테고리별**(지하철·학교·병원·약국·공원·마트 등)로 표기하고 카테고리당/총합 상한을 둔다.
3. **추세 계산** — `saleLastPrice vs 평균`의 거친 근사 대신 월별 차트의 최근/이전 구간 평균 비교로 정교화.

**배치/적용:** 히어로 ↔ 거래표 사이에 렌더. apt / officetel / villa 적용. villa는 데이터가 적을 수 있어 누락 필드는 문장 생략(graceful degradation).

### 섹션 2 · 지역 허브 서술 + 통계 (High)

**신규 집계 `getRegionStats(sigunguCode)`** — 해당 시군구의 아파트 대상:
- 단지 수, 최근 1년 총 거래 건수, 평균 매매가/전세가, 매매가 범위(min~max)
- 단일 집계 쿼리(`prisma.property.aggregate`/`groupBy` 또는 raw)로 구현, ISR 캐시(페이지 revalidate 따름)

**`regionBlurb(input): string`** — 예: "{지역}에는 아파트 N개 단지가 있으며 최근 1년 N건이 거래됐습니다. 평균 매매가는 X억(범위 ~), 전세가율은 약 Z%입니다. 거래가 활발한 단지로는 …" 조사·수치 표현은 섹션 1과 동일 util 사용.

**배치:** `/region/[code]` h1 아래에 서술 + (선택) 작은 통계 행(단지 수·평균가·거래량) 시각화. 기존 "거래 많은 아파트 단지" 카드 목록은 유지.

### 섹션 3 · 메타 보정 (Medium)

- **법적 페이지 6종 description 추가**: `/about`, `/contact`, `/privacy`, `/terms`, `/data-source`, `/sitemap`. 각 페이지 성격에 맞는 1줄 고유 설명(현재는 루트 description이 잘못 노출됨).
- **`/villa/[id]` 메타 통일**: title을 `${name} 실거래가 · ${region.fullName}`, description에 평균 매매가·거래량을 포함해 apt/officetel 패턴과 맞춘다(현재는 `${name} ${typeLabel} 실거래가`로 빈약, 지역 누락).

### 섹션 4 · 구조화 데이터 확장 (Medium)

- **`/subscription/[id]` JSON-LD 추가**: `BreadcrumbList` + 공고 스키마(지역·접수기간 등 가용 필드). 청약은 분양 일정/가격이 있으므로 `Event` 또는 경량 `WebPage` 중 가용 데이터에 맞는 형태로(구현 단계에서 필드 확인 후 확정, 과설계 금지).
- **시설 `placeSchema` 필드 보강**: 학교/병원/약국/어린이집 스키마에 `telephone`, `openingHours` 등을 **데이터가 있는 경우에 한해** 추가. 없으면 생략(undefined → JSON에서 자동 제외).

## 데이터/의존성

- 기존 lib 함수 재사용: `getPropertyById`, `getPropertyLatLng`, `getNearbyInfra`, `getNearbySubwayStations`, `getMonthlyChartData`, `getSigunguByCode`, `getTopPropertiesByVolume`, `formatBillion`.
- PR #67의 산출물 재사용: `lib/seo/json-ld.tsx`(`placeSchema`/`breadcrumbSchema`/`JsonLd`).
- 신규: `lib/seo/blurb.ts`, `lib/seo/josa.ts`, `getRegionStats`.
- 신규 의존성: 없음.

## 검증 전략

1. `josa`·`propertyBlurb`·`regionBlurb` **순수 함수 단위 테스트**: 다양한 입력 프로필(거래량 구간·전세가율·추세·인프라 유무·받침 유무)에 대해 기대 문구/조사 단언.
2. `getRegionStats` DB 통합 테스트(선택): 시드 지역에 대해 집계값 검증.
3. 라이브 HTML 확인: apt/villa/region 상세 소스에 서술 문단이 SSR로 존재하는지, 법적 페이지 description이 고유하게 노출되는지, subscription JSON-LD가 들어가는지.
4. `pnpm test:unit`, `pnpm typecheck`, `pnpm lint` 통과.

## 리스크

- **여전히 "템플릿스러움"**: 조건 분기·수치 다양화로 완화하되, 골격이 같다는 한계는 존재. → 수치·카테고리 조합의 다양성을 충분히 확보, 필요 시 문장 순서/표현 variant 추가.
- **조사 처리 정확도**: 외래어·숫자·영문 종결 단지명에서 받침 판정이 애매할 수 있음. → 한글 음절 기준 판정 + 비한글 종결 시 기본값 규칙.
- **`getRegionStats` 성능**: 시군구별 집계가 무거울 수 있음 → 단일 집계 쿼리 + ISR 캐시로 완화.

## 산출물 요약

- `lib/seo/josa.ts` + 테스트
- `lib/seo/blurb.ts`(`propertyBlurb`, `regionBlurb`) + 테스트
- `getRegionStats(sigunguCode)` 집계 함수
- apt/officetel/villa 상세에 `propertyBlurb` 렌더
- `/region/[code]`에 `regionBlurb` + 통계 렌더
- 법적 페이지 6종 description, `/villa/[id]` 메타 통일
- `/subscription/[id]` JSON-LD, 시설 `placeSchema` 필드 보강

## 부록 · 템플릿 실측 미리보기 (실제 DB 데이터)

> 더샵부평센트럴시티(인천 부평구, 2022년 준공): 매매 78건·전세 61건 활발, 전세가율 61%, 하락 흐름, 지하철 1개역.
> 도램마을17단지(세종, 2015년): 매매 3건으로 거래 드뭄, 전세가율 42%, 보합세, 지하철 문장 생략.
> 팔팔(세종, 1991년): 매매 1건, 전세 데이터 없어 전세 문장 생략, 1.33억.

조건 분기에 따라 문장 구성이 실제로 달라짐을 확인(미리보기 스크립트는 throwaway로 삭제됨).
