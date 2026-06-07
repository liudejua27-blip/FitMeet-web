#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
MIN_DISK_MB="${MIN_DISK_MB:-8192}"
MIN_MEMORY_MB="${MIN_MEMORY_MB:-3072}"
RUN_PROD_ENV_CHECK="${RUN_PROD_ENV_CHECK:-true}"

failures=0
warnings=0

info() {
  printf '[INFO] %s\n' "$1"
}

pass() {
  printf '[PASS] %s\n' "$1"
}

warn() {
  warnings=$((warnings + 1))
  printf '[WARN] %s\n' "$1" >&2
}

fail() {
  failures=$((failures + 1))
  printf '[FAIL] %s\n' "$1" >&2
}

require_file() {
  if [ -f "$1" ]; then
    pass "Found $1"
  else
    fail "Missing $1"
  fi
}

check_command() {
  if command -v "$1" >/dev/null 2>&1; then
    pass "Command available: $1"
    return 0
  fi
  fail "Missing required command: $1"
  return 1
}

check_optional_command() {
  if command -v "$1" >/dev/null 2>&1; then
    pass "Command available: $1"
    return 0
  fi
  warn "Optional command not found: $1"
  return 1
}

check_port() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    if ss -ltn "( sport = :${port} )" 2>/dev/null | awk 'NR > 1 { found = 1 } END { exit found ? 0 : 1 }'; then
      warn "Port ${port} is already listening. Confirm it is an old FitMeet/nginx process before deploying."
    else
      pass "Port ${port} is not currently listening"
    fi
    return
  fi
  if command -v lsof >/dev/null 2>&1; then
    if lsof -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
      warn "Port ${port} is already listening. Confirm it is an old FitMeet/nginx process before deploying."
    else
      pass "Port ${port} is not currently listening"
    fi
    return
  fi
  warn "Cannot inspect port ${port}; install ss or lsof for port checks."
}

check_disk() {
  local available_mb
  available_mb="$(df -Pm "$APP_DIR" | awk 'NR == 2 { print $4 }')"
  if [ -z "$available_mb" ]; then
    warn "Could not determine free disk space for $APP_DIR"
    return
  fi
  if [ "$available_mb" -lt "$MIN_DISK_MB" ]; then
    fail "Free disk space is ${available_mb} MB; expected at least ${MIN_DISK_MB} MB."
  else
    pass "Free disk space is ${available_mb} MB"
  fi
}

check_memory() {
  local memory_mb=""
  if [ -r /proc/meminfo ]; then
    memory_mb="$(awk '/MemTotal/ { printf "%.0f", $2 / 1024 }' /proc/meminfo)"
  elif command -v sysctl >/dev/null 2>&1; then
    memory_mb="$(sysctl -n hw.memsize 2>/dev/null | awk '{ printf "%.0f", $1 / 1024 / 1024 }')"
  fi

  if [ -z "$memory_mb" ]; then
    warn "Could not determine total system memory"
    return
  fi
  if [ "$memory_mb" -lt "$MIN_MEMORY_MB" ]; then
    warn "Total memory is ${memory_mb} MB; production Docker Compose is safer with at least ${MIN_MEMORY_MB} MB."
  else
    pass "Total memory is ${memory_mb} MB"
  fi
}

check_env_placeholders() {
  if [ ! -f "$ENV_FILE" ]; then
    return
  fi
  if grep -Eq 'CHANGE_ME|your-|example\.com|test@example\.com' "$ENV_FILE"; then
    fail "$ENV_FILE still contains placeholder values."
  else
    pass "$ENV_FILE has no obvious placeholder values"
  fi
}

check_ssl() {
  require_file "nginx/ssl/fullchain.pem"
  require_file "nginx/ssl/privkey.pem"

  if [ -f "nginx/ssl/privkey.pem" ]; then
    local mode
    mode="$(stat -c '%a' nginx/ssl/privkey.pem 2>/dev/null || stat -f '%Lp' nginx/ssl/privkey.pem 2>/dev/null || true)"
    if [ -n "$mode" ] && [ "$mode" -gt 600 ]; then
      warn "nginx/ssl/privkey.pem permissions are ${mode}; prefer 600."
    else
      pass "nginx/ssl/privkey.pem permissions look restricted"
    fi
  fi

  if command -v openssl >/dev/null 2>&1 && [ -f "nginx/ssl/fullchain.pem" ]; then
    if openssl x509 -in nginx/ssl/fullchain.pem -noout -subject -dates >/dev/null 2>&1; then
      pass "SSL certificate parses with openssl"
      openssl x509 -in nginx/ssl/fullchain.pem -noout -subject -dates
    else
      fail "nginx/ssl/fullchain.pem is not a valid X.509 certificate."
    fi
  else
    warn "openssl not available; skipping certificate parse."
  fi
}

check_compose_config() {
  if [ ! -f "$COMPOSE_FILE" ] || [ ! -f "$ENV_FILE" ] || ! command -v docker >/dev/null 2>&1; then
    return
  fi
  if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" config -q; then
    pass "Docker Compose config validates with $ENV_FILE"
  else
    fail "Docker Compose config validation failed."
  fi
}

check_prod_env() {
  if [ ! -f "$ENV_FILE" ]; then
    return
  fi
  if [ "$RUN_PROD_ENV_CHECK" != "true" ]; then
    warn "Skipping production env readiness because RUN_PROD_ENV_CHECK=$RUN_PROD_ENV_CHECK."
    return
  fi
  if ! command -v pnpm >/dev/null 2>&1; then
    warn "pnpm not available yet; deploy-production.sh will install via corepack before running check:prod-env."
    return
  fi
  if pnpm -C backend run check:prod-env -- "../$ENV_FILE"; then
    pass "Production env readiness passed"
  else
    fail "Production env readiness failed."
  fi
}

cd "$APP_DIR"
info "FitMeet ECS host preflight in $APP_DIR"

check_command docker || true
if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    pass "Docker daemon is reachable"
  else
    fail "Docker daemon is not reachable. Start Docker before deploying."
  fi
  if docker compose version >/dev/null 2>&1; then
    pass "Docker Compose plugin is available"
  else
    fail "Docker Compose plugin is unavailable."
  fi
fi

check_optional_command openssl || true
check_optional_command pnpm || true

require_file "$COMPOSE_FILE"
require_file "$ENV_FILE"
require_file "backend/Dockerfile.prod"
require_file "frontend/dist/index.html"
require_file "deploy/env.production.ecs.example"
require_file "nginx/nginx.conf"
require_file "scripts/deploy-production.sh"

check_env_placeholders
check_ssl
check_disk
check_memory
check_port 80
check_port 443
check_compose_config
check_prod_env

if [ "$failures" -gt 0 ]; then
  printf '\n[DONE] ECS host preflight failed with %s failure(s) and %s warning(s).\n' "$failures" "$warnings" >&2
  exit 1
fi

printf '\n[DONE] ECS host preflight passed with %s warning(s).\n' "$warnings"
