#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${FITMEET_APP_DIR:-/Users/liuchongjiang/Documents/FitMeet app}"
NODE_RUNTIME_DIR="${FITMEET_NODE_RUNTIME_DIR:-/Users/liuchongjiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin}"
PNPM_BIN_DIRS=(
  "${FITMEET_PNPM_BIN_DIR:-}"
  "/Users/liuchongjiang/.local/bin"
  "/Users/liuchongjiang/Library/pnpm"
)

RUN_WEB=1
RUN_IOS=1
RUN_IOS_UI=0
RUN_LOAD_SMOKE=0
RUN_REALTIME_SMOKE=0

usage() {
  cat <<'EOF'
Usage: scripts/release-preflight.sh [--web-only] [--ios-only] [--skip-ios] [--include-ios-ui] [--include-load-smoke] [--include-realtime-smoke]

Runs the release baseline before deploying Web or publishing an iOS test build:
  - backend lint/build/test plus dry-run App contract smoke
  - frontend lint/build/test
  - fitmeet-landing lint/build/test
  - FitMeetAlpha unit tests on an available iPhone Simulator
  - optional read-only 1000-concurrency smoke for local/staging/prod targets
  - optional realtime 1000-online Socket.IO smoke for local/staging/prod targets

Environment:
  FITMEET_APP_DIR             Override the iOS app repo path.
  FITMEET_NODE_RUNTIME_DIR    Node bin directory placed first on PATH.
  FITMEET_PNPM_BIN_DIR        pnpm bin directory placed after Node on PATH.
  FITMEET_IOS_SIMULATOR_ID    Use a specific iOS Simulator UDID.
  LOAD_TEST_*                 Options for scripts/load-1000-readonly.mjs.
  REALTIME_SMOKE_*            Options for scripts/realtime-1000-online-smoke.mjs.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --web-only)
      RUN_WEB=1
      RUN_IOS=0
      ;;
    --ios-only)
      RUN_WEB=0
      RUN_IOS=1
      ;;
    --skip-ios)
      RUN_IOS=0
      ;;
    --include-ios-ui)
      RUN_IOS_UI=1
      ;;
    --include-load-smoke)
      RUN_LOAD_SMOKE=1
      ;;
    --include-realtime-smoke)
      RUN_REALTIME_SMOKE=1
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

if [[ -d "${NODE_RUNTIME_DIR}" ]]; then
  export PATH="${NODE_RUNTIME_DIR}:${PATH}"
fi
for pnpm_dir in "${PNPM_BIN_DIRS[@]}"; do
  if [[ -n "${pnpm_dir}" && -d "${pnpm_dir}" ]]; then
    export PATH="${pnpm_dir}:${PATH}"
  fi
done
export CI="${CI:-true}"

if command -v corepack >/dev/null 2>&1; then
  corepack enable
  COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack prepare "pnpm@${FITMEET_PNPM_VERSION:-10.30.3}" --activate
fi

run_step() {
  local label="$1"
  shift
  printf '\n==> %s\n' "${label}"
  "$@"
}

resolve_ios_simulator_id() {
  if [[ -n "${FITMEET_IOS_SIMULATOR_ID:-}" ]]; then
    printf '%s\n' "${FITMEET_IOS_SIMULATOR_ID}"
    return
  fi

  xcrun simctl list devices available |
    ruby -ne 'if $_.include?("iPhone") && $_ =~ /\(([0-9A-F-]{36})\)/ then puts $1; exit end'
}

if [[ "${RUN_WEB}" -eq 1 ]]; then
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "pnpm not found. Install pnpm or set FITMEET_PNPM_BIN_DIR to its bin directory." >&2
    exit 1
  fi

  run_step "backend install" pnpm --dir "${ROOT_DIR}/backend" install --frozen-lockfile
  run_step "backend lint" pnpm --dir "${ROOT_DIR}/backend" lint
  run_step "backend build" pnpm --dir "${ROOT_DIR}/backend" build
  run_step "backend database contract tests" \
    pnpm --dir "${ROOT_DIR}/backend" test -- migration-integrity.spec.ts typeorm-launch-config.contract.spec.ts
  run_step "backend test" pnpm --dir "${ROOT_DIR}/backend" test
  run_step "backend App contract smoke" env APP_SMOKE_DRY_RUN=true pnpm --dir "${ROOT_DIR}/backend" smoke:app-core
  run_step "backend living social seed dry-run" pnpm --dir "${ROOT_DIR}/backend" seed:living-social-data:dry-run

  run_step "frontend install" pnpm --dir "${ROOT_DIR}/frontend" install --frozen-lockfile
  run_step "frontend lint" pnpm --dir "${ROOT_DIR}/frontend" lint
  run_step "frontend build" pnpm --dir "${ROOT_DIR}/frontend" build
  run_step "frontend test" pnpm --dir "${ROOT_DIR}/frontend" test

  run_step "fitmeet-landing install" pnpm --dir "${ROOT_DIR}/fitmeet-landing" install --frozen-lockfile
  run_step "fitmeet-landing lint" pnpm --dir "${ROOT_DIR}/fitmeet-landing" lint
  run_step "fitmeet-landing build" pnpm --dir "${ROOT_DIR}/fitmeet-landing" build
  run_step "fitmeet-landing test" pnpm --dir "${ROOT_DIR}/fitmeet-landing" test

  if [[ "${RUN_LOAD_SMOKE}" -eq 1 ]]; then
    run_step "read-only 1000-concurrency smoke" node "${ROOT_DIR}/scripts/load-1000-readonly.mjs"
  fi

  if [[ "${RUN_REALTIME_SMOKE}" -eq 1 ]]; then
    run_step "realtime 1000-online smoke" node "${ROOT_DIR}/scripts/realtime-1000-online-smoke.mjs"
  fi
fi

if [[ "${RUN_IOS}" -eq 1 ]]; then
  if [[ ! -d "${APP_DIR}" ]]; then
    echo "iOS app directory not found: ${APP_DIR}" >&2
    exit 1
  fi

  simulator_id="$(resolve_ios_simulator_id)"
  if [[ -z "${simulator_id}" ]]; then
    echo "No available iPhone Simulator found. Set FITMEET_IOS_SIMULATOR_ID to a valid UDID." >&2
    exit 1
  fi

  run_step "FitMeetAlpha unit tests" \
    xcodebuild test \
      -project "${APP_DIR}/FitMeetAlpha.xcodeproj" \
      -scheme FitMeetAlpha \
      -destination "platform=iOS Simulator,id=${simulator_id}" \
      -only-testing:FitMeetAlphaTests

  if [[ "${RUN_IOS_UI}" -eq 1 ]]; then
    run_step "FitMeetAlpha UI tests" \
      xcodebuild test \
        -project "${APP_DIR}/FitMeetAlpha.xcodeproj" \
        -scheme FitMeetAlpha \
        -destination "platform=iOS Simulator,id=${simulator_id}" \
        -only-testing:FitMeetAlphaUITests
  fi
fi

printf '\nRelease preflight completed successfully.\n'
