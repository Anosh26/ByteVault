# ByteVault: Final Project Demo Script

**Duration:** ~10-15 minutes
**Target Audience:** Professor / Technical Reviewers
**Goal:** Demonstrate engineering depth, security features, and distributed database mechanics (not just a basic CRUD app).

---

## Preparation Checklist (Before the Presentation)
* [ ] Run `bun run dev` to ensure backend and frontend are live.
* [ ] Run `bun run seed-demo` (optional) to ensure you have some dummy data.
* [ ] Open three browser tabs:
    1. **Admin Terminal:** `http://localhost:3000/login`
    2. **Customer Portal:** `http://localhost:3000/portal/login`
    3. **PostgreSQL Client (DBeaver/pgAdmin):** Connected to `branch_a_db` (MAIN) to show raw database tables.

---

## 1. Introduction & The "Hook" (1-2 mins)

**What to say:**
> "Hello Professor. Today I will be presenting **ByteVault**, an enterprise-grade banking system. Most student projects build simple CRUD applications with a single database. ByteVault is different. It is a **Distributed Ledger System** designed to handle complex financial operations across multiple branches. 
> 
> The core challenges I solved in this project are:
> 1. Ensuring zero money is lost when transferring funds between two completely separate databases.
> 2. Enforcing strict Role-Based Access Control (RBAC) using a Maker-Checker approval pipeline.
> 3. Maintaining an immutable Double-Entry Accounting ledger for financial integrity."

---

## 2. Phase 1: Onboarding & The KYC Gateway (3 mins)

**Action 1:** Open the **Admin Terminal** and log in as an `ADMIN` (e.g., `admin@bytevault.com`).
**Action 2:** Navigate to the **Users** tab. Click **"Register Customer"** and create a new user (e.g., "Demo User").
**What to say:**
> "Let's start with customer onboarding. In a real bank, customers don't just sign up; they are onboarded by employees. When I create this user, the system automatically provisions a unique ledger identity and a default savings account at the Main branch."

**Action 3:** Switch to the **Customer Portal** tab and log in as the newly created user.
**What to say:**
> "Notice the warning banner and the disabled 'Send Money' button. This is the **KYC Gateway**. By default, new accounts are in a `PENDING` state. Security middleware prevents them from initiating transactions until the bank verifies their physical documents."

**Action 4:** (Behind the scenes or via DB) Update the user's KYC to `VERIFIED`. Refresh the Customer Portal to show the button is now active.

---

## 3. Phase 2: The Maker-Checker Flow & Holds (4 mins)

**Action 1:** In the Customer Portal, initiate a transfer of ₹500 to another account (ensure the destination account is in the `SUB` branch).
**What to say:**
> "I'm initiating a transfer to a different branch. However, the money doesn't move immediately. Enterprise systems require oversight. The request is now `PENDING`."

**Action 2:** Switch to the **Admin Terminal** and open the **PostgreSQL Client**. Query the `account_holds` table.
**What to say:**
> "To prevent the user from spending that ₹500 twice before the transfer is approved, the system places a **Hold** on the funds. The available balance decreases, but the ledger balance remains untouched. This is critical to prevent race conditions and overdrafts."

**Action 3:** In the Admin Terminal, navigate to the transfers/approvals section (or explain the API if UI is pending).
**What to say:**
> "Now, an employee with a `CHECKER` or `MANAGER` role reviews this. We strictly enforce the 'Four-Eyes Principle'—the person who initiated the request (the Maker) cannot be the same person who approves it."

**Action 4:** Approve the transaction.

---

## 4. Phase 3: The Distributed Ledger & 2PC (3 mins)

**Action 1:** Show the **Journal** tab in the Admin Dashboard. Point out the balanced lines (Debit and Credit).
**What to say:**
> "When the Checker approved that transaction, it triggered a cross-branch transfer. This is where the technical complexity peaks. The sender is in `branch_a_db` and the receiver is in `branch_b_db`. 
> 
> To ensure ACID compliance across two physical servers, I implemented the **Two-Phase Commit (2PC) protocol**. 
> 1. The backend tells both databases to `PREPARE` the transaction. They lock the rows and write to disk.
> 2. If, and only if, both databases reply 'Ready', the backend issues a `COMMIT PREPARED`.
> 
> If the network drops or a database crashes during this process, the system issues a `ROLLBACK PREPARED`. This guarantees money is never lost in transit."

---

## 5. Phase 4: Reversals & Batch Processing (3 mins)

**Action 1:** Still in the **Journal** tab, click **"Reverse"** on a recent transaction.
**What to say:**
> "Financial data must be immutable. If fraud occurs, we don't `DELETE` rows. I built an automated Reversal engine. It creates a new, inverse journal entry that perfectly cancels out the fraudulent one, preserving the audit trail."

**Action 2:** Go to the **Batch Jobs** tab in the Admin UI.
**What to say:**
> "Finally, let's look at the End of Day (EOD) engine. 
> When I run EOD, the system does three things:
> 1. It audits the `CLEARING_INTERBRANCH` ledger. If the net balance across branches isn't exactly ₹0.00, it aborts and alerts us of a critical ledger drift.
> 2. It scans for accounts in a `FROZEN` state for compliance reporting.
> 3. It calculates a daily 4% interest accrual for all active accounts without moving money."

**Action 3:** Click **"Run EOM Interest Posting"**.
**What to say:**
> "At the End of the Month, the EOM job aggregates all those daily accruals and posts massive batch journal entries, debiting the bank's Interest Expense account and crediting the customers."

---

## 6. Conclusion & Q&A (1 min)

**What to say:**
> "To summarize, ByteVault goes beyond standard web development by tackling distributed state management, strict concurrency controls (holds and 2PC), and immutable financial accounting. 
> 
> I am happy to take any questions on the database schema, the API architecture, or the security implementations."
