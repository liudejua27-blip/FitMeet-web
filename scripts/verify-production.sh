#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://www.ourfitmeet.cn}"
API_BASE_URL="${API_BASE_URL:-https://www.ourfitmeet.cn/api}"
AGENT_TOKEN="${AGENT_TOKEN:-}"
RUN_APP_SMOKE="${RUN_APP_SMOKE:-false}"
RUN_PUBLIC_INTENT_WRITE="${RUN_PUBLIC_INTENT_WRITE:-false}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-20}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: scripts/verify-production.sh [--base-url https://www.ourfitmeet.cn] [--api-base-url https://www.ourfitmeet.cn/api] [--agent-token token] [--run-app-smoke] [--run-public-intent-write]

Verifies a deployed FitMeet Web/API stack from macOS or Linux:
  - frontend root, backend health, and dependency readiness
  - runtime FitMeet core OpenAPI App contract
  - public feed reachability
  - auth guards on App-protected endpoints
  - optional agent manifest with token
  - optional backend App smoke against the remote API
  - optional public social intent write/read-back

Environment:
  BASE_URL                         Public Web origin. Defaults to https://www.ourfitmeet.cn.
  API_BASE_URL                     Backend API base URL. Defaults to https://www.ourfitmeet.cn/api.
  AGENT_TOKEN                      Optional X-Agent-Token for authorized agent manifest check.
  RUN_APP_SMOKE=true               Run backend smoke:app-core against this remote API.
  RUN_PUBLIC_INTENT_WRITE=true     Exercise public social intent write/read-back.
  APP_SMOKE_*                      Optional backend smoke credentials/options.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="${2:-}"
      shift
      ;;
    --api-base-url)
      API_BASE_URL="${2:-}"
      shift
      ;;
    --agent-token)
      AGENT_TOKEN="${2:-}"
      shift
      ;;
    --run-app-smoke)
      RUN_APP_SMOKE=true
      ;;
    --run-public-intent-write)
      RUN_PUBLIC_INTENT_WRITE=true
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

BASE_URL="${BASE_URL%/}"
API_BASE_URL="${API_BASE_URL%/}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ok() {
  printf '[OK] %s\n' "$1" >&2
}

skip() {
  printf '[SKIP] %s\n' "$1" >&2
}

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

curl_status() {
  local label="$1"
  local url="$2"
  local expected="$3"
  local method="${4:-GET}"
  local body="${5:-}"
  local output="${TMP_DIR}/$(echo "${label}" | tr -c 'A-Za-z0-9' '_').json"
  local status

  if [[ -n "${body}" ]]; then
    status="$(
      curl -sS -m "${TIMEOUT_SECONDS}" -o "${output}" -w '%{http_code}' \
        -X "${method}" \
        -H 'Content-Type: application/json' \
        -H 'User-Agent: FitMeetProductionVerifier/1.0' \
        -H 'X-FitMeet-Device-Id: production-verifier' \
        --data "${body}" \
        "${url}"
    )"
  else
    status="$(
      curl -sS -m "${TIMEOUT_SECONDS}" -o "${output}" -w '%{http_code}' \
        -X "${method}" \
        -H 'User-Agent: FitMeetProductionVerifier/1.0' \
        "${url}"
    )"
  fi

  if [[ ",${expected}," == *",${status},"* ]]; then
    ok "${label} -> ${status}"
    printf '%s\n' "${output}"
    return
  fi

  printf '[FAIL] %s -> %s, expected %s\n' "${label}" "${status}" "${expected}" >&2
  if [[ -s "${output}" ]]; then
    head -c 600 "${output}" >&2
    printf '\n' >&2
  fi
  exit 1
}

frontend_body="$(curl_status "Frontend" "${BASE_URL}" "200")"
health_body="$(curl_status "Backend health" "${API_BASE_URL}/health" "200")"
ready_body="$(curl_status "Backend readiness" "${API_BASE_URL}/ready" "200")"
openapi_body="$(curl_status "FitMeet core OpenAPI" "${API_BASE_URL}/openapi/fitmeet-core.json" "200")"
feed_body="$(curl_status "Public feed" "${API_BASE_URL}/feed?page=1&limit=5" "200")"

node - "${openapi_body}" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
const required = [
  '/auth/login',
  '/auth/refresh',
  '/auth/profile',
  '/users/profile',
  '/uploads/image',
  '/uploads/video',
  '/feed',
  '/public/social-intents',
  '/public/social-intents/{id}',
  '/public/social-intents/{id}/matches',
  '/feed/interactions',
  '/feed/{id}/like',
  '/feed/{id}/save',
  '/feed/{postId}/comments',
  '/feed/comments/{commentId}/like',
  '/messages/start',
  '/messages/public-intents/{id}/start',
  '/messages/conversations',
  '/messages/conversations/{conversationId}',
  '/messages/conversations/{conversationId}/send',
  '/messages/unread',
  '/agents/inbox/conversations',
  '/agents/inbox/conversations/{conversationId}/messages',
  '/agents/inbox/events',
  '/agents/inbox/events/ack',
  '/agents/inbox/conversations/{conversationId}/reply',
  '/agents/profile-matches',
  '/agents/profile-matches/{id}/ignore',
  '/agents/profile-matches/{id}/favorite',
  '/agents/profile-matches/{id}/draft-opener',
  '/agents/profile-matches/{id}/confirm-contact',
  '/agents/profile-matches/{id}/request-contact-exchange',
  '/agents/profile-matches/{id}/send-intro',
  '/social-agent/chat/messages',
  '/social-agent/chat/route-message',
  '/social-agent/chat/run',
  '/social-agent/chat/run-async',
  '/social-agent/chat/stream',
  '/social-agent/chat/stream-user',
  '/social-agent/chat/session',
  '/social-agent/chat/tasks/{taskId}/session',
  '/social-agent/chat/tasks/{taskId}/runs/{runId}',
  '/social-agent/chat/tasks/{taskId}/messages',
  '/social-agent/chat/tasks/{taskId}/publish-social-request',
  '/social-agent/chat/tasks/{taskId}/replan-run',
  '/social-agent/chat/tasks/{taskId}/append-context',
  '/social-agent/chat/tasks/{taskId}/actions',
  '/social-agent/chat/tasks/{taskId}/save-candidate',
  '/social-agent/chat/tasks/{taskId}/send-message',
  '/social-agent/chat/tasks/{taskId}/connect-candidate',
  '/social-agent/tasks/current',
  '/social-agent/tasks/{taskId}/timeline',
  '/social-agent/tasks/{taskId}/events',
  '/social-agent/tasks/{taskId}/replan',
];
const missing = required.filter((path) => !doc.paths?.[path]);
if (missing.length > 0) {
  console.error(`Missing Web/App contract paths: ${missing.join(', ')}`);
  process.exit(1);
}
NODE
ok "Runtime OpenAPI includes Web/App release-critical paths"

node - "${health_body}" "${ready_body}" "${feed_body}" <<'NODE'
const fs = require('fs');
const health = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const ready = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const feed = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
if (health.status !== 'ok') {
  console.error(`Unexpected health payload: ${JSON.stringify(health)}`);
  process.exit(1);
}
if (ready.status !== 'ok' || !ready.checks?.postgres || !ready.checks?.mongo || !ready.checks?.redis) {
  console.error(`Unexpected readiness payload: ${JSON.stringify(ready)}`);
  process.exit(1);
}
if (!Array.isArray(feed.data)) {
  console.error('Feed payload does not expose a data array.');
  process.exit(1);
}
NODE
ok "Health, readiness, and feed payload shapes are readable"

curl_status "Profile without token is protected" "${API_BASE_URL}/auth/profile" "401" >/dev/null
curl_status "Social Agent session without token is protected" "${API_BASE_URL}/social-agent/chat/session" "401" >/dev/null
curl_status "Messages without token are protected" "${API_BASE_URL}/messages/conversations" "401" >/dev/null
curl_status "Agent manifest without token rejects auth" "${API_BASE_URL}/agent/skills/manifest" "401" >/dev/null

if [[ -n "${AGENT_TOKEN}" ]]; then
  agent_output="${TMP_DIR}/agent_manifest.json"
  status="$(
    curl -sS -m "${TIMEOUT_SECONDS}" -o "${agent_output}" -w '%{http_code}' \
      -H "X-Agent-Token: ${AGENT_TOKEN}" \
      "${API_BASE_URL}/agent/skills/manifest"
  )"
  [[ "${status}" == "200" ]] || fail "Agent manifest with token -> ${status}, expected 200"
  ok "Agent manifest with token -> 200"
else
  skip "Agent manifest with token. Set AGENT_TOKEN or pass --agent-token."
fi

if [[ "${RUN_PUBLIC_INTENT_WRITE}" == "true" ]]; then
  public_intent_body='{"requestType":"fitness_partner","description":"Find a verified workout partner nearby tonight","city":"Shanghai","verifiedOnly":true,"limit":3}'
  intent_body="$(curl_status "Public social intent write" "${API_BASE_URL}/public/social-intents" "200,201" "POST" "${public_intent_body}")"
  public_intent_id="$(
    node - "${intent_body}" <<'NODE'
const fs = require('fs');
const doc = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const id = doc.request?.id;
if (id !== undefined && id !== null) process.stdout.write(String(id));
NODE
  )"
  if [[ -n "${public_intent_id}" ]]; then
    curl_status "Public social intent detail" "${API_BASE_URL}/public/social-intents/${public_intent_id}" "200" >/dev/null
    curl_status "Public social intent matches" "${API_BASE_URL}/public/social-intents/${public_intent_id}/matches" "200" >/dev/null
  fi
else
  skip "Public social intent write/read-back. Pass --run-public-intent-write to mutate production."
fi

if [[ "${RUN_APP_SMOKE}" == "true" ]]; then
  if ! command -v pnpm >/dev/null 2>&1; then
    fail "pnpm is required for --run-app-smoke."
  fi
  APP_SMOKE_API_BASE_URL="${API_BASE_URL}" \
    APP_SMOKE_ALLOW_REMOTE=true \
    pnpm --dir "${ROOT_DIR}/backend" smoke:app-core
else
  skip "Remote App smoke. Pass --run-app-smoke after setting APP_SMOKE_* credentials/options."
fi

printf '\nProduction verification completed successfully for %s\n' "${BASE_URL}"
