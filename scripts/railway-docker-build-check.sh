#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_TAG="${IMAGE_TAG:-fitmeet-backend-prod:local}"
NODE_IMAGE="${NODE_IMAGE:-node:22-alpine}"
DOCKERFILE="${DOCKERFILE:-backend/Dockerfile.prod}"
CONTEXT_DIR="${CONTEXT_DIR:-backend}"
LOG_FILE="$(mktemp)"
trap 'rm -f "${LOG_FILE}"' EXIT

usage() {
  cat <<'EOF'
Usage: scripts/railway-docker-build-check.sh

Builds the Railway production backend image locally without touching remote
services. Use this before Railway deploys to catch Dockerfile, lockfile, and
Docker Hub/base-image issues early.

Environment:
  IMAGE_TAG     Local image tag. Default: fitmeet-backend-prod:local.
  NODE_IMAGE    Base Node image passed to Dockerfile.prod. Default: node:22-alpine.
                Set this to a reachable mirror only if Docker Hub is blocked.
  DOCKERFILE    Dockerfile path. Default: backend/Dockerfile.prod.
  CONTEXT_DIR   Docker build context. Default: backend.
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

ok() {
  printf '[OK] %s\n' "$1"
}

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail 'Docker CLI is required.'
docker info >/dev/null 2>&1 || fail 'Docker Desktop/daemon is not running.'

printf 'Building %s from %s with NODE_IMAGE=%s\n' \
  "${IMAGE_TAG}" "${DOCKERFILE}" "${NODE_IMAGE}"

if docker build \
  --build-arg "NODE_IMAGE=${NODE_IMAGE}" \
  -f "${ROOT_DIR}/${DOCKERFILE}" \
  -t "${IMAGE_TAG}" \
  "${ROOT_DIR}/${CONTEXT_DIR}" 2>&1 | tee "${LOG_FILE}"; then
  ok "Railway production Docker image builds locally: ${IMAGE_TAG}"
  exit 0
fi

if grep -Eqi 'auth\.docker\.io|registry-1\.docker\.io|Docker Hub|DeadlineExceeded|i/o timeout|ETIMEDOUT' "${LOG_FILE}"; then
  cat >&2 <<'EOF'

[FAIL] Docker could not reach Docker Hub or fetch the base image metadata.
This blocks local proof of the Railway image but does not prove the Dockerfile
is broken. Retry on a stable network, pre-pull node:22-alpine, or set
NODE_IMAGE to an approved reachable mirror before using Railway deploy.
EOF
else
  printf '\n[FAIL] Railway production Docker image build failed. See log above.\n' >&2
fi

exit 1
