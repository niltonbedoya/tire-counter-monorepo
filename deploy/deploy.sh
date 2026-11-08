#!/usr/bin/env bash
set -euo pipefail

echo "=========================================="
echo "Starting deployment on Mac Mini (Linux Mint)"
echo "Target: /home/bedvil/tire-counter-monorepo"
echo "Timestamp: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "=========================================="

APP_DIR="/home/bedvil/tire-counter-monorepo"

if [ ! -d "$APP_DIR" ]; then
  echo "Error: Directory $APP_DIR does not exist." >&2
  exit 1
fi

cd "$APP_DIR"

echo "→ Syncing repository to origin/main..."
git fetch origin main
git reset --hard origin/main

if [ ! -f "apps/receptor-desktop/.env" ]; then
  echo "Error: apps/receptor-desktop/.env is missing in $APP_DIR." >&2
  exit 1
fi

echo "→ Rebuilding and restarting container..."
docker compose up -d --build receptor-desktop

echo "→ Verifying container health..."
HEALTHY=false
for i in $(seq 1 10); do
  if curl -s -f http://localhost:3005/api/contenedores > /dev/null 2>&1; then
    HEALTHY=true
    echo "✓ Container is healthy and responding on http://localhost:3005 (attempt $i)"
    break
  fi
  echo "  Waiting for service ($i/10)..."
  sleep 2
done

if [ "$HEALTHY" = false ]; then
  echo "Error: Container health check failed after 10 attempts." >&2
  docker compose logs receptor-desktop --tail 30
  exit 1
fi

echo "=========================================="
echo "Deployment completed successfully!"
echo "Git revision: $(git rev-parse --short HEAD)"
echo "=========================================="
