#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${APP_DIR:-${ROOT_DIR}}"
BASE_URL="${BASE_URL:-https://socialworld.world}"
API_BASE_URL="${API_BASE_URL:-${BASE_URL%/}/api}"
PREPARE_APP_SMOKE_USERS="${PREPARE_APP_SMOKE_USERS:-false}"
RUN_APP_SMOKE="${RUN_APP_SMOKE:-false}"
RUN_PUBLIC_INTENT_WRITE="${RUN_PUBLIC_INTENT_WRITE:-false}"
APP_SMOKE_RUN_MUTATIONS="${APP_SMOKE_RUN_MUTATIONS:-true}"
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
  --base-url URL                 Public Web origin. Default: https://socialworld.world
  --api-base-url URL             Public API base. Default: <base-url>/api
  --prepare-app-smoke-users      Create/update dedicated smoke users first.
  --run-app-smoke                Run authenticated Web/App smoke against API.
  --run-public-intent-write      Also write/read-back a public social intent.
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
    --prepare-app-smoke-users)
      PREPARE_APP_SMOKE_USERS=true
      ;;
    --run-app-smoke)
      RUN_APP_SMOKE=true
      ;;
    --run-public-intent-write)
      RUN_PUBLIC_INTENT_WRITE=true
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

[[ -d "${APP_DIR}" ]] || fail "APP_DIR does not exist: ${APP_DIR}"
cd "${APP_DIR}"

require_command pnpm
require_command node
require_command curl

if [[ "${PREPARE_APP_SMOKE_USERS}" == "true" ]]; then
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

verify_args=(
  --base-url "${BASE_URL}"
  --api-base-url "${API_BASE_URL}"
)

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

info "Post-deploy smoke completed."
