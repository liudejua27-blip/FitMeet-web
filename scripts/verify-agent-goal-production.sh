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

Environment:
  BASE_URL / API_BASE_URL              Production Web/API origins.
  EXPECTED_RELEASE_COMMIT              Optional release commit prefix.
  EXPECTED_RELEASE_BUILT_AT            Optional exact release builtAt. If unset
                                       and release.json exists, read from it.
  RUN_AGENT_BROWSER_QA=auto|true|false Auto runs when QA credentials exist.
  FITMEET_AGENT_BROWSER_QA_EMAIL       Dedicated QA/smoke account email.
  FITMEET_AGENT_BROWSER_QA_PASSWORD    Dedicated QA/smoke account password.
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
feed_file="$(curl_json "Public feed" "${API_BASE_URL}/feed?page=1&limit=8")"
counts="$(
  node - "${public_intents_file}" "${feed_file}" <<'NODE'
const fs = require('fs');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const listFrom = (doc) => {
  if (Array.isArray(doc)) return doc;
  if (Array.isArray(doc.data)) return doc.data;
  if (Array.isArray(doc.items)) return doc.items;
  if (Array.isArray(doc.results)) return doc.results;
  if (doc.data && Array.isArray(doc.data.items)) return doc.data.items;
  if (doc.data && Array.isArray(doc.data.data)) return doc.data.data;
  if (doc.feed && Array.isArray(doc.feed)) return doc.feed;
  return [];
};
const intents = listFrom(read(process.argv[2]));
const feed = listFrom(read(process.argv[3]));
console.log(`${intents.length} ${feed.length}`);
NODE
)"
read -r public_intent_count feed_count <<<"${counts}"

if [[ "${public_intent_count}" -lt 1 ]]; then
  cat >&2 <<EOF
[FAIL] /public/social-intents returned 0 discoverable items.
[hint] If this is a fresh/empty production DB, seed a safe public Agent smoke intent:
[hint]   cd /opt/FitMeet-web
[hint]   AGENT_SMOKE_SEED_ALLOW_PRODUCTION=true ./scripts/ecs-backend-pnpm.sh -- seed:agent-smoke:prod -- --allow-production
EOF
  exit 1
fi
ok "Public social intents expose ${public_intent_count} discoverable item(s)"

if [[ "${feed_count}" -lt 1 ]]; then
  warn "Public feed has 0 items. Discover can still be proven by public social intents, but public dynamics remain empty."
else
  ok "Public feed exposes ${feed_count} item(s)"
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
    if [[ -n "${FITMEET_AGENT_BROWSER_QA_EMAIL:-${AGENT_SMOKE_EMAIL:-}}" && -n "${FITMEET_AGENT_BROWSER_QA_PASSWORD:-${AGENT_SMOKE_PASSWORD:-}}" ]]; then
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

printf '\nFitMeet Agent goal production verification completed successfully for %s\n' "${BASE_URL}"
