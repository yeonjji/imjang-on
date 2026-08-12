#!/usr/bin/env bash
# 온박스 ETL 디스패처 — systemd 타이머가 잡 키로 호출. localhost DB(compose network)에 적재.
# 워크플로 커맨드 이식(2026-07-22 실측): transactions runner는 인자 없으면 api=all/mode=daily.
set -uo pipefail
cd /opt/imjang
DC="docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production run --rm etl"

case "${1:?job key required}" in
  transactions-daily)
    $DC pnpm ingest:run
    $DC pnpm tsx scripts/dashboard/refresh-snapshot.ts
    $DC pnpm tsx scripts/guide/refresh-data-snapshot.ts
    $DC pnpm tsx scripts/subscription/refresh-median-snapshot.ts
    ;;
  subscriptions)
    for s in apt urbty remndr pblpvt opt lh; do
      $DC pnpm tsx scripts/ingest/subscriptions/runner.ts --source="$s" || echo "WARN: subscriptions $s failed"
    done
    ;;
  amenities)
    # school=NEIS_API_KEY / childcare=CHILDCARE_API_KEY 필요(미설정 시 해당 소스만 실패, 나머지 정상)
    for s in ev-charger traditional-market store park school childcare parking; do
      $DC pnpm tsx scripts/ingest/amenities/runner.ts --source="$s" || echo "WARN: amenities $s failed"
    done
    ;;
  loan)             $DC pnpm tsx scripts/ingest/loan/runner.ts ;;
  jeonse-guarantee) $DC pnpm tsx scripts/ingest/jeonse-guarantee/runner.ts ;;
  board-posts)      $DC pnpm tsx scripts/ingest/posts/runner.ts ;;
  seed-regions)     $DC pnpm tsx scripts/ingest/regions/seed-from-api.ts ;;
  subway)           $DC pnpm ingest:subway ;;  # 레일포털에서 자동 다운로드→적재
  *) echo "unknown job: $1" >&2; exit 2 ;;
esac
