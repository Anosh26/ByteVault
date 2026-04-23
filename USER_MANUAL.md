# ByteVault Comprehensive Walkthrough

Welcome to the ByteVault Banking System. This document serves as a comprehensive manual for the entire application, covering architecture, employee roles, daily operations, fraud management, and batch processing.


---

## 1. System Architecture Overview

ByteVault is an enterprise-grade distributed ledger system built to simulate a multi-branch banking environment.

### Core Concepts:
*   **Distributed Ledger (2PC):** The system operates across multiple database instances (e.g., `branch_a_db` for MAIN, `branch_b_db` for SUB). Transactions spanning across branches utilize the Two-Phase Commit (2PC) protocol to ensure ACID compliance.
*   **Double-Entry Accounting:** Every financial movement is recorded in a `journal_entries` table with corresponding balanced `journal_lines` mapping to `ledger_accounts` (e.g., debits equal credits).
*   **Idempotency & Auditing:** All critical actions require an `Idempotency-Key` to prevent duplicate processing, and every action is logged into an immutable `audit_logs` table.

---

## 2. Access & Employee Roles

The system employs strict Role-Based Access Control (RBAC). Employees authenticate via the `/login` portal, and their JWT token dictates their permissions.

### The Four Core Roles:

1.  **MAKER (Initiator)**
    *   **Purpose:** Data entry and request initiation.
    *   **Abilities:** Register new users, create new accounts, and *initiate* transfer requests.
    *   **Restrictions:** Cannot approve transfers, cannot reverse transactions, cannot run batch jobs.
2.  **CHECKER (Approver)**
    *   **Purpose:** Oversight and authorization.
    *   **Abilities:** Review and either *Approve* or *Reject* transfer requests initiated by a Maker.
    *   **Restrictions:** Cannot create users or initiate transfers themselves. This enforces the "four-eyes principle".
3.  **MANAGER**
    *   **Purpose:** Branch management.
    *   **Abilities:** Combines Maker and Checker abilities, plus basic reporting and auditing views.
4.  **ADMIN**
    *   **Purpose:** System oversight and emergency control.
    *   **Abilities:** Can do everything. Specifically controls Batch Jobs (EOD/EOM), raw Journal Entry posting, Ledger Syncing, and Fraud Reversals.

---

## 3. Managing Users (Onboarding)

### How to Add a User
In a banking environment, customers don't just "sign up" on the public internet. They are onboarded.

**Via the Admin Dashboard (UI):**
1. Log in as an Admin or Maker.
2. Navigate to the **Users** tab in the sidebar.
3. Click **"Register Customer"**.
4. Fill in the details: Full Name, Email, Phone, and (optional) Password.
5. Behind the scenes, the system automatically:
   * Hashes the password securely.
   * Creates a user record with KYC marked as `PENDING`.
   * Provisions a default **Savings Account** with a random 5-digit number and ₹0.00 balance at the MAIN branch.

**Via the Onboard Script (CLI):**
You can also onboard employees via the CLI script:
```bash
bun scripts/onboard.ts --email admin@bytevault.com --password securepass --role ADMIN --branch MAIN --name "Super Admin"
```

### Viewing Users
The Admin dashboard displays a comprehensive "Customer Registry". It shows:
*   Name and Contact Info.
*   Total Balance across all their accounts.
*   **KYC Status** (`PENDING`, `VERIFIED`, `REJECTED`).

---

## 4. KYC & Security Operations

ByteVault strictly enforces Know Your Customer (KYC) regulations and allows administrators to control account states dynamically in response to fraud or policy violations.

### The KYC Gateway
When a customer is first onboarded, their `kyc_status` defaults to `PENDING`. 
*   **The Restriction:** A customer with a `PENDING` or `REJECTED` status is blocked at the gateway level. If they log into the Customer Portal (`/portal/login`), they will see a warning banner stating "Action Required: Complete KYC Verification". The "Send Money" functionality is completely hard-blocked both in the UI and via the backend API logic.
*   **The Verification:** A bank employee (Maker/Admin) must physically verify the user's documents and update the database to set `kyc_status = 'VERIFIED'`. Once verified, the gateway opens, and the user can initiate transfer requests.
*(Currently, verification is done directly in the database. In the future, a "Verify KYC" button will be added to the Admin UI).*
```sql
UPDATE users SET kyc_status = 'VERIFIED' WHERE email = 'customer@example.com';
```

### Account States: Flagging, Blocking, and Unblocking
Bank accounts have a `status` field that controls what actions can be performed. The states are:
*   `ACTIVE`: The account is operating normally.
*   `FROZEN`: The account is temporarily blocked. Funds cannot leave the account.
*   `CLOSED`: The account is permanently shut down.

**How to Block/Freeze an Account (Fraud Suspected):**
If a Checker or Admin suspects fraud on a specific account, they can freeze it.
*(Managed via direct database access or API)*:
```sql
UPDATE accounts SET status = 'FROZEN', updated_at = CURRENT_TIMESTAMP WHERE account_number = '12345';
```
When an account is `FROZEN`:
1.  **Incoming Transfers:** Are still permitted (money can enter the account to pay off debts, etc).
2.  **Outgoing Transfers:** Are completely blocked. The transfer engine will instantly reject any request debiting a `FROZEN` account.
3.  **Auditing:** Frozen and Closed accounts are automatically flagged and reported during the End of Day (EOD) Batch Jobs for compliance review.

**How to Unblock an Account:**
Once an investigation clears the customer, an Admin can restore the account:
```sql
UPDATE accounts SET status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP WHERE account_number = '12345';
```

---

## 5. Transactions & Maker-Checker Flow

Moving money in an enterprise environment requires layers of security. ByteVault implements a strict Maker-Checker approval pipeline for internal branch-to-branch transfers.

### The Pipeline Process:

1. **Initiation (MAKER / CUSTOMER)**
   * A verified Customer (via Portal) or a Maker (via Admin Terminal) initiates a transfer.
   * The system verifies the sender has sufficient funds.
   * **Hold Placed:** Instead of moving the money immediately, the backend creates an `account_holds` record. This temporarily locks the transfer amount, ensuring the sender cannot spend the same money twice while the transfer awaits approval.
   * A `transfer_requests` record is created with a status of `PENDING`.

2. **Approval or Rejection (CHECKER / MANAGER)**
   * A Checker or Manager logs into the Admin Dashboard.
   * They review the `PENDING` request.
   * **If Rejected:** The Checker provides a reason, the request is marked `REJECTED`, and the hold on the sender's account is automatically `RELEASED` (funds become available again).
   * **If Approved:** The Maker-Checker rule is verified (the Approver cannot be the same employee as the Initiator). The request is marked `APPROVED` and execution begins.

---

## 6. Execution & Two-Phase Commit (2PC)

When a transfer is approved between two accounts in different branches (e.g., MAIN to SUB), the system must guarantee that the transaction succeeds on BOTH databases or fails entirely. It achieves this using the PostgreSQL 2PC Protocol.

### How 2PC Works in ByteVault:

1. **Prepare Phase:**
   * The backend sends a `PREPARE TRANSACTION` command to `branch_a_db` (MAIN).
   * The backend sends a `PREPARE TRANSACTION` command to `branch_b_db` (SUB).
   * Both databases lock the required rows and write the transaction to the WAL (Write-Ahead Log), signaling they are *ready* to commit.

2. **Commit Phase:**
   * If both databases successfully prepare, the backend sends a `COMMIT PREPARED` command to both.
   * The transaction is finalized simultaneously.
   * The original `account_holds` record is marked as `CAPTURED` (funds permanently removed).
   * The `transfer_requests` status becomes `EXECUTED`.

3. **Failure Handling (Rollback):**
   * If either database fails during the Prepare phase (e.g., network timeout, node crash), the backend sends a `ROLLBACK PREPARED` command to the surviving nodes.
   * The transaction is safely aborted, and no money is lost.
   * The `transfer_requests` status becomes `FAILED`, and the hold is `RELEASED`.

This guarantees that money is never "lost in transit" between databases.

---

## 7. Auditing & Reversals

ByteVault maintains strict financial integrity through immutable ledgers and audit logs.

### The Audit Trail
Every critical action—from login attempts to transfer approvals to account freezing—is logged in the `audit_logs` table.
*   **Where to find it:** Admin Dashboard (or via the database directly).
*   **What it tracks:** Who did it (`actor_id`), what they did (`action`), what it affected (`entity_id`), and extra context (`meta` JSON).

### Reversing a Fraudulent Transaction
If a transaction is deemed fraudulent or erroneous *after* it has settled, the original records are **never deleted**. Instead, a "Reversal" is posted.

**How to Reverse:**
1. Navigate to the **Journal** tab in the Admin Dashboard.
2. Locate the specific `journal_entry` that needs to be undone.
3. Click **"Reverse"** and provide a mandatory reason.
4. The system will:
   * Create a new `journal_entry` of type `REVERSAL`.
   * Create inverse `journal_lines` (e.g., if the original debited Account A for ₹50, the reversal credits Account A for ₹50).
   * Mark the original entry as `REVERSED` to prevent it from being reversed twice.

---

## 8. Batch Processing Engine (EOD & EOM)

Banking systems rely on batch jobs to settle inter-branch accounts, generate reports, and pay out interest. These are accessible under the **Batch Jobs** tab in the Admin Dashboard.

### End of Day (EOD) Settlement
The EOD job runs daily at the close of business. When an Admin triggers it:
1. **Materialized Views:** It refreshes `ledger_daily_balances` for fast reporting.
2. **Clearing Account Audit:** It checks the `CLEARING_INTERBRANCH` ledger account. Because 2PC guarantees atomic transfers, the net balance of clearing accounts across all branches must equal exactly `₹0.00`. If it drifts, EOD immediately aborts and flags a critical error.
3. **Suspense & Recon Reporting:** It logs all `FROZEN` and `CLOSED` accounts into the `eod_reports` table for compliance review.
4. **Interest Accrual (Daily):** It calculates a 4% per annum daily interest on the available balance of all `ACTIVE` accounts. It stores these as `PENDING` records in the `interest_accruals` table. *No money is moved yet.*

### End of Month (EOM) Interest Posting
The EOM job pays out the interest accrued throughout the month. When an Admin triggers it:
1. **Aggregation:** It sums up all `PENDING` accruals for each account.
2. **Journal Posting:** It creates a balanced journal entry: debiting the bank's `INTEREST_EXPENSE` internal account, and crediting the customer's ledger account.
3. **Cache Update:** It adds the interest to the customer's cached `accounts.balance` so they see the new money in their portal.
4. **Status Update:** It marks the accruals as `POSTED` so they aren't paid twice.

---
**End of ByteVault User Manual.**
