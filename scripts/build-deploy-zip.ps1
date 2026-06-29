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

Invoke-Step "Lint frontend release surface" {
  Push-Location (Join-Path $root "frontend")
  try {
    pnpm run lint
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
  "candidate_empty_safe_fallback",
  "correction_updates_candidate_preference_without_reasking_core_slots",
  "admin_debug_tools_hidden_from_user_runtime"
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
  "candidate_empty_safe_fallback",
  "correction_updates_candidate_preference_without_reasking_core_slots",
  "admin_debug_tools_hidden_from_user_runtime"
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
Assert-RequiredPath "frontend/src/components/assistant-ui/tool-risk-policy.ts"
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

Assert-RequiredPath "backend/src"
Assert-RequiredPath "backend/dist/main.js"
Assert-RequiredPath "backend/dist/scripts/check-production-tables.js"
Assert-RequiredPath "backend/dist/agent-gateway/subagent-worker-healthcheck.js"
Assert-RequiredPath "backend/Dockerfile.prod"
Assert-RequiredPath "nginx/nginx.conf"
Assert-RequiredPath "docker-compose.prod.yml"
Assert-RequiredPath "deploy/env.production.ecs.example"
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
Assert-RequiredPath "docs/agent/release-gates.md"
Assert-RequiredPath "docs/agent/runtime.md"

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

Assert-FileContains "frontend/src/routes/AppRoutes.tsx" @(
  'path="/public-intent/:id"',
  'path="/messages"'
)
Assert-FileContains "frontend/src/test/toolCardActions.test.ts" @(
  "discoverHref",
  "/public-intent/intent_302"
)
Assert-FileContains "scripts/agent-release-matrix.sh" @(
  "scripts/agent-release-worktree-audit.sh",
  "scripts/verify-agent-release.sh"
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
  "Social Codex trace eval passed"
)
Assert-FileContains "scripts/verify-agent-release.sh" @(
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
      "--exclude=frontend/src/components/agent-loop/ActivityIcebreakerCard.tsx",
      "--exclude=frontend/src/components/agent-loop/ActivityProofUploader.tsx",
      "--exclude=frontend/src/components/agent-loop/AgentApprovalCard.tsx",
      "--exclude=frontend/src/components/agent/AgentConnectionCard.tsx",
      "--exclude=frontend/src/components/agent-workspace/api/mockAgentAdapter.ts",
      "--exclude=frontend/src/dev",
      "--exclude=frontend/src/dev/agent/mockAgentAdapter.ts",
      "--exclude=frontend/src/components/ai-elements",
      "--exclude=frontend/src/debug",
      "--exclude=frontend/src/debug/SocialAgentConsolePage.tsx",
      "--exclude=frontend/src/debug/agent-workbench",
      "--exclude=frontend/src/debug/agentTaskEvents.ts",
      "--exclude=frontend/src/debug/agentPageModuleAudit.ts",
      "--exclude=frontend/src/pages/DemoAgentSocialLoopPage.tsx",
      "--exclude=frontend/src/pages/DemoInvestorPage.tsx",
      "--exclude=frontend/src/types/agent.ts",
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
      "--exclude=",
      "--exclude=",
      "--exclude=",
      "--exclude=",
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
    HasAssistantToolRiskPolicy = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/tool-risk-policy\.ts$' })
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
    HasBackendMain = [bool]($entries | Where-Object { $_ -match '(^|/)backend/dist/main\.js$' })
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
    HasNginxSsl = [bool]($entries | Where-Object { $_ -match '(^|/)nginx/ssl(/|$)' })
    HasCompose = [bool]($entries | Where-Object { $_ -match '(^|/)docker-compose\.prod\.yml$' })
    HasEnvFiles = [bool]($entries | Where-Object {
      $_ -match '(^|/)\.env[^/]*$|(^|/)[^/]*\.env(\.|$)'
    })
    HasQaArtifacts = [bool]($entries | Where-Object { $_ -match '(^|/)(artifacts|docs/qa|frontend/qa|qa-gsap-round2)(/|$)|(^|/)(agent-gsap-qa|agent-reference-qa|homepage-gsap-qa)\.png$' })
    HasLegacyAgentShell = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/agent-workspace/(CodexAntPet\.tsx|useAgentFlow\.tsx?)$|(^|/)frontend/src/components/agent-loop/(ActivityIcebreakerCard|ActivityProofUploader|AgentApprovalCard)\.tsx$|(^|/)frontend/src/components/agent/AgentConnectionCard\.tsx$|(^|/)frontend/src/types/agent\.ts$|(^|/)frontend/src/components/agent-workspace/api/mockAgentAdapter\.ts$|(^|/)frontend/src/dev(/|$)|(^|/)frontend/src/dev/agent/mockAgentAdapter\.ts$|(^|/)frontend/src/components/agent/ant-guide(/|$)|(^|/)frontend/src/assets/agent/ant-guide(/|$)|(^|/)frontend/src/components/ai-elements(/|$)|(^|/)frontend/src/debug(/|$)|(^|/)frontend/src/pages/(HomePage(\.legacy)?|DemoAgentSocialLoopPage|DemoInvestorPage)\.tsx$|(^|/)frontend/src/components/hero(/|$)|(^|/)frontend/src/components/showcase(/|$)|(^|/)frontend/src/components/three(/|$)|(^|/)frontend/src/components/ui/(GatewayPortalCard|SectionHeading)\.tsx$|(^|/)frontend/src/data/(gateways|heroCopy)\.ts$|(^|/)frontend/src/styles/(agent-workspace|agent-gpt-copy-shell|fitmeet-assistant-ui)\.css$|(^|/)scripts/fix-(aimatch|loginmodal|meetmodal|postmodal)' })
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
    -not $scan.HasAssistantToolRiskPolicy -or
    -not $scan.HasAssistantToolActionCopy -or
    -not $scan.HasAssistantToolSchema -or
    -not $scan.HasAssistantToolActions -or
    -not $scan.HasAssistantAttachment -or
    -not $scan.HasAssistantUploadStore -or
    -not $scan.HasAssistantMarkdown -or
    -not $scan.HasAssistantThinkingDots -or
    -not $scan.HasSocialCodexProcessCopy -or
    -not $scan.HasToolUiActionCopyTest -or
    -not $scan.HasBackendMain -or
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
    $scan.HasZipFiles -or
    $scan.HasNginxSsl -or
    $scan.HasDeployStaging -or
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
