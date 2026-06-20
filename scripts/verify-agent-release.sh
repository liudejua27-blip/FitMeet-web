#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_AGENT_BROWSER_QA="${RUN_AGENT_BROWSER_QA:-true}"
RUN_AGENT_OPPORTUNITY_SMOKE="${RUN_AGENT_OPPORTUNITY_SMOKE:-false}"
RUN_AGENT_SSE_ABORT_SMOKE="${RUN_AGENT_SSE_ABORT_SMOKE:-false}"

# RUN_AGENT_OPPORTUNITY_SMOKE accepts:
#   false     skip real API opportunity smoke
#   readiness run through clarification + OpportunityCard only
#   true      run the full mutating journey
#
# Even readiness mode writes chat/search smoke data. Full mode can generate
# opener drafts, confirm sends, create activities, submit reviews, and exercise
# Life Graph proposal actions. Only enable either remote mode with a dedicated
# smoke user.

# shellcheck source=scripts/lib/toolchain.sh
source "${ROOT_DIR}/scripts/lib/toolchain.sh"
fitmeet_bootstrap_toolchain
fitmeet_activate_pnpm

step() {
  printf '\n==> %s\n' "$1"
}

is_truthy() {
  case "${1:-}" in
    1|true|TRUE|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

agent_smoke_api_base_url() {
  printf '%s' "${AGENT_SMOKE_API_BASE_URL:-${FITMEET_API_BASE_URL:-${API_BASE_URL:-http://localhost:3000/api}}}"
}

agent_smoke_is_remote() {
  local api_base hostname
  api_base="$(agent_smoke_api_base_url)"
  hostname="$(node -e "const u=new URL(process.argv[1]); console.log(u.hostname)" "${api_base}")"
  case "${hostname}" in
    localhost|127.0.0.1|::1) return 1 ;;
    *) return 0 ;;
  esac
}

run_agent_smoke_preflight() {
  local mode="$1"
  step "Run Agent remote smoke safety preflight (${mode})"
  "${ROOT_DIR}/scripts/agent-remote-smoke-preflight.sh" "--${mode}" \
    --api-base-url "$(agent_smoke_api_base_url)"
}

step "Audit Agent release worktree cleanup boundaries"
"${ROOT_DIR}/scripts/agent-release-worktree-audit.sh"

step "Self-test Agent release worktree audit"
"${ROOT_DIR}/scripts/test-agent-release-worktree-audit.sh"

step "Verify FitMeet Agent skill contracts and eval cases"
node "${ROOT_DIR}/scripts/verify-agent-skills.mjs"

step "Run FitMeet Agent skill eval runner"
agent_skill_eval_args=()
if is_truthy "${RUN_AGENT_SKILL_EVAL_BACKEND:-}"; then
  agent_skill_eval_args+=(--backend)
fi
if [[ -n "${AGENT_SKILL_EVAL_REPORT_FILE:-}" ]]; then
  mkdir -p "$(dirname "${AGENT_SKILL_EVAL_REPORT_FILE}")"
  agent_skill_eval_args+=(--report "${AGENT_SKILL_EVAL_REPORT_FILE}")
fi
case "${RUN_AGENT_SKILL_EVAL_API:-false}" in
  true|readiness)
    agent_skill_eval_args+=(--api-readiness)
    ;;
  full)
    agent_skill_eval_args+=(--api-full)
    ;;
  sse-abort|sse|abort)
    agent_skill_eval_args+=(--api-sse-abort)
    ;;
  all)
    agent_skill_eval_args+=(--api-all)
    ;;
  false|'')
    ;;
  *)
    echo "[FAIL] Unsupported RUN_AGENT_SKILL_EVAL_API=${RUN_AGENT_SKILL_EVAL_API}. Use false, readiness, full, sse-abort, or all." >&2
    exit 1
    ;;
esac
if ((${#agent_skill_eval_args[@]} > 0)); then
  node "${ROOT_DIR}/scripts/run-agent-skill-evals.mjs" "${agent_skill_eval_args[@]}"
else
  node "${ROOT_DIR}/scripts/run-agent-skill-evals.mjs"
fi

step "Audit Agent assistant-ui release invariants"
pnpm --dir "${ROOT_DIR}/frontend" run check:agent-chat-release

step "Typecheck backend Agent release surface"
pnpm --dir "${ROOT_DIR}/backend" exec tsc --noEmit

step "Dry-run Agent smoke seed data"
pnpm --dir "${ROOT_DIR}/backend" run seed:agent-smoke:dry-run

step "Run backend Agent route, stream, and acceptance checks"
pnpm --dir "${ROOT_DIR}/backend" exec jest \
  src/config/production-env-readiness.spec.ts \
  src/agent-gateway/agent-control.controller.spec.ts \
  src/agent-gateway/agent-run-checkpoint.service.spec.ts \
  src/agent-gateway/social-agent-context-hydrator.service.spec.ts \
  src/agent-gateway/social-agent-context-window.spec.ts \
  src/agent-gateway/social-agent-context-window-boundary.spec.ts \
  src/agent-gateway/social-agent-event-store.service.spec.ts \
  src/agent-gateway/social-agent-event-v2.service.spec.ts \
  src/agent-gateway/social-agent-task-memory-state-machine.service.spec.ts \
  src/agent-gateway/social-agent-tasks.controller.spec.ts \
  src/agent-gateway/social-agent-thread-session-manager.service.spec.ts \
  src/agent-gateway/social-codex-life-graph-governance.service.spec.ts \
  src/agent-gateway/social-codex-trace-eval.service.spec.ts \
  src/agent-gateway/social-codex-runtime-policy.service.spec.ts \
  src/agent-gateway/agent-approval.service.spec.ts \
  src/agent-gateway/agent-approval-dispatcher.service.spec.ts \
  src/agent-gateway/user-facing-agent-response.spec.ts \
  src/agent-gateway/social-agent-approval-tool.presenter.spec.ts \
  src/agent-gateway/social-agent-candidate-action-approval.presenter.spec.ts \
  src/agent-gateway/social-agent-chat.acceptance.spec.ts \
  src/agent-gateway/social-agent-brain.service.spec.ts \
  src/agent-gateway/social-agent-intent-router.service.spec.ts \
  src/agent-gateway/social-agent-chat.controller.spec.ts \
  src/agent-gateway/social-agent-chat-llm.service.spec.ts \
  src/agent-gateway/social-agent-chat-llm-prompts.spec.ts \
  src/agent-gateway/social-agent-chat-memory.presenter.spec.ts \
  src/agent-gateway/social-agent-deepseek-resilience.spec.ts \
  src/agent-gateway/social-agent-deepseek-quality-boundary.spec.ts \
  src/agent-gateway/social-agent-fallback-source-boundary.spec.ts \
  src/agent-gateway/social-agent-final-response.service.spec.ts \
  src/agent-gateway/social-agent-planner.service.spec.ts \
  src/agent-gateway/social-agent-route-entrance.service.spec.ts \
  src/agent-gateway/social-agent-route-search-turn.service.spec.ts \
  src/agent-gateway/social-agent-model-router.service.spec.ts \
  src/agent-gateway/match-reasoner.service.spec.ts \
  src/agent-gateway/social-agent-reminder.service.spec.ts \
  src/agent-gateway/social-agent-thread-id.util.spec.ts \
  src/agent-gateway/social-agent-long-term-memory.service.spec.ts \
  src/agent-gateway/social-agent-candidate-score-breakdown.spec.ts \
  src/agent-gateway/social-agent-candidate-pool.service.spec.ts \
  src/agent-gateway/social-agent-route-branch-boundary.spec.ts \
  src/agent-gateway/fitmeet-subagent-worker-command.contract.spec.ts \
  src/agent-gateway/fitmeet-subagent-worker-dispatcher.service.spec.ts \
  src/agent-gateway/fitmeet-subagent-worker-runtime.service.spec.ts \
  src/agent-gateway/fitmeet-subagent-worker.service.spec.ts \
  src/agent-gateway/subagent-worker.cli.spec.ts \
  src/agent-gateway/subagent-worker-queue.service.spec.ts \
  src/agent-gateway/social-agent-tool-policy.spec.ts \
  src/agent-gateway/social-agent-tool-execution-policy.service.spec.ts \
  src/agent-gateway/social-agent-tool-executor.service.spec.ts \
  src/agent-gateway/social-agent-tool-json-model.service.spec.ts \
  src/agent-gateway/social-agent-tool-model.spec.ts \
  --runInBand

step "Typecheck frontend assistant-ui Agent shell"
pnpm --dir "${ROOT_DIR}/frontend" exec tsc -b

step "Run frontend assistant-ui Agent unit checks"
pnpm --dir "${ROOT_DIR}/frontend" exec vitest run \
  src/test/agentAdapter.test.ts \
  src/test/agentWorkspaceRuntime.test.ts \
  src/test/AgentPageModuleAudit.test.ts \
  src/test/AgentRouteIsolation.test.ts \
  src/test/AgentWorkspacePage.test.tsx \
  src/test/assistantUploadProgress.test.tsx \
  src/test/DiscoverClosure.test.ts \
  src/test/discoverContent.test.ts \
  src/test/fitmeetCoreContract.test.ts \
  src/test/socialAgentApiCheckpointStream.test.ts \
  src/test/socialAgentApiReplay.test.ts \
  src/test/socialCodexThreadId.test.ts \
  src/test/buildAgentAssistantProps.test.ts \
  src/test/toolFallbackRender.test.tsx \
  src/test/toolUiActionCopy.test.ts \
  src/test/toolProcessModel.test.ts \
  src/test/toolUiSchema.test.ts \
  --testTimeout=20000 \
  --reporter=default

if [ "${RUN_AGENT_BROWSER_QA}" = "true" ]; then
  step "Run browser QA for /agent/chat"
  pnpm --dir "${ROOT_DIR}/frontend" run qa:agent-chat
else
  step "Skip browser QA for /agent/chat"
fi

if [ "${RUN_AGENT_OPPORTUNITY_SMOKE}" = "readiness" ] || [ "${RUN_AGENT_OPPORTUNITY_SMOKE}" = "true" ]; then
  if [ "${RUN_AGENT_OPPORTUNITY_SMOKE}" = "readiness" ]; then
    step "Run real API smoke for Agent opportunity readiness"
    export AGENT_SMOKE_STOP_AFTER_OPPORTUNITIES=true
    run_agent_smoke_preflight readiness
  else
    step "Run real API smoke for Agent opportunity journey"
    run_agent_smoke_preflight full
  fi
  if agent_smoke_is_remote && ! is_truthy "${AGENT_SMOKE_ALLOW_MUTATIONS:-}"; then
    echo "[FAIL] RUN_AGENT_OPPORTUNITY_SMOKE=${RUN_AGENT_OPPORTUNITY_SMOKE} targets remote API $(agent_smoke_api_base_url)." >&2
    echo "[FAIL] Set AGENT_SMOKE_ALLOW_MUTATIONS=true only with a dedicated smoke account or run scripts/ecs-post-deploy-smoke.sh --prepare-agent-smoke-seed --run-agent-opportunity-smoke." >&2
    exit 1
  fi
  pnpm --dir "${ROOT_DIR}/backend" run smoke:agent-opportunity
else
  step "Skip real API smoke for Agent opportunity journey"
fi

if [ "${RUN_AGENT_SSE_ABORT_SMOKE}" = "true" ]; then
  step "Run real API smoke for Agent SSE abort"
  step "Run real API smoke for Agent SSE visibility and abort"
  run_agent_smoke_preflight sse-abort
  pnpm --dir "${ROOT_DIR}/backend" run smoke:agent-sse-abort
else
  step "Skip real API smoke for Agent SSE visibility and abort"
fi

printf '\n[DONE] Agent release verification passed\n'
