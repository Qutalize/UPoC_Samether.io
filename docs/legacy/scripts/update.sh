#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE="$ROOT/infra/.deploy-state"
KEY_FILE="$HOME/.ssh/samezario-key.pem"

if [ ! -f "$STATE" ]; then
  echo "No deploy state found. Run infra/deploy.sh first." >&2
  exit 1
fi
source "$STATE"

if [ -z "${EIP:-}" ]; then
  echo "EIP missing from state file." >&2
  exit 1
fi

echo "==> Building binary"
( cd "$ROOT" && ./server/build.sh )

echo "==> Uploading"
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no \
  "$ROOT/server/samezario-server" ec2-user@"$EIP":/home/ec2-user/samezario-server

echo "==> Restarting service"
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no ec2-user@"$EIP" \
  'sudo systemctl restart samezario && sudo systemctl is-active samezario'

echo "==> Done. http://$EIP/"
