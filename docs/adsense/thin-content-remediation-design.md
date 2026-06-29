# AdSense "낮은 가치 콘텐츠(thin content)" 극복 — 종합 개선 설계 (Remediation Design)

> 작성: 2026-06-29 · 상태: 설계 승인됨, 구현 plan 작성 대기
> 진단(왜 거절): [`thin-content-diagnosis.md`](./thin-content-diagnosis.md)
> 신규 증거: 동종 사이트 2곳(ilsangkit·ayo) **라이브 실측**(2026-06-28, 실제 브라우저 DOM·네트워크·스크립트)

## 0. 이 문서의 위치

- **무엇이 thin이고 왜 거절됐나** → `thin-content-diagnosis.md` (원인 ①POI 디렉터리 142,700 ②청약·금융·전세 6,150 ③매물 롱테일 ④board 20건).
- **무엇을 할 것인가** → 본 문서. 8개 레버 + 단계 + 수용기준.
- **무게중심(중요, 2026-06-29 재스코프):** 통과 필수 = **L1(병원 SSR, ✅완료) + 원본 콘텐츠 분량(L7 `/guide` 신설)**. 재스코프로 L2(villa)는 이미 적정·L9는 subscription 산문 polish로 축소(통과 필수 아님). 나머지(L3·L4·L5)는 **ilsangkit식 polish — ayo는 없이 통과.** 특히 **에디토리얼 링크 축에서 imjang-on은 이미 통과 사이트(ayo)와 동일 상태**(둘 다 비맥락 전역 링크)라 **L4(맥락화)는 순수 품질 향상**이다.

## 1. 신규 증거 — 같은 종류 사이트 2곳이 어떻게 통과했나

두 사이트 모두 imjang-on과 **동일한 공공데이터 미러**(부동산 실거래 + 청약 + 병원·약국 등 POI)이며, **AdSense 승인 후 광고 송출 중**임을 라이브로 확인했다.

| 항목 | ilsangkit.co.kr | ayo.pe.kr (코드크래프트) | imjang-on (현재) |
|---|---|---|---|
| 애드센스 | ✅ 라이브 `pub-2088264360250020`, POI당 6슬롯 | ✅ 라이브 `pub-1738081609565175`, POI당 9슬롯 | 신청/배선 `pub-7716793757405086`, 1슬롯 |
| POI 상세 색인 | `index,follow` (유지) | `index,follow` — **데이터 "정보없음"인 페이지도 색인 유지** | `index,follow` (P1~P4 noindex는 #162에서 되돌림) |
| 빈약 페이지 처리 | 진짜 무내용(와이파이)만 noindex | **noindex 안 함** — geo 주변 셸로 지탱 | (격차) 저거래 villa 등 붕괴 |
| 페이지 두께 원천 | 구조필드 + 주변 + **FAQ** + 관련가이드 + 출처 | 구조필드 + **주변 약국8·병원8** + 전역최신뉴스블록 + 출처·면책 | 구조필드 + 주변(아파트·지하철·인프라) + 출처 |
| FAQ / FAQPage | ✅ 보유 | ❌ | ❌ (전 템플릿) |
| JSON-LD | Organization·Pharmacy·Breadcrumb·**FAQPage·Dataset** | WebPage·Organization | Place서브타입·Breadcrumb |
| 에디토리얼 (상세 링크) | `/guide` 45편 + POI에 **주제 맞춤 상록 가이드** 링크 *(검증됨)* | `/article` 일간 + `/guide`(법령) 보유하나 **POI 상세엔 전역 최신뉴스 5건(비맥락)** · `/guide`는 나브에만 *(검증됨)* | board 20건 + **전역 최신4건(비맥락)** |
| 크롤러 정책 | 개방 | **구글 전용**(봇 35종 차단, Google·Mediapartners만 허용) | 개방(`User-agent:*`) |
| 색인 규모(사이트맵) | 자식 74개 | 자식 ~2,334개 | 315,105 URL |

**핵심 교훈 — 근거 등급 구분 (중요):**

**둘 다 하는 것 (강한 근거 = 통과 필수급):**
1. **숨기지 말고 채운다** — 둘 다 POI를 noindex하지 않고 enrich로 통과. ayo는 "정보없음" 페이지조차 geo 주변 셸로 지탱하며 색인 유지·광고 송출.
2. **에디토리얼 코퍼스 보유(분량)** — ilsangkit 45편 / ayo 일간 발행. 원본 콘텐츠 절대량이 imjang-on(20건)보다 큼.
3. **구조화 데이터 + 출처표기 + 광고 송출.**

**ilsangkit만 하는 것 (차별화 업사이드 — ayo는 없이 통과 = 통과 필수조건 아님):**
4. **FAQ / FAQPage** — ayo엔 전무.
5. **주제 맞춤 상록 가이드 링크** — ⚠️ **검증 결과 ayo의 POI 상세 에디토리얼 링크는 전역 최신뉴스 5건(비맥락)으로, 현 imjang-on board 브리핑과 동일 패턴.** /guide(법령)는 나브에만. 즉 "맥락 매칭·상록 가이드"를 상세에 거는 건 **ilsangkit 하나뿐** → **품질 업사이드이지 통과 필수 아님.**

**ayo만 하는 것:** 구글 전용 robots · 압도적 breadth(자식맵 2,334) · 높은 광고밀도 · 사업자 E-E-A-T.

**imjang-on이 이미 가진 우위(승자엔 없음, 보존 대상):** 주변 아파트 실거래가 통합 · 4개 기관 다중 출처 · 가격흐름 그래프 · SSR · Place JSON-LD.

## 2. 설계 원칙

1. **숨기지 말고 채운다.** blanket noindex 금지(승자 증거상 오답, #162와 일치). noindex는 geo 주변 셸조차 만들 수 없는 잔여 페이지에만 외과적으로.
2. **맥락 매칭·상록 가이드는 업사이드(필수 아님).** ilsangkit만 하는 차별화. ayo는 비맥락 전역 최신글(=현 imjang-on 패턴)로도 통과 — 품질로 추진하되 통과 필수조건으로 과신 금지.
3. **오리지널 콘텐츠 앵커 = `/guide`.** board(소식)는 현행 유지, 원본 분량 신호는 **신규 `/guide` 상록 가이드 수십 편**이 책임(board 확대 아님). 단 **지역 곱 양산 금지**(thin 재발).
4. **출처·E-E-A-T 보존.** imjang-on 최강 자산, 건드리지 않음.

## 3. 레버 — L1 통과 필수(완료), L7 원본 앵커, 나머지 polish/선택

> **근거 등급(2026-06-29 재스코프 반영):** **L1 = 통과 필수(✅완료)** — 유일한 실측 크롤 갭(병원 25%). **L7 = 원본 콘텐츠 앵커**(둘 다 코퍼스 보유 → 분량 신호, 통과 관련). **L2(villa) = 이미 적정, action 없음.** **L9 = subscription 산문 polish(축소).** L3·L4 = ilsangkit식 polish(ayo는 없이 통과). L5 = L4용 board 태깅. L6 = ayo만(선택). → 통과 무게중심 = **L1(완료) + L7**.

### L1 — 병원 탭 SSR화 [최고 ROI · 색인 25%]
- **문제:** `HospitalTabs`가 `'use client'` useState. 초기 HTML에는 기본 `diagnosis` 탭만, **시설(병상·장비)·운영(진료시간·응급실·주차·교통) 탭이 client-only로 크롤 HTML에서 누락.** 79,562 페이지(25.3%)에 영향.
- **접근:** 모든 탭 패널을 서버 렌더하고 가시성만 CSS/`<details>`/radio로 토글(콘텐츠는 항상 DOM에 존재). 기존 인터랙션 유지 가능.
- **파일:** `app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-tabs.tsx`
- **수용기준:** 임의 병원 상세를 **JS 미실행 fetch**(WebFetch/curl) 시 진료시간·시설·운영 텍스트가 본문 HTML에 존재.

### L2 — villa: 재스코프 결과 **이미 적정**(action 없음) *(2026-06-29 코드 확인)*
- **재스코프:** audit의 "거래 1~2건 → 섹션 붕괴"는 **부정확.** `app/(public)/villa/[id]/page.tsx`는 **blurb(산문)·실거래표·가격그래프·면적비교·주변단지비교(좌표 무관)·사이드바·브리핑을 거래 수와 무관하게 항상 렌더**한다(`propertyBlurb`가 이미 저거래·무거래 케이스를 문장으로 처리). `coord`만 지도·지하철·인프라를 가리며, 그때도 페이지가 비지 않는다.
- **결론:** villa는 손댈 것 없음 → **Phase A에서 제외.** 좌표 없는 극소 잔여만 추후 측정 후 noindex 여부 판단(현재는 보류).

### L9 — subscription 산문 blurb 보강 (소폭 polish) *(2026-06-29 재스코프됨)*
- **재스코프:** 네 템플릿(청약·금융·전세) 모두 구조화 섹션 + 내부링크를 거래/데이터와 무관하게 항상 렌더 → audit의 "빈 페이지 붕괴"는 과장. finance(323)·jeonse(47)는 물량 미미 + cross-link 보유 → 제외. 유일하게 의미 있는 건 **subscription(5,780)의 산문 부재**(라벨-값만).
- **접근:** `lib/seo/blurb.ts`에 `subscriptionBlurb()`(데이터 기반 한 문단) 추가 → `subscription/[id]/page.tsx`의 Hero 아래에 villa와 동일 스타일로 렌더. **새 데이터 의존 없음**(기존 notice 필드 사용).
- **파일:** `lib/seo/blurb.ts`, `app/(public)/subscription/[id]/page.tsx`, `tests/lib/subscription-blurb.test.ts`(신규).
- **수용기준:** subscription 상세에 단지명·지역·세대수·접수일정을 담은 고유 산문 문단이 SSR 렌더되고, 데이터 누락 시 우아한 폴백.
- **범위 밖:** coord-null 같은지역 청약 링크(사이드바·"위치정보없음" 박스·브리핑이 이미 dead-end 방지) · villa/finance/jeonse(이미 적정).

### L3 — FAQ + FAQPage 스키마 [전 템플릿 · ilsangkit only 차별화]
- **문제:** 전 템플릿 FAQ 전무(승자 중 ilsangkit 보유). JSON-LD에 `faqSchema` 부재.
- **접근:** `lib/seo/json-ld.tsx`에 `faqSchema()` 추가 + 신규 `Faq` 서버 컴포넌트. Q&A는 **카테고리별 맥락형**(병원 이용·약국 야간운영·실거래가 읽는 법·청약 일정·전세보증 한도 등)으로, **실제 유용해야 함**(무의미 보일러플레이트 FAQ는 그 자체가 thin → 금지). 페이지 데이터로 채울 수 있는 항목은 동적 치환.
- **파일:** `lib/seo/json-ld.tsx`, `components/ui/faq.tsx`(신규), 각 detail page.
- **수용기준:** POI/매물 detail이 가시 FAQ + FAQPage JSON-LD를 렌더하고 리치결과 검사 통과. 카테고리당 Q&A가 서로 다름(중복 아님).

### L4 — 에디토리얼 링크 맥락화 (관련 가이드 + 관련 소식) [전 템플릿 · ilsangkit only 업사이드]
- **문제:** `BoardBriefingSection`이 카테고리 매칭 없이 모든 페이지에 동일한 최신 4건 노출. **ilsangkit**은 POI에서 "관련 가이드"로 주제 맞춤 상록 가이드를 거는데 imjang-on엔 그 대상 자체가 없음(board는 뉴스). ※ **ayo는 이걸 안 하고도(전역 최신뉴스 링크) 통과** → 필수 아닌 품질 업사이드.
- **접근:** POI 상세에 **① 관련 가이드(L7 evergreen, 카테고리 1:1 매핑) — ilsangkit 패턴** + **② 관련 소식(board 뉴스, 카테고리/지역 매칭)** 을 함께 노출. 가이드는 상록이라 항상 주제 적합, 소식은 시의성 보강. 매칭 부족 시에만 최신글 폴백.
- **파일:** `app/(public)/_components/board-briefing-section.tsx`(소식) + 신규 관련-가이드 블록. **의존: L7(가이드 존재), L5(board 카테고리 태깅).**
- **수용기준:** 병원 페이지엔 의료 가이드 + 의료 소식, 아파트 페이지엔 부동산 가이드 + 부동산 소식이 노출되고 페이지마다 다름.

### L5 — board 카테고리 태깅 (확대 아님) [L4 연동용 · 값싼 작업]
- **문제:** L4가 board 소식을 페이지 주제로 매칭하려면 board 카테고리가 POI 타입을 덮어야 하는데, 현재 5종(FINANCE·LOAN·ECONOMY·SUBSCRIPTION·REALESTATE)뿐 — **의료·생활이 없음.**
- **본 spec의 범위:** board를 **지금 그대로 둠**(증산·죽이기 둘 다 안 함). L4가 매칭할 수 있게 **카테고리만 정렬/태깅**. **원본 콘텐츠 분량 신호는 L7(/guide)이 책임** — board 증산은 본 설계 밖(기존 플랜3 소관).
- **파일:** `lib/board/labels.ts`·`generate.ts` 카테고리 상수, `prisma/schema.prisma` `PostCategory`.
- **수용기준:** board 카테고리 ↔ 페이지 카테고리 매핑 테이블 존재, L4가 그걸로 매칭.

### L7 — evergreen `/guide` 신설 = **원본 콘텐츠 앵커** [board 확대 대체 · 통과 관련]
> **상세 설계:** [`guide-system-design.md`](./guide-system-design.md) — **별도 `Guide` 테이블**(board와 분리)·`GuideCategory` enum·`lib/guide` 생성기·**신규 `/admin/guides` 검수**·~25–40편(카테고리당 2~3) 확정.
- **역할(분량 = 통과 관련):** **둘 다 원본 코퍼스를 보유**(ilsangkit 가이드 45 · ayo 기사 일간)하는 게 통과 공통점인데 imjang-on은 board 20건뿐. 이 **원본 분량 격차를 고품질 상록 가이드로 메우는 게 L7**(board 확대 대신). ※ 가이드를 POI에 "관련 가이드"로 거는 **링크 부분**은 ilsangkit식 polish(ayo는 안 걸고 통과)지만, **가이드 코퍼스의 존재 자체는 통과 관련**이다.
- **접근:** 신규 라우트 `/guide`(목록) + `/guide/[slug]`(상세). 주제: 병원 진료과 선택 · 약국 야간/공휴일 운영 · 어린이집 고르는 법 · 학교·학군 보는 법 · 실거래가 읽는 법 · 오피스텔/빌라 매매 체크포인트 · 청약 일정·자격 · 금융 한도 · 전세보증 한도 등. 본문 **고유 해설·하우투 허용**(board 가드레일과 달리 의견 금지 완화, **과장 금지·출처표기는 유지**). `HowTo`/`Article`(+ 필요 시 `FAQPage`) JSON-LD.
- **분량 목표:** **수십 편의 서로 다른 주제 가이드**(ilsangkit ~45 지향). 카테고리당 1편(10~12)은 **시작점일 뿐** — 원본 앵커가 되려면 더 필요.
- **⚠️ 양산 금지:** "심야 약국 찾기 in 강남구" 식 **지역 곱하기 양산 = 근접중복 thin 재발이므로 금지.** 지역 변수로 페이지를 불리지 말 것 — 주제별 고유 1편만.
- **파일:** `app/(public)/guide/page.tsx` · `app/(public)/guide/[slug]/page.tsx`(신규), 가이드 콘텐츠 소스, `lib/sitemap/sources.ts`(가이드 URL 방출), `lib/seo/json-ld.tsx`(HowTo/Article).
- **수용기준:** 서로 다른 주제의 상록 가이드 **수십 편**이 SSR·색인, 각 POI 카테고리에 ≥1편 매핑(L4가 링크), **지역 곱 페이지 0**, 본문은 라벨-값이 아닌 고유 산문.

### L6 — (선택) 구글전용 robots + 광고 밀도 [운영]
- **접근:** ayo식 — `User-agent` 분기로 Googlebot·Mediapartners-Google 허용, Ahrefs·Semrush·AI 스크래퍼·비핵심 봇 차단. **크롤 예산 절약 + Supabase 디스크 IO 병목 동시 완화**(cold ISR 크롤러 부하). AdSense 슬롯 1→적정 밀도(승인 후).
- **파일:** `app/robots.ts`, 광고 컴포넌트.
- **수용기준:** robots가 Google·Mediapartners 무제한, 지정 봇 차단. (광고 밀도는 승인 후 단계)

## 4. 단계 (ROI 순)

- **Phase A — 통과 필수 · 코드만:** **L1 (✅완료)** — 병원 25% SSR 복구.
  → 재스코프 결과 L2(villa)는 이미 적정(제외), L9는 subscription 산문 polish로 축소. 실측 크롤 갭은 L1뿐이었고 이미 닫힘.
- **Phase B — 콘텐츠 (L7=원본 앵커·통과 관련 / L3·L4=polish):** L7 · L3 · L4 · L5
  → **`/guide` 수십 편 신설 = 원본 콘텐츠 앵커**(둘 다 보유하는 분량 격차 해소, **통과 관련**, board 확대 대체) + FAQ/FAQPage·에디토리얼 맥락화(L4)·board 카테고리 태깅(L5)(이쪽은 ilsangkit식 polish). **L7을 선두에**(L4 가이드 링크가 L7에 의존). ⚠️ `/guide`는 지역 곱 양산 금지.
- **Phase C — 선택·운영:** L6
  → robots 구글전용(IO 병목까지) + 광고 밀도.

## 5. 범위 밖 (YAGNI)

- blanket noindex(이미 #162에서 되돌림, 승자 증거상 오답) · 광고 슬롯 과다 삽입(승인 전 역효과) · 전면 디자인 개편 · 신규 데이터소스 추가 · **board 증산**(L5는 태깅만, 증산은 플랜3 소관) · **`/guide` 지역 곱하기 양산**(근접중복).

## 6. 리스크 & 완화

| 리스크 | 완화 |
|---|---|
| 템플릿 FAQ가 또 다른 thin/near-duplicate로 인식 | 카테고리별로 Q&A를 차별화 + 페이지 데이터로 동적 치환. 무의미 FAQ 금지(L3 수용기준). |
| L2 폴백 문단이 전 villa에서 동일문구(근접중복) | `lib/seo/blurb.ts`가 지역·단지 데이터로 변주(기존 propertyBlurb 패턴 활용). |
| L4가 L7/L5 재고에 의존 | L7(가이드)을 Phase B 선두에 두어 "관련 가이드" 링크 대상을 먼저 확보. board 소식은 카테고리 매칭+최신 폴백으로 병행 동작. |
| 신규 `/guide`가 얇거나 양산되면 또 thin | 각 편 충분한 고유 해설+출처표기. **지역 곱하기 양산 금지**(근접중복 재발). 수십 편의 **서로 다른 주제**로, 라벨-값 금지. |
| 병원 탭 SSR 전환이 인터랙션 회귀 | 콘텐츠는 항상 DOM, 가시성만 토글 → 동작 동일. 회귀 테스트로 확인. |

## 7. 검증 계획 (현재 baseline 실측 → 목표)

> **baseline: 2026-06-29 운영 사이트(imjangon.co.kr) raw HTML(JS 미실행, curl) 실측.** 봇 가독성·구조화·빈 페이지가 **pass/fail 게이트**. **맥락성은 품질 지표(게이트 아님)** — ayo가 비맥락 전역 링크로 통과해 합격 조건이 아니다.

| 항목 | 측정 방법 | 현재값 (baseline) | 목표값 |
|---|---|---|---|
| **봇 가독성** | 병원 상세 no-JS fetch에 운영·시설 탭 텍스트 존재? | ❌ **진료시간·응급실·병상 누락**(클릭-게이트), 진료과목(기본탭)만 존재 | ✅ 진료시간·응급실·병상이 raw HTML에 존재 **(L1)** |
| **구조화(JSON-LD)** | 상세 raw HTML의 `@type` | 병원=Hospital·아파트=Residence·약국=Pharmacy + Breadcrumb·Org·WebSite / **FAQPage·Dataset 없음** | ✅ POI·매물에 FAQPage 추가 **(L3)** |
| 맥락성 *(품질 지표 · 게이트 아님)* | 병원·아파트·약국의 board 링크 비교 | 3페이지 전역 동일(`/board/24·23·22·21`) — **단 ayo도 동일 비맥락으로 통과** | (선택) 페이지 카테고리별로 다름 **(L4)** |
| subscription 산문 *(품질)* | subscription 상세 no-JS fetch에 고유 산문 문단 존재? | 라벨-값만, 산문 0 **(L9 대상)** | ✅ 단지·지역·세대수·일정 산문 문단 렌더 **(L9)** · ※villa는 재스코프 결과 이미 적정 |

- **측정 방식:** raw HTML을 curl로 받아 ① JSON-LD `<script>` `@type` 파싱 ② 콘텐츠 마커 grep ③ `/board` 링크 추출. (이번 baseline에 쓴 스크립트를 회귀 테스트로 고정)
- **재심사:** Phase A 배포 → 위 게이트 재실행 PASS 확인 → Search Console 사이트맵 재제출 → AdSense 콘솔 검토 재요청(수일~수주 소요, 직접 실행 필요).

## 8. 미결 결정 (plan에서 확정)

1. **L7 `/guide` 총 목표 편수** — 원본 앵커가 되려면 수십 편. 정확한 수치 확정.
2. L2 폴백에서 noindex로 보낼 "잔여" 정의(좌표 부재 외 추가 조건?).
3. L6 채택 시점(애드센스 승인 전/후) 및 광고 밀도 목표.
4. **L7 콘텐츠 생산 방식**(수기 저작 vs AI+검수, board 파이프라인 재사용 여부). ※ board 증산은 본 spec 밖(플랜3).
5. **L7 가드레일** — board의 의견·분석 금지를 가이드에선 어디까지 완화할지(과장 금지·출처표기는 유지).
