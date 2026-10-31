#!/usr/bin/env bash
# 온박스 ETL 디스패처 — systemd 타이머가 잡 키로 호출. localhost DB(compose network)에 적재.
# 워크플로 커맨드 이식(2026-07-22 실측): transactions runner는 인자 없으면 api=all/mode=daily.
set -uo pipefail
cd /opt/imjang
# 거래 수집(daily·recheck)은 같은 시군구의 매물을 동시에 만들지 않도록 한 번에 하나만(최대 3시간 대기)
TX_LOCK="flock -w 10800 /tmp/imjang-etl-transactions.lock"
DC="docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production run --rm etl"

case "${1:?job key required}" in
  transactions-daily)
    $TX_LOCK $DC pnpm ingest:run
    $DC pnpm tsx scripts/dashboard/refresh-snapshot.ts
    $DC pnpm tsx scripts/guide/refresh-data-snapshot.ts
    $DC pnpm tsx scripts/subscription/refresh-median-snapshot.ts
    ;;
  subscriptions)
    for s in apt urbty remndr pblpvt opt lh; do
      $DC pnpm tsx scripts/ingest/subscriptions/runner.ts --source="$s" || echo "WARN: subscriptions $s failed"
    done
    # 청약 결과(경쟁률·가점·특별공급): 공고 수집 뒤, 30분 예산
    $DC pnpm tsx scripts/ingest/subscription-results/runner.ts || echo "WARN: subscription-results failed"
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
  apt-maintenance-cost) $DC pnpm tsx scripts/ingest/apt-maintenance-cost/runner.ts ;;  # 일일 한도까지 진행, 다음 날 이어 받음
  building-register) $DC pnpm tsx scripts/ingest/building-register/runner.ts ;;  # 100분 예산, 다음 날 이어 받음
  hospital-nemc)     $DC pnpm tsx scripts/ingest/hospital-nemc/runner.ts ;;  # 주 1회 전국 진료시간
  property-aggregates) $DC pnpm tsx scripts/ingest/property-aggregates/runner.ts --mode=daily ;;  # 12개월 경계 + 재집계 대기열 비우기(S2)
  # 거래 재정합(S3): 지난 달들을 원천과 다시 맞춘다(해제·정정·지연 신고). 이번 달·전달은 transactions-daily가 맡는다.
  # 매일 상한(--limit)만큼만 → 2~6개월 전은 7일, 7~12개월 전은 30일에 한 바퀴(6 API × 약 256 시군구 기준 7,680·9,216 범위).
  transactions-recheck)
    # 앞 단계가 실패해도 뒤 단계는 돌리되, 실패는 잡 종료 코드로 남긴다.
    rc=0
    $TX_LOCK $DC pnpm ingest:run --mode=recheck --offsets=2-6 --window-days=7 --limit=1200 || rc=$?
    $TX_LOCK $DC pnpm ingest:run --mode=recheck --offsets=7-12 --window-days=30 --limit=350 || rc=$?
    exit $rc
    ;;
  property-aggregate-check) $DC pnpm tsx scripts/ingest/property-aggregates/runner.ts --mode=check ;;  # 주간 차이 점검(dry-run, S5 전까지 대기열에 안 넣음)
  content-score-daily)  $DC pnpm tsx scripts/ingest/content-score/runner.ts --mode=daily ;;   # 목록 정렬 점수(자체 정보)
  content-score-weekly) $DC pnpm tsx scripts/ingest/content-score/runner.ts --mode=weekly ;;  # 주변·비교 정보(실제 주기는 월 1회 — 잡 키만 weekly), 청크 사이 쉬기
  *) echo "unknown job: $1" >&2; exit 2 ;;
esac
