# ByteVault Comprehensive Walkthrough (Phase 1)

Welcome to the ByteVault Banking System. This document serves as a comprehensive manual for the entire application, covering architecture, employee roles, daily operations, fraud management, and batch processing.

*Note: This manual is being generated in phases. This is Phase 1.*

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
*End of Phase 1. Let me know when you are ready for Phase 2: KYC & Security Operations (Blocking, Flagging, Unblocking).*
