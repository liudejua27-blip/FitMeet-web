#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_AGENT_BROWSER_QA="${RUN_AGENT_BROWSER_QA:-auto}"

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

step "Audit Agent release worktree cleanup boundaries"
bash "${ROOT_DIR}/scripts/agent-release-worktree-audit.sh"

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
if ((${#agent_skill_eval_args[@]} > 0)); then
  node "${ROOT_DIR}/scripts/run-agent-skill-evals.mjs" "${agent_skill_eval_args[@]}"
else
  node "${ROOT_DIR}/scripts/run-agent-skill-evals.mjs"
fi

step "Audit frontend release invariants"
pnpm --dir "${ROOT_DIR}/frontend" run lint

step "Typecheck backend Agent release surface"
pnpm --dir "${ROOT_DIR}/backend" exec tsc --noEmit

step "Build backend Agent production bundle"
pnpm --dir "${ROOT_DIR}/backend" run build

step "Run backend Agent route, stream, and acceptance checks"
pnpm --dir "${ROOT_DIR}/backend" exec jest \
  src/config/production-env-readiness.spec.ts \
  src/common/process-role.util.spec.ts \
  src/agent-gateway/deepseek-streaming.util.spec.ts \
  src/agent-gateway/agent-control.controller.spec.ts \
  src/agent-gateway/agent-loop.service.spec.ts \
  src/agent-gateway/agent-l5-runtime.service.spec.ts \
  src/agent-gateway/agent-l5-runtime.controller.spec.ts \
  src/agent-gateway/agent-observability.service.spec.ts \
  src/agent-gateway/agent-observability-alert-sink.service.spec.ts \
  src/agent-gateway/agent-run-checkpoint.service.spec.ts \
  src/agent-gateway/agent-self-improve.service.spec.ts \
  src/agent-gateway/fitmeet-agent-runtime.service.spec.ts \
  src/agent-gateway/fitmeet-agent-tool-registry.service.spec.ts \
  src/agent-gateway/fitmeet-alpha-agent-sdk.service.spec.ts \
  src/agent-gateway/fitmeet-alpha-agent-topology.spec.ts \
  src/agent-gateway/fitmeet-alpha-structured-intent.spec.ts \
  src/agent-gateway/fitmeet-subagent-runtime.service.spec.ts \
  src/agent-gateway/social-agent-context-hydrator.service.spec.ts \
  src/agent-gateway/social-agent-context-window.spec.ts \
  src/agent-gateway/social-agent-context-window-boundary.spec.ts \
  src/agent-gateway/social-agent-event-store.service.spec.ts \
  src/agent-gateway/social-agent-event-v2.service.spec.ts \
  src/agent-gateway/social-agent-task-memory-state-machine.service.spec.ts \
  src/agent-gateway/social-agent-task-memory.service.spec.ts \
  src/agent-gateway/social-agent-task-slot-constraints.presenter.spec.ts \
  src/agent-gateway/social-agent-tasks.controller.spec.ts \
  src/agent-gateway/social-agent-thread-session-manager.service.spec.ts \
  src/agent-gateway/social-agent-session-query.service.spec.ts \
  src/agent-gateway/social-agent-session-restore.service.spec.ts \
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
  src/agent-gateway/social-agent-chat-turn-callbacks.service.spec.ts \
  src/agent-gateway/social-agent-chat-turn-facade.service.spec.ts \
  src/agent-gateway/social-agent-chat-llm.service.spec.ts \
  src/agent-gateway/social-agent-chat-llm-prompts.spec.ts \
  src/agent-gateway/social-agent-chat-brain-memory.presenter.spec.ts \
  src/agent-gateway/social-agent-chat-memory.presenter.spec.ts \
  src/agent-gateway/social-agent-chat-final-response.presenter.spec.ts \
  src/agent-gateway/social-agent-chat-session-facade.service.spec.ts \
  src/agent-gateway/social-agent-chat-session.presenter.spec.ts \
  src/agent-gateway/social-agent-deepseek-resilience.spec.ts \
  src/agent-gateway/social-agent-deepseek-quality-boundary.spec.ts \
  src/agent-gateway/social-agent-fallback-source-boundary.spec.ts \
  src/agent-gateway/social-agent-final-response.service.spec.ts \
  src/agent-gateway/social-agent-planner.service.spec.ts \
  src/agent-gateway/social-agent-brain-planner-normalization.spec.ts \
  src/agent-gateway/social-agent-intent-normalization.spec.ts \
  src/agent-gateway/social-agent-intent-memory.presenter.spec.ts \
  src/agent-gateway/social-agent-memory-context.service.spec.ts \
  src/agent-gateway/social-agent-route-context.service.spec.ts \
  src/agent-gateway/social-agent-route-decision.service.spec.ts \
  src/agent-gateway/social-agent-route-response.presenter.spec.ts \
  src/agent-gateway/social-agent-current-task-summary.presenter.spec.ts \
  src/agent-gateway/social-agent-confirmation-policy.service.spec.ts \
  src/agent-gateway/social-agent-execution-pipeline.contract.spec.ts \
  src/agent-gateway/social-agent-loop-state.spec.ts \
  src/agent-gateway/social-agent-main-agent-turn.service.spec.ts \
  src/agent-gateway/social-agent-main-agent-turn-events.service.spec.ts \
  src/agent-gateway/social-agent-route-entrance.service.spec.ts \
  src/agent-gateway/social-agent-route-search-turn.service.spec.ts \
  src/agent-gateway/social-agent-route-action-turn.service.spec.ts \
  src/agent-gateway/social-agent-route-conversation-turn.service.spec.ts \
  src/agent-gateway/social-agent-route-profile-turn.service.spec.ts \
  src/agent-gateway/social-agent-route-turn.service.spec.ts \
  src/agent-gateway/social-agent-route-turn-state.spec.ts \
  src/agent-gateway/social-agent-model-router.service.spec.ts \
  src/agent-gateway/match-reasoner.service.spec.ts \
  src/agent-gateway/social-agent-reminder.service.spec.ts \
  src/agent-gateway/social-agent-thread-id.util.spec.ts \
  src/agent-gateway/social-agent-long-term-memory.service.spec.ts \
  src/agent-gateway/social-agent-meet-loop.service.spec.ts \
  src/agent-gateway/social-agent-adhoc-action-state.spec.ts \
  src/agent-gateway/social-agent-run-completion.presenter.spec.ts \
  src/agent-gateway/social-agent-run-next-result.spec.ts \
  src/agent-gateway/social-agent-run-next-state.spec.ts \
  src/agent-gateway/social-agent-run-orchestrator.service.spec.ts \
  src/agent-gateway/social-agent-run-progress.tracker.spec.ts \
  src/agent-gateway/social-agent-run-recommendation.service.spec.ts \
  src/agent-gateway/social-agent-run-state.service.spec.ts \
  src/agent-gateway/social-agent-state-machine.spec.ts \
  src/agent-gateway/social-agent-task-execution-state.spec.ts \
  src/agent-gateway/social-agent-task-lifecycle.service.spec.ts \
  src/agent-gateway/public-social-candidate.presenter.spec.ts \
  src/agent-gateway/public-social-intent-list-query.spec.ts \
  src/agent-gateway/public-social-intent.helpers.spec.ts \
  src/agent-gateway/public-social-intent.presenter.spec.ts \
  src/agent-gateway/social-agent-profile-gate.service.spec.ts \
  src/agent-gateway/social-agent-social-intent-gate.spec.ts \
  src/agent-gateway/social-agent-workflow-router.service.spec.ts \
  src/agent-gateway/social-agent-opportunity-clarification.spec.ts \
  src/agent-gateway/social-agent-draft-publication.service.spec.ts \
  src/agent-gateway/social-agent-draft-search.service.spec.ts \
  src/agent-gateway/social-agent-activity-search.service.spec.ts \
  src/agent-gateway/social-agent-activity-tool.service.spec.ts \
  src/agent-gateway/social-agent-target-resolver.service.spec.ts \
  src/agent-gateway/social-agent-card-action-router.service.spec.ts \
  src/agent-gateway/social-agent-candidate-action.service.spec.ts \
  src/agent-gateway/social-agent-candidate-command.service.spec.ts \
  src/agent-gateway/social-agent-message-event-tool.service.spec.ts \
  src/agent-gateway/candidate-explanation.service.spec.ts \
  src/agent-gateway/social-agent-candidate-card.presenter.spec.ts \
  src/agent-gateway/social-agent-candidate-display-fields.spec.ts \
  src/agent-gateway/social-agent-candidate-dynamic-explanation.spec.ts \
  src/agent-gateway/social-agent-candidate-emotional-insight.spec.ts \
  src/agent-gateway/social-agent-candidate-identity-fields.spec.ts \
  src/agent-gateway/social-agent-candidate-life-graph-scoring.spec.ts \
  src/agent-gateway/social-agent-candidate-message-action-result.spec.ts \
  src/agent-gateway/social-agent-candidate-message-draft.presenter.spec.ts \
  src/agent-gateway/social-agent-candidate-pool-activity-result.spec.ts \
  src/agent-gateway/social-agent-candidate-pool-eligibility.spec.ts \
  src/agent-gateway/social-agent-candidate-pool-merge.spec.ts \
  src/agent-gateway/social-agent-candidate-pool-query.spec.ts \
  src/agent-gateway/social-agent-candidate-pool-result.presenter.spec.ts \
  src/agent-gateway/social-agent-candidate-profile-presenter.spec.ts \
  src/agent-gateway/social-agent-candidate-query-parser.spec.ts \
  src/agent-gateway/social-agent-candidate-reasons.spec.ts \
  src/agent-gateway/social-agent-candidate-risk.spec.ts \
  src/agent-gateway/social-agent-candidate-scoring.spec.ts \
  src/agent-gateway/social-agent-candidate-score-breakdown.spec.ts \
  src/agent-gateway/social-agent-candidate-pool.service.spec.ts \
  src/agent-gateway/social-agent-user-interest-event.service.spec.ts \
  src/agent-gateway/social-agent-route-branch-boundary.spec.ts \
  src/agent-gateway/social-agent-route-agent-loop-runner.service.spec.ts \
  src/agent-gateway/fitmeet-subagent-worker-command.contract.spec.ts \
  src/agent-gateway/fitmeet-subagent-worker-dispatcher.service.spec.ts \
  src/agent-gateway/fitmeet-subagent-worker-runtime.service.spec.ts \
  src/agent-gateway/fitmeet-subagent-worker.service.spec.ts \
  src/agent-gateway/subagent-worker.cli.spec.ts \
  src/agent-gateway/subagent-worker-queue.service.spec.ts \
  src/agent-gateway/social-agent-tool-policy.spec.ts \
  src/agent-gateway/social-agent-tool-audit.spec.ts \
  src/agent-gateway/social-agent-tool-dispatch.contract.spec.ts \
  src/agent-gateway/social-agent-tool-execution-state.spec.ts \
  src/agent-gateway/social-agent-tool-execution-policy.service.spec.ts \
  src/agent-gateway/social-agent-tool-execution-summary.spec.ts \
  src/agent-gateway/social-agent-tool-executor.service.spec.ts \
  src/agent-gateway/social-agent-tool-json-model.service.spec.ts \
  src/agent-gateway/social-agent-tool-model.spec.ts \
  src/agent-gateway/social-codex-approval-schema.service.spec.ts \
  src/agent-gateway/social-codex-event-pipeline.service.spec.ts \
  src/agent-gateway/social-codex-public-process-text.spec.ts \
  src/agent-gateway/social-codex-run-summary.spec.ts \
  src/agent-gateway/social-codex-runtime-model.spec.ts \
  --runInBand

step "Typecheck frontend assistant-ui Agent shell"
pnpm --dir "${ROOT_DIR}/frontend" exec tsc -b

step "Build frontend assistant-ui Agent production bundle"
pnpm --dir "${ROOT_DIR}/frontend" run build

step "Run frontend assistant-ui Agent unit checks"
pnpm --dir "${ROOT_DIR}/frontend" exec vitest run \
  src/test/agentAdapter.test.ts \
  src/test/agentWorkspaceRuntime.test.ts \
  src/test/AgentPageModuleAudit.test.ts \
  src/test/AgentRouteIsolation.test.ts \
  src/test/AgentWorkspacePage.test.tsx \
  src/test/assistantUploadProgress.test.tsx \
  src/test/DiscoverClosure.test.ts \
  src/test/fitmeetCoreContract.test.ts \
  src/test/UserProfileInterestSignals.test.ts \
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

case "${RUN_AGENT_BROWSER_QA}" in
  true)
    step "Run production browser QA for /agent/chat"
    pnpm --dir "${ROOT_DIR}/frontend" run qa:agent-chat:production
    ;;
  auto)
    if [[ -n "${FITMEET_AGENT_BROWSER_QA_EMAIL:-}" && -n "${FITMEET_AGENT_BROWSER_QA_PASSWORD:-}" ]]; then
      step "Run production browser QA for /agent/chat"
      pnpm --dir "${ROOT_DIR}/frontend" run qa:agent-chat:production
    else
      step "Skip browser QA for /agent/chat; set FITMEET_AGENT_BROWSER_QA_EMAIL/PASSWORD or RUN_AGENT_BROWSER_QA=true to enable"
    fi
    ;;
  false)
    step "Skip browser QA for /agent/chat"
    ;;
  *)
    printf 'RUN_AGENT_BROWSER_QA must be auto, true, or false\n' >&2
    exit 1
    ;;
esac

printf '\n[DONE] Agent release verification passed\n'
