# ByteVault (Next.js + Bun + Postgres FDW)

Banking management app foundation:

- **DB**: 2 PostgreSQL 16 Alpine containers (Main + Sub), mirrored schemas
- **Inter-DB**: `postgres_fdw` (Main imports Sub as `fdw_sub.*`)
- **Backend**: Bun + Express (`backend/`)
- **Frontend**: Next.js (`client/`)

## Prereqs

- Docker Desktop (Linux engine running)
- Bun installed (`bun --version`)
- Node + npm installed (`node --version`, `npm --version`)

## 1) Start databases

From repo root:

```bash
docker compose up -d
docker compose ps
```

### If you need a clean DB (WIPES ALL DB DATA)

```bash
docker compose down -v
docker compose up -d
```

## 2) FDW (Main → Sub)

If you used an existing volume created before FDW was added, apply once:

```bash
docker compose exec -T branch_a_db psql -U admin_a -d branch_a_db < docker/apply-fdw-main.sql
```

Verify:

```bash
docker compose exec -T branch_a_db psql -U admin_a -d branch_a_db -c "SELECT foreign_table_schema, foreign_table_name FROM information_schema.foreign_tables WHERE foreign_table_schema='fdw_sub' ORDER BY 2;"
```

Optional Sub → Main FDW is provided in `docker/sub-fdw-to-main.sql` (manual one-time run).

## 3) Backend (Bun)

Create env:

```bash
cd backend
cp .env.example .env
```

Install + run:

```bash
bun install
bun run dev
```

Health check:

```bash
curl http://localhost:4000/health
```

## 4) Populate Data
Once the backend is running, you need to create an employee and some demo data.

### Onboard an Employee (Admin)
```bash
cd backend
bun run onboard --email admin@bytevault.com --password securepass --role ADMIN --branch MAIN --name "Admin User"
```

### Seed Demo Users & Accounts
```bash
cd backend
bun run seed-demo
```
This creates a verified user (`john.doe@example.com`) and an account with **₹50,000**.

## 5) Client (Next.js)

Create env:

```bash
cd client
cp .env.example .env.local
```

Install + run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Notes / conventions

- **API base URL**: set by `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:4000`)
- **Next.js proxy convention**: `client/proxy.ts` (Next 16 replaces `middleware.ts`)
- **Postgres config**: `docker/custom.conf` includes `listen_addresses='*'` so FDW can connect cross-container

