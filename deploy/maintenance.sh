#!/usr/bin/env bash
# 온박스 디스크 유지보수 — 루트디스크(45G) 100% 포화 재발 방지(2026-07-24/25 사고).
# 두 원인: (1) docker build cache 누적, (2) 웹 .next 런타임 캐시가 컨테이너 임시 레이어에 무한 축적
#   - .next/cache/fetch-cache: 서버컴포넌트 fetch() 캐시(크롤러×공공API로 폭증). 무중단 삭제 가능(미스 시 재생성).
#   - .next/server/app: ISR 전체경로 캐시(.html/.rsc/.meta). 실행 컨테이너에서 안전삭제 불가 → 이미지에서 재생성(recreate).
# 배포(remote-deploy.sh)가 배포시점 정리 + web recreate를 하지만, 배포 공백(예: 26h)엔 런타임 캐시가 무방비 → 시간기반 안전망.
# systemd: imjang-maintenance@guard(6h 폴링), imjang-maintenance@weekly(저트래픽 주간).
set -uo pipefail
cd /opt/imjang

WEB=imjang-web-1
DC="docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production"
# 임계치(테스트 시 env로 오버라이드 가능)
GUARD_WARN=${GUARD_WARN:-80}      # guard: 이 이상이면 무중단 정리
GUARD_CRIT=${GUARD_CRIT:-90}      # guard: 정리 후에도 이 이상이면 web recreate(최후수단)
WEEKLY_RECREATE=${WEEKLY_RECREATE:-60}  # weekly: 이 이상이면 ISR 레이어 리셋

disk_pct() { df --output=pcent / | tail -1 | tr -dc '0-9'; }
log() { echo "[maint] $(date -u '+%F %T UTC') $*"; }

# 무중단 정리: dangling 이미지 + 24h 초과 build cache + 웹 .next/cache(fetch-cache 등, 재생성 가능).
cleanup_safe() {
  docker image prune -f >/dev/null 2>&1 || true
  docker builder prune -f --filter until=24h >/dev/null 2>&1 || true
  docker exec "$WEB" sh -c 'find /app/.next/cache -type f -delete' 2>/dev/null || true
  log "safe-cleanup done (disk now $(disk_pct)%)"
}

# ISR 전체경로 캐시 리셋: 현재 이미지로 web 컨테이너 재생성(=배포와 동일 메커니즘, --no-build). 새 컨테이너 부팅 동안 수초 502 가능.
recreate_web() {
  log "recreating web to reset ISR cache layer (brief blip)..."
  if $DC up -d --force-recreate --no-build web >/dev/null 2>&1; then
    log "web recreated ($(docker ps --filter name="$WEB" --format '{{.Status}}'))"
  else
    log "recreate FAILED — web left as-is"
  fi
}

case "${1:?mode required: weekly|guard}" in
  weekly)
    log "weekly start (disk $(disk_pct)%)"
    cleanup_safe
    [ "$(disk_pct)" -ge "$WEEKLY_RECREATE" ] && recreate_web
    log "weekly done (disk $(disk_pct)%)"
    ;;
  guard)
    pct=$(disk_pct)
    if [ "$pct" -ge "$GUARD_WARN" ]; then
      log "guard: disk ${pct}% >= ${GUARD_WARN}% -> cleanup"
      cleanup_safe
      [ "$(disk_pct)" -ge "$GUARD_CRIT" ] && recreate_web
    fi
    # WARN 미만이면 조용히 종료(로그 노이즈 방지)
    ;;
  *) echo "unknown mode: $1" >&2; exit 2 ;;
esac
