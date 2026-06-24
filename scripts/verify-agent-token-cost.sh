#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-https://www.ourfitmeet.cn/api}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-20}"
REQUIRE_AGENT_COST_DATA="${REQUIRE_AGENT_COST_DATA:-false}"
REQUIRE_STAGE_COSTS="${REQUIRE_STAGE_COSTS:-final_response,planner,brain}"
AGENT_TOKEN_COST_EVIDENCE_FILE="${AGENT_TOKEN_COST_EVIDENCE_FILE:-}"
ADMIN_JWT="${FITMEET_ADMIN_JWT:-${ADMIN_JWT:-}}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

usage() {
  cat <<'EOF'
Usage: scripts/verify-agent-token-cost.sh

Fetches the admin-only Agent L5 observability endpoint and reports token/cost
optimization evidence:
  - avg LLM calls per run
  - prompt tokens
  - cached tokens and DeepSeek cache hit rate
  - final/planner/brain stage cost buckets
  - prompt prefix hash reuse

Environment:
  API_BASE_URL                         API origin, default https://www.ourfitmeet.cn/api
  FITMEET_ADMIN_JWT or ADMIN_JWT        Optional admin bearer token for /social-agent/l5/observability
  REQUIRE_AGENT_COST_DATA=true          Fail if live run/cost evidence is missing
  REQUIRE_STAGE_COSTS=csv               Required LLM use-case buckets when REQUIRE_AGENT_COST_DATA=true
  AGENT_TOKEN_COST_EVIDENCE_FILE=path    Optional JSON evidence output path for release archives
  MIN_STAGE_PROMPT_PREFIX_REUSE_RATE=0.70
                                      Optional fail threshold applied to each required LLM stage
  MAX_STAGE_PROMPT_PREFIX_DISTINCT_RATIO=0.30
                                      Optional fail threshold for distinct prefix hashes / calls per stage
  MAX_AVG_LLM_CALLS_PER_RUN=3           Optional fail threshold for live avg LLM calls per run
  TIMEOUT_SECONDS=20                    curl timeout

This script is read-only. It does not create users, mutate data, or print tokens.
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

API_BASE_URL="${API_BASE_URL%/}"

ok() {
  printf '[OK] %s\n' "$1"
}

warn() {
  printf '[WARN] %s\n' "$1" >&2
}

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

is_truthy() {
  case "${1:-}" in
    1|true|TRUE|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

curl_json() {
  local label="$1"
  local url="$2"
  local token="${3:-}"
  local output="${TMP_DIR}/$(echo "${label}" | tr -c 'A-Za-z0-9' '_').json"
  local status
  local args=(
    -sS
    -m "${TIMEOUT_SECONDS}"
    -o "${output}"
    -w '%{http_code}'
    -H 'User-Agent: FitMeetAgentTokenCostVerifier/1.0'
  )
  if [[ -n "${token}" ]]; then
    args+=(-H "Authorization: Bearer ${token}")
  fi
  status="$(curl "${args[@]}" "${url}")"
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

observability_file=""
if [[ -n "${ADMIN_JWT}" ]]; then
  observability_file="$(curl_json "Agent L5 observability" "${API_BASE_URL}/social-agent/l5/observability" "${ADMIN_JWT}")"
  ok "Fetched Agent L5 observability"
elif is_truthy "${REQUIRE_AGENT_COST_DATA}"; then
  fail "FITMEET_ADMIN_JWT or ADMIN_JWT is required when REQUIRE_AGENT_COST_DATA=true."
else
  warn "Skipping admin-only Agent L5 observability. Set FITMEET_ADMIN_JWT or ADMIN_JWT to verify live LLM token cost."
fi

node - "${observability_file}" "${REQUIRE_AGENT_COST_DATA}" "${REQUIRE_STAGE_COSTS}" <<'NODE'
const fs = require('fs');

const [observabilityPath, requireDataRaw, requiredStagesRaw] =
  process.argv.slice(2);
const requireData = /^(1|true|yes)$/i.test(requireDataRaw || '');
const requiredStages = String(requiredStagesRaw || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const evidenceFile = process.env.AGENT_TOKEN_COST_EVIDENCE_FILE || '';

const readJson = (file) => {
  if (!file) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};
const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const rate = (value) =>
  value === null || value === undefined ? 'n/a' : `${(number(value) * 100).toFixed(1)}%`;
const envNumber = (key) => {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    console.error(`Invalid numeric threshold ${key}=${raw}`);
    process.exit(2);
  }
  return parsed;
};

const missing = [];
const minStagePromptPrefixReuseRate = envNumber('MIN_STAGE_PROMPT_PREFIX_REUSE_RATE');
const maxStagePromptPrefixDistinctRatio = envNumber(
  'MAX_STAGE_PROMPT_PREFIX_DISTINCT_RATIO',
);
const maxAvgLlmCallsPerRun = envNumber('MAX_AVG_LLM_CALLS_PER_RUN');
const thresholds = {
  minStagePromptPrefixReuseRate,
  maxStagePromptPrefixDistinctRatio,
  maxAvgLlmCallsPerRun,
};
let l5Evidence = null;

const writeEvidence = (status, missingItems) => {
  if (!evidenceFile) return;
  const payload = {
    schemaVersion: 'fitmeet.agent-token-cost-evidence.v1',
    generatedAt: new Date().toISOString(),
    apiBaseUrl: process.env.API_BASE_URL || '',
    requireAgentCostData: requireData,
    requiredStages,
    thresholds,
    status,
    missing: missingItems,
    l5Observability: l5Evidence,
  };
  fs.mkdirSync(require('path').dirname(evidenceFile), { recursive: true });
  fs.writeFileSync(evidenceFile, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`\nWrote token-cost evidence: ${evidenceFile}`);
};

const observability = readJson(observabilityPath);
if (!observability) {
  if (requireData) missing.push('L5 observability snapshot');
} else {
  const execution = observability.executionCostSummary || {};
  const llmTokenCost = observability.llmTokenCost || {};
  const useCaseNames = Object.keys(llmTokenCost).sort();
  const aggregate = Object.values(llmTokenCost).reduce(
    (acc, bucket) => {
      acc.promptTokens += number(bucket.promptTokens);
      acc.promptCacheHitTokens += number(bucket.promptCacheHitTokens);
      acc.promptCacheMissTokens += number(bucket.promptCacheMissTokens);
      acc.completionTokens += number(bucket.completionTokens);
      acc.reasoningTokens += number(bucket.reasoningTokens);
      return acc;
    },
    {
      promptTokens: 0,
      promptCacheHitTokens: 0,
      promptCacheMissTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
    },
  );
  const measuredCache =
    aggregate.promptCacheHitTokens + aggregate.promptCacheMissTokens;
  const promptCacheHitRate =
    measuredCache > 0 ? aggregate.promptCacheHitTokens / measuredCache : null;

  console.log('\nAgent L5 live cost snapshot');
  console.log(`- agent runs: ${number(execution.agentRunCount)}`);
  console.log(`- LLM calls: ${number(execution.llmCallCount)}`);
  console.log(`- avg LLM calls/run: ${number(execution.avgLlmCallsPerRun)}`);
  console.log(`- tool calls: ${number(execution.toolCallCount)}`);
  console.log(`- prompt tokens: ${aggregate.promptTokens}`);
  console.log(`- cached prompt tokens: ${aggregate.promptCacheHitTokens}`);
  console.log(`- prompt cache hit rate: ${rate(promptCacheHitRate)}`);
  console.log(`- completion tokens: ${aggregate.completionTokens}`);
  console.log(`- reasoning tokens: ${aggregate.reasoningTokens}`);
  console.log(`- LLM use cases: ${useCaseNames.length ? useCaseNames.join(', ') : 'none'}`);
  l5Evidence = {
    agentRunCount: number(execution.agentRunCount),
    llmCallCount: number(execution.llmCallCount),
    avgLlmCallsPerRun: number(execution.avgLlmCallsPerRun),
    toolCallCount: number(execution.toolCallCount),
    aggregate,
    promptCacheHitRate,
    useCases: {},
  };

  for (const useCase of useCaseNames) {
    const bucket = llmTokenCost[useCase] || {};
    const calls = number(bucket.calls);
    const distinctPromptPrefixHashes = number(bucket.distinctPromptPrefixHashes);
    const distinctDynamicContextHashes = number(bucket.distinctDynamicContextHashes);
    const promptPrefixReuseRate =
      calls > 0 ? Math.max(0, 1 - distinctPromptPrefixHashes / calls) : null;
    const promptPrefixDistinctRatio =
      calls > 0 ? distinctPromptPrefixHashes / calls : null;
    console.log(
      `  - ${useCase}: calls=${calls} prompt=${number(
        bucket.promptTokens,
      )} cached=${number(bucket.promptCacheHitTokens)} billableInput=${number(
        bucket.estimatedBillableInputTokens,
      )} cacheHit=${rate(bucket.promptCacheHitRate)} prefixReuse=${rate(
        promptPrefixReuseRate,
      )} prefixes=${distinctPromptPrefixHashes} dynamic=${distinctDynamicContextHashes}`,
    );
    l5Evidence.useCases[useCase] = {
      calls,
      promptTokens: number(bucket.promptTokens),
      promptCacheHitTokens: number(bucket.promptCacheHitTokens),
      promptCacheMissTokens: number(bucket.promptCacheMissTokens),
      estimatedBillableInputTokens: number(bucket.estimatedBillableInputTokens),
      completionTokens: number(bucket.completionTokens),
      reasoningTokens: number(bucket.reasoningTokens),
      promptCacheHitRate: number(bucket.promptCacheHitRate),
      promptPrefixReuseRate:
        promptPrefixReuseRate === null ? null : Number(promptPrefixReuseRate.toFixed(4)),
      promptPrefixDistinctRatio:
        promptPrefixDistinctRatio === null
          ? null
          : Number(promptPrefixDistinctRatio.toFixed(4)),
      distinctPromptPrefixHashes,
      distinctDynamicContextHashes,
      models: Array.isArray(bucket.models) ? bucket.models : [],
    };
  }

  if (requireData) {
    if (number(execution.agentRunCount) < 1) missing.push('agent run count');
    if (number(execution.llmCallCount) < 1) missing.push('LLM call count');
    if (aggregate.promptTokens < 1) missing.push('prompt token metrics');
    for (const stage of requiredStages) {
      const bucket = llmTokenCost[stage];
      if (!bucket) {
        missing.push(`LLM stage cost: ${stage}`);
        continue;
      }
      if (number(bucket.calls) < 1) missing.push(`LLM stage calls: ${stage}`);
      if (number(bucket.promptTokens) < 1) {
        missing.push(`LLM stage prompt tokens: ${stage}`);
      }
      if (number(bucket.distinctPromptPrefixHashes) < 1) {
        missing.push(`LLM stage prompt prefix hashes: ${stage}`);
      }
    }
  }
  if (minStagePromptPrefixReuseRate !== null) {
    for (const stage of requiredStages) {
      const bucket = llmTokenCost[stage];
      if (!bucket) continue;
      const calls = number(bucket.calls);
      const distinctPromptPrefixHashes = number(bucket.distinctPromptPrefixHashes);
      const stagePromptPrefixReuseRate =
        calls > 0 ? Math.max(0, 1 - distinctPromptPrefixHashes / calls) : 0;
      if (stagePromptPrefixReuseRate < minStagePromptPrefixReuseRate) {
        missing.push(
          `${stage} prompt prefix reuse rate >= ${minStagePromptPrefixReuseRate}`,
        );
      }
    }
  }
  if (maxStagePromptPrefixDistinctRatio !== null) {
    for (const stage of requiredStages) {
      const bucket = llmTokenCost[stage];
      if (!bucket) continue;
      const calls = number(bucket.calls);
      const distinctPromptPrefixHashes = number(bucket.distinctPromptPrefixHashes);
      const stagePromptPrefixDistinctRatio =
        calls > 0 ? distinctPromptPrefixHashes / calls : 1;
      if (stagePromptPrefixDistinctRatio > maxStagePromptPrefixDistinctRatio) {
        missing.push(
          `${stage} prompt prefix distinct ratio <= ${maxStagePromptPrefixDistinctRatio}`,
        );
      }
    }
  }
  if (
    maxAvgLlmCallsPerRun !== null &&
    number(execution.avgLlmCallsPerRun) > maxAvgLlmCallsPerRun
  ) {
    missing.push(`avg LLM calls/run <= ${maxAvgLlmCallsPerRun}`);
  }
}

if (missing.length) {
  console.error(`\nMissing required token-cost evidence: ${missing.join(', ')}`);
  writeEvidence('failed', missing);
  process.exit(1);
}

writeEvidence('passed', []);
console.log('\nFitMeet Agent token-cost verification completed.');
NODE
