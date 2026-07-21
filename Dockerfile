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
