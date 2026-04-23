# ByteVault User Manual

Welcome to **ByteVault**! This manual provides a comprehensive guide on how to understand, operate, and manage the ByteVault Banking System. The system is built on a distributed double-entry ledger that guarantees auditability, distributed safety (2PC), and concurrency protection.

## 1. System Overview

ByteVault simulates a multi-branch banking infrastructure using two separate databases (Main and Sub) integrated via PostgreSQL Foreign Data Wrappers (FDW). 

### Key Concepts

*   **Double-Entry Ledger Architecture:** Every financial movement is represented by a balanced journal entry (`sum of debits + credits = 0`). This ensures funds are never "created" or "destroyed" magically, but simply moved between accounts (Customer accounts and Internal accounts like suspense, clearing, or revenue).
*   **Two-Phase Commit (2PC):** When transferring funds across branches, the system prepares the transaction on both databases and only commits if both are ready. This eliminates the risk of distributed inconsistencies and partial commits.
*   **Holds & Authorizations:** When a user initiates a transfer, the system calculates the *available balance* (ledger equity minus active holds). If the balance is sufficient, the funds are "held" (status: `ACTIVE`) until the transfer is reviewed. 
*   **Maker / Checker Workflow:** High-value transactions are subject to strict separation of concerns. A `MAKER` initiates a transfer request, and a `CHECKER` reviews and approves or rejects it.

---

## 2. Authentication & Roles

By default, the application categorizes employee access into roles via JWTs. Each role grants specific operational permissions.

*   **MAKER:** Can create transfer requests.
*   **CHECKER:** Can approve or reject transfer requests. Cannot initiate them.
*   **MANAGER:** Can perform both Maker and Checker duties.
*   **ADMIN:** Has full access to the system, including direct ledger modifications, running sync endpoints, generating reconciliation reports, and reverting entries.

---

## 3. Using the App: Core Workflows

### A. Initiating a Transfer (Maker)
1. **Submit Request:** A logged-in `MAKER` navigates to the transfer portal and enters the `From Account Number`, `To Account Number`, and `Amount` (as a decimal string, e.g., "125.50").
2. **Hold Application:** The backend intercepts the request and calculates the source account's available balance. If sufficient, a hold is placed on the funds preventing double-spending.
3. **Pending State:** A `transfer_request` is generated with the status `PENDING`.

### B. Reviewing a Transfer (Checker)
1. **Review:** A logged-in `CHECKER` navigates to the pending transfer queue.
2. **Approve:** If approved, the system executes the cross-branch Two-Phase Commit protocol. The ledger applies standard templates, deducting from the sender, sending through internal clearing, and crediting the receiver. The hold transitions to `CAPTURED`, and the request becomes `EXECUTED`.
3. **Reject:** If rejected, the Checker supplies a reason. The hold transitions to `RELEASED`, the funds are returned to the sender's available balance, and the request becomes `REJECTED`.

---

## 4. Admin Operations

Administrators have access to powerful ledger reconciliation and auditing tools. 

### A. Reversals (Immutable Corrections)
In an immutable ledger, entries cannot be `DELETED`. If an erroneous entry is posted, an Admin can reverse it:
*   **Reversing:** Calling `POST /api/ledger/entries/:id/reverse` with a valid string `reason` creates a mirror entry that reverses the debits and credits of the original entry.
*   **Safety:** The system restricts double-reversals (reversing a reversal) and identical inversions using strict database constraints.

### B. Reconciliation Reporting
Admins can generate time-boxed reconciliation reports for all internal firm accounts:
*   **Report Generation:** Calling `GET /api/ledger/reconciliation/report?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` aggregates daily material balances.
*   **Verification:** An administrator can immediately verify that internal `CLEARING_INTERBRANCH` routing accounts net to zero over closed periods, proving organizational money integrity.

### C. Ledger Syncing
Since the application supports cached customer balances for ultra-fast reads, Admins can run drift detection tools.
*   **Sync:** Calling `POST /api/ledger/customer-accounts/:bankAccountId/sync-to-cached` checks for discrepancies between the immutable ledger mathematical truth and the cached cache. If a drift is identified, a sync entry is automatically journaled using an `EQUITY_LEDGER_SYNC` internal account.

---

## 5. Compliance & Auditing

ByteVault includes dedicated modules for regulatory compliance and operational transparency.

### A. KYC (Know Your Customer)
All users in the system are assigned a KYC status which determines their eligibility for banking services.
*   **PENDING:** Newly created users. They cannot yet open accounts or initiate transfers.
*   **VERIFIED:** Users who have passed verification. Full access to banking features.
*   **REJECTED:** Users who failed verification. Their accounts are frozen and cannot receive or send funds.

Employee dashboards display these statuses clearly with color-coded badges to prevent accidental processing of unverified transactions.

### B. System Audit Trail
For security and troubleshooting, the system maintains a high-fidelity audit trail of all sensitive operations.
*   **Automatic Logging:** Every account creation, transfer approval, and ledger adjustment is logged into the `audit_logs` table.
*   **Actor Identification:** Logs include the UUID of the employee or user who performed the action, mapped via `actor_id` and `actor_type`.
*   **Metadata Inspection:** Detailed context for each action is stored in a `JSONB` column (`meta`). This captures exact transfer amounts, approval notes, limit adjustments, or failure reasons.

Administrators can access the global audit feed at `/admin/audit` to monitor system health and employee performance.

#### Technical Details
- **API Endpoint:** `GET /api/audit`
- **Routing:** Mounted at `/api/audit` via the `auditRouter` in `backend/index.ts`.
- **UI Integration:** The Next.js frontend fetches this data and renders it in the Admin Dashboard. The navigation bar natively includes a deeply integrated "Audit Trail" link (`<LayoutDashboard />` icon) visible exclusively to users with the `ADMIN` role.
- **Account Data Joining:** When viewing account details (`GET /api/accounts/by-number/:accountNumber`), the backend performs a highly-efficient SQL `JOIN` on the `users` table to fetch the exact `kyc_status` (e.g., `SELECT a.*, u.kyc_status FROM accounts a JOIN users u ON a.user_id = u.id`). This guarantees the KYC status is never dropped from individual account lookups.
- **TypeScript Integration:** The `AccountRow` interface in `client/lib/types.ts` is explicitly typed to accept flexible strings for `kyc_status?: string;` to ensure UI components never fail to render newly added compliance statuses.
- **Active Seeding:** The system includes a robust `seed-demo.ts` utility that generates dozens of rows of varying statuses (VERIFIED, REJECTED) and audit events (TRANSFER_APPROVED, KYC_REVIEWED) to ensure testing environments accurately mirror production activity levels.


## 6. Idempotency & Safety

All state-altering requests (like creating transfers, approving, or posting ledger entries) require an `Idempotency-Key` header.

*   **Idempotency Keys:** If the exact same request with the same keys reaches the server (e.g. user double-clicked submit, network retry occurred), the server will bypass the business logic entirely and return the exact JSON snapshot of the original consequence.
*   **Crash Handling:** The system relies on database lock queues and synchronous `UPDATE` commitments. If the Node container unexpectedly crashes mid-approval, all database holds remain intact or automatically unlock if the database severs the connection, ensuring funds are never permanently locked in limbo.

---

## 7. Getting Started (Quick Run)

If you haven't spun up the environment, follow these steps from the repository root:

1. **Databases:** `docker compose up -d` 
2. **Apply Migrations:** Run all `.sql` migrations in `/docker` targeting `branch_a_db` and `branch_b_db` to setup FDW, Ledger constraints, and Reversals.
3. **Backend:** Navigate to `backend/`, copy `.env.example` to `.env`, and execute `bun install && bun run dev`.
4. **Client:** Navigate to `client/`, copy `.env.example` to `.env.local`, and execute `npm install && npm run dev`. Valid operations can now be done via the client web-app running at `http://localhost:3000`.
