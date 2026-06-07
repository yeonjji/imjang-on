# 법적 안내 페이지 정비 + 사이트맵 + 애드센스 대응 설계

- 작성일: 2026-06-07
- 상태: 설계 승인 대기(스펙 리뷰)
- 운영자 연락처: `contact@imjang-on.com`
- 시행일(법적 문서): 2026-06-07

## 1. 목적

현재 사이트에 실제로 구현된 기능 범위에 맞춰 안내·법적 페이지를 정비하고, 사용자용/검색엔진용 사이트맵을 완성하며, **Google AdSense 승인 신청에 필요한 요건을 모두 충족**한다. (단, 광고 실제 게재 시점에 필요한 쿠키 동의 배너(CMP)는 이번 범위에서 제외 — 사용자 합의.)

## 2. 현재 상태 (조사 결과)

### 이미 존재
- 콘텐츠 페이지: 홈, `/list`(실거래가 통합 목록), `/apt`·`/officetel`·`/villa`(+상세), `/subscription`(+상세), `/region`(+상세), `/life` 허브 및 4개 그룹(`education`·`medical`·`amenity`·`urban`)과 하위 카테고리(학교·어린이집·병원·약국·편의점·마트·카페·전통시장·주차장·공원·충전소) + 각 상세
- 법적/안내 페이지(내용 부실): `/about`, `/data-source`, `/terms`, `/privacy`
- `app/sitemap.ts` — **이미 존재**. `STATIC_ENTRIES`(홈·매물 허브·life·school·amenity·urban/parking) + DB 기반 동적 엔트리(region/school/amenity/매물 상세) 생성. DB 장애 시 STATIC_ENTRIES로 폴백. `revalidate=86400`.
- `app/robots.ts` — **이미 존재**. `userAgent: '*'` 및 `Yeti`(네이버)에 대해 `allow: ['/', ...]`, `disallow: ['/list', '/api/', '/admin']`, `sitemap: ${SITE}/sitemap.xml`.
- `lib/data-sources.ts` — 데이터 출처 레지스트리(SSOT). `/data-source`가 이를 렌더.
- 디자인 토큰: `var(--color-*)`, 정적 페이지 패턴 `article.mx-auto.max-w-2xl.px-6.py-16`.
- `metadataBase`: `process.env.NEXT_PUBLIC_SITE_URL ?? 'https://imjang-on.com'` (app/layout.tsx).
- 푸터(`app/(public)/_components/footer.tsx`): "법적 안내" 컬럼에 서비스소개·데이터안내·이용약관·개인정보 처리방침 링크 존재.

### 없음 (신규 필요)
- `/contact` 문의 페이지
- `/sitemap` 사용자용 사이트맵 페이지
- `public/ads.txt`

## 3. 애드센스 승인 요건 매핑

| 요건 | 충족 방법 |
|---|---|
| 개인정보 처리방침(광고 쿠키·맞춤광고·옵트아웃 고지 포함) | `/privacy` 정식 재작성 + AdSense/GA 쿠키 조항 |
| 운영자/사이트 소개 | `/about` 재작성 |
| 문의(연락처) | `/contact` 신규 |
| 이용약관 | `/terms` 정식 재작성 |
| 충분한 콘텐츠·명확한 내비게이션 | 기존 충족 + `/sitemap` 추가로 강화 |
| 크롤링 가능(robots/sitemap) | 기존 robots/sitemap 활용 + 신규 라우트 추가 |
| ads.txt(셀러 인증) | `public/ads.txt` placeholder(게시자 ID 발급 후 채움) |
| 쿠키 동의 배너(CMP) | **이번 범위 제외** (광고 게재 시점 별도 작업) |

## 4. 작업 범위

### 4.1 재작성 페이지

#### `/about` 서비스 소개 (재작성)
- 임장온 정의: 국토교통부 실거래가, 한국부동산원 청약홈/LH, 건강보험심사평가원, 교육부, 보건복지부, 행정안전부, 국가철도공단 등 공공데이터를 가공·통합 제공하는 **비상업 정보 플랫폼**.
- 제공 기능(현재 실제 구현 기준): 아파트·오피스텔·연립다세대 실거래가, 청약 일정, 생활 인프라(학교·어린이집·병원·약국·편의점·마트·카페·전통시장·공원·주차장·충전소), 지하철 역세권, 지역별 시세.
- 운영 형태: 개인(비사업자) 운영. 문의 `contact@imjang-on.com`.
- 면책 1줄 + `/data-source`, `/terms`, `/privacy`, `/contact` 링크.
- "Phase 1/2" 등 구식 표현 제거.

#### `/terms` 이용약관 (정식 재작성)
조항 구조:
1. 제1조(목적)
2. 제2조(정의) — "서비스", "이용자", "콘텐츠"
3. 제3조(서비스의 내용) — 공공데이터 가공 정보 제공, **회원가입·결제·중개 행위 없음** 명시
4. 제4조(정보의 정확성 및 면책) — 실거래 신고 지연(통상 30일 이내) 등으로 최신성·정확성 미보장, 거래 의사결정 결과에 책임 없음, 원 출처 확인 권고
5. 제5조(지식재산권 및 출처표시) — 공공누리 제1유형 준수, 원저작권은 각 제공기관
6. 제6조(광고의 게재) — 제3자(Google AdSense 등) 광고 게재 가능, 광고주 거래 책임은 이용자와 광고주 간
7. 제7조(약관의 변경) — 변경 시 본 페이지 게시로 효력
8. 제8조(준거법 및 관할) — 대한민국 법, 운영자 주소지 관할
- 부칙: 시행일 2026-06-07.
- 문의 `contact@imjang-on.com`.

#### `/privacy` 개인정보 처리방침 (정식 재작성 — AdSense 핵심)
개인정보보호법 표준 양식:
1. 수집하는 개인정보 항목 — 출시/청약 알림 신청 시 **이메일 주소**. 자동수집: 쿠키, 접속 IP, 브라우저/기기 정보(분석·광고 목적).
2. 수집·이용 목적 — 알림 발송, 서비스 이용 통계, 광고 게재.
3. 보유·이용 기간 — 알림 목적 달성/철회 시까지, 관련 법령상 보존의무 시 해당 기간.
4. 제3자 제공 / 처리위탁 — Google LLC(Google Analytics, Google AdSense), Vercel Inc.(Analytics/호스팅).
5. **쿠키 및 광고(AdSense) 고지** (필수):
   - 제3자(Google 포함)가 쿠키·웹비콘으로 사용자 방문 정보를 수집해 광고를 게재할 수 있음.
   - Google은 광고 쿠키로 이 사이트 및 다른 사이트 방문 기록 기반 맞춤형 광고를 제공함.
   - 이용자는 `https://www.google.com/settings/ads` 에서 맞춤형 광고를 비활성화할 수 있음.
   - 제3자 광고 쿠키 안내: `https://www.google.com/policies/technologies/ads/`.
   - 브라우저 설정으로 쿠키 거부 가능(일부 기능 제한 가능).
6. 정보주체의 권리 — 열람·정정·삭제·처리정지 요구 가능, `contact@imjang-on.com`.
7. 개인정보 보호책임자 — 임장온 운영자, `contact@imjang-on.com`.
8. 고지 의무 — 변경 시 본 페이지 게시.
- 시행일 2026-06-07.

#### `/data-source` 데이터 안내 (유지)
- 기능 변경 없음(레지스트리 기반 유지). 필요 시 도입부 카피만 소폭 정리. **구조·로직 변경 없음.**

### 4.2 신규 페이지

#### `/contact` 문의 (신규)
- 위치: `app/(public)/contact/page.tsx`. 서버 컴포넌트, 정적.
- 내용: 이메일 `contact@imjang-on.com` 안내, 데이터 정정/삭제 요청 안내, 응답 안내 1줄.
- **폼/백엔드 없음** (단순성). mailto 링크 사용.
- `metadata`: title '문의', canonical '/contact'.

#### `/sitemap` 사용자용 사이트맵 (신규)
- 위치: `app/(public)/sitemap/page.tsx`. 서버 컴포넌트, 정적.
- 내용: 전체 메뉴 트리를 섹션별로 사람이 보는 링크 목록.
  - 실거래가: 홈, 통합 실거래가(`/list`), 아파트, 오피스텔, 연립·다세대, 지역
  - 청약: `/subscription`
  - 생활편의: `/life` + 4개 그룹 및 하위(`LIFE_GROUPS`에서 파생, live 항목만 링크)
  - 안내: 서비스 소개, 데이터 안내, 이용약관, 개인정보 처리방침, 문의
- 가능하면 `LIFE_GROUPS`를 재사용해 중복 정의 회피.
- `/sitemap`(페이지)와 `/sitemap.xml`(Next 생성)은 URL이 달라 충돌 없음.
- `metadata`: title '사이트맵', canonical '/sitemap'.

#### `public/ads.txt` (신규)
- 게시자 ID 발급 전이므로 placeholder. 예:
  ```
  # google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
  # AdSense 승인 후 위 줄의 주석(#)을 제거하고 게시자 ID를 채운다.
  ```
- 실제 라인은 게시자 ID 발급 후 활성화.

### 4.3 기존 파일 외과적 수정

#### `app/sitemap.ts` (STATIC_ENTRIES만 추가)
- `STATIC_ENTRIES`에 다음 라우트 추가(재작성 금지, append):
  - `/subscription` (priority 0.9, daily) — 현재 누락
  - `/about`, `/data-source`, `/terms`, `/privacy`, `/contact`, `/sitemap` (priority 0.3, monthly)
- 동적 생성 로직은 손대지 않음.

#### `app/robots.ts`
- 법적/안내 페이지는 `allow: ['/']`로 이미 크롤 허용 → **변경 불필요.** (확인만)

#### `app/(public)/_components/footer.tsx`
- "법적 안내" 컬럼에 `문의(/contact)` 링크 추가.
- "서비스" 컬럼 하단 또는 별도로 `사이트맵(/sitemap)` 링크 추가.
- 그 외 레이아웃·스타일 변경 없음(외과적).

## 5. 비범위 (Out of Scope)
- 쿠키 동의 배너(CMP) / 동의 상태 저장
- FAQ 페이지, 별도 `/disclaimer` 페이지
- 문의 폼(서버 처리) — mailto만
- sitemap.ts 동적 엔트리 확장(의료·어린이집·urban 상세 등) — 별도 과제
- 사업자 정보(비사업자 개인 운영). 추후 사업자화 시 약관·개인정보 처리방침에 사업자 정보 보강 필요(문서에 주석).

## 6. 공통 구현 규칙
- 모든 신규/재작성 페이지: **서버 컴포넌트**, 정적, `export const metadata`(canonical 포함).
- 레이아웃 패턴: `article.mx-auto.max-w-2xl.px-6.py-16`, 디자인 토큰(`var(--color-*)`) 준수.
- 새 의존성·DB 스키마·환경변수 추가 없음.
- 변경된 모든 줄은 본 요청에 직접 추적 가능해야 함(외과적 변경 원칙).

## 7. 검증 기준
1. `pnpm typecheck` 통과.
2. `pnpm build` 통과(sitemap.ts/robots.ts 빌드 깨짐 없음).
3. 신규/재작성 페이지 각각 200 응답, footer 링크가 모든 신규 페이지로 연결.
4. `/privacy`에 AdSense 광고 쿠키·옵트아웃(`google.com/settings/ads`) 문구 포함.
5. `/sitemap.xml`에 신규 정적 라우트 포함, `/sitemap`(페이지) 정상 렌더.
6. `public/ads.txt` 접근 가능(`/ads.txt`).
```
