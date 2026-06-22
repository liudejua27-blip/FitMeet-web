#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${APP_DIR:-${ROOT_DIR}}"
BASE_URL="${BASE_URL:-https://www.ourfitmeet.cn}"
API_BASE_URL="${API_BASE_URL:-${BASE_URL%/}/api}"
EXPECTED_RELEASE_COMMIT="${EXPECTED_RELEASE_COMMIT:-}"
PREPARE_APP_SMOKE_USERS="${PREPARE_APP_SMOKE_USERS:-false}"
PREPARE_AGENT_SMOKE_SEED="${PREPARE_AGENT_SMOKE_SEED:-false}"
RUN_APP_SMOKE="${RUN_APP_SMOKE:-false}"
RUN_AGENT_OPPORTUNITY_SMOKE="${RUN_AGENT_OPPORTUNITY_SMOKE:-false}"
RUN_AGENT_20_TURN_MEMORY_SMOKE="${RUN_AGENT_20_TURN_MEMORY_SMOKE:-false}"
RUN_AGENT_EMPTY_CANDIDATE_SMOKE="${RUN_AGENT_EMPTY_CANDIDATE_SMOKE:-false}"
RUN_AGENT_SSE_ABORT_SMOKE="${RUN_AGENT_SSE_ABORT_SMOKE:-false}"
RUN_PUBLIC_INTENT_WRITE="${RUN_PUBLIC_INTENT_WRITE:-false}"
APP_SMOKE_RUN_MUTATIONS="${APP_SMOKE_RUN_MUTATIONS:-true}"
SCAN_COMPOSE_LOGS="${SCAN_COMPOSE_LOGS:-auto}"
COMPOSE_LOG_TAIL="${COMPOSE_LOG_TAIL:-600}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-20}"

# shellcheck source=scripts/lib/toolchain.sh
source "${ROOT_DIR}/scripts/lib/toolchain.sh"
fitmeet_bootstrap_toolchain

usage() {
  cat <<'EOF'
Usage: scripts/ecs-post-deploy-smoke.sh [options]

Runs the FitMeet post-deploy verification sequence for the Aliyun ECS topology.
By default this is non-destructive: frontend, health, readiness, OpenAPI,
public feed, and auth guards.

Options:
  --base-url URL                 Public Web origin. Default: https://www.ourfitmeet.cn
  --api-base-url URL             Public API base. Default: <base-url>/api
  --expect-release-commit SHA    Expected backend release commit prefix from /api/health.
                                 Defaults to ./release.json commit when available.
  --prepare-app-smoke-users      Create/update dedicated smoke users first.
  --prepare-agent-smoke-seed     Create/update dedicated Agent smoke users/candidates.
  --run-app-smoke                Run authenticated Web/App smoke against API.
  --run-agent-opportunity-readiness-smoke
                                 Run authenticated Agent opportunity smoke through
                                 clarification and OpportunityCard readiness only.
  --run-agent-opportunity-smoke  Run authenticated full Agent opportunity journey smoke.
  --run-agent-20-turn-memory-smoke
                                 Run authenticated Agent 20-turn task-memory smoke.
  --run-agent-empty-candidate-smoke
                                 Run authenticated Agent empty-candidate recovery smoke.
  --run-agent-sse-abort-smoke    Run Agent SSE visibility/abort smoke:
                                 early visible status, no proxy buffering, then
                                 abort after the first assistant delta.
  --run-public-intent-write      Also write/read-back a public social intent.
  --scan-compose-logs            Scan backend/worker logs for production failure patterns.
  --no-scan-compose-logs         Skip compose log scan.
  --help                         Show this help.

Environment:
  APP_DIR                        Deployed repo path. Default: this repo.
  APP_SMOKE_SEED_PASSWORD        Required with --prepare-app-smoke-users.
  APP_SMOKE_SEED_ALLOW_PRODUCTION=true
                                 Required by the seed script in NODE_ENV=production.
  APP_SMOKE_EMAIL/PASSWORD/TARGET_USER_ID
                                 Required with --run-app-smoke unless users are prepared
                                 in the same invocation.
  APP_SMOKE_RUN_MUTATIONS=true   Run avatar/feed/message write/read-back smoke.
  AGENT_SMOKE_EMAIL/PASSWORD     Required with --run-agent-opportunity-readiness-smoke,
                                 --run-agent-opportunity-smoke,
                                 --run-agent-20-turn-memory-smoke,
                                 --run-agent-empty-candidate-smoke, or
                                 --run-agent-sse-abort-smoke unless
                                 --prepare-agent-smoke-seed is used.
  AGENT_SMOKE_SEED_ALLOW_PRODUCTION=true
                                 Required by the Agent seed script in NODE_ENV=production.
  AGENT_SMOKE_ALLOW_MUTATIONS=true
                                 Required for --run-agent-opportunity-readiness-smoke or
                                 --run-agent-opportunity-smoke or
                                 --run-agent-20-turn-memory-smoke or
                                 --run-agent-empty-candidate-smoke unless
                                 --prepare-agent-smoke-seed is used in the same invocation.
                                 Readiness writes chat/search smoke data. Full smoke can
                                 generate invitations, activities, reviews, and Life Graph
                                 actions. Only use with dedicated smoke users.
  AGENT_SMOKE_EMPTY_CANDIDATE_MESSAGE
                                 Optional impossible-supply prompt used by the empty-candidate
                                 recovery smoke. Defaults to a deliberately unrealistic
                                 public-candidate request.
  AGENT_SMOKE_REPORT_STDOUT=true
                                 Print structured Agent opportunity smoke JSON reports into
                                 the post-deploy log/evidence stream. Defaults to true for
                                 Agent opportunity smoke modes.
  AGENT_SMOKE_REPORT_FILE        Optional path inside the one-off backend container for a
                                 structured Agent opportunity smoke report.
  AGENT_SMOKE_CITY/ACTIVITY/TIME/INTENSITY
                                 Optional scenario knobs for Agent opportunity smoke.
                                 Defaults align with seed: city from seed, 咖啡轻聊天,
                                 周末下午, 轻松.
  AGENT_SSE_SKIP_ACCEL_BUFFERING_HEADER=true
                                 Skip the X-Accel-Buffering header assertion for
                                 non-nginx local smoke only. Do not use for ECS.
  EXPECTED_RELEASE_COMMIT        Same as --expect-release-commit.
  SCAN_COMPOSE_LOGS=auto|true|false
                                 Default auto. Scans logs when docker compose files exist.
  COMPOSE_LOG_TAIL=600           Number of recent log lines to scan per service.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="${2:-}"
      shift
      ;;
    --api-base-url)
      API_BASE_URL="${2:-}"
      shift
      ;;
    --expect-release-commit)
      EXPECTED_RELEASE_COMMIT="${2:-}"
      shift
      ;;
    --prepare-app-smoke-users)
      PREPARE_APP_SMOKE_USERS=true
      ;;
    --prepare-agent-smoke-seed)
      PREPARE_AGENT_SMOKE_SEED=true
      ;;
    --run-app-smoke)
      RUN_APP_SMOKE=true
      ;;
    --run-agent-opportunity-smoke)
      RUN_AGENT_OPPORTUNITY_SMOKE=true
      ;;
    --run-agent-opportunity-readiness-smoke)
      RUN_AGENT_OPPORTUNITY_SMOKE=readiness
      ;;
    --run-agent-20-turn-memory-smoke)
      RUN_AGENT_20_TURN_MEMORY_SMOKE=true
      ;;
    --run-agent-empty-candidate-smoke)
      RUN_AGENT_EMPTY_CANDIDATE_SMOKE=true
      ;;
    --run-agent-sse-abort-smoke)
      RUN_AGENT_SSE_ABORT_SMOKE=true
      ;;
    --run-public-intent-write)
      RUN_PUBLIC_INTENT_WRITE=true
      ;;
    --scan-compose-logs)
      SCAN_COMPOSE_LOGS=true
      ;;
    --no-scan-compose-logs)
      SCAN_COMPOSE_LOGS=false
      ;;
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
  shift
done

BASE_URL="${BASE_URL%/}"
API_BASE_URL="${API_BASE_URL%/}"
APP_DIR="${APP_DIR%/}"
if [[ -z "${EXPECTED_RELEASE_COMMIT}" && -f "${APP_DIR}/release.json" ]]; then
  EXPECTED_RELEASE_COMMIT="$(
    node -e "const fs=require('fs');const r=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(String(r.commit||''));" \
      "${APP_DIR}/release.json" 2>/dev/null || true
  )"
fi

info() {
  printf '[post-deploy] %s\n' "$1" >&2
}

fail() {
  printf '[post-deploy][FAIL] %s\n' "$1" >&2
  exit 1
}

is_truthy() {
  case "${1:-}" in
    1|true|TRUE|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required."
}

run_agent_remote_preflight() {
  local mode="$1"
  [[ -x "${ROOT_DIR}/scripts/agent-remote-smoke-preflight.sh" ]] ||
    fail "scripts/agent-remote-smoke-preflight.sh is required and must be executable."

  info "Running Agent remote smoke safety preflight (${mode})."
  AGENT_SMOKE_ALLOW_REMOTE=true \
    "${ROOT_DIR}/scripts/agent-remote-smoke-preflight.sh" "--${mode}" --api-base-url "${API_BASE_URL}"
}

should_scan_compose_logs() {
  if [[ "${SCAN_COMPOSE_LOGS}" == "false" ]]; then
    return 1
  fi
  if [[ "${SCAN_COMPOSE_LOGS}" == "true" ]]; then
    return 0
  fi
  [[ -f "${COMPOSE_FILE}" && -f "${ENV_FILE}" ]] &&
    command -v docker >/dev/null 2>&1 &&
    docker compose version >/dev/null 2>&1
}

scan_compose_logs() {
  local compose=(docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}")
  local services=(backend subagent-worker)
  local pattern
  pattern='EACCES|relation "[^"]+" does not exist|fk_agent_activity_logs_connection|foreign key constraint|ERR_PNPM_LOCKFILE_CONFIG_MISMATCH|ts-node: not found|yaml: did not find expected key|UnhandledPromiseRejection|\bERROR\b'

  for service in "${services[@]}"; do
    local log_file
    log_file="$(mktemp)"
    if ! "${compose[@]}" logs --tail="${COMPOSE_LOG_TAIL}" "${service}" >"${log_file}" 2>&1; then
      rm -f "${log_file}"
      fail "Unable to read docker compose logs for ${service}."
    fi
    if grep -Eiq "${pattern}" "${log_file}"; then
      echo "[post-deploy][FAIL] Recent ${service} logs contain production failure patterns:" >&2
      grep -Ein "${pattern}" "${log_file}" | tail -40 >&2
      rm -f "${log_file}"
      exit 1
    fi
    rm -f "${log_file}"
  done
}

[[ -d "${APP_DIR}" ]] || fail "APP_DIR does not exist: ${APP_DIR}"
cd "${APP_DIR}"

require_command node
require_command curl

if [[ "${PREPARE_APP_SMOKE_USERS}" == "true" ]]; then
  require_command pnpm
  [[ -n "${APP_SMOKE_SEED_PASSWORD:-}" ]] ||
    fail "APP_SMOKE_SEED_PASSWORD is required with --prepare-app-smoke-users."

  seed_output="$(mktemp)"
  trap 'rm -f "${seed_output}"' EXIT

  info "Preparing dedicated smoke users."
  pnpm -C backend run seed:app-smoke-users | tee "${seed_output}" >&2

  export_file="$(mktemp)"
  grep -E '^export APP_SMOKE_(EMAIL|PASSWORD|TARGET_USER_ID)=' "${seed_output}" >"${export_file}" ||
    fail "Smoke seed output did not include APP_SMOKE_* exports."

  # The seed script validates inputs and shell-quotes values before printing exports.
  # shellcheck disable=SC1090
  source "${export_file}"
  rm -f "${export_file}"
fi

if [[ "${PREPARE_AGENT_SMOKE_SEED}" == "true" ]]; then
  if ! is_truthy "${AGENT_SMOKE_SEED_ALLOW_PRODUCTION:-}"; then
    fail "AGENT_SMOKE_SEED_ALLOW_PRODUCTION=true is required with --prepare-agent-smoke-seed."
  fi
  [[ -x "./scripts/ecs-backend-pnpm.sh" ]] ||
    fail "scripts/ecs-backend-pnpm.sh is required and must be executable."

  agent_seed_output="$(mktemp)"
  trap 'rm -f "${agent_seed_output}"' EXIT

  info "Preparing dedicated Agent smoke users and candidates."
  ./scripts/ecs-backend-pnpm.sh -- seed:agent-smoke:prod -- --allow-production | tee "${agent_seed_output}" >&2

  agent_export_file="$(mktemp)"
  grep -E '^export AGENT_SMOKE_(EMAIL|PASSWORD|CITY)=' "${agent_seed_output}" >"${agent_export_file}" ||
    fail "Agent smoke seed output did not include AGENT_SMOKE_* exports."

  # The seed script validates inputs and shell-quotes values before printing exports.
  # shellcheck disable=SC1090
  source "${agent_export_file}"
  rm -f "${agent_export_file}"
  export AGENT_SMOKE_ALLOW_MUTATIONS=true
fi

verify_args=(
  --base-url "${BASE_URL}"
  --api-base-url "${API_BASE_URL}"
)

if [[ -n "${EXPECTED_RELEASE_COMMIT}" ]]; then
  verify_args+=(--expect-release-commit "${EXPECTED_RELEASE_COMMIT}")
fi

if [[ "${RUN_PUBLIC_INTENT_WRITE}" == "true" ]]; then
  verify_args+=(--run-public-intent-write)
fi

if [[ "${RUN_APP_SMOKE}" == "true" ]]; then
  [[ -n "${APP_SMOKE_EMAIL:-}" ]] || fail "APP_SMOKE_EMAIL is required with --run-app-smoke."
  [[ -n "${APP_SMOKE_PASSWORD:-}" ]] || fail "APP_SMOKE_PASSWORD is required with --run-app-smoke."
  [[ -n "${APP_SMOKE_TARGET_USER_ID:-}" ]] ||
    fail "APP_SMOKE_TARGET_USER_ID is required with --run-app-smoke."

  export APP_SMOKE_RUN_MUTATIONS
  verify_args+=(--run-app-smoke)
fi

info "Verifying ${BASE_URL} with API ${API_BASE_URL}."
TIMEOUT_SECONDS="${TIMEOUT_SECONDS}" ./scripts/verify-production.sh "${verify_args[@]}"

if [[ "${RUN_AGENT_OPPORTUNITY_SMOKE}" == "readiness" || "${RUN_AGENT_OPPORTUNITY_SMOKE}" == "true" ]]; then
  [[ -n "${AGENT_SMOKE_EMAIL:-}" ]] ||
    fail "AGENT_SMOKE_EMAIL is required with --run-agent-opportunity-readiness-smoke or --run-agent-opportunity-smoke."
  [[ -n "${AGENT_SMOKE_PASSWORD:-}" ]] ||
    fail "AGENT_SMOKE_PASSWORD is required with --run-agent-opportunity-readiness-smoke or --run-agent-opportunity-smoke."
  if ! is_truthy "${AGENT_SMOKE_ALLOW_MUTATIONS:-}"; then
    fail "AGENT_SMOKE_ALLOW_MUTATIONS=true is required with --run-agent-opportunity-readiness-smoke or --run-agent-opportunity-smoke unless --prepare-agent-smoke-seed is used in the same invocation."
  fi

  if [[ "${RUN_AGENT_OPPORTUNITY_SMOKE}" == "readiness" ]]; then
    info "Running real Agent opportunity readiness smoke against ${API_BASE_URL}."
    run_agent_remote_preflight readiness
  else
    info "Running real Agent opportunity smoke against ${API_BASE_URL}."
    run_agent_remote_preflight full
  fi
  AGENT_SMOKE_API_BASE_URL="${API_BASE_URL}" \
    AGENT_SMOKE_ALLOW_REMOTE=true \
    AGENT_SMOKE_ALLOW_MUTATIONS="${AGENT_SMOKE_ALLOW_MUTATIONS}" \
    AGENT_SMOKE_STOP_AFTER_OPPORTUNITIES="$([[ "${RUN_AGENT_OPPORTUNITY_SMOKE}" == "readiness" ]] && printf true || printf false)" \
    AGENT_SMOKE_CITY="${AGENT_SMOKE_CITY:-青岛}" \
    AGENT_SMOKE_ACTIVITY="${AGENT_SMOKE_ACTIVITY:-咖啡轻聊天}" \
    AGENT_SMOKE_TIME="${AGENT_SMOKE_TIME:-周末下午}" \
    AGENT_SMOKE_INTENSITY="${AGENT_SMOKE_INTENSITY:-轻松}" \
    AGENT_SMOKE_REPORT_STDOUT="${AGENT_SMOKE_REPORT_STDOUT:-true}" \
    AGENT_SMOKE_REPORT_FILE="${AGENT_SMOKE_REPORT_FILE:-}" \
    ./scripts/ecs-backend-pnpm.sh -- smoke:agent-opportunity:prod
fi

if [[ "${RUN_AGENT_20_TURN_MEMORY_SMOKE}" == "true" ]]; then
  [[ -n "${AGENT_SMOKE_EMAIL:-}" ]] ||
    fail "AGENT_SMOKE_EMAIL is required with --run-agent-20-turn-memory-smoke."
  [[ -n "${AGENT_SMOKE_PASSWORD:-}" ]] ||
    fail "AGENT_SMOKE_PASSWORD is required with --run-agent-20-turn-memory-smoke."
  if ! is_truthy "${AGENT_SMOKE_ALLOW_MUTATIONS:-}"; then
    fail "AGENT_SMOKE_ALLOW_MUTATIONS=true is required with --run-agent-20-turn-memory-smoke unless --prepare-agent-smoke-seed is used in the same invocation."
  fi

  info "Running real Agent 20-turn memory smoke against ${API_BASE_URL}."
  run_agent_remote_preflight readiness
  AGENT_SMOKE_API_BASE_URL="${API_BASE_URL}" \
    AGENT_SMOKE_ALLOW_REMOTE=true \
    AGENT_SMOKE_ALLOW_MUTATIONS="${AGENT_SMOKE_ALLOW_MUTATIONS}" \
    AGENT_SMOKE_RUN_20_TURN_MEMORY=true \
    AGENT_SMOKE_STOP_AFTER_OPPORTUNITIES=true \
    AGENT_SMOKE_REPORT_STDOUT="${AGENT_SMOKE_REPORT_STDOUT:-true}" \
    AGENT_SMOKE_REPORT_FILE="${AGENT_SMOKE_REPORT_FILE:-}" \
    ./scripts/ecs-backend-pnpm.sh -- smoke:agent-opportunity:prod
fi

if [[ "${RUN_AGENT_EMPTY_CANDIDATE_SMOKE}" == "true" ]]; then
  [[ -n "${AGENT_SMOKE_EMAIL:-}" ]] ||
    fail "AGENT_SMOKE_EMAIL is required with --run-agent-empty-candidate-smoke."
  [[ -n "${AGENT_SMOKE_PASSWORD:-}" ]] ||
    fail "AGENT_SMOKE_PASSWORD is required with --run-agent-empty-candidate-smoke."
  if ! is_truthy "${AGENT_SMOKE_ALLOW_MUTATIONS:-}"; then
    fail "AGENT_SMOKE_ALLOW_MUTATIONS=true is required with --run-agent-empty-candidate-smoke unless --prepare-agent-smoke-seed is used in the same invocation."
  fi

  info "Running real Agent empty-candidate recovery smoke against ${API_BASE_URL}."
  run_agent_remote_preflight readiness
  AGENT_SMOKE_API_BASE_URL="${API_BASE_URL}" \
    AGENT_SMOKE_ALLOW_REMOTE=true \
    AGENT_SMOKE_ALLOW_MUTATIONS="${AGENT_SMOKE_ALLOW_MUTATIONS}" \
    AGENT_SMOKE_RUN_EMPTY_CANDIDATE_FALLBACK=true \
    AGENT_SMOKE_STOP_AFTER_OPPORTUNITIES=true \
    AGENT_SMOKE_EMPTY_CANDIDATE_MESSAGE="${AGENT_SMOKE_EMPTY_CANDIDATE_MESSAGE:-}" \
    AGENT_SMOKE_REPORT_STDOUT="${AGENT_SMOKE_REPORT_STDOUT:-true}" \
    AGENT_SMOKE_REPORT_FILE="${AGENT_SMOKE_REPORT_FILE:-}" \
    ./scripts/ecs-backend-pnpm.sh -- smoke:agent-opportunity:prod
fi

if [[ "${RUN_AGENT_SSE_ABORT_SMOKE}" == "true" ]]; then
  [[ -n "${AGENT_SMOKE_EMAIL:-}" ]] ||
    fail "AGENT_SMOKE_EMAIL is required with --run-agent-sse-abort-smoke."
  [[ -n "${AGENT_SMOKE_PASSWORD:-}" ]] ||
    fail "AGENT_SMOKE_PASSWORD is required with --run-agent-sse-abort-smoke."

  info "Running real Agent SSE visibility/abort smoke against ${API_BASE_URL}."
  run_agent_remote_preflight sse-abort
  AGENT_SMOKE_API_BASE_URL="${API_BASE_URL}" \
    AGENT_SMOKE_ALLOW_REMOTE=true \
    ./scripts/ecs-backend-pnpm.sh -- smoke:agent-sse-abort:prod
fi

if should_scan_compose_logs; then
  info "Scanning recent backend/subagent-worker logs for production failure patterns."
  scan_compose_logs
else
  info "Skipping compose log scan (SCAN_COMPOSE_LOGS=${SCAN_COMPOSE_LOGS})."
fi

info "Post-deploy smoke completed."
