param(
  [string]$Output = "fitmeet.zip"
)

$ErrorActionPreference = "Stop"

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

Invoke-Step "Install backend dependencies" {
  Push-Location (Join-Path $root "backend")
  try {
    pnpm install --frozen-lockfile
  } finally {
    Pop-Location
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
Assert-RequiredPath "backend/Dockerfile.prod"
Assert-RequiredPath "nginx/nginx.conf"
Assert-RequiredPath "docker-compose.prod.yml"

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
      "--exclude=backend/dist",
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
    HasBackendSrc = [bool]($entries | Where-Object { $_ -match '(^|/)backend/src/' })
    HasBackendSqlScripts = [bool]($entries | Where-Object { $_ -match '(^|/)backend/scripts/[^/]+\.sql$' })
    HasBackendDockerfile = [bool]($entries | Where-Object { $_ -match '(^|/)backend/Dockerfile\.prod$' })
    HasNginxConf = [bool]($entries | Where-Object { $_ -match '(^|/)nginx/nginx\.conf$' })
    HasNginxSsl = [bool]($entries | Where-Object { $_ -match '(^|/)nginx/ssl(/|$)' })
    HasCompose = [bool]($entries | Where-Object { $_ -match '(^|/)docker-compose\.prod\.yml$' })
    HasSocialSkills = [bool]($entries | Select-String -Pattern '(^|/)(SOCIAL_SKILLS_OPENCLAW_SPEC\.md|integrations/openclaw/(social-skills|fitmeet-social-skills\.ts)|backend/scripts/test-social-skills-runtime-flow\.ts)(/|$)')
    HasEnvFiles = [bool]($entries | Where-Object { $_ -match '(^|/)\.env[^/]*$|(^|/)[^/]*\.env(\.|$)' })
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
    $scan.HasEnvFiles -or
    $scan.HasZipFiles -or
    $scan.HasNginxSsl -or
    $scan.HasDeployStaging -or
    $scan.HasSocialSkills -or
    $scan.HasNodeModules -or
    $scan.HasGit -or
    $scan.HasLogs
  ) {
    Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
    throw "Deploy zip scan failed; removed invalid zip."
  }
}
