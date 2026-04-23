$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RootDir

Write-Host "--- ByteVault Dev Runner ---" -ForegroundColor Cyan

# 1. Start Databases
Write-Host "[1/3] Starting databases..." -ForegroundColor Yellow
docker compose up -d

# 2. Check Envs
Write-Host "[2/3] Checking environment files..." -ForegroundColor Yellow
if (-not (Test-Path "backend/.env")) {
    Write-Host "  Copying backend/.env.example -> .env"
    Copy-Item "backend/.env.example" "backend/.env"
}
if (-not (Test-Path "client/.env.local")) {
    Write-Host "  Copying client/.env.example -> .env.local"
    Copy-Item "client/.env.example" "client/.env.local"
}

# 3. Run Servers
Write-Host "[3/3] Launching Backend & Client servers..." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop all processes." -ForegroundColor Gray

npx concurrently `
  --names "BACKEND,CLIENT" `
  --prefix-colors "blue,magenta" `
  "cd backend && bun run dev" `
  "cd client && npm run dev"
