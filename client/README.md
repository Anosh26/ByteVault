# ByteVault Client (Next.js 16 + React 19 + Tailwind CSS)

The frontend client for the **ByteVault** Distributed Banking System. It provides two distinct, role-separated web applications: the **Customer Portal** and the **Employee / Admin Terminal**.

---

## 🚀 Portals & Core Routes

### 1. Customer Banking Portal (`/portal/*`)
* **`/portal/login`**: Customer authentication gateway using email and password.
* **`/portal/dashboard`**: Primary customer overview displaying available balance, account holds, recent transactions, and the **Pending Transfer Pipeline** sidebar.
* **`/portal/transfer`**: Client-side transfer interface with real-time balance validation and KYC gateway checks.
* **`/portal/history`**: Comprehensive journal transaction history for customer accounts.

### 2. Employee Workspace (`/*`)
* **`/login`**: Staff authentication for Bank Makers, Checkers, Managers, and Admins.
* **`/dashboard`**: Unified employee console:
  * **Maker View**: Create new accounts, initiate branch transfers, place funds on hold.
  * **Checker View**: Review pending transfer authorization queue with 1-click **Approve** (triggers 2PC across databases) or **Reject** (releases hold).

### 3. Admin Terminal (`/admin/*`)
* **`/admin`**: Master banking control suite:
  * **Customers Tab**: Full customer registry with inline 1-click **KYC Verification** (`VERIFIED` / `REJECTED`) and customer onboarding modal.
  * **Journal Tab**: Double-entry general ledger journal entries with immutable **Fraud Reversals**.
  * **Recon Tab**: Automated multi-branch clearing account reconciliation (`CLEARING_INTERBRANCH` zero-drift verification).
  * **Batch Jobs Tab**: Trigger **End-of-Day (EOD)** settlement, daily interest accruals, and **End-of-Month (EOM)** interest posting.
* **`/admin/audit`**: Real-time forensic audit log viewer with expandable JSON metadata and IP context.

---

## 🛠️ Tech Stack & Architecture

* **Framework**: Next.js 16 (App Router)
* **UI & Styling**: React 19, Tailwind CSS v4, Lucide React icons
* **HTTP Client**: Axios with automatic JWT injection and Bearer token handling
* **Idempotency**: Client-side UUID generation (`Idempotency-Key` header) to guarantee zero duplicate charges on retries
* **Next.js Proxy Convention**: `proxy.ts` (Next.js 16 convention replacing legacy middleware)

---

## ⚙️ Environment Variables

Create a `.env.local` file in the `client/` root:

```bash
cp .env.example .env.local
```

| Variable | Description | Default |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | Base URL of the ByteVault Bun/Express backend | `http://localhost:4000` |

---

## 💻 Development & Build Scripts

```bash
# Install dependencies
npm install # or bun install

# Start development server on http://localhost:3000
npm run dev # or bun run dev

# Compile production build
npm run build # or bun run build

# Start production server
npm start # or bun run start

# Run ESLint validation
npm run lint
```
