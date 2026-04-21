ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS reversal_of_entry_id UUID REFERENCES journal_entries(id) ON DELETE RESTRICT;
ALTER TABLE journal_entries ADD CONSTRAINT uq_reversal UNIQUE (reversal_of_entry_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS ledger_daily_balances AS
SELECT 
    ledger_account_id,
    DATE(created_at) as balance_date,
    SUM(amount_cents) as daily_net_cents
FROM journal_lines
GROUP BY ledger_account_id, DATE(created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_daily_balances ON ledger_daily_balances(ledger_account_id, balance_date);
