#!/usr/bin/env bash
set -euo pipefail

VERCEL_PROJECT_SLUG="${VERCEL_PROJECT_SLUG:-fit-meetweb}"
VERCEL_TEAM_SLUG="${VERCEL_TEAM_SLUG:-liuchongjiang-s-projects}"
VERCEL_ENVIRONMENT="${VERCEL_ENVIRONMENT:-production}"
VERCEL_TARGET="${VERCEL_TARGET:-prod}"
FITMEET_DEPLOY_TIMEOUT_SECONDS="${FITMEET_DEPLOY_TIMEOUT_SECONDS:-20}"
VITE_API_BASE_URL="${VITE_API_BASE_URL:-/api}"
VITE_WS_BASE_URL="${VITE_WS_BASE_URL:-https://api.socialworld.world}"
DRY_RUN=false
SKIP_FRONTEND_BUILD=false

usage() {
  cat <<'EOF'
Usage: scripts/vercel-prebuilt-deploy.sh [--dry-run] [--preview] [--skip-frontend-build]

Builds the FitMeet Vite frontend locally and deploys Vercel's prebuilt output
without using GitHub auto-deploy.

The script fails fast before any Vercel deploy when neither a local Vercel link
nor CI Vercel project secrets are available. It also probes local Vercel auth
with a bounded timeout so device-login prompts do not hang automation.

Environment:
  VERCEL_TOKEN         Optional Vercel token. Required for CI/noninteractive use.
  VERCEL_ORG_ID        Vercel team/org id for token deploys.
  VERCEL_PROJECT_ID    Vercel project id for token deploys.
  VERCEL_PROJECT_SLUG  Project slug for docs/error messages. Default: fit-meetweb.
  VERCEL_TEAM_SLUG     Team slug for docs/error messages. Default: liuchongjiang-s-projects.
  VERCEL_ENVIRONMENT   Vercel env pull target. Default: production.
  VITE_API_BASE_URL    Frontend API base. Default: /api.
  VITE_WS_BASE_URL     Frontend websocket base. Default: https://api.socialworld.world.
  FITMEET_DEPLOY_TIMEOUT_SECONDS
                       Local auth probe timeout. Default: 20.

Examples:
  scripts/vercel-prebuilt-deploy.sh --dry-run
  VERCEL_TOKEN=... VERCEL_ORG_ID=team_... VERCEL_PROJECT_ID=prj_... scripts/vercel-prebuilt-deploy.sh
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      ;;
    --preview)
      VERCEL_ENVIRONMENT=preview
      VERCEL_TARGET=preview
      ;;
    --skip-frontend-build)
      SKIP_FRONTEND_BUILD=true
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

# shellcheck source=scripts/lib/toolchain.sh
source "${ROOT_DIR}/scripts/lib/toolchain.sh"
fitmeet_bootstrap_toolchain

ok() {
  printf '[OK] %s\n' "$1"
}

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

run_with_timeout() {
  local seconds="${FITMEET_DEPLOY_TIMEOUT_SECONDS}"

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
  local pid=$!
  local elapsed=0
  while kill -0 "${pid}" >/dev/null 2>&1; do
    if [[ "${elapsed}" -ge "${seconds}" ]]; then
      kill -TERM "${pid}" >/dev/null 2>&1 || true
      sleep 1
      kill -KILL "${pid}" >/dev/null 2>&1 || true
      wait "${pid}" >/dev/null 2>&1 || true
      return 124
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  wait "${pid}"
}

has_local_vercel_link() {
  [[ -f "${ROOT_DIR}/.vercel/project.json" ]] || return 1
  node -e '
    const fs = require("fs");
    const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (!data.orgId || !data.projectId) process.exit(1);
  ' "${ROOT_DIR}/.vercel/project.json" >/dev/null 2>&1
}

require_vercel_identity() {
  if [[ -n "${VERCEL_TOKEN:-}" ]]; then
    [[ -n "${VERCEL_ORG_ID:-}" ]] ||
      fail "VERCEL_TOKEN is set, but VERCEL_ORG_ID is missing."
    [[ -n "${VERCEL_PROJECT_ID:-}" ]] ||
      fail "VERCEL_TOKEN is set, but VERCEL_PROJECT_ID is missing."
    ok "Using VERCEL_TOKEN with VERCEL_ORG_ID and VERCEL_PROJECT_ID."
    return
  fi

  if ! has_local_vercel_link; then
    fail "Missing Vercel deploy identity. Run 'pnpm dlx vercel login' and 'pnpm dlx vercel link --yes --project ${VERCEL_PROJECT_SLUG} --scope ${VERCEL_TEAM_SLUG}', or set VERCEL_TOKEN, VERCEL_ORG_ID, and VERCEL_PROJECT_ID."
  fi

  if run_with_timeout pnpm dlx vercel whoami; then
    ok "Local Vercel CLI credentials are available."
  else
    fail "Local Vercel link exists, but CLI auth is not available within ${FITMEET_DEPLOY_TIMEOUT_SECONDS}s. Run 'pnpm dlx vercel login' or use VERCEL_TOKEN."
  fi
}

vercel_args=()
if [[ -n "${VERCEL_TOKEN:-}" ]]; then
  vercel_args+=(--token "${VERCEL_TOKEN}")
fi

cd "${ROOT_DIR}"

[[ -f vercel.json ]] || fail "Missing vercel.json."
[[ -f .vercelignore ]] || fail "Missing .vercelignore."
[[ -f frontend/package.json ]] || fail "Missing frontend/package.json."

require_vercel_identity

if [[ "${SKIP_FRONTEND_BUILD}" != "true" ]]; then
  pnpm --dir frontend install --frozen-lockfile
  VITE_API_BASE_URL="${VITE_API_BASE_URL}" \
    VITE_WS_BASE_URL="${VITE_WS_BASE_URL}" \
    pnpm --dir frontend build
  ok "Frontend build completed for Vercel prebuilt deploy."
fi

if [[ "${DRY_RUN}" == "true" ]]; then
  ok "Dry run complete. Skipped Vercel pull/build/deploy."
  exit 0
fi

pnpm dlx vercel pull --yes --environment="${VERCEL_ENVIRONMENT}" "${vercel_args[@]}"

if [[ "${VERCEL_TARGET}" == "prod" ]]; then
  pnpm dlx vercel build --prod "${vercel_args[@]}"
  pnpm dlx vercel deploy --prebuilt --prod "${vercel_args[@]}"
else
  pnpm dlx vercel build "${vercel_args[@]}"
  pnpm dlx vercel deploy --prebuilt "${vercel_args[@]}"
fi
