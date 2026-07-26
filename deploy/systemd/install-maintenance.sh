#!/usr/bin/env bash
# 온박스 디스크 유지보수 systemd 설치(1회). 박스 TZ=UTC.
#   guard  : 매시 폴링 — 디스크 압박 시에만 무중단 정리.
#            (6h 폴링은 80%→100%까지 9G 여유를 한 주기 안에 넘길 수 있었다. 실제로
#             2026-07-25 포화 사고가 폴링 공백에서 났다. 미발동 시 비용이 사실상 0이라
#             주기를 짧게 가져간다.)
#   weekly : 매주 일 18:00 UTC(= 월 03:00 KST, 저트래픽) — 정리 + 필요시 web 리셋.
set -euo pipefail
sudo cp /opt/imjang/deploy/systemd/imjang-maintenance@.service /etc/systemd/system/

sudo tee /etc/systemd/system/imjang-maintenance@guard.timer >/dev/null <<'EOF'
[Unit]
Description=Timer for imjang maintenance guard

[Timer]
OnCalendar=hourly
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
