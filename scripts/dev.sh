#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo -e "\033[0;36m--- ByteVault Dev Runner ---\033[0m"

# 1. Start Databases
echo -e "\033[0;33m[1/3] Starting databases...\033[0m"
docker compose up -d

# 2. Check Envs
echo -e "\033[0;33m[2/3] Checking environment files...\033[0m"
[ ! -f backend/.env ] && echo "  Copying backend/.env.example -> .env" && cp backend/.env.example backend/.env
[ ! -f client/.env.local ] && echo "  Copying client/.env.example -> .env.local" && cp client/.env.example client/.env.local

# 3. Run Servers
echo -e "\033[0;33m[3/3] Launching Backend & Client servers...\033[0m"
echo "Press Ctrl+C to stop all processes."

npx concurrently \
  --names "BACKEND,CLIENT" \
  --prefix-colors "blue,magenta" \
  "cd backend && bun run dev" \
  "cd client && npm run dev"
