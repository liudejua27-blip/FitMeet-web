#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_BASE_URL="${AGENT_SMOKE_API_BASE_URL:-${FITMEET_API_BASE_URL:-${API_BASE_URL:-https://www.ourfitmeet.cn/api}}}"
MODE="${MODE:-readiness}"

# shellcheck source=scripts/lib/toolchain.sh
source "${ROOT_DIR}/scripts/lib/toolchain.sh"
fitmeet_bootstrap_toolchain

usage() {
  cat <<'EOF'
Usage: scripts/agent-remote-smoke-preflight.sh [--readiness|--full|--sse-abort] [--api-base-url URL]

Checks whether the current environment is safe to run remote Agent smoke.
This script does not call the API, create users, write data, or print secrets.

Modes:
  --readiness   Check env for OpportunityCard readiness smoke.
  --full        Check env for the full mutating opportunity journey smoke.
  --sse-abort   Check env for Agent SSE abort smoke.

Required for remote opportunity smoke:
  AGENT_SMOKE_ALLOW_REMOTE=true
  AGENT_SMOKE_ALLOW_MUTATIONS=true
  AGENT_SMOKE_EMAIL + non-placeholder AGENT_SMOKE_PASSWORD, or
  USER_JWT/FITMEET_USER_JWT with AGENT_SMOKE_ALLOW_JWT_MUTATIONS=true

Dedicated account rule:
  AGENT_SMOKE_EMAIL must look like a smoke/test/qa/e2e/staging account unless
  AGENT_SMOKE_ALLOW_NON_SMOKE_USER=true is intentionally set.

Recommended ECS flow:
  scripts/ecs-post-deploy-smoke.sh --prepare-agent-smoke-seed --run-agent-opportunity-readiness-smoke --scan-compose-logs
  AGENT_SMOKE_ALLOW_MUTATIONS=true scripts/ecs-post-deploy-smoke.sh --prepare-agent-smoke-seed --run-agent-opportunity-smoke --run-agent-sse-abort-smoke --scan-compose-logs
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
    --api-base-url)
      API_BASE_URL="${2:-}"
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

API_BASE_URL="${API_BASE_URL%/}"

failures=0

fail() {
  failures=$((failures + 1))
  printf '[agent-remote-smoke-preflight][FAIL] %s\n' "$1" >&2
}

pass() {
  printf '[agent-remote-smoke-preflight][PASS] %s\n' "$1"
}

warn() {
  printf '[agent-remote-smoke-preflight][WARN] %s\n' "$1" >&2
}

is_truthy() {
  case "${1:-}" in
    1|true|TRUE|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

host_from_url() {
  node -e "try { const u=new URL(process.argv[1]); console.log(u.hostname); } catch { process.exit(2); }" "$1"
}

is_local_host() {
  case "$1" in
    localhost|127.0.0.1|::1) return 0 ;;
    *) return 1 ;;
  esac
}

looks_like_smoke_account() {
  printf '%s' "$1" | grep -Eiq '(^|[._+-])(agent-)?(smoke|test|qa|e2e|staging)([._+-]|@)'
}

looks_like_placeholder_secret() {
  local value
  value="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  case "${value}" in
    ''|replace-with-*|changeme|change-me|change_me|your-*|use-the-*|placeholder|password|test|secret|example|todo|xxx|xxxx|dummy)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

has_password_auth() {
  [[ -n "${AGENT_SMOKE_EMAIL:-}" && -n "${AGENT_SMOKE_PASSWORD:-}" ]]
}

has_jwt_auth() {
  [[ -n "${USER_JWT:-}" || -n "${FITMEET_USER_JWT:-}" ]]
}

case "${MODE}" in
  readiness|full|sse-abort) ;;
  *)
    fail "MODE must be readiness, full, or sse-abort."
    ;;
esac

if [[ -z "${API_BASE_URL}" ]]; then
  fail "API base URL is empty."
else
  pass "API base URL is set: ${API_BASE_URL}"
fi

if [[ -n "${API_BASE_URL}" ]]; then
  if ! api_host="$(host_from_url "${API_BASE_URL}")"; then
    fail "API base URL is not a valid URL: ${API_BASE_URL}"
  elif is_local_host "${api_host}"; then
    warn "API target is local (${api_host}); remote-only guards are not required."
  else
    pass "API target is remote: ${api_host}"
    if is_truthy "${AGENT_SMOKE_ALLOW_REMOTE:-}"; then
      pass "AGENT_SMOKE_ALLOW_REMOTE=true"
    else
      fail "Set AGENT_SMOKE_ALLOW_REMOTE=true for remote Agent smoke."
    fi
  fi
fi

if has_password_auth; then
  pass "AGENT_SMOKE_EMAIL + AGENT_SMOKE_PASSWORD are present."
  if looks_like_placeholder_secret "${AGENT_SMOKE_PASSWORD}"; then
    fail "AGENT_SMOKE_PASSWORD still looks like a placeholder; fill a dedicated smoke account password before remote smoke."
  else
    pass "AGENT_SMOKE_PASSWORD is not an obvious placeholder."
  fi
  if looks_like_smoke_account "${AGENT_SMOKE_EMAIL}"; then
    pass "AGENT_SMOKE_EMAIL looks like a dedicated smoke account."
  elif is_truthy "${AGENT_SMOKE_ALLOW_NON_SMOKE_USER:-}"; then
    warn "AGENT_SMOKE_ALLOW_NON_SMOKE_USER=true; make sure this is intentional."
  else
    fail "AGENT_SMOKE_EMAIL does not look like a smoke/test/qa/e2e/staging account."
  fi
elif has_jwt_auth; then
  pass "USER_JWT/FITMEET_USER_JWT is present."
  if is_truthy "${AGENT_SMOKE_ALLOW_JWT_MUTATIONS:-}"; then
    pass "AGENT_SMOKE_ALLOW_JWT_MUTATIONS=true"
  else
    fail "Set AGENT_SMOKE_ALLOW_JWT_MUTATIONS=true only for a dedicated smoke token."
  fi
else
  fail "Set AGENT_SMOKE_EMAIL + AGENT_SMOKE_PASSWORD, or USER_JWT/FITMEET_USER_JWT."
fi

if [[ "${MODE}" == "readiness" || "${MODE}" == "full" ]]; then
  if is_truthy "${AGENT_SMOKE_ALLOW_MUTATIONS:-}"; then
    pass "AGENT_SMOKE_ALLOW_MUTATIONS=true"
  else
    fail "Set AGENT_SMOKE_ALLOW_MUTATIONS=true for remote opportunity smoke; readiness still writes chat/search smoke data."
  fi
fi

if [[ "${MODE}" == "readiness" ]]; then
  pass "Readiness mode should set AGENT_SMOKE_STOP_AFTER_OPPORTUNITIES=true."
elif [[ "${MODE}" == "full" ]]; then
  warn "Full mode can send invitations, create activities, submit reviews, and exercise Life Graph proposal actions."
else
  pass "SSE abort mode checks streaming cancellation and should not run the opportunity journey."
fi

if [[ "${failures}" -gt 0 ]]; then
  printf '[agent-remote-smoke-preflight] %s failure(s)\n' "${failures}" >&2
  exit 1
fi

printf '[agent-remote-smoke-preflight] OK for mode=%s\n' "${MODE}"
