# AdSense "낮은 가치 콘텐츠(thin content)" 극복 — 종합 개선 설계 (Remediation Design)

> 작성: 2026-06-29 · 상태: 설계 승인됨, 구현 plan 작성 대기
> 진단(왜 거절): [`thin-content-diagnosis.md`](./thin-content-diagnosis.md)
> 신규 증거: 동종 사이트 2곳(ilsangkit·ayo) **라이브 실측**(2026-06-28, 실제 브라우저 DOM·네트워크·스크립트)

## 0. 이 문서의 위치

- **무엇이 thin이고 왜 거절됐나** → `thin-content-diagnosis.md` (원인 ①POI 디렉터리 142,700 ②청약·금융·전세 6,150 ③매물 롱테일 ④board 20건).
- **무엇을 할 것인가** → 본 문서. 6개 레버 + 단계 + 수용기준.

## 1. 신규 증거 — 같은 종류 사이트 2곳이 어떻게 통과했나

두 사이트 모두 imjang-on과 **동일한 공공데이터 미러**(부동산 실거래 + 청약 + 병원·약국 등 POI)이며, **AdSense 승인 후 광고 송출 중**임을 라이브로 확인했다.

| 항목 | ilsangkit.co.kr | ayo.pe.kr (코드크래프트) | imjang-on (현재) |
|---|---|---|---|
| 애드센스 | ✅ 라이브 `pub-2088264360250020`, POI당 6슬롯 | ✅ 라이브 `pub-1738081609565175`, POI당 9슬롯 | 신청/배선 `pub-7716793757405086`, 1슬롯 |
| POI 상세 색인 | `index,follow` (유지) | `index,follow` — **데이터 "정보없음"인 페이지도 색인 유지** | `index,follow` (P1~P4 noindex는 #162에서 되돌림) |
| 빈약 페이지 처리 | 진짜 무내용(와이파이)만 noindex | **noindex 안 함** — geo 주변 셸로 지탱 | (격차) 저거래 villa 등 붕괴 |
| 페이지 두께 원천 | 구조필드 + 주변 + **FAQ** + 관련가이드 + 출처 | 구조필드 + **주변 약국8·병원8** + 부동산·생활가이드 + 출처·면책 | 구조필드 + 주변(아파트·지하철·인프라) + 출처 |
| FAQ / FAQPage | ✅ 보유 | ❌ | ❌ (전 템플릿) |
| JSON-LD | Organization·Pharmacy·Breadcrumb·**FAQPage·Dataset** | WebPage·Organization | Place서브타입·Breadcrumb |
| 에디토리얼 | `/guide` 45편, POI에 **주제 맞춤** 링크 | `/article` 일간 발행 + `/guide`, POI에 맞춤 링크 | board 20건, **전역 최신4건(비맥락)** |
| 크롤러 정책 | 개방 | **구글 전용**(봇 35종 차단, Google·Mediapartners만 허용) | 개방(`User-agent:*`) |
| 색인 규모(사이트맵) | 자식 74개 | 자식 ~2,334개 | 315,105 URL |

**핵심 교훈 (독립 2개 사례 수렴):**
1. **숨기지 말고 채운다** — 둘 다 POI를 noindex하지 않고 enrich로 통과. ayo는 자기 데이터가 "정보없음"인 페이지조차 geo 주변 셸로 지탱하며 색인 유지·광고 송출.
2. **맥락 내부링크** — 전역 최신글이 아니라 **페이지 주제에 맞는** 가이드를 링크.
3. **오리지널 콘텐츠 앵커** — 활발한 에디토리얼 코퍼스(ilsangkit 45 / ayo 일간)를 두고 POI에서 역링크.

**imjang-on이 이미 가진 우위(승자엔 없음, 보존 대상):** 주변 아파트 실거래가 통합 · 4개 기관 다중 출처 · 가격흐름 그래프 · SSR · Place JSON-LD.

## 2. 설계 원칙

1. **숨기지 말고 채운다.** blanket noindex 금지(승자 증거상 오답, #162와 일치). noindex는 geo 주변 셸조차 만들 수 없는 잔여 페이지에만 외과적으로.
2. **맥락 내부링크.** 모든 detail 페이지의 에디토리얼 링크는 카테고리/지역 매칭.
3. **오리지널 콘텐츠 앵커 확대.** board를 키우고 POI에 역링크.
4. **출처·E-E-A-T 보존.** imjang-on 최강 자산, 건드리지 않음.

## 3. 레버 6개

### L1 — 병원 탭 SSR화 [최고 ROI · 색인 25%]
- **문제:** `HospitalTabs`가 `'use client'` useState. 초기 HTML에는 기본 `diagnosis` 탭만, **시설(병상·장비)·운영(진료시간·응급실·주차·교통) 탭이 client-only로 크롤 HTML에서 누락.** 79,562 페이지(25.3%)에 영향.
- **접근:** 모든 탭 패널을 서버 렌더하고 가시성만 CSS/`<details>`/radio로 토글(콘텐츠는 항상 DOM에 존재). 기존 인터랙션 유지 가능.
- **파일:** `app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-tabs.tsx`
- **수용기준:** 임의 병원 상세를 **JS 미실행 fetch**(WebFetch/curl) 시 진료시간·시설·운영 텍스트가 본문 HTML에 존재.

### L2 — 저거래 villa 폴백 셸 보장 [최고 ROI · 색인 35%] *(정정됨)*
- **문제:** 사이트맵 게이트가 `txCount12m > 0`이라 색인 villa는 모두 거래 ≥1이지만, **거래 1~2건 롱테일**은 차트·면적비교·주변비교가 null로 붕괴 → hero+라벨+폴백문구만 남음(110,753개, 35.2%).
- **접근(noindex 아님):** 좌표가 있으면 **geo 주변 셸(주변 아파트 실거래가·지하철·인프라) + 지역 맥락 한 문단을 거래 수와 무관하게 항상 렌더.** ayo가 "정보없음" 페이지를 지탱한 방식과 동일. noindex는 **좌표 부재로 주변 셸 자체가 불가능한 잔여**에만 한정(ilsangkit 와이파이 등가물).
- **파일:** `app/(public)/villa/[id]/page.tsx`, `lib/seo/blurb.ts`(맥락 문단 생성), Nearby* 렌더 게이트.
- **수용기준:** 거래 1건짜리 villa 표본에서도 주변 셸 + 맥락 문단이 렌더되고 "빈 페이지" 0건. 동일 패턴을 officetel 롱테일에도 적용.

### L3 — FAQ + FAQPage 스키마 [전 템플릿]
- **문제:** 전 템플릿 FAQ 전무(승자 중 ilsangkit 보유). JSON-LD에 `faqSchema` 부재.
- **접근:** `lib/seo/json-ld.tsx`에 `faqSchema()` 추가 + 신규 `Faq` 서버 컴포넌트. Q&A는 **카테고리별 맥락형**(병원 이용·약국 야간운영·실거래가 읽는 법·청약 일정·전세보증 한도 등)으로, **실제 유용해야 함**(무의미 보일러플레이트 FAQ는 그 자체가 thin → 금지). 페이지 데이터로 채울 수 있는 항목은 동적 치환.
- **파일:** `lib/seo/json-ld.tsx`, `components/ui/faq.tsx`(신규), 각 detail page.
- **수용기준:** POI/매물 detail이 가시 FAQ + FAQPage JSON-LD를 렌더하고 리치결과 검사 통과. 카테고리당 Q&A가 서로 다름(중복 아님).

### L4 — 에디토리얼 링크 맥락화 [전 템플릿]
- **문제:** `BoardBriefingSection`이 카테고리 매칭 없이 모든 페이지에 동일한 최신 4건 노출.
- **접근:** 페이지 카테고리/지역에 매칭된 board 글을 우선 노출(병원→의료/생활, 아파트·villa·officetel→부동산, 청약→청약, 금융→금융). 매칭 부족 시에만 최신글 폴백.
- **파일:** `app/(public)/_components/board-briefing-section.tsx`(+ board 카테고리 조회). 의존: L5의 카테고리 태깅.
- **수용기준:** 병원 페이지와 아파트 페이지의 브리핑 목록이 서로 다르고 각 페이지 주제와 일치.

### L5 — board 코퍼스 확대 + 주제 태깅 [중장기 핵심 · 별도 플랜3와 협조]
- **문제:** board 20건(0.006%) — 오리지널 앵커가 사실상 없음. L4가 링크할 재고도 부족.
- **본 spec의 범위(통합 계약):** (a) board 카테고리 분류가 POI 타입(의료·부동산·청약·금융)과 매핑되도록 **택소노미 정렬**, (b) L4가 소비할 **카테고리별 최소 재고 임계치** 정의. **생성량·주기 확대(주1회→상향)와 파이프라인 구현은 기존 board 플랜3 소관** — 여기서는 인터페이스만 고정.
- **파일:** `lib/board/generate.ts`, `.github/workflows/generate-board-posts.yml`(주기, 플랜3), 카테고리 상수.
- **수용기준:** 각 POI 카테고리에 매칭 가능한 board 글이 임계치 이상 존재. (목표 수치는 plan에서 확정)

### L6 — (선택) 구글전용 robots + 광고 밀도 [운영]
- **접근:** ayo식 — `User-agent` 분기로 Googlebot·Mediapartners-Google 허용, Ahrefs·Semrush·AI 스크래퍼·비핵심 봇 차단. **크롤 예산 절약 + Supabase 디스크 IO 병목 동시 완화**(cold ISR 크롤러 부하). AdSense 슬롯 1→적정 밀도(승인 후).
- **파일:** `app/robots.ts`, 광고 컴포넌트.
- **수용기준:** robots가 Google·Mediapartners 무제한, 지정 봇 차단. (광고 밀도는 승인 후 단계)

## 4. 단계 (ROI 순)

- **Phase A — 즉효·코드만 (최대 볼륨, 콘텐츠 생산 불필요):** L1 · L2 · L4
  → 병원 25% SSR 복구 + villa 35% 폴백 + 전체 브리핑 맥락화. 색인 80%+ 를 코드로 개선.
- **Phase B — 콘텐츠 신호:** L3 · L5
  → FAQ/FAQPage 구조화 신호 + board 확대(오리지널 앵커). 진짜 "데이터 풍부 콘텐츠" 레버.
- **Phase C — 선택·운영:** L6
  → robots 구글전용(IO 병목까지) + 광고 밀도.

## 5. 범위 밖 (YAGNI)

- blanket noindex(이미 #162에서 되돌림, 승자 증거상 오답) · 광고 슬롯 과다 삽입(승인 전 역효과) · 전면 디자인 개편 · 신규 데이터소스 추가 · board 생성 파이프라인 재작성(플랜3 소관).

## 6. 리스크 & 완화

| 리스크 | 완화 |
|---|---|
| 템플릿 FAQ가 또 다른 thin/near-duplicate로 인식 | 카테고리별로 Q&A를 차별화 + 페이지 데이터로 동적 치환. 무의미 FAQ 금지(L3 수용기준). |
| L2 폴백 문단이 전 villa에서 동일문구(근접중복) | `lib/seo/blurb.ts`가 지역·단지 데이터로 변주(기존 propertyBlurb 패턴 활용). |
| L4가 L5 재고에 의존 | Phase A에서는 카테고리 매칭+최신 폴백으로 동작, L5 확대 시 품질 상승(점진적). |
| 병원 탭 SSR 전환이 인터랙션 회귀 | 콘텐츠는 항상 DOM, 가시성만 토글 → 동작 동일. 회귀 테스트로 확인. |

## 7. 검증 계획

- **봇 가독성:** 대표 페이지(병원·villa·약국)를 JS 미실행 fetch → 핵심 콘텐츠·FAQ가 HTML에 존재.
- **구조화:** FAQPage/Place/Breadcrumb JSON-LD 파싱 검증(기존 sitemap/seo 테스트 옆에 추가).
- **맥락성:** 카테고리별 브리핑 목록 차이 스냅샷.
- **재심사:** 변경 배포 + 사이트맵 재제출 후 AdSense 재심사.

## 8. 미결 결정 (plan에서 확정)

1. L5 board 목표 수치/주기 (플랜3와 합의).
2. L2 폴백에서 noindex로 보낼 "잔여" 정의(좌표 부재 외 추가 조건?).
3. L6 채택 시점(애드센스 승인 전/후) 및 광고 밀도 목표.
