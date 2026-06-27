#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${APP_DIR:-${ROOT_DIR}}"
BASE_URL="${BASE_URL:-https://www.ourfitmeet.cn}"
API_BASE_URL="${API_BASE_URL:-${BASE_URL%/}/api}"
EXPECTED_RELEASE_COMMIT="${EXPECTED_RELEASE_COMMIT:-}"
RUN_PUBLIC_INTENT_WRITE="${RUN_PUBLIC_INTENT_WRITE:-false}"
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
public Discover intents, and auth guards.

Options:
  --base-url URL                 Public Web origin. Default: https://www.ourfitmeet.cn
  --api-base-url URL             Public API base. Default: <base-url>/api
  --expect-release-commit SHA    Expected backend release commit prefix from /api/health.
                                 Defaults to ./release.json commit when available.
  --run-public-intent-write      Also write/read-back a public social intent.
  --scan-compose-logs            Scan backend/worker logs for production failure patterns.
  --no-scan-compose-logs         Skip compose log scan.
  --help                         Show this help.

Environment:
  APP_DIR                        Deployed repo path. Default: this repo.
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

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required."
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

info "Verifying ${BASE_URL} with API ${API_BASE_URL}."
TIMEOUT_SECONDS="${TIMEOUT_SECONDS}" bash ./scripts/verify-production.sh "${verify_args[@]}"

if should_scan_compose_logs; then
  info "Scanning recent backend/subagent-worker logs for production failure patterns."
  scan_compose_logs
else
  info "Skipping compose log scan (SCAN_COMPOSE_LOGS=${SCAN_COMPOSE_LOGS})."
fi

info "Post-deploy smoke completed."
