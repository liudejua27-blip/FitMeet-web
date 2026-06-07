#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fitmeet-new}"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
RUN_RELEASE_PREFLIGHT="${RUN_RELEASE_PREFLIGHT:-true}"

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

echo "[1/6] Prepare code"
if [ -d ".git" ]; then
  git pull
else
  echo "No .git directory found; using uploaded project files in $APP_DIR"
fi

echo "[2/6] Prepare package manager"
corepack enable
corepack prepare pnpm@10.30.3 --activate

if [ "$RUN_RELEASE_PREFLIGHT" = "true" ]; then
  echo "[3/6] Run Web release preflight"
  ./scripts/release-preflight.sh --web-only
else
  echo "[3/6] Skip Web release preflight because RUN_RELEASE_PREFLIGHT=$RUN_RELEASE_PREFLIGHT"
  if [ ! -x "backend/node_modules/.bin/ts-node" ]; then
    pnpm -C backend install --frozen-lockfile
  fi
fi

echo "[4/6] Validate production environment"
pnpm -C backend run check:prod-env -- "../$ENV_FILE"

echo "[5/6] Prepare frontend dist"
BUILD_FRONTEND="${BUILD_FRONTEND:-auto}"
if [ "$BUILD_FRONTEND" = "false" ] || { [ "$BUILD_FRONTEND" = "auto" ] && [ -f "frontend/dist/index.html" ]; }; then
  echo "Using existing frontend/dist. Set BUILD_FRONTEND=true to rebuild on this server."
  pnpm -C frontend run check:prod-build
else
  echo "Building frontend with relative /api URLs. Low-memory servers should prefer uploading prebuilt dist."
  pnpm -C frontend install --frozen-lockfile
  NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1024}" \
  VITE_API_BASE_URL=/api \
  VITE_WS_BASE_URL= \
  pnpm -C frontend build
fi

echo "[6/6] Build and restart production stack"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build

echo "[post] Show service status"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps

echo "[post] Check backend logs for migrations"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs --tail=120 backend

echo "[DONE] Run production verification from your local machine:"
echo "BASE_URL=https://socialworld.world API_BASE_URL=https://api.socialworld.world/api ./scripts/verify-production.sh"
echo "powershell -ExecutionPolicy Bypass -File .\\scripts\\verify-production.ps1 -BaseUrl https://socialworld.world -ApiBaseUrl https://api.socialworld.world/api"
echo "curl https://api.socialworld.world/api/health"
