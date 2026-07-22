#!/usr/bin/env bash
# 온박스 ETL systemd 타이머 설치. 박스 TZ=UTC라 OnCalendar는 원래 GH cron(UTC)과 동일 시각.
# 잡키|OnCalendar(UTC)  (원 cron 매핑)
set -euo pipefail
JOBS='
transactions-daily|*-*-* 15,19:00:00
subscriptions|*-*-* 18:30:00
loan|*-*-01 20:00:00
jeonse-guarantee|*-*-02 20:00:00
amenities|*-*-01 02:00:00
board-posts|Mon *-*-* 02:00:00
seed-regions|*-04-05 18:00:00
subway|*-01,04,07,10-01 03:00:00
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
  sudo systemctl enable "imjang-etl@${job}.timer" >/dev/null 2>&1
done <<< "$JOBS"
sudo systemctl daemon-reload
sudo systemctl start imjang-etl@transactions-daily.timer imjang-etl@subscriptions.timer imjang-etl@loan.timer imjang-etl@jeonse-guarantee.timer imjang-etl@amenities.timer imjang-etl@board-posts.timer imjang-etl@seed-regions.timer imjang-etl@subway.timer
echo "=== 설치된 타이머 ==="
systemctl list-timers "imjang-etl@*" --all --no-pager
