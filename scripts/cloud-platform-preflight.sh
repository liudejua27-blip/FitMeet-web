#!/usr/bin/env bash
set -euo pipefail

WEB_ORIGIN="${WEB_ORIGIN:-https://socialworld.world}"
API_BASE_URL="${API_BASE_URL:-https://api.socialworld.world/api}"
CHECK_DOMAIN="${CHECK_DOMAIN:-false}"
STRICT="${STRICT:-false}"
VERCEL_PROJECT_SLUG="${VERCEL_PROJECT_SLUG:-fit-meetweb}"
VERCEL_TEAM_SLUG="${VERCEL_TEAM_SLUG:-liuchongjiang-s-projects}"
FITMEET_PREFLIGHT_TIMEOUT_SECONDS="${FITMEET_PREFLIGHT_TIMEOUT_SECONDS:-20}"

usage() {
  cat <<'EOF'
Usage: scripts/cloud-platform-preflight.sh [--check-domain] [--strict]

Checks the FitMeet Railway + Vercel deployment prerequisites without mutating
remote services:
  - Required deployment files exist and JSON configs parse.
  - Vercel frontend env template uses the expected same-origin API setup.
  - Railway backend env template uses the expected public origins.
  - Vercel CLI is available; VERCEL_TOKEN auth and deployment identity are
    verified when provided.
  - Railway CLI is available; RAILWAY_TOKEN auth is verified when provided.
  - Optional public DNS/TLS/API health check through domain-readiness-check.sh.

Environment:
  WEB_ORIGIN           Public Web origin. Default: https://socialworld.world.
  API_BASE_URL         Public API base. Default: https://api.socialworld.world/api.
  CHECK_DOMAIN=true    Also run scripts/domain-readiness-check.sh.
  STRICT=true          Treat missing CLI auth, missing CLI tools, or domain
                       preflight failure as fatal. In default mode they are
                       reported as warnings because dashboard deploys may be used.
  VERCEL_TOKEN         Optional Vercel token for `vercel whoami`.
  VERCEL_ORG_ID        Optional Vercel org/team id for noninteractive deploys.
  VERCEL_PROJECT_ID    Optional Vercel project id for noninteractive deploys.
  RAILWAY_TOKEN        Optional Railway token for `railway whoami`.
  FITMEET_PREFLIGHT_TIMEOUT_SECONDS
                       Per-command CLI probe timeout. Default: 20.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check-domain)
      CHECK_DOMAIN=true
      ;;
    --strict)
      STRICT=true
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

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WARNINGS=0

# shellcheck source=scripts/lib/toolchain.sh
source "${ROOT_DIR}/scripts/lib/toolchain.sh"
fitmeet_bootstrap_toolchain

ok() {
  printf '[OK] %s\n' "$1"
}

warn() {
  WARNINGS=$((WARNINGS + 1))
  printf '[WARN] %s\n' "$1" >&2
}

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

require_file() {
  local rel="$1"
  [[ -f "${ROOT_DIR}/${rel}" ]] || fail "Missing required file: ${rel}"
  ok "Found ${rel}"
}

parse_json() {
  local rel="$1"
  node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" \
    "${ROOT_DIR}/${rel}" >/dev/null
  ok "Parsed ${rel}"
}

contains() {
  local rel="$1"
  local needle="$2"
  grep -Fq "${needle}" "${ROOT_DIR}/${rel}" ||
    fail "${rel} does not contain expected value: ${needle}"
  ok "${rel} contains ${needle}"
}

command_succeeds_with_timeout() {
  local seconds="${FITMEET_PREFLIGHT_TIMEOUT_SECONDS}"
  local pid
  local elapsed=0

  if command -v perl >/dev/null 2>&1; then
    perl -MPOSIX=WNOHANG -e '
      my $timeout = shift @ARGV;
      my $pid = fork();
      if (!defined $pid) {
        exit 127;
      }
      if ($pid == 0) {
        exec @ARGV;
        exit 127;
      }
      my $deadline = time + $timeout;
      while (1) {
        my $done = waitpid($pid, WNOHANG);
        if ($done == $pid) {
          exit($? == 0 ? 0 : (($? >> 8) || 1));
        }
        if (time >= $deadline) {
          kill "TERM", $pid;
          select undef, undef, undef, 0.2;
          kill "KILL", $pid;
          waitpid($pid, 0);
          exit 124;
        }
        select undef, undef, undef, 0.1;
      }
    ' "${seconds}" "$@" >/dev/null 2>&1
    return $?
  fi

  "$@" >/dev/null 2>&1 &
  pid=$!

  while kill -0 "${pid}" >/dev/null 2>&1; do
    if [[ "${elapsed}" -ge "${seconds}" ]]; then
      if command -v pkill >/dev/null 2>&1; then
        pkill -TERM -P "${pid}" >/dev/null 2>&1 || true
      fi
      kill -TERM "${pid}" >/dev/null 2>&1 || true
      sleep 1
      if kill -0 "${pid}" >/dev/null 2>&1; then
        if command -v pkill >/dev/null 2>&1; then
          pkill -KILL -P "${pid}" >/dev/null 2>&1 || true
        fi
        kill -KILL "${pid}" >/dev/null 2>&1 || true
      fi
      wait "${pid}" >/dev/null 2>&1 || true
      return 124
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  if wait "${pid}"; then
    return 0
  fi
  return 1
}

check_vercel_cli() {
  if ! command -v pnpm >/dev/null 2>&1; then
    warn "pnpm is not available; cannot check Vercel CLI. Use Corepack/pnpm before CLI deploy."
    return
  fi

  if command_succeeds_with_timeout pnpm dlx vercel --version; then
    ok "Vercel CLI is reachable through pnpm dlx."
  else
    warn "Vercel CLI is not reachable through pnpm dlx within ${FITMEET_PREFLIGHT_TIMEOUT_SECONDS}s."
    return
  fi

  if [[ -n "${VERCEL_TOKEN:-}" ]]; then
    if command_succeeds_with_timeout pnpm dlx vercel whoami --token="${VERCEL_TOKEN}"; then
      ok "VERCEL_TOKEN authenticates with Vercel CLI."
    else
      warn "VERCEL_TOKEN did not authenticate with Vercel CLI within ${FITMEET_PREFLIGHT_TIMEOUT_SECONDS}s."
    fi
  else
    warn "VERCEL_TOKEN is not set. Browser login or dashboard deploy is still required for Vercel."
  fi
}

check_vercel_deploy_identity() {
  local has_local_link=false

  if [[ -f "${ROOT_DIR}/.vercel/project.json" ]]; then
    if node -e '
      const fs = require("fs");
      const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      if (!data.orgId || !data.projectId) process.exit(1);
    ' "${ROOT_DIR}/.vercel/project.json" >/dev/null 2>&1; then
      has_local_link=true
      ok "Found local .vercel/project.json with orgId and projectId."
    else
      warn "Local .vercel/project.json exists but does not contain both orgId and projectId."
    fi
  else
    warn "Local .vercel/project.json is not present. Run 'pnpm dlx vercel link --yes --project ${VERCEL_PROJECT_SLUG} --scope ${VERCEL_TEAM_SLUG}' after login, or use CI VERCEL_ORG_ID/VERCEL_PROJECT_ID secrets."
  fi

  if [[ -n "${VERCEL_ORG_ID:-}" && -n "${VERCEL_PROJECT_ID:-}" ]]; then
    ok "VERCEL_ORG_ID and VERCEL_PROJECT_ID are set for noninteractive Vercel deploys."
  elif [[ "${has_local_link}" == "true" ]]; then
    warn "VERCEL_ORG_ID and VERCEL_PROJECT_ID are not both set; local CLI deploy can use .vercel/project.json, but CI/prebuilt deploys still need project secrets."
  else
    warn "VERCEL_ORG_ID and VERCEL_PROJECT_ID are not both set, and no local Vercel link exists. Noninteractive Vercel deploy cannot run from this shell."
  fi
}

check_railway_cli() {
  if ! command -v railway >/dev/null 2>&1; then
    warn "Railway CLI is not installed. Use Railway dashboard or install/login the CLI."
    return
  fi

  if command_succeeds_with_timeout railway --version; then
    ok "Railway CLI is installed."
  else
    warn "Railway CLI exists but did not return a version within ${FITMEET_PREFLIGHT_TIMEOUT_SECONDS}s."
  fi

  if [[ -n "${RAILWAY_TOKEN:-}" ]]; then
    if command_succeeds_with_timeout env RAILWAY_TOKEN="${RAILWAY_TOKEN}" railway whoami; then
      ok "RAILWAY_TOKEN authenticates with Railway CLI."
    else
      warn "RAILWAY_TOKEN did not authenticate with Railway CLI within ${FITMEET_PREFLIGHT_TIMEOUT_SECONDS}s."
    fi
  else
    warn "RAILWAY_TOKEN is not set. Railway dashboard deploy/login is still required."
  fi
}

cd "${ROOT_DIR}"

require_file 'vercel.json'
require_file '.vercelignore'
require_file 'backend/railway.json'
require_file 'backend/railway.toml'
require_file 'backend/Dockerfile.prod'
require_file 'backend/.dockerignore'
require_file 'deploy/env.production.vercel.example'
require_file 'deploy/env.production.railway.example'
require_file 'scripts/domain-readiness-check.sh'
require_file 'scripts/vercel-prebuilt-deploy.sh'
require_file 'scripts/verify-production.sh'
require_file 'docs/deployment/cloud-vercel-railway.md'

parse_json 'vercel.json'
parse_json 'backend/railway.json'

contains 'deploy/env.production.vercel.example' 'VITE_API_BASE_URL=/api'
contains 'deploy/env.production.vercel.example' 'VITE_WS_BASE_URL=https://api.socialworld.world'
contains 'deploy/env.production.railway.example' 'BASE_URL=https://api.socialworld.world'
contains 'deploy/env.production.railway.example' 'FRONTEND_BASE_URL=https://socialworld.world'
contains 'deploy/env.production.railway.example' 'ALLOWED_ORIGINS=https://socialworld.world,https://www.socialworld.world'
contains 'docs/deployment/cloud-vercel-railway.md' "${VERCEL_PROJECT_SLUG}"
contains 'docs/deployment/cloud-vercel-railway.md' "${VERCEL_TEAM_SLUG}"

check_vercel_cli
check_vercel_deploy_identity
check_railway_cli

if [[ "${CHECK_DOMAIN}" == "true" ]]; then
  if WEB_ORIGIN="${WEB_ORIGIN}" API_BASE_URL="${API_BASE_URL}" \
    "${ROOT_DIR}/scripts/domain-readiness-check.sh"; then
    ok "Domain readiness passed."
  else
    warn "Domain readiness failed for ${WEB_ORIGIN} and ${API_BASE_URL}."
  fi
else
  warn "Domain readiness was not checked. Re-run with --check-domain after Vercel/Railway custom domains are configured."
fi

if [[ "${STRICT}" == "true" && "${WARNINGS}" -gt 0 ]]; then
  fail "Cloud platform preflight completed with ${WARNINGS} warning(s) in strict mode."
fi

printf '\nCloud platform preflight completed with %s warning(s).\n' "${WARNINGS}"
