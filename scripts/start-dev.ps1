param(
  [switch]$NoBackend,
  [switch]$NoFrontend
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"
$DockerDesktop = Join-Path $Env:ProgramFiles "Docker\Docker\Docker Desktop.exe"

function Write-Step($Message) {
  Write-Host ""
  Write-Host "==> $Message"
}

function Test-DockerDaemon {
  docker version *> $null
  return $LASTEXITCODE -eq 0
}

function Wait-DockerDaemon {
  if (Test-DockerDaemon) {
    return
  }

  if (Test-Path $DockerDesktop) {
    Write-Step "Starting Docker Desktop"
    Start-Process -FilePath $DockerDesktop -WindowStyle Hidden
  } else {
    throw "Docker daemon is not reachable and Docker Desktop was not found at $DockerDesktop"
  }

  Write-Step "Waiting for Docker daemon"
  for ($i = 1; $i -le 60; $i++) {
    Start-Sleep -Seconds 2
    if (Test-DockerDaemon) {
      return
    }
    Write-Host "." -NoNewline
  }

  throw "Docker daemon did not become ready after 120 seconds. Open Docker Desktop and try again."
}

function Test-Http($Url) {
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3 *> $null
    return $true
  } catch {
    return $false
  }
}

function Start-NodeServer($Name, $Directory, $Command, $ReadyUrl, $LogFile) {
  if (Test-Http $ReadyUrl) {
    Write-Host "$Name is already responding at $ReadyUrl"
    return
  }

  Write-Step "Starting $Name"
  $psCommand = @"
Set-Location '$Directory'
$Command *> '$LogFile'
"@

  Start-Process powershell.exe `
    -WindowStyle Hidden `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $psCommand)

  Write-Host "$Name log: $LogFile"
}

Set-Location $Root

Write-Step "Checking Docker"
Wait-DockerDaemon

Write-Step "Starting local infrastructure"
docker compose up -d

Write-Step "Current compose status"
docker compose ps

if (-not $NoBackend) {
  Start-NodeServer `
    -Name "backend" `
    -Directory $BackendDir `
    -Command "pnpm run start:dev" `
    -ReadyUrl "http://localhost:3000/api/health" `
    -LogFile (Join-Path $Root "backend-dev.log")
}

if (-not $NoFrontend) {
  Start-NodeServer `
    -Name "frontend" `
    -Directory $FrontendDir `
    -Command "pnpm run dev -- --host 0.0.0.0" `
    -ReadyUrl "http://localhost:5173" `
    -LogFile (Join-Path $Root "frontend-dev.log")
}

Write-Host ""
Write-Host "Dev stack requested."
Write-Host "Backend:  http://localhost:3000/api/health"
Write-Host "Feed API: http://localhost:3000/api/feed"
Write-Host "Frontend: http://localhost:5173"
