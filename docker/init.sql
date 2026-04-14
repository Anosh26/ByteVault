-- ByteVault: mirrored schema on both branch databases.
-- Main = branch_a_db (compose service branch_a_db). Sub = branch_b_db (branch_b_db).
-- FDW: Main treats Sub as foreign (postgres_fdw). Sub -> Main import is not run here
-- because Sub initializes before Main exists; add a follow-up migration if you need it.

CREATE EXTENSION IF NOT EXISTS postgres_fdw;

CREATE TABLE branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_code VARCHAR(10) UNIQUE NOT NULL,
    ifsc_code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    location TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    kyc_status VARCHAR(20) DEFAULT 'PENDING' CHECK (kyc_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('MAKER', 'CHECKER', 'MANAGER', 'ADMIN')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
    account_number VARCHAR(20) UNIQUE NOT NULL,
    balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'FROZEN', 'CLOSED')),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE transactions (
    id VARCHAR(255) PRIMARY KEY,
    account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
    type VARCHAR(10) NOT NULL CHECK (type IN ('DEBIT', 'CREDIT')),
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE external_transfers (
    transfer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_ifsc VARCHAR(20) NOT NULL,
    target_ifsc VARCHAR(20) NOT NULL,
    from_account VARCHAR(20) NOT NULL,
    to_account VARCHAR(20) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('OUTBOUND', 'INBOUND')),
    network_status VARCHAR(20) NOT NULL DEFAULT 'QUEUED' CHECK (network_status IN ('QUEUED', 'PROCESSING', 'SETTLED', 'FAILED')),
    failure_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_outbox_polling
ON external_transfers (direction, network_status)
WHERE network_status IN ('QUEUED', 'PROCESSING');

-- ---------------------------------------------------------------------------
-- Security + approvals foundation
-- ---------------------------------------------------------------------------

-- Employee login credentials (employees table is identity + role; this stores secrets separately).
CREATE TABLE employee_credentials (
    employee_id UUID PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Idempotency keys for all payment routes.
-- Stores a stable response for a given (actor, key, route).
CREATE TABLE idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('USER', 'EMPLOYEE')),
    actor_id UUID NOT NULL,
    key VARCHAR(128) NOT NULL,
    route VARCHAR(200) NOT NULL,
    request_hash VARCHAR(128) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
    response_code INT,
    response_body JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (actor_type, actor_id, key, route)
);
CREATE INDEX idx_idempotency_polling
ON idempotency_keys (status, created_at)
WHERE status = 'IN_PROGRESS';

-- Audit log for sensitive operations (transfers, approvals, admin actions).
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('USER', 'EMPLOYEE')),
    actor_id UUID NOT NULL,
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id UUID,
    meta JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Ledger foundation (double-entry)
-- ---------------------------------------------------------------------------

CREATE TABLE ledger_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE,
    name VARCHAR(150) NOT NULL,
    type VARCHAR(30) NOT NULL CHECK (type IN ('CUSTOMER', 'INTERNAL')),
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    -- For CUSTOMER type, this links back to the banking account.
    ref_account_id UUID UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- One business event (transfer, deposit, reversal, fee).
CREATE TABLE journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- e.g. TRANSFER, REVERSAL, FEE, DEPOSIT
    kind VARCHAR(40) NOT NULL,
    description TEXT,
    external_ref VARCHAR(120),
    created_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_journal_entries_created_at ON journal_entries (created_at DESC);
CREATE INDEX idx_journal_entries_external_ref ON journal_entries (external_ref);

-- Lines are signed cents; sum(amount_cents) must be 0 (enforced in app for now).
CREATE TABLE journal_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    ledger_account_id UUID NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
    amount_cents BIGINT NOT NULL CHECK (amount_cents <> 0),
    memo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_journal_lines_entry_id ON journal_lines (entry_id);
CREATE INDEX idx_journal_lines_ledger_account_id ON journal_lines (ledger_account_id);

-- Maker/Checker transfer approvals.
CREATE TABLE transfer_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by_employee_id UUID REFERENCES employees(id) ON DELETE RESTRICT,
    approved_by_employee_id UUID REFERENCES employees(id) ON DELETE RESTRICT,

    -- Cross-branch: only the source account is guaranteed local on Main.
    from_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
    to_account_number VARCHAR(20) NOT NULL,
    -- Optional resolved UUID in the foreign branch (cannot be a FK here).
    to_account_id UUID,

    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED')),
    rejection_reason TEXT,

    -- For tracing distributed operations (2PC + audit)
    execution_tx_id VARCHAR(255),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_transfer_requests_status_created_at
ON transfer_requests (status, created_at);

CREATE OR REPLACE FUNCTION check_balance(acc_id UUID)
RETURNS TABLE (balance DECIMAL(15, 2)) AS $$
BEGIN
    RETURN QUERY SELECT a.balance FROM accounts a WHERE a.id = acc_id;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- FDW: Main (branch_a_db) -> Sub (branch_b_db) over Docker network
-- Foreign tables live in schema fdw_sub to mirror public.* without name clashes.
-- Example (UUID in app layer; account_number for UI / reporting):
--   SELECT id FROM fdw_sub.accounts WHERE account_number = $1;
-- ---------------------------------------------------------------------------

DO $main_fdw$
BEGIN
  IF current_database() IS DISTINCT FROM 'branch_a_db' THEN
    RETURN;
  END IF;

  CREATE SCHEMA IF NOT EXISTS fdw_sub;

  CREATE SERVER IF NOT EXISTS sub_branch
    FOREIGN DATA WRAPPER postgres_fdw
    OPTIONS (
      host 'branch_b_db',
      port '5432',
      dbname 'branch_b_db',
      fetch_size '5000',
      use_remote_estimate 'true'
    );

  CREATE USER MAPPING IF NOT EXISTS FOR CURRENT_USER SERVER sub_branch
    OPTIONS (user 'admin_b', password 'secure_password_b');

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.foreign_tables
    WHERE foreign_table_schema = 'fdw_sub'
      AND foreign_table_name = 'accounts'
  ) THEN
    EXECUTE $imp$
      IMPORT FOREIGN SCHEMA public
      LIMIT TO (branches, users, employees, accounts, transactions, external_transfers)
      FROM SERVER sub_branch
      INTO fdw_sub
    $imp$;
  END IF;
END
$main_fdw$;
