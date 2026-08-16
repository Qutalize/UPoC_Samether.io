#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE="$ROOT/infra/.deploy-state"

if [ ! -f "$STATE" ]; then
  echo "No deploy state found. Nothing to destroy." >&2
  exit 0
fi
source "$STATE"

echo "This will delete:"
echo "  Instance:   ${INSTANCE_ID:-<none>}"
echo "  SG:         ${SG_ID:-<none>}"
echo "  Elastic IP: ${EIP:-<none>} (AllocationId ${ALLOC_ID:-<none>})"
read -rp "Type 'yes' to proceed: " confirm
[ "$confirm" = "yes" ] || exit 1

if [ -n "${INSTANCE_ID:-}" ] && [ "$INSTANCE_ID" != "None" ]; then
  echo "==> Terminating instance"
  aws ec2 terminate-instances --instance-ids "$INSTANCE_ID" >/dev/null
  aws ec2 wait instance-terminated --instance-ids "$INSTANCE_ID"
fi

if [ -n "${ALLOC_ID:-}" ] && [ "$ALLOC_ID" != "None" ]; then
  echo "==> Releasing EIP"
  aws ec2 release-address --allocation-id "$ALLOC_ID" || true
fi

if [ -n "${SG_ID:-}" ] && [ "$SG_ID" != "None" ]; then
  echo "==> Deleting SG"
  # SGs cannot be deleted until the instance is fully gone; the wait above covers that.
  aws ec2 delete-security-group --group-id "$SG_ID" || true
fi

rm -f "$STATE"
echo "==> Done."
