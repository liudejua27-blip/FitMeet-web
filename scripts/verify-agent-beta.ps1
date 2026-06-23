param(
  [switch]$SkipFrontend
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Invoke-Step {
  param(
    [string]$Title,
    [scriptblock]$Body
  )

  Write-Host ""
  Write-Host "==> $Title"
  & $Body
}

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE"
  }
}

Invoke-Step "Backend Agent Beta tests" {
  Push-Location (Join-Path $root "backend")
  try {
    Invoke-Native pnpm run test:agent-beta
  } finally {
    Pop-Location
  }
}

Invoke-Step "Backend production build" {
  Push-Location (Join-Path $root "backend")
  try {
    Invoke-Native pnpm build
  } finally {
    Pop-Location
  }
}

if (-not $SkipFrontend) {
  Invoke-Step "Frontend focused tests" {
    Push-Location (Join-Path $root "frontend")
    try {
      Invoke-Native pnpm test -- AgentWorkspacePage AgentRouteIsolation DiscoverPage routeBoundaries
    } finally {
      Pop-Location
    }
  }

  Invoke-Step "Frontend production build" {
    Push-Location (Join-Path $root "frontend")
    try {
      Invoke-Native pnpm build
    } finally {
      Pop-Location
    }
  }
}

Write-Host ""
Write-Host "Agent Beta verification passed."
