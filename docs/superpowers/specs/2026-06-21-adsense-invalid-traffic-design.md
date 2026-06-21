# 임장ON 무효 트래픽 방어 설계 (AdSense 게시자 관점)

- **작성일:** 2026-06-21
- **상태:** 승인됨 (Approach A — 모니터링·정책 중심)
- **관련 영역:** Analytics(GA4), AdSense 정책 준수, `subscribe-soon` 폼 보호

## 1. 배경 (Context)

운영자는 imjang-on 사이트에 **Google AdSense**(게시자/publisher) 승인을 요청한 상태이며,
무효 트래픽(invalid traffic)으로 인한 **승인 거절 또는 승인 후 계정 정지**를 사전에 방지하고자 한다.
아울러 트래픽 품질 분석을 위해 **Google Analytics(GA4) 연동**이 가능한지 확인을 요청했다.

### 1.1 Google Ads vs AdSense (중요 구분)

최초 공유된 문서(`support.google.com/google-ads/answer/11182074`)는 **광고주(Google Ads)**용
무효 클릭 정책이다. 그러나 운영자의 실제 상황은 **게시자(AdSense)**이므로 리스크의 성격이 다르다.

| | Google **Ads** (광고주) | Google **AdSense** (게시자) ← 본 설계 |
|---|---|---|
| 입장 | 돈 내고 광고를 구매 | 사이트에 광고를 게재해 수익 |
| 무효 트래픽 피해 | 광고 예산 낭비 | **계정 정지/밴 + 수익 차감** |

### 1.2 핵심 통찰

Google 게시자 정책 문서를 종합하면, **무효 트래픽 봇 필터링은 Google이 자동으로 수행**한다.
AdSense 계정이 정지되는 실제 원인은 대부분 **게시자가 통제 가능한 자기유발 요인**이다:

1. 자기 광고 클릭(관심·URL 확인 목적 포함 금지)
2. 클릭 유도(지인/방문자에게 클릭 요청)
3. 기만적 광고 배치(광고를 메뉴·버튼·다운로드로 착각하게 배치)
4. 콘텐츠 대비 광고 과다
5. 구매·교환·인센티브 트래픽 유입
6. 성실한 모니터링 부재

→ 따라서 ROI가 가장 높은 방어는 **봇 차단 코드가 아니라** ① GA4 모니터링, ② 정책 준수 광고
배치, ③ 운영 규칙(런북) 준수다. 사이트 봇 하드닝은 가벼운 1차 방어선으로 충분하다.

> **단, Google 자동 필터링은 게시자 면책이 아니다.** 자동 필터링은 청구/수익 차감 단계의 보호이며,
> 게시자는 여전히 트래픽 출처·파트너 관리 책임을 진다(answer/1112983). 자동 필터링을 과신하지 말 것.

### 1.3 현재 코드베이스 상태 (확인 완료)

- **GA4 배선 거의 완료:** `app/layout.tsx:51`가 `process.env.NEXT_PUBLIC_GA_ID`가 있으면
  `@next/third-parties/google`의 `<GoogleAnalytics gaId=... />`를 렌더한다(미설정 시 안전하게 비활성).
  `@vercel/analytics`·`@vercel/speed-insights`도 설치됨. `.env.example:26`에 `NEXT_PUBLIC_GA_ID=""`
  플레이스홀더가 있으나 **`.env.local`에는 키 자체가 아직 없다** → 로컬/Vercel에 키를 **추가**하면 작동한다.
- **AdSense 로더가 이미 라이브:** `app/layout.tsx:40-44` head에 AdSense 로더 스크립트
  (`adsbygoogle.js?client=ca-pub-7716793757405086`)가 하드코딩되어 **모든 페이지에 로드**된다(크롤러 인증용).
  단, 실제 광고 단위(`<ins class="adsbygoogle">`)는 아직 사이트에 없다. 즉 "로더는 라이브, 광고 슬롯은 미배치" 상태.
- **유일한 폼(전환 지점):** `subscribe-soon`(출시 알림 이메일 신청).
  - 클라이언트: `app/(public)/_components/soon-modal.tsx`
  - 서버: `app/api/subscribe-soon/route.ts` — zod 검증만 있고 **레이트리밋·허니팟·봇체크 없음**.
  - 모델: `EmailSignup`(`prisma/schema.prisma:202-209`) — `id`(BigInt PK), `email`(unique), `topic`, `createdAt`, `@@index([topic])`. **IP/UA 필드 없음.**
- **contact 페이지는 폼이 아님** — `mailto:` 안내 페이지.
- **공개 GET API:** `/api/search`, `/api/list`, `/api/regions`, `/api/subway/search`, `/api/staticmap` — 레이트리밋 없음.
- **기반 파일:** `app/robots.ts`, `app/sitemap.xml/route.ts`, `middleware.ts` 존재. 기존 레이트리밋/허니팟 유틸은 없음.
  `app/robots.ts`는 **이미 `/api/`·`/list`·`/admin`을 disallow** 중(추가 작업 불필요).
- **승인용 법적 페이지 존재:** `/privacy`, `/terms`, `/contact`.

## 2. 목표 / 비목표

### 목표
- AdSense 승인 통과 가능성을 높이고, 승인 후 무효 트래픽으로 인한 정지 리스크를 최소화한다.
- GA4를 연동하고 트래픽 품질을 "성실히 모니터링"할 수 있는 체계를 만든다(게시자 의무 충족).
- `subscribe-soon` 폼에 최소한의 봇 위생(허니팟)을 추가한다.

### 비목표 (Out of Scope)
- 본격 봇 하드닝(레이트리밋·미들웨어 봇 차단) — Approach B, 후속.
- 실제 광고 단위 컴포넌트(`<AdSlot>`) 구현 — AdSense 승인 후 별도 작업.
- Google Ads(광고주) 캠페인/전환 추적 — 운영자는 현재 광고주가 아님.

## 3. 성공 기준 (자동 + 운영 검증)

성공 기준을 **자동 검증(코드 테스트)**과 **운영 검증(사용자 수동, 런북 체크리스트)**으로 분리한다.

### A. 자동 검증 (코드 테스트로 확인)

1. `subscribe-soon` 허니팟 동작 — `app/api/subscribe-soon/route.ts`에 대한 테스트:
   - (a) 허니팟 키(`company`) **부재** → 정상 저장(`EmailSignup` upsert).
   - (b) 허니팟 `company` **빈 문자열** → 정상 저장.
   - (c) 허니팟 `company`가 **공백 trim 후 non-empty** → 저장 안 함, `{ ok: true }` 응답(봇에 단서 미제공).
   - (d) `email`/`topic` zod 검증 실패는 기존대로 400.

### B. 운영 검증 (사용자가 수동 수행 — 런북 체크리스트로 확인)

2. 운영 배포에서 GA4 실시간 보고서에 페이지뷰가 수집된다.
3. AdSense 콘솔에서 GA4 속성 링크가 완료된다.
4. `docs/adsense/`에 문서 3종이 존재하고, `operations-runbook.md`의 승인 전 체크리스트
   각 항목이 현재 사이트 상태(콘텐츠 충분, `/privacy`·`/terms`·`/contact` 존재 등)에 대해 **PASS로 표시**되어 있다.

## 4. 상세 설계

### 4.1 GA4 분석 연동 (코드 변경 없음 + 운영)

- **코드:** 추가 변경 없음 — `app/layout.tsx`의 조건부 렌더가 이미 존재.
- **운영(런북에 단계화):**
  1. GA4 속성 생성 → Measurement ID(`G-…`) 발급.
  2. Vercel 환경변수 + 로컬 `.env.local`에 `NEXT_PUBLIC_GA_ID` 설정(키가 없으면 **신규 추가**, 있으면 값 채움) → 배포.
  3. GA4 실시간 보고서로 수집 검증.
  4. GA4 데이터 설정: "봇 트래픽 제외"(기본 on) 확인 + **내부 IP 필터**로 운영자 자기 방문 제외
     (자기 트래픽이 무효 신호를 오염시키지 않도록).
  5. AdSense 콘솔에서 GA4 속성 링크 → 페이지별 수익·노출·유입 출처 교차 분석.
- **한계(런북에 명시):** GA4 "봇 제외"는 IAB 목록 기반으로 **자기식별 UA를 가진 알려진 봇만** 거른다.
  정상 브라우저 UA를 위장한 봇·레지덴셜 프록시 트래픽은 통과하므로, GA4 단독이 아니라
  **AdSense 무효활동 보고서와 교차 확인**해야 한다.

### 4.2 무효 트래픽 모니터링 플레이북

- **산출물:** `docs/adsense/invalid-traffic-monitoring.md`
- **내용:**
  - 의심 신호: 특정 페이지/시간대 트래픽 급증, 비정상 지역 유입, 스팸·트래픽교환 referral,
    비정상적으로 짧은 체류 + 이상 클릭률, direct 트래픽 폭증.
  - 도구: GA4 탐색(세그먼트: 지역·소스/매체·기기) + AdSense URL/맞춤 채널 보고서.
  - 점검 주기: 승인 직후 매일 → 안정화 후 주 1회. 이상 발견 시 §4.5 대응 절차로 연결.

### 4.3 광고 배치 정책 가이드

- **산출물:** `docs/adsense/ad-placement-policy.md`
- **방침:** AdSense 로더는 이미 head에 라이브이나 **광고 단위(`<ins class="adsbygoogle">`) 컴포넌트가 아직 없으므로**,
  지금은 컴포넌트를 만들지 않고(YAGNI) 향후 삽입 시 준수할 규칙만 문서화한다.
- **규칙:**
  - 광고를 메뉴/네비/버튼/다운로드 링크처럼 착각하게 배치 금지 — 기만적 배치는 **계정 해지로 이어질 수 있는 심각한 위반**(answer/48182, answer/2660562).
  - "광고/Sponsored" 명확 라벨 + 콘텐츠와 충분한 간격, 모바일 우발적 터치 방지.
  - **콘텐츠가 거의 없거나 없는 페이지·빈 페이지에 광고 게재 금지**(answer/48182). *(정량 비율 규칙이 아니라 '실질 콘텐츠 존재' 요건)*
  - 클릭 유도 문구·IFRAME 은닉 금지.
  - (승인 후 별도 작업) 이 가이드를 강제하는 재사용 `<AdSlot>` 컴포넌트 1개로 표준화.

### 4.4 사이트 1차 방어선 (가벼운 코드)

- **`subscribe-soon` 허니팟 — 필드명 `company`로 확정. 클라이언트↔서버 계약:**
  - **서버 `route.ts`:** `Body` zod 스키마에 `company: z.string().optional()` 추가.
    `parsed.data.company`를 **trim 후 non-empty면 저장 스킵 + `{ ok: true }` 반환**(봇에 차단 단서 미제공).
    빈 문자열·키 부재는 정상 처리. (`emailSignup.upsert`는 그대로, **DB 스키마 변경 없음**.)
  - **클라이언트 `soon-modal.tsx`:** 시각/스크린리더 양쪽에서 숨긴 `company` 입력을 추가하고
    **state로 관리**한다. 현재 submit 핸들러가 바디를 명시 객체로 직렬화(`JSON.stringify({ email, topic })`)하므로,
    **바디에 `company`를 명시적으로 포함**해야 서버가 수신한다(숨김 input만 추가하면 전송 안 됨 — 무력화 주의).
    실제 사용자는 비워 두고(빈 문자열 전송), 봇은 자동 채움.
  - **외부 의존성 없음.**
- **robots:** `app/robots.ts`는 이미 `/api/`·`/list`·`/admin`을 disallow 중 → **확인만, 코드 변경 없음.**
- **주의:** 이 폼 방어는 `EmailSignup` 위생용이며 AdSense 지표와 직접 관련은 없다. 본격 레이트리밋/미들웨어는 비목표.

### 4.5 운영 런북

- **산출물:** `docs/adsense/operations-runbook.md`
- **내용:**
  - 승인 전 체크리스트: 오리지널 콘텐츠 충분, `/privacy`·`/terms`·`/contact` 존재(확인됨), 네비게이션 명확.
  - 절대 금지: 자기 광고 클릭(테스트 포함), 지인 클릭 요청, 구매·교환·인센티브 트래픽.
  - 신고 절차: 제3자 무효활동 발견 시 Google 신고 채널.
  - 정지/경고 대응: 무효활동 보고서 확인 → 원인 격리 → 이의신청.

## 5. 산출물 요약

| 유형 | 항목 |
|---|---|
| 코드 | `soon-modal.tsx` + `app/api/subscribe-soon/route.ts` 허니팟 (작음) |
| 환경변수 | `NEXT_PUBLIC_GA_ID` (운영자가 설정, 코드는 준비됨) |
| 문서 | `docs/adsense/invalid-traffic-monitoring.md`, `ad-placement-policy.md`, `operations-runbook.md` |
| 운영 작업(사용자) | GA4 속성 생성·ID 설정·AdSense 링크·내부 IP 필터 (런북이 단계 안내) |

## 6. 리스크 / 열린 질문

- **광고주 겸업 시 주의:** 운영자가 추후 Google Ads로 유료 트래픽을 사서 AdSense 게재 페이지로
  보내면 트래픽 아비트라지로 간주될 수 있다. 본 설계는 순수 게시자 가정. 겸업 계획이 생기면 재검토.
- **허니팟 한계:** 정교한 봇은 우회 가능. 본 범위에서는 1차 방어선으로만 채택하며, 필요 시 Approach B로 확장.

## 7. 참고 문서 (Google AdSense 게시자)

- 무효 트래픽 방지 방법: https://support.google.com/adsense/answer/1112983?hl=ko
- 계정 해지로 이어지는 주요 위반: https://support.google.com/adsense/answer/2660562?hl=ko
- 무효 트래픽 정의: https://support.google.com/adsense/answer/16737?hl=ko
- Google의 무효 트래픽 방지: https://support.google.com/adsense/answer/1348752?hl=ko
- 무효 트래픽 FAQ: https://support.google.com/adsense/answer/1348754?hl=ko
- 애드센스 프로그램 정책: https://support.google.com/adsense/answer/48182?hl=ko
