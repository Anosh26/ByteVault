$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RootDir

Write-Host "Starting databases..."
docker compose up -d | Out-Host

Write-Host "Applying FDW (Main -> Sub) if needed..."
try {
  docker compose exec -T branch_a_db psql -U admin_a -d branch_a_db < docker/apply-fdw-main.sql | Out-Null
} catch {
  # ignore (e.g. transient startup timing); you can run it manually after compose is healthy
}

Write-Host ""
Write-Host "Next steps:"
Write-Host "  Backend:  cd backend; copy .env.example .env; bun install; bun run dev"
Write-Host "  Client:   cd client; copy .env.example .env.local; npm install; npm run dev"

