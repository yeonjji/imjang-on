#!/usr/bin/env bash
# GitHub Actions push-to-deploy 대상. authorized_keys의 forced-command로 실행되며,
# SSH 클라이언트가 보낸 명령은 무시되고 이 스크립트만 실행된다(유출 시 배포 외 동작 차단).
# main pull → etl 빌드 → prisma migrate deploy → web 빌드 → web 재시작.
set -euo pipefail
cd /opt/imjang
echo "[deploy] $(date -u '+%F %T UTC') start @ $(git rev-parse --short HEAD)"
git checkout main -q
git pull --ff-only origin main
echo "[deploy] pulled @ $(git rev-parse --short HEAD)"
DC="docker compose -f deploy/docker-compose.yml --profile tools --env-file deploy/.env.production"
# 1) etl 이미지 빌드(새 마이그레이션 SQL 포함) → migrate 적용.
#    실패 시 set -e로 여기서 중단 → web은 옛 버전 유지(사이트 무중단, 배포만 실패).
$DC build etl
echo "[deploy] prisma migrate deploy..."
$DC run --rm etl pnpm prisma migrate deploy
# 2) web 빌드(마이그레이션된 스키마로 prerender) → 재시작.
$DC build web
$DC up -d web
docker image prune -f >/dev/null 2>&1 || true
# 빌드캐시 누적으로 45G 디스크가 100%까지 참(2026-07-24 사고) → builder cache도 정리한다.
# 48h 이내 캐시는 남겨 빌드속도(pnpm install 등 레이어 재사용)를 보존한다.
docker builder prune -f --filter until=48h >/dev/null 2>&1 || true
echo "[deploy] done — web: $(docker ps --filter name=imjang-web-1 --format '{{.Status}}')"
