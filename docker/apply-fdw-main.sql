-- Idempotent: apply Main -> Sub FDW on an existing branch_a_db (e.g. after volumes were created before init.sql had FDW).
-- From host: docker compose exec -T branch_a_db psql -U admin_a -d branch_a_db -f - < docker/apply-fdw-main.sql

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

DO $imp$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.foreign_tables
    WHERE foreign_table_schema = 'fdw_sub'
      AND foreign_table_name = 'accounts'
  ) THEN
    RETURN;
  END IF;

  EXECUTE $q$
    IMPORT FOREIGN SCHEMA public
    LIMIT TO (branches, users, employees, accounts, transactions, external_transfers)
    FROM SERVER sub_branch
    INTO fdw_sub
  $q$;
END
$imp$;
