#!/usr/bin/env bash
set -euo pipefail

# deploy.sh — creates all AWS resources and deploys the binary the first time.
# Idempotent reruns will skip already-existing resources.
#
# Writes resource IDs to infra/.deploy-state so update.sh and destroy.sh can find them.
#
# Requirements: aws cli configured, jq, ssh, scp.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE="$ROOT/infra/.deploy-state"
KEY_NAME="samezario-key"
KEY_FILE="$HOME/.ssh/${KEY_NAME}.pem"
SG_NAME="samezario-sg"
TAG="samezario"
REGION="${AWS_REGION:-ap-northeast-1}"

# Load existing state if any
INSTANCE_ID=""
SG_ID=""
ALLOC_ID=""
EIP=""
[ -f "$STATE" ] && source "$STATE"

save_state() {
  cat >"$STATE" <<EOF
INSTANCE_ID="$INSTANCE_ID"
SG_ID="$SG_ID"
ALLOC_ID="$ALLOC_ID"
EIP="$EIP"
EOF
}

echo "==> Region: $REGION"
export AWS_DEFAULT_REGION="$REGION"

# 1. Key pair
if [ ! -f "$KEY_FILE" ]; then
  echo "==> Creating key pair $KEY_NAME"
  aws ec2 create-key-pair --key-name "$KEY_NAME" \
    --query 'KeyMaterial' --output text > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
else
  echo "==> Key file exists: $KEY_FILE (skipping create)"
fi

# 2. Security group
if [ -z "$SG_ID" ]; then
  EXISTING_SG=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=$SG_NAME" \
    --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || true)
  if [ -n "$EXISTING_SG" ] && [ "$EXISTING_SG" != "None" ]; then
    SG_ID="$EXISTING_SG"
    echo "==> Using existing SG: $SG_ID"
  else
    echo "==> Creating SG $SG_NAME"
    SG_ID=$(aws ec2 create-security-group --group-name "$SG_NAME" \
      --description "samezario game server SG" \
      --query 'GroupId' --output text)
    MY_IP=$(curl -sf https://checkip.amazonaws.com | tr -d ' \n')
    aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
      --protocol tcp --port 22 --cidr "${MY_IP}/32"
    aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
      --protocol tcp --port 80 --cidr 0.0.0.0/0
  fi
fi

# 3. EC2 instance
if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
  echo "==> Finding latest AL2023 AMI"
  AMI_ID=$(aws ec2 describe-images \
    --owners amazon \
    --filters "Name=name,Values=al2023-ami-2023*-x86_64" \
              "Name=state,Values=available" \
    --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
    --output text)
  echo "==> Using AMI $AMI_ID"

  echo "==> Launching t3.small"
  INSTANCE_ID=$(aws ec2 run-instances \
    --image-id "$AMI_ID" \
    --instance-type t3.small \
    --key-name "$KEY_NAME" \
    --security-group-ids "$SG_ID" \
    --user-data "file://$ROOT/infra/user-data.sh" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$TAG}]" \
    --query 'Instances[0].InstanceId' --output text)
  echo "==> Instance $INSTANCE_ID starting, waiting…"
  aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"
fi

# 4. Elastic IP
if [ -z "$ALLOC_ID" ] || [ "$ALLOC_ID" = "None" ]; then
  echo "==> Allocating Elastic IP"
  ALLOC=$(aws ec2 allocate-address --domain vpc)
  ALLOC_ID=$(echo "$ALLOC" | jq -r '.AllocationId')
  EIP=$(echo "$ALLOC" | jq -r '.PublicIp')
  aws ec2 associate-address --instance-id "$INSTANCE_ID" --allocation-id "$ALLOC_ID" >/dev/null
fi
save_state
echo "==> EIP: $EIP"

# 5. Wait for SSH
echo "==> Waiting for SSH on $EIP"
for i in $(seq 1 30); do
  if ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o ConnectTimeout=5 \
     ec2-user@"$EIP" 'echo ok' >/dev/null 2>&1; then
    break
  fi
  sleep 5
done

# 6. Build and upload
echo "==> Building binary"
( cd "$ROOT" && ./server/build.sh )

echo "==> Uploading binary"
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no \
  "$ROOT/server/samezario-server" ec2-user@"$EIP":/home/ec2-user/samezario-server

echo "==> Restarting service"
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no ec2-user@"$EIP" \
  'chmod +x /home/ec2-user/samezario-server && sudo systemctl restart samezario && sleep 1 && sudo systemctl is-active samezario'

echo ""
echo "==> Deploy complete!"
echo "==> Open http://$EIP/ in your browser"
