param(
  [string]$Output = "fitmeet.zip"
)

$ErrorActionPreference = "Stop"
$runAgentReleaseVerify = $env:RUN_AGENT_RELEASE_VERIFY
if ([string]::IsNullOrWhiteSpace($runAgentReleaseVerify)) {
  $runAgentReleaseVerify = "true"
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
Assert-RequiredPath "frontend/scripts/audit-agent-chat-release.mjs"
Assert-RequiredPath "frontend/scripts/qa-agent-chat-shell.mjs"
Assert-RequiredPath "frontend/scripts/qa-agent-chat-production.mjs"
Assert-RequiredPath "frontend/src/components/agent-workspace/FitMeetAssistantUI.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/assistant-shell.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/thread.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/composer.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/composer-action-mode.ts"
Assert-RequiredPath "frontend/src/components/assistant-ui/message.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/thread-list.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/action-bar.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/branch-picker.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/tool-fallback.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/tool-ui-schema.ts"
Assert-RequiredPath "frontend/src/components/assistant-ui/tool-ui-actions.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/attachment.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/upload-progress-store.ts"
Assert-RequiredPath "frontend/src/components/assistant-ui/markdown-text.tsx"
Assert-RequiredPath "frontend/src/components/assistant-ui/thinking-dots.tsx"

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
        src/agent-gateway/agent-run-checkpoint.service.spec.ts `
        src/agent-gateway/social-agent-chat.acceptance.spec.ts `
        src/agent-gateway/social-agent-intent-router.service.spec.ts `
        src/agent-gateway/social-agent-chat.controller.spec.ts `
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
Assert-RequiredPath "scripts/ecs-host-preflight.sh"
Assert-RequiredPath "scripts/ecs-post-deploy-smoke.sh"
Assert-RequiredPath "scripts/verify-agent-release.sh"
Assert-RequiredPath "scripts/agent-release-matrix.sh"
Assert-RequiredPath "scripts/agent-remote-smoke-preflight.sh"
Assert-RequiredPath "scripts/agent-remote-smoke-evidence.sh"
Assert-RequiredPath "docs/agent-release-e2e-matrix.md"

Assert-FileContains "docs/agent-release-e2e-matrix.md" @(
  "FitMeet Agent Release E2E Matrix",
  "scripts/agent-release-matrix.sh",
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
  "ordinary chat unexpectedly rendered social UI",
  "social intent did not clarify or render opportunities",
  "[redacted-email]"
)
Assert-FileContains "scripts/launch-status.sh" @(
  "VALIDATE_AGENT_REMOTE_SMOKE_EVIDENCE_ONLY",
  "--validate-agent-remote-smoke-evidence-only",
  "secret_assignment_pattern",
  "redacted_assignment_pattern",
  "redacted_bearer_pattern",
  "unredacted bearer token",
  "unredacted email address"
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
  "partialBoundary",
  "AGENT_SMOKE_STOP_AFTER_OPPORTUNITIES",
  "readiness-only smoke stopped before high-risk card actions",
  "partial safety boundary still clarifies stranger/public-activity policy",
  "是否接受陌生人",
  "是否公开发起活动"
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
  "scripts/agent-remote-smoke-preflight.sh"
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
      "--exclude=frontend/src/debug/SocialAgentConsolePage.tsx",
      "--exclude=frontend/src/debug/agent-workbench",
      "--exclude=frontend/src/debug/agentTaskEvents.ts",
      "--exclude=frontend/src/styles/agent-workspace.css",
      "--exclude=frontend/src/styles/agent-gpt-copy-shell.css",
      "--exclude=frontend/src/styles/fitmeet-assistant-ui.css",
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
    HasAssistantShell = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/assistant-shell\.tsx$' })
    HasAssistantThread = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/thread\.tsx$' })
    HasAssistantComposer = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/composer\.tsx$' })
    HasAssistantComposerActionMode = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/composer-action-mode\.ts$' })
    HasAssistantMessage = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/message\.tsx$' })
    HasAssistantThreadList = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/thread-list\.tsx$' })
    HasAssistantActionBar = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/action-bar\.tsx$' })
    HasAssistantBranchPicker = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/branch-picker\.tsx$' })
    HasAssistantToolFallback = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/tool-fallback\.tsx$' })
    HasAssistantToolSchema = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/tool-ui-schema\.ts$' })
    HasAssistantToolActions = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/tool-ui-actions\.tsx$' })
    HasAssistantAttachment = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/attachment\.tsx$' })
    HasAssistantUploadStore = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/upload-progress-store\.ts$' })
    HasAssistantMarkdown = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/markdown-text\.tsx$' })
    HasAssistantThinkingDots = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/assistant-ui/thinking-dots\.tsx$' })
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
    HasEcsPreflight = [bool]($entries | Where-Object { $_ -match '(^|/)scripts/ecs-host-preflight\.sh$' })
    HasEcsPostDeploySmoke = [bool]($entries | Where-Object { $_ -match '(^|/)scripts/ecs-post-deploy-smoke\.sh$' })
    HasAgentReleaseVerify = [bool]($entries | Where-Object { $_ -match '(^|/)scripts/verify-agent-release\.sh$' })
    HasAgentReleaseMatrix = [bool]($entries | Where-Object { $_ -match '(^|/)scripts/agent-release-matrix\.sh$' })
    HasAgentRemoteSmokePreflight = [bool]($entries | Where-Object { $_ -match '(^|/)scripts/agent-remote-smoke-preflight\.sh$' })
    HasAgentRemoteSmokeEvidence = [bool]($entries | Where-Object { $_ -match '(^|/)scripts/agent-remote-smoke-evidence\.sh$' })
    HasAgentRemoteSmokeEnvExample = [bool]($entries | Where-Object { $_ -match '(^|/)deploy/agent-smoke\.remote\.env\.example$' })
    HasFilledAgentRemoteSmokeEnv = [bool]($entries | Where-Object { $_ -match '(^|/)deploy/agent-smoke\.remote\.env$' })
    HasNginxSsl = [bool]($entries | Where-Object { $_ -match '(^|/)nginx/ssl(/|$)' })
    HasCompose = [bool]($entries | Where-Object { $_ -match '(^|/)docker-compose\.prod\.yml$' })
    HasSocialSkills = [bool]($entries | Select-String -Pattern '(^|/)(SOCIAL_SKILLS_OPENCLAW_SPEC\.md|integrations/openclaw/(social-skills|fitmeet-social-skills\.ts)|backend/scripts/test-social-skills-runtime-flow\.ts)(/|$)')
    HasEnvFiles = [bool]($entries | Where-Object {
      $_ -match '(^|/)\.env[^/]*$|(^|/)[^/]*\.env(\.|$)' -and
      $_ -notmatch '(^|/)deploy/agent-smoke\.remote\.env\.example$'
    })
    HasQaArtifacts = [bool]($entries | Where-Object { $_ -match '(^|/)(artifacts|docs/qa|frontend/qa|qa-gsap-round2)(/|$)|(^|/)(agent-gsap-qa|agent-reference-qa|homepage-gsap-qa)\.png$' })
    HasLegacyAgentShell = [bool]($entries | Where-Object { $_ -match '(^|/)frontend/src/components/agent-workspace/CodexAntPet\.tsx$|(^|/)frontend/src/debug/(SocialAgentConsolePage\.tsx|agentTaskEvents\.ts|agent-workbench)(/|$)|(^|/)frontend/src/styles/(agent-workspace|agent-gpt-copy-shell|fitmeet-assistant-ui)\.css$' })
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
    -not $scan.HasAssistantShell -or
    -not $scan.HasAssistantThread -or
    -not $scan.HasAssistantComposer -or
    -not $scan.HasAssistantComposerActionMode -or
    -not $scan.HasAssistantMessage -or
    -not $scan.HasAssistantThreadList -or
    -not $scan.HasAssistantActionBar -or
    -not $scan.HasAssistantBranchPicker -or
    -not $scan.HasAssistantToolFallback -or
    -not $scan.HasAssistantToolSchema -or
    -not $scan.HasAssistantToolActions -or
    -not $scan.HasAssistantAttachment -or
    -not $scan.HasAssistantUploadStore -or
    -not $scan.HasAssistantMarkdown -or
    -not $scan.HasAssistantThinkingDots -or
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
    -not $scan.HasEcsPreflight -or
    -not $scan.HasEcsPostDeploySmoke -or
    -not $scan.HasAgentReleaseVerify -or
    -not $scan.HasAgentReleaseMatrix -or
    -not $scan.HasAgentRemoteSmokePreflight -or
    -not $scan.HasAgentRemoteSmokeEvidence -or
    -not $scan.HasAgentRemoteSmokeEnvExample -or
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
