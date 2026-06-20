#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="${1:-${ROOT_DIR}/fitmeet-ecs-deploy.zip}"
OUTPUT_DIR="$(dirname "${OUTPUT}")"
OUTPUT_NAME="$(basename "${OUTPUT}")"
CHECKSUM_OUTPUT="${OUTPUT}.sha256"
INSTALLER_OUTPUT="${OUTPUT_DIR}/fitmeet-ecs-install-release.sh"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/fitmeet-ecs-deploy.XXXXXX")"
STAGE_DIR="${TMP_DIR}/FitMeet-web"
RUN_BACKEND_DOCKER_BUILD_CHECK="${RUN_BACKEND_DOCKER_BUILD_CHECK:-true}"
RUN_AGENT_RELEASE_VERIFY="${RUN_AGENT_RELEASE_VERIFY:-true}"
RUN_AGENT_RELEASE_WORKTREE_AUDIT="${RUN_AGENT_RELEASE_WORKTREE_AUDIT:-true}"
RELEASE_COMMIT="$(git -C "${ROOT_DIR}" rev-parse --short=12 HEAD 2>/dev/null || printf 'unknown')"
RELEASE_BUILT_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
RELEASE_SOURCE="deploy_zip"

# shellcheck source=scripts/lib/toolchain.sh
source "${ROOT_DIR}/scripts/lib/toolchain.sh"
fitmeet_bootstrap_toolchain
fitmeet_activate_pnpm

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

step() {
  printf '\n==> %s\n' "$1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[FAIL] Missing required command: $1" >&2
    exit 1
  fi
}

require_path() {
  if [ ! -e "${ROOT_DIR}/$1" ]; then
    echo "[FAIL] Required deploy artifact is missing: $1" >&2
    exit 1
  fi
}

require_file_contains() {
  local file="$1"
  local pattern="$2"
  if ! grep -Fq -- "$pattern" "${ROOT_DIR}/${file}"; then
    echo "[FAIL] Required release evidence is missing from ${file}: ${pattern}" >&2
    exit 1
  fi
}

require_cmd pnpm
require_cmd rsync
require_cmd zip
if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
  echo "[FAIL] Missing required command: sha256sum or shasum" >&2
  exit 1
fi

mkdir -p "${OUTPUT_DIR}"
rm -f "${OUTPUT}"
rm -f "${CHECKSUM_OUTPUT}"
rm -f "${INSTALLER_OUTPUT}"

if [ "${RUN_AGENT_RELEASE_WORKTREE_AUDIT}" = "true" ]; then
  step "Audit release worktree is clean"
  "${ROOT_DIR}/scripts/agent-release-worktree-audit.sh" --strict
else
  step "Skip release worktree strict audit"
  echo "[WARN] RUN_AGENT_RELEASE_WORKTREE_AUDIT=${RUN_AGENT_RELEASE_WORKTREE_AUDIT}. Do not use this skip for production ECS packages." >&2
fi

step "Install frontend dependencies"
pnpm --dir "${ROOT_DIR}/frontend" install --frozen-lockfile

step "Audit Agent chat release files"
pnpm --dir "${ROOT_DIR}/frontend" run check:agent-chat-release

step "Build frontend for ECS same-origin /api"
VITE_API_BASE_URL="${VITE_API_BASE_URL:-/api}" \
VITE_WS_BASE_URL="${VITE_WS_BASE_URL:-}" \
pnpm --dir "${ROOT_DIR}/frontend" build

require_path "frontend/dist/index.html"
require_path "frontend/dist/assets"

step "Install backend dependencies"
pnpm --dir "${ROOT_DIR}/backend" install --frozen-lockfile

if [ "$RUN_AGENT_RELEASE_VERIFY" = "true" ]; then
  step "Run Agent release verification"
  "${ROOT_DIR}/scripts/verify-agent-release.sh"
else
  step "Skip Agent release verification"
fi

step "Build backend"
pnpm --dir "${ROOT_DIR}/backend" build

step "Dry-run production Agent smoke seed"
pnpm --dir "${ROOT_DIR}/backend" run seed:agent-smoke:prod:dry-run

if [ "$RUN_BACKEND_DOCKER_BUILD_CHECK" = "true" ]; then
  step "Build backend production Docker image"
  require_cmd docker
  if ! docker info >/dev/null 2>&1; then
    echo "[FAIL] Docker CLI is installed, but the Docker daemon is not reachable." >&2
    echo "[FAIL] Start Docker Desktop or run this command on an ECS host/CI runner with Docker enabled." >&2
    echo "[FAIL] To build a zip without this verification, set RUN_BACKEND_DOCKER_BUILD_CHECK=false." >&2
    exit 1
  fi
  docker build -f "${ROOT_DIR}/backend/Dockerfile.prod" "${ROOT_DIR}/backend" \
    -t fitmeet-backend-release-check:local
else
  step "Skip backend production Docker image build"
fi

require_path "backend/dist/main.js"
require_path "backend/dist/scripts/prepare-agent-smoke-seed.js"
require_path "backend/dist/scripts/smoke-agent-opportunity-journey.js"
require_path "backend/dist/scripts/smoke-agent-sse-abort.js"
require_path "backend/dist/scripts/check-production-tables.js"
require_path "backend/dist/agent-gateway/subagent-worker-healthcheck.js"
require_path "backend/Dockerfile.prod"
require_path "backend/src/scripts/prepare-agent-smoke-seed.ts"
require_path "backend/src/scripts/smoke-agent-opportunity-journey.ts"
require_path "backend/src/scripts/smoke-agent-sse-abort.ts"
require_path "docker-compose.prod.yml"
require_path "deploy/env.production.ecs.example"
require_path "deploy/agent-smoke.remote.env.example"
require_path "nginx/nginx.conf"
require_path "scripts/deploy-production.sh"
require_path "scripts/cloud-platform-preflight.sh"
require_path "scripts/domain-readiness-check.sh"
require_path "scripts/launch-status.sh"
require_path "scripts/vercel-prebuilt-deploy.sh"
require_path "scripts/lib/toolchain.sh"
require_path "scripts/ecs-install-release.sh"
require_path "scripts/ecs-release-diagnose.sh"
require_path "scripts/ecs-upload-release.sh"
require_path "scripts/ecs-workbench-install-plan.sh"
require_path "scripts/ecs-backend-pnpm.sh"
require_path "scripts/ecs-host-preflight.sh"
require_path "scripts/ecs-post-deploy-smoke.sh"
require_path "scripts/verify-agent-goal-production.sh"
require_path "scripts/verify-agent-release.sh"
require_path "scripts/verify-agent-skills.mjs"
require_path "scripts/run-agent-skill-evals.mjs"
require_path "scripts/agent-release-matrix.sh"
require_path "scripts/agent-release-worktree-audit.sh"
require_path "scripts/stage-agent-release-bucket.sh"
require_path "scripts/test-agent-release-worktree-audit.sh"
require_path "scripts/agent-remote-smoke-preflight.sh"
require_path "scripts/agent-remote-smoke-evidence.sh"
require_path "frontend/scripts/qa-agent-chat-production.mjs"
require_path "frontend/src/test/socialAgentApiReplay.test.ts"
require_path "docs/agent-release-e2e-matrix.md"
require_path "docs/social-codex-runtime.md"
require_path "docs/agent-skills/README.md"
require_path "docs/agent-skills/social-meetup-workflow.md"
require_path "docs/agent-skills/tool-contract.md"
require_path "docs/agent-skills/eval-cases.jsonl"
require_path "docs/agent-skills/tool-examples.jsonl"
require_path "docs/agent-skills/profile-onboarding.md"
require_path "docs/agent-skills/social-intent-clarifier.md"
require_path "docs/agent-skills/opportunity-card.md"
require_path "docs/agent-skills/discover-publish.md"
require_path "docs/agent-skills/candidate-search.md"
require_path "docs/agent-skills/candidate-rank.md"
require_path "docs/agent-skills/safety-approval.md"
require_path "docs/agent-skills/invitation.md"
require_path "docs/agent-skills/meet-loop.md"
require_path "docs/agent-skills/life-graph-memory.md"

require_path "backend/src/agent-gateway/social-agent-context-hydrator.service.ts"
require_path "backend/src/agent-gateway/social-agent-context-hydrator.service.spec.ts"
require_path "backend/src/agent-gateway/social-agent-context-window.ts"
require_path "backend/src/agent-gateway/social-agent-context-window.spec.ts"
require_path "backend/src/agent-gateway/social-agent-context-window-boundary.spec.ts"
require_path "backend/src/agent-gateway/social-agent-event-store.service.ts"
require_path "backend/src/agent-gateway/social-agent-event-store.service.spec.ts"
require_path "backend/src/agent-gateway/social-agent-event-v2.service.ts"
require_path "backend/src/agent-gateway/social-agent-event-v2.service.spec.ts"
require_path "backend/src/agent-gateway/social-agent-event-v2.types.ts"
require_path "backend/src/agent-gateway/social-agent-task-memory-state-machine.service.ts"
require_path "backend/src/agent-gateway/social-agent-task-memory-state-machine.service.spec.ts"
require_path "backend/src/agent-gateway/social-agent-thread-id.util.ts"
require_path "backend/src/agent-gateway/social-agent-thread-session-manager.service.ts"
require_path "backend/src/agent-gateway/social-agent-thread-session-manager.service.spec.ts"
require_path "backend/src/agent-gateway/social-codex-approval-schema.service.ts"
require_path "backend/src/agent-gateway/social-codex-approval-schema.service.spec.ts"
require_path "backend/src/agent-gateway/social-codex-event-pipeline.service.ts"
require_path "backend/src/agent-gateway/social-codex-event-pipeline.service.spec.ts"
require_path "backend/src/agent-gateway/social-codex-life-graph-governance.service.ts"
require_path "backend/src/agent-gateway/social-codex-life-graph-governance.service.spec.ts"
require_path "backend/src/agent-gateway/social-codex-runtime-policy.service.ts"
require_path "backend/src/agent-gateway/social-codex-runtime-policy.service.spec.ts"
require_path "backend/src/agent-gateway/social-codex-runtime-model.ts"
require_path "backend/src/agent-gateway/social-codex-runtime-model.spec.ts"
require_path "backend/src/agent-gateway/social-codex-trace-eval.service.ts"
require_path "backend/src/agent-gateway/social-codex-trace-eval.service.spec.ts"
require_path "backend/src/agent-gateway/agent-approval.service.spec.ts"
require_path "backend/src/agent-gateway/agent-approval-dispatcher.service.spec.ts"
require_path "backend/src/agent-gateway/user-facing-agent-response.spec.ts"
require_path "backend/src/agent-gateway/social-agent-approval-tool.presenter.spec.ts"
require_path "backend/src/agent-gateway/social-agent-candidate-action-approval.presenter.spec.ts"
require_path "backend/src/agent-gateway/social-agent-candidate-score-breakdown-rules.ts"
require_path "backend/src/agent-gateway/social-agent-brain.service.spec.ts"
require_path "backend/src/agent-gateway/social-agent-intent-router.service.spec.ts"
require_path "backend/src/agent-gateway/social-agent-chat-llm.service.spec.ts"
require_path "backend/src/agent-gateway/social-agent-chat-llm-prompts.spec.ts"
require_path "backend/src/agent-gateway/social-agent-chat-memory.presenter.spec.ts"
require_path "backend/src/agent-gateway/social-agent-deepseek-resilience.spec.ts"
require_path "backend/src/agent-gateway/social-agent-deepseek-quality-boundary.spec.ts"
require_path "backend/src/agent-gateway/social-agent-final-response.service.spec.ts"
require_path "backend/src/agent-gateway/social-agent-model-router.service.spec.ts"
require_path "backend/src/agent-gateway/social-agent-planner.service.spec.ts"
require_path "backend/src/agent-gateway/match-reasoner.service.spec.ts"
require_path "backend/src/agent-gateway/social-agent-route-branch-boundary.spec.ts"
require_path "backend/src/agent-gateway/social-agent-fallback-source-boundary.spec.ts"
require_path "backend/src/agent-gateway/fitmeet-subagent-worker-command.contract.spec.ts"
require_path "backend/src/agent-gateway/fitmeet-subagent-worker-dispatcher.service.spec.ts"
require_path "backend/src/agent-gateway/fitmeet-subagent-worker-runtime.service.spec.ts"
require_path "backend/src/agent-gateway/fitmeet-subagent-worker.service.spec.ts"
require_path "backend/src/agent-gateway/subagent-worker.cli.spec.ts"
require_path "backend/src/agent-gateway/subagent-worker-queue.service.spec.ts"

require_path "frontend/src/components/agent-workspace/FitMeetAssistantUI.tsx"
require_path "frontend/src/components/agent-workspace/FitMeetAssistantUI.types.ts"
require_path "frontend/src/components/agent-workspace/agentWorkspaceRuntime.ts"
require_path "frontend/src/components/agent-workspace/agentReminderRouteState.ts"
require_path "frontend/src/components/agent-workspace/api/realAgentAdapter.ts"
require_path "frontend/src/components/agent-workspace/fitMeetAttachmentAdapter.ts"
require_path "frontend/src/components/agent-workspace/useAgentAdapterRuntime.ts"
require_path "frontend/src/components/agent-workspace/socialAgentThreadStore.ts"
require_path "frontend/src/components/agent-workspace/socialCodexThreadId.ts"
require_path "frontend/src/components/agent-workspace/useAgentApprovalDispatchMessages.ts"
require_path "frontend/src/components/agent-workspace/useAgentApprovalRuntime.ts"
require_path "frontend/src/components/agent-workspace/useAgentCardActionRuntime.ts"
require_path "frontend/src/components/agent-workspace/useAgentCheckpointRuntime.ts"
require_path "frontend/src/components/agent-workspace/useAgentFeedbackRuntime.ts"
require_path "frontend/src/components/agent-workspace/useAgentFinalResultRuntime.ts"
require_path "frontend/src/components/agent-workspace/useAgentMessageStream.ts"
require_path "frontend/src/components/agent-workspace/useAgentReminderRuntime.ts"
require_path "frontend/src/components/agent-workspace/useAgentRuntimeActions.ts"
require_path "frontend/src/components/agent-workspace/useAgentSessionRestore.ts"
require_path "frontend/src/components/agent-workspace/useAgentStreamingRun.ts"
require_path "frontend/src/components/agent-workspace/useAgentStreamEventHandler.ts"
require_path "frontend/src/components/agent-workspace/useAgentSubmitRuntime.ts"
require_path "frontend/src/components/agent-workspace/useAgentThreadBranches.ts"
require_path "frontend/src/components/agent-workspace/useAgentThreadRuntime.ts"
require_path "frontend/src/components/agent-workspace/useAgentWorkspaceRoute.ts"
require_path "frontend/src/components/assistant-ui/action-bar.tsx"
require_path "frontend/src/components/assistant-ui/assistant-shell.tsx"
require_path "frontend/src/components/assistant-ui/attachment.tsx"
require_path "frontend/src/components/assistant-ui/branch-picker.tsx"
require_path "frontend/src/components/assistant-ui/composer-action-mode.ts"
require_path "frontend/src/components/assistant-ui/composer.tsx"
require_path "frontend/src/components/assistant-ui/markdown-text.tsx"
require_path "frontend/src/components/assistant-ui/message-runtime-context.tsx"
require_path "frontend/src/components/assistant-ui/message.tsx"
require_path "frontend/src/components/assistant-ui/public-process-text.ts"
require_path "frontend/src/components/assistant-ui/thinking-dots.tsx"
require_path "frontend/src/components/assistant-ui/thread-list.tsx"
require_path "frontend/src/components/assistant-ui/thread.tsx"
require_path "frontend/src/components/assistant-ui/tool-card-actions.tsx"
require_path "frontend/src/components/assistant-ui/tool-card-collection.tsx"
require_path "frontend/src/components/assistant-ui/tool-card-shared.tsx"
require_path "frontend/src/components/assistant-ui/tool-process-model.ts"
require_path "frontend/src/components/assistant-ui/tool-fallback.tsx"
require_path "frontend/src/components/assistant-ui/tool-generic-card.tsx"
require_path "frontend/src/components/assistant-ui/tool-ui-action-copy.ts"
require_path "frontend/src/components/assistant-ui/tool-ui-actions.tsx"
require_path "frontend/src/components/assistant-ui/tool-ui-schema.ts"
require_path "frontend/src/components/assistant-ui/tooltip-icon-button.tsx"
require_path "frontend/src/components/assistant-ui/upload-progress-store.ts"
require_path "frontend/src/lib/socialCodexProcessCopy.ts"
require_path "frontend/src/test/AgentWorkspacePage.test.tsx"
require_path "frontend/src/test/agentAdapter.test.ts"
require_path "frontend/src/test/agentWorkspaceRuntime.test.ts"
require_path "frontend/src/test/toolProcessModel.test.ts"
require_path "frontend/src/test/toolUiActionCopy.test.ts"

require_file_contains "frontend/src/components/agent-workspace/FitMeetAssistantUI.tsx" "compactAssistantProcessSteps"
require_file_contains "frontend/src/components/agent-workspace/FitMeetAssistantUI.tsx" "isRunSummaryFitMeetStep"
require_file_contains "frontend/src/components/agent-workspace/FitMeetAssistantUI.tsx" "visibleSummaryFromProcessStep"
require_file_contains "frontend/src/components/agent-workspace/useAgentSessionRestore.ts" "progressEventFromReplaySummary"
require_file_contains "frontend/src/components/agent-workspace/useAgentSessionRestore.ts" "source: 'replay.summary'"
require_file_contains "frontend/src/components/agent-workspace/agentWorkspaceRuntime.ts" "processType === 'run_summary'"
require_file_contains "frontend/src/components/assistant-ui/tool-fallback.tsx" "data-process-rendering=\"covering-status\""
require_file_contains "frontend/src/components/assistant-ui/tool-fallback.tsx" "data-process-mainline=\"latest-visible-summary\""
require_file_contains "frontend/src/components/assistant-ui/tool-fallback.tsx" "data-process-default-visible-count=\"1\""
require_file_contains "frontend/src/components/assistant-ui/tool-process-model.ts" "source === 'replay.summary'"
require_file_contains "frontend/src/test/AgentWorkspacePage.test.tsx" "restores replay.summary even when replay events are trimmed"
require_file_contains "frontend/src/test/AgentWorkspacePage.test.tsx" "data-process-summary-source', 'replay.summary'"
require_file_contains "frontend/src/test/agentWorkspaceRuntime.test.ts" "lets replay.summary replace old process nodes instead of accumulating a timeline"
require_file_contains "frontend/src/test/toolProcessModel.test.ts" "older payloads omit displayMode"

require_file_contains "docs/agent-release-e2e-matrix.md" "FitMeet Agent Release E2E Matrix"
require_file_contains "docs/agent-release-e2e-matrix.md" "scripts/agent-release-matrix.sh"
require_file_contains "docs/agent-release-e2e-matrix.md" "scripts/agent-release-worktree-audit.sh"
require_file_contains "docs/agent-release-e2e-matrix.md" "Remote smoke safety preflight"
require_file_contains "docs/agent-release-e2e-matrix.md" "Remote smoke env template"
require_file_contains "docs/agent-release-e2e-matrix.md" "deploy/agent-smoke.remote.env.example"
require_file_contains "docs/agent-release-e2e-matrix.md" "scripts/agent-remote-smoke-preflight.sh --readiness"
require_file_contains "docs/agent-release-e2e-matrix.md" "Remote smoke evidence capture"
require_file_contains "docs/agent-release-e2e-matrix.md" "Production browser QA"
require_file_contains "docs/agent-release-e2e-matrix.md" "scripts/agent-remote-smoke-evidence.sh --all --prepare-agent-smoke-seed"
require_file_contains "docs/agent-release-e2e-matrix.md" "pnpm --dir frontend run qa:agent-chat:production"
require_file_contains "docs/agent-release-e2e-matrix.md" "Final Agent cutover status"
require_file_contains "docs/agent-release-e2e-matrix.md" "REQUIRE_AGENT_REMOTE_SMOKE_EVIDENCE=true"
require_file_contains "docs/agent-release-e2e-matrix.md" "Opportunity readiness smoke"
require_file_contains "docs/agent-release-e2e-matrix.md" "Full opportunity smoke"
require_file_contains "docs/agent-release-e2e-matrix.md" "Opportunity smoke report"
require_file_contains "docs/agent-skills/README.md" "AGENT_SMOKE_REPORT_FILE"
require_file_contains "docs/agent-release-e2e-matrix.md" "Ordinary chat does not trigger social UI"
require_file_contains "docs/agent-release-e2e-matrix.md" "Life Graph remains proposal-based"
require_file_contains "scripts/agent-release-matrix.sh" "--opportunity-readiness-smoke"
require_file_contains "scripts/agent-release-matrix.sh" "--opportunity-full-smoke"
require_file_contains "scripts/agent-release-matrix.sh" "scripts/agent-release-worktree-audit.sh"
require_file_contains "scripts/agent-release-matrix.sh" "scripts/verify-agent-release.sh"
require_file_contains "scripts/verify-agent-release.sh" "scripts/verify-agent-skills.mjs"
require_file_contains "scripts/verify-agent-release.sh" "scripts/run-agent-skill-evals.mjs"
require_file_contains "scripts/run-agent-skill-evals.mjs" "twenty_turn_memory_no_repeat_questions"
require_file_contains "scripts/run-agent-skill-evals.mjs" "candidate_empty_safe_fallback"
require_file_contains "scripts/run-agent-skill-evals.mjs" "correction_updates_candidate_preference_without_reasking_core_slots"
require_file_contains "scripts/verify-agent-skills.mjs" "profile_onboarding_skill"
require_file_contains "docs/agent-skills/social-meetup-workflow.md" "must not block normal conversation"
require_file_contains "docs/agent-skills/social-meetup-workflow.md" "must not invent people"
require_file_contains "docs/agent-skills/eval-cases.jsonl" "twenty_turn_memory_no_repeat_questions"
require_file_contains "docs/agent-skills/eval-cases.jsonl" "candidate_empty_safe_fallback"
require_file_contains "docs/agent-skills/eval-cases.jsonl" "correction_updates_candidate_preference_without_reasking_core_slots"
require_file_contains "scripts/agent-remote-smoke-preflight.sh" "--readiness"
require_file_contains "scripts/agent-remote-smoke-preflight.sh" "--full"
require_file_contains "scripts/agent-remote-smoke-preflight.sh" "--sse-abort"
require_file_contains "scripts/agent-remote-smoke-preflight.sh" "AGENT_SMOKE_ALLOW_REMOTE"
require_file_contains "scripts/agent-remote-smoke-preflight.sh" "AGENT_SMOKE_ALLOW_MUTATIONS"
require_file_contains "scripts/agent-remote-smoke-preflight.sh" "AGENT_SMOKE_ALLOW_JWT_MUTATIONS"
require_file_contains "scripts/agent-remote-smoke-preflight.sh" "looks_like_smoke_account"
require_file_contains "scripts/agent-remote-smoke-preflight.sh" "looks_like_placeholder_secret"
require_file_contains "scripts/agent-remote-smoke-preflight.sh" "AGENT_SMOKE_PASSWORD still looks like a placeholder"
require_file_contains "scripts/agent-remote-smoke-evidence.sh" "FitMeet Agent Remote Smoke Evidence"
require_file_contains "scripts/agent-remote-smoke-evidence.sh" "--all"
require_file_contains "scripts/agent-remote-smoke-evidence.sh" "--20-turn-memory"
require_file_contains "scripts/agent-remote-smoke-evidence.sh" "--empty-candidate"
require_file_contains "scripts/agent-remote-smoke-evidence.sh" "run_post_deploy_smoke 20-turn-memory"
require_file_contains "scripts/agent-remote-smoke-evidence.sh" "run_post_deploy_smoke empty-candidate"
require_file_contains "scripts/agent-remote-smoke-evidence.sh" "scripts/ecs-post-deploy-smoke.sh"
require_file_contains "scripts/agent-remote-smoke-evidence.sh" "prepare_agent_smoke_seed_once"
require_file_contains "scripts/agent-remote-smoke-evidence.sh" "export AGENT_SMOKE_ALLOW_MUTATIONS=true"
require_file_contains "scripts/agent-remote-smoke-evidence.sh" "redact()"
require_file_contains "scripts/agent-remote-smoke-evidence.sh" "[redacted-email]"
require_file_contains "frontend/scripts/qa-agent-chat-production.mjs" "FitMeet Agent Production Browser QA"
require_file_contains "frontend/scripts/qa-agent-chat-production.mjs" "FITMEET_AGENT_BROWSER_QA_ALLOW_REMOTE"
require_file_contains "frontend/scripts/qa-agent-chat-production.mjs" "EXPECTED_RELEASE_COMMIT"
require_file_contains "frontend/scripts/qa-agent-chat-production.mjs" "ecs-release-diagnose.sh"
require_file_contains "frontend/scripts/qa-agent-chat-production.mjs" "release.commit"
require_file_contains "frontend/scripts/qa-agent-chat-production.mjs" "ordinary chat unexpectedly rendered social UI"
require_file_contains "frontend/scripts/qa-agent-chat-production.mjs" "assertAgentSessionApi"
require_file_contains "frontend/scripts/qa-agent-chat-production.mjs" "task_conversation_unbound"
require_file_contains "frontend/scripts/qa-agent-chat-production.mjs" "ordinary chat thread title was socialized"
require_file_contains "frontend/scripts/qa-agent-chat-production.mjs" "social intent did not clarify or render opportunities"
require_file_contains "frontend/scripts/qa-agent-chat-production.mjs" "[redacted-email]"
require_file_contains "scripts/verify-production.sh" "Authenticated Social Agent session restored a task_conversation_unbound legacy task"
require_file_contains "scripts/verify-production.sh" "Authenticated Social Agent session restored failed activeTaskId"
require_file_contains "scripts/verify-agent-goal-production.sh" "Discover page still contains fake 128-person production copy"
require_file_contains "scripts/verify-agent-goal-production.sh" "/public/social-intents returned 0 discoverable items"
require_file_contains "scripts/verify-agent-goal-production.sh" "qa:agent-chat:production"
require_file_contains "scripts/launch-status.sh" "VALIDATE_AGENT_REMOTE_SMOKE_EVIDENCE_ONLY"
require_file_contains "scripts/launch-status.sh" "--validate-agent-remote-smoke-evidence-only"
require_file_contains "scripts/launch-status.sh" "secret_assignment_pattern"
require_file_contains "scripts/launch-status.sh" "redacted_assignment_pattern"
require_file_contains "scripts/launch-status.sh" "redacted_bearer_pattern"
require_file_contains "scripts/launch-status.sh" "unredacted bearer token"
require_file_contains "scripts/launch-status.sh" "unredacted email address"
require_file_contains "scripts/launch-status.sh" "Social Codex trace eval passed"
require_file_contains "scripts/launch-status.sh" "ECS post-deploy Agent 20-turn-memory smoke"
require_file_contains "scripts/launch-status.sh" "ECS post-deploy Agent empty-candidate smoke"
require_file_contains "scripts/launch-status.sh" "readiness, 20-turn memory, empty-candidate, and full opportunity smoke"
require_file_contains "deploy/agent-smoke.remote.env.example" "FitMeet Agent remote smoke environment template"
require_file_contains "deploy/agent-smoke.remote.env.example" "Never use a real user account for mutating Agent smoke"
require_file_contains "deploy/agent-smoke.remote.env.example" "AGENT_SMOKE_ALLOW_REMOTE=true"
require_file_contains "deploy/agent-smoke.remote.env.example" "AGENT_SMOKE_ALLOW_MUTATIONS=true"
require_file_contains "deploy/agent-smoke.remote.env.example" "AGENT_SMOKE_STOP_AFTER_OPPORTUNITIES=true"
require_file_contains "deploy/agent-smoke.remote.env.example" "AGENT_SMOKE_RUN_20_TURN_MEMORY=false"
require_file_contains "deploy/agent-smoke.remote.env.example" "AGENT_SMOKE_RUN_EMPTY_CANDIDATE_FALLBACK=false"
require_file_contains "docs/deployment-aliyun-ecs.md" "preflight rejects"
require_file_contains "docs/deployment-aliyun-ecs.md" "replace-with-dedicated-smoke-password"
require_file_contains "backend/src/scripts/smoke-agent-opportunity-journey.ts" "AGENT_SMOKE_STOP_AFTER_OPPORTUNITIES"
require_file_contains "backend/src/scripts/smoke-agent-opportunity-journey.ts" "readiness-only smoke stopped before high-risk card actions"
require_file_contains "backend/src/scripts/smoke-agent-opportunity-journey.ts" "search-critical context without over-asking stranger/public policy"
require_file_contains "backend/src/scripts/smoke-agent-opportunity-journey.ts" "assertNoPendingApproval('clarified search', clarified)"
require_file_contains "backend/src/scripts/smoke-agent-opportunity-journey.ts" "candidate preference correction preserves time/place/activity"
require_file_contains "backend/src/scripts/smoke-agent-opportunity-journey.ts" "AGENT_SMOKE_SKIP_CORRECTION_MEMORY"
require_file_contains "backend/src/scripts/smoke-agent-opportunity-journey.ts" "AGENT_SMOKE_RUN_20_TURN_MEMORY"
require_file_contains "backend/src/scripts/smoke-agent-opportunity-journey.ts" "20-turn social task memory preserves task continuity"
require_file_contains "backend/src/scripts/smoke-agent-opportunity-journey.ts" "AGENT_SMOKE_RUN_EMPTY_CANDIDATE_FALLBACK"
require_file_contains "backend/src/scripts/smoke-agent-opportunity-journey.ts" "CandidateEmptyStateCard instead of fake candidates"
require_file_contains "scripts/verify-agent-release.sh" "RUN_AGENT_OPPORTUNITY_SMOKE accepts"
require_file_contains "scripts/verify-agent-release.sh" "AGENT_SMOKE_STOP_AFTER_OPPORTUNITIES=true"
require_file_contains "scripts/verify-agent-release.sh" "RUN_AGENT_20_TURN_MEMORY_SMOKE=true"
require_file_contains "scripts/verify-agent-release.sh" "--api-20-turn-memory"
require_file_contains "scripts/verify-agent-release.sh" "RUN_AGENT_EMPTY_CANDIDATE_SMOKE=true"
require_file_contains "scripts/verify-agent-release.sh" "--api-empty-candidate"
require_file_contains "scripts/verify-agent-release.sh" "run_agent_smoke_preflight"
require_file_contains "scripts/verify-agent-release.sh" "scripts/agent-remote-smoke-preflight.sh"
require_file_contains "scripts/verify-agent-release.sh" "social-agent-context-hydrator.service.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-agent-context-window.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-agent-context-window-boundary.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-agent-event-store.service.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-agent-event-v2.service.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-agent-task-memory-state-machine.service.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-agent-thread-session-manager.service.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-codex-life-graph-governance.service.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-codex-trace-eval.service.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-codex-runtime-policy.service.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "agent-approval.service.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "agent-approval-dispatcher.service.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "user-facing-agent-response.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-agent-approval-tool.presenter.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-agent-candidate-action-approval.presenter.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-agent-candidate-score-breakdown.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-agent-brain.service.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-agent-intent-router.service.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-agent-chat-llm.service.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-agent-chat-llm-prompts.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-agent-chat-memory.presenter.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-agent-deepseek-resilience.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-agent-deepseek-quality-boundary.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-agent-final-response.service.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-agent-model-router.service.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-agent-planner.service.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "match-reasoner.service.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-agent-route-branch-boundary.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-agent-fallback-source-boundary.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "fitmeet-subagent-worker-command.contract.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "fitmeet-subagent-worker-dispatcher.service.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "fitmeet-subagent-worker-runtime.service.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "fitmeet-subagent-worker.service.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "subagent-worker.cli.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "subagent-worker-queue.service.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-agent-tool-execution-policy.service.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-agent-tool-executor.service.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-agent-tool-json-model.service.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "social-agent-tool-model.spec.ts"
require_file_contains "scripts/verify-agent-release.sh" "agentAdapter.test.ts"
require_file_contains "scripts/verify-agent-release.sh" "agentWorkspaceRuntime.test.ts"
require_file_contains "scripts/verify-agent-release.sh" "AgentWorkspacePage.test.tsx"
require_file_contains "scripts/verify-agent-release.sh" "socialAgentApiReplay.test.ts"
require_file_contains "scripts/verify-agent-release.sh" "toolProcessModel.test.ts"
require_file_contains "scripts/run-agent-skill-evals.mjs" "--api-20-turn-memory"
require_file_contains "scripts/run-agent-skill-evals.mjs" "AGENT_SMOKE_RUN_20_TURN_MEMORY"
require_file_contains "scripts/run-agent-skill-evals.mjs" "--api-empty-candidate"
require_file_contains "scripts/run-agent-skill-evals.mjs" "AGENT_SMOKE_RUN_EMPTY_CANDIDATE_FALLBACK"
require_file_contains "scripts/agent-release-matrix.sh" "--20-turn-memory-smoke"
require_file_contains "scripts/ecs-post-deploy-smoke.sh" "--run-agent-opportunity-readiness-smoke"
require_file_contains "scripts/ecs-post-deploy-smoke.sh" "--run-agent-20-turn-memory-smoke"
require_file_contains "scripts/ecs-post-deploy-smoke.sh" "--run-agent-empty-candidate-smoke"
require_file_contains "scripts/ecs-post-deploy-smoke.sh" "RUN_AGENT_OPPORTUNITY_SMOKE=readiness"
require_file_contains "scripts/ecs-post-deploy-smoke.sh" "AGENT_SMOKE_RUN_20_TURN_MEMORY=true"
require_file_contains "scripts/ecs-post-deploy-smoke.sh" "AGENT_SMOKE_RUN_EMPTY_CANDIDATE_FALLBACK=true"
require_file_contains "scripts/ecs-post-deploy-smoke.sh" "run_agent_remote_preflight"
require_file_contains "scripts/ecs-post-deploy-smoke.sh" "scripts/agent-remote-smoke-preflight.sh"
require_file_contains "scripts/ecs-post-deploy-smoke.sh" "AGENT_SMOKE_STOP_AFTER_OPPORTUNITIES="
require_file_contains "scripts/ecs-post-deploy-smoke.sh" "Running real Agent opportunity readiness smoke"
require_path "docs/deployment-vercel-railway.md"

step "Stage sanitized deploy tree"
mkdir -p "${STAGE_DIR}"
rsync -a "${ROOT_DIR}/" "${STAGE_DIR}/" \
  --exclude '.git/' \
  --exclude '.DS_Store' \
  --exclude '*/.DS_Store' \
  --exclude '.github/' \
  --exclude '.deploy-staging/' \
  --exclude '.vercel/' \
  --exclude '*/.vercel/' \
  --exclude '.railway/' \
  --exclude '*/.railway/' \
  --exclude '.vscode/' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '*/.env' \
  --exclude '*/.env.*' \
  --exclude 'deploy/agent-smoke.remote.env' \
  --exclude 'node_modules/' \
  --exclude '*/node_modules/' \
  --exclude 'package-lock.json' \
  --exclude 'fitmeet*.zip' \
  --exclude '*.log' \
  --exclude 'logs/' \
  --exclude '*/logs/' \
  --exclude 'coverage/' \
  --exclude '*/coverage/' \
  --exclude 'playwright-report/' \
  --exclude '*/playwright-report/' \
  --exclude 'test-results/' \
  --exclude '*/test-results/' \
  --exclude 'ui-verify-out/' \
  --exclude '*/ui-verify-out/' \
  --exclude 'docs/qa/' \
  --exclude 'frontend/qa/' \
  --exclude 'qa-gsap-round2/' \
  --exclude 'agent-gsap-qa.png' \
  --exclude 'agent-reference-qa.png' \
  --exclude 'homepage-gsap-qa.png' \
  --exclude 'frontend/src/components/agent-workspace/CodexAntPet.tsx' \
  --exclude 'frontend/src/components/agent/AgentConnectionCard.tsx' \
  --exclude 'frontend/src/components/agent-workspace/api/mockAgentAdapter.ts' \
  --exclude 'frontend/src/dev/' \
  --exclude 'frontend/src/dev/agent/mockAgentAdapter.ts' \
  --exclude 'frontend/src/components/ai-elements/' \
  --exclude 'frontend/src/debug/' \
  --exclude 'frontend/src/debug/SocialAgentConsolePage.tsx' \
  --exclude 'frontend/src/debug/agent-workbench' \
  --exclude 'frontend/src/debug/agentTaskEvents.ts' \
  --exclude 'frontend/src/debug/agentPageModuleAudit.ts' \
  --exclude 'frontend/src/pages/DemoAgentSocialLoopPage.tsx' \
  --exclude 'frontend/src/pages/DemoInvestorPage.tsx' \
  --exclude 'frontend/src/types/agent.ts' \
  --exclude 'frontend/src/components/agent-workspace/useAgentFlow.ts' \
  --exclude 'frontend/src/styles/agent-workspace.css' \
  --exclude 'frontend/src/styles/agent-gpt-copy-shell.css' \
  --exclude 'frontend/src/styles/fitmeet-assistant-ui.css' \
  --exclude 'scripts/fix-aimatch.mjs' \
  --exclude 'scripts/fix-aimatch.ps1' \
  --exclude 'scripts/fix-loginmodal*.mjs' \
  --exclude 'scripts/fix-meetmodal.mjs' \
  --exclude 'scripts/fix-postmodal.mjs' \
  --exclude 'nginx/ssl/' \
  --exclude 'backend/public/uploads/' \
  --exclude 'frontend/output/' \
  --exclude 'artifacts/' \
  --exclude 'chrome-headless-profile*/' \
  --exclude 'chrome-dom-output.txt' \
  --exclude 'chrome-test.txt'

cat >"${STAGE_DIR}/release.json" <<JSON
{
  "commit": "${RELEASE_COMMIT}",
  "builtAt": "${RELEASE_BUILT_AT}",
  "source": "${RELEASE_SOURCE}"
}
JSON

step "Create zip"
(
  cd "${TMP_DIR}"
  zip -qr "${OUTPUT}" "FitMeet-web"
)

step "Scan deploy zip"
entries=()
while IFS= read -r entry; do
  entries+=("${entry}")
done < <(zipinfo -1 "${OUTPUT}")

contains_entry() {
  local pattern="$1"
  local entry
  for entry in "${entries[@]}"; do
    if [[ "${entry}" =~ ${pattern} ]]; then
      return 0
    fi
  done
  return 1
}

fail_if_entry() {
  local label="$1"
  local pattern="$2"
  if contains_entry "$pattern"; then
    echo "[FAIL] Deploy zip contains forbidden ${label}" >&2
    exit 1
  fi
}

require_entry() {
  local label="$1"
  local pattern="$2"
  if ! contains_entry "$pattern"; then
    echo "[FAIL] Missing ${label}" >&2
    exit 1
  fi
}

require_entry "frontend/dist/index.html" '^FitMeet-web/frontend/dist/index\.html$'
require_entry "frontend/dist/assets" '^FitMeet-web/frontend/dist/assets/'
require_entry "backend/Dockerfile.prod" '^FitMeet-web/backend/Dockerfile\.prod$'
require_entry "backend/src/scripts/prepare-agent-smoke-seed.ts" '^FitMeet-web/backend/src/scripts/prepare-agent-smoke-seed\.ts$'
require_entry "backend/dist/scripts/prepare-agent-smoke-seed.js" '^FitMeet-web/backend/dist/scripts/prepare-agent-smoke-seed\.js$'
require_entry "backend/src/scripts/smoke-agent-opportunity-journey.ts" '^FitMeet-web/backend/src/scripts/smoke-agent-opportunity-journey\.ts$'
require_entry "backend/dist/scripts/smoke-agent-opportunity-journey.js" '^FitMeet-web/backend/dist/scripts/smoke-agent-opportunity-journey\.js$'
require_entry "backend/src/scripts/smoke-agent-sse-abort.ts" '^FitMeet-web/backend/src/scripts/smoke-agent-sse-abort\.ts$'
require_entry "backend/dist/scripts/smoke-agent-sse-abort.js" '^FitMeet-web/backend/dist/scripts/smoke-agent-sse-abort\.js$'
require_entry "backend/dist/agent-gateway/subagent-worker-healthcheck.js" '^FitMeet-web/backend/dist/agent-gateway/subagent-worker-healthcheck\.js$'
require_entry "docker-compose.prod.yml" '^FitMeet-web/docker-compose\.prod\.yml$'
require_entry "deploy/env.production.ecs.example" '^FitMeet-web/deploy/env\.production\.ecs\.example$'
require_entry "deploy/agent-smoke.remote.env.example" '^FitMeet-web/deploy/agent-smoke\.remote\.env\.example$'
require_entry "nginx/nginx.conf" '^FitMeet-web/nginx/nginx\.conf$'
require_entry "scripts/ecs-host-preflight.sh" '^FitMeet-web/scripts/ecs-host-preflight\.sh$'
require_entry "scripts/ecs-install-release.sh" '^FitMeet-web/scripts/ecs-install-release\.sh$'
require_entry "scripts/ecs-upload-release.sh" '^FitMeet-web/scripts/ecs-upload-release\.sh$'
require_entry "scripts/ecs-workbench-install-plan.sh" '^FitMeet-web/scripts/ecs-workbench-install-plan\.sh$'
require_entry "scripts/ecs-post-deploy-smoke.sh" '^FitMeet-web/scripts/ecs-post-deploy-smoke\.sh$'
require_entry "scripts/verify-agent-goal-production.sh" '^FitMeet-web/scripts/verify-agent-goal-production\.sh$'
require_entry "scripts/verify-agent-release.sh" '^FitMeet-web/scripts/verify-agent-release\.sh$'
require_entry "scripts/verify-agent-skills.mjs" '^FitMeet-web/scripts/verify-agent-skills\.mjs$'
require_entry "scripts/run-agent-skill-evals.mjs" '^FitMeet-web/scripts/run-agent-skill-evals\.mjs$'
require_entry "scripts/agent-release-matrix.sh" '^FitMeet-web/scripts/agent-release-matrix\.sh$'
require_entry "scripts/agent-release-worktree-audit.sh" '^FitMeet-web/scripts/agent-release-worktree-audit\.sh$'
require_entry "scripts/agent-remote-smoke-preflight.sh" '^FitMeet-web/scripts/agent-remote-smoke-preflight\.sh$'
require_entry "scripts/agent-remote-smoke-evidence.sh" '^FitMeet-web/scripts/agent-remote-smoke-evidence\.sh$'
require_entry "scripts/cloud-platform-preflight.sh" '^FitMeet-web/scripts/cloud-platform-preflight\.sh$'
require_entry "scripts/domain-readiness-check.sh" '^FitMeet-web/scripts/domain-readiness-check\.sh$'
require_entry "scripts/launch-status.sh" '^FitMeet-web/scripts/launch-status\.sh$'
require_entry "scripts/vercel-prebuilt-deploy.sh" '^FitMeet-web/scripts/vercel-prebuilt-deploy\.sh$'
require_entry "scripts/lib/toolchain.sh" '^FitMeet-web/scripts/lib/toolchain\.sh$'
require_entry "docs/agent-release-e2e-matrix.md" '^FitMeet-web/docs/agent-release-e2e-matrix\.md$'
require_entry "Social Codex runtime docs" '^FitMeet-web/docs/social-codex-runtime\.md$'
require_entry "Agent skills README" '^FitMeet-web/docs/agent-skills/README\.md$'
require_entry "Agent social meetup workflow skill" '^FitMeet-web/docs/agent-skills/social-meetup-workflow\.md$'
require_entry "Agent skill tool contract" '^FitMeet-web/docs/agent-skills/tool-contract\.md$'
require_entry "Agent skill eval cases" '^FitMeet-web/docs/agent-skills/eval-cases\.jsonl$'
require_entry "Agent skill tool examples" '^FitMeet-web/docs/agent-skills/tool-examples\.jsonl$'
require_entry "Agent profile onboarding skill" '^FitMeet-web/docs/agent-skills/profile-onboarding\.md$'
require_entry "Agent social intent clarifier skill" '^FitMeet-web/docs/agent-skills/social-intent-clarifier\.md$'
require_entry "Agent opportunity card skill" '^FitMeet-web/docs/agent-skills/opportunity-card\.md$'
require_entry "Agent discover publish skill" '^FitMeet-web/docs/agent-skills/discover-publish\.md$'
require_entry "Agent candidate search skill" '^FitMeet-web/docs/agent-skills/candidate-search\.md$'
require_entry "Agent candidate rank skill" '^FitMeet-web/docs/agent-skills/candidate-rank\.md$'
require_entry "Agent safety approval skill" '^FitMeet-web/docs/agent-skills/safety-approval\.md$'
require_entry "Agent invitation skill" '^FitMeet-web/docs/agent-skills/invitation\.md$'
require_entry "Agent meet loop skill" '^FitMeet-web/docs/agent-skills/meet-loop\.md$'
require_entry "Agent Life Graph memory skill" '^FitMeet-web/docs/agent-skills/life-graph-memory\.md$'
require_entry "docs/deployment-vercel-railway.md" '^FitMeet-web/docs/deployment-vercel-railway\.md$'
require_entry "release metadata" '^FitMeet-web/release\.json$'

require_entry "Social Codex context hydrator" '^FitMeet-web/backend/src/agent-gateway/social-agent-context-hydrator\.service\.ts$'
require_entry "Social Codex context hydrator spec" '^FitMeet-web/backend/src/agent-gateway/social-agent-context-hydrator\.service\.spec\.ts$'
require_entry "Social Codex context window helper" '^FitMeet-web/backend/src/agent-gateway/social-agent-context-window\.ts$'
require_entry "Social Codex context window spec" '^FitMeet-web/backend/src/agent-gateway/social-agent-context-window\.spec\.ts$'
require_entry "Social Codex context window boundary spec" '^FitMeet-web/backend/src/agent-gateway/social-agent-context-window-boundary\.spec\.ts$'
require_entry "Social Codex event store" '^FitMeet-web/backend/src/agent-gateway/social-agent-event-store\.service\.ts$'
require_entry "Social Codex event store spec" '^FitMeet-web/backend/src/agent-gateway/social-agent-event-store\.service\.spec\.ts$'
require_entry "Social Codex event V2 service" '^FitMeet-web/backend/src/agent-gateway/social-agent-event-v2\.service\.ts$'
require_entry "Social Codex event V2 spec" '^FitMeet-web/backend/src/agent-gateway/social-agent-event-v2\.service\.spec\.ts$'
require_entry "Social Codex event V2 types" '^FitMeet-web/backend/src/agent-gateway/social-agent-event-v2\.types\.ts$'
require_entry "Social Codex slot state machine" '^FitMeet-web/backend/src/agent-gateway/social-agent-task-memory-state-machine\.service\.ts$'
require_entry "Social Codex slot state machine spec" '^FitMeet-web/backend/src/agent-gateway/social-agent-task-memory-state-machine\.service\.spec\.ts$'
require_entry "Social Codex thread id util" '^FitMeet-web/backend/src/agent-gateway/social-agent-thread-id\.util\.ts$'
require_entry "Social Codex thread session manager" '^FitMeet-web/backend/src/agent-gateway/social-agent-thread-session-manager\.service\.ts$'
require_entry "Social Codex thread session manager spec" '^FitMeet-web/backend/src/agent-gateway/social-agent-thread-session-manager\.service\.spec\.ts$'
require_entry "Social Codex approval schema" '^FitMeet-web/backend/src/agent-gateway/social-codex-approval-schema\.service\.ts$'
require_entry "Social Codex approval schema spec" '^FitMeet-web/backend/src/agent-gateway/social-codex-approval-schema\.service\.spec\.ts$'
require_entry "Social Codex event pipeline" '^FitMeet-web/backend/src/agent-gateway/social-codex-event-pipeline\.service\.ts$'
require_entry "Social Codex event pipeline spec" '^FitMeet-web/backend/src/agent-gateway/social-codex-event-pipeline\.service\.spec\.ts$'
require_entry "Social Codex Life Graph governance" '^FitMeet-web/backend/src/agent-gateway/social-codex-life-graph-governance\.service\.ts$'
require_entry "Social Codex Life Graph governance spec" '^FitMeet-web/backend/src/agent-gateway/social-codex-life-graph-governance\.service\.spec\.ts$'
require_entry "Social Codex runtime policy" '^FitMeet-web/backend/src/agent-gateway/social-codex-runtime-policy\.service\.ts$'
require_entry "Social Codex runtime policy spec" '^FitMeet-web/backend/src/agent-gateway/social-codex-runtime-policy\.service\.spec\.ts$'
require_entry "Social Codex runtime model" '^FitMeet-web/backend/src/agent-gateway/social-codex-runtime-model\.ts$'
require_entry "Social Codex runtime model spec" '^FitMeet-web/backend/src/agent-gateway/social-codex-runtime-model\.spec\.ts$'
require_entry "Social Codex trace eval" '^FitMeet-web/backend/src/agent-gateway/social-codex-trace-eval\.service\.ts$'
require_entry "Social Codex trace eval spec" '^FitMeet-web/backend/src/agent-gateway/social-codex-trace-eval\.service\.spec\.ts$'
require_entry "Agent approval service spec" '^FitMeet-web/backend/src/agent-gateway/agent-approval\.service\.spec\.ts$'
require_entry "Agent approval dispatcher spec" '^FitMeet-web/backend/src/agent-gateway/agent-approval-dispatcher\.service\.spec\.ts$'
require_entry "User-facing Agent response spec" '^FitMeet-web/backend/src/agent-gateway/user-facing-agent-response\.spec\.ts$'
require_entry "Social Agent approval Tool UI presenter spec" '^FitMeet-web/backend/src/agent-gateway/social-agent-approval-tool\.presenter\.spec\.ts$'
require_entry "Social Agent candidate action approval presenter spec" '^FitMeet-web/backend/src/agent-gateway/social-agent-candidate-action-approval\.presenter\.spec\.ts$'
require_entry "Social Codex candidate score rules" '^FitMeet-web/backend/src/agent-gateway/social-agent-candidate-score-breakdown-rules\.ts$'
require_entry "Social Agent Brain DeepSeek spec" '^FitMeet-web/backend/src/agent-gateway/social-agent-brain\.service\.spec\.ts$'
require_entry "Social Agent intent router DeepSeek spec" '^FitMeet-web/backend/src/agent-gateway/social-agent-intent-router\.service\.spec\.ts$'
require_entry "Social Agent chat LLM spec" '^FitMeet-web/backend/src/agent-gateway/social-agent-chat-llm\.service\.spec\.ts$'
require_entry "Social Agent LLM prompt memory spec" '^FitMeet-web/backend/src/agent-gateway/social-agent-chat-llm-prompts\.spec\.ts$'
require_entry "Social Agent chat memory presenter spec" '^FitMeet-web/backend/src/agent-gateway/social-agent-chat-memory\.presenter\.spec\.ts$'
require_entry "Social Agent DeepSeek resilience spec" '^FitMeet-web/backend/src/agent-gateway/social-agent-deepseek-resilience\.spec\.ts$'
require_entry "Social Agent DeepSeek quality boundary spec" '^FitMeet-web/backend/src/agent-gateway/social-agent-deepseek-quality-boundary\.spec\.ts$'
require_entry "Social Agent final response DeepSeek spec" '^FitMeet-web/backend/src/agent-gateway/social-agent-final-response\.service\.spec\.ts$'
require_entry "Social Agent model router spec" '^FitMeet-web/backend/src/agent-gateway/social-agent-model-router\.service\.spec\.ts$'
require_entry "Social Agent planner DeepSeek spec" '^FitMeet-web/backend/src/agent-gateway/social-agent-planner\.service\.spec\.ts$'
require_entry "Social Agent match reasoner DeepSeek spec" '^FitMeet-web/backend/src/agent-gateway/match-reasoner\.service\.spec\.ts$'
require_entry "Social Codex route branch boundary spec" '^FitMeet-web/backend/src/agent-gateway/social-agent-route-branch-boundary\.spec\.ts$'
require_entry "Social Codex fallback source boundary spec" '^FitMeet-web/backend/src/agent-gateway/social-agent-fallback-source-boundary\.spec\.ts$'
require_entry "FitMeet subagent worker command contract spec" '^FitMeet-web/backend/src/agent-gateway/fitmeet-subagent-worker-command\.contract\.spec\.ts$'
require_entry "FitMeet subagent worker dispatcher spec" '^FitMeet-web/backend/src/agent-gateway/fitmeet-subagent-worker-dispatcher\.service\.spec\.ts$'
require_entry "FitMeet subagent worker runtime spec" '^FitMeet-web/backend/src/agent-gateway/fitmeet-subagent-worker-runtime\.service\.spec\.ts$'
require_entry "FitMeet subagent worker service spec" '^FitMeet-web/backend/src/agent-gateway/fitmeet-subagent-worker\.service\.spec\.ts$'
require_entry "FitMeet subagent worker CLI spec" '^FitMeet-web/backend/src/agent-gateway/subagent-worker\.cli\.spec\.ts$'
require_entry "FitMeet subagent worker queue spec" '^FitMeet-web/backend/src/agent-gateway/subagent-worker-queue\.service\.spec\.ts$'
require_entry "Social Agent tool executor spec" '^FitMeet-web/backend/src/agent-gateway/social-agent-tool-executor\.service\.spec\.ts$'
require_entry "Social Agent tool JSON model spec" '^FitMeet-web/backend/src/agent-gateway/social-agent-tool-json-model\.service\.spec\.ts$'
require_entry "Social Agent tool model spec" '^FitMeet-web/backend/src/agent-gateway/social-agent-tool-model\.spec\.ts$'

require_entry "Agent assistant-ui release audit" '^FitMeet-web/frontend/scripts/audit-agent-chat-release\.mjs$'
require_entry "Agent assistant-ui browser QA" '^FitMeet-web/frontend/scripts/qa-agent-chat-shell\.mjs$'
require_entry "Agent production browser QA" '^FitMeet-web/frontend/scripts/qa-agent-chat-production\.mjs$'
require_entry "Social Codex replay API test" '^FitMeet-web/frontend/src/test/socialAgentApiReplay\.test\.ts$'
require_entry "Agent workspace page process test" '^FitMeet-web/frontend/src/test/AgentWorkspacePage\.test\.tsx$'
require_entry "Agent stream adapter process test" '^FitMeet-web/frontend/src/test/agentAdapter\.test\.ts$'
require_entry "Agent workspace runtime process test" '^FitMeet-web/frontend/src/test/agentWorkspaceRuntime\.test\.ts$'
require_entry "assistant-ui process model test" '^FitMeet-web/frontend/src/test/toolProcessModel\.test\.ts$'
require_entry "FitMeet assistant-ui transport adapter" '^FitMeet-web/frontend/src/components/agent-workspace/FitMeetAssistantUI\.tsx$'
require_entry "FitMeet assistant-ui transport types" '^FitMeet-web/frontend/src/components/agent-workspace/FitMeetAssistantUI\.types\.ts$'
require_entry "Agent workspace runtime" '^FitMeet-web/frontend/src/components/agent-workspace/agentWorkspaceRuntime\.ts$'
require_entry "Agent reminder route state" '^FitMeet-web/frontend/src/components/agent-workspace/agentReminderRouteState\.ts$'
require_entry "Agent real stream adapter" '^FitMeet-web/frontend/src/components/agent-workspace/api/realAgentAdapter\.ts$'
require_entry "Agent attachment adapter" '^FitMeet-web/frontend/src/components/agent-workspace/fitMeetAttachmentAdapter\.ts$'
require_entry "Agent adapter runtime hook" '^FitMeet-web/frontend/src/components/agent-workspace/useAgentAdapterRuntime\.ts$'
require_entry "Agent thread store" '^FitMeet-web/frontend/src/components/agent-workspace/socialAgentThreadStore\.ts$'
require_entry "Social Codex thread id helper" '^FitMeet-web/frontend/src/components/agent-workspace/socialCodexThreadId\.ts$'
require_entry "Agent approval dispatch message hook" '^FitMeet-web/frontend/src/components/agent-workspace/useAgentApprovalDispatchMessages\.ts$'
require_entry "Agent approval runtime hook" '^FitMeet-web/frontend/src/components/agent-workspace/useAgentApprovalRuntime\.ts$'
require_entry "Agent card action runtime hook" '^FitMeet-web/frontend/src/components/agent-workspace/useAgentCardActionRuntime\.ts$'
require_entry "Agent checkpoint runtime hook" '^FitMeet-web/frontend/src/components/agent-workspace/useAgentCheckpointRuntime\.ts$'
require_entry "Agent feedback runtime hook" '^FitMeet-web/frontend/src/components/agent-workspace/useAgentFeedbackRuntime\.ts$'
require_entry "Agent final result runtime hook" '^FitMeet-web/frontend/src/components/agent-workspace/useAgentFinalResultRuntime\.ts$'
require_entry "Agent message stream hook" '^FitMeet-web/frontend/src/components/agent-workspace/useAgentMessageStream\.ts$'
require_entry "Agent reminder runtime hook" '^FitMeet-web/frontend/src/components/agent-workspace/useAgentReminderRuntime\.ts$'
require_entry "Agent runtime actions hook" '^FitMeet-web/frontend/src/components/agent-workspace/useAgentRuntimeActions\.ts$'
require_entry "Agent session restore hook" '^FitMeet-web/frontend/src/components/agent-workspace/useAgentSessionRestore\.ts$'
require_entry "Agent streaming run hook" '^FitMeet-web/frontend/src/components/agent-workspace/useAgentStreamingRun\.ts$'
require_entry "Agent stream event handler hook" '^FitMeet-web/frontend/src/components/agent-workspace/useAgentStreamEventHandler\.ts$'
require_entry "Agent submit runtime hook" '^FitMeet-web/frontend/src/components/agent-workspace/useAgentSubmitRuntime\.ts$'
require_entry "Agent thread branches hook" '^FitMeet-web/frontend/src/components/agent-workspace/useAgentThreadBranches\.ts$'
require_entry "Agent thread runtime hook" '^FitMeet-web/frontend/src/components/agent-workspace/useAgentThreadRuntime\.ts$'
require_entry "Agent workspace route hook" '^FitMeet-web/frontend/src/components/agent-workspace/useAgentWorkspaceRoute\.ts$'
require_entry "assistant-ui shell component" '^FitMeet-web/frontend/src/components/assistant-ui/assistant-shell\.tsx$'
require_entry "assistant-ui thread component" '^FitMeet-web/frontend/src/components/assistant-ui/thread\.tsx$'
require_entry "assistant-ui composer component" '^FitMeet-web/frontend/src/components/assistant-ui/composer\.tsx$'
require_entry "assistant-ui composer action mode" '^FitMeet-web/frontend/src/components/assistant-ui/composer-action-mode\.ts$'
require_entry "assistant-ui attachment component" '^FitMeet-web/frontend/src/components/assistant-ui/attachment\.tsx$'
require_entry "assistant-ui message component" '^FitMeet-web/frontend/src/components/assistant-ui/message\.tsx$'
require_entry "assistant-ui message runtime context" '^FitMeet-web/frontend/src/components/assistant-ui/message-runtime-context\.tsx$'
require_entry "assistant-ui public process text sanitizer" '^FitMeet-web/frontend/src/components/assistant-ui/public-process-text\.ts$'
require_entry "assistant-ui thread list component" '^FitMeet-web/frontend/src/components/assistant-ui/thread-list\.tsx$'
require_entry "assistant-ui action bar component" '^FitMeet-web/frontend/src/components/assistant-ui/action-bar\.tsx$'
require_entry "assistant-ui branch picker component" '^FitMeet-web/frontend/src/components/assistant-ui/branch-picker\.tsx$'
require_entry "assistant-ui Tool UI fallback" '^FitMeet-web/frontend/src/components/assistant-ui/tool-fallback\.tsx$'
require_entry "assistant-ui Tool UI card actions" '^FitMeet-web/frontend/src/components/assistant-ui/tool-card-actions\.tsx$'
require_entry "assistant-ui Tool UI card collection" '^FitMeet-web/frontend/src/components/assistant-ui/tool-card-collection\.tsx$'
require_entry "assistant-ui Tool UI card shared primitives" '^FitMeet-web/frontend/src/components/assistant-ui/tool-card-shared\.tsx$'
require_entry "assistant-ui process model" '^FitMeet-web/frontend/src/components/assistant-ui/tool-process-model\.ts$'
require_entry "assistant-ui generic Tool UI card" '^FitMeet-web/frontend/src/components/assistant-ui/tool-generic-card\.tsx$'
require_entry "assistant-ui Tool UI action copy" '^FitMeet-web/frontend/src/components/assistant-ui/tool-ui-action-copy\.ts$'
require_entry "assistant-ui Tool UI actions" '^FitMeet-web/frontend/src/components/assistant-ui/tool-ui-actions\.tsx$'
require_entry "assistant-ui Tool UI schema" '^FitMeet-web/frontend/src/components/assistant-ui/tool-ui-schema\.ts$'
require_entry "assistant-ui markdown renderer" '^FitMeet-web/frontend/src/components/assistant-ui/markdown-text\.tsx$'
require_entry "assistant-ui thinking dots" '^FitMeet-web/frontend/src/components/assistant-ui/thinking-dots\.tsx$'
require_entry "assistant-ui tooltip icon button" '^FitMeet-web/frontend/src/components/assistant-ui/tooltip-icon-button\.tsx$'
require_entry "assistant-ui upload progress store" '^FitMeet-web/frontend/src/components/assistant-ui/upload-progress-store\.ts$'
require_entry "Social Codex public process copy helper" '^FitMeet-web/frontend/src/lib/socialCodexProcessCopy\.ts$'
require_entry "Tool UI action copy test" '^FitMeet-web/frontend/src/test/toolUiActionCopy\.test\.ts$'

fail_if_entry "git metadata" '(^|/)\.git/'
fail_if_entry "Vercel project metadata" '(^|/)\.vercel/'
fail_if_entry "Railway project metadata" '(^|/)\.railway/'
fail_if_entry "node_modules" '(^|/)node_modules/'
fail_if_entry "macOS metadata" '(^|/)\.DS_Store$'
fail_if_entry "root npm lockfile" '^FitMeet-web/package-lock\.json$'
fail_if_entry "env files" '(^|/)\.env($|\.|/)'
fail_if_entry "filled Agent remote smoke env" '^FitMeet-web/deploy/agent-smoke\.remote\.env$'
fail_if_entry "ssl private material" '^FitMeet-web/nginx/ssl/'
fail_if_entry "nested zip files" '\.zip$'
fail_if_entry "logs" '(^|/)logs/|\.log$'
fail_if_entry "QA screenshots" 'agent-gsap-qa\.png|agent-reference-qa\.png|homepage-gsap-qa\.png|qa-gsap-round2/|artifacts/|docs/qa/|frontend/qa/'
fail_if_entry "legacy Agent pet component" '^FitMeet-web/frontend/src/components/agent-workspace/CodexAntPet\.tsx$'
fail_if_entry "legacy Agent connection card" '^FitMeet-web/frontend/src/components/agent/AgentConnectionCard\.tsx$'
fail_if_entry "legacy Agent flow hook" '^FitMeet-web/frontend/src/components/agent-workspace/useAgentFlow\.tsx?$'
fail_if_entry "legacy Agent static connection types" '^FitMeet-web/frontend/src/types/agent\.ts$'
fail_if_entry "dev-only mock Agent adapter" '^FitMeet-web/frontend/src/components/agent-workspace/api/mockAgentAdapter\.ts$'
fail_if_entry "dev-only frontend source" '^FitMeet-web/frontend/src/dev/'
fail_if_entry "dev-only mock Agent adapter" '^FitMeet-web/frontend/src/dev/agent/mockAgentAdapter\.ts$'
fail_if_entry "unused alternate AI elements chat shell" '^FitMeet-web/frontend/src/components/ai-elements/'
fail_if_entry "legacy Agent ant guide component" '^FitMeet-web/frontend/src/components/agent/ant-guide/'
fail_if_entry "legacy Agent ant guide assets" '^FitMeet-web/frontend/src/assets/agent/ant-guide/'
fail_if_entry "legacy Agent debug source" '^FitMeet-web/frontend/src/debug/'
fail_if_entry "legacy Agent debug workbench" '^FitMeet-web/frontend/src/debug/(SocialAgentConsolePage\.tsx|agentTaskEvents\.ts|agentPageModuleAudit\.ts|agent-workbench/)'
fail_if_entry "internal demo pages" '^FitMeet-web/frontend/src/pages/(DemoAgentSocialLoopPage|DemoInvestorPage)\.tsx$'
fail_if_entry "legacy Agent workspace CSS" '^FitMeet-web/frontend/src/styles/agent-workspace\.css$'
fail_if_entry "legacy Agent GPT shell CSS" '^FitMeet-web/frontend/src/styles/agent-gpt-copy-shell\.css$'
fail_if_entry "legacy FitMeet assistant shell CSS" '^FitMeet-web/frontend/src/styles/fitmeet-assistant-ui\.css$'
fail_if_entry "legacy standalone HomePage" '^FitMeet-web/frontend/src/pages/HomePage(\.legacy)?\.tsx$'
fail_if_entry "legacy universe hero components" '^FitMeet-web/frontend/src/components/hero/'
fail_if_entry "legacy product motion showcase" '^FitMeet-web/frontend/src/components/showcase/'
fail_if_entry "legacy universe gateway data" '^FitMeet-web/frontend/src/data/(gateways|heroCopy)\.ts$'
fail_if_entry "legacy universe card components" '^FitMeet-web/frontend/src/components/ui/(GatewayPortalCard|SectionHeading)\.tsx$'
fail_if_entry "legacy universe Earth scene" '^FitMeet-web/frontend/src/components/three/EarthScene\.tsx$'
fail_if_entry "legacy universe orbiting agent labels" '^FitMeet-web/frontend/src/components/three/OrbitingEntities\.tsx$'
fail_if_entry "one-off legacy rewrite scripts" '^FitMeet-web/scripts/fix-(aimatch|loginmodal|meetmodal|postmodal)'

step "Write checksum"
if command -v sha256sum >/dev/null 2>&1; then
  checksum="$(sha256sum "${OUTPUT}" | awk '{print $1}')"
else
  checksum="$(shasum -a 256 "${OUTPUT}" | awk '{print $1}')"
fi
printf '%s  %s\n' "${checksum}" "${OUTPUT_NAME}" >"${CHECKSUM_OUTPUT}"

step "Write installer helper"
cp "${ROOT_DIR}/scripts/ecs-install-release.sh" "${INSTALLER_OUTPUT}"
chmod +x "${INSTALLER_OUTPUT}"

size_mb="$(du -m "${OUTPUT}" | awk '{print $1}')"
printf '\n[DONE] %s (%s MB, %s entries)\n' "${OUTPUT}" "${size_mb}" "${#entries[@]}"
printf '[DONE] %s\n' "${CHECKSUM_OUTPUT}"
printf '[DONE] %s\n' "${INSTALLER_OUTPUT}"
