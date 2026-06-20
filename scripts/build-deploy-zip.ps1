param(
  [string]$Output = "fitmeet.zip"
)

$ErrorActionPreference = "Stop"
$runAgentReleaseVerify = $env:RUN_AGENT_RELEASE_VERIFY
if ([string]::IsNullOrWhiteSpace($runAgentReleaseVerify)) {
  $runAgentReleaseVerify = "true"
}
$runAgentReleaseWorktreeAudit = $env:RUN_AGENT_RELEASE_WORKTREE_AUDIT
if ([string]::IsNullOrWhiteSpace($runAgentReleaseWorktreeAudit)) {
  $runAgentReleaseWorktreeAudit = "true"
}

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$zipPath = if ([System.IO.Path]::IsPathRooted($Output)) {
  $Output
} else {
  Join-Path $root $Output
}
$tempZip = Join-Path $env:TEMP ("fitmeet-deploy-{0}.zip" -f ([Guid]::NewGuid()))

function Invoke-Step {
  param(
    [string]$Title,
    [scriptblock]$Body
  )
  Write-Host ""
  Write-Host "==> $Title"
  & $Body
}

function Assert-RequiredPath {
  param([string]$RelativePath)
  $path = Join-Path $root $RelativePath
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Required deploy artifact is missing: $RelativePath"
  }
}

function Assert-FileContains {
  param(
    [string]$RelativePath,
    [string[]]$Needles
  )
  $path = Join-Path $root $RelativePath
  $content = Get-Content -LiteralPath $path -Raw
  foreach ($needle in $Needles) {
    if (-not $content.Contains($needle)) {
      throw "Required deploy evidence '$needle' missing from $RelativePath"
    }
  }
}

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
if (Test-Path -LiteralPath $tempZip) {
  Remove-Item -LiteralPath $tempZip -Force
}

if ($runAgentReleaseWorktreeAudit -eq "true") {
  Invoke-Step "Audit release worktree is clean" {
    $auditScript = Join-Path $root "scripts/agent-release-worktree-audit.sh"
    if (-not (Get-Command bash -ErrorAction SilentlyContinue)) {
      throw "bash is required to run scripts/agent-release-worktree-audit.sh --strict before packaging. Install Git Bash/WSL or set RUN_AGENT_RELEASE_WORKTREE_AUDIT=false only for local non-production packaging."
    }
    bash $auditScript --strict
  }
} else {
  Invoke-Step "Skip release worktree strict audit" {
    Write-Warning "RUN_AGENT_RELEASE_WORKTREE_AUDIT=$runAgentReleaseWorktreeAudit. Do not use this skip for production ECS packages."
  }
}

Invoke-Step "Install frontend dependencies" {
  Push-Location (Join-Path $root "frontend")
  try {
    pnpm install --frozen-lockfile
  } finally {
    Pop-Location
  }
}

Invoke-Step "Audit Agent chat release files" {
  Push-Location (Join-Path $root "frontend")
  try {
    pnpm run check:agent-chat-release
  } finally {
    Pop-Location
  }
}

Invoke-Step "Build frontend" {
  Push-Location (Join-Path $root "frontend")
  try {
    pnpm build
  } finally {
    Pop-Location
  }
}

Assert-RequiredPath "frontend/dist/index.html"
Assert-RequiredPath "frontend/dist/assets"
Assert-RequiredPath "scripts/verify-agent-skills.mjs"
Assert-RequiredPath "scripts/run-agent-skill-evals.mjs"
Assert-RequiredPath "docs/agent-skills/README.md"
Assert-RequiredPath "docs/agent-skills/social-meetup-workflow.md"
Assert-RequiredPath "docs/agent-skills/tool-contract.md"
Assert-RequiredPath "docs/agent-skills/eval-cases.jsonl"
Assert-RequiredPath "docs/agent-skills/tool-examples.jsonl"
Assert-RequiredPath "docs/agent-skills/profile-onboarding.md"
Assert-RequiredPath "docs/agent-skills/social-intent-clarifier.md"
Assert-RequiredPath "docs/agent-skills/opportunity-card.md"
Assert-RequiredPath "docs/agent-skills/discover-publish.md"
Assert-RequiredPath "docs/agent-skills/candidate-search.md"
Assert-RequiredPath "docs/agent-skills/candidate-rank.md"
Assert-RequiredPath "docs/agent-skills/safety-approval.md"
Assert-RequiredPath "docs/agent-skills/invitation.md"
Assert-RequiredPath "docs/agent-skills/meet-loop.md"
Assert-RequiredPath "docs/agent-skills/life-graph-memory.md"
Assert-FileContains "scripts/run-agent-skill-evals.mjs" @(
  "twenty_turn_memory_no_repeat_questions",
  "candidate_empty_safe_fallback"
)
Assert-FileContains "scripts/verify-agent-skills.mjs" @(
  "profile_onboarding_skill"
)
Assert-FileContains "docs/agent-skills/social-meetup-workflow.md" @(
  "must not block normal conversation",
  "must not invent people"
)
Assert-FileContains "docs/agent-skills/eval-cases.jsonl" @(
  "twenty_turn_memory_no_repeat_questions",
  "candidate_empty_safe_fallback"
)
Assert-RequiredPath "backend/src/agent-gateway/agent-approval.service.spec.ts"
Assert-RequiredPath "backend/src/agent-gateway/agent-approval-dispatcher.service.spec.ts"
Assert-RequiredPath "backend/src/agent-gateway/user-facing-agent-response.spec.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-agent-approval-tool.presenter.spec.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-agent-candidate-action-approval.presenter.spec.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-agent-candidate-score-breakdown-rules.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-agent-route-branch-boundary.spec.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-agent-fallback-source-boundary.spec.ts"
Assert-RequiredPath "backend/src/agent-gateway/fitmeet-subagent-worker-command.contract.spec.ts"
Assert-RequiredPath "backend/src/agent-gateway/fitmeet-subagent-worker-dispatcher.service.spec.ts"
Assert-RequiredPath "backend/src/agent-gateway/fitmeet-subagent-worker-runtime.service.spec.ts"
Assert-RequiredPath "backend/src/agent-gateway/fitmeet-subagent-worker.service.spec.ts"
Assert-RequiredPath "backend/src/agent-gateway/subagent-worker-queue.service.spec.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-agent-tool-executor.service.spec.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-agent-tool-json-model.service.spec.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-agent-tool-model.spec.ts"
Assert-RequiredPath "frontend/scripts/audit-agent-chat-release.mjs"
Assert-RequiredPath "frontend/scripts/qa-agent-chat-shell.mjs"
Assert-RequiredPath "frontend/scripts/qa-agent-chat-production.mjs"
Assert-RequiredPath "frontend/src/components/agent-workspace/FitMeetAssistantUI.tsx"
Assert-RequiredPath "frontend/src/components/agent-workspace/FitMeetAssistantUI.types.ts"
Assert-RequiredPath "frontend/src/components/agent-workspace/agentReminderRouteState.ts"
Assert-RequiredPath "frontend/src/components/agent-workspace/fitMeetAttachmentAdapter.ts"
Assert-RequiredPath "frontend/src/components/agent-workspace/socialAgentThreadStore.ts"
Assert-RequiredPath "frontend/src/components/agent-workspace/socialCodexThreadId.ts"
Assert-RequiredPath "frontend/src/components/agent-workspace/useAgentAdapterRuntime.ts"
Assert-RequiredPath "frontend/src/components/agent-workspace/useAgentApprovalDispatchMessages.ts"
Assert-RequiredPath "frontend/src/components/agent-workspace/useAgentApprovalRuntime.ts"
Assert-RequiredPath "frontend/src/components/agent-workspace/useAgentCardActionRuntime.ts"
Assert-RequiredPath "frontend/src/components/agent-workspace/useAgentCheckpointRuntime.ts"
Assert-RequiredPath "frontend/src/components/agent-workspace/useAgentFeedbackRuntime.ts"
Assert-RequiredPath "frontend/src/components/agent-workspace/useAgentFinalResultRuntime.ts"
Assert-RequiredPath "frontend/src/components/agent-workspace/useAgentMessageStream.ts"
Assert-RequiredPath "frontend/src/components/agent-workspace/useAgentReminderRuntime.ts"
Assert-RequiredPath "frontend/src/components/agent-workspace/useAgentRuntimeActions.ts"
Assert-RequiredPath "frontend/src/components/agent-workspace/useAgentSessionRestore.ts"
Assert-RequiredPath "frontend/src/components/agent-workspace/useAgentStreamingRun.ts"
Assert-RequiredPath "frontend/src/components/agent-workspace/useAgentStreamEventHandler.ts"
Assert-RequiredPath "frontend/src/components/agent-workspace/useAgentSubmitRuntime.ts"
Assert-RequiredPath "frontend/src/components/agent-workspace/useAgentThreadBranches.ts"
Assert-RequiredPath "frontend/src/components/agent-workspace/useAgentThreadRuntime.ts"
Assert-RequiredPath "frontend/src/components/agent-workspace/useAgentWorkspaceRoute.ts"
Assert-RequiredPath "frontend/src/components/assistant-ui/assistant-shell.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/thread.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/composer.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/composer-action-mode.ts"
Assert-RequiredPath "frontend/src/components/assistant-ui/message.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/message-runtime-context.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/public-process-text.ts"
Assert-RequiredPath "frontend/src/components/assistant-ui/thread-list.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/action-bar.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/branch-picker.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/tool-fallback.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/tool-card-actions.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/tool-card-collection.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/tool-card-shared.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/tool-process-model.ts"
Assert-RequiredPath "frontend/src/components/assistant-ui/tool-generic-card.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/tool-ui-action-copy.ts"
Assert-RequiredPath "frontend/src/components/assistant-ui/tool-ui-schema.ts"
Assert-RequiredPath "frontend/src/components/assistant-ui/tool-ui-actions.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/attachment.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/upload-progress-store.ts"
Assert-RequiredPath "frontend/src/components/assistant-ui/markdown-text.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/thinking-dots.tsx"
Assert-RequiredPath "frontend/src/lib/socialCodexProcessCopy.ts"
Assert-RequiredPath "frontend/src/test/socialAgentApiReplay.test.ts"
Assert-RequiredPath "frontend/src/test/toolUiActionCopy.test.ts"

Invoke-Step "Install backend dependencies" {
  Push-Location (Join-Path $root "backend")
  try {
    pnpm install --frozen-lockfile
  } finally {
    Pop-Location
  }
}

if ($runAgentReleaseVerify -eq "true") {
  Invoke-Step "Run Agent release verification" {
    Push-Location (Join-Path $root "backend")
    try {
      pnpm exec tsc --noEmit
      pnpm run seed:agent-smoke:dry-run
        pnpm exec jest `
        src/agent-gateway/agent-approval.service.spec.ts `
        src/agent-gateway/agent-approval-dispatcher.service.spec.ts `
        src/agent-gateway/user-facing-agent-response.spec.ts `
        src/agent-gateway/social-agent-approval-tool.presenter.spec.ts `
        src/agent-gateway/social-agent-candidate-action-approval.presenter.spec.ts `
        src/agent-gateway/agent-run-checkpoint.service.spec.ts `
        src/agent-gateway/social-agent-chat.acceptance.spec.ts `
        src/agent-gateway/social-agent-intent-router.service.spec.ts `
        src/agent-gateway/social-agent-chat.controller.spec.ts `
        src/agent-gateway/social-agent-candidate-score-breakdown.spec.ts `
        src/agent-gateway/social-agent-route-branch-boundary.spec.ts `
        src/agent-gateway/social-agent-fallback-source-boundary.spec.ts `
        src/agent-gateway/fitmeet-subagent-worker-command.contract.spec.ts `
        src/agent-gateway/fitmeet-subagent-worker-dispatcher.service.spec.ts `
        src/agent-gateway/fitmeet-subagent-worker-runtime.service.spec.ts `
        src/agent-gateway/fitmeet-subagent-worker.service.spec.ts `
        src/agent-gateway/subagent-worker-queue.service.spec.ts `
        src/agent-gateway/social-agent-tool-executor.service.spec.ts `
        src/agent-gateway/social-agent-tool-json-model.service.spec.ts `
        src/agent-gateway/social-agent-tool-model.spec.ts `
        src/agent-gateway/social-agent-route-search-turn.service.spec.ts `
        --runInBand
    } finally {
      Pop-Location
    }

    Push-Location (Join-Path $root "frontend")
    try {
      pnpm exec tsc -b
      pnpm exec vitest run `
        src/test/agentAdapter.test.ts `
        src/test/AgentWorkspacePage.test.tsx `
        src/test/assistantUploadProgress.test.tsx `
        src/test/socialAgentApiCheckpointStream.test.ts `
        src/test/socialAgentApiReplay.test.ts `
        src/test/toolUiSchema.test.ts `
        --testTimeout=20000 `
        --reporter=default
    } finally {
      Pop-Location
    }
  }
} else {
  Invoke-Step "Skip Agent release verification" {
    Write-Host "RUN_AGENT_RELEASE_VERIFY=$runAgentReleaseVerify"
  }
}

Invoke-Step "Build backend" {
  Push-Location (Join-Path $root "backend")
  try {
    pnpm build
  } finally {
    Pop-Location
  }
}

Invoke-Step "Dry-run production Agent smoke seed" {
  Push-Location (Join-Path $root "backend")
  try {
    pnpm run seed:agent-smoke:prod:dry-run
  } finally {
    Pop-Location
  }
}

Assert-RequiredPath "backend/src"
Assert-RequiredPath "backend/dist/main.js"
Assert-RequiredPath "backend/dist/scripts/prepare-agent-smoke-seed.js"
Assert-RequiredPath "backend/dist/scripts/smoke-agent-opportunity-journey.js"
Assert-RequiredPath "backend/dist/scripts/smoke-agent-sse-abort.js"
Assert-RequiredPath "backend/dist/scripts/check-production-tables.js"
Assert-RequiredPath "backend/dist/agent-gateway/subagent-worker-healthcheck.js"
Assert-RequiredPath "backend/Dockerfile.prod"
Assert-RequiredPath "backend/src/scripts/prepare-agent-smoke-seed.ts"
Assert-RequiredPath "backend/src/scripts/smoke-agent-opportunity-journey.ts"
Assert-RequiredPath "backend/src/scripts/smoke-agent-sse-abort.ts"
Assert-RequiredPath "nginx/nginx.conf"
Assert-RequiredPath "docker-compose.prod.yml"
Assert-RequiredPath "deploy/env.production.ecs.example"
Assert-RequiredPath "deploy/agent-smoke.remote.env.example"
Assert-RequiredPath "scripts/deploy-production.sh"
Assert-RequiredPath "scripts/lib/toolchain.sh"
Assert-RequiredPath "scripts/ecs-install-release.sh"
Assert-RequiredPath "scripts/ecs-upload-release.sh"
Assert-RequiredPath "scripts/ecs-workbench-install-plan.sh"
Assert-RequiredPath "scripts/ecs-backend-pnpm.sh"
Assert-RequiredPath "scripts/ecs-host-preflight.sh"
Assert-RequiredPath "scripts/ecs-post-deploy-smoke.sh"
Assert-RequiredPath "scripts/verify-agent-goal-production.sh"
Assert-RequiredPath "scripts/verify-agent-release.sh"
Assert-RequiredPath "scripts/agent-release-matrix.sh"
Assert-RequiredPath "scripts/agent-release-worktree-audit.sh"
Assert-RequiredPath "scripts/stage-agent-release-bucket.sh"
Assert-RequiredPath "scripts/test-agent-release-worktree-audit.sh"
Assert-RequiredPath "scripts/agent-remote-smoke-preflight.sh"
Assert-RequiredPath "scripts/agent-remote-smoke-evidence.sh"
Assert-RequiredPath "docs/agent-release-e2e-matrix.md"
Assert-RequiredPath "docs/social-codex-runtime.md"

Assert-RequiredPath "backend/src/agent-gateway/social-agent-context-hydrator.service.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-agent-context-hydrator.service.spec.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-agent-event-store.service.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-agent-event-store.service.spec.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-agent-event-v2.service.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-agent-event-v2.service.spec.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-agent-event-v2.types.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-agent-task-memory-state-machine.service.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-agent-task-memory-state-machine.service.spec.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-agent-thread-id.util.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-agent-thread-session-manager.service.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-agent-thread-session-manager.service.spec.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-codex-approval-schema.service.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-codex-approval-schema.service.spec.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-codex-event-pipeline.service.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-codex-event-pipeline.service.spec.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-codex-life-graph-governance.service.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-codex-life-graph-governance.service.spec.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-codex-runtime-policy.service.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-codex-runtime-policy.service.spec.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-codex-runtime-model.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-codex-runtime-model.spec.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-codex-trace-eval.service.ts"
Assert-RequiredPath "backend/src/agent-gateway/social-codex-trace-eval.service.spec.ts"

Assert-FileContains "docs/agent-release-e2e-matrix.md" @(
  "FitMeet Agent Release E2E Matrix",
  "scripts/agent-release-matrix.sh",
  "scripts/agent-release-worktree-audit.sh",
  "Remote smoke safety preflight",
  "Remote smoke env template",
  "deploy/agent-smoke.remote.env.example",
  "scripts/agent-remote-smoke-preflight.sh --readiness",
  "Remote smoke evidence capture",
  "scripts/agent-remote-smoke-evidence.sh --all --prepare-agent-smoke-seed",
  "Production browser QA",
  "pnpm --dir frontend run qa:agent-chat:production",
  "Final Agent cutover status",
  "REQUIRE_AGENT_REMOTE_SMOKE_EVIDENCE=true",
  "Opportunity readiness smoke",
  "Full opportunity smoke",
  "Ordinary chat does not trigger social UI",
  "Life Graph remains proposal-based"
)
Assert-FileContains "scripts/agent-release-matrix.sh" @(
  "--opportunity-readiness-smoke",
  "--opportunity-full-smoke",
  "scripts/agent-release-worktree-audit.sh",
  "scripts/verify-agent-release.sh"
)
Assert-FileContains "scripts/agent-remote-smoke-preflight.sh" @(
  "--readiness",
  "--full",
  "--sse-abort",
  "AGENT_SMOKE_ALLOW_REMOTE",
  "AGENT_SMOKE_ALLOW_MUTATIONS",
  "AGENT_SMOKE_ALLOW_JWT_MUTATIONS",
  "AGENT_SMOKE_ALLOW_NON_SMOKE_USER",
  "looks_like_smoke_account",
  "looks_like_placeholder_secret",
  "AGENT_SMOKE_PASSWORD still looks like a placeholder",
  "AGENT_SMOKE_STOP_AFTER_OPPORTUNITIES=true"
)
Assert-FileContains "scripts/agent-remote-smoke-evidence.sh" @(
  "FitMeet Agent Remote Smoke Evidence",
  "--all",
  "scripts/ecs-post-deploy-smoke.sh",
  "prepare_agent_smoke_seed_once",
  "export AGENT_SMOKE_ALLOW_MUTATIONS=true",
  "redact()",
  "[redacted-email]"
)
Assert-FileContains "frontend/scripts/qa-agent-chat-production.mjs" @(
  "FitMeet Agent Production Browser QA",
  "FITMEET_AGENT_BROWSER_QA_ALLOW_REMOTE",
  "EXPECTED_RELEASE_COMMIT",
  "ecs-release-diagnose.sh",
  "release.commit",
  "ordinary chat unexpectedly rendered social UI",
  "social intent did not clarify or render opportunities",
  "[redacted-email]"
)
Assert-FileContains "frontend/src/components/assistant-ui/tool-process-model.ts" @(
  "source === 'replay.summary'",
  "displayMode === 'covering_status'",
  "updateModel: value.updateModel === 'latest_state' || displayMode"
)
Assert-FileContains "frontend/src/test/toolProcessModel.test.ts" @(
  "older payloads omit displayMode",
  "source: 'replay.summary'",
  "displayMode: 'covering_status'"
)
Assert-FileContains "scripts/launch-status.sh" @(
  "VALIDATE_AGENT_REMOTE_SMOKE_EVIDENCE_ONLY",
  "--validate-agent-remote-smoke-evidence-only",
  "secret_assignment_pattern",
  "redacted_assignment_pattern",
  "redacted_bearer_pattern",
  "unredacted bearer token",
  "unredacted email address",
  "Social Codex trace eval passed",
  "readiness and full opportunity smoke"
)
Assert-FileContains "deploy/agent-smoke.remote.env.example" @(
  "FitMeet Agent remote smoke environment template",
  "Never use a real user account for mutating Agent smoke",
  "AGENT_SMOKE_ALLOW_REMOTE=true",
  "AGENT_SMOKE_ALLOW_MUTATIONS=true",
  "AGENT_SMOKE_STOP_AFTER_OPPORTUNITIES=true"
)
Assert-FileContains "docs/deployment-aliyun-ecs.md" @(
  "preflight rejects",
  "replace-with-dedicated-smoke-password"
)
Assert-FileContains "backend/src/scripts/smoke-agent-opportunity-journey.ts" @(
  "AGENT_SMOKE_ALLOW_MUTATIONS",
  "AGENT_SMOKE_CITY",
  "AGENT_SMOKE_ACTIVITY",
  "AGENT_SMOKE_TIME",
  "AGENT_SMOKE_INTENSITY",
  "assertMutationSmokeSafety",
  "looksLikeSmokeAccount",
  "AGENT_SMOKE_STOP_AFTER_OPPORTUNITIES",
  "readiness-only smoke stopped before high-risk card actions",
  "search-critical context without over-asking stranger/public policy",
  "assertNoPendingApproval('clarified search', clarified)"
)
Assert-FileContains "backend/src/scripts/smoke-agent-sse-abort.ts" @(
  "AGENT_SMOKE_ALLOW_NON_SMOKE_USER",
  "AGENT_SMOKE_ALLOW_JWT_MUTATIONS",
  "assertRemoteSmokeAccountSafety",
  "looksLikeSmokeAccount"
)
Assert-FileContains "scripts/ecs-post-deploy-smoke.sh" @(
  "--run-agent-opportunity-readiness-smoke",
  "RUN_AGENT_OPPORTUNITY_SMOKE=readiness",
  "./scripts/ecs-backend-pnpm.sh -- seed:agent-smoke:prod",
  "./scripts/ecs-backend-pnpm.sh -- smoke:agent-opportunity:prod",
  "./scripts/ecs-backend-pnpm.sh -- smoke:agent-sse-abort:prod",
  "run_agent_remote_preflight",
  "scripts/agent-remote-smoke-preflight.sh",
  "AGENT_SMOKE_STOP_AFTER_OPPORTUNITIES=",
  "Running real Agent opportunity readiness smoke",
  "AGENT_SMOKE_ALLOW_MUTATIONS=true",
  'AGENT_SMOKE_ACTIVITY="${AGENT_SMOKE_ACTIVITY:-咖啡轻聊天}"',
  'AGENT_SMOKE_TIME="${AGENT_SMOKE_TIME:-周末下午}"',
  'AGENT_SMOKE_INTENSITY="${AGENT_SMOKE_INTENSITY:-轻松}"'
)
Assert-FileContains "scripts/verify-agent-release.sh" @(
  "AGENT_SMOKE_ALLOW_MUTATIONS",
  "dedicated smoke account",
  "agent_smoke_is_remote",
  "RUN_AGENT_OPPORTUNITY_SMOKE accepts",
  "AGENT_SMOKE_STOP_AFTER_OPPORTUNITIES=true",
  "run_agent_smoke_preflight",
  "scripts/agent-remote-smoke-preflight.sh",
  "social-agent-context-hydrator.service.spec.ts",
  "social-agent-event-store.service.spec.ts",
  "social-agent-event-v2.service.spec.ts",
  "social-agent-task-memory-state-machine.service.spec.ts",
  "social-agent-thread-session-manager.service.spec.ts",
  "social-codex-life-graph-governance.service.spec.ts",
  "social-codex-trace-eval.service.spec.ts",
  "social-codex-runtime-policy.service.spec.ts",
  "agent-approval.service.spec.ts",
  "agent-approval-dispatcher.service.spec.ts",
  "user-facing-agent-response.spec.ts",
  "social-agent-approval-tool.presenter.spec.ts",
  "social-agent-candidate-action-approval.presenter.spec.ts",
  "social-agent-candidate-score-breakdown.spec.ts",
  "social-agent-route-branch-boundary.spec.ts",
  "social-agent-fallback-source-boundary.spec.ts",
  "fitmeet-subagent-worker-command.contract.spec.ts",
  "fitmeet-subagent-worker-dispatcher.service.spec.ts",
  "fitmeet-subagent-worker-runtime.service.spec.ts",
  "fitmeet-subagent-worker.service.spec.ts",
  "subagent-worker-queue.service.spec.ts",
  "social-agent-tool-execution-policy.service.spec.ts",
  "social-agent-tool-executor.service.spec.ts",
  "social-agent-tool-json-model.service.spec.ts",
  "social-agent-tool-model.spec.ts",
  "socialAgentApiReplay.test.ts"
)

Invoke-Step "Create deploy zip" {
  Push-Location $root
  try {
    $tarArgs = @(
      "-a",
      "-cf",
      $tempZip,
      "--exclude=.git",
      "--exclude=.github",
      "--exclude=.deploy-staging",
      "--exclude=.vscode",
      "--exclude=node_modules",
      "--exclude=backend/node_modules",
      "--exclude=frontend/node_modules",
      "--exclude=coverage",
      "--exclude=.turbo",
      "--exclude=.next",
      "--exclude=logs",
      "--exclude=*/logs",
      "--exclude=*.log",
      "--exclude=.env*",
      "--exclude=*/.env*",
      "--exclude=deploy/agent-smoke.remote.env",
      "--exclude=*.zip",
      "--exclude=fitmeet-deploy.zip",
      "--exclude=fitmeet.zip",
      "--exclude=backend/.env",
      "--exclude=frontend/.env.development.local",
      "--exclude=backend/public/uploads",
      "--exclude=frontend/playwright-report",
      "--exclude=frontend/test-results",
      "--exclude=artifacts",
      "--exclude=docs/qa",
      "--exclude=frontend/qa",
      "--exclude=qa-gsap-round2",
      "--exclude=agent-gsap-qa.png",
      "--exclude=agent-reference-qa.png",
      "--exclude=homepage-gsap-qa.png",
      "--exclude=frontend/src/components/agent-workspace/CodexAntPet.tsx",
      "--exclude=frontend/src/components/agent-workspace/api/mockAgentAdapter.ts",
      "--exclude=frontend/src/components/ai-elements",
      "--exclude=frontend/src/debug",
      "--exclude=frontend/src/debug/SocialAgentConsolePage.tsx",
      "--exclude=frontend/src/debug/agent-workbench",
      "--exclude=frontend/src/debug/agentTaskEvents.ts",
      "--exclude=frontend/src/debug/agentPageModuleAudit.ts",
      "--exclude=frontend/src/components/agent-workspace/useAgentFlow.ts",
      "--exclude=frontend/src/styles/agent-workspace.css",
      "--exclude=frontend/src/styles/agent-gpt-copy-shell.css",
      "--exclude=frontend/src/styles/fitmeet-assistant-ui.css",
      "--exclude=scripts/fix-aimatch.mjs",
      "--exclude=scripts/fix-aimatch.ps1",
      "--exclude=scripts/fix-loginmodal*.mjs",
      "--exclude=scripts/fix-meetmodal.mjs",
      "--exclude=scripts/fix-postmodal.mjs",
      "--exclude=nginx/ssl",
      "--exclude=SOCIAL_SKILLS_OPENCLAW_SPEC.md",
      "--exclude=integrations/openclaw/social-skills",
      "--exclude=integrations/openclaw/fitmeet-social-skills.ts",
      "--exclude=backend/scripts/test-social-skills-runtime-flow.ts",
      "."
    )
    & tar.exe @tarArgs
    if ($LASTEXITCODE -ne 0) {
      throw "tar failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

Move-Item -LiteralPath $tempZip -Destination $zipPath -Force

Invoke-Step "Scan deploy zip" {
  $entries = tar.exe -tf $zipPath
  $scan = [PSCustomObject]@{
    Path = $zipPath
    SizeMB = [Math]::Round((Get-Item -LiteralPath $zipPath).Length / 1MB, 2)
    TotalEntries = $entries.Count
    HasFrontendIndex = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/dist/index\.html$' })
    HasFrontendAssets = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/dist/assets/' })
    HasAgentReleaseAudit = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/scripts/audit-agent-chat-release\.mjs$' })
    HasAgentBrowserQa = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/scripts/qa-agent-chat-shell\.mjs$' })
    HasAgentProductionBrowserQa = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/scripts/qa-agent-chat-production\.mjs$' })
    HasFitMeetAssistantAdapter = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/agent-workspace/FitMeetAssistantUI\.tsx$' })
    HasFitMeetAssistantTypes = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/agent-workspace/FitMeetAssistantUI\.types\.ts$' })
    HasAgentReminderRouteState = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/agent-workspace/agentReminderRouteState\.ts$' })
    HasAgentAttachmentAdapter = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/agent-workspace/fitMeetAttachmentAdapter\.ts$' })
    HasAgentThreadStore = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/agent-workspace/socialAgentThreadStore\.ts$' })
    HasSocialCodexThreadId = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/agent-workspace/socialCodexThreadId\.ts$' })
    HasAgentAdapterRuntime = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/agent-workspace/useAgentAdapterRuntime\.ts$' })
    HasAgentApprovalDispatchMessages = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/agent-workspace/useAgentApprovalDispatchMessages\.ts$' })
    HasAgentApprovalRuntime = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/agent-workspace/useAgentApprovalRuntime\.ts$' })
    HasAgentCardActionRuntime = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/agent-workspace/useAgentCardActionRuntime\.ts$' })
    HasAgentCheckpointRuntime = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/agent-workspace/useAgentCheckpointRuntime\.ts$' })
    HasAgentFeedbackRuntime = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/agent-workspace/useAgentFeedbackRuntime\.ts$' })
    HasAgentFinalResultRuntime = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/agent-workspace/useAgentFinalResultRuntime\.ts$' })
    HasAgentMessageStream = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/agent-workspace/useAgentMessageStream\.ts$' })
    HasAgentReminderRuntime = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/agent-workspace/useAgentReminderRuntime\.ts$' })
    HasAgentRuntimeActions = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/agent-workspace/useAgentRuntimeActions\.ts$' })
    HasAgentSessionRestore = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/agent-workspace/useAgentSessionRestore\.ts$' })
    HasAgentStreamingRun = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/agent-workspace/useAgentStreamingRun\.ts$' })
    HasAgentStreamEventHandler = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/agent-workspace/useAgentStreamEventHandler\.ts$' })
    HasAgentSubmitRuntime = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/agent-workspace/useAgentSubmitRuntime\.ts$' })
    HasAgentThreadBranches = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/agent-workspace/useAgentThreadBranches\.ts$' })
    HasAgentThreadRuntime = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/agent-workspace/useAgentThreadRuntime\.ts$' })
    HasAgentWorkspaceRoute = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/agent-workspace/useAgentWorkspaceRoute\.ts$' })
    HasAssistantShell = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/assistant-shell\.tsx$' })
    HasAssistantThread = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/thread\.tsx$' })
    HasAssistantComposer = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/composer\.tsx$' })
    HasAssistantComposerActionMode = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/composer-action-mode\.ts$' })
    HasAssistantMessage = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/message\.tsx$' })
    HasAssistantMessageRuntimeContext = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/message-runtime-context\.tsx$' })
    HasAssistantPublicProcessText = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/public-process-text\.ts$' })
    HasAssistantThreadList = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/thread-list\.tsx$' })
    HasAssistantActionBar = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/action-bar\.tsx$' })
    HasAssistantBranchPicker = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/branch-picker\.tsx$' })
    HasAssistantToolFallback = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/tool-fallback\.tsx$' })
    HasAssistantToolCardActions = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/tool-card-actions\.tsx$' })
    HasAssistantToolCardCollection = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/tool-card-collection\.tsx$' })
    HasAssistantToolCardShared = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/tool-card-shared\.tsx$' })
    HasAssistantProcessModel = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/tool-process-model\.ts$' })
    HasAssistantToolGenericCard = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/tool-generic-card\.tsx$' })
    HasAssistantToolActionCopy = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/tool-ui-action-copy\.ts$' })
    HasAssistantToolSchema = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/tool-ui-schema\.ts$' })
    HasAssistantToolActions = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/tool-ui-actions\.tsx$' })
    HasAssistantAttachment = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/attachment\.tsx$' })
    HasAssistantUploadStore = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/upload-progress-store\.ts$' })
    HasAssistantMarkdown = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/markdown-text\.tsx$' })
    HasAssistantThinkingDots = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/thinking-dots\.tsx$' })
    HasSocialCodexProcessCopy = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/lib/socialCodexProcessCopy\.ts$' })
    HasToolUiActionCopyTest = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/test/toolUiActionCopy\.test\.ts$' })
    HasBackendSrc = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/' })
    HasAgentSmokeSeedSource = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/scripts/prepare-agent-smoke-seed\.ts$' })
    HasAgentOpportunitySmokeSource = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/scripts/smoke-agent-opportunity-journey\.ts$' })
    HasAgentSseAbortSmokeSource = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/scripts/smoke-agent-sse-abort\.ts$' })
    HasBackendMain = [bool]($entries | Where-Object { $_ -match '(^|/)backend/dist/main\.js$' })
    HasAgentSmokeSeed = [bool]($entries | Where-Object { $_ -match '(^|/)backend/dist/scripts/prepare-agent-smoke-seed\.js$' })
    HasAgentOpportunitySmoke = [bool]($entries | Where-Object { $_ -match '(^|/)backend/dist/scripts/smoke-agent-opportunity-journey\.js$' })
    HasAgentSseAbortSmoke = [bool]($entries | Where-Object { $_ -match '(^|/)backend/dist/scripts/smoke-agent-sse-abort\.js$' })
    HasProductionTableCheck = [bool]($entries | Where-Object { $_ -match '(^|/)backend/dist/scripts/check-production-tables\.js$' })
    HasSubagentWorkerHealthcheck = [bool]($entries | Where-Object { $_ -match '(^|/)backend/dist/agent-gateway/subagent-worker-healthcheck\.js$' })
    HasBackendSqlScripts = [bool]($entries | Where-Object { $_ -match '(^|/)backend/scripts/[^/]+\.sql$' })
    HasBackendDockerfile = [bool]($entries | Where-Object { $_ -match '(^|/)backend/Dockerfile\.prod$' })
    HasNginxConf = [bool]($entries | Where-Object { $_ -match '(^|/)nginx/nginx\.conf$' })
    HasDeployProduction = [bool]($entries | Where-Object { $_ -match '(^|/)scripts/deploy-production\.sh$' })
    HasToolchain = [bool]($entries | Where-Object { $_ -match '(^|/)scripts/lib/toolchain\.sh$' })
    HasEcsInstall = [bool]($entries | Where-Object { $_ -match '(^|/)scripts/ecs-install-release\.sh$' })
    HasEcsUpload = [bool]($entries | Where-Object { $_ -match '(^|/)scripts/ecs-upload-release\.sh$' })
    HasEcsBackendPnpm = [bool]($entries | Where-Object { $_ -match '(^|/)scripts/ecs-backend-pnpm\.sh$' })
    HasEcsPreflight = [bool]($entries | Where-Object { $_ -match '(^|/)scripts/ecs-host-preflight\.sh$' })
    HasEcsPostDeploySmoke = [bool]($entries | Where-Object { $_ -match '(^|/)scripts/ecs-post-deploy-smoke\.sh$' })
    HasAgentGoalProductionVerify = [bool]($entries | Where-Object { $_ -match '(^|/)scripts/verify-agent-goal-production\.sh$' })
    HasAgentReleaseVerify = [bool]($entries | Where-Object { $_ -match '(^|/)scripts/verify-agent-release\.sh$' })
    HasAgentSkillVerify = [bool]($entries | Where-Object { $_ -match '(^|/)scripts/verify-agent-skills\.mjs$' })
    HasAgentSkillEvalRunner = [bool]($entries | Where-Object { $_ -match '(^|/)scripts/run-agent-skill-evals\.mjs$' })
    HasAgentReleaseMatrix = [bool]($entries | Where-Object { $_ -match '(^|/)scripts/agent-release-matrix\.sh$' })
    HasAgentReleaseWorktreeAudit = [bool]($entries | Where-Object { $_ -match '(^|/)scripts/agent-release-worktree-audit\.sh$' })
    HasAgentRemoteSmokePreflight = [bool]($entries | Where-Object { $_ -match '(^|/)scripts/agent-remote-smoke-preflight\.sh$' })
    HasAgentRemoteSmokeEvidence = [bool]($entries | Where-Object { $_ -match '(^|/)scripts/agent-remote-smoke-evidence\.sh$' })
    HasAgentRemoteSmokeEnvExample = [bool]($entries | Where-Object { $_ -match '(^|/)deploy/agent-smoke\.remote\.env\.example$' })
    HasAgentApprovalServiceSpec = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/agent-gateway/agent-approval\.service\.spec\.ts$' })
    HasAgentApprovalDispatcherSpec = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/agent-gateway/agent-approval-dispatcher\.service\.spec\.ts$' })
    HasUserFacingAgentResponseSpec = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/agent-gateway/user-facing-agent-response\.spec\.ts$' })
    HasSocialAgentApprovalToolPresenterSpec = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/agent-gateway/social-agent-approval-tool\.presenter\.spec\.ts$' })
    HasSocialAgentCandidateActionApprovalPresenterSpec = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/agent-gateway/social-agent-candidate-action-approval\.presenter\.spec\.ts$' })
    HasSocialAgentCandidateScoreRules = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/agent-gateway/social-agent-candidate-score-breakdown-rules\.ts$' })
    HasSocialAgentRouteBranchBoundarySpec = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/agent-gateway/social-agent-route-branch-boundary\.spec\.ts$' })
    HasSocialAgentFallbackSourceBoundarySpec = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/agent-gateway/social-agent-fallback-source-boundary\.spec\.ts$' })
    HasFitMeetSubagentWorkerCommandSpec = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/agent-gateway/fitmeet-subagent-worker-command\.contract\.spec\.ts$' })
    HasFitMeetSubagentWorkerDispatcherSpec = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/agent-gateway/fitmeet-subagent-worker-dispatcher\.service\.spec\.ts$' })
    HasFitMeetSubagentWorkerRuntimeSpec = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/agent-gateway/fitmeet-subagent-worker-runtime\.service\.spec\.ts$' })
    HasFitMeetSubagentWorkerServiceSpec = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/agent-gateway/fitmeet-subagent-worker\.service\.spec\.ts$' })
    HasFitMeetSubagentWorkerQueueSpec = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/agent-gateway/subagent-worker-queue\.service\.spec\.ts$' })
    HasSocialAgentToolExecutorSpec = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/agent-gateway/social-agent-tool-executor\.service\.spec\.ts$' })
    HasSocialAgentToolJsonModelSpec = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/agent-gateway/social-agent-tool-json-model\.service\.spec\.ts$' })
    HasSocialAgentToolModelSpec = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/agent-gateway/social-agent-tool-model\.spec\.ts$' })
    HasSocialCodexApprovalSchema = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/agent-gateway/social-codex-approval-schema\.service\.ts$' })
    HasSocialCodexApprovalSchemaSpec = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/agent-gateway/social-codex-approval-schema\.service\.spec\.ts$' })
    HasSocialCodexEventPipeline = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/agent-gateway/social-codex-event-pipeline\.service\.ts$' })
    HasSocialCodexEventPipelineSpec = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/agent-gateway/social-codex-event-pipeline\.service\.spec\.ts$' })
    HasSocialCodexRuntimeModel = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/agent-gateway/social-codex-runtime-model\.ts$' })
    HasSocialCodexRuntimeModelSpec = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/agent-gateway/social-codex-runtime-model\.spec\.ts$' })
    HasAgentSkillReadme = [bool]($entries | Where-Object { $_ -match '(^|/)docs/agent-skills/README\.md$' })
    HasAgentSkillWorkflow = [bool]($entries | Where-Object { $_ -match '(^|/)docs/agent-skills/social-meetup-workflow\.md$' })
    HasAgentSkillToolContract = [bool]($entries | Where-Object { $_ -match '(^|/)docs/agent-skills/tool-contract\.md$' })
    HasAgentSkillEvalCases = [bool]($entries | Where-Object { $_ -match '(^|/)docs/agent-skills/eval-cases\.jsonl$' })
    HasAgentSkillToolExamples = [bool]($entries | Where-Object { $_ -match '(^|/)docs/agent-skills/tool-examples\.jsonl$' })
    HasAgentProfileOnboardingSkill = [bool]($entries | Where-Object { $_ -match '(^|/)docs/agent-skills/profile-onboarding\.md$' })
    HasAgentSocialIntentSkill = [bool]($entries | Where-Object { $_ -match '(^|/)docs/agent-skills/social-intent-clarifier\.md$' })
    HasAgentOpportunityCardSkill = [bool]($entries | Where-Object { $_ -match '(^|/)docs/agent-skills/opportunity-card\.md$' })
    HasAgentDiscoverPublishSkill = [bool]($entries | Where-Object { $_ -match '(^|/)docs/agent-skills/discover-publish\.md$' })
    HasAgentCandidateSearchSkill = [bool]($entries | Where-Object { $_ -match '(^|/)docs/agent-skills/candidate-search\.md$' })
    HasAgentCandidateRankSkill = [bool]($entries | Where-Object { $_ -match '(^|/)docs/agent-skills/candidate-rank\.md$' })
    HasAgentSafetyApprovalSkill = [bool]($entries | Where-Object { $_ -match '(^|/)docs/agent-skills/safety-approval\.md$' })
    HasAgentInvitationSkill = [bool]($entries | Where-Object { $_ -match '(^|/)docs/agent-skills/invitation\.md$' })
    HasAgentMeetLoopSkill = [bool]($entries | Where-Object { $_ -match '(^|/)docs/agent-skills/meet-loop\.md$' })
    HasAgentLifeGraphMemorySkill = [bool]($entries | Where-Object { $_ -match '(^|/)docs/agent-skills/life-graph-memory\.md$' })
    HasFilledAgentRemoteSmokeEnv = [bool]($entries | Where-Object { $_ -match '(^|/)deploy/agent-smoke\.remote\.env$' })
    HasNginxSsl = [bool]($entries | Where-Object { $_ -match '(^|/)nginx/ssl(/|$)' })
    HasCompose = [bool]($entries | Where-Object { $_ -match '(^|/)docker-compose\.prod\.yml$' })
    HasSocialSkills = [bool]($entries | Select-String -Pattern '(^|/)(SOCIAL_SKILLS_OPENCLAW_SPEC\.md|integrations/openclaw/(social-skills|fitmeet-social-skills\.ts)|backend/scripts/test-social-skills-runtime-flow\.ts)(/|$)')
    HasEnvFiles = [bool]($entries | Where-Object {
      $_ -match '(^|/)\.env[^/]*$|(^|/)[^/]*\.env(\.|$)' -and
      $_ -notmatch '(^|/)deploy/agent-smoke\.remote\.env\.example$'
    })
    HasQaArtifacts = [bool]($entries | Where-Object { $_ -match '(^|/)(artifacts|docs/qa|frontend/qa|qa-gsap-round2)(/|$)|(^|/)(agent-gsap-qa|agent-reference-qa|homepage-gsap-qa)\.png$' })
    HasLegacyAgentShell = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/agent-workspace/(CodexAntPet\.tsx|useAgentFlow\.tsx?)$|(^|/)frontend/src/components/agent-workspace/api/mockAgentAdapter\.ts$|(^|/)frontend/src/components/agent/ant-guide(/|$)|(^|/)frontend/src/assets/agent/ant-guide(/|$)|(^|/)frontend/src/components/ai-elements(/|$)|(^|/)frontend/src/debug(/|$)|(^|/)frontend/src/styles/(agent-workspace|agent-gpt-copy-shell|fitmeet-assistant-ui)\.css$|(^|/)scripts/fix-(aimatch|loginmodal|meetmodal|postmodal)' })
    HasZipFiles = [bool]($entries | Where-Object { $_ -match '\.zip$' })
    HasDeployStaging = [bool]($entries | Where-Object { $_ -match '(^|/)\.deploy-staging(/|$)' })
    HasNodeModules = [bool]($entries | Select-String -SimpleMatch 'node_modules')
    HasGit = [bool]($entries | Where-Object { $_ -match '(^|/)\.git(/|$)' })
    HasLogs = [bool]($entries | Where-Object { $_ -match '(^|/)logs(/|$)|\.log$' })
  }
  $scan | Format-List

  if (
    -not $scan.HasFrontendIndex -or
    -not $scan.HasFrontendAssets -or
    -not $scan.HasAgentReleaseAudit -or
    -not $scan.HasAgentBrowserQa -or
    -not $scan.HasAgentProductionBrowserQa -or
    -not $scan.HasFitMeetAssistantAdapter -or
    -not $scan.HasFitMeetAssistantTypes -or
    -not $scan.HasAgentReminderRouteState -or
    -not $scan.HasAgentAttachmentAdapter -or
    -not $scan.HasAgentThreadStore -or
    -not $scan.HasSocialCodexThreadId -or
    -not $scan.HasAgentAdapterRuntime -or
    -not $scan.HasAgentApprovalDispatchMessages -or
    -not $scan.HasAgentApprovalRuntime -or
    -not $scan.HasAgentCardActionRuntime -or
    -not $scan.HasAgentCheckpointRuntime -or
    -not $scan.HasAgentFeedbackRuntime -or
    -not $scan.HasAgentFinalResultRuntime -or
    -not $scan.HasAgentMessageStream -or
    -not $scan.HasAgentReminderRuntime -or
    -not $scan.HasAgentRuntimeActions -or
    -not $scan.HasAgentSessionRestore -or
    -not $scan.HasAgentStreamingRun -or
    -not $scan.HasAgentStreamEventHandler -or
    -not $scan.HasAgentSubmitRuntime -or
    -not $scan.HasAgentThreadBranches -or
    -not $scan.HasAgentThreadRuntime -or
    -not $scan.HasAgentWorkspaceRoute -or
    -not $scan.HasAssistantShell -or
    -not $scan.HasAssistantThread -or
    -not $scan.HasAssistantComposer -or
    -not $scan.HasAssistantComposerActionMode -or
    -not $scan.HasAssistantMessage -or
    -not $scan.HasAssistantMessageRuntimeContext -or
    -not $scan.HasAssistantPublicProcessText -or
    -not $scan.HasAssistantThreadList -or
    -not $scan.HasAssistantActionBar -or
    -not $scan.HasAssistantBranchPicker -or
    -not $scan.HasAssistantToolFallback -or
    -not $scan.HasAssistantToolCardActions -or
    -not $scan.HasAssistantToolCardCollection -or
    -not $scan.HasAssistantToolCardShared -or
    -not $scan.HasAssistantProcessModel -or
    -not $scan.HasAssistantToolGenericCard -or
    -not $scan.HasAssistantToolActionCopy -or
    -not $scan.HasAssistantToolSchema -or
    -not $scan.HasAssistantToolActions -or
    -not $scan.HasAssistantAttachment -or
    -not $scan.HasAssistantUploadStore -or
    -not $scan.HasAssistantMarkdown -or
    -not $scan.HasAssistantThinkingDots -or
    -not $scan.HasSocialCodexProcessCopy -or
    -not $scan.HasToolUiActionCopyTest -or
    -not $scan.HasAgentSmokeSeedSource -or
    -not $scan.HasAgentOpportunitySmokeSource -or
    -not $scan.HasAgentSseAbortSmokeSource -or
    -not $scan.HasBackendMain -or
    -not $scan.HasAgentSmokeSeed -or
    -not $scan.HasAgentOpportunitySmoke -or
    -not $scan.HasAgentSseAbortSmoke -or
    -not $scan.HasProductionTableCheck -or
    -not $scan.HasSubagentWorkerHealthcheck -or
    -not $scan.HasDeployProduction -or
    -not $scan.HasToolchain -or
    -not $scan.HasEcsInstall -or
    -not $scan.HasEcsUpload -or
    -not $scan.HasEcsBackendPnpm -or
    -not $scan.HasEcsPreflight -or
    -not $scan.HasEcsPostDeploySmoke -or
    -not $scan.HasAgentGoalProductionVerify -or
    -not $scan.HasAgentReleaseVerify -or
    -not $scan.HasAgentSkillVerify -or
    -not $scan.HasAgentSkillEvalRunner -or
    -not $scan.HasAgentReleaseMatrix -or
    -not $scan.HasAgentReleaseWorktreeAudit -or
    -not $scan.HasAgentRemoteSmokePreflight -or
    -not $scan.HasAgentRemoteSmokeEvidence -or
    -not $scan.HasAgentRemoteSmokeEnvExample -or
    -not $scan.HasAgentApprovalServiceSpec -or
    -not $scan.HasAgentApprovalDispatcherSpec -or
    -not $scan.HasUserFacingAgentResponseSpec -or
    -not $scan.HasSocialAgentApprovalToolPresenterSpec -or
    -not $scan.HasSocialAgentCandidateActionApprovalPresenterSpec -or
    -not $scan.HasSocialAgentCandidateScoreRules -or
    -not $scan.HasSocialAgentRouteBranchBoundarySpec -or
    -not $scan.HasSocialAgentFallbackSourceBoundarySpec -or
    -not $scan.HasFitMeetSubagentWorkerCommandSpec -or
    -not $scan.HasFitMeetSubagentWorkerDispatcherSpec -or
    -not $scan.HasFitMeetSubagentWorkerRuntimeSpec -or
    -not $scan.HasFitMeetSubagentWorkerServiceSpec -or
    -not $scan.HasFitMeetSubagentWorkerQueueSpec -or
    -not $scan.HasSocialAgentToolExecutorSpec -or
    -not $scan.HasSocialAgentToolJsonModelSpec -or
    -not $scan.HasSocialAgentToolModelSpec -or
    -not $scan.HasSocialCodexApprovalSchema -or
    -not $scan.HasSocialCodexApprovalSchemaSpec -or
    -not $scan.HasSocialCodexEventPipeline -or
    -not $scan.HasSocialCodexEventPipelineSpec -or
    -not $scan.HasSocialCodexRuntimeModel -or
    -not $scan.HasSocialCodexRuntimeModelSpec -or
    -not $scan.HasAgentSkillReadme -or
    -not $scan.HasAgentSkillWorkflow -or
    -not $scan.HasAgentSkillToolContract -or
    -not $scan.HasAgentSkillEvalCases -or
    -not $scan.HasAgentSkillToolExamples -or
    -not $scan.HasAgentProfileOnboardingSkill -or
    -not $scan.HasAgentSocialIntentSkill -or
    -not $scan.HasAgentOpportunityCardSkill -or
    -not $scan.HasAgentDiscoverPublishSkill -or
    -not $scan.HasAgentCandidateSearchSkill -or
    -not $scan.HasAgentCandidateRankSkill -or
    -not $scan.HasAgentSafetyApprovalSkill -or
    -not $scan.HasAgentInvitationSkill -or
    -not $scan.HasAgentMeetLoopSkill -or
    -not $scan.HasAgentLifeGraphMemorySkill -or
    $scan.HasEnvFiles -or
    $scan.HasFilledAgentRemoteSmokeEnv -or
    $scan.HasZipFiles -or
    $scan.HasNginxSsl -or
    $scan.HasDeployStaging -or
    $scan.HasSocialSkills -or
    $scan.HasQaArtifacts -or
    $scan.HasLegacyAgentShell -or
    $scan.HasNodeModules -or
    $scan.HasGit -or
    $scan.HasLogs
  ) {
    Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
    throw "Deploy zip scan failed; removed invalid zip."
  }
}
