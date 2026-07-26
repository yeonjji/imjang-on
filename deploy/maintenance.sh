#!/usr/bin/env bash
# 온박스 디스크 유지보수 — 루트디스크(45G) 100% 포화 재발 방지(2026-07-24/25 사고).
# 두 원인: (1) docker build cache 누적, (2) 웹 .next 런타임 캐시가 컨테이너 임시 레이어에 무한 축적
#   - .next/cache/fetch-cache: 서버컴포넌트 fetch() 캐시(크롤러×공공API로 폭증). 무중단 삭제 가능(미스 시 재생성).
#   - .next/server/app: ISR 전체경로 캐시(.html/.rsc/.meta). 실행 컨테이너에서 안전삭제 불가 → 이미지에서 재생성(recreate).
# 배포(remote-deploy.sh)가 배포시점 정리 + web recreate를 하지만, 배포 공백(예: 26h)엔 런타임 캐시가 무방비 → 시간기반 안전망.
# systemd: imjang-maintenance@guard(1h 폴링), imjang-maintenance@weekly(저트래픽 주간).
set -uo pipefail
cd /opt/imjang

WEB=imjang-web-1
DC="docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production"
# 임계치(테스트 시 env로 오버라이드 가능)
GUARD_WARN=${GUARD_WARN:-80}      # guard: 이 이상이면 무중단 정리
GUARD_CRIT=${GUARD_CRIT:-90}      # guard: 정리 후에도 이 이상이면 web recreate(최후수단)
WEEKLY_RECREATE=${WEEKLY_RECREATE:-60}  # weekly: 이 이상이면 ISR 레이어 리셋
BUILD_CACHE_MAX=${BUILD_CACHE_MAX:-3GB} # build cache 보관 상한(초과분은 LRU로 회수)

disk_pct() { df --output=pcent / | tail -1 | tr -dc '0-9'; }
log() { echo "[maint] $(date -u '+%F %T UTC') $*"; }

# 종료코드 계약: 정리에 성공하면 0, 실제 조치가 실패했을 때만 1.
# (이전엔 분기 마지막이 `[ ... ] && recreate_web`이라 recreate가 불필요한 정상 경로에서도
#  테스트 실패값 1이 그대로 스크립트 종료코드가 됐다 → systemd가 매번 unit failed로 기록,
#  진짜 실패와 구분 불가. 아래 rc로 성공/실패를 명시적으로 분리한다.)
rc=0

# 무중단 정리: dangling 이미지 + 상한 초과 build cache + 웹 .next/cache(fetch-cache 등, 재생성 가능).
cleanup_safe() {
  docker image prune -f >/dev/null 2>&1 || true
  # build cache는 나이(until=Nh)가 아니라 용량으로 제한한다. 하루 여러 번 배포하는 날엔
  # 새 캐시가 필터에 걸리지 않아 회수보다 축적이 빨랐고, 그게 45G 포화의 한 축이었다.
  # 상한을 두면 최근 사용 레이어(pnpm install 등)는 남고 초과분만 LRU로 밀려난다.
  docker builder prune -f --max-used-space="$BUILD_CACHE_MAX" >/dev/null 2>&1 \
    || log "WARN: builder prune 실패 — build cache 미회수"
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
    return 1
  fi
}

case "${1:?mode required: weekly|guard}" in
  weekly)
    log "weekly start (disk $(disk_pct)%)"
    cleanup_safe
    if [ "$(disk_pct)" -ge "$WEEKLY_RECREATE" ]; then
      recreate_web || rc=1
    fi
    log "weekly done (disk $(disk_pct)%)"
    ;;
  guard)
    pct=$(disk_pct)
    if [ "$pct" -ge "$GUARD_WARN" ]; then
      log "guard: disk ${pct}% >= ${GUARD_WARN}% -> cleanup"
      cleanup_safe
      if [ "$(disk_pct)" -ge "$GUARD_CRIT" ]; then
        recreate_web || rc=1
      fi
    fi
    # WARN 미만이면 조용히 종료(로그 노이즈 방지)
    ;;
  *) echo "unknown mode: $1" >&2; exit 2 ;;
esac
exit "$rc"
