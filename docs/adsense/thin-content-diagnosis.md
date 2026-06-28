# AdSense "낮은 가치 콘텐츠(thin content)" 거절 — 정밀 진단 및 개선 로드맵

> 작성: 2026-06-28 · 방법: 6개 렌즈 병렬 증거수집 → 적대적 검증(36건 중 21건 확정) → 종합 → 완벽성 비평.
> 라이브 측정: 운영 사이트맵 38청크 전수(315,105 URL) + 페이지 타입별 본문 직접 fetch.

## 0. 한 줄 결론

거절 동인은 **봇 가독성이 아니라 색인 인벤토리의 구성**이다.
색인 **315,105개 URL** 중 **고유 서술이 사실상 0인 템플릿/디렉터리 페이지가 약 절반(POI 디렉터리 ~142,700 + 청약·금융·전세보증 ~6,150 + 롱테일 거래빈약 매물 수만 건)** 을 차지하고, 이를 상쇄할 **사람이 쓴 원본 글은 board 20건(0.006%)뿐**이다. AdSense의 표본 기반 정성 심사가 표본을 추출하면 거의 항상 "부가가치 없는 템플릿"에 떨어지는 구조다.

## 1. 색인 인벤토리 (라이브 전수 집계, 315,105 URL)

| 타입 | URL 수 | 비중 | thin 여부 |
|---|---:|---:|---|
| villa 상세 | 110,753 | 35.2% | **혼합** — 거래 多 단지는 데이터풍부, 거래 1~2건 롱테일은 thin |
| medical(병원 79,562 + 약국 25,688) | 105,250 | 33.4% | **thin** (라벨-값, 고유 산문 0) |
| apt 상세 | 39,969 | 12.7% | 대체로 데이터풍부(인기단지), 롱테일 일부 thin |
| childcare 상세 | 25,102 | 8.0% | **thin** |
| officetel 상세 | 13,999 | 4.4% | 혼합(롱테일 thin) |
| school(허브 261 + 상세 12,323) | 12,584 | 4.0% | 상세 **thin** |
| **subscription `/subscription/[id]`** | **5,780** | 1.8% | **thin** (날짜표+공고제목, 산문 0) |
| amenity `?region=` 디렉터리 | 994 | 0.3% | **thin** (상호+주소 카드) |
| **finance `/finance/[seq]`** | **323** | 0.1% | **thin** (한도·금리 라벨-값) |
| region 시군구 허브 | 261 | 0.08% | 데이터요약 산문 보유 → 정당 |
| **jeonse-guarantee `/[id]`** | **47** | — | **thin** |
| **board(원본 글)** | **20** | 0.006% | **원본·고가치** (유일한 차별화 자산) |
| life / urban | 4 / 2 | — | — |

> 매물 게이트는 `lib/sitemap/sources.ts:108`의 `txCount12m > 0` — **12개월 1건 이상**이라는 매우 낮은 문턱이라, villa/officetel 롱테일에 거래 1~2건짜리 thin 페이지가 대량 포함된다. (예: `/villa/273555` 부천 동남주택5동 = 최근 1년 매매 1건 + 월세 1건이 전부)

## 2. 진짜 거절 원인 (기여도 순)

### 원인 ① POI 디렉터리 상세 ~142,700개가 고유 서술 0 [최상위, conf 0.85]
- hospital(79,562)+pharmacy(25,688)+childcare(25,102)+school 상세(12,323) ≈ 142,674개.
- 페이지 고유 텍스트는 시설명·주소·전화·개설일 등 **라벨-값 수백 자**, 자체 산문 0.
- "주변 아파트 실거래가" / "최신 소식" 위젯이 **같은 지역 모든 시설 페이지에 동일 재사용**(근접중복).
- 코드: `lib/sitemap/sources.ts:144-217`(1행=1URL 방출). `lib/seo/blurb.ts`에 이 타입용 서술 생성기 **부재**.
- 라이브: `/medical/hospital/370701/3`(가시 1,402자, 고유산문 0), `/school/46170/10230`(≈0).
- 정책: **Thin content with little or no added value** + near-duplicate.

### 원인 ② 청약·금융·전세보증 템플릿 ~6,150개 thin [상위, conf 0.85 — Synthesis가 누락, Critique가 발견]
- subscription 5,780 + finance 323 + jeonse 47. 전부 동일 템플릿, 자체 산문 0.
- **subscription 5,780은 amenity(994)의 6배** — 누락하면 안 되는 큰 덩어리.
- 코드: `sources.ts:125-141`(subscription), `:219-235`(finance), `:256-272`(jeonse).

### 원인 ③ 매물 롱테일 thin (villa 35% 중 거래빈약 하위집합) [상위, conf 0.8 — Synthesis는 "건드리지 말라"고 했으나 Critique가 반증]
- villa 110,753(단일 최대 타입)·officetel 13,999 중 거래 1~2건 롱테일은 명백히 thin인데 `txCount12m>0` 게이트로 전부 색인됨.
- "매물 = 전부 데이터풍부"는 인기단지 2~3개 표본의 과일반화. 인기단지(`/apt/134` 5,316자)는 정당하나 롱테일은 아니다.

### 원인 ④ 원본 편집 콘텐츠 절대량 빈약 (board 20건) [①②③의 거울상, conf 0.8]
- 사이트 유일 원본이 board 20건. 본문 품질 자체는 합격선(`/board/16` 1,715자, 출처 명기).
- 문제는 "얕다"가 아니라 **"너무 적어 심사 표본에 거의 안 잡힌다"** (샘플링 확률).
- 가드레일이 의견·전망·분석 전면 금지(`lib/board/guardrails.ts:2-10`) → 독자 해설 부가가치 구조적 0.
- 갱신 주 1회·최대 1건(`.github/workflows/generate-board-posts.yml` cron `0 2 * * 1`) → 성장 정체.
- 정책: AdSense Eligibility "high-quality, original content" 미달.

## 3. 비(非)원인 — 명확히 기각

| 의심 | 판정 | 근거 |
|---|---|---|
| 봇 가독성 / SSR·ISR 렌더링 | **기각** | 전 페이지 SSR/ISR, Googlebot fetch HTTP 200·완전 렌더 |
| 정책 페이지 부재 | **기각** | privacy/terms/about/contact 4종 존재·footer 링크 완비 |
| canonical / 파라미터 근접중복 | **기각(부차)** | 필터·페이지네이션이 base/region canonical로 접힘. 동인은 "중복"이 아니라 "얇음의 양" |
| robots 색인 차단 오류 | **기각** | `app/layout.tsx:25` `index:true`. 차단이 아니라 **thin 페이지를 전부 색인**하는 게 문제 |
| 광고 과다 | **기각** | 실제 광고 유닛 0개(로더만 존재) |

> ⚠️ 아직 **미측정**이라 기여 가능성 열려 있는 항목(Critique 지적): 홈페이지(`/`) 콘텐츠 깊이, 메타 title/description 중복성, 모바일 UX·Core Web Vitals, 도메인 연령·트래픽(GSC). 재신청 전 측정 권고.

## 4. 핵심 의사결정 — ~38만 프로그래매틱 페이지 처리

**"둘 다, 단 순서가 있다": ①얇은 페이지 noindex 감축을 먼저(decisive lever) → ②원본 부가가치 추가 병행 → ③데이터풍부 페이지만 색인 유지.**

- AdSense는 표본 기반 정성 심사 → "고유 서술 0" 페이지를 색인에서 빼면 심사·크롤 표본이 고가치 페이지로 떨어질 확률이 급등. 가장 직접적·저비용 레버.
- "원본 글만 늘려 비율 개선" 단독은 수천 건 필요 → 비현실적. thin 페이지를 둔 채로는 거절이 안 뒤집힌다.
- **단, Synthesis의 "noindex 후 171k 잔존=전부 고가치"는 틀렸다**(Critique): 잔존에 subscription 5,780+finance+jeonse+롱테일 thin villa 수만 건이 그대로 남는다. noindex 대상을 확장하고 매물 게이트를 올려야 인과가 성립.

## 5. 개선 로드맵 (우선순위)

표기: [영향도][공수][정책] / 변경 위치

### P1. POI 디렉터리 상세 noindex (~142,700) — [high][M][thin content]
- 4개 타입 `generateMetadata`에 `robots: { index: false, follow: true }`:
  - `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx`
  - `app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx`
  - `app/(public)/childcare/[sigunguCode]/[id]/page.tsx`
  - `app/(public)/school/[sigunguCode]/[id]/page.tsx`
- 사이트맵 동기화: `lib/sitemap/sources.ts`의 해당 소스 비우기. **단 `:274` SOURCE_ORDER 중간 제거는 샤드 인덱스 매핑을 깨므로**, `count()`/`findMany`를 빈 결과로 만들어 위치 보존(권장) 또는 플래그 게이팅.

### P2. 청약·금융·전세보증 상세 noindex (subscription 5,780 + finance 323 + jeonse 47) — [high][S][thin content] ★Critique 추가
- 각 `generateMetadata`에 noindex + 사이트맵 소스 비우기.
- **amenity(P3, 994)보다 6배 큰 영향** — 우선순위 상향.
- 위치: `app/(public)/subscription/[id]/page.tsx`, `finance/[seq]/page.tsx`, `jeonse-guarantee/[grntDvcd]/page.tsx` + `sources.ts:125-141/219-235/256-272`.

### P3. 매물 롱테일 색인 문턱 상향 — [high][S][thin content] ★Critique 추가, 최대 누락 레버
- `lib/sitemap/sources.ts:108` 매물 게이트를 `txCount12m > 0` → **거래 ≥ 3건(또는 매매 ≥ 1건)** 등으로 상향해 거래빈약 villa/officetel 롱테일을 색인에서 제거.
- (선택) 상세 페이지도 거래 0~1건이면 noindex 처리 검토.

### P4. amenity?region 디렉터리 noindex (994) — [med][S][low value]
- `app/(public)/amenity/[category]/page.tsx` `generateMetadata`에서 `searchParams.region||sido` 존재 시 `robots.index=false`. `sources.ts:61-69` push 루프 제거(파라미터 없는 허브만 유지).

### P5. 원본 board 확대 — [high][M, +4~5주 캘린더][original content]
- 발행 20→**30+건**, cadence 주 1·최대 1건 → **주 2~3건**, 부동산·청약·세금 vertical 집중.
- `lib/board/guardrails.ts:2-10` 완화 검토: "출처 근거 비교·맥락 해설" 허용(과장 금지 원칙은 유지). 생성: `lib/board/generate.ts`. cadence: `.github/workflows/generate-board-posts.yml`.
- ⚠️ 원본 추가만으로는 거절이 안 뒤집힌다 — P1~P4와 **반드시 병행**.

### P6. board 청약 라운드업 dedupe — [low][S][duplicative]
- `/board/6·17·21` 동일 주제 반복. `lib/board/generate.ts` 후보 선정에서 최근 N일 동일 카테고리·출처 라운드업 중복 차단.

### P7. E-E-A-T 배선 — [med][M][trust]
- Post에 author/byline 추가(`prisma/schema.prisma`), `/about`에 운영주체 식별(상호/대표/연락).

### P8. 홈페이지 콘텐츠 깊이 + 미측정 항목 점검 — [med][M] ★Critique 추가
- 홈(`/`)은 심사자가 첫 번째로 보는 페이지인데 현재 링크 허브(고유 산문 ≈0). 편집 콘텐츠 보강.
- 메타 title/description 중복성, 모바일/CWV, 도메인연령·트래픽(GSC) 측정 후 기여도 판정.

## 6. 재신청 전 정량 게이트 (모두 충족)

1. **색인 구성**: POI 상세(~142,700) + subscription/finance/jeonse(~6,150) + amenity?region(994) noindex, 매물 게이트 상향으로 롱테일 thin 제거 → 색인 표본의 **다수가 데이터풍부 매물 + region 허브 + board**가 되도록.
2. **원본 글 ≥ 30건**(현 20), 본문 공백제외 ≥ 800자(권장 1,000자+), 핵심 vertical ≥ 80%.
3. **색인 유지 페이지 고유 서술 ≥ 200자**.
4. **갱신 cadence ≥ 주 2건**.
5. **E-E-A-T**: `/about` 운영주체 식별 + board author byline.
6. **GSC de-index 확인 + 대기**: noindex는 재크롤 반영에 수 주~수 개월. **GSC Coverage에서 thin 페이지가 실제 색인에서 빠진 것을 확인한 뒤** 재신청. (de-index 지연이 가장 큰 타임라인 리스크)

## 7. 근거 파일

- `lib/sitemap/sources.ts` — `:108`(매물 게이트), `:61-69`(amenity 격자), `:125-141`(subscription), `:144-217`(POI), `:219-235`(finance), `:256-272`(jeonse), `:275-287`(SOURCE_ORDER)
- `lib/seo/blurb.ts` — `:44-78`(propertyBlurb 템플릿), POI용 생성기 부재
- `lib/board/guardrails.ts` — `:2-10`(의견·분석 금지), `:18`(분량 800~2200)
- `.github/workflows/generate-board-posts.yml` — cron `0 2 * * 1`
- `app/robots.ts`, `app/layout.tsx:25`(전역 index:true)
- 라이브: sitemap 0~37 전수 315,105 URL, `/subscription/1`, `/finance/1`, `/jeonse-guarantee/29`, `/villa/273555`(매매1건 롱테일), `/medical/hospital/370701/3`, `/board/16`, `/`
