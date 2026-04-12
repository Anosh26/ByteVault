# ByteVault backend (Bun)

API server for the banking app. Uses PostgreSQL via `pg` and coordinates cross-branch work (see `src/controllers/transaction.controller.ts`).

## Setup

```bash
bun install
cp .env.example .env
```

Start databases from the repo root:

```bash
docker compose up -d
```

## Run

```bash
bun run dev
```

## Docker image (backend only)

From `backend/`:

```bash
docker build -t bytevault-backend .
```

This project was initialized with `bun init` (Bun v1.3.x). See [Bun](https://bun.com).
