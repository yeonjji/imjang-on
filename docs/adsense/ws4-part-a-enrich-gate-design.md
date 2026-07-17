# WS4 Part A — enrich-not-hide 색인 품질 게이트 설계 (A1 FAQ 전면 중심)

> 작성: 2026-07-17 · 상태: 설계 승인됨, 구현 plan 작성 대기
> 상위 전략: [`thin-content-remediation-design.md`](./thin-content-remediation-design.md)(레버 L1~L7) · 진단: [`thin-content-diagnosis.md`](./thin-content-diagnosis.md)
> 근거: 2026-07-17 코드베이스 정찰(가이드 코퍼스·얇은 템플릿·enrich 배선·색인 규모) + 운영 DB 라이브 사이징

## 0. 배경 · 이 문서의 위치

AdSense가 "낮은 가치 콘텐츠(low value content)"로 거절. 검증 결과 **진짜 레버는 이미지가 아니라 원본 텍스트 분량 + 신뢰표기 + enrich-not-hide 색인**이다(구글 공식 정책 + 통과 경쟁사 ilsangkit·ayo 실측). 데이터 정확성 워크스트림(A, "70%")은 실측 결과 대부분 non-defect였고 유일 실결함(finance 데이터 기준일)은 수정 완료(commit `26b9b90`).

WS4는 무게중심 워크스트림으로 두 서브프로젝트다:
- **Part A — enrich 색인 품질 게이트(본 문서, 20%)**: 색인되는 상세페이지가 "라벨-값뿐"으로 나가지 않도록 하는 템플릿 무관 품질 바.
- **Part B — 핵심 가이드 5~9편 실데이터 이식(별도 spec, 10%)**: 원본 콘텐츠 앵커 심화.

### 라이브 사이징 (2026-07-17 운영 실측)

| 지표 | 값 |
|---|---|
| /guide 코퍼스 | **21편 전부 PUBLISHED**(7카테고리 × 3), 단 본문은 전부 제네릭(자체 데이터 0) |
| board | 38편 PUBLISHED |
| 색인대상 footprint(사이트맵) | 병원 79,562 · 빌라(다세대 63,322 + 연립 9,943)≈73k · 아파트 35,722 · 어린이집 25,102 · 학교 12,322 · 오피스텔 8,581 · 청약 5,842 · 대출 318 · 전세보증 47 |
| #233이 사이트맵에서 제외한 비-매매 매물 | 51,895 |

## 1. 설계 원칙

1. **enrich-not-hide.** 대량 noindex 금지(#162 교훈, 승자 증거상 오답). noindex는 이미 페이지단에서 정해진 것을 사이트맵에 반영하는 수준까지만(신규 콘텐츠 숨기기 아님).
2. **FAQ는 반드시 페이지 데이터 동적 치환.** 정적 카테고리 Q&A를 수만 페이지에 복붙 = near-duplicate "filler" = **역효과**(2025 품질평가자 가이드 명시). 설계문서 리스크 표와 일치.
3. **불변식으로 near-duplicate 리스크 해소:** 색인되는 상세 = 서사 게이트(`narrative.fired ≥ 3`) 통과 = **데이터 보유** → 그 데이터를 FAQ에 치환하면 색인 페이지마다 FAQ가 자동으로 고유·실데이터·출처표기. finance/jeonse는 서사 게이트가 없지만 항상 상품 데이터 보유 → 동일 성립.
4. **모든 수치 출처표기**(사이트 원칙). 데이터 없으면 치환 Q&A를 생략(수치 지어내기 금지).

## 2. A1 — FAQ 전면 (핵심)

### 2.1 현재 상태 / 문제

- `<Faq category>`(`app/(public)/_components/faq.tsx`)는 `lib/faq/data.ts`의 **정적 카테고리 Q&A**(문자열 `{q,a,source}`)만 렌더. `faqSchema()`로 FAQPage JSON-LD 방출.
- **상세페이지 전무.** `<Faq>`는 허브/목록 10곳 + `/faq`에만 배선. `apt/[id]`·`hospital/[id]`·`finance/[seq]` 등 어떤 상세도 FAQ·FAQPage 없음. → 설계문서 레버 **L3** 미이행.
- FAQ 뱅크는 12카테고리·~44항목·출처표기 보유(재사용 준비됨).

### 2.2 아키텍처 (최소·격리)

1. **`Faq` 컴포넌트에 `items` 경로 추가.** `FaqList`는 이미 `items: FaqItem[]`를 받는다. `Faq`가 `category`(기존, 정적) **또는** 명시적 `items`(신규, 페이지 빌드)를 받아 아코디언 + `faqSchema(items)`를 렌더하도록 소폭 확장. 허브의 기존 사용(`<Faq category>`)은 무변.
2. **템플릿별 FAQ 빌더** `lib/faq/build/<template>.ts` — `buildXFaq(data) => FaqItem[]`. 상단 **2~3개는 페이지 데이터 치환**(출처 라벨 부착) + 기존 카테고리 generic 1~2개로 폭 보강. 순수 함수(테스트 용이).
3. **배선.** 각 상세 템플릿의 일관 슬롯(관련 섹션 근처)에 `<Faq items={buildXFaq(...)} />`.
4. **가드레일(빌더 공통 규칙):**
   - 상세 FAQ는 페이지-치환 Q&A **≥ 2개**(고유성 보장).
   - 수치·고유값은 **데이터가 존재할 때만** 치환. 없으면 그 Q&A 생략(지어내기 금지).
   - 수치를 담은 Q&A는 **출처 라벨 필수**.
   - 치환 Q&A가 2개 미만이면 그 페이지는 FAQ 블록 생략(정적 복붙으로 채우지 않음).

### 2.3 템플릿별 빌더 (색인·데이터 보유 9종)

| 템플릿 | 페이지 데이터(치환 소스) | 동적 Q&A 예시 | 출처 |
|---|---|---|---|
| `apt` / `villa` / `officetel` | 단지명·지역·전용면적·최근 실거래(매매/전세)·전세가율·거래건수(insights/transaction) | "○○의 최근 실거래가는?" → 가장 최근 신고 거래(YYYY.MM, 전용 N㎡, X억) · "○○ 전세가율은?" | 국토교통부 실거래가 공개시스템 |
| `hospital` | 병원명·진료과·진료시간·응급실·주차 | "○○의 진료시간·응급실 운영은?" · "○○의 진료과는?" | 건강보험심사평가원 |
| `school` | 학교명·유형·지역·설립 | "○○은 어떤 학교인가요?(유형·지역)" | 교육부·학교알리미 |
| `childcare` | 시설명·유형·정원/현원·대기 | "○○의 정원·현원은?" · "○○ 유형(국공립/민간/가정)은?" | 보건복지부 |
| `subscription` | 단지명·지역·세대수·접수일정·상태 | "○○ 청약 접수 일정은?" · "○○ 공급 세대수는?" | 한국부동산원 청약홈 |
| `finance` | 상품명·대출한도·금리·데이터 기준일 | "○○의 대출한도·금리는?(상한 안내)" | 서민금융진흥원 |
| `jeonse-guarantee` | 상품명·최대한도·한도비율·보증료율·기준일 | "○○의 최대 보증한도·예상 보증료율은?" | 한국주택금융공사(HF) |

각 빌더는 위 동적 2~3개 + `FAQ[category]`의 generic 1~2개(중복 배제)로 최종 `FaqItem[]` 구성.

### 2.4 배치 · 스키마

- 슬롯: 각 상세 본문 하단(관련 가이드/브리핑 근처)에 일관 배치. 정확 위치는 구현 시 템플릿별 확정(급소 아님).
- FAQPage JSON-LD는 `Faq`가 `faqSchema(items)`로 방출(이미 존재).

### 2.5 수용 기준

- 색인되는 9종 상세페이지 각각에 **가시 FAQ 아코디언 + FAQPage JSON-LD**가 SSR 렌더된다(JS 미실행 fetch로 확인).
- 같은 카테고리라도 **페이지마다 FAQ 값이 다르다**(치환 Q&A ≥ 2개, 실데이터·출처표기).
- 구글 리치결과 검사(FAQ) 통과.
- 데이터 부족 페이지는 우아한 폴백(치환 Q&A < 2 → FAQ 생략). 단 색인 페이지는 게이트상 데이터 보유가 보장됨.
- 각 빌더 단위 테스트(치환·폴백·출처) + `pnpm typecheck && pnpm lint` green.

## 3. A2 — POI 사이트맵 ↔ 페이지 noindex 동기화

- **문제:** 병원·학교·어린이집 사이트맵 소스(`lib/sitemap/sources.ts`)는 **전 행 방출**(병원 79,562 + 학교 12,322 + 어린이집 25,102 ≈ 117k)하지만 페이지는 `narrative.fired < 3`이면 noindex. → 방출 ~117k 중 **서사 미발화분**이 사이트맵에 광고되어 GSC "제출됐으나 noindex" 낭비를 만든다(정확한 규모는 서사 pass-rate에 달려 있어 GSC/크롤로 측정). 매물·청약은 이미 게이트 동기화됨.
- **접근:** 병원·학교·어린이집 사이트맵 소스를 페이지 색인 조건과 동기화(매물·청약 패턴 이식).
- **성격:** 이미 페이지단에서 noindex인 것을 사이트맵에 반영하는 진실 반영 → enrich-not-hide 위배 아님(신규 콘텐츠 숨기기 아님).
- **범위 밖:** FAQ는 서사 게이트에 영향 없음 → 얇은 POI를 색인시키려는 **색인 게이트 완화 여부는 별도 결정**(§10).
- **선확인:** 정찰은 childcare 사이트맵이 무필터라 `/childcare/null/[id]` 방출 가능성을 제기했으나, 라이브 카운트에서 `Childcare.sigunguCode`에 `null` 필터가 오류 → **컬럼이 non-nullable일 개연**. 스키마 확인 후 실제 null 방출이 있을 때만 필터 추가(없으면 무작업).
- **수용 기준:** 세 POI의 사이트맵 방출 수 ≈ 실제 색인 수(GSC로 확인). childcare null 방출은 스키마 확인 결과에 따름.

## 4. A3 — 최얇은 표면 (경량)

- `amenity/[category]/[id]`: JSON-LD 전무 → Place/LocalBusiness 스키마 추가 + 경량 동적 FAQ(시설명·분류·지역 치환). 소량(사이트맵 ~994).
- `finance/[seq]` · `jeonse-guarantee/[grntDvcd]`: breadcrumb-only → `FinancialProduct`/`LoanOrCredit`(+ 필요 시 `Offer`) 스키마 추가. FAQ는 A1에서 처리.
- `urban`: `lib/guide/page-category.ts`에 `urban → LIFE` 키 추가 → 충전소·주차 상세에 RelatedGuides 점등(현재 매핑 없음).
- **수용 기준:** amenity 상세에 유효 JSON-LD `@type` 존재, finance/jeonse에 FinancialProduct 계열 `@type` 존재, urban 상세에 RelatedGuides 렌더.

## 5. A4 — 빌라 L2 재결정

- 정찰 발견: `lib/seo/blurb.ts`의 `propertyBlurb()`는 **죽은 코드**(0 usages, insights 서사로 대체). 따라서 설계문서 L2의 "빌라 이미 적정(폴백 산문 항상 렌더)" 결론은 **무효**.
- 단 사이트맵은 이미 비-매매 매물 제외(#233) → 영향 축소. 남은 케이스는 **매매 이력은 있으나 `narrative.fired < 3`으로 noindex + 산문 없음**인 잔여.
- **접근:** 그 잔여 규모를 측정(GSC 또는 서사 평가 스크립트) 후 ① 저-데이터 폴백 산문 추가 or ② noindex 수용을 명시 결정. 측정 전 구현 보류.
- **수용 기준:** 잔여 규모 측정 + 폴백/noindex 결정 문서화.

## 6. 단계 (ROI 순)

- **A1a(파일럿):** `Faq` items 확장 + 빌더 인프라 + **데이터 풍부 3종(apt · hospital · subscription)** → 배포 후 raw HTML·리치결과 검증.
- **A1b:** 나머지 6종(villa · officetel · school · childcare · finance · jeonse).
- **A2:** POI 사이트맵 동기화 + childcare 필터.
- **A3:** 얇은 표면(amenity 스키마·FAQ, finance/jeonse FinancialProduct, urban→LIFE).
- **A4:** 빌라 잔여 측정 → 결정.

## 7. 범위 밖 (YAGNI)

- 대량 noindex(#162에서 되돌림) · 색인 게이트(`narrative.fired`) 완화(별도 결정) · Part B(가이드 실데이터) · **A5 BoardBriefing 맥락화(L4) + board 카테고리 태깅(L5)**(pass-critical 아님, 예산 남으면) · amenity/urban 대규모 작업 · pharmacy(이미 noindex·사이트맵 0, contained) · 광고 밀도.

## 8. 리스크 · 완화

| 리스크 | 완화 |
|---|---|
| FAQ가 또 다른 near-duplicate/filler로 인식 | 페이지-치환 Q&A ≥ 2 강제 · 색인=데이터보유 불변식 · 치환 부족 시 FAQ 생략(정적 복붙 금지) |
| 치환 값이 없어 빈 Q&A/오류 | 데이터 존재 시에만 치환, 없으면 해당 Q&A 생략(빌더 순수함수 + 단위테스트) |
| 무의미/저품질 Q&A | 실사용 질문 + 실데이터 + 출처. generic 보강은 카테고리 차별화된 기존 뱅크만 |
| A2 동기화가 색인 축소로 오해 | 이미 페이지 noindex인 URL만 사이트맵에서 제거(진실 반영). 신규 콘텐츠 아님 |
| 슬롯 배치가 기존 레이아웃 회귀 | 관련 섹션 근처 일관 배치, 템플릿별 시각 확인 |

## 9. 검증 계획

- **봇 가독성:** 임의 9종 상세를 JS 미실행 fetch → FAQ 텍스트 + FAQPage `@type`가 raw HTML에 존재.
- **고유성:** 같은 카테고리 두 페이지의 FAQ가 서로 다름(치환 값 상이).
- **리치결과:** 구글 리치결과 검사 FAQ 통과(샘플).
- **정적 게이트:** 빌더 단위테스트 + `pnpm typecheck && pnpm lint`.
- **운영 반영:** 배포 → GSC 사이트맵/커버리지 재확인(A2 효과). ※ 운영 사이트에 요청 버스트 금지(Vercel 챌린지).

## 10. 미결 결정 (plan/구현에서 확정)

1. **A2 색인 게이트 완화 시점·여부** — FAQ+라벨값만으로 얇은 POI를 색인시킬지(현 `narrative.fired ≥ 3` 유지 vs 완화). 본 spec은 동기화만, 완화는 별도.
2. **A4 빌라 잔여 폴백 방식** — 저-데이터 폴백 산문 vs noindex 수용(측정 후).
3. **FAQ 슬롯 정확 위치** — 템플릿별 구현 시 확정.
4. **A3 스키마 세부** — finance/jeonse의 `FinancialProduct` vs `LoanOrCredit` vs `Offer` 조합.
