import express from 'express';
import { poolA } from '../db.ts';
import { requireEmployeeAuth, requireEmployeeRole } from '../middleware/auth.ts';
import { asyncHandler } from '../utils/http.ts';
import { AuditService } from '../services/AuditService.ts';
import {
  ensureInternalLedgerAccount,
  ensureCustomerLedgerAccount,
  postJournalEntry,
} from '../ledger/ledger.ts';

export const jobsRouter = express.Router();

jobsRouter.post(
  '/eod-trigger',
  requireEmployeeAuth,
  requireEmployeeRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const emp = req.employee!;
    const today = new Date().toISOString().split('T')[0];
    const client = await poolA().connect();

    try {
      await client.query('BEGIN');

      await client.query('REFRESH MATERIALIZED VIEW CONCURRENTLY ledger_daily_balances');

      const clearingCheck = await client.query(`
        SELECT COALESCE(SUM(net), 0)::bigint AS net_cents
        FROM (
          SELECT SUM(jl.amount_cents) AS net
          FROM journal_lines jl
          JOIN ledger_accounts la ON la.id = jl.ledger_account_id
          WHERE la.code = 'CLEARING_INTERBRANCH'
          UNION ALL
          SELECT SUM(fjl.amount_cents) AS net
          FROM fdw_sub.journal_lines fjl
          JOIN fdw_sub.ledger_accounts fla ON fla.id = fjl.ledger_account_id
          WHERE fla.code = 'CLEARING_INTERBRANCH'
        ) combined
      `);
      const clearingNet = Number(clearingCheck.rows[0].net_cents);

      if (Math.abs(clearingNet) > 0) {
        await client.query('ROLLBACK');
        await AuditService.log({
          actorId: emp.id,
          action: 'EOD_CLEARING_DRIFT_CRITICAL',
          entityType: 'eod_report',
          entityId: null,
          meta: { clearingNetCents: clearingNet, date: today },
        });
        return res.status(409).json({
          error: 'CLEARING_INTERBRANCH drift detected. EOD aborted.',
          clearingNetCents: clearingNet,
        });
      }

      const suspenseAccounts = await client.query(`
        SELECT a.id, a.account_number, a.status, a.balance
        FROM accounts a
        WHERE a.status IN ('FROZEN', 'CLOSED')
        ORDER BY a.status
      `);

      await client.query(
        `INSERT INTO eod_reports (report_date, type, payload)
         VALUES ($1, 'SUSPENSE', $2)`,
        [today, JSON.stringify({ accounts: suspenseAccounts.rows, generatedAt: new Date().toISOString() })],
      );

      const reconData = await client.query(`
        SELECT la.code, la.name, COALESCE(SUM(jl.amount_cents), 0)::bigint AS net_cents
        FROM ledger_accounts la
        LEFT JOIN journal_lines jl ON jl.ledger_account_id = la.id
        WHERE la.type = 'INTERNAL'
        GROUP BY la.id, la.code, la.name
      `);

      await client.query(
        `INSERT INTO eod_reports (report_date, type, payload)
         VALUES ($1, 'RECONCILIATION', $2)`,
        [today, JSON.stringify({ accounts: reconData.rows, generatedAt: new Date().toISOString() })],
      );

      const activeAccounts = await client.query(`
        SELECT a.id, a.balance
        FROM accounts a
        WHERE a.status = 'ACTIVE'
          AND ROUND(a.balance::numeric, 2) > 0
      `);

      const insertValues: string[] = [];
      const insertParams: any[] = [];
      let paramIndex = 1;

      for (const acct of activeAccounts.rows) {
        const balanceCents = Math.round(Number(acct.balance) * 100);
        const dailyInterestCents = Math.floor((balanceCents * 4) / 36500);

        if (dailyInterestCents > 0) {
          insertValues.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 'PENDING')`);
          insertParams.push(acct.id, today, dailyInterestCents);
        }
      }

      let accrualCount = 0;
      if (insertValues.length > 0) {
        await client.query(
          `INSERT INTO interest_accruals (account_id, accrual_date, amount_cents, status)
           VALUES ${insertValues.join(', ')}
           ON CONFLICT (account_id, accrual_date) DO NOTHING`,
          insertParams
        );
        accrualCount = insertValues.length;
      }

      await client.query('COMMIT');

      await AuditService.log({
        actorId: emp.id,
        action: 'EOD_COMPLETED',
        entityType: 'eod_report',
        entityId: null,
        meta: { date: today, accrualCount, clearingNetCents: clearingNet, suspenseAccountCount: suspenseAccounts.rows.length },
      });

      return res.json({ ok: true, date: today, accrualCount, clearingNetCents: clearingNet });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }),
);

jobsRouter.post(
  '/eom-trigger',
  requireEmployeeAuth,
  requireEmployeeRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const emp = req.employee!;
    const client = await poolA().connect();

    try {
      await client.query('BEGIN');

      const pendingAccruals = await client.query(`
        WITH locked_accruals AS (
          SELECT id, account_id, amount_cents
          FROM interest_accruals
          WHERE status = 'PENDING'
          FOR UPDATE
        )
        SELECT account_id, SUM(amount_cents)::bigint AS total_cents, array_agg(id) AS accrual_ids
        FROM locked_accruals
        GROUP BY account_id
      `);

      if (pendingAccruals.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.json({ ok: true, message: 'No pending accruals to post.', postedCount: 0 });
      }

      const interestExpense = await ensureInternalLedgerAccount({
        client,
        code: 'INTEREST_EXPENSE',
        name: 'Interest Expense',
      });

      let postedCount = 0;
      for (const row of pendingAccruals.rows) {
        const totalCents = Number(row.total_cents);
        const customerLedger = await ensureCustomerLedgerAccount({ client, accountId: row.account_id });

        await postJournalEntry({
          client,
          input: {
            kind: 'INTEREST_PAYMENT',
            description: `Monthly interest posting for account ${row.account_id}`,
            externalRef: `EOM_INTEREST:${row.account_id}:${new Date().toISOString().slice(0, 7)}`,
            createdByEmployeeId: emp.id,
            lines: [
              { ledgerAccountId: interestExpense.ledgerAccountId, amountCents: totalCents, memo: 'Interest expense debit' },
              { ledgerAccountId: customerLedger.ledgerAccountId, amountCents: -totalCents, memo: 'Interest credit to customer' },
            ],
          },
        });

        await client.query(
          `UPDATE accounts
           SET balance = balance + ($1::numeric / 100),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [totalCents, row.account_id],
        );

        await client.query(
          `UPDATE interest_accruals SET status = 'POSTED' WHERE id = ANY($1::uuid[])`,
          [row.accrual_ids],
        );

        postedCount++;
      }

      await client.query('COMMIT');

      await AuditService.log({
        actorId: emp.id,
        action: 'EOM_INTEREST_POSTED',
        entityType: 'interest_accruals',
        entityId: null,
        meta: { postedCount, month: new Date().toISOString().slice(0, 7) },
      });

      return res.json({ ok: true, postedCount });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }),
);
