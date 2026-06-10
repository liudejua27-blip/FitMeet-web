#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_ORIGIN="${WEB_ORIGIN:-https://www.ourfitmeet.cn}"
API_BASE_URL_WAS_SET="${API_BASE_URL:-}"
API_BASE_URL="${API_BASE_URL:-https://www.ourfitmeet.cn/api}"
FITMEET_LAUNCH_TOPOLOGY="${FITMEET_LAUNCH_TOPOLOGY:-vercel-railway}"
RUN_READINESS_TESTS="${RUN_READINESS_TESTS:-true}"
RUN_DOMAIN_CHECK="${RUN_DOMAIN_CHECK:-true}"
RUN_IOS_TESTFLIGHT_CHECK="${RUN_IOS_TESTFLIGHT_CHECK:-true}"
RUN_RAILWAY_DOCKER_BUILD="${RUN_RAILWAY_DOCKER_BUILD:-false}"
FITMEET_APP_DIR="${FITMEET_APP_DIR:-/Users/liuchongjiang/Documents/FitMeet app}"

# shellcheck source=scripts/lib/toolchain.sh
source "${ROOT_DIR}/scripts/lib/toolchain.sh"
fitmeet_bootstrap_toolchain

failures=0
warnings=0

usage() {
  cat <<'EOF'
Usage: scripts/launch-status.sh [--topology vercel-railway|ecs] [--include-railway-docker-build] [--skip-readiness-tests] [--skip-domain-check] [--skip-ios-testflight-check]

Aggregates the non-mutating FitMeet launch gates:
  - local deploy readiness Jest guard
  - Vercel/Railway deploy-file and CLI/auth preflight
  - public DNS/TLS/API readiness
  - iOS TestFlight signing/API/staging readiness
  - optional Railway Docker production image build proof

The script exits non-zero when a launch gate is not ready. It does not deploy,
mutate cloud resources, create users, write production data, or submit GitHub.

Environment:
  FITMEET_LAUNCH_TOPOLOGY      Launch topology: vercel-railway or ecs. Default: vercel-railway.
  WEB_ORIGIN                  Public Web origin. Default: https://www.ourfitmeet.cn.
  API_BASE_URL                Public API base. Default: https://www.ourfitmeet.cn/api,
                              or <WEB_ORIGIN>/api when topology is ecs and API_BASE_URL is not set.
  FITMEET_APP_DIR             iOS app repo path. Default: /Users/liuchongjiang/Documents/FitMeet app.
  FITMEET_PNPM_BIN_DIR        Optional pnpm bin directory to prepend to PATH.
  FITMEET_NODE_RUNTIME_DIR    Optional Node bin directory to prepend to PATH.
  RUN_READINESS_TESTS=false   Skip backend production-deploy-readiness.spec.ts.
  RUN_DOMAIN_CHECK=false      Skip public DNS/TLS/API readiness.
  RUN_IOS_TESTFLIGHT_CHECK=false
                              Skip strict iOS TestFlight readiness.
  RUN_RAILWAY_DOCKER_BUILD=true
                              Also run scripts/railway-docker-build-check.sh.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --topology)
      FITMEET_LAUNCH_TOPOLOGY="${2:-}"
      shift
      ;;
    --include-railway-docker-build)
      RUN_RAILWAY_DOCKER_BUILD=true
      ;;
    --skip-readiness-tests)
      RUN_READINESS_TESTS=false
      ;;
    --skip-domain-check)
      RUN_DOMAIN_CHECK=false
      ;;
    --skip-ios-testflight-check)
      RUN_IOS_TESTFLIGHT_CHECK=false
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

WEB_ORIGIN="${WEB_ORIGIN%/}"
if [[ "${FITMEET_LAUNCH_TOPOLOGY}" == "ecs" && -z "${API_BASE_URL_WAS_SET}" ]]; then
  API_BASE_URL="${WEB_ORIGIN}/api"
fi
API_BASE_URL="${API_BASE_URL%/}"

pass() {
  printf '[PASS] %s\n' "$1"
}

warn() {
  warnings=$((warnings + 1))
  printf '[WARN] %s\n' "$1" >&2
}

fail() {
  failures=$((failures + 1))
  printf '[FAIL] %s\n' "$1" >&2
}

run_gate() {
  local label="$1"
  shift
  local output

  printf '\n==> %s\n' "${label}"
  output="$("$@" 2>&1)"
  local status=$?
  printf '%s\n' "${output}"
  if [[ "${status}" -eq 0 ]]; then
    pass "${label}"
  else
    fail "${label}"
  fi
}

cd "${ROOT_DIR}" || exit 1

if [[ "${FITMEET_LAUNCH_TOPOLOGY}" != "vercel-railway" && "${FITMEET_LAUNCH_TOPOLOGY}" != "ecs" ]]; then
  fail "FITMEET_LAUNCH_TOPOLOGY must be vercel-railway or ecs."
fi

run_gate "Shell syntax for production scripts" \
  bash -n \
  scripts/cloud-platform-preflight.sh \
  scripts/domain-readiness-check.sh \
  scripts/vercel-prebuilt-deploy.sh \
  scripts/verify-production.sh \
  scripts/railway-docker-build-check.sh \
  scripts/ecs-install-release.sh \
  scripts/ecs-upload-release.sh \
  scripts/ecs-workbench-install-plan.sh \
  scripts/ecs-post-deploy-smoke.sh \
  scripts/launch-status.sh

if [[ -d "${FITMEET_APP_DIR}" ]]; then
  run_gate "iOS release script syntax" \
    bash -n \
    "${FITMEET_APP_DIR}/Scripts/release-preflight-ios.sh" \
    "${FITMEET_APP_DIR}/Scripts/ecs-release-preflight-ios.sh" \
    "${FITMEET_APP_DIR}/Scripts/testflight-readiness-check.sh" \
    "${FITMEET_APP_DIR}/Scripts/testflight-archive.sh"
else
  fail "iOS release script syntax"
  warn "FITMEET_APP_DIR does not exist: ${FITMEET_APP_DIR}"
fi

if [[ "${RUN_READINESS_TESTS}" == "true" ]]; then
  if command -v pnpm >/dev/null 2>&1; then
    run_gate "Backend production deploy readiness tests" \
      pnpm --dir backend test -- production-deploy-readiness.spec.ts
  else
    fail "Backend production deploy readiness tests"
    warn "pnpm is not available on PATH."
  fi
else
  warn "Skipped backend production deploy readiness tests."
fi

if [[ "${FITMEET_LAUNCH_TOPOLOGY}" == "vercel-railway" ]]; then
  run_gate "Vercel/Railway platform preflight" \
    env WEB_ORIGIN="${WEB_ORIGIN}" API_BASE_URL="${API_BASE_URL}" STRICT=true \
    ./scripts/cloud-platform-preflight.sh
else
  warn "Skipped Vercel/Railway platform preflight for ECS topology."
fi

if [[ "${RUN_DOMAIN_CHECK}" == "true" ]]; then
  run_gate "Public DNS/TLS/API readiness" \
    env FITMEET_LAUNCH_TOPOLOGY="${FITMEET_LAUNCH_TOPOLOGY}" \
    WEB_ORIGIN="${WEB_ORIGIN}" API_BASE_URL="${API_BASE_URL}" \
    ./scripts/domain-readiness-check.sh --topology "${FITMEET_LAUNCH_TOPOLOGY}"
else
  warn "Skipped public DNS/TLS/API readiness."
fi

if [[ "${RUN_IOS_TESTFLIGHT_CHECK}" == "true" ]]; then
  if [[ -x "${FITMEET_APP_DIR}/Scripts/testflight-readiness-check.sh" ]]; then
    run_gate "iOS TestFlight readiness" \
      env FITMEET_ALPHA_EXPECTED_API_BASE_URL="${API_BASE_URL}" \
      "${FITMEET_APP_DIR}/Scripts/testflight-readiness-check.sh" \
      --strict \
      --require-staging \
      --expected-api-base "${API_BASE_URL}"
  else
    fail "iOS TestFlight readiness"
    warn "Missing executable script: ${FITMEET_APP_DIR}/Scripts/testflight-readiness-check.sh"
  fi
else
  warn "Skipped iOS TestFlight readiness."
fi

if [[ "${RUN_RAILWAY_DOCKER_BUILD}" == "true" && "${FITMEET_LAUNCH_TOPOLOGY}" == "vercel-railway" ]]; then
  run_gate "Railway production Docker image build" \
    ./scripts/railway-docker-build-check.sh
elif [[ "${RUN_RAILWAY_DOCKER_BUILD}" == "true" ]]; then
  warn "Skipped Railway production Docker image build for ECS topology."
elif [[ "${FITMEET_LAUNCH_TOPOLOGY}" == "ecs" ]]; then
  warn "Skipped Railway production Docker image build; not required for ECS topology."
else
  warn "Skipped Railway production Docker image build. Re-run with --include-railway-docker-build before Railway deploy."
fi

printf '\nLaunch status: %s failure(s), %s warning(s).\n' "${failures}" "${warnings}"
if [[ "${failures}" -gt 0 ]]; then
  exit 1
fi
