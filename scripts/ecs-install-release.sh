#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${ARCHIVE:-fitmeet-ecs-deploy.zip}"
CHECKSUM_FILE="${CHECKSUM_FILE:-${ARCHIVE}.sha256}"
TARGET_DIR="${TARGET_DIR:-/opt/FitMeet-web}"
BACKUP_ROOT="${BACKUP_ROOT:-}"
INSTALL=false

usage() {
  cat <<'EOF'
Usage: scripts/ecs-install-release.sh [--archive fitmeet-ecs-deploy.zip] [--checksum fitmeet-ecs-deploy.zip.sha256] [--target /opt/FitMeet-web] [--install]

Verifies and installs a FitMeet ECS release archive on the server.

Default mode verifies the checksum and archive shape, then prints the install
plan without changing files. Pass --install to sync the archive into TARGET_DIR.

The install path:
  - Verifies the SHA-256 checksum before unpacking.
  - Verifies the archive contains the expected FitMeet-web deployment tree.
  - Backs up the existing TARGET_DIR when it exists.
  - Preserves TARGET_DIR/.env.production and TARGET_DIR/nginx/ssl/.
  - Syncs the new release with rsync --delete for all other files.

Environment:
  ARCHIVE        Release zip path. Default: fitmeet-ecs-deploy.zip.
  CHECKSUM_FILE  SHA-256 file path. Default: <archive>.sha256.
  TARGET_DIR     Deployment target. Default: /opt/FitMeet-web.
  BACKUP_ROOT    Backup parent. Default: parent directory of TARGET_DIR.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --archive)
      ARCHIVE="${2:-}"
      shift
      ;;
    --checksum)
      CHECKSUM_FILE="${2:-}"
      shift
      ;;
    --target)
      TARGET_DIR="${2:-}"
      shift
      ;;
    --install)
      INSTALL=true
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

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

archive_entries() {
  unzip -Z1 "$ARCHIVE"
}

require_cmd unzip
require_cmd rsync
if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
  fail "Missing required command: sha256sum or shasum"
fi

[[ -f "$ARCHIVE" ]] || fail "Archive not found: $ARCHIVE"
[[ -f "$CHECKSUM_FILE" ]] || fail "Checksum file not found: $CHECKSUM_FILE"

expected_checksum="$(awk 'NF >= 1 { print $1; exit }' "$CHECKSUM_FILE")"
[[ -n "$expected_checksum" ]] || fail "Checksum file is empty: $CHECKSUM_FILE"
actual_checksum="$(sha256_file "$ARCHIVE")"

if [[ "$actual_checksum" != "$expected_checksum" ]]; then
  fail "Checksum mismatch for $ARCHIVE. Expected $expected_checksum, got $actual_checksum."
fi
ok "Checksum verified for $ARCHIVE"

entries="$(archive_entries)"
grep -qx 'FitMeet-web/docker-compose.prod.yml' <<<"$entries" ||
  fail "Archive does not contain FitMeet-web/docker-compose.prod.yml"
grep -qx 'FitMeet-web/frontend/dist/index.html' <<<"$entries" ||
  fail "Archive does not contain FitMeet-web/frontend/dist/index.html"
grep -qx 'FitMeet-web/backend/dist/main.js' <<<"$entries" ||
  fail "Archive does not contain FitMeet-web/backend/dist/main.js"
grep -qx 'FitMeet-web/deploy/env.production.ecs.example' <<<"$entries" ||
  fail "Archive does not contain FitMeet-web/deploy/env.production.ecs.example"
ok "Archive structure looks like a FitMeet ECS release"

target_parent="$(dirname "$TARGET_DIR")"
target_name="$(basename "$TARGET_DIR")"
if [[ -z "$BACKUP_ROOT" ]]; then
  BACKUP_ROOT="$target_parent"
fi
timestamp="$(date +%Y%m%d-%H%M%S)"
backup_base="${BACKUP_ROOT%/}/${target_name}.backup.${timestamp}"
backup_dir="$backup_base"
backup_counter=1
while [[ -e "$backup_dir" ]]; do
  backup_counter=$((backup_counter + 1))
  backup_dir="${backup_base}.${backup_counter}"
done

printf '\nInstall plan:\n'
printf '  Archive:  %s\n' "$ARCHIVE"
printf '  Checksum: %s\n' "$CHECKSUM_FILE"
printf '  Target:   %s\n' "$TARGET_DIR"
if [[ -d "$TARGET_DIR" ]]; then
  printf '  Backup:   %s\n' "$backup_dir"
  printf '  Preserve: %s/.env.production and %s/nginx/ssl/\n' "$TARGET_DIR" "$TARGET_DIR"
else
  printf '  Backup:   none, target does not exist yet\n'
fi

if [[ "$INSTALL" != "true" ]]; then
  printf '\nDry run complete. Re-run with --install to apply this release.\n'
  exit 0
fi

mkdir -p "$target_parent" "$BACKUP_ROOT"
tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/fitmeet-ecs-install.XXXXXX")"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

unzip -q "$ARCHIVE" -d "$tmp_dir"
staged_dir="${tmp_dir}/FitMeet-web"
[[ -d "$staged_dir" ]] || fail "Unpacked archive did not create $staged_dir"

if [[ -d "$TARGET_DIR" ]]; then
  rsync -a "$TARGET_DIR/" "$backup_dir/"
  ok "Backed up existing target to $backup_dir"
else
  mkdir -p "$TARGET_DIR"
fi

rsync -a --delete \
  --exclude '.env.production' \
  --exclude 'nginx/ssl/' \
  "$staged_dir/" "$TARGET_DIR/"

if [[ ! -f "$TARGET_DIR/.env.production" ]]; then
  printf '\n[WARN] %s/.env.production is missing. Create it from deploy/env.production.ecs.example before deploying containers.\n' "$TARGET_DIR" >&2
fi
if [[ ! -d "$TARGET_DIR/nginx/ssl" ]]; then
  printf '[WARN] %s/nginx/ssl is missing. Copy fullchain.pem and privkey.pem before deploying containers.\n' "$TARGET_DIR" >&2
fi

ok "Installed FitMeet release into $TARGET_DIR"
printf '\nNext server commands:\n'
printf '  cd %s\n' "$TARGET_DIR"
printf '  APP_DIR=%s ./scripts/ecs-host-preflight.sh\n' "$TARGET_DIR"
printf '  APP_DIR=%s RUN_RELEASE_PREFLIGHT=false BUILD_FRONTEND=false RUN_DB_MIGRATIONS=true PUBLIC_BASE_URL=https://www.ourfitmeet.cn PUBLIC_API_BASE_URL=https://www.ourfitmeet.cn/api ./scripts/deploy-production.sh\n' "$TARGET_DIR"
printf '\nPost-deploy release verification:\n'
printf '  EXPECTED_RELEASE_COMMIT="$(node -e '"'"'const fs=require("fs");const r=JSON.parse(fs.readFileSync("release.json","utf8"));process.stdout.write(String(r.commit||"unknown"))'"'"')"\n'
printf '  BASE_URL=https://www.ourfitmeet.cn API_BASE_URL=https://www.ourfitmeet.cn/api EXPECTED_RELEASE_COMMIT="$EXPECTED_RELEASE_COMMIT" ./scripts/verify-production.sh\n'
printf '  curl -fsS https://www.ourfitmeet.cn/api/health\n'
printf '\nIf /api/health does not show release.commit, the backend container is still running an old image.\n'
