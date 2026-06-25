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
worker_peer_name="fitmeet-staging-subagent-worker-peer"
worker_peer_image=""
redis_paused=false
mongo_paused=false
main_worker_stopped=false

cleanup() {
  local status=$?
  set +e
  docker rm -f "$worker_peer_name" >/dev/null 2>&1 || true
  if [[ -n "$worker_peer_image" ]]; then
    docker rmi "$worker_peer_image" >/dev/null 2>&1 || true
  fi
  if [[ "$redis_paused" == "true" ]]; then
    "${COMPOSE[@]}" unpause redis >/dev/null 2>&1 || true
    redis_paused=false
  fi
  if [[ "$mongo_paused" == "true" ]]; then
    "${COMPOSE[@]}" unpause mongo >/dev/null 2>&1 || true
    mongo_paused=false
  fi
  if [[ "$main_worker_stopped" == "true" ]]; then
    "${COMPOSE[@]}" up -d --no-build subagent-worker >/dev/null 2>&1 || true
    main_worker_stopped=false
  fi
  return "$status"
}

trap cleanup EXIT ERR INT TERM

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

run_sql_tuples() {
  local sql="$1"
  "${COMPOSE[@]}" exec -T postgres sh -lc 'psql -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB"' <<<"$sql"
}

sql_escape() {
  printf '%s' "$1" | sed "s/'/''/g"
}

wait_for_matching_job_status() {
  local job_id="$1"
  local pattern="$2"
  local timeout="${3:-180}"
  local deadline=$((SECONDS + timeout))
  local status=""
  while [[ "$SECONDS" -lt "$deadline" ]]; do
    status="$(run_sql_tuples "SELECT status FROM matching_jobs WHERE id = ${job_id};" 2>/dev/null | tail -1 || true)"
    if [[ "$status" =~ $pattern ]]; then
      printf '%s\n' "$status"
      return 0
    fi
    sleep 2
  done
  fail "Timed out waiting for matching job ${job_id} to match ${pattern}; last status=${status:-unknown}."
}

start_worker_peer() {
  info "Start second worker peer"
  local worker_image_id
  worker_image_id="$("${COMPOSE[@]}" images -q subagent-worker | head -1)"
  [[ -n "$worker_image_id" ]] || fail "Unable to resolve subagent-worker image id."
  worker_peer_image="fitmeet-staging-worker-peer:$(date -u '+%Y%m%d%H%M%S')"
  docker tag "$worker_image_id" "$worker_peer_image"
  local backend_container
  backend_container="$("${COMPOSE[@]}" ps -q backend | head -1)"
  [[ -n "$backend_container" ]] || fail "Unable to resolve backend container for network discovery."
  local network_name
  network_name="$(docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' "$backend_container" | head -1)"
  [[ -n "$network_name" ]] || fail "Unable to resolve compose network name."
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
}

stop_worker_peer() {
  docker logs --tail=260 "$worker_peer_name" >"${STAGING_EVIDENCE_DIR}/worker-peer-last.log" 2>&1 || true
  docker rm -f "$worker_peer_name" >/dev/null 2>&1 || true
}

extract_json_id() {
  local file="$1"
  local key="$2"
  node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(String(data.ids?.[process.argv[2]] ?? ''))" "$file" "$key"
}

create_matching_job_seed() {
  info "Create deterministic publish flow and matching job seed"
  "${COMPOSE[@]}" stop subagent-worker >/dev/null 2>&1 || true
  main_worker_stopped=true
  local seed_dir="${STAGING_EVIDENCE_DIR}/matching-job-seed"
  mkdir -p "$seed_dir"
  BASE_URL="$BASE_URL" \
    API_BASE_URL="$API_BASE_URL" \
    FITMEET_AGENT_BROWSER_QA_ALLOW_REMOTE=true \
    STAGING_E2E_OUTPUT_DIR="$seed_dir" \
    STAGING_E2E_STOP_AFTER_PUBLISH=true \
    STAGING_E2E_REQUIRE_CANDIDATE=false \
    pnpm --dir frontend exec node scripts/qa-agent-public-loop-staging.mjs \
      | tee "${STAGING_EVIDENCE_DIR}/matching-job-seed-e2e.log"
  local evidence_json
  evidence_json="$(ls -t "$seed_dir"/agent-public-loop-*.json | head -1)"
  [[ -n "$evidence_json" && -f "$evidence_json" ]] || fail "Matching job seed E2E did not write JSON evidence."
  local public_intent_id
  local social_request_id
  public_intent_id="$(extract_json_id "$evidence_json" publicIntentId)"
  social_request_id="$(extract_json_id "$evidence_json" socialRequestId)"
  [[ -n "$public_intent_id" ]] || fail "Seed E2E did not produce publicIntentId."
  local escaped_public_intent_id
  escaped_public_intent_id="$(sql_escape "$public_intent_id")"
  local job_id
  job_id="$(run_sql_tuples "SELECT id FROM matching_jobs WHERE \"publicIntentId\" = '${escaped_public_intent_id}' ORDER BY id DESC LIMIT 1;" | tail -1)"
  [[ "$job_id" =~ ^[0-9]+$ ]] || fail "Could not find matching job for publicIntentId=${public_intent_id}."
  {
    printf 'publicIntentId=%s\n' "$public_intent_id"
    printf 'socialRequestId=%s\n' "$social_request_id"
    printf 'matchingJobId=%s\n' "$job_id"
    printf 'seedEvidence=%s\n' "$evidence_json"
  } >"${STAGING_EVIDENCE_DIR}/matching-job-seed.ids"
  printf '%s\n' "$job_id"
}

claim_matching_job_as_crashed_worker() {
  local job_id="$1"
  info "Claim matching job ${job_id} as crashed worker lease"
  run_sql "UPDATE matching_jobs
SET status = 'running',
    \"attemptCount\" = \"attemptCount\" + 1,
    \"leaseOwner\" = 'staging-fault-crashed-worker',
    \"leaseExpiresAt\" = now() + interval '8 seconds',
    \"lastHeartbeatAt\" = now(),
    \"startedAt\" = COALESCE(\"startedAt\", now()),
    \"updatedAt\" = now(),
    metadata = COALESCE(metadata, '{}'::jsonb) || '{\"faultInjection\":\"crashed-worker-lease\"}'::jsonb
WHERE id = ${job_id}
  AND status = 'queued'
RETURNING id, status, \"leaseOwner\", \"leaseExpiresAt\";" \
    >"${STAGING_EVIDENCE_DIR}/matching-job-crashed-lease.txt"
  wait_for_matching_job_status "$job_id" '^running$' 20 >/dev/null
}

assert_matching_job_completed_once() {
  local job_id="$1"
  local status
  status="$(wait_for_matching_job_status "$job_id" '^(candidates_ready|no_candidates)$' 240)"
  local row
  row="$(run_sql_tuples "SELECT \"publicIntentId\" || '|' || \"attemptCount\" || '|' || COALESCE(\"candidateCount\", 0)::text || '|' || COALESCE(\"leaseOwner\", '') FROM matching_jobs WHERE id = ${job_id};" | tail -1)"
  IFS='|' read -r public_intent_id attempt_count candidate_count lease_owner <<<"$row"
  [[ -n "$public_intent_id" ]] || fail "Unable to read completed matching job ${job_id}."
  local escaped_public_intent_id
  escaped_public_intent_id="$(sql_escape "$public_intent_id")"
  local job_count
  job_count="$(run_sql_tuples "SELECT count(*) FROM matching_jobs WHERE \"publicIntentId\" = '${escaped_public_intent_id}';" | tail -1)"
  [[ "$job_count" == "1" ]] || fail "Expected exactly one matching job for ${public_intent_id}, got ${job_count}."
  [[ "$lease_owner" == "" ]] || fail "Completed matching job ${job_id} still has leaseOwner=${lease_owner}."
  [[ "$attempt_count" =~ ^[0-9]+$ && "$attempt_count" -le 2 ]] || fail "Matching job ${job_id} was attempted more than once after recovery: attemptCount=${attempt_count}."
  local candidate_dupes
  candidate_dupes="$(run_sql_tuples "SELECT count(*) - count(DISTINCT \"candidateUserId\") FROM social_request_candidates WHERE \"socialRequestId\" = (SELECT \"linkedSocialRequestId\" FROM matching_jobs WHERE id = ${job_id});" | tail -1)"
  [[ "$candidate_dupes" == "0" ]] || fail "Duplicate persisted candidates detected for matching job ${job_id}: ${candidate_dupes}."
  {
    printf 'matchingJobId=%s\n' "$job_id"
    printf 'terminalStatus=%s\n' "$status"
    printf 'publicIntentId=%s\n' "$public_intent_id"
    printf 'attemptCount=%s\n' "$attempt_count"
    printf 'candidateCount=%s\n' "$candidate_count"
    printf 'matchingJobsForIntent=%s\n' "$job_count"
    printf 'duplicateCandidateRows=%s\n' "$candidate_dupes"
  } >"${STAGING_EVIDENCE_DIR}/matching-job-lease-recovery.result"
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

matching_job_id="$(create_matching_job_seed | tail -1)"
claim_matching_job_as_crashed_worker "$matching_job_id"

info "Kill primary worker, wait for lease expiry, and let peer recover the exact matching job"
"${COMPOSE[@]}" kill subagent-worker >/dev/null 2>&1 || true
main_worker_stopped=true
sleep 10
start_worker_peer
assert_matching_job_completed_once "$matching_job_id"
collect_state "10-matching-job-lease-recovery"
docker logs --tail=260 "$worker_peer_name" >"${STAGING_EVIDENCE_DIR}/10-worker-peer.log" 2>&1 || true
verify_staging | tee "${STAGING_EVIDENCE_DIR}/10-lease-recovery-verify.log"
stop_worker_peer

info "Restart primary worker after lease recovery"
"${COMPOSE[@]}" up -d --no-build subagent-worker
main_worker_stopped=false
sleep "$FAULT_WAIT_SECONDS"
collect_state "20-worker-restart"
verify_staging | tee "${STAGING_EVIDENCE_DIR}/20-worker-restart-verify.log"

info "Pause Redis briefly and verify API readiness recovers"
redis_paused=true
"${COMPOSE[@]}" pause redis
sleep "$FAULT_WAIT_SECONDS"
"${COMPOSE[@]}" unpause redis
redis_paused=false
sleep "$FAULT_WAIT_SECONDS"
collect_state "30-redis-recovery"
verify_staging | tee "${STAGING_EVIDENCE_DIR}/30-redis-recovery-verify.log"

info "Pause Mongo briefly and verify API readiness recovers"
mongo_paused=true
"${COMPOSE[@]}" pause mongo
sleep "$FAULT_WAIT_SECONDS"
"${COMPOSE[@]}" unpause mongo
mongo_paused=false
sleep "$FAULT_WAIT_SECONDS"
collect_state "40-mongo-recovery"
verify_staging | tee "${STAGING_EVIDENCE_DIR}/40-mongo-recovery-verify.log"

run_sql "SELECT status, count(*) FROM matching_jobs GROUP BY status ORDER BY status;" \
  >"${STAGING_EVIDENCE_DIR}/final-matching-jobs-status.txt" 2>&1 || true
run_sql "SELECT status, visibility, count(*) FROM user_social_requests GROUP BY status, visibility ORDER BY status, visibility;" \
  >"${STAGING_EVIDENCE_DIR}/final-social-requests-status.txt" 2>&1 || true
collect_state "99-final"

info "Fault injection completed."
