#!/usr/bin/env bash
set -euxo pipefail

dnf -y update || true

# Create systemd unit. The binary will be scp'd to /home/ec2-user later.
cat >/etc/systemd/system/samezario.service <<'UNIT'
[Unit]
Description=Samezario game server
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user
ExecStart=/home/ec2-user/samezario-server -addr :80
Restart=always
RestartSec=2
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
# Enabled now but won't start until binary is in place (deploy.sh handles that).
systemctl enable samezario.service
