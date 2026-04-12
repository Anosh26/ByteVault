-- Run once against Sub (branch_b_db) after Main is up, e.g.:
--   docker exec -i bytevault_branch_b psql -U admin_b -d branch_b_db < docker/sub-fdw-to-main.sql
--
-- Mirrors Main as foreign in schema fdw_main (optional counterpart to Main -> fdw_sub).

CREATE SCHEMA IF NOT EXISTS fdw_main;

CREATE SERVER IF NOT EXISTS main_branch
  FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (
    host 'branch_a_db',
    port '5432',
    dbname 'branch_a_db',
    fetch_size '5000',
    use_remote_estimate 'true'
  );

CREATE USER MAPPING IF NOT EXISTS FOR CURRENT_USER SERVER main_branch
  OPTIONS (user 'admin_a', password 'secure_password_a');

IMPORT FOREIGN SCHEMA public
  LIMIT TO (branches, users, employees, accounts, transactions, external_transfers)
  FROM SERVER main_branch
  INTO fdw_main;
