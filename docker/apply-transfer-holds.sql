-- Incremental migration: add hold_id to transfer_requests.
-- Safe to run multiple times.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'transfer_requests'
        AND column_name = 'hold_id'
    ) THEN
        ALTER TABLE transfer_requests
        ADD COLUMN hold_id UUID REFERENCES account_holds(id) ON DELETE SET NULL;
    END IF;
END $$;
