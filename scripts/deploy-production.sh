#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fitmeet-new}"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
RUN_RELEASE_PREFLIGHT="${RUN_RELEASE_PREFLIGHT:-true}"
RUN_DB_MIGRATIONS="${RUN_DB_MIGRATIONS:-${RUN_MIGRATIONS:-true}}"
PNPM_VERSION="${PNPM_VERSION:-10.30.3}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://www.ourfitmeet.cn}"
PUBLIC_API_BASE_URL="${PUBLIC_API_BASE_URL:-}"
DEPLOY_LOG_TAIL="${DEPLOY_LOG_TAIL:-600}"

cd "$APP_DIR"

PUBLIC_BASE_URL="${PUBLIC_BASE_URL%/}"
if [ -z "$PUBLIC_API_BASE_URL" ]; then
  PUBLIC_API_BASE_URL="${PUBLIC_BASE_URL}/api"
else
  PUBLIC_API_BASE_URL="${PUBLIC_API_BASE_URL%/}"
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "[FAIL] Missing $APP_DIR/$ENV_FILE"
  echo "Create it from deploy/env.production.ecs.example and fill production secrets before deploying:"
  echo "  cp deploy/env.production.ecs.example $ENV_FILE"
  exit 1
fi

if [ ! -f "nginx/ssl/fullchain.pem" ] || [ ! -f "nginx/ssl/privkey.pem" ]; then
  echo "[FAIL] Missing nginx SSL files:"
  echo "  nginx/ssl/fullchain.pem"
  echo "  nginx/ssl/privkey.pem"
  exit 1
fi

if [ -x "scripts/ecs-host-preflight.sh" ] && [ "${RUN_ECS_HOST_PREFLIGHT:-true}" = "true" ]; then
  echo "[pre] Run ECS host preflight"
  ./scripts/ecs-host-preflight.sh
fi

echo "[1/7] Prepare code"
if [ -d ".git" ]; then
  git pull
else
  echo "No .git directory found; using uploaded project files in $APP_DIR"
fi

echo "[2/7] Prepare package manager"
corepack enable
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack prepare pnpm@"$PNPM_VERSION" --activate

read_release_field() {
  local field="$1"
  local fallback="$2"
  node -e "const fs=require('fs');const r=JSON.parse(fs.readFileSync('release.json','utf8'));process.stdout.write(String(r[process.argv[1]] ?? process.argv[2] ?? ''))" \
    "$field" "$fallback" 2>/dev/null || printf '%s' "$fallback"
}

if [ -f "release.json" ]; then
  # Always trust the installed release metadata. .env.production is preserved
  # across installs and may contain stale FITMEET_RELEASE_* values.
  FITMEET_RELEASE_COMMIT="$(read_release_field commit unknown)"
  FITMEET_RELEASE_BUILT_AT="$(read_release_field builtAt '')"
  FITMEET_RELEASE_SOURCE="$(read_release_field source deploy_zip)"
else
  FITMEET_RELEASE_COMMIT="unknown"
  FITMEET_RELEASE_BUILT_AT=""
  FITMEET_RELEASE_SOURCE="uploaded_tree"
fi
export FITMEET_RELEASE_COMMIT FITMEET_RELEASE_BUILT_AT FITMEET_RELEASE_SOURCE
echo "[release] commit=${FITMEET_RELEASE_COMMIT} source=${FITMEET_RELEASE_SOURCE} builtAt=${FITMEET_RELEASE_BUILT_AT:-unknown}"

if [ "$RUN_RELEASE_PREFLIGHT" = "true" ]; then
  echo "[3/7] Run Web release preflight"
  ./scripts/release-preflight.sh --web-only
else
  echo "[3/7] Skip Web release preflight because RUN_RELEASE_PREFLIGHT=$RUN_RELEASE_PREFLIGHT"
  if [ ! -x "backend/node_modules/.bin/ts-node" ]; then
    pnpm -C backend install --frozen-lockfile
  fi
fi

echo "[4/7] Validate production environment"
pnpm -C backend run check:prod-env -- "../$ENV_FILE"

echo "[5/7] Prepare frontend dist"
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

COMPOSE=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")
COMPOSE_SERVICES="$("${COMPOSE[@]}" config --services)"

compose_has_service() {
  grep -qx "$1" <<<"$COMPOSE_SERVICES"
}

start_compose_services() {
  local label="$1"
  shift
  local selected=()
  local service
  for service in "$@"; do
    if compose_has_service "$service"; then
      selected+=("$service")
    else
      echo "[skip] Compose service ${service} is not defined; not starting it for ${label}."
    fi
  done
  if ((${#selected[@]} == 0)); then
    echo "[FAIL] No compose services selected for ${label}." >&2
    exit 1
  fi
  "${COMPOSE[@]}" up -d "${selected[@]}"
}

run_backend_pnpm() {
  "${COMPOSE[@]}" run --rm --no-deps backend sh -lc \
    "corepack enable && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack prepare pnpm@${PNPM_VERSION} --activate && pnpm \"\$@\"" \
    sh "$@"
}

echo "[6/9] Start production dependencies"
start_compose_services "production dependencies" postgres redis mongo

echo "[7/9] Build backend runtime images"
"${COMPOSE[@]}" build backend subagent-worker

echo "[8/9] Run production preflight inside backend image"
run_backend_pnpm uploads:check:prod

if [ "$RUN_DB_MIGRATIONS" = "true" ]; then
  echo "[9/9] Run production migrations before app startup"
  run_backend_pnpm migration:run:prod
  run_backend_pnpm db:check-critical-tables:prod
else
  echo "[9/9] Refusing to skip production table verification"
  run_backend_pnpm db:check-critical-tables:prod
fi

echo "[deploy] Start API, worker, and nginx after migrations"
"${COMPOSE[@]}" up -d --no-build --force-recreate backend subagent-worker nginx

echo "[post] Wait for API and worker health"
wait_for_compose_exec() {
  local service="$1"
  local label="$2"
  shift 2
  local deadline=$((SECONDS + ${DEPLOY_HEALTH_TIMEOUT_SECONDS:-150}))
  until "${COMPOSE[@]}" exec -T "$service" "$@" >/dev/null 2>&1; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "[FAIL] Timed out waiting for ${label}" >&2
      return 1
    fi
    sleep 5
  done
  echo "[OK] ${label}"
}

scan_deploy_logs() {
  local services=(backend subagent-worker)
  local pattern
  pattern='EACCES|relation "[^"]+" does not exist|fk_agent_activity_logs_connection|foreign key constraint|ERR_PNPM_LOCKFILE_CONFIG_MISMATCH|ts-node: not found|yaml: did not find expected key|UnhandledPromiseRejection|\bERROR\b'

  for service in "${services[@]}"; do
    local log_file
    log_file="$(mktemp)"
    if ! "${COMPOSE[@]}" logs --tail="${DEPLOY_LOG_TAIL}" "${service}" >"${log_file}" 2>&1; then
      rm -f "${log_file}"
      echo "[FAIL] Unable to read docker compose logs for ${service}" >&2
      exit 1
    fi
    if grep -Eiq "${pattern}" "${log_file}"; then
      echo "[FAIL] Recent ${service} logs contain production failure patterns:" >&2
      grep -Ein "${pattern}" "${log_file}" | tail -40 >&2
      rm -f "${log_file}"
      exit 1
    fi
    rm -f "${log_file}"
  done
}

if ! wait_for_compose_exec backend "backend process" node -e "process.exit(0)"; then
  "${COMPOSE[@]}" ps >&2
  "${COMPOSE[@]}" logs --tail=160 backend >&2
  exit 1
fi
if ! wait_for_compose_exec backend "backend Agent restore patch" node -e "const fs=require('fs');const p='dist/agent-gateway/social-agent-session-restore.service.js';const s=fs.readFileSync(p,'utf8');if(!s.includes('shouldHideGenericCheckpointSession')||!s.includes('原始目标')) process.exit(1);"; then
  echo "[FAIL] backend container does not contain the latest Agent session restore patch" >&2
  "${COMPOSE[@]}" ps >&2
  exit 1
fi
if ! wait_for_compose_exec backend "backend release metadata" node -e "const http=require('http');const expected=process.env.FITMEET_RELEASE_COMMIT||'unknown';http.get('http://127.0.0.1:3000/api/health',(r)=>{let b='';r.on('data',(c)=>b+=c);r.on('end',()=>{try{const h=JSON.parse(b);const got=String(h.release&&h.release.commit||'unknown');if(r.statusCode!==200||got==='unknown'||(expected!=='unknown'&&!got.startsWith(expected)&&!expected.startsWith(got))){console.error('release mismatch', {expected, got, status:r.statusCode});process.exit(1);}process.exit(0);}catch(e){console.error(e);process.exit(1);}});}).on('error',(e)=>{console.error(e);process.exit(1);});"; then
  echo "[FAIL] backend /api/health does not expose the expected release metadata" >&2
  "${COMPOSE[@]}" ps >&2
  exit 1
fi
if ! wait_for_compose_exec subagent-worker "subagent-worker dedicated healthcheck" node dist/agent-gateway/subagent-worker-healthcheck.js; then
  echo "[FAIL] subagent-worker dedicated healthcheck failed after startup" >&2
  "${COMPOSE[@]}" ps >&2
  "${COMPOSE[@]}" logs --tail=160 subagent-worker >&2
  exit 1
fi

echo "[post] Show service status"
"${COMPOSE[@]}" ps

echo "[post] Scan backend and worker logs"
scan_deploy_logs

echo "[DONE] Run production verification from your local machine:"
echo "BASE_URL=$PUBLIC_BASE_URL API_BASE_URL=$PUBLIC_API_BASE_URL EXPECTED_RELEASE_COMMIT=$FITMEET_RELEASE_COMMIT ./scripts/verify-production.sh"
echo "BASE_URL=$PUBLIC_BASE_URL API_BASE_URL=$PUBLIC_API_BASE_URL EXPECTED_RELEASE_COMMIT=$FITMEET_RELEASE_COMMIT VERIFY_USER_EMAIL='<email>' VERIFY_USER_PASSWORD='<password>' ./scripts/verify-production.sh"
echo "powershell -ExecutionPolicy Bypass -File .\\scripts\\verify-production.ps1 -BaseUrl $PUBLIC_BASE_URL -ApiBaseUrl $PUBLIC_API_BASE_URL"
echo "curl $PUBLIC_API_BASE_URL/health"
