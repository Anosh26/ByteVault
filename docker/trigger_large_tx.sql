CREATE OR REPLACE FUNCTION fn_flag_large_transactions()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.amount >= 500000 THEN
        -- Log high-risk activity to audit trail
        INSERT INTO audit_logs (actor_type, actor_id, action, entity_type, entity_id, meta)
        VALUES (
            'EMPLOYEE', 
            '00000000-0000-0000-0000-000000000000'::UUID, -- System Actor
            'HIGH_VALUE_ALERT', 
            'TRANSACTION', 
            NULL, 
            jsonb_build_object('amount', NEW.amount, 'account_id', NEW.account_id, 'alert', 'Large transaction detected (5L+)')
        );

        -- If someone tries to force it to COMPLETED directly, block it.
        IF NEW.status = 'COMPLETED' THEN
            RAISE EXCEPTION 'Transaction amount % exceeds threshold (500,000). High-value transactions must be processed via Maker-Checker workflow.', NEW.amount;
        END IF;

        -- Automatically change status to FLAGGED if it was PENDING
        IF NEW.status = 'PENDING' THEN
            NEW.status := 'FLAGGED';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_large_transaction_guard ON transactions;
CREATE TRIGGER trg_large_transaction_guard
BEFORE INSERT OR UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION fn_flag_large_transactions();
