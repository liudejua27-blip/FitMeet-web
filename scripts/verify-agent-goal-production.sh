#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://www.ourfitmeet.cn}"
API_BASE_URL="${API_BASE_URL:-https://www.ourfitmeet.cn/api}"
EXPECTED_RELEASE_COMMIT="${EXPECTED_RELEASE_COMMIT:-}"
EXPECTED_RELEASE_BUILT_AT="${EXPECTED_RELEASE_BUILT_AT:-}"
RUN_AGENT_BROWSER_QA="${RUN_AGENT_BROWSER_QA:-auto}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-20}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

usage() {
  cat <<'EOF'
Usage: scripts/verify-agent-goal-production.sh

Verifies the production fixes for the FitMeet Agent/Discover regression set:
  - public /api/health exposes the expected release
  - Discover no longer relies on fake "128 people" copy
  - public social intents contain at least one real discoverable item
  - production Agent browser QA catches ordinary-chat social leakage, stale
    checkpoint recovery, account menu blocking, and ordinary thread title drift
  - Agent token/cost evidence is checked through admin-only L5 observability;
    when REQUIRE_AGENT_COST_DATA=true, live LLM cost buckets must be present

Environment:
  BASE_URL / API_BASE_URL              Production Web/API origins.
  EXPECTED_RELEASE_COMMIT              Optional release commit prefix.
  EXPECTED_RELEASE_BUILT_AT            Optional exact release builtAt. If unset
                                       and release.json exists, read from it.
  RUN_AGENT_BROWSER_QA=auto|true|false Auto runs when QA credentials exist.
  FITMEET_AGENT_BROWSER_QA_EMAIL       Dedicated QA account email.
  FITMEET_AGENT_BROWSER_QA_PASSWORD    Dedicated QA/smoke account password.
  FITMEET_ADMIN_JWT or ADMIN_JWT       Optional admin token for L5 cost data.
  REQUIRE_AGENT_COST_DATA=true         Fail when live cost evidence is missing.
  AGENT_TOKEN_COST_EVIDENCE_FILE=path  Optional JSON evidence file for token/cost verification.
  MIN_STAGE_PROMPT_PREFIX_REUSE_RATE   Optional per-stage prompt prefix reuse threshold.
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

BASE_URL="${BASE_URL%/}"
API_BASE_URL="${API_BASE_URL%/}"

ok() {
  printf '[OK] %s\n' "$1"
}

warn() {
  printf '[WARN] %s\n' "$1" >&2
}

skip() {
  printf '[SKIP] %s\n' "$1"
}

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

curl_json() {
  local label="$1"
  local url="$2"
  local output="${TMP_DIR}/$(echo "${label}" | tr -c 'A-Za-z0-9' '_').json"
  local status
  status="$(
    curl -sS -m "${TIMEOUT_SECONDS}" -o "${output}" -w '%{http_code}' \
      -H 'User-Agent: FitMeetAgentGoalVerifier/1.0' \
      "${url}"
  )"
  if [[ "${status}" != "200" ]]; then
    printf '[FAIL] %s -> %s, expected 200\n' "${label}" "${status}" >&2
    if [[ -s "${output}" ]]; then
      head -c 600 "${output}" >&2
      printf '\n' >&2
    fi
    exit 1
  fi
  printf '%s\n' "${output}"
}

if [[ -z "${EXPECTED_RELEASE_BUILT_AT}" && -f "${ROOT_DIR}/release.json" ]]; then
  EXPECTED_RELEASE_BUILT_AT="$(
    node -e "const fs=require('fs');const r=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(String(r.builtAt||''));" \
      "${ROOT_DIR}/release.json"
  )"
fi

health_file="$(curl_json "Backend health" "${API_BASE_URL}/health")"
node - "${health_file}" "${EXPECTED_RELEASE_COMMIT}" "${EXPECTED_RELEASE_BUILT_AT}" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const expectedCommit = process.argv[3] || '';
const expectedBuiltAt = process.argv[4] || '';
const health = JSON.parse(fs.readFileSync(file, 'utf8'));
const release = health.release && typeof health.release === 'object' ? health.release : {};
const commit = String(release.commit || 'unknown');
const builtAt = String(release.builtAt || '');
if (expectedCommit && !commit.startsWith(expectedCommit) && !expectedCommit.startsWith(commit)) {
  console.error(`release.commit mismatch: got ${commit}, expected ${expectedCommit}`);
  process.exit(1);
}
if (expectedBuiltAt && builtAt !== expectedBuiltAt) {
  console.error(`release.builtAt mismatch: got ${builtAt || 'missing'}, expected ${expectedBuiltAt}`);
  process.exit(1);
}
console.log(`[OK] Backend release commit=${commit} builtAt=${builtAt || 'missing'}`);
NODE

discover_html="${TMP_DIR}/discover.html"
discover_status="$(
  curl -sS -m "${TIMEOUT_SECONDS}" -o "${discover_html}" -w '%{http_code}' \
    -H 'User-Agent: FitMeetAgentGoalVerifier/1.0' \
    "${BASE_URL}/discover"
)"
[[ "${discover_status}" == "200" ]] || fail "Discover page -> ${discover_status}, expected 200"
if grep -q '128 人本周已发布真实生活场景' "${discover_html}"; then
  fail "Discover page still contains fake 128-person production copy."
fi
ok "Discover page reachable and static HTML does not include fake 128-person copy"

public_intents_file="$(curl_json "Public social intents" "${API_BASE_URL}/public/social-intents?page=1&limit=8")"
counts="$(
  node - "${public_intents_file}" <<'NODE'
const fs = require('fs');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const listFrom = (doc) => {
  if (Array.isArray(doc)) return doc;
  if (Array.isArray(doc.data)) return doc.data;
  if (Array.isArray(doc.items)) return doc.items;
  if (Array.isArray(doc.results)) return doc.results;
  if (doc.data && Array.isArray(doc.data.items)) return doc.data.items;
  if (doc.data && Array.isArray(doc.data.data)) return doc.data.data;
  return [];
};
const intents = listFrom(read(process.argv[2]));
console.log(`${intents.length}`);
NODE
)"
read -r public_intent_count <<<"${counts}"

if [[ "${public_intent_count}" -lt 1 ]]; then
  cat >&2 <<EOF
[FAIL] /public/social-intents returned 0 discoverable items.
[hint] If this is a fresh/empty production DB, publish a safe Agent约练卡 through /agent and confirm it appears in Discover.
EOF
  exit 1
fi
ok "Public social intents expose ${public_intent_count} discoverable item(s)"

public_probe_file="${TMP_DIR}/public-intent-probe.json"
node - "${public_intents_file}" >"${public_probe_file}" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
const listFrom = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.data?.items)) return value.data.items;
  if (Array.isArray(value?.data?.data)) return value.data.data;
  return [];
};
const intents = listFrom(doc);
const forbiddenKeys = new Set(['source', 'filters', 'candidateUserIds']);
const forbiddenText =
  /(agent[\s_-]*smoke|api[\s_-]*smoke|agent-api-smoke|agent_api_smoke|smoke[\s_-]*(account|owner)?|fixture|mock|seed)/i;
const failures = [];
const scan = (value, path = '$') => {
  if (value == null) return;
  if (typeof value === 'string') {
    if (forbiddenText.test(value)) {
      failures.push(`${path} contains internal fixture/smoke text`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scan(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) {
      failures.push(`${path}.${key} exposes internal public-intent field`);
    }
    scan(child, `${path}.${key}`);
  }
};
intents.forEach((intent, index) => scan(intent, `intents[${index}]`));
if (failures.length > 0) {
  console.error(failures.slice(0, 20).join('\n'));
  process.exit(1);
}
const first = intents.find((intent) => intent && intent.id);
if (!first) {
  console.error('No public intent id found for detail verification');
  process.exit(1);
}
process.stdout.write(
  JSON.stringify({
    id: String(first.id),
    ownerUserId:
      Number.isFinite(Number(first.userId)) && Number(first.userId) > 0
        ? Number(first.userId)
        : null,
  }),
);
NODE
ok "Public social intent list hides smoke fixtures and internal fields"

first_public_intent_id="$(
  node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(p.id);" "${public_probe_file}"
)"
first_public_intent_owner_id="$(
  node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(p.ownerUserId ? String(p.ownerUserId) : '');" "${public_probe_file}"
)"

public_intent_detail_file="$(curl_json "Public social intent detail" "${API_BASE_URL}/public/social-intents/${first_public_intent_id}")"
public_intent_matches_file="$(curl_json "Public social intent matches" "${API_BASE_URL}/public/social-intents/${first_public_intent_id}/matches")"

node - "${public_intent_detail_file}" "${public_intent_matches_file}" "${first_public_intent_owner_id}" <<'NODE'
const fs = require('fs');
const detail = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const matches = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const ownerUserId = Number(process.argv[4] || 0);
const forbiddenIntentKeys = new Set(['source', 'filters', 'candidateUserIds']);
const forbiddenText =
  /(agent[\s_-]*smoke|api[\s_-]*smoke|agent-api-smoke|agent_api_smoke|smoke[\s_-]*(account|owner)?|fixture|mock|seed)/i;
const failures = [];
const scan = (value, path = '$', forbiddenKeys = forbiddenIntentKeys) => {
  if (value == null) return;
  if (typeof value === 'string') {
    if (forbiddenText.test(value)) {
      failures.push(`${path} contains internal fixture/smoke text`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scan(item, `${path}[${index}]`, forbiddenKeys));
    return;
  }
  if (typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) {
      failures.push(`${path}.${key} exposes internal field`);
    }
    scan(child, `${path}.${key}`, forbiddenKeys);
  }
};
const candidatesFrom = (doc) => {
  if (Array.isArray(doc)) return doc;
  if (Array.isArray(doc?.candidates)) return doc.candidates;
  if (Array.isArray(doc?.data)) return doc.data;
  if (Array.isArray(doc?.items)) return doc.items;
  if (Array.isArray(doc?.results)) return doc.results;
  if (Array.isArray(doc?.data?.items)) return doc.data.items;
  return [];
};
scan(detail, 'detail');
const candidates = candidatesFrom(matches);
candidates.forEach((candidate, index) => {
  scan(candidate, `matches.candidates[${index}]`, new Set());
  const candidateId = Number(candidate?.profile?.id ?? candidate?.userId ?? candidate?.id);
  if (
    Number.isFinite(ownerUserId) &&
    ownerUserId > 0 &&
    Number.isFinite(candidateId) &&
    candidateId === ownerUserId
  ) {
    failures.push(`matches.candidates[${index}] includes the public-intent owner`);
  }
});
if (failures.length > 0) {
  console.error(failures.slice(0, 30).join('\n'));
  process.exit(1);
}
NODE
ok "Public social intent detail/matches hide smoke data and exclude self-match"

if [[ -n "${first_public_intent_owner_id}" ]]; then
  public_user_file="$(curl_json "Public user profile" "${API_BASE_URL}/users/${first_public_intent_owner_id}")"
  node - "${public_user_file}" <<'NODE'
const fs = require('fs');
const user = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const forbiddenKeys = new Set([
  'email',
  'password',
  'phone',
  'wechatOpenId',
  'bestRecords',
  'lat',
  'lng',
  'locationUpdatedAt',
  'acceptNearbyMatch',
]);
const forbiddenText =
  /(agent[\s_-]*smoke|api[\s_-]*smoke|agent-api-smoke|agent_api_smoke|smoke[\s_-]*(account|owner)?|fixture|mock|seed)/i;
const failures = [];
const scan = (value, path = '$') => {
  if (value == null) return;
  if (typeof value === 'string') {
    if (forbiddenText.test(value)) {
      failures.push(`${path} contains internal fixture/smoke text`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scan(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) {
      failures.push(`${path}.${key} exposes private profile field`);
    }
    scan(child, `${path}.${key}`);
  }
};
scan(user, 'user');
if (failures.length > 0) {
  console.error(failures.slice(0, 30).join('\n'));
  process.exit(1);
}
NODE
  ok "Public user profile hides private fields and internal smoke copy"
else
  skip "Public user profile privacy check. Public intent has no owner user id."
fi

should_run_browser_qa=false
case "${RUN_AGENT_BROWSER_QA}" in
  true)
    should_run_browser_qa=true
    ;;
  false)
    should_run_browser_qa=false
    ;;
  auto)
    if [[ -n "${FITMEET_AGENT_BROWSER_QA_EMAIL:-}" && -n "${FITMEET_AGENT_BROWSER_QA_PASSWORD:-}" ]]; then
      should_run_browser_qa=true
    fi
    ;;
  *)
    fail "RUN_AGENT_BROWSER_QA must be auto, true, or false."
    ;;
esac

if [[ "${should_run_browser_qa}" == "true" ]]; then
  if ! command -v pnpm >/dev/null 2>&1; then
    fail "pnpm is required to run production browser QA."
  fi
  FITMEET_AGENT_BROWSER_QA_ALLOW_REMOTE=true \
    BASE_URL="${BASE_URL}" \
    API_BASE_URL="${API_BASE_URL}" \
    EXPECTED_RELEASE_COMMIT="${EXPECTED_RELEASE_COMMIT}" \
    pnpm --dir "${ROOT_DIR}/frontend" run qa:agent-chat:production
  ok "Production Agent browser QA passed"
else
  skip "Production Agent browser QA. Set FITMEET_AGENT_BROWSER_QA_EMAIL/PASSWORD or RUN_AGENT_BROWSER_QA=true."
fi

API_BASE_URL="${API_BASE_URL}" \
  REQUIRE_AGENT_COST_DATA="${REQUIRE_AGENT_COST_DATA:-false}" \
  REQUIRE_STAGE_COSTS="${REQUIRE_STAGE_COSTS:-final_response,planner,brain}" \
  FITMEET_ADMIN_JWT="${FITMEET_ADMIN_JWT:-${ADMIN_JWT:-}}" \
  "${ROOT_DIR}/scripts/verify-agent-token-cost.sh"
ok "Agent token/cost verification completed"

printf '\nFitMeet Agent goal production verification completed successfully for %s\n' "${BASE_URL}"
