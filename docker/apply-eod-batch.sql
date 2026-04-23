-- Incremental migration: EOD/EOM batch processing tables
-- Run only on branch_a_db (MAIN). Sub-branch does not need these.

CREATE TABLE IF NOT EXISTS interest_accruals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    accrual_date DATE NOT NULL,
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    status VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'POSTED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_interest_accruals_account_date
    ON interest_accruals (account_id, accrual_date);

CREATE TABLE IF NOT EXISTS eod_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date DATE NOT NULL,
    type VARCHAR(30) NOT NULL CHECK (type IN ('RECONCILIATION', 'SUSPENSE')),
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
