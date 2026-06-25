#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fitmeet-staging}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
PNPM_VERSION="${PNPM_VERSION:-10.30.3}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-}"
PUBLIC_API_BASE_URL="${PUBLIC_API_BASE_URL:-}"
RUN_DB_MIGRATIONS="${RUN_DB_MIGRATIONS:-true}"
RUN_STAGING_VERIFY="${RUN_STAGING_VERIFY:-true}"
RUN_STAGING_E2E="${RUN_STAGING_E2E:-false}"
RUN_STAGING_FAULT_INJECTION="${RUN_STAGING_FAULT_INJECTION:-false}"
COMPOSE_PARALLEL_LIMIT="${COMPOSE_PARALLEL_LIMIT:-1}"
DEPLOY_HEALTH_TIMEOUT_SECONDS="${DEPLOY_HEALTH_TIMEOUT_SECONDS:-180}"
STAGING_EVIDENCE_ROOT="${STAGING_EVIDENCE_ROOT:-artifacts/staging}"

usage() {
  cat <<'EOF'
Usage: scripts/deploy-staging-safe-ecs.sh

Deploys the installed release on an isolated ECS staging host. This script is
intentionally separate from production deploy so staging can collect evidence
and run destructive validation without changing production defaults.

Required environment:
  APP_DIR=/opt/fitmeet-staging
  PUBLIC_BASE_URL=https://staging.example.com
  PUBLIC_API_BASE_URL=https://staging.example.com/api

Optional environment:
  RUN_DB_MIGRATIONS=true|false          Default true.
  RUN_STAGING_VERIFY=true|false         Default true.
  RUN_STAGING_E2E=true|false            Default false.
  RUN_STAGING_FAULT_INJECTION=true|false Default false.
  COMPOSE_PARALLEL_LIMIT=1              Default 1 for low-memory ECS hosts.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

fail() {
  printf '[staging-deploy][FAIL] %s\n' "$1" >&2
  exit 1
}

step() {
  printf '\n[staging-deploy] %s\n' "$1"
}

redact_env_file() {
  local file="$1"
  awk -F= '
    /^[[:space:]]*($|#)/ { next }
    {
      key=$1
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", key)
      if (key != "") print key"=[redacted]"
    }
  ' "$file" | sort
}

read_release_field() {
  local field="$1"
  local fallback="$2"
  node -e "const fs=require('fs');const p='release.json';if(!fs.existsSync(p)){process.stdout.write(process.argv[2]);process.exit(0)};const r=JSON.parse(fs.readFileSync(p,'utf8'));process.stdout.write(String(r[process.argv[1]] ?? process.argv[2] ?? ''))" \
    "$field" "$fallback"
}

write_sanitized_compose_summary() {
  local output="$1"
  local tmp
  tmp="$(mktemp)"
  if ! "${COMPOSE[@]}" config --format json >"$tmp"; then
    rm -f "$tmp"
    fail "docker compose config failed."
  fi
  if ! node - "$tmp" "$output" <<'NODE'
const fs = require('fs');

const input = process.argv[2];
const output = process.argv[3];
const doc = JSON.parse(fs.readFileSync(input, 'utf8'));
const services = Object.entries(doc.services || {})
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, service]) => ({
    name,
    image: typeof service.image === 'string' ? service.image : null,
    ports: Array.isArray(service.ports)
      ? service.ports.map((port) => {
          if (typeof port === 'string') return port;
          return {
            target: port.target ?? null,
            published: port.published ?? null,
            protocol: port.protocol ?? null,
            mode: port.mode ?? null,
          };
        })
      : [],
    healthcheck: service.healthcheck
      ? {
          test: service.healthcheck.test ? '[redacted]' : null,
          interval: service.healthcheck.interval ?? null,
          timeout: service.healthcheck.timeout ?? null,
          retries: service.healthcheck.retries ?? null,
          start_period: service.healthcheck.start_period ?? null,
        }
      : null,
  }));

fs.writeFileSync(
  output,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      note:
        'Sanitized docker compose summary. Full environment, env_file, labels, volumes and secrets are intentionally omitted.',
      services,
    },
    null,
    2,
  )}\n`,
);
NODE
  then
    rm -f "$tmp"
    fail "Failed to write sanitized docker compose summary."
  fi
  rm -f "$tmp"
}

wait_for_service_healthy() {
  local service="$1"
  local deadline=$((SECONDS + DEPLOY_HEALTH_TIMEOUT_SECONDS))
  while true; do
    local status
    status="$("${COMPOSE[@]}" ps --format json "$service" 2>/dev/null | node -e "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{try{if(!s.trim())return;const parsed=JSON.parse(s);const row=Array.isArray(parsed)?parsed[0]:parsed;process.stdout.write(row?.Health || row?.State || '')}catch{const rows=s.trim().split(/\\n+/).filter(Boolean).map((line)=>JSON.parse(line));const row=rows[0];process.stdout.write(row?.Health || row?.State || '')}})")"
    if [[ "$status" == "healthy" || "$status" == "running" ]]; then
      printf '[staging-deploy][OK] %s is %s\n' "$service" "$status"
      return 0
    fi
    if [[ "$SECONDS" -ge "$deadline" ]]; then
      "${COMPOSE[@]}" ps >&2 || true
      "${COMPOSE[@]}" logs --tail=160 "$service" >&2 || true
      fail "Timed out waiting for ${service} health."
    fi
    sleep 5
  done
}

run_backend_pnpm() {
  APP_DIR="$APP_DIR" COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE="$ENV_FILE" PNPM_VERSION="$PNPM_VERSION" \
    ./scripts/ecs-backend-pnpm.sh -- "$@"
}

[[ -n "$PUBLIC_BASE_URL" ]] || fail "Set PUBLIC_BASE_URL to the staging Web origin."
PUBLIC_BASE_URL="${PUBLIC_BASE_URL%/}"
if [[ "$PUBLIC_BASE_URL" == "https://www.ourfitmeet.cn" || "$PUBLIC_BASE_URL" == "https://ourfitmeet.cn" ]]; then
  fail "Refusing to run staging deploy against production domain: ${PUBLIC_BASE_URL}"
fi
if [[ -z "$PUBLIC_API_BASE_URL" ]]; then
  PUBLIC_API_BASE_URL="${PUBLIC_BASE_URL}/api"
else
  PUBLIC_API_BASE_URL="${PUBLIC_API_BASE_URL%/}"
fi
if [[ "$PUBLIC_API_BASE_URL" == "https://www.ourfitmeet.cn/api" || "$PUBLIC_API_BASE_URL" == "https://ourfitmeet.cn/api" ]]; then
  fail "Refusing to run staging deploy against production API: ${PUBLIC_API_BASE_URL}"
fi

cd "$APP_DIR"
[[ -f "$COMPOSE_FILE" ]] || fail "Missing ${APP_DIR}/${COMPOSE_FILE}"
[[ -f "$ENV_FILE" ]] || fail "Missing ${APP_DIR}/${ENV_FILE}"
[[ -d "nginx/ssl" ]] || fail "Missing ${APP_DIR}/nginx/ssl"

export COMPOSE_PARALLEL_LIMIT
COMPOSE=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")
timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
evidence_dir="${STAGING_EVIDENCE_ROOT%/}/${timestamp}"
mkdir -p "$evidence_dir"

release_commit="$(read_release_field commit unknown)"
release_built_at="$(read_release_field builtAt '')"
release_source="$(read_release_field source deploy_zip)"
export FITMEET_RELEASE_COMMIT="$release_commit"
export FITMEET_RELEASE_BUILT_AT="$release_built_at"
export FITMEET_RELEASE_SOURCE="$release_source"

{
  printf '# Staging Deploy Evidence\n\n'
  printf -- '- UTC: `%s`\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  printf -- '- APP_DIR: `%s`\n' "$APP_DIR"
  printf -- '- release.commit: `%s`\n' "$release_commit"
  printf -- '- release.source: `%s`\n' "$release_source"
  printf -- '- release.builtAt: `%s`\n' "${release_built_at:-unknown}"
  printf -- '- PUBLIC_BASE_URL: `%s`\n' "$PUBLIC_BASE_URL"
  printf -- '- PUBLIC_API_BASE_URL: `%s`\n' "$PUBLIC_API_BASE_URL"
  printf -- '- COMPOSE_PARALLEL_LIMIT: `%s`\n' "$COMPOSE_PARALLEL_LIMIT"
  printf '\n## Redacted Env Keys\n\n```text\n'
  redact_env_file "$ENV_FILE"
  printf '```\n'
} >"${evidence_dir}/deploy-summary.md"

step "Record sanitized docker compose summary"
write_sanitized_compose_summary "${evidence_dir}/docker-compose.summary.json"

step "Stop API, worker, and nginx to release memory"
"${COMPOSE[@]}" stop nginx backend subagent-worker >/dev/null 2>&1 || true

step "Build backend image sequentially"
"${COMPOSE[@]}" build backend

step "Build worker image sequentially"
"${COMPOSE[@]}" build subagent-worker

step "Start staging data services"
"${COMPOSE[@]}" up -d postgres mongo redis
wait_for_service_healthy postgres
wait_for_service_healthy mongo
wait_for_service_healthy redis

step "Capture pre-migration staging database backup"
mkdir -p backup
if "${COMPOSE[@]}" exec -T postgres sh -lc 'command -v pg_dump >/dev/null 2>&1'; then
  "${COMPOSE[@]}" exec -T postgres sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
    >"backup/staging-before-${timestamp}.sql" || fail "pg_dump failed."
  printf -- '- PostgreSQL backup: `%s`\n' "backup/staging-before-${timestamp}.sql" >>"${evidence_dir}/deploy-summary.md"
else
  printf '[staging-deploy][WARN] pg_dump not available in postgres container; backup skipped.\n' >&2
fi

step "Run one-off backend checks inside production container"
run_backend_pnpm uploads:check:prod | tee "${evidence_dir}/uploads-check.log"
if [[ "$RUN_DB_MIGRATIONS" == "true" ]]; then
  run_backend_pnpm migration:run:prod | tee "${evidence_dir}/migration.log"
else
  printf '[staging-deploy][WARN] RUN_DB_MIGRATIONS=false; migrations skipped.\n' >&2
fi
run_backend_pnpm db:check-critical-tables:prod | tee "${evidence_dir}/critical-tables.log"

step "Start staging API, worker, and nginx"
"${COMPOSE[@]}" up -d --no-build --force-recreate backend subagent-worker nginx
wait_for_service_healthy backend
wait_for_service_healthy subagent-worker
wait_for_service_healthy nginx
"${COMPOSE[@]}" ps | tee "${evidence_dir}/compose-ps.txt"
"${COMPOSE[@]}" logs --tail=220 backend subagent-worker nginx >"${evidence_dir}/compose-logs-tail.txt" 2>&1 || true

if [[ "$RUN_STAGING_VERIFY" == "true" ]]; then
  step "Run staging verification"
  BASE_URL="$PUBLIC_BASE_URL" \
    API_BASE_URL="$PUBLIC_API_BASE_URL" \
    EXPECTED_RELEASE_COMMIT="$release_commit" \
    RUN_STAGING_E2E="$RUN_STAGING_E2E" \
    RUN_STAGING_FAULT_INJECTION="$RUN_STAGING_FAULT_INJECTION" \
    STAGING_EVIDENCE_DIR="$evidence_dir" \
    ./scripts/verify-staging.sh | tee "${evidence_dir}/verify-staging.log"
fi

{
  printf '\n## Rollback\n\n'
  printf 'Use this if staging validation fails after deploy:\n\n'
  printf '```bash\n'
  printf 'cd %q\n' "$APP_DIR"
  printf 'APP_DIR=%q PUBLIC_BASE_URL=%q PUBLIC_API_BASE_URL=%q ROLLBACK_SOURCE=/opt/fitmeet-staging.backup.<timestamp> ROLLBACK_DB_BACKUP_REF=backup/staging-before-%s.sql ROLLBACK_MIGRATION_COMPATIBILITY_ACK=true bash ./scripts/rollback-staging-ecs.sh\n' "$APP_DIR" "$PUBLIC_BASE_URL" "$PUBLIC_API_BASE_URL" "$timestamp"
  printf '```\n'
} >>"${evidence_dir}/deploy-summary.md"

printf '\n[staging-deploy][DONE] Evidence: %s\n' "$evidence_dir"
