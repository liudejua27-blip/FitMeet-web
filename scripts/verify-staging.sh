#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://staging.ourfitmeet.cn}"
API_BASE_URL="${API_BASE_URL:-}"
EXPECTED_RELEASE_COMMIT="${EXPECTED_RELEASE_COMMIT:-}"
RUN_STAGING_E2E="${RUN_STAGING_E2E:-false}"
RUN_STAGING_FAULT_INJECTION="${RUN_STAGING_FAULT_INJECTION:-false}"
STAGING_EVIDENCE_DIR="${STAGING_EVIDENCE_DIR:-artifacts/staging/$(date -u '+%Y%m%dT%H%M%SZ')}"

usage() {
  cat <<'EOF'
Usage: scripts/verify-staging.sh

Runs the non-production staging gate:
  1. health/readiness/OpenAPI/Discover/auth guard verification
  2. optional real-browser Agent public-loop E2E
  3. optional staging fault injection harness

Environment:
  BASE_URL=https://staging.ourfitmeet.cn
  API_BASE_URL=https://staging.ourfitmeet.cn/api
  EXPECTED_RELEASE_COMMIT=<sha>
  RUN_STAGING_E2E=true
  RUN_STAGING_FAULT_INJECTION=true
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
  printf '[staging-verify][FAIL] %s\n' "$1" >&2
  exit 1
}

[[ -n "$BASE_URL" ]] || fail "Set BASE_URL to the staging Web origin."
BASE_URL="${BASE_URL%/}"
if [[ "$BASE_URL" == "https://www.ourfitmeet.cn" || "$BASE_URL" == "https://ourfitmeet.cn" ]]; then
  fail "Refusing to run staging verification against production domain: ${BASE_URL}"
fi
if [[ -z "$API_BASE_URL" ]]; then
  API_BASE_URL="${BASE_URL}/api"
else
  API_BASE_URL="${API_BASE_URL%/}"
fi
if [[ "$API_BASE_URL" == "https://www.ourfitmeet.cn/api" || "$API_BASE_URL" == "https://ourfitmeet.cn/api" ]]; then
  fail "Refusing to run staging verification against production API: ${API_BASE_URL}"
fi

mkdir -p "$STAGING_EVIDENCE_DIR"

printf '[staging-verify] Base URL: %s\n' "$BASE_URL"
printf '[staging-verify] API Base URL: %s\n' "$API_BASE_URL"
printf '[staging-verify] Evidence: %s\n' "$STAGING_EVIDENCE_DIR"

BASE_URL="$BASE_URL" \
  API_BASE_URL="$API_BASE_URL" \
  EXPECTED_RELEASE_COMMIT="$EXPECTED_RELEASE_COMMIT" \
  CHECK_LOCAL_COMPOSE_HEALTH="${CHECK_LOCAL_COMPOSE_HEALTH:-false}" \
  bash ./scripts/verify-production.sh

if [[ "$RUN_STAGING_E2E" == "true" ]]; then
  BASE_URL="$BASE_URL" \
    API_BASE_URL="$API_BASE_URL" \
    EXPECTED_RELEASE_COMMIT="$EXPECTED_RELEASE_COMMIT" \
    STAGING_E2E_OUTPUT_DIR="$STAGING_EVIDENCE_DIR/e2e" \
    FITMEET_AGENT_BROWSER_QA_ALLOW_REMOTE=true \
    pnpm --dir frontend exec node scripts/qa-agent-public-loop-staging.mjs
else
  printf '[staging-verify][SKIP] RUN_STAGING_E2E=%s\n' "$RUN_STAGING_E2E"
fi

if [[ "$RUN_STAGING_FAULT_INJECTION" == "true" ]]; then
  BASE_URL="$BASE_URL" \
    API_BASE_URL="$API_BASE_URL" \
    EXPECTED_RELEASE_COMMIT="$EXPECTED_RELEASE_COMMIT" \
    STAGING_EVIDENCE_DIR="$STAGING_EVIDENCE_DIR/fault-injection" \
    bash ./scripts/staging-fault-injection.sh
else
  printf '[staging-verify][SKIP] RUN_STAGING_FAULT_INJECTION=%s\n' "$RUN_STAGING_FAULT_INJECTION"
fi

printf '[staging-verify][DONE]\n'
