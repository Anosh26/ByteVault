import express from 'express';
import { requireEmployeeAuth, requireEmployeeRole } from '../middleware/auth.ts';
import { asyncHandler, parseOrThrow } from '../utils/http.ts';
import { poolA } from '../db.ts';
import {
  ensureCustomerLedgerAccount,
  getLedgerBalanceCents,
  getAvailableCustomerBalanceCents,
  ensureInternalLedgerAccount,
  postJournalEntry,
  postEntrySchema,
} from '../ledger/ledger.ts';

export const ledgerRouter = express.Router();

// Admin-only for now: post a balanced journal entry.
ledgerRouter.post(
  '/entries',
  requireEmployeeAuth,
  requireEmployeeRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const emp = req.employee!;
    const body = parseOrThrow(postEntrySchema, req.body);
    const client = await poolA().connect();
    try {
      await client.query('BEGIN');
      const result = await postJournalEntry({
        client,
        input: { ...body, createdByEmployeeId: body.createdByEmployeeId ?? emp.id },
      });
      await client.query('COMMIT');
      res.status(201).json(result);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }),
);

ledgerRouter.get(
  '/entries/:id',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const entry = await poolA().query(`SELECT * FROM journal_entries WHERE id=$1`, [id]);
    if (entry.rows.length === 0) return res.status(404).json({ error: 'Entry not found' });
    const lines = await poolA().query(
      `SELECT jl.*, la.type, la.ref_account_id
       FROM journal_lines jl
       JOIN ledger_accounts la ON la.id = jl.ledger_account_id
       WHERE jl.entry_id=$1
       ORDER BY jl.created_at ASC`,
      [id],
    );
    res.json({ entry: entry.rows[0], lines: lines.rows });
  }),
);

// Balance from ledger for a banking account (Main DB only; Sub balances are visible via FDW when needed).
ledgerRouter.get(
  '/customer-accounts/:bankAccountId/balance',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    const bankAccountId = req.params.bankAccountId;
    const client = await poolA().connect();
    try {
      await client.query('BEGIN');
      const avail = await getAvailableCustomerBalanceCents({ client, accountId: bankAccountId });
      const cached = await client.query(`SELECT balance, account_number FROM accounts WHERE id=$1`, [bankAccountId]);
      await client.query('COMMIT');

      if (cached.rows.length === 0) return res.status(404).json({ error: 'Account not found' });

      const cachedCents = Math.round(Number(cached.rows[0].balance) * 100);
      const deltaCents = avail.balanceCents - cachedCents;
      return res.json({
        account: { id: bankAccountId, accountNumber: cached.rows[0].account_number },
        ledger: { ledgerAccountId: avail.ledgerAccountId, balanceCents: avail.balanceCents },
        holds: { heldCents: avail.heldCents, availableCents: avail.availableCents },
        cached: { balanceCents: cachedCents },
        deltaCents,
      });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }),
);

// Admin: force ledger balance to match cached account.balance by posting a balanced adjustment.
ledgerRouter.post(
  '/customer-accounts/:bankAccountId/sync-to-cached',
  requireEmployeeAuth,
  requireEmployeeRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const bankAccountId = req.params.bankAccountId;
    const client = await poolA().connect();
    try {
      await client.query('BEGIN');
      const ledgerAcc = await ensureCustomerLedgerAccount({ client, accountId: bankAccountId });
      const bal = await getLedgerBalanceCents({ client, ledgerAccountId: ledgerAcc.ledgerAccountId });
      const cached = await client.query(`SELECT balance, account_number FROM accounts WHERE id=$1`, [bankAccountId]);
      if (cached.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Account not found' });
      }

      const cachedCents = Math.round(Number(cached.rows[0].balance) * 100);
      const deltaCents = cachedCents - bal.balanceCents;
      if (deltaCents === 0) {
        await client.query('COMMIT');
        return res.json({ ok: true, message: 'Already in sync' });
      }

      const equity = await ensureInternalLedgerAccount({
        client,
        code: 'EQUITY_LEDGER_SYNC',
        name: 'Ledger sync equity',
      });

      const extRef = `SYNC_TO_CACHED:${bankAccountId}:${cachedCents}`;
      await postJournalEntry({
        client,
        input: {
          kind: 'LEDGER_SYNC',
          description: `Sync ledger to cached balance for ${cached.rows[0].account_number}`,
          externalRef: extRef,
          lines: [
            { ledgerAccountId: ledgerAcc.ledgerAccountId, amountCents: deltaCents, memo: 'Sync adjustment' },
            { ledgerAccountId: equity.ledgerAccountId, amountCents: -deltaCents, memo: 'Offset' },
          ],
        },
      });

      await client.query('COMMIT');
      return res.json({ ok: true, deltaCentsApplied: deltaCents, externalRef: extRef });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }),
);

