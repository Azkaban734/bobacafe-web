# Build schedule-app and copy into main-site/schedule-app (for local or Netlify).
# Run from repo root:  pwsh -File main-site/build.ps1
# Or from main-site:   pwsh -File build.ps1

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot | Split-Path -Parent
$scheduleApp = Join-Path $repoRoot "schedule-app"
$targetDir = Join-Path (Join-Path $repoRoot "main-site") "schedule-app"
$buildDir = Join-Path $scheduleApp "build"

if (-not (Test-Path $scheduleApp)) {
    Write-Error "schedule-app folder not found at: $scheduleApp"
    exit 1
}

Push-Location $scheduleApp
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    npm run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}

if (-not (Test-Path $buildDir)) {
    Write-Error "Build output not found at: $buildDir"
    exit 1
}

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Copy-Item -Path (Join-Path $buildDir "*") -Destination $targetDir -Recurse -Force
Write-Host "Done. Copied build to main-site/schedule-app"
