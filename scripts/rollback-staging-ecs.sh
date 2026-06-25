#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fitmeet-staging}"
BACKUP_ROOT="${BACKUP_ROOT:-$(dirname "$APP_DIR")}"
ROLLBACK_SOURCE="${ROLLBACK_SOURCE:-}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-}"
PUBLIC_API_BASE_URL="${PUBLIC_API_BASE_URL:-}"

fail() {
  printf '[staging-rollback][FAIL] %s\n' "$1" >&2
  exit 1
}

[[ -d "$APP_DIR" ]] || fail "APP_DIR does not exist: ${APP_DIR}"
if [[ -z "$ROLLBACK_SOURCE" ]]; then
  app_name="$(basename "$APP_DIR")"
  ROLLBACK_SOURCE="$(find "$BACKUP_ROOT" -maxdepth 1 -type d -name "${app_name}.backup.*" | sort | tail -1)"
fi
[[ -n "$ROLLBACK_SOURCE" && -d "$ROLLBACK_SOURCE" ]] || fail "No rollback source found. Set ROLLBACK_SOURCE=/path/to/backup."

if [[ -n "$PUBLIC_BASE_URL" ]]; then
  PUBLIC_BASE_URL="${PUBLIC_BASE_URL%/}"
  if [[ "$PUBLIC_BASE_URL" == "https://www.ourfitmeet.cn" || "$PUBLIC_BASE_URL" == "https://ourfitmeet.cn" ]]; then
    fail "Refusing staging rollback against production domain: ${PUBLIC_BASE_URL}"
  fi
fi
if [[ -n "$PUBLIC_API_BASE_URL" ]]; then
  PUBLIC_API_BASE_URL="${PUBLIC_API_BASE_URL%/}"
  if [[ "$PUBLIC_API_BASE_URL" == "https://www.ourfitmeet.cn/api" || "$PUBLIC_API_BASE_URL" == "https://ourfitmeet.cn/api" ]]; then
    fail "Refusing staging rollback against production API: ${PUBLIC_API_BASE_URL}"
  fi
fi

timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
current_backup="${BACKUP_ROOT%/}/$(basename "$APP_DIR").pre-rollback.${timestamp}"

printf '[staging-rollback] Source: %s\n' "$ROLLBACK_SOURCE"
printf '[staging-rollback] Target: %s\n' "$APP_DIR"
printf '[staging-rollback] Current backup: %s\n' "$current_backup"

mkdir -p "$current_backup"
rsync -a "$APP_DIR/" "$current_backup/"

rsync -a --delete \
  --exclude '.env.production' \
  --exclude 'nginx/ssl/' \
  "$ROLLBACK_SOURCE/" "$APP_DIR/"

cd "$APP_DIR"
COMPOSE=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")
"${COMPOSE[@]}" up -d --no-build --force-recreate backend subagent-worker nginx
"${COMPOSE[@]}" ps

if [[ -n "$PUBLIC_BASE_URL" ]]; then
  if [[ -z "$PUBLIC_API_BASE_URL" ]]; then
    PUBLIC_API_BASE_URL="${PUBLIC_BASE_URL}/api"
  fi
  BASE_URL="$PUBLIC_BASE_URL" API_BASE_URL="$PUBLIC_API_BASE_URL" ./scripts/verify-staging.sh
fi

printf '[staging-rollback][DONE]\n'
