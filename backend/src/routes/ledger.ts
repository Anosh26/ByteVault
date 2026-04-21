import express from 'express';
import { z } from 'zod';
import { requireIdempotencyKey } from '../middleware/idempotency.ts';
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

ledgerRouter.get(
  '/entries',
  requireEmployeeAuth,
  requireEmployeeRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;
    const entries = await poolA().query(
      `SELECT * FROM journal_entries ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json({ entries: entries.rows });
  }),
);

// Balance from ledger for a banking account (Main DB only; Sub balances are visible via FDW when needed).
ledgerRouter.get(
  '/customer-accounts/:bankAccountId/balance',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    const bankAccountId = String(req.params.bankAccountId);
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
    const bankAccountId = String(req.params.bankAccountId);
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

const reverseEntrySchema = z.object({
  reason: z.string().min(1)
});

ledgerRouter.post(
  '/entries/:id/reverse',
  requireEmployeeAuth,
  requireEmployeeRole('ADMIN'),
  requireIdempotencyKey({ routeTag: 'POST /api/ledger/entries/:id/reverse' }),
  asyncHandler(async (req, res) => {
    const originalEntryId = String(req.params.id);
    const body = parseOrThrow(reverseEntrySchema, req.body);
    const client = await poolA().connect();
    try {
      await client.query('BEGIN');
      
      const entryRes = await client.query(`SELECT * FROM journal_entries WHERE id = $1 FOR UPDATE`, [originalEntryId]);
      if (entryRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Entry not found' });
      }
      
      const original = entryRes.rows[0];
      if (original.kind === 'REVERSAL') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Cannot reverse a reversal entry' });
      }

      const linesRes = await client.query(`SELECT * FROM journal_lines WHERE entry_id = $1`, [originalEntryId]);
      
      const reversalLines = linesRes.rows.map(line => ({
        ledgerAccountId: line.ledger_account_id,
        amountCents: -Number(line.amount_cents),
        memo: `Reversal of line ${line.id}`
      }));

      const result = await postJournalEntry({
        client,
        input: {
          kind: 'REVERSAL',
          description: `Reversal: ${body.reason}`,
          externalRef: `REV:${original.external_ref || originalEntryId}`,
          reversalOfEntryId: originalEntryId,
          createdByEmployeeId: req.employee!.id,
          lines: reversalLines
        }
      });
      
      await client.query('COMMIT');
      return res.status(201).json(result);
    } catch (e: any) {
      await client.query('ROLLBACK').catch(() => {});
      if (e.code === '23505' && e.constraint === 'uq_reversal') {
        return res.status(409).json({ error: 'Entry has already been reversed' });
      }
      throw e;
    } finally {
      client.release();
    }
  })
);

ledgerRouter.get(
  '/reconciliation/report',
  requireEmployeeAuth,
  requireEmployeeRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date are required' });
    }

    const report = await poolA().query(`
      SELECT 
        l.code,
        l.name,
        SUM(db.daily_net_cents)::bigint AS net_balance_cents
      FROM ledger_accounts l
      JOIN ledger_daily_balances db ON l.id = db.ledger_account_id
      WHERE l.type = 'INTERNAL'
        AND db.balance_date >= $1 AND db.balance_date <= $2
      GROUP BY l.id, l.code, l.name
    `, [String(start_date), String(end_date)]);

    return res.json({ totals: report.rows });
  })
);

