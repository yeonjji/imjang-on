#!/usr/bin/env bash
# GitHub Actions push-to-deploy 대상. authorized_keys의 forced-command로 실행되며,
# SSH 클라이언트가 보낸 명령은 무시되고 이 스크립트만 실행된다(유출 시 배포 외 동작 차단).
# main pull → web/etl 이미지 재빌드 → web 재시작.
set -euo pipefail
cd /opt/imjang
echo "[deploy] $(date -u '+%F %T UTC') start @ $(git rev-parse --short HEAD)"
git checkout main -q
git pull --ff-only origin main
echo "[deploy] pulled @ $(git rev-parse --short HEAD)"
DC="docker compose -f deploy/docker-compose.yml --profile tools --env-file deploy/.env.production"
$DC build web etl
$DC up -d web
docker image prune -f >/dev/null 2>&1 || true
echo "[deploy] done — web: $(docker ps --filter name=imjang-web-1 --format '{{.Status}}')"
