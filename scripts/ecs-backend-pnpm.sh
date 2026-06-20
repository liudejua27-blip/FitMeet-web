#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${APP_DIR:-${ROOT_DIR}}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
PNPM_VERSION="${PNPM_VERSION:-10.30.3}"
SERVICE="${SERVICE:-backend}"

usage() {
  cat <<'EOF'
Usage: scripts/ecs-backend-pnpm.sh [--service backend] -- <pnpm-script-or-args...>

Runs pnpm inside the production Docker Compose backend image with a pinned
Corepack/pnpm toolchain. Use this for ECS one-off backend commands such as
migrations, upload-dir checks, and smoke seeds instead of running host pnpm.

Examples:
  ./scripts/ecs-backend-pnpm.sh -- uploads:check:prod
  ./scripts/ecs-backend-pnpm.sh -- migration:run:prod
  AGENT_SMOKE_SEED_ALLOW_PRODUCTION=true ./scripts/ecs-backend-pnpm.sh -- seed:agent-smoke:prod -- --allow-production

Environment:
  APP_DIR        Deployed FitMeet root. Default: repo root.
  COMPOSE_FILE   Compose file. Default: docker-compose.prod.yml.
  ENV_FILE       Production env file. Default: .env.production.
  PNPM_VERSION   Pinned pnpm version. Default: 10.30.3.
  SERVICE        Compose service to run. Default: backend.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --service)
      SERVICE="${2:-}"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    *)
      break
      ;;
  esac
  shift
done

if [[ $# -lt 1 ]]; then
  usage >&2
  exit 2
fi

cd "${APP_DIR}"

[[ -f "${COMPOSE_FILE}" ]] || {
  echo "[FAIL] Missing ${APP_DIR}/${COMPOSE_FILE}" >&2
  exit 1
}
[[ -f "${ENV_FILE}" ]] || {
  echo "[FAIL] Missing ${APP_DIR}/${ENV_FILE}" >&2
  exit 1
}

compose=(docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}")
env_args=(
  -e COREPACK_ENABLE_PROJECT_SPEC=0
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0
)

for key in \
  AGENT_SMOKE_SEED_ALLOW_PRODUCTION \
  APP_SMOKE_SEED_ALLOW_PRODUCTION \
  APP_SMOKE_SEED_PASSWORD \
  AGENT_SMOKE_ALLOW_MUTATIONS \
  AGENT_SMOKE_ALLOW_REMOTE \
  AGENT_SMOKE_API_BASE_URL \
  AGENT_SMOKE_EMAIL \
  AGENT_SMOKE_PASSWORD \
  AGENT_SMOKE_CITY \
  AGENT_SMOKE_ACTIVITY \
  AGENT_SMOKE_TIME \
  AGENT_SMOKE_INTENSITY \
  AGENT_SMOKE_STOP_AFTER_OPPORTUNITIES \
  AGENT_SMOKE_RUN_20_TURN_MEMORY \
  AGENT_SMOKE_RUN_EMPTY_CANDIDATE_FALLBACK \
  AGENT_SMOKE_EMPTY_CANDIDATE_MESSAGE \
  AGENT_SMOKE_REPORT_FILE \
  AGENT_SMOKE_REPORT_STDOUT; do
  if [[ -n "${!key:-}" ]]; then
    env_args+=(-e "${key}=${!key}")
  fi
done

"${compose[@]}" run --rm --no-deps "${env_args[@]}" "${SERVICE}" sh -lc \
  "export COREPACK_ENABLE_PROJECT_SPEC=0 COREPACK_ENABLE_DOWNLOAD_PROMPT=0; corepack enable; corepack prepare pnpm@${PNPM_VERSION} --activate; pnpm \"\$@\"" \
  sh "$@"
