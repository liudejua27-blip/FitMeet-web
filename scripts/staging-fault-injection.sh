#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
BASE_URL="${BASE_URL:-}"
API_BASE_URL="${API_BASE_URL:-${BASE_URL%/}/api}"
EXPECTED_RELEASE_COMMIT="${EXPECTED_RELEASE_COMMIT:-}"
STAGING_EVIDENCE_DIR="${STAGING_EVIDENCE_DIR:-artifacts/staging/fault-injection/$(date -u '+%Y%m%dT%H%M%SZ')}"
RUN_DESTRUCTIVE_FAULTS="${RUN_DESTRUCTIVE_FAULTS:-false}"
FAULT_WAIT_SECONDS="${FAULT_WAIT_SECONDS:-20}"

fail() {
  printf '[staging-fault][FAIL] %s\n' "$1" >&2
  exit 1
}

info() {
  printf '[staging-fault] %s\n' "$1"
}

[[ -n "$BASE_URL" ]] || fail "Set BASE_URL to the staging Web origin."
BASE_URL="${BASE_URL%/}"
API_BASE_URL="${API_BASE_URL%/}"
if [[ "$BASE_URL" == "https://www.ourfitmeet.cn" || "$BASE_URL" == "https://ourfitmeet.cn" ]]; then
  fail "Refusing fault injection against production domain: ${BASE_URL}"
fi

cd "$APP_DIR"
[[ -f "$COMPOSE_FILE" ]] || fail "Missing ${APP_DIR}/${COMPOSE_FILE}"
[[ -f "$ENV_FILE" ]] || fail "Missing ${APP_DIR}/${ENV_FILE}"
mkdir -p "$STAGING_EVIDENCE_DIR"

COMPOSE=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

collect_state() {
  local name="$1"
  local dir="${STAGING_EVIDENCE_DIR}/${name}"
  mkdir -p "$dir"
  "${COMPOSE[@]}" ps >"${dir}/compose-ps.txt" 2>&1 || true
  "${COMPOSE[@]}" logs --tail=260 backend subagent-worker postgres redis mongo >"${dir}/compose-logs.txt" 2>&1 || true
  curl -fsS "${API_BASE_URL}/health" >"${dir}/health.json" 2>&1 || true
  curl -fsS "${API_BASE_URL}/ready" >"${dir}/ready.json" 2>&1 || true
}

verify_staging() {
  BASE_URL="$BASE_URL" \
    API_BASE_URL="$API_BASE_URL" \
    EXPECTED_RELEASE_COMMIT="$EXPECTED_RELEASE_COMMIT" \
    RUN_STAGING_E2E=false \
    RUN_STAGING_FAULT_INJECTION=false \
    bash ./scripts/verify-staging.sh
}

run_sql() {
  local sql="$1"
  "${COMPOSE[@]}" exec -T postgres sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB"' <<<"$sql"
}

info "Evidence: ${STAGING_EVIDENCE_DIR}"
collect_state "00-before"
verify_staging | tee "${STAGING_EVIDENCE_DIR}/00-verify-before.log"

cat >"${STAGING_EVIDENCE_DIR}/required-manual-evidence.md" <<'EOF'
# Required Manual Evidence For Fault Injection

Before marking staging Go, attach the E2E evidence file from:

```bash
RUN_STAGING_E2E=true ./scripts/verify-staging.sh
```

For every failure, record:
- request and response
- taskId
- socialRequestId
- publicIntentId
- matchingJobId
- backend and worker logs
- final database state
- root cause and minimal fix PR
EOF

if [[ "$RUN_DESTRUCTIVE_FAULTS" != "true" ]]; then
  info "Dry-run only. Set RUN_DESTRUCTIVE_FAULTS=true on isolated staging to pause/kill services."
  run_sql "SELECT status, count(*) FROM matching_jobs GROUP BY status ORDER BY status;" \
    >"${STAGING_EVIDENCE_DIR}/matching-jobs-status.txt" 2>&1 || true
  run_sql "SELECT status, visibility, count(*) FROM user_social_requests GROUP BY status, visibility ORDER BY status, visibility;" \
    >"${STAGING_EVIDENCE_DIR}/social-requests-status.txt" 2>&1 || true
  info "Dry-run evidence collected."
  exit 0
fi

info "Start second worker peer to exercise multi-instance leasing"
worker_image_id="$("${COMPOSE[@]}" images -q subagent-worker | head -1)"
[[ -n "$worker_image_id" ]] || fail "Unable to resolve subagent-worker image id."
worker_peer_image="fitmeet-staging-worker-peer:$(date -u '+%Y%m%d%H%M%S')"
docker tag "$worker_image_id" "$worker_peer_image"
backend_container="$("${COMPOSE[@]}" ps -q backend | head -1)"
[[ -n "$backend_container" ]] || fail "Unable to resolve backend container for network discovery."
network_name="$(docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' "$backend_container" | head -1)"
[[ -n "$network_name" ]] || fail "Unable to resolve compose network name."
worker_peer_name="fitmeet-staging-subagent-worker-peer"
docker rm -f "$worker_peer_name" >/dev/null 2>&1 || true
docker run -d \
  --name "$worker_peer_name" \
  --network "$network_name" \
  --env-file "$ENV_FILE" \
  -e NODE_ENV=production \
  -e FITMEET_PROCESS_ROLE=worker \
  -e FITMEET_SUBAGENT_WORKER_ID=staging-fault-peer \
  -e DB_HOST=postgres \
  -e DB_PORT=5432 \
  -e REDIS_HOST=redis \
  -e REDIS_PORT=6379 \
  -e DB_MIGRATIONS_RUN=false \
  -e DB_SYNCHRONIZE=false \
  -e ENABLE_SCHEDULER=true \
  "$worker_peer_image" \
  node dist/agent-gateway/subagent-worker.cli.js >/dev/null
sleep "$FAULT_WAIT_SECONDS"
collect_state "10-dual-worker"
verify_staging | tee "${STAGING_EVIDENCE_DIR}/10-dual-worker-verify.log"
docker logs --tail=260 "$worker_peer_name" >"${STAGING_EVIDENCE_DIR}/10-worker-peer.log" 2>&1 || true
docker rm -f "$worker_peer_name" >/dev/null 2>&1 || true

info "Kill primary worker and verify lease recovery after restart"
"${COMPOSE[@]}" kill subagent-worker >/dev/null 2>&1 || true
sleep "$FAULT_WAIT_SECONDS"
"${COMPOSE[@]}" up -d --no-build subagent-worker
sleep "$FAULT_WAIT_SECONDS"
collect_state "20-worker-restart"
verify_staging | tee "${STAGING_EVIDENCE_DIR}/20-worker-restart-verify.log"

info "Pause Redis briefly and verify API readiness recovers"
"${COMPOSE[@]}" pause redis
sleep "$FAULT_WAIT_SECONDS"
"${COMPOSE[@]}" unpause redis
sleep "$FAULT_WAIT_SECONDS"
collect_state "30-redis-recovery"
verify_staging | tee "${STAGING_EVIDENCE_DIR}/30-redis-recovery-verify.log"

info "Pause Mongo briefly and verify API readiness recovers"
"${COMPOSE[@]}" pause mongo
sleep "$FAULT_WAIT_SECONDS"
"${COMPOSE[@]}" unpause mongo
sleep "$FAULT_WAIT_SECONDS"
collect_state "40-mongo-recovery"
verify_staging | tee "${STAGING_EVIDENCE_DIR}/40-mongo-recovery-verify.log"

run_sql "SELECT status, count(*) FROM matching_jobs GROUP BY status ORDER BY status;" \
  >"${STAGING_EVIDENCE_DIR}/final-matching-jobs-status.txt" 2>&1 || true
run_sql "SELECT status, visibility, count(*) FROM user_social_requests GROUP BY status, visibility ORDER BY status, visibility;" \
  >"${STAGING_EVIDENCE_DIR}/final-social-requests-status.txt" 2>&1 || true
collect_state "99-final"

info "Fault injection completed."
