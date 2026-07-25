#!/usr/bin/env bash
# 온박스 디스크 유지보수 systemd 설치(1회). 박스 TZ=UTC.
#   guard  : 6시간마다 폴링(00/06/12/18 UTC) — 디스크 압박 시에만 무중단 정리.
#   weekly : 매주 일 18:00 UTC(= 월 03:00 KST, 저트래픽) — 정리 + 필요시 web 리셋.
set -euo pipefail
sudo cp /opt/imjang/deploy/systemd/imjang-maintenance@.service /etc/systemd/system/

sudo tee /etc/systemd/system/imjang-maintenance@guard.timer >/dev/null <<'EOF'
[Unit]
Description=Timer for imjang maintenance guard

[Timer]
OnCalendar=*-*-* 00/6:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

sudo tee /etc/systemd/system/imjang-maintenance@weekly.timer >/dev/null <<'EOF'
[Unit]
Description=Timer for imjang maintenance weekly

[Timer]
OnCalendar=Sun *-*-* 18:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now imjang-maintenance@guard.timer imjang-maintenance@weekly.timer
echo "=== 설치된 유지보수 타이머 ==="
systemctl list-timers "imjang-maintenance@*" --all --no-pager
