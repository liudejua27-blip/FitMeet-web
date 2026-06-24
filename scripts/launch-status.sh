#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_ORIGIN="${WEB_ORIGIN:-https://www.ourfitmeet.cn}"
API_BASE_URL_WAS_SET="${API_BASE_URL:-}"
API_BASE_URL="${API_BASE_URL:-https://www.ourfitmeet.cn/api}"
FITMEET_LAUNCH_TOPOLOGY="${FITMEET_LAUNCH_TOPOLOGY:-vercel-railway}"
RUN_READINESS_TESTS="${RUN_READINESS_TESTS:-true}"
RUN_DOMAIN_CHECK="${RUN_DOMAIN_CHECK:-true}"
RUN_IOS_TESTFLIGHT_CHECK="${RUN_IOS_TESTFLIGHT_CHECK:-true}"
RUN_RAILWAY_DOCKER_BUILD="${RUN_RAILWAY_DOCKER_BUILD:-false}"
REQUIRE_AGENT_TOKEN_COST_EVIDENCE="${REQUIRE_AGENT_TOKEN_COST_EVIDENCE:-false}"
AGENT_TOKEN_COST_EVIDENCE_FILE="${AGENT_TOKEN_COST_EVIDENCE_FILE:-}"
VALIDATE_AGENT_TOKEN_COST_EVIDENCE_ONLY="${VALIDATE_AGENT_TOKEN_COST_EVIDENCE_ONLY:-false}"
FITMEET_APP_DIR="${FITMEET_APP_DIR:-/Users/liuchongjiang/Documents/FitMeet app}"

# shellcheck source=scripts/lib/toolchain.sh
source "${ROOT_DIR}/scripts/lib/toolchain.sh"
fitmeet_bootstrap_toolchain

failures=0
warnings=0

usage() {
  cat <<'EOF'
Usage: scripts/launch-status.sh [--topology vercel-railway|ecs] [--include-railway-docker-build] [--skip-readiness-tests] [--skip-domain-check] [--skip-ios-testflight-check] [--validate-agent-token-cost-evidence-only]

Aggregates the non-mutating FitMeet launch gates:
  - local deploy readiness Jest guard
  - Vercel/Railway deploy-file and CLI/auth preflight
  - public DNS/TLS/API readiness
  - iOS TestFlight signing/API/staging readiness
  - optional Railway Docker production image build proof

The script exits non-zero when a launch gate is not ready. It does not deploy,
mutate cloud resources, create users, write production data, or submit GitHub.

Environment:
  FITMEET_LAUNCH_TOPOLOGY      Launch topology: vercel-railway or ecs. Default: vercel-railway.
  WEB_ORIGIN                  Public Web origin. Default: https://www.ourfitmeet.cn.
  API_BASE_URL                Public API base. Default: https://www.ourfitmeet.cn/api,
                              or <WEB_ORIGIN>/api when topology is ecs and API_BASE_URL is not set.
  FITMEET_APP_DIR             iOS app repo path. Default: /Users/liuchongjiang/Documents/FitMeet app.
  FITMEET_PNPM_BIN_DIR        Optional pnpm bin directory to prepend to PATH.
  FITMEET_NODE_RUNTIME_DIR    Optional Node bin directory to prepend to PATH.
  RUN_READINESS_TESTS=false   Skip backend production-deploy-readiness.spec.ts.
  RUN_DOMAIN_CHECK=false      Skip public DNS/TLS/API readiness.
  RUN_IOS_TESTFLIGHT_CHECK=false
                              Skip strict iOS TestFlight readiness.
  RUN_RAILWAY_DOCKER_BUILD=true
                              Also run scripts/railway-docker-build-check.sh.
  REQUIRE_AGENT_TOKEN_COST_EVIDENCE=true
                              Require Agent token/cost JSON evidence file.
  AGENT_TOKEN_COST_EVIDENCE_FILE
                              Evidence JSON from scripts/verify-agent-token-cost.sh.
  MIN_PROMPT_PREFIX_REUSE_RATE
                              Optional launch-time override for public prompt prefix reuse.
  MIN_STAGE_PROMPT_PREFIX_REUSE_RATE
                              Optional launch-time override for each required LLM stage.
  MAX_PROMPT_PREFIX_DISTINCT_RATIO
                              Optional launch-time override for public prompt prefix hash drift.
  MAX_STAGE_PROMPT_PREFIX_DISTINCT_RATIO
                              Optional launch-time override for stage prompt prefix hash drift.
  MIN_CACHE_HIT_RATE          Optional launch-time override for public cache hit rate.
  MIN_WORKFLOW_ROUTE_RATE     Optional launch-time override for workflow bypass coverage.
  MAX_AVG_LLM_CALLS_PER_RUN   Optional launch-time override for live avg LLM calls/run.
  VALIDATE_AGENT_TOKEN_COST_EVIDENCE_ONLY=true
                              Validate only the Agent token/cost evidence file.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --topology)
      FITMEET_LAUNCH_TOPOLOGY="${2:-}"
      shift
      ;;
    --include-railway-docker-build)
      RUN_RAILWAY_DOCKER_BUILD=true
      ;;
    --skip-readiness-tests)
      RUN_READINESS_TESTS=false
      ;;
    --skip-domain-check)
      RUN_DOMAIN_CHECK=false
      ;;
    --skip-ios-testflight-check)
      RUN_IOS_TESTFLIGHT_CHECK=false
      ;;
    --validate-agent-token-cost-evidence-only)
      VALIDATE_AGENT_TOKEN_COST_EVIDENCE_ONLY=true
      REQUIRE_AGENT_TOKEN_COST_EVIDENCE=true
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

WEB_ORIGIN="${WEB_ORIGIN%/}"
if [[ "${FITMEET_LAUNCH_TOPOLOGY}" == "ecs" && -z "${API_BASE_URL_WAS_SET}" ]]; then
  API_BASE_URL="${WEB_ORIGIN}/api"
fi
API_BASE_URL="${API_BASE_URL%/}"

pass() {
  printf '[PASS] %s\n' "$1"
}

warn() {
  warnings=$((warnings + 1))
  printf '[WARN] %s\n' "$1" >&2
}

fail() {
  failures=$((failures + 1))
  printf '[FAIL] %s\n' "$1" >&2
}

run_gate() {
  local label="$1"
  shift
  local output

  printf '\n==> %s\n' "${label}"
  output="$("$@" 2>&1)"
  local status=$?
  printf '%s\n' "${output}"
  if [[ "${status}" -eq 0 ]]; then
    pass "${label}"
  else
    fail "${label}"
  fi
}

validate_agent_token_cost_evidence() {
  local evidence_file="${AGENT_TOKEN_COST_EVIDENCE_FILE}"

  if [[ -z "${evidence_file}" ]]; then
    echo "[FAIL] AGENT_TOKEN_COST_EVIDENCE_FILE is required when REQUIRE_AGENT_TOKEN_COST_EVIDENCE=true." >&2
    return 1
  fi
  if [[ ! -f "${evidence_file}" ]]; then
    echo "[FAIL] Agent token/cost evidence file does not exist: ${evidence_file}" >&2
    return 1
  fi

  node - "${evidence_file}" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
const fail = (message) => {
  console.error(`[FAIL] ${message}`);
  process.exit(1);
};
const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const optionalNumber = (value) =>
  value === null || value === undefined || value === ''
    ? null
    : Number.isFinite(Number(value))
      ? Number(value)
      : null;
const envNumber = (key) => {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) fail(`Invalid numeric threshold ${key}=${raw}`);
  return parsed;
};
const threshold = (name, envKey) => {
  const envValue = envNumber(envKey);
  if (envValue !== null) return envValue;
  return optionalNumber(doc.thresholds && doc.thresholds[name]);
};
const assertMin = (label, value, min) => {
  if (min === null) return;
  if (optionalNumber(value) === null) fail(`${label} is missing.`);
  if (number(value) < min) fail(`${label} ${number(value)} is below required ${min}.`);
};
const assertMax = (label, value, max) => {
  if (max === null) return;
  if (optionalNumber(value) === null) fail(`${label} is missing.`);
  if (number(value) > max) fail(`${label} ${number(value)} is above allowed ${max}.`);
};
const ratio = (numerator, denominator) => {
  const den = number(denominator);
  if (den <= 0) return null;
  return number(numerator) / den;
};
if (doc.schemaVersion !== 'fitmeet.agent-token-cost-evidence.v1') {
  fail(`Unexpected token/cost evidence schema: ${doc.schemaVersion || 'missing'}`);
}
if (doc.status !== 'passed') {
  fail(`Agent token/cost evidence status is ${doc.status || 'missing'}`);
}
if (Array.isArray(doc.missing) && doc.missing.length > 0) {
  fail(`Agent token/cost evidence has missing items: ${doc.missing.join(', ')}`);
}
if (!doc.l5Observability || typeof doc.l5Observability !== 'object') {
  fail('Agent token/cost evidence is missing L5 observability data.');
}
const l5 = doc.l5Observability;
if (number(l5.agentRunCount) < 1) fail('Agent token/cost evidence has no agent runs.');
if (number(l5.llmCallCount) < 1) fail('Agent token/cost evidence has no LLM calls.');
if (number(l5.avgLlmCallsPerRun) <= 0) {
  fail('Agent token/cost evidence has invalid avg LLM calls/run.');
}
assertMax(
  'Agent token/cost avg LLM calls/run',
  l5.avgLlmCallsPerRun,
  threshold('maxAvgLlmCallsPerRun', 'MAX_AVG_LLM_CALLS_PER_RUN'),
);
const aggregate = l5.aggregate || {};
if (number(aggregate.promptTokens) < 1) {
  fail('Agent token/cost evidence has no prompt token data.');
}
const publicMetrics = doc.publicMetrics || {};
assertMin(
  'Agent token/cost workflow route rate',
  publicMetrics.workflowRouteRate,
  threshold('minWorkflowRouteRate', 'MIN_WORKFLOW_ROUTE_RATE'),
);
assertMin(
  'Agent token/cost cache hit rate',
  publicMetrics.cacheHitRate,
  threshold('minCacheHitRate', 'MIN_CACHE_HIT_RATE'),
);
assertMin(
  'Agent token/cost prompt prefix reuse rate',
  publicMetrics.promptPrefixReuseRate,
  threshold('minPromptPrefixReuseRate', 'MIN_PROMPT_PREFIX_REUSE_RATE'),
);
assertMax(
  'Agent token/cost prompt prefix distinct ratio',
  publicMetrics.promptPrefixDistinctRatio ??
    ratio(
      publicMetrics.distinctPromptPrefixHashes,
      publicMetrics.promptPrefixObservations,
    ),
  threshold('maxPromptPrefixDistinctRatio', 'MAX_PROMPT_PREFIX_DISTINCT_RATIO'),
);
const requiredStages = Array.isArray(doc.requiredStages) ? doc.requiredStages : [];
const useCases = l5.useCases || {};
const minStagePromptPrefixReuseRate = threshold(
  'minStagePromptPrefixReuseRate',
  'MIN_STAGE_PROMPT_PREFIX_REUSE_RATE',
);
const maxStagePromptPrefixDistinctRatio = threshold(
  'maxStagePromptPrefixDistinctRatio',
  'MAX_STAGE_PROMPT_PREFIX_DISTINCT_RATIO',
);
for (const stage of requiredStages) {
  const bucket = useCases[stage];
  if (!bucket) fail(`Agent token/cost evidence missing stage: ${stage}`);
  if (number(bucket.calls) < 1) fail(`Agent token/cost evidence stage has no calls: ${stage}`);
  if (number(bucket.promptTokens) < 1) {
    fail(`Agent token/cost evidence stage has no prompt tokens: ${stage}`);
  }
  assertMin(
    `Agent token/cost ${stage} prompt prefix reuse rate`,
    bucket.promptPrefixReuseRate,
    minStagePromptPrefixReuseRate,
  );
  assertMax(
    `Agent token/cost ${stage} prompt prefix distinct ratio`,
    bucket.promptPrefixDistinctRatio ??
      ratio(bucket.distinctPromptPrefixHashes, bucket.calls),
    maxStagePromptPrefixDistinctRatio,
  );
}
console.log(`[PASS] Agent token/cost evidence is present: ${file}`);
NODE
}

cd "${ROOT_DIR}" || exit 1

if [[ "${VALIDATE_AGENT_TOKEN_COST_EVIDENCE_ONLY}" == "true" ]]; then
  validate_agent_token_cost_evidence
  exit $?
fi

if [[ "${FITMEET_LAUNCH_TOPOLOGY}" != "vercel-railway" && "${FITMEET_LAUNCH_TOPOLOGY}" != "ecs" ]]; then
  fail "FITMEET_LAUNCH_TOPOLOGY must be vercel-railway or ecs."
fi

run_gate "Shell syntax for production scripts" \
  bash -n \
  scripts/deploy-production.sh \
  scripts/cloud-platform-preflight.sh \
  scripts/domain-readiness-check.sh \
  scripts/vercel-prebuilt-deploy.sh \
  scripts/verify-production.sh \
  scripts/railway-docker-build-check.sh \
  scripts/ecs-install-release.sh \
  scripts/ecs-upload-release.sh \
  scripts/ecs-workbench-install-plan.sh \
  scripts/ecs-post-deploy-smoke.sh \
  scripts/verify-agent-release.sh \
  scripts/agent-release-matrix.sh \
  scripts/launch-status.sh

if [[ -d "${FITMEET_APP_DIR}" ]]; then
  run_gate "iOS release script syntax" \
    bash -n \
    "${FITMEET_APP_DIR}/Scripts/release-preflight-ios.sh" \
    "${FITMEET_APP_DIR}/Scripts/ecs-release-preflight-ios.sh" \
    "${FITMEET_APP_DIR}/Scripts/testflight-readiness-check.sh" \
    "${FITMEET_APP_DIR}/Scripts/testflight-archive.sh"
else
  fail "iOS release script syntax"
  warn "FITMEET_APP_DIR does not exist: ${FITMEET_APP_DIR}"
fi

if [[ "${RUN_READINESS_TESTS}" == "true" ]]; then
  if command -v pnpm >/dev/null 2>&1; then
    run_gate "Backend production deploy readiness tests" \
      pnpm --dir backend test -- production-deploy-readiness.spec.ts
  else
    fail "Backend production deploy readiness tests"
    warn "pnpm is not available on PATH."
  fi
else
  warn "Skipped backend production deploy readiness tests."
fi

if [[ "${FITMEET_LAUNCH_TOPOLOGY}" == "vercel-railway" ]]; then
  run_gate "Vercel/Railway platform preflight" \
    env WEB_ORIGIN="${WEB_ORIGIN}" API_BASE_URL="${API_BASE_URL}" STRICT=true \
    ./scripts/cloud-platform-preflight.sh
else
  warn "Skipped Vercel/Railway platform preflight for ECS topology."
fi

if [[ "${RUN_DOMAIN_CHECK}" == "true" ]]; then
  run_gate "Public DNS/TLS/API readiness" \
    env FITMEET_LAUNCH_TOPOLOGY="${FITMEET_LAUNCH_TOPOLOGY}" \
    WEB_ORIGIN="${WEB_ORIGIN}" API_BASE_URL="${API_BASE_URL}" \
    ./scripts/domain-readiness-check.sh --topology "${FITMEET_LAUNCH_TOPOLOGY}"
else
  warn "Skipped public DNS/TLS/API readiness."
fi

if [[ "${RUN_IOS_TESTFLIGHT_CHECK}" == "true" ]]; then
  if [[ -x "${FITMEET_APP_DIR}/Scripts/testflight-readiness-check.sh" ]]; then
    run_gate "iOS TestFlight readiness" \
      env FITMEET_ALPHA_EXPECTED_API_BASE_URL="${API_BASE_URL}" \
      "${FITMEET_APP_DIR}/Scripts/testflight-readiness-check.sh" \
      --strict \
      --require-staging \
      --expected-api-base "${API_BASE_URL}"
  else
    fail "iOS TestFlight readiness"
    warn "Missing executable script: ${FITMEET_APP_DIR}/Scripts/testflight-readiness-check.sh"
  fi
else
  warn "Skipped iOS TestFlight readiness."
fi

if [[ "${RUN_RAILWAY_DOCKER_BUILD}" == "true" && "${FITMEET_LAUNCH_TOPOLOGY}" == "vercel-railway" ]]; then
  run_gate "Railway production Docker image build" \
    ./scripts/railway-docker-build-check.sh
elif [[ "${RUN_RAILWAY_DOCKER_BUILD}" == "true" ]]; then
  warn "Skipped Railway production Docker image build for ECS topology."
elif [[ "${FITMEET_LAUNCH_TOPOLOGY}" == "ecs" ]]; then
  warn "Skipped Railway production Docker image build; not required for ECS topology."
else
  warn "Skipped Railway production Docker image build. Re-run with --include-railway-docker-build before Railway deploy."
fi

if [[ "${REQUIRE_AGENT_TOKEN_COST_EVIDENCE}" == "true" ]]; then
  run_gate "Agent token/cost evidence" validate_agent_token_cost_evidence
else
  warn "Skipped Agent token/cost evidence gate. Set REQUIRE_AGENT_TOKEN_COST_EVIDENCE=true before final Agent cutover."
fi

printf '\nLaunch status: %s failure(s), %s warning(s).\n' "${failures}" "${warnings}"
if [[ "${failures}" -gt 0 ]]; then
  exit 1
fi
