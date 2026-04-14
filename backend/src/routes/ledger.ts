import express from 'express';
import { requireEmployeeAuth, requireEmployeeRole } from '../middleware/auth.ts';
import { asyncHandler, parseOrThrow } from '../utils/http.ts';
import { poolA } from '../db.ts';
import { postEntrySchema, postJournalEntry } from '../ledger/ledger.ts';

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

