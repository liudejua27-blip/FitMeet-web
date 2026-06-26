#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fitmeet-staging}"
BACKUP_ROOT="${BACKUP_ROOT:-$(dirname "$APP_DIR")}"
ROLLBACK_SOURCE="${ROLLBACK_SOURCE:-}"
ROLLBACK_DB_BACKUP_REF="${ROLLBACK_DB_BACKUP_REF:-}"
ROLLBACK_MIGRATION_COMPATIBILITY_ACK="${ROLLBACK_MIGRATION_COMPATIBILITY_ACK:-false}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://staging.ourfitmeet.cn}"
PUBLIC_API_BASE_URL="${PUBLIC_API_BASE_URL:-}"
ROLLBACK_EVIDENCE_ROOT="${ROLLBACK_EVIDENCE_ROOT:-artifacts/staging/rollback}"

fail() {
  printf '[staging-rollback][FAIL] %s\n' "$1" >&2
  exit 1
}

[[ -d "$APP_DIR" ]] || fail "APP_DIR does not exist: ${APP_DIR}"
[[ -n "$ROLLBACK_SOURCE" && -d "$ROLLBACK_SOURCE" ]] || fail "Set explicit ROLLBACK_SOURCE=/path/to/backup. This script will not auto-select a backup."
[[ -n "$ROLLBACK_DB_BACKUP_REF" ]] || fail "Set ROLLBACK_DB_BACKUP_REF to the staging DB backup/snapshot captured before this rollback. This script does not restore DB automatically."
[[ "$ROLLBACK_MIGRATION_COMPATIBILITY_ACK" == "true" ]] || fail "Set ROLLBACK_MIGRATION_COMPATIBILITY_ACK=true after confirming the target code is compatible with the current staging DB schema or the referenced DB backup."

if [[ -n "$PUBLIC_BASE_URL" ]]; then
  PUBLIC_BASE_URL="${PUBLIC_BASE_URL%/}"
  if [[ "$PUBLIC_BASE_URL" == "https://www.ourfitmeet.cn" || "$PUBLIC_BASE_URL" == "https://ourfitmeet.cn" ]]; then
    fail "Refusing staging rollback against production domain: ${PUBLIC_BASE_URL}"
  fi
fi
if [[ -n "$PUBLIC_API_BASE_URL" ]]; then
  PUBLIC_API_BASE_URL="${PUBLIC_API_BASE_URL%/}"
  if [[ "$PUBLIC_API_BASE_URL" == "https://www.ourfitmeet.cn/api" || "$PUBLIC_API_BASE_URL" == "https://ourfitmeet.cn/api" ]]; then
    fail "Refusing staging rollback against production API: ${PUBLIC_API_BASE_URL}"
  fi
fi

timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
current_backup="${BACKUP_ROOT%/}/$(basename "$APP_DIR").pre-rollback.${timestamp}"
evidence_dir="${ROLLBACK_EVIDENCE_ROOT%/}/${timestamp}"

printf '[staging-rollback] Source: %s\n' "$ROLLBACK_SOURCE"
printf '[staging-rollback] Target: %s\n' "$APP_DIR"
printf '[staging-rollback] Current backup: %s\n' "$current_backup"
printf '[staging-rollback] DB backup reference: %s\n' "$ROLLBACK_DB_BACKUP_REF"

mkdir -p "$current_backup"
mkdir -p "$evidence_dir"
{
  printf '# Staging Rollback Evidence\n\n'
  printf -- '- UTC: `%s`\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  printf -- '- Target APP_DIR: `%s`\n' "$APP_DIR"
  printf -- '- Rollback source: `%s`\n' "$ROLLBACK_SOURCE"
  printf -- '- Current code backup: `%s`\n' "$current_backup"
  printf -- '- DB backup reference: `%s`\n' "$ROLLBACK_DB_BACKUP_REF"
  printf -- '- Migration compatibility acknowledged: `%s`\n' "$ROLLBACK_MIGRATION_COMPATIBILITY_ACK"
  printf '\nThis script restores code files only. It does not restore PostgreSQL, Redis, MongoDB, or object storage. Use the DB backup reference above if schema/data rollback is required.\n'
} >"${evidence_dir}/rollback-summary.md"
rsync -a "$APP_DIR/" "$current_backup/"

rsync -a --delete \
  --exclude '.env.production' \
  --exclude 'nginx/ssl/' \
  "$ROLLBACK_SOURCE/" "$APP_DIR/"

cd "$APP_DIR"
COMPOSE=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")
"${COMPOSE[@]}" up -d --no-build --force-recreate backend subagent-worker nginx
"${COMPOSE[@]}" ps | tee "${evidence_dir}/compose-ps.txt"

if [[ -n "$PUBLIC_BASE_URL" ]]; then
  if [[ -z "$PUBLIC_API_BASE_URL" ]]; then
    PUBLIC_API_BASE_URL="${PUBLIC_BASE_URL}/api"
  fi
  BASE_URL="$PUBLIC_BASE_URL" API_BASE_URL="$PUBLIC_API_BASE_URL" ./scripts/verify-staging.sh | tee "${evidence_dir}/verify-staging.log"
fi

printf '[staging-rollback][DONE] Evidence: %s\n' "$evidence_dir"
