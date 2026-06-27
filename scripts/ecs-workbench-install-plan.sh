#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${ARCHIVE:-fitmeet-ecs-deploy.zip}"
CHECKSUM_FILE="${CHECKSUM_FILE:-${ARCHIVE}.sha256}"
INSTALLER="${INSTALLER:-fitmeet-ecs-install-release.sh}"
REMOTE_DIR="${REMOTE_DIR:-~/fitmeet-release}"
TARGET_DIR="${TARGET_DIR:-/opt/FitMeet-web}"

usage() {
  cat <<'EOF'
Usage: scripts/ecs-workbench-install-plan.sh [--remote-dir ~/fitmeet-release] [--target /opt/FitMeet-web]

Validates the local FitMeet ECS release files and prints the exact server-side
commands to paste into Aliyun Workbench after uploading these three files:
  - fitmeet-ecs-deploy.zip
  - fitmeet-ecs-deploy.zip.sha256
  - fitmeet-ecs-install-release.sh

This script does not connect to ECS and does not mutate local or remote state.

Environment:
  REMOTE_DIR      Directory where Workbench file upload places release files.
                  Default: ~/fitmeet-release.
  TARGET_DIR      Server install target. Default: /opt/FitMeet-web.
  ARCHIVE         Release zip path. Default: fitmeet-ecs-deploy.zip.
  CHECKSUM_FILE   Checksum path. Default: <archive>.sha256.
  INSTALLER       Installer path. Default: fitmeet-ecs-install-release.sh.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --remote-dir)
      REMOTE_DIR="${2:-}"
      shift
      ;;
    --target)
      TARGET_DIR="${2:-}"
      shift
      ;;
    --archive)
      ARCHIVE="${2:-}"
      CHECKSUM_FILE="${ARCHIVE}.sha256"
      shift
      ;;
    --checksum)
      CHECKSUM_FILE="${2:-}"
      shift
      ;;
    --installer)
      INSTALLER="${2:-}"
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

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

ok() {
  printf '[OK] %s\n' "$1"
}

quote_shell() {
  printf '%q' "$1"
}

require_file() {
  [[ -f "$1" ]] || fail "Missing release file: $1"
  ok "Found $1"
}

require_file "$ARCHIVE"
require_file "$CHECKSUM_FILE"
require_file "$INSTALLER"

if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
  fail "Missing required command: sha256sum or shasum"
fi
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum -c "$CHECKSUM_FILE"
else
  shasum -a 256 -c "$CHECKSUM_FILE"
fi

archive_name="$(basename "$ARCHIVE")"
checksum_name="$(basename "$CHECKSUM_FILE")"
installer_name="$(basename "$INSTALLER")"
remote_dir_q="$(quote_shell "$REMOTE_DIR")"
target_dir_q="$(quote_shell "$TARGET_DIR")"

cat <<EOF

Workbench upload checklist:
  1. Open Aliyun ECS Workbench for the target instance.
  2. Upload these local files into ${REMOTE_DIR}:
     - ${ARCHIVE}
     - ${CHECKSUM_FILE}
     - ${INSTALLER}
  3. Paste the command block below into the Workbench terminal.

Server command block:

mkdir -p ${remote_dir_q}
cd ${remote_dir_q}
ls -lh ${archive_name} ${checksum_name} ${installer_name}
sha256sum -c ./${checksum_name}
chmod +x ./${installer_name}
bash ./${installer_name} --archive ./${archive_name} --checksum ./${checksum_name} --target ${target_dir_q}
bash ./${installer_name} --archive ./${archive_name} --checksum ./${checksum_name} --target ${target_dir_q} --install
cd ${target_dir_q}
if [ ! -f .env.production ]; then cp deploy/env.production.ecs.example .env.production; fi
printf '\\nNext: edit %s/.env.production, copy nginx/ssl/fullchain.pem and nginx/ssl/privkey.pem, then run:\\n' ${target_dir_q}
printf '  APP_DIR=%s bash ./scripts/ecs-host-preflight.sh\\n' ${target_dir_q}
printf '  APP_DIR=%s RUN_RELEASE_PREFLIGHT=false BUILD_FRONTEND=false PUBLIC_BASE_URL=https://www.ourfitmeet.cn PUBLIC_API_BASE_URL=https://www.ourfitmeet.cn/api bash ./scripts/deploy-production.sh\\n' ${target_dir_q}
printf '\\nOne-off backend commands should use the production container wrapper:\\n'
printf '  bash ./scripts/ecs-backend-pnpm.sh -- uploads:check:prod\\n'
printf '  bash ./scripts/ecs-backend-pnpm.sh -- migration:run:prod\\n'
printf '  bash ./scripts/ecs-backend-pnpm.sh -- db:check-critical-tables:prod\\n'
printf '\\nAfter deployment, run:\\n'
printf '  EXPECTED_RELEASE_COMMIT="\$(node -e '\\''const fs=require("fs");const r=JSON.parse(fs.readFileSync("release.json","utf8"));process.stdout.write(String(r.commit||"unknown"))'\\'')"\\n'
printf '  EXPECTED_RELEASE_BUILT_AT="\$(node -e '\\''const fs=require("fs");const r=JSON.parse(fs.readFileSync("release.json","utf8"));process.stdout.write(String(r.builtAt||""))'\\'')"\\n'
printf '  BASE_URL=https://www.ourfitmeet.cn API_BASE_URL=https://www.ourfitmeet.cn/api EXPECTED_RELEASE_COMMIT="\$EXPECTED_RELEASE_COMMIT" EXPECTED_RELEASE_BUILT_AT="\$EXPECTED_RELEASE_BUILT_AT" bash ./scripts/verify-agent-goal-production.sh\\n'

EOF
