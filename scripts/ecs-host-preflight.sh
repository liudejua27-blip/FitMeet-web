#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
MIN_DISK_MB="${MIN_DISK_MB:-8192}"
MIN_MEMORY_MB="${MIN_MEMORY_MB:-3072}"
RUN_PROD_ENV_CHECK="${RUN_PROD_ENV_CHECK:-true}"
RUN_BACKEND_DOCKER_BUILD_CHECK="${RUN_BACKEND_DOCKER_BUILD_CHECK:-false}"

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

env_value() {
  local key="$1"
  if [ ! -f "$ENV_FILE" ]; then
    return
  fi
  awk -F= -v key="$key" '
    $0 !~ /^[[:space:]]*#/ && $1 == key {
      sub(/^[^=]*=/, "")
      gsub(/^["'\'']|["'\'']$/, "")
      print
      exit
    }
  ' "$ENV_FILE"
}

check_domain_env() {
  local base_url frontend_base_url public_base_url public_api_base_url allowed_origins wechat_redirect alerts upload_temp
  base_url="$(env_value BASE_URL)"
  frontend_base_url="$(env_value FRONTEND_BASE_URL)"
  public_base_url="$(env_value PUBLIC_BASE_URL)"
  public_api_base_url="$(env_value PUBLIC_API_BASE_URL)"
  allowed_origins="$(env_value ALLOWED_ORIGINS)"
  wechat_redirect="$(env_value WECHAT_REDIRECT_URI)"
  alerts="$(env_value AGENT_OBSERVABILITY_ALERTS_ENABLED)"
  upload_temp="$(env_value UPLOAD_TEMP_DIR)"

  [ "$base_url" = "https://www.ourfitmeet.cn" ] && pass "BASE_URL targets www.ourfitmeet.cn" || fail "BASE_URL must be https://www.ourfitmeet.cn"
  [ "$frontend_base_url" = "https://www.ourfitmeet.cn" ] && pass "FRONTEND_BASE_URL targets www.ourfitmeet.cn" || fail "FRONTEND_BASE_URL must be https://www.ourfitmeet.cn"
  [ "$public_base_url" = "https://www.ourfitmeet.cn" ] && pass "PUBLIC_BASE_URL targets www.ourfitmeet.cn" || fail "PUBLIC_BASE_URL must be https://www.ourfitmeet.cn"
  [ "$public_api_base_url" = "https://www.ourfitmeet.cn/api" ] && pass "PUBLIC_API_BASE_URL targets production API" || fail "PUBLIC_API_BASE_URL must be https://www.ourfitmeet.cn/api"
  [[ "$allowed_origins" == *"https://www.ourfitmeet.cn"* && "$allowed_origins" == *"https://ourfitmeet.cn"* ]] && pass "ALLOWED_ORIGINS includes www and apex domains" || fail "ALLOWED_ORIGINS must include https://www.ourfitmeet.cn and https://ourfitmeet.cn"
  [ "$wechat_redirect" = "https://www.ourfitmeet.cn/api/auth/wechat/callback" ] && pass "WECHAT_REDIRECT_URI targets production callback" || warn "WECHAT_REDIRECT_URI is not the production callback"
  [ "${alerts:-false}" = "false" ] && pass "Agent alert delivery disabled for first launch" || warn "Agent alert delivery is enabled; verify webhook/token before launch."
  check_deepseek_models
  check_agent_intelligence_env
  check_worker_env
  [[ "$upload_temp" = /* ]] && pass "UPLOAD_TEMP_DIR is absolute: $upload_temp" || fail "UPLOAD_TEMP_DIR must be an absolute writable path."
}

check_deepseek_models() {
  local key model checked=0 invalid=0
  for key in DEEPSEEK_CHAT_MODEL DEEPSEEK_FAST_MODEL DEEPSEEK_MODEL AGENT_CASUAL_CHAT_MODEL AGENT_FINAL_RESPONSE_MODEL AGENT_PLANNER_MODEL AGENT_EXTRACTOR_MODEL AGENT_CARD_MODEL AGENT_SAFETY_MODEL; do
    model="$(env_value "$key")"
    [ -z "$model" ] && continue
    checked=$((checked + 1))
    case "$model" in
      deepseek-chat|deepseek-reasoner|deepseek-v4)
        invalid=$((invalid + 1))
        fail "$key must be an explicit V4 model id, not $model"
        ;;
    esac
  done
  if [ "$checked" -gt 0 ] && [ "$invalid" -eq 0 ]; then
    pass "DeepSeek configured models are explicit model IDs"
  elif [ "$checked" -eq 0 ]; then
    fail "At least one DeepSeek model must be configured."
  fi
}

check_minimum_integer_env() {
  local key="$1"
  local minimum="$2"
  local value
  value="$(env_value "$key")"
  if [[ "$value" =~ ^[0-9]+$ ]] && [ "$value" -ge "$minimum" ]; then
    pass "$key is ${value} (>= ${minimum})"
  else
    fail "$key must be an integer >= ${minimum}; lower values force DeepSeek into brittle fallback paths."
  fi
}

check_not_false_env() {
  local key="$1"
  local value
  value="$(env_value "$key" | tr '[:upper:]' '[:lower:]')"
  case "$value" in
    false|0|off|no)
      fail "$key must not be disabled in production; this would bypass the LLM planner/router."
      ;;
    *)
      pass "$key is not disabled"
      ;;
  esac
}

check_agent_intelligence_env() {
  local routing_mode intent_mode chat_model key model
  routing_mode="$(env_value SOCIAL_AGENT_MODEL_ROUTING_MODE)"
  intent_mode="$(env_value SOCIAL_AGENT_INTENT_ROUTER_MODE)"
  chat_model="$(env_value DEEPSEEK_CHAT_MODEL)"

  [ "$routing_mode" = "quality" ] && pass "SOCIAL_AGENT_MODEL_ROUTING_MODE keeps release quality routing" || fail "SOCIAL_AGENT_MODEL_ROUTING_MODE must be quality."
  [ "$intent_mode" = "llm_first" ] && pass "SOCIAL_AGENT_INTENT_ROUTER_MODE keeps LLM-first routing" || fail "SOCIAL_AGENT_INTENT_ROUTER_MODE must be llm_first."
  check_not_false_env SOCIAL_AGENT_INTENT_LLM
  check_not_false_env SOCIAL_AGENT_BRAIN_LLM_PLANNER
  check_minimum_integer_env SOCIAL_AGENT_CONTEXT_TURN_LIMIT 80
  check_minimum_integer_env SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS 30000
  check_minimum_integer_env SOCIAL_AGENT_DEEPSEEK_FIRST_CHUNK_TIMEOUT_MS 20000
  check_minimum_integer_env SOCIAL_AGENT_CHAT_LLM_TIMEOUT_MS 30000
  check_minimum_integer_env SOCIAL_AGENT_CHAT_FIRST_CHUNK_TIMEOUT_MS 20000
  check_minimum_integer_env SOCIAL_AGENT_FINAL_RESPONSE_TIMEOUT_MS 30000
  check_minimum_integer_env SOCIAL_AGENT_FINAL_RESPONSE_FIRST_CHUNK_TIMEOUT_MS 20000
  check_minimum_integer_env SOCIAL_AGENT_FINAL_RESPONSE_MAX_TOKENS 900
  check_minimum_integer_env SOCIAL_AGENT_PLANNER_TIMEOUT_MS 25000
  check_minimum_integer_env SOCIAL_AGENT_INTENT_TIMEOUT_MS 25000
  check_minimum_integer_env SOCIAL_AGENT_DEEPSEEK_RETRY_ATTEMPTS 2

  for key in AGENT_CASUAL_CHAT_MODEL AGENT_FINAL_RESPONSE_MODEL AGENT_PLANNER_MODEL AGENT_EXTRACTOR_MODEL AGENT_CARD_MODEL AGENT_SAFETY_MODEL; do
    model="$(env_value "$key")"
    [ -z "$model" ] && continue
    if [ -n "$chat_model" ] && [ "$model" != "$chat_model" ]; then
      fail "$key must match DEEPSEEK_CHAT_MODEL in quality mode; weaker overrides silently downgrade the Agent."
    else
      pass "$key matches the release chat model"
    fi
  done
}

check_positive_integer_env() {
  local key="$1"
  local value
  value="$(env_value "$key")"
  if [[ "$value" =~ ^[1-9][0-9]*$ ]]; then
    pass "$key is configured"
  else
    fail "$key must be a positive integer."
  fi
}

check_worker_env() {
  local worker_mode
  worker_mode="$(env_value FITMEET_SUBAGENT_WORKER_MODE)"
  case "$worker_mode" in
    db_queue|queue_worker_ready)
      pass "FITMEET_SUBAGENT_WORKER_MODE enables queue worker runtime"
      ;;
    *)
      fail "FITMEET_SUBAGENT_WORKER_MODE must be db_queue or queue_worker_ready for ECS production."
      ;;
  esac
  check_positive_integer_env FITMEET_SUBAGENT_WORKER_CONCURRENCY
  check_positive_integer_env FITMEET_SUBAGENT_WORKER_POLL_MS
  check_positive_integer_env FITMEET_SUBAGENT_WORKER_TIMEOUT_MS
  check_positive_integer_env FITMEET_SUBAGENT_WORKER_HEARTBEAT_MS
  check_positive_integer_env FITMEET_SUBAGENT_WORKER_HEALTH_MAX_AGE_MS
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
      local san
      san="$(openssl x509 -in nginx/ssl/fullchain.pem -noout -ext subjectAltName 2>/dev/null || true)"
      if [[ "$san" == *"DNS:www.ourfitmeet.cn"* && "$san" == *"DNS:ourfitmeet.cn"* ]]; then
        pass "SSL SAN covers www.ourfitmeet.cn and ourfitmeet.cn"
      else
        fail "SSL certificate SAN must include www.ourfitmeet.cn and ourfitmeet.cn."
      fi
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
    local compose_rendered
    compose_rendered="$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" config)"
    if grep -q 'subagent-worker-healthcheck.js' <<<"$compose_rendered"; then
      pass "subagent-worker uses dedicated healthcheck"
    else
      fail "subagent-worker healthcheck must use dist/agent-gateway/subagent-worker-healthcheck.js"
    fi
    if grep -A40 '^  nginx:' <<<"$compose_rendered" | grep -q 'subagent-worker'; then
      fail "nginx must not depend on subagent-worker health."
    else
      pass "nginx does not depend on subagent-worker"
    fi
    if grep -A80 '^  backend:' <<<"$compose_rendered" | grep -q 'FITMEET_PROCESS_ROLE: api' &&
      grep -A80 '^  backend:' <<<"$compose_rendered" | grep -q 'ENABLE_SCHEDULER: "false"'; then
      pass "backend process role is API-only"
    else
      fail "backend must run as FITMEET_PROCESS_ROLE=api with ENABLE_SCHEDULER=false"
    fi
    if grep -A100 '^  subagent-worker:' <<<"$compose_rendered" | grep -q 'FITMEET_PROCESS_ROLE: worker' &&
      grep -A100 '^  subagent-worker:' <<<"$compose_rendered" | grep -q 'ENABLE_SCHEDULER: "true"'; then
      pass "subagent-worker process role owns scheduler jobs"
    else
      fail "subagent-worker must run as FITMEET_PROCESS_ROLE=worker with ENABLE_SCHEDULER=true"
    fi
    if grep -q 'user: "0:0"' <<<"$compose_rendered" || grep -q "user: 0:0" <<<"$compose_rendered"; then
      fail "backend/subagent-worker must not run as root user 0:0"
    else
      pass "Compose does not force root user 0:0"
    fi
  else
    fail "Docker Compose config validation failed."
  fi
}

check_backend_docker_build() {
  if [ "$RUN_BACKEND_DOCKER_BUILD_CHECK" != "true" ]; then
    warn "Skipping backend Dockerfile.prod build check because RUN_BACKEND_DOCKER_BUILD_CHECK=$RUN_BACKEND_DOCKER_BUILD_CHECK."
    return
  fi
  if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
    fail "Cannot run backend Dockerfile.prod build check without a reachable Docker daemon."
    return
  fi
  if docker build -f backend/Dockerfile.prod backend -t fitmeet-backend-prod-preflight:local >/dev/null; then
    pass "backend/Dockerfile.prod builds with frozen lockfile"
  else
    fail "backend/Dockerfile.prod build failed."
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
check_domain_env
check_ssl
check_disk
check_memory
check_port 80
check_port 443
check_compose_config
check_prod_env
check_backend_docker_build

if [ "$failures" -gt 0 ]; then
  printf '\n[DONE] ECS host preflight failed with %s failure(s) and %s warning(s).\n' "$failures" "$warnings" >&2
  exit 1
fi

printf '\n[DONE] ECS host preflight passed with %s warning(s).\n' "$warnings"
