# Oracle Cloud 자립 마이그레이션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** imjangon.co.kr(Next.js 15 + Postgres/PostGIS)을 Vercel+Supabase에서 OCI 단일 인스턴스(앱+DB 컨테이너)로 이전해 반복 인프라 비용을 $0로 만든다.

**Architecture:** Cloudflare(CDN·WAF·TLS) → Cloudflare Tunnel(HTTP 단일) → OCI 박스의 `docker compose`(web=Next standalone, db=postgis:17, cloudflared). ETL은 온박스 systemd 타이머가 `docker compose run etl`로 실행(localhost DB). DB 외부 노출 0. 배포는 GitHub Actions→SSH→온박스 빌드.

**Tech Stack:** Docker/compose, `postgis/postgis:17-3.5`, Next.js 15 standalone(ARM64), Prisma 5, pnpm 9, Cloudflare Tunnel, systemd, GitHub Actions.

**Design spec:** `docs/superpowers/specs/2026-07-21-oci-migration-design.md` (읽고 시작할 것 — 부록 A 환경변수 매핑 포함).

## Global Constraints

- **소스 DB**: Supabase PostgreSQL **17.6** / PostGIS 3.3.7 / 5.2GB. 타깃 컨테이너는 **`postgis/postgis:17-3.5`**(major 일치). pg_dump 클라이언트 **≥17**.
- **박스**: OCI `VM.Standard.A1.Flex`, **aarch64/ARM64**, 2 OCPU / 11GB / 45GB, Ubuntu 24.04, `ap-tokyo-1`. SSH: `ssh -i "/Users/jiyeonjeong/oci-key/ssh-key-2026-06-23.key" ubuntu@161.33.160.159`.
- **DB 이전 방식**: 스키마=`prisma migrate deploy`, 데이터=`pg_dump --data-only`. **전체 pg_dump 금지**(supabase_vault 등 Supabase 전용 객체로 실패).
- **필요 확장은 postgis + pg_trgm뿐**(마이그레이션이 생성). fuzzystrmatch/tiger/topology/uuid-ossp/pgcrypto는 미사용.
- **인바운드 개방 포트 = SSH(22)뿐.** HTTP/HTTPS/5432 외부 미개방(cloudflared 아웃바운드).
- **`SITE_URL`은 모든 컨텍스트에서 공개 도메인 `https://imjangon.co.kr`.** localhost로 바꾸지 말 것(posts 저장 link 오염).
- **`NEXT_PUBLIC_*`는 빌드타임 번들** → Docker build-arg로 전달.
- **컨테이너 내부 DB 호스트는 `db`(compose 서비스명)**, 호스트에서는 `127.0.0.1:5432`.
- **`next build`는 빌드타임에 DB 접근**(홈 스냅샷·`/apt`·`/officetel` 등 ISR prerender·`sitemap.xml`). 따라서 **web 이미지 빌드는 스키마가 적용된 db가 떠 있어야 함**. 빌더는 빌드타임 DB URL을 **BuildKit secret**으로 받고 `build.network: host`로 호스트-게시 `127.0.0.1:5432`에 접속(`BUILD_DATABASE_URL`). 런타임 `DATABASE_URL`(=`db:5432`)과 별개. **etl 이미지는 `deps`에서 파생 → 빌드 시 DB 불필요.** 배포 순서: etl 빌드 → db 기동 → migrate → **web 빌드** → up.
- 커밋 메시지 규칙: 프로젝트 관례(`feat(scope):`/`chore(scope):` 한국어 요약) 따름.

---

## File Structure

**앱 수정(레포):**
- `next.config.mjs` — `output: 'standalone'` + Sentry authToken 게이트 조정
- `app/layout.tsx` — Vercel analytics 제거
- `package.json` — `@vercel/analytics`·`@vercel/speed-insights` 의존 제거
- `prisma/schema.prisma` — generator `binaryTargets`

**신규(레포):**
- `Dockerfile` — 멀티스테이지(base→deps→builder→web, etl)
- `.dockerignore`
- `deploy/docker-compose.yml` — db·web·etl·cloudflared
- `deploy/.env.production.example` — 부록 A 변수 템플릿
- `deploy/run-etl.sh` — ETL 잡 디스패처
- `deploy/systemd/imjang-etl@.service` — ETL 템플릿 유닛
- `deploy/systemd/*.timer` — 잡별 타이머(생성 스크립트로)
- `deploy/systemd/imjang-backup.service` + `.timer`
- `deploy/deploy.sh` — 온박스 배포 스크립트
- `.github/workflows/deploy.yml` — Actions→SSH 배포
- `scripts/db/verify-counts.sh` — 테이블 행수/시퀀스 검증
- `scripts/db/dump-supabase.sh` — 데이터 덤프
- `scripts/db/load-oci.sh` — OCI 로드
- `scripts/backup/pg-backup.sh` — nightly 백업

**박스 상태(비레포):** swap, Docker, ufw, cloudflared, `/opt/imjang`(클론), `/var/lib/imjang/pgdata`, `deploy/.env.production`(실값).

---

# Phase 0 — 앱 컨테이너화 (레포, 로컬에서 완결 테스트)

이 Phase는 박스 없이 로컬에서 검증 가능. 산출물: 로컬에서 `docker compose`로 web+db가 뜨고 주요 라우트 200.

### Task 0.1: next.config standalone + Sentry 게이트

**Files:**
- Modify: `next.config.mjs`

**Interfaces:**
- Produces: standalone 빌드 산출물(`.next/standalone/server.js`).

- [ ] **Step 1: `next.config.mjs`에 standalone 출력 추가**

`const nextConfig = {` 바로 아래 `reactStrictMode: true,` 다음 줄에 추가:

```js
  // 단일 노드 self-host: standalone 산출물(server.js)로 실행
  output: 'standalone',
```

- [ ] **Step 2: Sentry authToken 게이트를 self-host 빌드에서도 동작하게**

`next.config.mjs`에서 아래를 찾는다:

```js
  authToken: process.env.VERCEL_ENV === 'production' ? process.env.SENTRY_AUTH_TOKEN : undefined,
```

다음으로 교체(토큰이 있으면 업로드; 없으면 조용히 스킵):

```js
  authToken: process.env.SENTRY_AUTH_TOKEN || undefined,
```

- [ ] **Step 3: 빌드로 standalone 산출물 생성 확인**

Run: `pnpm build && ls .next/standalone/server.js`
Expected: 빌드 성공 + `server.js` 경로 출력(파일 존재).

- [ ] **Step 4: Commit**

```bash
git add next.config.mjs
git commit -m "chore(deploy): Next standalone 출력 + Sentry authToken self-host 게이트"
```

### Task 0.2: Vercel analytics 제거

**Files:**
- Modify: `app/layout.tsx`
- Modify: `package.json`

- [ ] **Step 1: `app/layout.tsx`에서 import 2줄 제거**

삭제:

```js
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
```

- [ ] **Step 2: `app/layout.tsx`에서 컴포넌트 2줄 제거**

삭제:

```jsx
        <Analytics />
        <SpeedInsights />
```

- [ ] **Step 3: package.json 의존 제거**

Run: `pnpm remove @vercel/analytics @vercel/speed-insights`
Expected: 두 패키지 제거, lockfile 갱신.

- [ ] **Step 4: 타입체크·린트로 잔존 참조 없음 확인**

Run: `pnpm typecheck && pnpm lint`
Expected: 에러 없음(미사용 import/변수 0).

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx package.json pnpm-lock.yaml
git commit -m "chore(deploy): Vercel analytics/speed-insights 제거(self-host)"
```

### Task 0.3: Prisma binaryTargets(ARM)

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: generator 블록에 binaryTargets 추가**

`generator client {` 블록에서 `provider = "prisma-client-js"` 다음 줄에 추가:

```prisma
  binaryTargets   = ["native", "linux-arm64-openssl-3.0.x"]
```

(빌드는 ARM 컨테이너 내부에서 `prisma generate`하므로 native로 해결되지만, 명시로 안전장치.)

- [ ] **Step 2: generate 성공 확인**

Run: `pnpm prisma generate`
Expected: 성공(엔진 다운로드/생성).

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "chore(deploy): Prisma binaryTargets arm64 추가"
```

### Task 0.4: Dockerfile(멀티스테이지 web+etl)

**Files:**
- Create: `Dockerfile`

**Interfaces:**
- Produces: 이미지 타깃 `web`(standalone 런타임), `etl`(dev deps+tsx+scripts, 마이그레이션·ingest 실행용).

- [ ] **Step 1: `Dockerfile` 작성**

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- deps: 의존 설치 (postinstall의 prisma generate가 schema를 필요로 하므로 prisma/ 먼저 복사) ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# ---- builder: Next standalone 빌드 ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_NAVER_MAP_CLIENT_ID
ARG NEXT_PUBLIC_KAKAO_JS_KEY
ARG NEXT_PUBLIC_GA_ID
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=$NEXT_PUBLIC_NAVER_MAP_CLIENT_ID \
    NEXT_PUBLIC_KAKAO_JS_KEY=$NEXT_PUBLIC_KAKAO_JS_KEY \
    NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
RUN pnpm prisma generate
# next build가 홈·/apt·/officetel·sitemap을 prerender하며 DB를 읽음 → 빌드타임 DB URL을 secret으로 주입.
# 스키마 적용된 db가 떠 있어야 하며 compose build.network:host로 호스트-게시 127.0.0.1:5432에 접속.
RUN --mount=type=secret,id=build_db_url \
    DATABASE_URL="$(cat /run/secrets/build_db_url)" \
    DIRECT_URL="$(cat /run/secrets/build_db_url)" \
    pnpm build

# ---- web: 최소 standalone 런타임 ----
FROM base AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

# ---- etl: 온박스 ingest/마이그레이션 실행용(deps+tsx+scripts, next build 없음 → DB 불필요) ----
FROM base AS etl
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma generate
# 사용: docker compose run --rm etl pnpm <script>  (예: prisma migrate deploy, ingest:run)
CMD ["pnpm", "--version"]
```

- [ ] **Step 2: etl 이미지 빌드(로컬, DB 불필요)**

Run: `docker build --target etl -t imjang-etl:test . && docker run --rm imjang-etl:test`
Expected: pnpm 버전(9.x). etl은 `next build`를 하지 않으므로 DB 없이 빌드됨.

- [ ] **Step 3: deps 스테이지 빌드 확인(로컬)**

web 전체 빌드는 스키마 적용된 db가 필요(홈·/apt·sitemap prerender) + Mac은 `build.network:host` 제약 → **web 이미지 빌드·standalone·Prisma엔진 검증은 Phase 2 Task 2.1(박스)에서** 수행. 여기선 의존·컴파일 기반만 확인:
Run: `docker build --target deps -t imjang-deps:test .`
Expected: deps 스테이지 성공(pnpm install).

(온박스 web 빌드 후 Prisma 엔진 포함 검증:
`docker run --rm --entrypoint sh <web-image> -c "ls node_modules/.prisma/client | grep -E 'libquery_engine|schema.prisma'"`.
누락 시 web 스테이지에 `COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma` 추가.)

- [ ] **Step 4: Commit**

```bash
git add Dockerfile
git commit -m "feat(deploy): 멀티스테이지 Dockerfile(web standalone + etl, 빌드타임 DB secret)"
```

### Task 0.5: .dockerignore

**Files:**
- Create: `.dockerignore`

- [ ] **Step 1: `.dockerignore` 작성**

```
node_modules
.next
.git
.github
.env*
deploy/.env*
tests
test-results
playwright-report
.playwright-mcp
*.png
docs
html
RESEARCH
.omc
.omx
.superpowers
.idea
.vercel
```

(`deploy/.env*` 제외 필수 — etl `COPY . .`가 `deploy/.env.production`(시크릿)을 이미지에 굽는 것 방지.)

- [ ] **Step 2: 빌드 컨텍스트 축소 확인(재빌드가 캐시로 빠른지)**

Run: `docker build --target etl -t imjang-etl:test .`
Expected: 성공(전송 컨텍스트가 작아짐).

- [ ] **Step 3: Commit**

```bash
git add .dockerignore
git commit -m "chore(deploy): .dockerignore 추가"
```

### Task 0.6: 프로덕션 compose

**Files:**
- Create: `deploy/docker-compose.yml`

**Interfaces:**
- Consumes: `Dockerfile` 타깃 web·etl; `deploy/.env.production`(다음 태스크).
- Produces: 서비스 `db`,`web`,`etl`(profile tools),`cloudflared`.

- [ ] **Step 1: `deploy/docker-compose.yml` 작성**

```yaml
name: imjang
services:
  db:
    image: postgis/postgis:17-3.5
    restart: unless-stopped
    shm_size: 512mb
    stop_grace_period: 1m
    environment:
      POSTGRES_DB: imjang_on
      POSTGRES_USER: imjang
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set in .env.production}
    volumes:
      - /var/lib/imjang/pgdata:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U imjang -d imjang_on"]
      interval: 10s
      timeout: 5s
      retries: 10

  web:
    build:
      context: ..
      dockerfile: Dockerfile
      target: web
      args:
        NEXT_PUBLIC_SITE_URL: ${NEXT_PUBLIC_SITE_URL}
        NEXT_PUBLIC_NAVER_MAP_CLIENT_ID: ${NEXT_PUBLIC_NAVER_MAP_CLIENT_ID}
        NEXT_PUBLIC_KAKAO_JS_KEY: ${NEXT_PUBLIC_KAKAO_JS_KEY}
        NEXT_PUBLIC_GA_ID: ${NEXT_PUBLIC_GA_ID}
        NEXT_PUBLIC_SENTRY_DSN: ${NEXT_PUBLIC_SENTRY_DSN}
      network: host          # 빌드 시 호스트-게시 127.0.0.1:5432(db)에 접속(빌드타임 prerender DB)
      secrets:
        - build_db_url       # 빌드타임 DATABASE_URL/DIRECT_URL
    restart: unless-stopped
    env_file: [.env.production]
    ports:
      - "127.0.0.1:3000:3000"
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://127.0.0.1:3000/',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 5
    # (선택) ISR 캐시를 배포 간 유지하려면 named volume 마운트. 최초 1회 chown 필요(컨테이너 user nextjs=1001):
    #   volumes: ["imjang-isr:/app/.next/cache"]  +  최하단 `volumes: { imjang-isr: {} }`
    # 미마운트 시 배포 직후 ISR 콜드(재생성 폭주) — 트래픽 규모상 수용 가능.

  etl:
    build:
      context: ..
      dockerfile: Dockerfile
      target: etl
    profiles: ["tools"]
    env_file: [.env.production]
    volumes:
      # 스크립트가 `dotenv -e .env.local`을 쓰므로 prod env를 .env.local로 마운트
      - ./.env.production:/app/.env.local:ro
    depends_on:
      db:
        condition: service_healthy

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      TUNNEL_TOKEN: ${TUNNEL_TOKEN}
    depends_on:
      - web

secrets:
  build_db_url:
    environment: BUILD_DATABASE_URL   # compose가 env(BUILD_DATABASE_URL) 값을 secret 내용으로 사용
```

- [ ] **Step 2: compose 문법 검증**

Run: `docker compose -f deploy/docker-compose.yml config -q`
Expected: 출력 없음(문법 정상). `.env.production` 부재 경고는 다음 태스크에서 해결.

- [ ] **Step 3: Commit**

```bash
git add deploy/docker-compose.yml
git commit -m "feat(deploy): 프로덕션 docker-compose(db·web·etl·cloudflared)"
```

### Task 0.7: env 템플릿

**Files:**
- Create: `deploy/.env.production.example`
- Modify: `.gitignore` (deploy/.env.production 제외)

**Interfaces:**
- Produces: 부록 A 전체 변수 목록. 실값 파일 `deploy/.env.production`은 git 제외.

- [ ] **Step 1: `deploy/.env.production.example` 작성**

```bash
# ===== 컨테이너 DB (compose 내부 호스트=db) =====
POSTGRES_PASSWORD=change-me-strong
DATABASE_URL=postgresql://imjang:change-me-strong@db:5432/imjang_on
DIRECT_URL=postgresql://imjang:change-me-strong@db:5432/imjang_on
# 빌드타임 전용(web 이미지 빌드 시 prerender가 DB 접근). build.network:host로 호스트-게시 포트 사용.
BUILD_DATABASE_URL=postgresql://imjang:change-me-strong@127.0.0.1:5432/imjang_on

# ===== 공개 도메인 (모든 컨텍스트 동일) =====
SITE_URL=https://imjangon.co.kr
NEXT_PUBLIC_SITE_URL=https://imjangon.co.kr

# ===== 웹 빌드타임(NEXT_PUBLIC_*) =====
NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=
NEXT_PUBLIC_KAKAO_JS_KEY=
NEXT_PUBLIC_GA_ID=
NEXT_PUBLIC_SENTRY_DSN=

# ===== 웹 런타임 =====
NAVER_MAP_CLIENT_SECRET=
REVALIDATE_TOKEN=
ADMIN_USER=
ADMIN_PASSWORD=
BOARD_PREVIEW_TOKEN=
SENTRY_DSN=
LOG_LEVEL=info

# ===== ETL 런타임 =====
PUBLIC_DATA_KEY=
NEIS_API_KEY=
CHILDCARE_API_KEY=
KAKAO_REST_KEY=
OPENAI_API_KEY=
NAVER_SEARCH_CLIENT_ID=
NAVER_SEARCH_CLIENT_SECRET=
DISCORD_WEBHOOK_URL=

# ===== 빌드(선택: Sentry 소스맵 업로드) =====
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=

# ===== Cloudflare Tunnel (Phase 2에서 채움) =====
TUNNEL_TOKEN=
```

- [ ] **Step 2: `.gitignore`에 실값 파일 추가**

`.gitignore` 끝에 추가:

```
deploy/.env.production
```

- [ ] **Step 3: 커밋(실값 파일은 절대 커밋 안 됨 확인)**

Run: `git status --short deploy/`
Expected: `deploy/.env.production.example`만 스테이징 대상. 실값 파일 없음.

```bash
git add deploy/.env.production.example .gitignore
git commit -m "chore(deploy): 프로덕션 env 템플릿(부록 A) + gitignore"
```

### Task 0.8: 로컬 통합 스모크(web+db)

로컬에서 실제로 컨테이너 스택이 동작하는지 확인(박스 이전에 리스크 조기 발견).

- [ ] **Step 1: 로컬 임시 env 준비**

Run:
```bash
cp deploy/.env.production.example deploy/.env.production
# 로컬 스모크용 최소값만: POSTGRES_PASSWORD, DATABASE_URL/DIRECT_URL(위 예시값 유지), SITE_URL 유지
```

- [ ] **Step 2: db 기동 + 스키마 적용(로컬, Mac)**

Run:
```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production up -d db
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production run --rm etl pnpm prisma migrate deploy
```
Expected: db healthy, 33개 마이그레이션 적용, postgis·pg_trgm 생성. (etl 이미지는 `next build`가 없어 DB 없이 빌드됨.)

- [ ] **Step 3: 스키마·확장 검증**

Run:
```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production exec db psql -U imjang -d imjang_on -c "SELECT extname FROM pg_extension WHERE extname IN ('postgis','pg_trgm');" -c "\dt" | head
```
Expected: postgis·pg_trgm + 빈 테이블 목록.

- [ ] **Step 4: (참고) web 빌드·라우트 스모크는 온박스에서**

web 이미지 빌드는 빌드타임 DB 접근(홈·/apt·sitemap prerender) + `build.network:host`가 필요해 **박스(Linux)에서** 수행 → Phase 2 Task 2.1에서 quick tunnel로 `/`·`/opengraph-image`·`/robots.txt` 200 확인. Mac 로컬 web 빌드는 호스트 네트워킹 제약으로 생략.

- [ ] **Step 5: 정리**

Run:
```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production down
rm deploy/.env.production
```
Expected: 스택 종료. (실값 env는 박스에만 둔다.)

- [ ] **Step 6: 커밋 없음** — 이 태스크는 검증만. 실패 시 해당 원인 태스크(0.4/0.6)로 돌아가 수정.

---

# Phase 1 — OCI 박스 프로비저닝

박스 상태 변경(레포 변경 없음). 모든 명령은 SSH 세션에서. 편의를 위해 로컬에 alias:

```bash
alias oci='ssh -i "/Users/jiyeonjeong/oci-key/ssh-key-2026-06-23.key" ubuntu@161.33.160.159'
```

### Task 1.1: 스왑 4GB

- [ ] **Step 1: 스왑 파일 생성·활성화**

Run:
```bash
oci 'sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab'
```
Expected: `/swapfile` fstab 등록 출력.

- [ ] **Step 2: 검증**

Run: `oci 'swapon --show && free -h'`
Expected: 4GB swap 표시.

### Task 1.2: Docker Engine + compose plugin

- [ ] **Step 1: Docker 공식 설치 스크립트**

Run:
```bash
oci 'curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker ubuntu'
```
Expected: docker 설치 완료.

- [ ] **Step 2: 재접속 후 그룹 반영·버전 확인**

Run: `oci 'docker --version && docker compose version'`
Expected: Docker 27.x, compose v2.x. (그룹 반영 안 되면 한 번 더 SSH 재접속.)

- [ ] **Step 3: 아키텍처 확인(ARM64)**

Run: `oci 'docker info --format "{{.Architecture}}"'`
Expected: `aarch64`.

- [ ] **Step 4: 검증용 psql 클라이언트 설치**

`verify-counts.sh`가 박스에서 `psql`을 직접 호출하므로 설치(박스엔 Docker만 있음).
Run: `oci 'sudo apt-get update && sudo apt-get install -y postgresql-client && psql --version'`
Expected: `psql (PostgreSQL) 16.x`(PG17 서버 SELECT엔 무방).

### Task 1.3: 방화벽(인바운드 SSH만)

- [ ] **Step 1: ufw 설정**

Run:
```bash
oci 'sudo ufw allow OpenSSH && sudo ufw --force enable && sudo ufw status'
```
Expected: 22/tcp ALLOW. 그 외 미개방.

- [ ] **Step 2: OCI Security List 확인(수동)**

OCI 콘솔 → VCN → Security List에서 인그레스가 22/tcp(및 필요 시 ICMP)만 있는지 확인. **80/443/5432 인그레스 룰이 있으면 제거.** cloudflared는 아웃바운드라 인바운드 불필요.
Expected: 인그레스 = SSH뿐.

### Task 1.4: 타임존 UTC + 레포 클론 + 데이터 디렉토리

- [ ] **Step 1: 타임존 UTC 고정(cron 시각 보존)**

Run: `oci 'sudo timedatectl set-timezone UTC && timedatectl | grep zone'`
Expected: `Time zone: UTC`.

- [ ] **Step 2: 레포 클론 + 디렉토리**

Run:
```bash
oci 'sudo mkdir -p /opt/imjang /var/lib/imjang/pgdata && sudo chown -R ubuntu:ubuntu /opt/imjang && git clone https://github.com/yeonjji/imjang-on.git /opt/imjang'
```
Expected: `/opt/imjang`에 클론(public repo라 인증 불필요).

- [ ] **Step 3: 실값 env 배치**

로컬에서 Vercel 값 회수 후 박스로 전송:
```bash
# 로컬: Production 값 일괄 회수
vercel env pull --environment=production /tmp/.env.vercel.prod
# /tmp/.env.vercel.prod + GH-only(NEIS_API_KEY·CHILDCARE_API_KEY) + Cloudflare TUNNEL_TOKEN을
# deploy/.env.production.example 형식에 맞춰 편집 → /tmp/.env.production 완성
#   - DATABASE_URL/DIRECT_URL 은 db:5432 (Supabase 값 아님!)
#   - SITE_URL/NEXT_PUBLIC_SITE_URL = https://imjangon.co.kr
scp -i "/Users/jiyeonjeong/oci-key/ssh-key-2026-06-23.key" /tmp/.env.production ubuntu@161.33.160.159:/opt/imjang/deploy/.env.production
```
Expected: `/opt/imjang/deploy/.env.production` 존재(권한 600 권장: `oci 'chmod 600 /opt/imjang/deploy/.env.production'`).

- [ ] **Step 4: 검증(민감값 노출 없이 키 존재만)**

Run: `oci 'cut -d= -f1 /opt/imjang/deploy/.env.production | grep -E "DATABASE_URL|SITE_URL|REVALIDATE_TOKEN|POSTGRES_PASSWORD"'`
Expected: 네 키 모두 출력.

### Task 1.5: DB 컨테이너 기동 + 스키마 적용

- [ ] **Step 1: db 기동**

Run:
```bash
oci 'cd /opt/imjang && docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production up -d db'
```
Expected: db 컨테이너 healthy(`docker compose ... ps`로 확인).

- [ ] **Step 2: 스키마 적용(etl 이미지 빌드 포함)**

Run:
```bash
oci 'cd /opt/imjang && docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production run --rm etl pnpm prisma migrate deploy'
```
Expected: 33개 마이그레이션 적용. (첫 실행은 etl 이미지 빌드로 수 분.)

- [ ] **Step 3: 확장·테이블 존재 검증**

Run:
```bash
oci 'docker exec imjang-db-1 psql -U imjang -d imjang_on -c "SELECT extname FROM pg_extension WHERE extname IN (\"postgis\",\"pg_trgm\");" -c "\dt" | head -20'
```
Expected: postgis·pg_trgm 존재, 테이블(빈 상태) 목록 출력. (컨테이너명이 다르면 `docker compose ps`로 확인.)

---

# Phase 2 — Cloudflare + Tunnel

### Task 2.1: 스테이징 스모크(quick tunnel)

NS 전환 전에 박스 앱을 외부에서 검증(임시 URL).

- [ ] **Step 1: web 빌드·기동(스키마 적용된 db 위에서)**

Task 1.5에서 db+스키마가 이미 떠 있어야 함(web 빌드가 prerender로 DB 접근). `BUILD_DATABASE_URL`을 export해 build_db_url secret 주입.

Run:
```bash
oci 'cd /opt/imjang && set -a; . <(grep -E "^BUILD_DATABASE_URL=" deploy/.env.production); set +a; \
  DC="docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production"; \
  $DC up -d db --wait && $DC up -d --build web'
```
Expected: web 빌드 성공(스키마 있는 빈 db 기준 prerender 통과) + healthy. 실패 시 Task 1.5(migrate) 완료 여부·`BUILD_DATABASE_URL`(127.0.0.1:5432) 확인.

- [ ] **Step 2: quick tunnel로 임시 공개 URL**

Run:
```bash
oci 'docker run --rm --network imjang_default cloudflare/cloudflared:latest tunnel --url http://web:3000 --no-autoupdate' &
```
Expected: 출력에 `https://<random>.trycloudflare.com` URL. (네트워크명은 `docker network ls`로 확인.)

- [ ] **Step 3: 임시 URL 스모크(OG·image·middleware 포함)**

Run(로컬):
```bash
U=https://<random>.trycloudflare.com
for p in / /robots.txt /opengraph-image /apt /medical/hospital; do curl -sS -o /dev/null -w "$p %{http_code}\n" "$U$p"; done
```
Expected: 전부 200(빈 DB라 목록은 비어도 렌더 200). 실패한 라우트는 스펙 §4.3 스모크 항목으로 원인 격리.

- [ ] **Step 4: quick tunnel 종료** (Ctrl-C로 background 종료)

### Task 2.2: named tunnel 생성 + 토큰

- [ ] **Step 1: Cloudflare Zero Trust에서 tunnel 생성(수동)**

Cloudflare 대시보드 → Zero Trust → Networks → Tunnels → Create tunnel(cloudflared). 이름 `imjang-oci`. **Token 복사.**

- [ ] **Step 2: public hostname 설정(수동, NS 전환 후 활성)**

Tunnel → Public Hostname 추가:
- `imjangon.co.kr` → Service `HTTP` → `web:3000`
- `www.imjangon.co.kr` → 동일(또는 리다이렉트 규칙)
(도메인이 아직 CF에 없으면 저장은 되고, NS 전환 후 라우팅 활성.)

- [ ] **Step 3: 토큰을 박스 env에 기입**

Run:
```bash
oci 'cd /opt/imjang && sed -i "s|^TUNNEL_TOKEN=.*|TUNNEL_TOKEN=<복사한토큰>|" deploy/.env.production'
```
Expected: TUNNEL_TOKEN 설정.

- [ ] **Step 4: cloudflared 서비스 기동 + 연결 확인**

Run:
```bash
oci 'cd /opt/imjang && docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production up -d cloudflared && sleep 5 && docker compose -f deploy/docker-compose.yml logs cloudflared | tail -20'
```
Expected: 로그에 `Registered tunnel connection` 4개(엣지 연결 성립).

### Task 2.3: DNS 존 복제(수동, NS 전환은 컷오버에서)

- [ ] **Step 1: Cloudflare에 사이트 추가**

대시보드 → Add a site → `imjangon.co.kr` → Free plan. CF가 기존 레코드 자동 스캔.

- [ ] **Step 2: Vercel DNS 레코드와 대조**

Vercel 대시보드(Domains) 또는 `vercel dns ls imjangon.co.kr`로 전체 레코드 export. CF 스캔 결과와 **1:1 대조**해 누락 수동 추가. 실측상 **MX 없음·apex TXT 없음**이지만 서브도메인/`_dmarc`/CAA/verification 레코드가 있으면 반드시 복제.
Expected: CF 레코드 = Vercel 레코드(A/AAAA/CNAME/TXT/CAA 전부). **아직 NS 변경 금지.**

- [ ] **Step 3: apex/www가 tunnel로 프록시되게**

CF DNS에서 `imjangon.co.kr`·`www`의 A/CNAME은 Tunnel public hostname이 자동 생성한 `CNAME → <tunnel-id>.cfargotunnel.com`(프록시 ON, 주황 구름)인지 확인.
Expected: 프록시 상태 ON.

---

# Phase 3 — DB 데이터 이전 드라이런

검증 스크립트를 만들고, 실제 컷오버 전 1회 리허설로 소요·정합성 확인.

### Task 3.1: 검증 스크립트

**Files:**
- Create: `scripts/db/verify-counts.sh`

**Interfaces:**
- Consumes: 인자 `$1`=libpq 연결문자열.
- Produces: `table,count` CSV(stdout, 테이블명 정렬).

- [ ] **Step 1: `scripts/db/verify-counts.sh` 작성**

```bash
#!/usr/bin/env bash
# 사용: verify-counts.sh "postgresql://..." > counts.csv
# public 스키마 모든 테이블의 정확한 행수를 CSV로 출력(정렬). spatial_ref_sys 제외.
set -euo pipefail
CONN="${1:?connection string required}"
# 카운트 쿼리를 카탈로그에서 생성
GEN=$(psql "$CONN" -At -c "
  SELECT string_agg(format('SELECT %L AS t, count(*) AS c FROM %I.%I', tablename, schemaname, tablename), ' UNION ALL ')
  FROM pg_tables
  WHERE schemaname='public' AND tablename <> 'spatial_ref_sys';
")
psql "$CONN" -At -F',' -c "SELECT t, c FROM ($GEN) x ORDER BY t;"
```

- [ ] **Step 2: 실행권한 + Supabase 기준선 캡처(로컬)**

Run(로컬, DIRECT_URL=세션 풀러):
```bash
chmod +x scripts/db/verify-counts.sh
./node_modules/.bin/dotenv -e .env.local -- sh -c 'PGSSLMODE=require scripts/db/verify-counts.sh "$DIRECT_URL"' > /tmp/supabase-counts.csv
wc -l /tmp/supabase-counts.csv && head /tmp/supabase-counts.csv
```
Expected: 테이블별 행수 CSV(예: `Transaction,7357284`). 라인 수 = public 테이블 수.

- [ ] **Step 3: Commit**

```bash
git add scripts/db/verify-counts.sh
git commit -m "feat(db): 테이블 행수 검증 스크립트(마이그레이션 정합성)"
```

### Task 3.2: 덤프 스크립트

**Files:**
- Create: `scripts/db/dump-supabase.sh`

- [ ] **Step 1: `scripts/db/dump-supabase.sh` 작성**

```bash
#!/usr/bin/env bash
# Supabase(PG17)에서 public 데이터만 덤프. 소스 접속은 세션 풀러(:5432).
# 사용: SUPABASE_DIRECT_URL=... dump-supabase.sh /path/out.dump
set -euo pipefail
: "${SUPABASE_DIRECT_URL:?source conn required}"
OUT="${1:?output path required}"
# postgis:17 컨테이너의 pg_dump(≥17) 사용. custom format(-Fc).
docker run --rm -e PGSSLMODE=require -v "$(dirname "$OUT")":/out postgis/postgis:17-3.5 \
  pg_dump "$SUPABASE_DIRECT_URL" \
    --data-only --schema=public --no-owner --no-privileges \
    --exclude-table-data='public.spatial_ref_sys' \
    -Fc -f "/out/$(basename "$OUT")"
ls -lh "$OUT"
```

- [ ] **Step 2: 드라이런 덤프(로컬 또는 박스)**

Run(로컬):
```bash
chmod +x scripts/db/dump-supabase.sh
export SUPABASE_DIRECT_URL="$(grep '^DIRECT_URL' .env.local | cut -d= -f2- | tr -d '\"')"
scripts/db/dump-supabase.sh /tmp/supabase-data.dump
```
Expected: `.dump` 파일 생성(수백 MB~1GB대), 소요 시간 기록.

- [ ] **Step 3: Commit**

```bash
git add scripts/db/dump-supabase.sh
git commit -m "feat(db): Supabase 데이터-온리 덤프 스크립트(세션 풀러·PG17)"
```

### Task 3.3: 로드 스크립트

**Files:**
- Create: `scripts/db/load-oci.sh`

- [ ] **Step 1: `scripts/db/load-oci.sh` 작성**

```bash
#!/usr/bin/env bash
# OCI db 컨테이너에 데이터-온리 복원(트리거 비활성). 스키마는 사전에 migrate deploy 되어 있어야 함.
# 사용: load-oci.sh /path/in.dump
set -euo pipefail
IN="${1:?dump path required}"
docker cp "$IN" imjang-db-1:/tmp/in.dump
docker exec imjang-db-1 pg_restore \
  --data-only --disable-triggers --no-owner \
  -U imjang -d imjang_on /tmp/in.dump
docker exec imjang-db-1 rm -f /tmp/in.dump
```

- [ ] **Step 2: 박스로 덤프 전송 + 로드(드라이런)**

Run:
```bash
scp -i "/Users/jiyeonjeong/oci-key/ssh-key-2026-06-23.key" /tmp/supabase-data.dump ubuntu@161.33.160.159:/tmp/
oci 'cd /opt/imjang && chmod +x scripts/db/load-oci.sh && scripts/db/load-oci.sh /tmp/supabase-data.dump'
```
Expected: 복원 완료(경고 없이). 컨테이너명이 다르면 `docker compose ps`로 확인 후 스크립트의 `imjang-db-1` 교체.

- [ ] **Step 3: OCI 카운트 vs Supabase 기준선 diff**

Run:
```bash
oci 'cd /opt/imjang && scripts/db/verify-counts.sh "postgresql://imjang:$(grep ^POSTGRES_PASSWORD deploy/.env.production|cut -d= -f2-)@127.0.0.1:5432/imjang_on"' > /tmp/oci-counts.csv
diff /tmp/supabase-counts.csv /tmp/oci-counts.csv && echo "MATCH"
```
Expected: `MATCH`(차이 0). 차이 나면 원인(제외 테이블·트리거) 조사.

- [ ] **Step 4: 시퀀스 검증**

Run:
```bash
oci 'docker exec imjang-db-1 psql -U imjang -d imjang_on -c "SELECT last_value FROM \"Transaction_id_seq\";" -c "SELECT max(id) FROM \"Transaction\";"'
```
Expected: `last_value` ≥ `max(id)`(setval 반영). 미달이면 데이터-온리 덤프에 setval 누락 → `pg_dump` 옵션 재확인.

- [ ] **Step 5: Commit**

```bash
git add scripts/db/load-oci.sh
git commit -m "feat(db): OCI 데이터-온리 복원 스크립트 + 카운트/시퀀스 검증"
```

- [ ] **Step 6: 드라이런 데이터 비우기(컷오버에서 재로드)**

Run:
```bash
oci 'cd /opt/imjang && docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production run --rm etl pnpm prisma migrate reset --force --skip-seed'
```
Expected: 스키마 리셋(빈 상태). 컷오버 때 최신 데이터로 재적재. (또는 드라이런 데이터를 유지하고 컷오버 시 증분만 — 단순화 위해 리셋 권장.)

---

# Phase 4 — ETL 온박스(systemd)

### Task 4.1: ETL 디스패처

**Files:**
- Create: `deploy/run-etl.sh`

**Interfaces:**
- Consumes: 인자 `$1`=잡 키.
- Produces: `docker compose run --rm etl pnpm <script>` 실행.

- [ ] **Step 1: 매트릭스 소스 확인(정확한 값 추출)**

Run(로컬):
```bash
grep -A8 "matrix:" .github/workflows/ingest-subscriptions.yml .github/workflows/ingest-amenities.yml
```
Expected: `source:` 배열 값들(예: subscriptions=`[chungyak, lh]`, amenities=`[hospital, pharmacy, ...]`). 이 값들을 아래 JOBS에 반영.

- [ ] **Step 2: `deploy/run-etl.sh` 작성**

(아래 JOBS는 워크플로 실측 커맨드 기반. 매트릭스 잡은 Step 1에서 얻은 소스로 확장.)

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/imjang
DC="docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production run --rm etl"

case "${1:?job key required}" in
  transactions-daily)
    $DC pnpm ingest:run
    $DC pnpm tsx scripts/dashboard/refresh-snapshot.ts
    ;;
  backfill-loop)      $DC pnpm ingest:run ;;   # 백필 완료 후 타이머 비활성 가능
  loan)               $DC pnpm tsx scripts/ingest/loan/runner.ts ;;
  jeonse-guarantee)   $DC pnpm tsx scripts/ingest/jeonse-guarantee/runner.ts ;;
  board-posts)        $DC pnpm tsx scripts/ingest/posts/runner.ts ;;
  seed-regions)       $DC pnpm tsx scripts/ingest/regions/seed-from-api.ts ;;
  # 매트릭스: Step 1 소스로 확장(예시)
  subscriptions)      for s in chungyak lh; do $DC pnpm tsx scripts/ingest/subscriptions/runner.ts --source=$s; done ;;
  amenities)          for s in hospital pharmacy; do $DC pnpm tsx scripts/ingest/amenities/runner.ts --source=$s; done ;;
  *) echo "unknown job: $1" >&2; exit 2 ;;
esac
```

- [ ] **Step 3: 라이트 잡으로 동작 확인(loan 또는 seed-regions는 부하 큼 → jeonse-guarantee 소량 테스트)**

Run:
```bash
oci 'cd /opt/imjang && chmod +x deploy/run-etl.sh && deploy/run-etl.sh jeonse-guarantee'
```
Expected: 스크립트 완료, DB에 행 적재(에러 없이). revalidate 경고는 SITE_URL/토큰 확인.

- [ ] **Step 4: Commit**

```bash
git add deploy/run-etl.sh
git commit -m "feat(etl): 온박스 ETL 디스패처(워크플로 커맨드 이식)"
```

### Task 4.2: systemd 템플릿 + 타이머

**Files:**
- Create: `deploy/systemd/imjang-etl@.service`
- Create: `deploy/systemd/install-timers.sh`

- [ ] **Step 1: 템플릿 서비스 작성**

`deploy/systemd/imjang-etl@.service`:

```ini
[Unit]
Description=imjang ETL job %i
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
User=ubuntu
WorkingDirectory=/opt/imjang
ExecStart=/opt/imjang/deploy/run-etl.sh %i
TimeoutStartSec=3600
```

- [ ] **Step 2: 타이머 생성 스크립트 작성**

`deploy/systemd/install-timers.sh` (UTC OnCalendar, 기존 cron 시각 보존):

```bash
#!/usr/bin/env bash
set -euo pipefail
# 잡키|OnCalendar(UTC)
JOBS='
transactions-daily|*-*-* 15,19:00:00
subscriptions|*-*-* 18:30:00
loan|*-*-01 20:00:00
jeonse-guarantee|*-*-02 20:00:00
amenities|*-*-01 02:00:00
board-posts|Mon *-*-* 02:00:00
seed-regions|*-04-05 18:00:00
'
sudo cp /opt/imjang/deploy/systemd/imjang-etl@.service /etc/systemd/system/
while IFS='|' read -r job cal; do
  [ -z "$job" ] && continue
  sudo tee "/etc/systemd/system/imjang-etl@${job}.timer" >/dev/null <<EOF
[Unit]
Description=Timer for imjang ETL ${job}

[Timer]
OnCalendar=${cal}
Persistent=true

[Install]
WantedBy=timers.target
EOF
  sudo systemctl enable "imjang-etl@${job}.timer"
done <<< "$JOBS"
sudo systemctl daemon-reload
# backfill-loop(시간당)은 백필 진행 중일 때만 활성 — 기본 비활성
```

- [ ] **Step 3: 설치 + 타이머 목록 확인(아직 시작은 컷오버에서)**

Run:
```bash
oci 'cd /opt/imjang && chmod +x deploy/systemd/install-timers.sh && deploy/systemd/install-timers.sh && systemctl list-timers "imjang-etl@*" --all'
```
Expected: 7개 타이머가 enabled로 표시(NEXT 실행 시각 UTC). **이 시점에 timer는 enable이나 컷오버 전까지 실제 잡은 GH Actions가 계속 담당** → 중복 방지 위해 컷오버 전엔 `systemctl stop`으로 멈춰두거나, 컷오버 태스크에서 start.

- [ ] **Step 4: Commit**

```bash
git add deploy/systemd/imjang-etl@.service deploy/systemd/install-timers.sh
git commit -m "feat(etl): systemd 템플릿 유닛 + 타이머 설치 스크립트(UTC)"
```

### Task 4.3: 수동 트리거 잡 문서화(레퍼런스)

- [ ] **Step 1: 수동 잡 실행법 확인**

`generate-guides`·`generate-board-topic`·`regeocode-properties`·`restructure-articles`·`warm-hub-cache`는 원래 workflow_dispatch(수동). 온박스에서:

```bash
# 예: 가이드 생성
oci 'cd /opt/imjang && deploy/run-etl.sh 2>/dev/null; docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production run --rm etl pnpm tsx scripts/generate-guides.ts --only=<slug>'
```
Expected: 참고용 — 별도 커밋 없음. run-etl.sh에 필요 시 케이스 추가.

---

# Phase 5 — 배포 파이프라인 + 백업

### Task 5.1: 배포 스크립트

**Files:**
- Create: `deploy/deploy.sh`

- [ ] **Step 1: `deploy/deploy.sh` 작성**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/imjang
git fetch origin main
git reset --hard origin/main
DC="docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production"
# build_db_url secret은 BUILD_DATABASE_URL 환경변수에서 주입 → 명시적 export(‑‑env-file만으론 secrets.environment 미해결 가능)
set -a; . <(grep -E '^BUILD_DATABASE_URL=' deploy/.env.production); set +a
# 순서: etl 빌드(DB 불필요) → db 기동 → 마이그레이션(스키마) → web 빌드(prerender가 127.0.0.1:5432 접근) → 롤아웃
$DC build etl
$DC up -d db --wait
$DC run --rm etl pnpm prisma migrate deploy
$DC build web
$DC up -d web cloudflared
# systemd 유닛 동기화
sudo cp deploy/systemd/imjang-etl@.service /etc/systemd/system/
sudo systemctl daemon-reload
# 정리
docker image prune -f
echo "deploy done: $(git rev-parse --short HEAD)"
```

- [ ] **Step 2: 실행권한 + 수동 배포 1회 검증**

Run: `oci 'cd /opt/imjang && chmod +x deploy/deploy.sh && deploy/deploy.sh'`
Expected: `deploy done: <sha>` + web·cloudflared 재기동.

- [ ] **Step 3: Commit**

```bash
git add deploy/deploy.sh
git commit -m "feat(deploy): 온박스 배포 스크립트(build→migrate→up→unit sync)"
```

### Task 5.2: GitHub Actions 배포 워크플로

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: repo secrets `OCI_HOST`, `OCI_USER`, `OCI_SSH_KEY`.

- [ ] **Step 1: repo secrets 등록**

Run(로컬):
```bash
gh secret set OCI_HOST -b "161.33.160.159"
gh secret set OCI_USER -b "ubuntu"
gh secret set OCI_SSH_KEY < /Users/jiyeonjeong/oci-key/ssh-key-2026-06-23.key
```
Expected: 세 secret 등록(`gh secret list`).

- [ ] **Step 2: `.github/workflows/deploy.yml` 작성**

```yaml
name: deploy
on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: SSH deploy
        uses: appleboy/ssh-action@v1.2.0
        with:
          host: ${{ secrets.OCI_HOST }}
          username: ${{ secrets.OCI_USER }}
          key: ${{ secrets.OCI_SSH_KEY }}
          command_timeout: 30m
          script: |
            cd /opt/imjang
            ./deploy/deploy.sh
```

- [ ] **Step 3: 워크플로 문법 확인 + 수동 트리거 테스트**

Run(로컬, 커밋·푸시 후):
```bash
git add .github/workflows/deploy.yml
git commit -m "feat(deploy): Actions→SSH 온박스 배포 워크플로"
git push origin main
gh workflow run deploy.yml && sleep 10 && gh run list --workflow=deploy.yml --limit 1
```
Expected: 워크플로 성공(박스에서 deploy.sh 실행). **주의: 이 시점부터 push→main이 박스에 배포됨.**

### Task 5.3: 백업(온박스 → OCI Object Storage)

**Files:**
- Create: `scripts/backup/pg-backup.sh`
- Create: `deploy/systemd/imjang-backup.service`
- Create: `deploy/systemd/imjang-backup.timer`

- [ ] **Step 1: OCI Object Storage 준비(수동)**

OCI 콘솔 → Object Storage → 버킷 `imjang-backups` 생성. 박스 인증은 **인스턴스 프린시펄** 권장: Dynamic Group(이 인스턴스) + Policy(`allow dynamic-group ... to manage objects in compartment ... where target.bucket.name='imjang-backups'`). OCI CLI는 `oci setup instance-principal` 불필요(자동). 검증: `oci 'oci os ns get --auth instance_principal'`.

- [ ] **Step 2: `scripts/backup/pg-backup.sh` 작성**

```bash
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date -u +%Y%m%d-%H%M%S)
FILE="/tmp/imjang-${STAMP}.sql.gz"
docker exec imjang-db-1 pg_dump -U imjang imjang_on | gzip > "$FILE"
# OCI Object Storage 업로드(인스턴스 프린시펄)
oci os object put --auth instance_principal -bn imjang-backups \
  --file "$FILE" --name "daily/imjang-${STAMP}.sql.gz" --force
rm -f "$FILE"
# 로컬 임시 정리 완료; 버킷 수명주기 규칙으로 보존(예: 30일) 설정 권장
echo "backup uploaded: imjang-${STAMP}.sql.gz"
```

- [ ] **Step 3: 백업 유닛 작성**

`deploy/systemd/imjang-backup.service`:

```ini
[Unit]
Description=imjang nightly pg backup
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
User=ubuntu
ExecStart=/opt/imjang/scripts/backup/pg-backup.sh
```

`deploy/systemd/imjang-backup.timer`:

```ini
[Unit]
Description=Timer for imjang nightly backup

[Timer]
OnCalendar=*-*-* 19:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

- [ ] **Step 4: 설치 + 1회 수동 실행 검증**

Run:
```bash
oci 'cd /opt/imjang && chmod +x scripts/backup/pg-backup.sh && sudo cp deploy/systemd/imjang-backup.* /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now imjang-backup.timer && sudo systemctl start imjang-backup.service && journalctl -u imjang-backup.service --no-pager | tail -5'
```
Expected: `backup uploaded: ...`. 버킷에 객체 존재(`oci 'oci os object list --auth instance_principal -bn imjang-backups'`).

- [ ] **Step 5: Commit**

```bash
git add scripts/backup/pg-backup.sh deploy/systemd/imjang-backup.service deploy/systemd/imjang-backup.timer
git commit -m "feat(backup): 온박스 nightly pg_dump → OCI Object Storage"
```

---

# Phase 6 — 컷오버 + 안정화

**유지보수 창(수십분~수시간) 안에서 진행.** 사전에 공지.

### Task 6.1: 프리플라이트 스모크

- [ ] **Step 1: 최신 코드로 박스 배포**

Run: `oci 'cd /opt/imjang && deploy/deploy.sh'`
Expected: 최신 main 배포 성공.

- [ ] **Step 2: quick tunnel로 전체 라우트 스모크(빈 DB 아님 — 곧 데이터 적재)**

Task 2.1 방식으로 임시 URL 스모크. OG 이미지·`next/image`(예: 상세페이지 썸네일)·`middleware.ts`(admin 보호 라우트 401) 포함.
Expected: 주요 라우트 200, admin 라우트는 인증 요구.

### Task 6.2: 유지보수 창 진입 — GH ETL 중지

- [ ] **Step 1: 스케줄 워크플로 비활성**

Run(로컬):
```bash
for w in ingest-transactions-daily backfill-transactions-loop ingest-subscriptions ingest-loan ingest-jeonse-guarantee ingest-amenities generate-board-posts seed-regions pg-dump-backup; do gh workflow disable "$w.yml" 2>/dev/null || true; done
gh workflow list --all | grep -iE "disabled|ingest|backfill|generate|seed|dump" | head
```
Expected: 해당 워크플로 disabled. (앱 쓰기도 이 시점 이후 최소화.)

### Task 6.3: 최종 데이터 복사

- [ ] **Step 1: 스키마 최신 확인**

Run: `oci 'cd /opt/imjang && docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production run --rm etl pnpm prisma migrate status'`
Expected: `Database schema is up to date`.

- [ ] **Step 2: 덤프 → 전송 → 로드 → 검증**

Run(로컬):
```bash
scripts/db/dump-supabase.sh /tmp/final.dump
scp -i "/Users/jiyeonjeong/oci-key/ssh-key-2026-06-23.key" /tmp/final.dump ubuntu@161.33.160.159:/tmp/
oci 'cd /opt/imjang && scripts/db/load-oci.sh /tmp/final.dump'
# 검증
./node_modules/.bin/dotenv -e .env.local -- sh -c 'PGSSLMODE=require scripts/db/verify-counts.sh "$DIRECT_URL"' > /tmp/src.csv
oci 'cd /opt/imjang && scripts/db/verify-counts.sh "postgresql://imjang:$(grep ^POSTGRES_PASSWORD deploy/.env.production|cut -d= -f2-)@127.0.0.1:5432/imjang_on"' > /tmp/dst.csv
diff /tmp/src.csv /tmp/dst.csv && echo "MATCH"
```
Expected: `MATCH`. 시퀀스도 Task 3.3 Step 4로 재확인.

### Task 6.4: DNS 전환 + 라이브 확인

- [ ] **Step 1: NS를 Cloudflare로 변경(레지스트라)**

.co.kr 등록기관 관리콘솔에서 네임서버를 Cloudflare가 안내한 2개로 변경. (Vercel `ns1/ns2.vercel-dns.com` → Cloudflare NS.)
Expected: CF 대시보드가 "Active"로 전환(전파 수분~수시간, TTL 의존).

- [ ] **Step 2: 라이브 서빙 확인**

Run(로컬, 전파 후):
```bash
dig +short NS imjangon.co.kr           # Cloudflare NS
for p in / /apt /medical/hospital /robots.txt /sitemap.xml; do curl -sS -o /dev/null -w "$p %{http_code}\n" "https://imjangon.co.kr$p"; done
curl -sSI https://imjangon.co.kr | grep -i "server\|cf-ray"   # cf-ray = Cloudflare 경유
```
Expected: NS=Cloudflare, 라우트 200(데이터 있음), `cf-ray` 헤더 존재(엣지 경유), origin은 OCI.

- [ ] **Step 3: `/api/staticmap` 엣지 캐시 규칙(선택, 비용 방어)**

CF → Caching → Cache Rules: `URI Path starts with /api/staticmap` → Eligible for cache, Edge TTL 长. (스크래퍼 origin 미도달.)

### Task 6.5: ETL 전환 + 재검증

- [ ] **Step 1: 온박스 타이머 활성화**

Run:
```bash
oci 'sudo systemctl start "imjang-etl@transactions-daily.timer" "imjang-etl@subscriptions.timer" "imjang-etl@loan.timer" "imjang-etl@jeonse-guarantee.timer" "imjang-etl@amenities.timer" "imjang-etl@board-posts.timer" "imjang-etl@seed-regions.timer" && systemctl list-timers "imjang-etl@*"'
```
Expected: 타이머 활성(NEXT 시각 표시).

- [ ] **Step 2: 대표 잡 1회 수동 실행 + revalidate 확인**

Run:
```bash
oci 'cd /opt/imjang && deploy/run-etl.sh transactions-daily'
```
Expected: 완료, DB 최신화, revalidate 200(경고 없음). `journalctl`로 확인.

- [ ] **Step 3: 검색·광고 인증 재확인**

- GSC(Search Console): 도메인/URL 속성 소유확인 유지 여부 확인. 깨졌으면 HTML 파일(`public/google*.html`) 또는 메타 재확인.
- 네이버 서치어드바이저: 사이트 소유확인 유지.
- AdSense: `ads.txt`·사이트 상태 정상.
Expected: 3개 모두 verified 유지. (apex TXT 없었으므로 대개 파일/메타 기반이라 NS 전환 영향 없음 — 그래도 확인.)

- [ ] **Step 4: Sentry 확인**

강제 에러 1건 유발 또는 로그 확인 → Sentry에 이벤트 도착.
Expected: 이벤트 수신(DSN 정상). 안 오면 `SENTRY_DSN`·`NEXT_PUBLIC_SENTRY_DSN` 박스 env 확인.

### Task 6.6: 모니터링 + 정리

- [ ] **Step 1: 24~72h 관측**

Sentry 에러율, 업타임(UptimeRobot/CF Health Check), 응답시간, 디스크(`df -h`), 컨테이너(`docker compose ps`). ETL 첫 스케줄 성공 확인(journalctl).
Expected: 회귀 없음, ETL 정상 실행.

- [ ] **Step 2: Vercel/Supabase 정리(안정 확인 후)**

- Vercel: 프로젝트 Production 배포 일시중지(도메인은 이미 CF). 수일 롤백 대비 후 삭제.
- Supabase: **최소 수일 유지**(롤백 소스). 안정 확인 후 프로젝트 폐기.
- GH: 비활성한 ETL 워크플로 파일 삭제 커밋(또는 유지). `pg-dump-backup.yml` 삭제(온박스 대체).
Expected: 반복 비용 $0.

- [ ] **Step 3: 정리 커밋**

```bash
git rm .github/workflows/pg-dump-backup.yml
# (선택) 온박스로 이전된 스케줄 워크플로 삭제 또는 schedule 트리거만 제거
git commit -m "chore(etl): GH 스케줄 ETL 온박스 이전 완료 — pg-dump-backup 워크플로 폐기"
git push origin main
```

---

## 완료 기준 (스펙 §8 대응)

- [ ] `imjangon.co.kr` OCI origin·CF 경유 서빙(주요 라우트 200, ISR 동작, `cf-ray` 존재)
- [ ] Supabase 접속 0(앱·ETL 모두 OCI DB)
- [ ] 모든 스케줄 ETL이 박스 systemd 타이머로 성공, GH 스케줄 비활성
- [ ] push→main 배포 파이프라인(마이그레이션 포함) 동작
- [ ] nightly 백업이 OCI Object Storage 적재
- [ ] 인바운드 포트 SSH뿐, origin IP 비노출(cf-ray로 확인)
- [ ] Vercel·Supabase 반복 비용 $0
- [ ] Sentry 회귀 없음
