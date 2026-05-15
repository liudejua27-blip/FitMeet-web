#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fitmeet-new}"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"

cd "$APP_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "[FAIL] Missing $APP_DIR/$ENV_FILE"
  echo "Create it from .env.example and fill production secrets before deploying."
  exit 1
fi

if [ ! -f "nginx/ssl/fullchain.pem" ] || [ ! -f "nginx/ssl/privkey.pem" ]; then
  echo "[FAIL] Missing nginx SSL files:"
  echo "  nginx/ssl/fullchain.pem"
  echo "  nginx/ssl/privkey.pem"
  exit 1
fi

echo "[1/5] Prepare code"
if [ -d ".git" ]; then
  git pull
else
  echo "No .git directory found; using uploaded project files in $APP_DIR"
fi

echo "[2/5] Build frontend for www.ourfitmeet.cn"
corepack enable
corepack prepare pnpm@10.30.3 --activate
pnpm -C frontend install --frozen-lockfile
VITE_API_BASE_URL=https://www.ourfitmeet.cn/api \
VITE_WS_BASE_URL=https://www.ourfitmeet.cn \
pnpm -C frontend build

echo "[3/5] Build and restart production stack"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build

echo "[4/5] Show service status"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

echo "[5/5] Check backend logs for migrations"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs --tail=120 backend

echo "[DONE] Run production verification from your local machine:"
echo "powershell -ExecutionPolicy Bypass -File .\\scripts\\verify-production.ps1"
