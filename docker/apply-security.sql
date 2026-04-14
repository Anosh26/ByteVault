-- Apply Security + approvals tables to an existing database volume.
-- Run per database (branch_a_db and branch_b_db).

CREATE TABLE IF NOT EXISTS employee_credentials (
    employee_id UUID PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'idx_idempotency_polling'
  ) THEN
    EXECUTE 'CREATE INDEX idx_idempotency_polling ON idempotency_keys (status, created_at) WHERE status = ''IN_PROGRESS''';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS transfer_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by_employee_id UUID REFERENCES employees(id) ON DELETE RESTRICT,
    approved_by_employee_id UUID REFERENCES employees(id) ON DELETE RESTRICT,

    source_branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
    target_branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
    from_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
    to_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,

    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED')),
    rejection_reason TEXT,

    execution_tx_id VARCHAR(255),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'idx_transfer_requests_status_created_at'
  ) THEN
    EXECUTE 'CREATE INDEX idx_transfer_requests_status_created_at ON transfer_requests (status, created_at)';
  END IF;
END $$;

