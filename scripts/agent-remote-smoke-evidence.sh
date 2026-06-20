#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-https://www.ourfitmeet.cn}"
API_BASE_URL="${API_BASE_URL:-${BASE_URL%/}/api}"
APP_DIR="${APP_DIR:-${ROOT_DIR}}"
MODE="${MODE:-readiness}"
PREPARE_AGENT_SMOKE_SEED="${PREPARE_AGENT_SMOKE_SEED:-false}"
SCAN_COMPOSE_LOGS="${SCAN_COMPOSE_LOGS:-true}"
EVIDENCE_DIR="${EVIDENCE_DIR:-${ROOT_DIR}/artifacts/agent-smoke-evidence}"
EVIDENCE_FILE="${EVIDENCE_FILE:-}"

# shellcheck source=scripts/lib/toolchain.sh
source "${ROOT_DIR}/scripts/lib/toolchain.sh"
fitmeet_bootstrap_toolchain

usage() {
  cat <<'EOF'
Usage: scripts/agent-remote-smoke-evidence.sh [--readiness|--full|--sse-abort|--all] [--prepare-agent-smoke-seed] [--no-scan-compose-logs] [--evidence-file PATH]

Runs the remote Agent smoke gates through scripts/ecs-post-deploy-smoke.sh and
captures a redacted evidence log. It does not store raw passwords, JWTs, bearer
tokens, or email addresses in the evidence file.

Modes:
  --readiness   OpportunityCard readiness only; stops before high-risk actions.
  --full        Full mutating opportunity journey.
  --sse-abort   SSE visibility/abort smoke.
  --all         Readiness, then full opportunity + SSE abort.

Environment:
  BASE_URL / API_BASE_URL        Target Web/API. Defaults to www.ourfitmeet.cn.
  APP_DIR                       Deployed repo path. Default: this repo.
  AGENT_SMOKE_SEED_ALLOW_PRODUCTION=true
                               Required when using --prepare-agent-smoke-seed.
  AGENT_SMOKE_EMAIL and AGENT_SMOKE_PASSWORD
                               Required when not preparing the seed in the same invocation.
  AGENT_SMOKE_ALLOW_MUTATIONS=true
                               Required for remote opportunity smoke unless the seed step sets it.

Recommended ECS command:
  AGENT_SMOKE_SEED_ALLOW_PRODUCTION=true scripts/agent-remote-smoke-evidence.sh --all --prepare-agent-smoke-seed
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --readiness)
      MODE=readiness
      ;;
    --full)
      MODE=full
      ;;
    --sse-abort)
      MODE=sse-abort
      ;;
    --all)
      MODE=all
      ;;
    --prepare-agent-smoke-seed)
      PREPARE_AGENT_SMOKE_SEED=true
      ;;
    --no-scan-compose-logs)
      SCAN_COMPOSE_LOGS=false
      ;;
    --evidence-file)
      EVIDENCE_FILE="${2:-}"
      shift
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

case "${MODE}" in
  readiness|full|sse-abort|all) ;;
  *)
    echo "[agent-smoke-evidence][FAIL] MODE must be readiness, full, sse-abort, or all." >&2
    exit 2
    ;;
esac

mkdir -p "${EVIDENCE_DIR}"
if [[ -z "${EVIDENCE_FILE}" ]]; then
  EVIDENCE_FILE="${EVIDENCE_DIR}/agent-remote-smoke-${MODE}-$(date -u +%Y%m%dT%H%M%SZ).md"
fi

redact() {
  perl -pe '
    s/((?:AGENT|APP)_SMOKE_PASSWORD=)(["'"'"']?)[^"'"'"'\s]+(["'"'"']?)/$1$2[redacted]$3/g;
    s/((?:USER_JWT|FITMEET_USER_JWT|AGENT_SMOKE_JWT|AUTHORIZATION|Authorization)=)(["'"'"']?)[^"'"'"'\s]+(["'"'"']?)/$1$2[redacted]$3/g;
    s/(Bearer\s+)[A-Za-z0-9._~+\/=-]+/${1}[redacted]/g;
    s/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/[redacted-email]/g;
  '
}

write_header() {
  {
    printf '# FitMeet Agent Remote Smoke Evidence\n\n'
    printf -- '- Generated at UTC: `%s`\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf -- '- Mode: `%s`\n' "${MODE}"
    printf -- '- Base URL: `%s`\n' "${BASE_URL}"
    printf -- '- API Base URL: `%s`\n' "${API_BASE_URL}"
    printf -- '- App dir: `%s`\n' "${APP_DIR}"
    printf -- '- Prepare Agent smoke seed: `%s`\n' "${PREPARE_AGENT_SMOKE_SEED}"
    printf -- '- Scan compose logs: `%s`\n\n' "${SCAN_COMPOSE_LOGS}"
    printf '> Secrets, JWTs, bearer tokens, and email addresses are redacted by this wrapper.\n\n'
  } >"${EVIDENCE_FILE}"
}

run_step() {
  local label="$1"
  shift
  {
    printf '\n## %s\n\n' "${label}"
    printf '```text\n'
  } >>"${EVIDENCE_FILE}"

  set +e
  "$@" 2>&1 | redact | tee -a "${EVIDENCE_FILE}"
  local status=${PIPESTATUS[0]}
  set -e

  {
    printf '```\n\n'
    printf -- '- Exit code: `%s`\n' "${status}"
  } >>"${EVIDENCE_FILE}"

  if [[ "${status}" -ne 0 ]]; then
    printf '[agent-smoke-evidence][FAIL] %s failed; evidence: %s\n' "${label}" "${EVIDENCE_FILE}" >&2
    exit "${status}"
  fi
}

prepare_agent_smoke_seed_once() {
  [[ -n "${AGENT_SMOKE_SEED_ALLOW_PRODUCTION:-}" ]] ||
    echo "[agent-smoke-evidence][WARN] AGENT_SMOKE_SEED_ALLOW_PRODUCTION is not set; seed script may refuse production writes." >&2

  local raw_output export_file status
  raw_output="$(mktemp)"
  export_file="$(mktemp)"

  {
    printf '\n## Prepare dedicated Agent smoke seed\n\n'
    printf '```text\n'
  } >>"${EVIDENCE_FILE}"

  set +e
  (
    cd "${APP_DIR}"
    pnpm -C backend run seed:agent-smoke
  ) >"${raw_output}" 2>&1
  status=$?
  redact <"${raw_output}" | tee -a "${EVIDENCE_FILE}"
  set -e

  {
    printf '```\n\n'
    printf -- '- Exit code: `%s`\n' "${status}"
  } >>"${EVIDENCE_FILE}"

  if [[ "${status}" -ne 0 ]]; then
    rm -f "${raw_output}" "${export_file}"
    printf '[agent-smoke-evidence][FAIL] Agent smoke seed failed; evidence: %s\n' "${EVIDENCE_FILE}" >&2
    exit "${status}"
  fi

  grep -E '^export AGENT_SMOKE_(EMAIL|PASSWORD|CITY)=' "${raw_output}" >"${export_file}" ||
    {
      rm -f "${raw_output}" "${export_file}"
      printf '[agent-smoke-evidence][FAIL] Agent smoke seed did not print AGENT_SMOKE_* exports.\n' >&2
      exit 1
    }

  # The seed script validates and shell-quotes exported values before printing.
  # shellcheck disable=SC1090
  source "${export_file}"
  export AGENT_SMOKE_ALLOW_MUTATIONS=true

  rm -f "${raw_output}" "${export_file}"
}

post_deploy_args() {
  local smoke_mode="$1"
  local args=(
    --base-url "${BASE_URL}"
    --api-base-url "${API_BASE_URL}"
  )

  if [[ "${smoke_mode}" == "readiness" ]]; then
    args+=(--run-agent-opportunity-readiness-smoke)
  elif [[ "${smoke_mode}" == "full" ]]; then
    args+=(--run-agent-opportunity-smoke)
  elif [[ "${smoke_mode}" == "sse-abort" ]]; then
    args+=(--run-agent-sse-abort-smoke)
  fi

  if [[ "${SCAN_COMPOSE_LOGS}" == "true" ]]; then
    args+=(--scan-compose-logs)
  else
    args+=(--no-scan-compose-logs)
  fi

  printf '%s\n' "${args[@]}"
}

run_post_deploy_smoke() {
  local smoke_mode="$1"
  mapfile -t args < <(post_deploy_args "${smoke_mode}")
  run_step "ECS post-deploy Agent ${smoke_mode} smoke" \
    env \
      APP_DIR="${APP_DIR}" \
      BASE_URL="${BASE_URL}" \
      API_BASE_URL="${API_BASE_URL}" \
      "${ROOT_DIR}/scripts/ecs-post-deploy-smoke.sh" "${args[@]}"
}

write_header

if [[ "${PREPARE_AGENT_SMOKE_SEED}" == "true" ]]; then
  prepare_agent_smoke_seed_once
fi

case "${MODE}" in
  readiness)
    run_post_deploy_smoke readiness
    ;;
  full)
    run_post_deploy_smoke full
    ;;
  sse-abort)
    run_post_deploy_smoke sse-abort
    ;;
  all)
    run_post_deploy_smoke readiness
    run_post_deploy_smoke full
    run_post_deploy_smoke sse-abort
    ;;
esac

printf '\n[agent-smoke-evidence] Wrote %s\n' "${EVIDENCE_FILE}"
