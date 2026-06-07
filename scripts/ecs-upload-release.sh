#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${ARCHIVE:-fitmeet-ecs-deploy.zip}"
CHECKSUM_FILE="${CHECKSUM_FILE:-${ARCHIVE}.sha256}"
INSTALLER="${INSTALLER:-fitmeet-ecs-install-release.sh}"
REMOTE_DIR="${REMOTE_DIR:-~/fitmeet-release}"
TARGET_DIR="${TARGET_DIR:-/opt/FitMeet-web}"
ECS_SSH_TARGET="${ECS_SSH_TARGET:-}"
SSH_CONNECT_TIMEOUT="${SSH_CONNECT_TIMEOUT:-8}"
UPLOAD=false
CHECK_SSH=false

usage() {
  cat <<'EOF'
Usage: scripts/ecs-upload-release.sh [--check-ssh] [--upload] [--ssh user@host] [--remote-dir ~/fitmeet-release] [--target /opt/FitMeet-web]

Prepares or uploads the three FitMeet ECS release files:
  - fitmeet-ecs-deploy.zip
  - fitmeet-ecs-deploy.zip.sha256
  - fitmeet-ecs-install-release.sh

Default mode is a dry run: it validates local files and prints the exact scp and
ssh commands. Pass --upload and provide ECS_SSH_TARGET or --ssh to create the
remote directory and upload the files.

Use --check-ssh before --upload to verify noninteractive public-key SSH access.
If the ECS host only works through Aliyun Workbench or a password prompt, run the
printed commands manually from a terminal that can authenticate, or use the
Workbench file-upload channel.

Environment:
  ECS_SSH_TARGET  SSH target, for example root@1.2.3.4.
  SSH_CONNECT_TIMEOUT
                  SSH preflight timeout in seconds. Default: 8.
  REMOTE_DIR      Remote directory for uploaded release files. Default: ~/fitmeet-release.
  TARGET_DIR      Server install target. Default: /opt/FitMeet-web.
  ARCHIVE         Release zip path. Default: fitmeet-ecs-deploy.zip.
  CHECKSUM_FILE   Checksum path. Default: <archive>.sha256.
  INSTALLER       Installer path. Default: fitmeet-ecs-install-release.sh.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check-ssh)
      CHECK_SSH=true
      ;;
    --upload)
      UPLOAD=true
      ;;
    --ssh)
      ECS_SSH_TARGET="${2:-}"
      shift
      ;;
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

quote_remote() {
  printf '%q' "$1"
}

check_ssh_access() {
  command -v ssh >/dev/null 2>&1 || fail "Missing required command: ssh"
  if ssh \
    -o BatchMode=yes \
    -o ConnectTimeout="${SSH_CONNECT_TIMEOUT}" \
    -o StrictHostKeyChecking=accept-new \
    "$ECS_SSH_TARGET" \
    "printf 'ssh-ok:%s\n' \"\$(hostname)\"" >/tmp/fitmeet-ecs-ssh-check.$$ 2>/tmp/fitmeet-ecs-ssh-check.err.$$; then
    cat /tmp/fitmeet-ecs-ssh-check.$$
    rm -f /tmp/fitmeet-ecs-ssh-check.$$ /tmp/fitmeet-ecs-ssh-check.err.$$
    ok "SSH public-key access is ready for ${ECS_SSH_TARGET}"
    return 0
  fi

  printf '\nSSH preflight failed for %s.\n' "$ECS_SSH_TARGET" >&2
  sed -n '1,6p' /tmp/fitmeet-ecs-ssh-check.err.$$ >&2 || true
  rm -f /tmp/fitmeet-ecs-ssh-check.$$ /tmp/fitmeet-ecs-ssh-check.err.$$
  fail "Configure an SSH key for this machine, run the printed commands from an authenticated terminal, or upload the release files through Aliyun Workbench."
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

remote_dir_q="$(quote_remote "$REMOTE_DIR")"
target_dir_q="$(quote_remote "$TARGET_DIR")"

printf '\nRelease upload plan:\n'
printf '  SSH target:  %s\n' "${ECS_SSH_TARGET:-<set ECS_SSH_TARGET or pass --ssh>}"
printf '  Remote dir:  %s\n' "$REMOTE_DIR"
printf '  Target dir:  %s\n' "$TARGET_DIR"
printf '  Files:       %s, %s, %s\n' "$ARCHIVE" "$CHECKSUM_FILE" "$INSTALLER"

if [[ -z "$ECS_SSH_TARGET" ]]; then
  printf '\nSet ECS_SSH_TARGET or pass --ssh to enable upload, for example:\n'
  printf '  ECS_SSH_TARGET=root@1.2.3.4 %s --upload\n' "$0"
  exit 0
fi

printf '\nCommands:\n'
printf '  ssh %s "mkdir -p %s"\n' "$ECS_SSH_TARGET" "$remote_dir_q"
printf '  scp %s %s %s %s:%s/\n' "$ARCHIVE" "$CHECKSUM_FILE" "$INSTALLER" "$ECS_SSH_TARGET" "$remote_dir_q"
printf '  ssh %s "cd %s && chmod +x ./fitmeet-ecs-install-release.sh && sha256sum -c ./fitmeet-ecs-deploy.zip.sha256 && ./fitmeet-ecs-install-release.sh --archive ./fitmeet-ecs-deploy.zip --checksum ./fitmeet-ecs-deploy.zip.sha256 --target %s"\n' "$ECS_SSH_TARGET" "$remote_dir_q" "$target_dir_q"
printf '  ssh %s "cd %s && ./fitmeet-ecs-install-release.sh --archive ./fitmeet-ecs-deploy.zip --checksum ./fitmeet-ecs-deploy.zip.sha256 --target %s --install"\n' "$ECS_SSH_TARGET" "$remote_dir_q" "$target_dir_q"

if [[ "$CHECK_SSH" == "true" ]]; then
  printf '\nChecking SSH access...\n'
  check_ssh_access
fi

if [[ "$UPLOAD" != "true" ]]; then
  printf '\nDry run complete. Re-run with --upload to create the remote directory and upload files.\n'
  exit 0
fi

command -v ssh >/dev/null 2>&1 || fail "Missing required command: ssh"
command -v scp >/dev/null 2>&1 || fail "Missing required command: scp"

ssh "$ECS_SSH_TARGET" "mkdir -p $remote_dir_q"
scp "$ARCHIVE" "$CHECKSUM_FILE" "$INSTALLER" "${ECS_SSH_TARGET}:${REMOTE_DIR%/}/"

ok "Uploaded FitMeet ECS release files to ${ECS_SSH_TARGET}:${REMOTE_DIR%/}/"
printf '\nNext server command:\n'
printf '  ssh %s "cd %s && chmod +x ./fitmeet-ecs-install-release.sh && ./fitmeet-ecs-install-release.sh --archive ./fitmeet-ecs-deploy.zip --checksum ./fitmeet-ecs-deploy.zip.sha256 --target %s"\n' "$ECS_SSH_TARGET" "$remote_dir_q" "$target_dir_q"
