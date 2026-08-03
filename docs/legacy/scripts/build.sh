#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLIENT="$ROOT/client"
SERVER="$ROOT/server"
ASSETS="$SERVER/internal/static/assets"

echo "==> Building client"
cd "$CLIENT"
if [ ! -d node_modules ]; then
  npm install
fi
npm run build

echo "==> Copying client dist to embed dir"
rm -rf "$ASSETS"
mkdir -p "$ASSETS"
cp -r "$CLIENT/dist/." "$ASSETS/"
# Preserve .gitkeep so the dir exists in git
touch "$ASSETS/.gitkeep"

echo "==> Building server binary"
cd "$SERVER"
GOOS=${GOOS:-linux} GOARCH=${GOARCH:-amd64} CGO_ENABLED=0 \
  go build -o samezario-server -trimpath -ldflags="-s -w" .

echo "==> Done: $SERVER/samezario-server"
ls -lh "$SERVER/samezario-server"
