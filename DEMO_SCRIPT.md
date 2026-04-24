# ByteVault: Final Project Demo Script

**Duration:** ~10-15 minutes
**Target Audience:** Professor / Technical Reviewers
**Goal:** Demonstrate engineering depth, security features, and distributed database mechanics (not just a basic CRUD app).

---

## 🛠️ Preparation Checklist (Before the Presentation)

1. **Environment Setup:**
   * [ ] Ensure Docker is running.
   * [ ] Run `npm run db` (or `docker compose up -d`) to start both Branch A and Branch B databases.
   * [ ] Run `npm run dev` to start the backend and Next.js frontend.
   * [ ] Run `npm run seed` to populate initial demo users.

2. **Onboard Demo Employees (If not already present):**
   * [ ] **Maker:** `cd backend && bun scripts/onboard.ts --email maker@bank.com --password makerpass --role MAKER --branch MAIN --name "Alice Maker"`
   * [ ] **Checker:** `cd backend && bun scripts/onboard.ts --email checker@bank.com --password checkerpass --role CHECKER --branch MAIN --name "Bob Checker"`
   * [ ] **Admin:** `cd backend && bun scripts/onboard.ts --email admin@bank.com --password adminpass --role ADMIN --branch MAIN --name "System Admin"`

3. **Open Browser Tabs:**
   1. **Admin/Employee Terminal:** `http://localhost:3000/login`
   2. **Customer Portal:** `http://localhost:3000/portal/login`
   3. **DBeaver / pgAdmin:** Connected to `branch_a_db` (MAIN).

---

## 1. Introduction & The "Hook" (1-2 mins)

**What to say:**
> "Hello Professor. Today I will be presenting **ByteVault**, an enterprise-grade banking system. 
> Unlike typical CRUD projects, ByteVault is a **Distributed Ledger System** designed for high-integrity financial operations across multiple branches.
> 
> The core challenges I solved in this project are:
> 1. **Data Consistency:** Implementing a Two-Phase Commit (2PC) protocol to prevent money loss during cross-database transfers.
> 2. **Security & Governance:** Enforcing a strict Maker-Checker approval pipeline to prevent internal fraud.
> 3. **Observability:** Building an immutable Double-Entry Ledger and a rich Audit Trail with JSON metadata."

---

## 2. Phase 1: Onboarding & The KYC Gateway (2 mins)

**Action 1:** Log in to **Admin Terminal** as `admin@bank.com`.
**Action 2:** Navigate to **Users** tab. Show the "Pending" status of a user.
**What to say:**
> "In ByteVault, security starts at onboarding. We don't have public sign-ups. Customers are registered by bank employees.
> Notice that a newly created user has a `PENDING` KYC status. Our security middleware blocks all transaction capabilities until a physical document verification is performed by the back-office."

**Action 3:** Click **"Verify"** on a pending user.
**Action 4:** Log in as that user in the **Customer Portal**. Show that the "Send Money" button is now active.

---

## 3. Phase 2: The Maker-Checker Workflow (3 mins)

**Action 1:** Log in to the **Admin Terminal** as **Alice Maker** (`maker@bank.com`).
**Action 2:** Navigate to the **Maker Dashboard**. Show the list of accounts.
**What to say:**
> "I am now logged in as a 'Maker'. This is a clerk-level role. I can initiate requests but I cannot authorize them myself. This follows the **'Four-Eyes Principle'** mandatory in global banking."

**Action 3:** Initiate a transfer from a customer account. Note that it stays in `PENDING_APPROVAL` status.
**Action 4:** Open your SQL Client and run: `SELECT * FROM account_holds;`
**What to say:**
> "Notice that the money hasn't moved in the ledger yet, but we have an **Account Hold**. The available balance for the user has decreased, preventing them from double-spending, while the funds remain safely in the account until a Checker approves the release."

**Action 5:** Switch/Log in as **Bob Checker** (`checker@bank.com`).
**Action 6:** Show the **Checker Approval Queue**.
**What to say:**
> "As Bob, the Checker, I can see the pending request. I can see the audit metadata—who created it, when, and the risk score. Once I approve this, the system will trigger the ledger movement."

---

## 4. Phase 3: Distributed Ledger & 2PC (3 mins)

**Action 1:** Approve the transfer in the Checker queue.
**Action 2:** Switch to the **Journal** tab in the Admin Dashboard.
**What to say:**
> "When the Checker approved that transaction, it triggered a cross-branch transfer. The sender is in `branch_a_db` and the receiver is in `branch_b_db`. 
> 
> To ensure ACID compliance across two physical servers, I implemented the **Two-Phase Commit (2PC) protocol**. 
> 1. The backend issues `PREPARE TRANSACTION` to both databases. They lock the rows and write to the WAL.
> 2. If both reply 'OK', we issue `COMMIT PREPARED`.
> 
> This guarantees that money is never 'lost in transit' due to a network or database failure."

**Action 3:** Show the balanced lines in the Journal. Point out the `CLEARING_INTERBRANCH` account entries.
**What to say:**
> "Notice the double-entry accounting. For every debit in Branch A, there is a corresponding credit in Branch B, bridged by an internal clearing account."

---

## 5. Phase 4: Compliance, Audit & FDW (3 mins)

**Action 1:** Navigate to the **Audit Trail** (`/admin/audit`).
**Action 2:** Click on a log entry to show the **JSON Metadata**.
**What to say:**
> "Every single action in ByteVault is recorded in an immutable Audit Log. We don't just store 'who' and 'when'. We store the full request context, including IP addresses and old/new value snapshots. This is critical for forensic accounting."

**Action 3:** Show the **Recon** tab. Show that internal accounts net to zero.
**What to say:**
> "Our End-of-Day engine performs an automated reconciliation. It scans the entire ledger to ensure that all internal clearing accounts net to exactly zero. If there's even a 1-paise drift, the system raises a compliance alert."

**Action 4: (Technical Highlight)** Open your SQL client and show the **Foreign Data Wrapper (FDW)** view.
**What to say:**
> "Finally, a technical highlight: To allow the MAIN branch to monitor the SUB branch without manual exports, I implemented **PostgreSQL Foreign Data Wrappers**. This allows the MAIN database to query SUB branch tables in real-time as if they were local, while maintaining physical data isolation."

---

## 6. Conclusion & Q&A (1 min)

**What to say:**
> "In summary, ByteVault demonstrates engineering for correctness, not just features. From 2PC for distributed state to Maker-Checker for governance, it is built to the standards of a real-world financial system. 
> 
> Thank you, and I'm ready for your questions."
