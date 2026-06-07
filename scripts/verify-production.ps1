param(
  [string]$BaseUrl = "https://socialworld.world",
  [string]$ApiBaseUrl = "https://api.socialworld.world/api",
  [string]$AgentToken = ""
)

$ErrorActionPreference = "Stop"

function Invoke-Check {
  param(
    [string]$Name,
    [scriptblock]$Request,
    [int[]]$Expected = @(200)
  )

  try {
    $response = & $Request
    $status = [int]$response.StatusCode
    if ($Expected -contains $status) {
      Write-Host "[OK] $Name -> $status" -ForegroundColor Green
      if ($response.Content) {
        $preview = $response.Content
        if ($preview.Length -gt 240) { $preview = $preview.Substring(0, 240) + "..." }
        Write-Host $preview
      }
      return $response
    }
    Write-Host "[FAIL] $Name -> $status, expected $($Expected -join ',')" -ForegroundColor Red
    if ($response.Content) { Write-Host $response.Content }
  } catch {
    $status = $null
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
    }
    if ($status -and ($Expected -contains $status)) {
      Write-Host "[OK] $Name -> $status" -ForegroundColor Green
      return $null
    }
    Write-Host "[FAIL] $Name -> $($_.Exception.Message)" -ForegroundColor Red
  }
}

$base = $BaseUrl.TrimEnd("/")
$api = $ApiBaseUrl.TrimEnd("/")

Invoke-Check "Frontend" {
  Invoke-WebRequest -UseBasicParsing $base -TimeoutSec 20
}

Invoke-Check "Backend health" {
  Invoke-WebRequest -UseBasicParsing "$api/health" -TimeoutSec 20
}

Invoke-Check "Agent manifest without token should exist and reject auth" {
  Invoke-WebRequest -UseBasicParsing "$api/agent/skills/manifest" -TimeoutSec 20
} @(401)

$body = @{
  requestType = "fitness_partner"
  description = "Find a verified workout partner nearby tonight"
  city = "Shanghai"
  verifiedOnly = $true
  limit = 3
} | ConvertTo-Json

$publicIntentResponse = Invoke-Check "Public social intent" {
  Invoke-WebRequest `
    -UseBasicParsing `
    "$api/public/social-intents" `
    -Method POST `
    -ContentType "application/json" `
    -Headers @{
      "User-Agent" = "Mozilla/5.0 FitMeetProductionVerifier"
      "X-FitMeet-Device-Id" = "production-verifier"
    } `
    -Body $body `
    -TimeoutSec 20
} @(200, 201)

$publicIntentId = $null
if ($publicIntentResponse -and $publicIntentResponse.Content) {
  try {
    $publicIntentJson = $publicIntentResponse.Content | ConvertFrom-Json
    $publicIntentId = $publicIntentJson.request.id
  } catch {
    Write-Host "[WARN] Could not parse public intent response" -ForegroundColor Yellow
  }
}

Invoke-Check "Public social intent list/search" {
  Invoke-WebRequest -UseBasicParsing "$api/public/social-intents?q=workout&city=Shanghai&requestType=fitness_partner&page=1&limit=5" -TimeoutSec 20
}

if ($publicIntentId) {
  Invoke-Check "Public social intent detail" {
    Invoke-WebRequest -UseBasicParsing "$api/public/social-intents/$publicIntentId" -TimeoutSec 20
  }

  Invoke-Check "Public social intent matches" {
    Invoke-WebRequest -UseBasicParsing "$api/public/social-intents/$publicIntentId/matches" -TimeoutSec 20
  }
}

if ($AgentToken) {
  Invoke-Check "Agent manifest with token" {
    Invoke-WebRequest `
      -UseBasicParsing `
      "$api/agent/skills/manifest" `
      -Headers @{ "X-Agent-Token" = $AgentToken } `
      -TimeoutSec 20
  }
} else {
  Write-Host "[SKIP] Agent manifest with token. Pass -AgentToken to verify authorized mode." -ForegroundColor Yellow
}
