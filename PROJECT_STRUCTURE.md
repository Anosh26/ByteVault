# ByteVault Project Architecture & File Structure

This document breaks down how the ByteVault codebase is organized. The project is a monorepo split into three main areas: the **Backend** (Express API), the **Client** (Next.js Frontend), and the **Infrastructure** (Docker/PostgreSQL).

---

## 1. Top-Level Structure

```text
ByteVault/
├── backend/          # Node.js + Express API server (Powers the business logic)
├── client/           # Next.js React frontend (Admin Terminal & Customer Portal)
├── docker/           # Database initialization scripts and PostgreSQL configs
├── scripts/          # Startup scripts (e.g., dev.ps1, dev.sh)
├── docker-compose.yml# Container orchestration for the two databases
├── package.json      # Root package file for running workspace commands
├── DEMO_SCRIPT.md    # Guide for presenting the project
└── USER_MANUAL.md    # Functional manual for using the system
```

---

## 2. Infrastructure (`/docker` & `docker-compose.yml`)

The infrastructure layer creates the simulated multi-branch environment.

*   `docker-compose.yml`: Spins up two independent PostgreSQL containers (`branch_a_db` for MAIN, and `branch_b_db` for SUB).
*   `docker/init.sql`: The master schema. It creates all tables (users, accounts, ledger, transfers) on both databases. It also sets up the **Foreign Data Wrapper (FDW)** so the MAIN branch can read from the SUB branch securely.
*   `docker/apply-*.sql`: Incremental migration files used to add new features (like EOD batch tables or security updates) without dropping the main database.
*   `docker/custom.conf`: Custom PostgreSQL configuration required to enable `max_prepared_transactions`, which is strictly necessary for the Two-Phase Commit (2PC) protocol.

---

## 3. Backend (`/backend`)

The backend is built with **Node.js, Express, and Bun** (as the runtime). It handles all secure operations, ledgers, and database connections.

```text
backend/
├── index.ts                 # The main entry point. Sets up the Express server, CORS, and registers all API routes.
├── src/
│   ├── db.ts                # Establishes connection pools to BOTH databases (poolA for Main, poolB for Sub).
│   ├── auth/
│   │   └── jwt.ts           # Handles signing and verifying JSON Web Tokens (JWT) using the JWT_SECRET.
│   ├── middleware/
│   │   ├── auth.ts          # Checks JWTs and enforces Role-Based Access Control (RBAC). Blocks unauthorized users.
│   │   └── idempotency.ts   # Prevents accidental double-charging by ensuring requests with the same Idempotency-Key are only processed once.
│   ├── controllers/
│   │   └── transaction.controller.ts # The hardest logic in the app. Implements the Two-Phase Commit (PREPARE, COMMIT PREPARED) across both databases.
│   ├── ledger/
│   │   └── ledger.ts        # The Double-Entry accounting engine. Ensures every transaction has balanced debits and credits.
│   ├── services/
│   │   ├── AccountService.ts# Helper to securely resolve account numbers to database UUIDs.
│   │   └── AuditService.ts  # Handles logging every action to the immutable audit_logs table.
│   └── routes/              # The actual API endpoints (Controllers)
│       ├── auth.ts          # /api/auth/* (Login)
│       ├── users.ts         # /api/users/* (Registration)
│       ├── accounts.ts      # /api/accounts/* (Fetching balances)
│       ├── transfers.ts     # /api/transfers/* (Maker-Checker requests, approvals, rejections)
│       ├── ledger.ts        # /api/ledger/* (Journal entries and Fraud Reversals)
│       ├── holds.ts         # /api/holds/* (Locking funds temporarily)
│       └── jobs.ts          # /api/admin/jobs/* (Triggers for EOD/EOM Batch Processing)
└── scripts/
    ├── onboard.ts           # CLI script to create the first Admin user.
    └── seed_demo.ts         # CLI script to populate dummy data for presentations.
```

---

## 4. Frontend Client (`/client`)

The frontend is built with **Next.js (App Router)** and **Tailwind CSS**. It contains two completely separate visual experiences.

```text
client/
├── app/
│   ├── admin/               # The Admin Terminal
│   │   ├── page.tsx         # Dashboard for managing Users, Reversing Journal Entries, and running Batch Jobs.
│   │   ├── audit/           # View the immutable audit trail.
│   │   └── transfers/       # The Checker interface to Approve/Reject pending transfers.
│   ├── portal/              # The Customer Portal
│   │   ├── login/           # Secure login for customers.
│   │   ├── dashboard/       # Where customers see their balance and recent transactions.
│   │   └── layout.tsx       # Contains the PortalContext and the persistent Sidebar with the "Pending Transfer Pipeline".
│   ├── login/               # Employee login portal.
│   ├── globals.css          # Global Tailwind styles and custom CSS animations (like the transaction pipeline progress bar).
│   └── layout.tsx           # The root HTML structure.
├── lib/
│   ├── axios.ts             # API client configured to automatically attach the JWT token to every request.
│   ├── format.ts            # Helpers to format currency (₹) and dates.
│   └── idempotency.ts       # Generates unique UUIDs on the client to prevent double-submissions.
└── .env.local               # Contains NEXT_PUBLIC_API_URL pointing to the backend.
```

---

## Flow Example: A Customer Makes a Transfer

To understand how the layers interact, follow a single action:

1. **Client:** Customer clicks "Send Money" in `client/app/portal/dashboard/page.tsx`.
2. **Client `lib/axios.ts`:** Generates an Idempotency-Key and sends a POST request to the Backend.
3. **Backend `index.ts`:** Routes the request to `transfersRouter` (`backend/src/routes/transfers.ts`).
4. **Backend `middleware/auth.ts`:** Verifies the customer's JWT is valid and KYC is complete.
5. **Backend `routes/transfers.ts`:** Checks the balance via `ledger.ts`. If sufficient, it creates an `account_holds` row (locking the funds) and a `transfer_requests` row.
6. **Backend `services/AuditService.ts`:** Logs the "Transfer Initiated" action to the database.
7. **Database (`docker/init.sql`):** Safely stores the locked funds.
8. **Client:** The UI updates, showing the transaction in the "Pending Pipeline" sidebar.
