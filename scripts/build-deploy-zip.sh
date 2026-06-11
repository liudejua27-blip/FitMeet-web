#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="${1:-${ROOT_DIR}/fitmeet-ecs-deploy.zip}"
OUTPUT_DIR="$(dirname "${OUTPUT}")"
OUTPUT_NAME="$(basename "${OUTPUT}")"
CHECKSUM_OUTPUT="${OUTPUT}.sha256"
INSTALLER_OUTPUT="${OUTPUT_DIR}/fitmeet-ecs-install-release.sh"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/fitmeet-ecs-deploy.XXXXXX")"
STAGE_DIR="${TMP_DIR}/FitMeet-web"
RUN_BACKEND_DOCKER_BUILD_CHECK="${RUN_BACKEND_DOCKER_BUILD_CHECK:-true}"

# shellcheck source=scripts/lib/toolchain.sh
source "${ROOT_DIR}/scripts/lib/toolchain.sh"
fitmeet_bootstrap_toolchain
fitmeet_activate_pnpm

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

step() {
  printf '\n==> %s\n' "$1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[FAIL] Missing required command: $1" >&2
    exit 1
  fi
}

require_path() {
  if [ ! -e "${ROOT_DIR}/$1" ]; then
    echo "[FAIL] Required deploy artifact is missing: $1" >&2
    exit 1
  fi
}

require_cmd pnpm
require_cmd rsync
require_cmd zip
if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
  echo "[FAIL] Missing required command: sha256sum or shasum" >&2
  exit 1
fi

mkdir -p "${OUTPUT_DIR}"
rm -f "${OUTPUT}"
rm -f "${CHECKSUM_OUTPUT}"
rm -f "${INSTALLER_OUTPUT}"

step "Install frontend dependencies"
pnpm --dir "${ROOT_DIR}/frontend" install --frozen-lockfile

step "Build frontend for ECS same-origin /api"
VITE_API_BASE_URL="${VITE_API_BASE_URL:-/api}" \
VITE_WS_BASE_URL="${VITE_WS_BASE_URL:-}" \
pnpm --dir "${ROOT_DIR}/frontend" build

require_path "frontend/dist/index.html"
require_path "frontend/dist/assets"

step "Install backend dependencies"
pnpm --dir "${ROOT_DIR}/backend" install --frozen-lockfile

step "Build backend"
pnpm --dir "${ROOT_DIR}/backend" build

if [ "$RUN_BACKEND_DOCKER_BUILD_CHECK" = "true" ]; then
  step "Build backend production Docker image"
  require_cmd docker
  docker build -f "${ROOT_DIR}/backend/Dockerfile.prod" "${ROOT_DIR}/backend" \
    -t fitmeet-backend-release-check:local
else
  step "Skip backend production Docker image build"
fi

require_path "backend/dist/main.js"
require_path "backend/dist/scripts/prepare-agent-smoke-seed.js"
require_path "backend/dist/scripts/check-production-tables.js"
require_path "backend/dist/agent-gateway/subagent-worker-healthcheck.js"
require_path "backend/Dockerfile.prod"
require_path "backend/src/scripts/prepare-agent-smoke-seed.ts"
require_path "docker-compose.prod.yml"
require_path "deploy/env.production.ecs.example"
require_path "nginx/nginx.conf"
require_path "scripts/deploy-production.sh"
require_path "scripts/cloud-platform-preflight.sh"
require_path "scripts/domain-readiness-check.sh"
require_path "scripts/launch-status.sh"
require_path "scripts/vercel-prebuilt-deploy.sh"
require_path "scripts/lib/toolchain.sh"
require_path "scripts/ecs-install-release.sh"
require_path "scripts/ecs-upload-release.sh"
require_path "scripts/ecs-workbench-install-plan.sh"
require_path "scripts/ecs-host-preflight.sh"
require_path "scripts/ecs-post-deploy-smoke.sh"
require_path "docs/deployment-vercel-railway.md"

step "Stage sanitized deploy tree"
mkdir -p "${STAGE_DIR}"
rsync -a "${ROOT_DIR}/" "${STAGE_DIR}/" \
  --exclude '.git/' \
  --exclude '.github/' \
  --exclude '.deploy-staging/' \
  --exclude '.vercel/' \
  --exclude '*/.vercel/' \
  --exclude '.railway/' \
  --exclude '*/.railway/' \
  --exclude '.vscode/' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '*/.env' \
  --exclude '*/.env.*' \
  --exclude 'node_modules/' \
  --exclude '*/node_modules/' \
  --exclude 'fitmeet*.zip' \
  --exclude '*.log' \
  --exclude 'logs/' \
  --exclude '*/logs/' \
  --exclude 'coverage/' \
  --exclude '*/coverage/' \
  --exclude 'playwright-report/' \
  --exclude '*/playwright-report/' \
  --exclude 'test-results/' \
  --exclude '*/test-results/' \
  --exclude 'ui-verify-out/' \
  --exclude '*/ui-verify-out/' \
  --exclude 'qa-gsap-round2/' \
  --exclude 'agent-gsap-qa.png' \
  --exclude 'agent-reference-qa.png' \
  --exclude 'homepage-gsap-qa.png' \
  --exclude 'nginx/ssl/' \
  --exclude 'backend/public/uploads/' \
  --exclude 'frontend/output/' \
  --exclude 'artifacts/' \
  --exclude 'chrome-headless-profile*/' \
  --exclude 'chrome-dom-output.txt' \
  --exclude 'chrome-test.txt'

step "Create zip"
(
  cd "${TMP_DIR}"
  zip -qr "${OUTPUT}" "FitMeet-web"
)

step "Scan deploy zip"
entries=()
while IFS= read -r entry; do
  entries+=("${entry}")
done < <(zipinfo -1 "${OUTPUT}")

contains_entry() {
  local pattern="$1"
  local entry
  for entry in "${entries[@]}"; do
    if [[ "${entry}" =~ ${pattern} ]]; then
      return 0
    fi
  done
  return 1
}

fail_if_entry() {
  local label="$1"
  local pattern="$2"
  if contains_entry "$pattern"; then
    echo "[FAIL] Deploy zip contains forbidden ${label}" >&2
    exit 1
  fi
}

contains_entry '^FitMeet-web/frontend/dist/index\.html$' || {
  echo "[FAIL] Missing frontend/dist/index.html" >&2
  exit 1
}
contains_entry '^FitMeet-web/frontend/dist/assets/' || {
  echo "[FAIL] Missing frontend/dist/assets" >&2
  exit 1
}
contains_entry '^FitMeet-web/backend/Dockerfile\.prod$' || {
  echo "[FAIL] Missing backend/Dockerfile.prod" >&2
  exit 1
}
contains_entry '^FitMeet-web/backend/src/scripts/prepare-agent-smoke-seed\.ts$' || {
  echo "[FAIL] Missing backend/src/scripts/prepare-agent-smoke-seed.ts" >&2
  exit 1
}
contains_entry '^FitMeet-web/backend/dist/scripts/prepare-agent-smoke-seed\.js$' || {
  echo "[FAIL] Missing backend/dist/scripts/prepare-agent-smoke-seed.js" >&2
  exit 1
}
contains_entry '^FitMeet-web/backend/dist/agent-gateway/subagent-worker-healthcheck\.js$' || {
  echo "[FAIL] Missing backend/dist/agent-gateway/subagent-worker-healthcheck.js" >&2
  exit 1
}
contains_entry '^FitMeet-web/docker-compose\.prod\.yml$' || {
  echo "[FAIL] Missing docker-compose.prod.yml" >&2
  exit 1
}
contains_entry '^FitMeet-web/deploy/env\.production\.ecs\.example$' || {
  echo "[FAIL] Missing deploy/env.production.ecs.example" >&2
  exit 1
}
contains_entry '^FitMeet-web/nginx/nginx\.conf$' || {
  echo "[FAIL] Missing nginx/nginx.conf" >&2
  exit 1
}
contains_entry '^FitMeet-web/scripts/ecs-host-preflight\.sh$' || {
  echo "[FAIL] Missing scripts/ecs-host-preflight.sh" >&2
  exit 1
}
contains_entry '^FitMeet-web/scripts/ecs-install-release\.sh$' || {
  echo "[FAIL] Missing scripts/ecs-install-release.sh" >&2
  exit 1
}
contains_entry '^FitMeet-web/scripts/ecs-upload-release\.sh$' || {
  echo "[FAIL] Missing scripts/ecs-upload-release.sh" >&2
  exit 1
}
contains_entry '^FitMeet-web/scripts/ecs-workbench-install-plan\.sh$' || {
  echo "[FAIL] Missing scripts/ecs-workbench-install-plan.sh" >&2
  exit 1
}
contains_entry '^FitMeet-web/scripts/ecs-post-deploy-smoke\.sh$' || {
  echo "[FAIL] Missing scripts/ecs-post-deploy-smoke.sh" >&2
  exit 1
}
contains_entry '^FitMeet-web/scripts/cloud-platform-preflight\.sh$' || {
  echo "[FAIL] Missing scripts/cloud-platform-preflight.sh" >&2
  exit 1
}
contains_entry '^FitMeet-web/scripts/domain-readiness-check\.sh$' || {
  echo "[FAIL] Missing scripts/domain-readiness-check.sh" >&2
  exit 1
}
contains_entry '^FitMeet-web/scripts/launch-status\.sh$' || {
  echo "[FAIL] Missing scripts/launch-status.sh" >&2
  exit 1
}
contains_entry '^FitMeet-web/scripts/vercel-prebuilt-deploy\.sh$' || {
  echo "[FAIL] Missing scripts/vercel-prebuilt-deploy.sh" >&2
  exit 1
}
contains_entry '^FitMeet-web/scripts/lib/toolchain\.sh$' || {
  echo "[FAIL] Missing scripts/lib/toolchain.sh" >&2
  exit 1
}
contains_entry '^FitMeet-web/docs/deployment-vercel-railway\.md$' || {
  echo "[FAIL] Missing docs/deployment-vercel-railway.md" >&2
  exit 1
}

fail_if_entry "git metadata" '(^|/)\.git/'
fail_if_entry "Vercel project metadata" '(^|/)\.vercel/'
fail_if_entry "Railway project metadata" '(^|/)\.railway/'
fail_if_entry "node_modules" '(^|/)node_modules/'
fail_if_entry "env files" '(^|/)\.env($|\.|/)'
fail_if_entry "ssl private material" '^FitMeet-web/nginx/ssl/'
fail_if_entry "nested zip files" '\.zip$'
fail_if_entry "logs" '(^|/)logs/|\.log$'
fail_if_entry "QA screenshots" 'agent-gsap-qa\.png|agent-reference-qa\.png|homepage-gsap-qa\.png|qa-gsap-round2/'

step "Write checksum"
if command -v sha256sum >/dev/null 2>&1; then
  checksum="$(sha256sum "${OUTPUT}" | awk '{print $1}')"
else
  checksum="$(shasum -a 256 "${OUTPUT}" | awk '{print $1}')"
fi
printf '%s  %s\n' "${checksum}" "${OUTPUT_NAME}" >"${CHECKSUM_OUTPUT}"

step "Write installer helper"
cp "${ROOT_DIR}/scripts/ecs-install-release.sh" "${INSTALLER_OUTPUT}"
chmod +x "${INSTALLER_OUTPUT}"

size_mb="$(du -m "${OUTPUT}" | awk '{print $1}')"
printf '\n[DONE] %s (%s MB, %s entries)\n' "${OUTPUT}" "${size_mb}" "${#entries[@]}"
printf '[DONE] %s\n' "${CHECKSUM_OUTPUT}"
printf '[DONE] %s\n' "${INSTALLER_OUTPUT}"
