#!/usr/bin/env bash
# ============================================================================
#  apply-production-schema-patch.sh
#
#  Idempotently apply backend/scripts/production-schema-patch-20260511.sql
#  to the running production Postgres database, with a full backup taken
#  immediately before the patch runs.
#
#  Usage (on the prod server, repo root):
#      bash backend/scripts/apply-production-schema-patch.sh
#
#  Required env (read from .env.production or the shell):
#      DB_USERNAME       Postgres superuser inside the container
#      DB_DATABASE       Target database name
#
#  Optional env:
#      PATCH_FILE        Override path to the SQL patch
#      BACKUP_DIR        Override backup destination (default /opt/fitmeet-db-backup)
#      POSTGRES_CONTAINER  Override container name (default fitness-postgres)
# ============================================================================
set -euo pipefail

# -- 0. Locate repo root + load .env.production if available ----------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

load_env_file() {
  local env_file="$1"
  local line key value bom line_number
  bom=$'\xef\xbb\xbf'
  line_number=0

  while IFS= read -r line || [[ -n "$line" ]]; do
    line_number=$((line_number + 1))
    line="${line#"$bom"}"
    line="${line%$'\r'}"

    if [[ "$line" =~ ^[[:space:]]*$ || "$line" =~ ^[[:space:]]*# ]]; then
      continue
    fi

    if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      value="${BASH_REMATCH[2]}"
      export "$key=$value"
    else
      echo "[WARN] Ignoring invalid env line $line_number in $env_file" >&2
    fi
  done < "$env_file"
}

if [[ -f "$REPO_ROOT/.env.production" ]]; then
  load_env_file "$REPO_ROOT/.env.production"
fi

PATCH_FILE="${PATCH_FILE:-$SCRIPT_DIR/production-schema-patch-20260511.sql}"
ROUND3_PATCH_FILE="${ROUND3_PATCH_FILE:-$SCRIPT_DIR/agent-social-runtime-schema-patch-20260511.sql}"
DRIFT_FIX_FILE="${DRIFT_FIX_FILE:-$SCRIPT_DIR/agent-schema-drift-fix-20260513.sql}"
AGENT_LOG_FIELDS_FIX_FILE="${AGENT_LOG_FIELDS_FIX_FILE:-$SCRIPT_DIR/fix-agent-log-fields-20260514.sql}"
AGENT_TASK_RUNTIME_PATCH_FILE="${AGENT_TASK_RUNTIME_PATCH_FILE:-$SCRIPT_DIR/agent-task-runtime-schema-patch-20260519.sql}"
SOCIAL_AGENT_FINAL_PATCH_FILE="${SOCIAL_AGENT_FINAL_PATCH_FILE:-$SCRIPT_DIR/social-agent-final-schema-patch-20260519.sql}"
BACKUP_DIR="${BACKUP_DIR:-/opt/fitmeet-db-backup}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-fitness-postgres}"

: "${DB_USERNAME:?DB_USERNAME is required (export it or define in .env.production)}"
: "${DB_DATABASE:?DB_DATABASE is required (export it or define in .env.production)}"

if [[ ! -f "$PATCH_FILE" ]]; then
  echo "[ERROR] Patch file not found: $PATCH_FILE" >&2
  exit 1
fi

# -- 1. Sanity: container running? ------------------------------------------
if ! docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
  echo "[ERROR] Postgres container '$POSTGRES_CONTAINER' is not running." >&2
  exit 1
fi

# -- 2. Backup --------------------------------------------------------------
TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/${DB_DATABASE}-pre-patch-${TS}.sql.gz"

echo "[1/4] Backing up $DB_DATABASE -> $BACKUP_FILE"
docker exec "$POSTGRES_CONTAINER" \
  pg_dump -U "$DB_USERNAME" -d "$DB_DATABASE" --no-owner --no-privileges \
  | gzip > "$BACKUP_FILE"

if [[ ! -s "$BACKUP_FILE" ]]; then
  echo "[ERROR] Backup file is empty: $BACKUP_FILE" >&2
  exit 1
fi
echo "      backup size: $(du -h "$BACKUP_FILE" | awk '{print $1}')"

# -- 3. Apply patch ---------------------------------------------------------
echo "[2/4] Applying schema patch: $(basename "$PATCH_FILE")"
docker exec -i "$POSTGRES_CONTAINER" \
  psql -v ON_ERROR_STOP=1 -U "$DB_USERNAME" -d "$DB_DATABASE" \
  < "$PATCH_FILE"

echo "      patch applied successfully."

# -- 3a. Apply follow-up patches --------------------------------------------
#       These are idempotent (IF NOT EXISTS / pg_enum guards) and safe to
#       run on a DB that has been fully migrated by the base patch above.
for FOLLOWUP in "$ROUND3_PATCH_FILE" "$DRIFT_FIX_FILE" "$AGENT_LOG_FIELDS_FIX_FILE" "$AGENT_TASK_RUNTIME_PATCH_FILE" "$SOCIAL_AGENT_FINAL_PATCH_FILE"; do
  if [[ -f "$FOLLOWUP" ]]; then
    echo "      Applying follow-up: $(basename "$FOLLOWUP")"
    docker exec -i "$POSTGRES_CONTAINER" \
      psql -v ON_ERROR_STOP=1 -U "$DB_USERNAME" -d "$DB_DATABASE" \
      < "$FOLLOWUP"
  else
    echo "      [WARN] follow-up patch not found, skipping: $FOLLOWUP" >&2
  fi
done

# -- 4. Verify critical tables / columns ------------------------------------
echo "[3/4] Verifying critical tables exist..."
TABLES=(
  users meets meet_participants posts
  activity_templates social_activities activity_proofs
  user_social_requests social_request_candidates user_social_profiles
  agent_connections agent_permissions agent_settings
  agent_approval_requests agent_activity_logs agent_action_logs
  contact_requests match_candidates safety_events
  user_preferences social_requests public_social_intents
  ai_delegate_profiles ai_match_sessions
  agent_tasks agent_task_events payment_intents
)
MISSING_TABLES=()
for t in "${TABLES[@]}"; do
  exists="$(docker exec "$POSTGRES_CONTAINER" psql -tA -U "$DB_USERNAME" -d "$DB_DATABASE" \
      -c "SELECT to_regclass('public.$t') IS NOT NULL;")"
  if [[ "$exists" != "t" ]]; then
    MISSING_TABLES+=("$t")
  fi
done

echo "[4/4] Verifying critical columns exist..."
declare -A COLUMNS=(
  [users]="lat lng locationUpdatedAt acceptNearbyMatch trustScore socialTrustCount"
  [meets]="activityId lat lng poiId tripShareToken autoCancelAt cancelReason startAt clubId status"
  [meet_participants]="status tripShareToken"
  [posts]="lat lng city loc poiId"
  [agent_approval_requests]="actionType reason createdBy relatedSocialRequestId relatedCandidateId relatedActivityId"
  [agent_action_logs]="ownerUserId actionType actionStatus riskLevel relatedActivityId relatedSocialRequestId relatedCandidateId payload eventType conversationId messageId status metadata"
  [agent_activity_logs]="ownerUserId agentConnectionId eventType conversationId messageId status metadata"
  [agent_tasks]="ownerUserId agentConnectionId taskType title goal input plan toolCalls result memory status permissionMode riskLevel idempotencyKey statusReason error startedAt awaitingConfirmationAt completedAt"
  [agent_task_events]="taskId ownerUserId eventType actor summary payload stepId toolCallId"
  [payment_intents]="ownerUserId agentConnectionId agentTaskId stepId targetUserId amount currency description status provider providerReference metadata"
)
MISSING_COLUMNS=()
for tbl in "${!COLUMNS[@]}"; do
  for col in ${COLUMNS[$tbl]}; do
    exists="$(docker exec "$POSTGRES_CONTAINER" psql -tA -U "$DB_USERNAME" -d "$DB_DATABASE" \
        -c "SELECT EXISTS(SELECT 1 FROM information_schema.columns
                          WHERE table_schema='public' AND table_name='$tbl' AND column_name='$col');")"
    if [[ "$exists" != "t" ]]; then
      MISSING_COLUMNS+=("$tbl.$col")
    fi
  done
done

echo
echo "=================== RESULT ==================="
if [[ ${#MISSING_TABLES[@]} -eq 0 && ${#MISSING_COLUMNS[@]} -eq 0 ]]; then
  echo "  All critical tables and columns are present."
  echo "  Backup: $BACKUP_FILE"
  echo "=============================================="
  echo "Next step: docker compose -f docker-compose.prod.yml restart backend"
  exit 0
else
  if [[ ${#MISSING_TABLES[@]} -gt 0 ]]; then
    echo "  MISSING TABLES:   ${MISSING_TABLES[*]}"
  fi
  if [[ ${#MISSING_COLUMNS[@]} -gt 0 ]]; then
    echo "  MISSING COLUMNS:  ${MISSING_COLUMNS[*]}"
  fi
  echo "=============================================="
  echo "Backup is safe at: $BACKUP_FILE"
  exit 2
fi
