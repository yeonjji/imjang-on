# Vercel 비용 절감 — 안전 배치 (2026-07-10)

## 배경

7월 9일 Vercel on-demand 예산($30) 소진 경고. 월 인프라 청구 $50.94.

| 항목 | 사용량 | $ | 비중 |
|---|---|---|---|
| **Fast Origin Transfer** | 91 GB | **$24.40** | 48% |
| Fluid Active CPU | 40 h | $8.12 | 16% |
| Fluid Provisioned Memory | 384.58 GB·hr | $6.42 | 13% |
| ISR Writes | 714.3K | $3.71 | 7% |
| Build CPU Minutes | 91 h | $3.51 | 7% |
| Observability Events | 2.52M | $3.03 | 6% |
| Function Invocations | 2.74M | $1.64 | 3% |

## 근본 원인

**요청 경로에서 캐시되지 않는 함수 렌더링 × 무제한 크롤러 트래픽(~31.5만 URL 코퍼스).**

깊은 상세 페이지 전부가 온디맨드 ISR(`generateStaticParams()=>[]` + `revalidate=86400`)이고 코퍼스 전체가 사이트맵에 노출되는데 `robots.ts`는 악성 봇을 하나도 막지 않는다. 크롤러가 한 번 긁을 때마다 cold DB 렌더가 돌며 **ISR write + 원본 HTML 전송 + Fluid CPU/메모리 + Observability 이벤트 + Invocation**을 동시에 만든다. 여기에 가장 트래픽 높은 4개 페이지(홈·apt·officetel·villa)가 `force-dynamic`이라 매 요청 100% 원본. → 6개 비용 항목이 **같은 렌더의 6중 과금**이라 함께 움직인다.

**정정 (쫓지 말 것):** `list`(revalidate 60)·`subscription`(revalidate 300) *목록* 페이지는 `searchParams`를 읽어 동적(SSR)이므로 ISR write 0. GPT가 지목한 "Vercel Cron"은 존재하지 않음(ETL은 전부 GitHub Actions).

## 범위

**안전 배치만.** 제품/SEO/애드센스 색인에 영향이 0인 변경만 포함. 크롤 표면 축소(사이트맵/robots 콘텐츠 페이지 disallow, 미들웨어 봇 하드블록)는 **펜딩 중인 애드센스 재크롤/신청 종료 후로 연기**(별도 배치).

## 변경 항목 (코드 6건)

### ① 허브 4곳 `force-dynamic` → ISR — 최대 절감(~15–40GB)

**파일:** `app/(public)/page.tsx`, `apt/page.tsx`, `officetel/page.tsx`, `villa/page.tsx`

- `export const dynamic = 'force-dynamic'` 제거 → `export const revalidate = 900`
- 4개 파일 모두 쿼리가 이미 `.catch()`/`safe()`로 폴백 → 빌드 프리렌더가 빈 데이터여도 **빌드는 성공**(throw 안 함).

**빌드타임 빈 프리렌더 문제:** 빌드 환경은 Supabase 접근 불가(P2024)라 빌드 시 "빈 허브"가 구워진다. `revalidate`만으로는 배포 직후 그 빈 페이지가 fresh 상태로 window 동안 서빙된다. → **아래 ⑦ 배포 후 revalidate+워밍 워크플로로 즉시 실데이터로 교체**(빈 창 0).

`revalidate=900` 선택 이유: 워밍이 배포 직후 창을 없애므로 window 길이는 UX와 무관 → 재생성 비용을 낮추는 쪽으로 선택. 허브 데이터는 일 1~2회(ETL) 갱신이라 ≤15분 staleness 무해. (튜너블: 300~3600)

### ② OG 이미지 라우트 캐싱 — Fluid CPU/메모리($14.5) 공략

**파일 (동적 10건):** `app/(public)/{apt,officetel,villa}/[id]/opengraph-image.tsx`, `{school,childcare}/[sigunguCode]/[id]/opengraph-image.tsx`, `medical/{hospital,pharmacy}/[sigunguCode]/[id]/opengraph-image.tsx`, `subscription/[id]/opengraph-image.tsx`, `finance/[seq]/opengraph-image.tsx`, `board/[id]/opengraph-image.tsx`

각 파일에 추가:
```ts
export const revalidate = 86400;
export function generateStaticParams() { return []; }
```
→ 매 요청 satori 렌더 → id당 하루 1회 캐시(상세 페이지와 동일 패턴). 런타임은 `nodejs` 유지(엣지 전환 시 폰트 fs readFile 깨짐).

**파일:** `app/(public)/board/[id]/thumbnail/route.tsx` — 이미 `revalidate=86400` 있으나 `generateStaticParams` 부재로 무효 → `generateStaticParams(){return []}` 추가로 활성화.

**루트** `app/opengraph-image.tsx` — 파라미터 없어 이미 정적 생성 → 변경 없음.

**폰트 메모이즈** `lib/seo/og.tsx`: `loadOgFonts`의 1.58MB `readFile`을 모듈 스코프 캐시로 1회만 읽도록.

### ③ 빌드 위생 — $3.51의 40–50%

**파일:** `vercel.json` — `ignoreCommand` 추가, 문서/비런타임 파일만 바뀐 커밋은 빌드 스킵(월 빌드의 27%가 docs-only).

**신규:** `scripts/vercel-ignore-build.sh`
- Vercel 시맨틱: **exit 0 = 빌드 스킵**, exit 1 = 빌드 진행.
- `git diff --quiet HEAD^ HEAD`를 `docs/**`, `**/*.md`, `RESEARCH/**`, `.github/**` 제외 pathspec으로 실행 → 런타임 파일 변화 없으면 exit 0(스킵), 있으면 exit 1(빌드).
- `HEAD^` 부재(shallow/최초 커밋) 시 방어적으로 exit 1(빌드).

**파일:** `next.config.mjs` — Sentry `authToken: process.env.VERCEL_ENV === 'production' ? process.env.SENTRY_AUTH_TOKEN : undefined` → 프리뷰 빌드에서 소스맵 업로드 제거.

### ④ POI 상세 `revalidate` 24h → 7d — ISR writes/전송, 색인 변화 없음

**파일:** `medical/hospital/[sigunguCode]/[id]/page.tsx`, `medical/pharmacy/[sigunguCode]/[id]/page.tsx`, `school/[sigunguCode]/[id]/page.tsx`, `childcare/[sigunguCode]/[id]/page.tsx`

`revalidate = 86_400` → `604_800`(7d). 시설 정보는 거의 불변, 온디맨드 훅 없음 → 최악 7d staleness 무해. **apt/officetel/villa 상세는 24h 유지**(시세 매일 갱신 + ETL 온디맨드 revalidate가 커버).

### ⑤ staticmap `scale=2` → `1` — cold miss당 PNG 바이트 ¼

**파일:** `app/api/staticmap/route.ts:38` — `scale` `'2'`→`'1'`.

**캐시 헤더 확인(변경 없음, 검증만):** 현재 `Cache-Control: public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400` + upstream `next:{revalidate:2592000}` = 30d CDN 캐시. 적정. 기존 30d 캐시된 scale=2 이미지는 만료까지 유지(최대 30d 혼재 후 전부 scale=1).

### ⑥ robots.txt 스크래퍼/AI 봇 차단 — 검색·광고 색인 무영향

**파일:** `app/robots.ts` — 다음 UA에 `disallow: ['/']` 그룹 추가:
`AhrefsBot`, `SemrushBot`, `MJ12bot`, `DotBot`, `GPTBot`, `ClaudeBot`, `CCBot`, `Bytespider`, `PetalBot`

**허용 유지(명시 확인):** `Googlebot`, `Mediapartners-Google`(AdSense), `AdsBot-Google`, `Bingbot`, `Yeti`(네이버), `Daum`/`Daumoa`. 이들은 별도 disallow 그룹이 없어 기존 `*` 규칙(콘텐츠 허용)에 속함. robots-only라 크롤 준수 봇만 대상 → 애드센스 재크롤 무영향.

## 배포 후 revalidate + 캐시 워밍 워크플로 (⑦, ①의 필수 짝)

**신규:** `.github/workflows/warm-hub-cache.yml`

- 트리거: `on: deployment_status` — Vercel GitHub 통합이 프로덕션 배포 완료 시 발생시키는 이벤트.
- 게이트: `state == 'success'` && `environment == 'Production'`.
- 단계:
  1. **Revalidate(무효화):** `POST $SITE_URL/api/revalidate` body `{token, paths:['/','/apt','/officetel','/villa']}` — 빌드타임 빈 페이지를 stale 마킹. (`curl -fsS`로 실패 시 job 실패)
  2. **Warm(워밍):** `/`, `/apt`, `/officetel`, `/villa`를 각 1회 `GET` — 무효화 후 첫 요청이 런타임 실데이터로 재생성 + 엣지 캐시 워밍. HTTP 상태코드 로깅.
- 시크릿: `secrets.REVALIDATE_TOKEN`, `secrets.SITE_URL`(기존 재사용).
- **순서 중요:** revalidate → warm. 배포 직후 빈 페이지는 fresh라 warm만으론 재생성 안 됨(먼저 무효화 필수).

## 대시보드 (사용자 액션 — 코드 아님)

- **A. Spend Management** → 예산 상한 + "Pause when budget reached" 활성화(진짜 안전망; 상한은 정상 baseline보다 여유 있게).
- **B. Git 설정** → "Automatically cancel superseded deployments" 켜기(중복 프리뷰 빌드 취소).
- **C. (검증)** Usage → Fast Origin Transfer **경로별 분해** 확인 → ①의 15–40GB 추정 검증.
- **D. (검증)** Functions 메모리 설정 = 플랫폼 기본값 확인. Observability Plus / Speed Insights 샘플링 점검.

## 검증 계획

- `pnpm typecheck && pnpm lint` 통과(완료 게이트).
- 배포 후: `curl -sI https://imjang-on.com/apt` 2회 → 2회차 `x-vercel-cache: HIT`. 허브에 실제 카드/통계 렌더 확인.
- `warm-hub-cache` 워크플로 첫 실행 로그: revalidate 200 + 4개 warm 200 확인. (`deployment_status.environment` 문자열이 `'Production'`인지 첫 실행에서 확인 — 다르면 게이트 조정.)
- robots: `curl https://imjang-on.com/robots.txt` → 봇 그룹 반영, Google/AdSense/Yeti 허용 유지 확인.
- ignore-build: docs-only 커밋 push 시 Vercel 빌드 "skipped" 확인.

## 예상 효과

코드 6건 + 워크플로로 대략 **$10–15/월↓**(허브 캐싱이 안정되면 상단), 제품·SEO·애드센스 색인 변화 0. 구조적 크롤 표면 축소(별도 배치, 애드센스 후)까지 하면 $18–28/월 목표.

## 아웃 오브 스코프 (다음 배치, 애드센스 승인 후)

- 얇은 POI(병원·약국·어린이집·학교 상세) 사이트맵 제거 + robots disallow (~14만 URL, 코퍼스 절반).
- villa 사이트맵 게이트 `txCount12m>0` → `>=3`.
- 미들웨어 UA 게이팅(robots 미준수 스크래퍼 하드블록).
- 허브 통계 `DashboardSnapshot` ETL 사전계산(라이브 집계 제거).
- `subscription/[id]` 6h→24h, `urban/charger/[id]` 60s→3600s.
