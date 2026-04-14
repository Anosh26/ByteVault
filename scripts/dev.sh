#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "Starting databases..."
docker compose up -d

echo "Applying FDW (Main -> Sub) if needed..."
docker compose exec -T branch_a_db psql -U admin_a -d branch_a_db < docker/apply-fdw-main.sql >/dev/null || true

echo
echo "Next steps:"
echo "  Backend:  cd backend && cp .env.example .env && bun install && bun run dev"
echo "  Client:   cd client && cp .env.example .env.local && npm install && npm run dev"

