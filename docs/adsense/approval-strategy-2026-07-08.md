# 애드센스 승인 강화 전략 (하이브리드)

> 작성일: 2026-07-08
> 근거: `~/Downloads/imjangon-audit-report-2026-07-08.md`(외부 라이브 감사) ↔ 코드베이스 실상태 전면 대조 + 적대적 크리틱
> 결정: **하이브리드 — 사각지대만 닫고 신청**. 대량 콘텐츠 축적은 대기하지 않음(거절 시 재신청 보강재로 투입).

---

## 0. TL;DR

- 감사 리포트의 긴급도는 **대부분 이미 해소/오판**이다. 3대 P0 중 둘이 무효:
  - **P0-① null 제목 "10만+"** → 실측 **세종 217건 한정**, `#220`으로 해결(커밋 `6e19131`). 규모·근본원인 둘 다 오판(false alarm).
  - **P0-③ 얇은 상세 무차별 색인** → **이미 이중 구현**. 사이트맵은 `txCount12m>0`만 적재(`lib/sitemap/sources.ts:97`), 렌더 타임 `narrative.fired>=3` 미달 시 `robots noindex`(apt/officetel/villa/childcare/hospital/school).
- **진짜 애드센스 블로커는 "내부링크"가 아니라 "Low value content"다.** AdSense 사람 리뷰어는 `noindex`·`Disallow`를 무시하고 **렌더해서 콘텐츠 가치로 판정**한다 → 링크 토폴로지(SEO 레버)와 승인(콘텐츠 레버)은 별개.
- 실제 승패 요인: ① 원본 편집 코퍼스가 얇음(가이드14+board29=**43편, 색인 URL의 ~0.02%**), ② near-duplicate 템플릿 지배(~31.6만면), ③ **무게이트 사각지대 ~31.8k**, ④ 어린 무권위 도메인(~1개월), ⑤ 실제 색인·유입 이력 미확인.
- **하이브리드 실행:** 사각지대(③) 중 실체인 **약국 25.7k**만 닫고 + 값싼 위생작업 + 신청 전 진단(GSC 커버리지) → 1차 신청. ①②의 대량 콘텐츠 축적은 병렬 진행하되 신청을 지연시키지 않는다.

---

## 1. 리포트 ↔ 코드 대조 요약

| 리포트 항목 | 실제 상태 | 판정 |
|---|---|---|
| P0-① `· null` 제목 10만+ | 세종 217건 한정, `#220` 해결 (`lib/region.ts:237` `detailTitleLocality`) | ✅ resolved / 규모·원인 false alarm |
| P0-③ 얇은 상세 noindex 권고 | 사이트맵 `txCount12m>0` 게이트 + 렌더 `narrative.fired>=3` noindex 이미 구현 | ✅ resolved |
| P0-② GSC·네이버 검증 메타 부재 | `layout.tsx:26-31` env 조건부 배선 존재, `.env.local`에 값 미설정 | 🟠 partial (env 주입만) |
| P1-④ `/list` 차단 | `/list` noindex+Disallow 사실. 단 허브 `/apt·/officetel·/villa`는 sitemap page + footer 경유 도달 가능(고아 아님) | 🟠 partial (과장) |
| §2 green 항목(ads.txt·privacy·terms·adsbygoogle·SSR·KOGL provenance·OG·Speed Insights·필수면7) | 코드에서 전부 정확 확인 | ✅ 견고 |

**리포트 52/100 점수는 라이브 관측 과대감점.** 단, 점수 발명은 금물(AdSense는 이진 판정).

---

## 2. 진짜 블로커 판정 (adjudicated)

전략가는 "내부링크(nav→/list, 허브 고아)"를 P0 블로커로 지목했으나 **코드가 반박**한다:

- `nav.tsx:34` 실거래가 → `/list`, `/list`는 `robots noindex`(`list/page.tsx:15`) + robots Disallow — **맞음**.
- 그러나 `/list`는 H1·ListFilterPanel·PropertyList·SourceCaption을 **사람에게 정상 렌더**하는 content-rich 검색면 → "가장 얇은 표면" 아님.
- "허브 고아" 거짓: `footer.tsx:48 → /sitemap → sitemap/page.tsx:18-20`이 세 허브 정적 링크(2-hop 도달) + breadcrumb JSON-LD 계층 신호.
- **결정적:** AdSense 리뷰어는 `noindex`·`Disallow`를 콘텐츠 평가에 반영하지 않는다. nav를 `/apt`로 돌려도 한 번 더 클릭하면 **동일한 31.6만 near-duplicate 템플릿**을 본다. relink는 리프 콘텐츠를 바꾸지 못한다.

> **결론: 단일 최대 블로커 = Low value content.** 공공데이터 파생 near-duplicate 지배 + 얇은 원본 코퍼스(43편) + 어린 도메인 = 전형적 scaled-content / made-for-AdSense 프로필. relink는 값싸고 옳은 **위생 개선**이지 승인 결정 레버가 아니다.

---

## 3. 무게이트 사각지대 표면별 판정 (실측)

무게이트 상시색인 상세 ~31.8k를 표면별로 확인한 결과, 사각지대는 **약국으로 수렴**한다:

| 표면 | 규모 | 고유 콘텐츠 | 판정 | 조치 |
|---|---:|---|---|---|
| **약국** `medical/pharmacy/[…]/[id]` | **25,688** | `PharmacyInfo`(이름·주소·시간)뿐, 지도·근접아파트·지하철·인프라는 전 위치 공통 파생, **산문 0** | 🔴 near-duplicate thin | **게이트 부여 (P0-A)** |
| 청약 `subscription/[id]` | 5,810 | `ScheduleTimeline`(일정) + `UnitSupplyTable`(공급물량) = 공고별 정부 원본 | 🟢 substantive | 유지 |
| 서민금융 `finance/[seq]` | 318 | 자격·한도·금리 구조화 섹션, 상품별 고유 | 🟢 substantive·소량 | 유지 |
| 전세보증 `jeonse-guarantee/[grntDvcd]` | 47 | 한눈에·대상·지역별 한도표 등 rich | 🟢 substantive·소량 | 유지 |

→ 약국 25.7k가 사각지대의 **81%**. 같은 의료 카테고리 **병원은 이미 게이트 보유**(`hospital/[…]/[id]/page.tsx:37-43` `loadHospitalInsight` + `narrative.fired>=3`). 약국에 **동형 패턴**을 적용한다.

---

## 4. 실행 계획

### 🔴 P0-A — 약국 상세 색인 게이트 (사각지대 차단, 핵심)

- **목표:** 고유 데이터가 얇은 약국 상세를 색인에서 제거해 near-duplicate 대량 색인 인상을 지운다. 사람 사용자에겐 계속 렌더(정보 열람 유지), 색인만 배제.
- **방식(확정): 약국 상세 전량 `robots: { index: false, follow: true }`.** 로컬 유틸리티 표면으로 규정 — 렌더는 유지(사용자 열람), 색인만 배제. 근접 아파트 실거래 링크에쿼티는 `follow`로 전달. 구현: `medical/pharmacy/[…]/[id]/page.tsx` generateMetadata에 robots 추가.
  - (반려) 병원 동형 `narrative.fired>=N` 게이트: 약국은 서술 소스가 빈약해 대부분 noindex로 귀결 + 산문 억지 생성은 near-duplicate 가중 → 지양.
- **사이트맵 pharmacy 소스 제거 — 보류(선택):** `lib/sitemap/manifest.ts`가 `SOURCE_ORDER`를 순회하며 **글로벌 순차 샤드 id**를 부여하고, `sources.ts:282`에 "순서 고정·끝에만 추가" 불변식이 명시돼 있다. `pharmacy`(배열 index 5)를 제거하면 downstream(hospital ~79k·loan·post·jeonse·guide) 샤드 id가 전부 밀려 기존 샤드 URL이 재번호된다(페이지 URL은 불변, 샤드 컨테이너만 churn). **`noindex` 메타만으로 색인 배제는 이미 완결**되므로, 사이트맵 제거는 'Submitted URL marked noindex' 경고(무해)를 없애는 위생 목적뿐. AdSense/GSC 제출 직전 대규모 샤드 churn 회피를 위해 **기본 보류**하고, 필요 시 별도 결정으로 진행.
- **영향:** 색인 코퍼스에서 thin near-duplicate ~25.7k 제거(noindex) → 리뷰어 색인 표본의 thin 비중 급감. 사용자 경험 무변화.
- **검증:** 배포 후 약국 상세 raw HTML에 `noindex` 메타 존재 확인. 근접 아파트 링크·본문 렌더는 유지.

### 🔴 P0-B — 신청 전 진단: GSC 실제 색인 커버리지·유입

- 소유확인(P1)만으로 부족. **실제로 크롤·색인되는지**(커버리지 URL 수, '발견됨-색인 안 됨' 적체, 검색 유입 유무)를 확인한다.
- 어린 도메인+대량 풋프린트는 nav 구조와 무관하게 거절될 수 있으므로, 이 진단이 신청 GO/NO-GO 판단의 실질 근거.

### 🟠 P1 — 값싼 위생 (신청 타이밍을 여기 걸지 말 것)

- **소유확인 활성화:** Vercel 프로덕션 env에 `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`·`NEXT_PUBLIC_NAVER_SITE_VERIFICATION` 주입·재배포 → 프로덕션 HTML에서 메타 출력 확인 → GSC·네이버 SA 등록 + `sitemap.xml` 제출.
- **footer 유형링크 정규화:** `footer.tsx:17-20` `/list?type=…` → 정규 허브 `/apt·/officetel·/villa`. (SEO 위생, 승인 레버 아님. nav 헤드텀 `/list`는 content-rich라 필수 아님.)
- **사이트맵↔noindex 정합:** property 소스 `txCount12m>0`(~167k) 중 ~50k가 self-noindex → 'Submitted URL marked noindex' 경고·크롤 예산 낭비. 게이트 통과 집합으로 좁힘(index hygiene).

### 🔵 파킹 — 거절 시 재신청 보강재 (병렬 축적, 신청 대기 안 함)

- **원본 볼륨 확대:** `lib/guide/seeds.ts` 15→25~40, generate→`/admin/guides` 검수→PUBLISHED. Scaled Content Abuse 회피 위해 사람 검수·완만한 발행 유지.
- **near-duplicate 완화:** narrative 4모듈(bScale·tTrend·pPeer·aAccess) 다양화 + 허브 지역 고유 분석으로 "왜 이 사이트인가" 부가가치 실체화.
- **상세 FAQ + FAQPage JSON-LD:** ⚠️ **반드시 페이지 데이터로 동적 치환**(하드 게이트). 공통 보일러플레이트는 near-duplicate 가중 → 잘못하면 thin 악화. 승인 후로 이연 가능.

---

## 5. 재신청 직전 체크리스트

- [ ] P0-A 약국 상세 noindex + 사이트맵 제외 머지·배포, raw HTML로 확인
- [ ] P0-B GSC 색인 커버리지 리포트에서 실제 색인 URL 수·크롤 상태·유입 확인 (GO/NO-GO 근거)
- [ ] 프로덕션 홈 HTML fetch로 `google-site-verification`·`naver-site-verification` 메타 출력 확인
- [ ] GSC·네이버 서치어드바이저 소유확인 + `sitemap.xml` 제출
- [ ] 무작위 무게이트 상세(청약·finance·전세보증) 표본이 고유 콘텐츠를 담는지 확인
- [ ] JS 미실행 curl로 병원(진료·시설·교통 텍스트)·apt '한눈에 보기' 산문이 raw HTML에 존재하는지 회귀 확인
- [ ] ads.txt(pub-7716793757405086)·privacy AdSense 고지·terms 광고조항·adsbygoogle.js 프로덕션 생존 확인
- [ ] (선택 위생) footer 유형링크 정규 허브 전환 배포

---

## 6. 성공 기준

- **1차 목표:** 색인 코퍼스에서 thin near-duplicate 약국 25.7k 제거 + 소유확인·사이트맵 제출 완료 + GSC 커버리지 확인 → AdSense 1차 신청 제출.
- **거절 시:** 거절 사유(십중팔구 Low value content)를 실데이터로 받아, 파킹 트랙(가이드 볼륨·narrative 다양화)을 **정밀 타깃**으로 투입해 재신청.
- 참고 선례(메모리): 경쟁사 `ayo`는 빈페이지로도 통과, `ilsangkit`는 enrich로 통과 — enrich-not-hide 방향과 정합.

---

## 부록: 근거 파일

- 제목 수정: `lib/region.ts:237-244`, `app/(public)/{apt,officetel,villa}/[id]/page.tsx` title, 커밋 `6e19131`(#220)
- 색인 게이트: `lib/sitemap/sources.ts:97`, `lib/insights/apt.ts:85`, 병원 `medical/hospital/[…]/[id]/page.tsx:37-43`
- 내부링크: `app/(public)/_components/nav.tsx:34`, `footer.tsx:17-20,48`, `sitemap/page.tsx:18-20`, `list/page.tsx:15`
- 무게이트 표면: `medical/pharmacy/[…]/[id]/page.tsx`, `subscription/[id]/page.tsx`, `finance/[seq]/page.tsx`, `jeonse-guarantee/[grntDvcd]/page.tsx`
- 검증 메타: `app/layout.tsx:26-31`, `.env.example`
- 승인 후: `docs/adsense/post-approval-checklist.md`
