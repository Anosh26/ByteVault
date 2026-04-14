import type { Request, Response } from 'express';
import express from 'express';
import { poolA, poolB } from '../db.ts';
import { requireEmployeeAuth, requireEmployeeRole } from '../middleware/auth.ts';
import { requireIdempotencyKey } from '../middleware/idempotency.ts';
import { execute2pcTransfer } from '../controllers/transaction.controller.ts';

type ResolveResult = { accountId: string; branch: 'MAIN' | 'SUB' };

async function resolveAccountByNumber(accountNumber: string): Promise<ResolveResult | null> {
  const local = await poolA().query('SELECT id FROM accounts WHERE account_number = $1', [accountNumber]);
  if (local.rows.length > 0) return { accountId: local.rows[0].id as string, branch: 'MAIN' };

  // Main DB imports Sub as fdw_sub.* (must exist for cross-branch resolution).
  const foreign = await poolA().query('SELECT id FROM fdw_sub.accounts WHERE account_number = $1', [
    accountNumber,
  ]);
  if (foreign.rows.length > 0) return { accountId: foreign.rows[0].id as string, branch: 'SUB' };

  return null;
}

export const transfersRouter = express.Router();

// Maker creates a transfer request using account numbers (UI-friendly).
transfersRouter.post(
  '/requests',
  requireEmployeeAuth,
  requireEmployeeRole('MAKER', 'MANAGER', 'ADMIN'),
  requireIdempotencyKey({ routeTag: 'POST /api/transfers/requests' }),
  async (req: Request, res: Response) => {
    const emp = req.employee!;
    const { fromAccountNumber, toAccountNumber, amount } = req.body as {
      fromAccountNumber?: string;
      toAccountNumber?: string;
      amount?: number;
    };

    if (!fromAccountNumber || !toAccountNumber || !amount || amount <= 0) {
      return res.status(400).json({ error: 'fromAccountNumber, toAccountNumber, amount required' });
    }

    const from = await resolveAccountByNumber(fromAccountNumber);
    const to = await resolveAccountByNumber(toAccountNumber);
    if (!from) return res.status(404).json({ error: 'from account not found' });
    if (!to) return res.status(404).json({ error: 'to account not found' });

    if (from.branch !== 'MAIN') {
      return res.status(400).json({ error: 'from account must belong to MAIN branch for settlement' });
    }
    if (to.branch !== 'SUB') {
      return res.status(400).json({ error: 'to account must belong to SUB branch for settlement' });
    }

    const insert = await poolA().query(
      `INSERT INTO transfer_requests (
         created_by_employee_id,
         from_account_id, to_account_number, to_account_id,
         amount, status
       ) VALUES ($1, $2, $3, $4, $5, 'PENDING')
       RETURNING id, status, created_at`,
      [emp.id, from.accountId, toAccountNumber, to.accountId, amount],
    );

    return res.status(201).json({ request: insert.rows[0] });
  },
);

// Checker approves and executes the transfer (2PC).
transfersRouter.post(
  '/requests/:id/approve',
  requireEmployeeAuth,
  requireEmployeeRole('CHECKER', 'MANAGER', 'ADMIN'),
  requireIdempotencyKey({ routeTag: 'POST /api/transfers/requests/:id/approve' }),
  async (req: Request, res: Response) => {
    const emp = req.employee!;
    const id = req.params.id;

    const client = await poolA().connect();
    try {
      await client.query('BEGIN');

      const q = await client.query(
        `SELECT id, from_account_id, to_account_number, to_account_id, amount, status
         FROM transfer_requests
         WHERE id = $1
         FOR UPDATE`,
        [id],
      );
      if (q.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Transfer request not found' });
      }

      const row = q.rows[0] as {
        id: string;
        from_account_id: string;
        to_account_number: string;
        to_account_id: string | null;
        amount: string;
        status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'FAILED';
      };

      if (row.status !== 'PENDING') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `Request not pending (status=${row.status})` });
      }

      await client.query(
        `UPDATE transfer_requests
         SET status='APPROVED', approved_by_employee_id=$1, updated_at=CURRENT_TIMESTAMP
         WHERE id=$2`,
        [emp.id, row.id],
      );
      await client.query('COMMIT');

      const toResolved =
        row.to_account_id ??
        (await (async () => {
          const r = await resolveAccountByNumber(row.to_account_number);
          if (!r || r.branch !== 'SUB') throw new Error('to account not found in SUB at approval time');
          return r.accountId;
        })());

      // Execute transfer outside the row lock (2PC itself will lock accounts).
      const exec = await execute2pcTransfer({
        fromAccountId: row.from_account_id,
        toAccountId: toResolved,
        amount: Number(row.amount),
      });

      await poolA().query(
        `UPDATE transfer_requests
         SET status='EXECUTED', execution_tx_id=$1, updated_at=CURRENT_TIMESTAMP
         WHERE id=$2`,
        [exec.transactionId, row.id],
      );

      return res.json({ ok: true, transactionId: exec.transactionId });
    } catch (e) {
      try {
        await poolA().query(
          `UPDATE transfer_requests
           SET status='FAILED', updated_at=CURRENT_TIMESTAMP
           WHERE id=$1 AND status IN ('PENDING','APPROVED')`,
          [req.params.id],
        );
      } catch {}

      try {
        await (async () => {
          /* noop */
        })();
      } finally {
        // fallthrough
      }

      return res.status(500).json({ error: 'Approval/execute failed', details: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      client.release();
    }
  },
);

// Checker rejects.
transfersRouter.post(
  '/requests/:id/reject',
  requireEmployeeAuth,
  requireEmployeeRole('CHECKER', 'MANAGER', 'ADMIN'),
  requireIdempotencyKey({ routeTag: 'POST /api/transfers/requests/:id/reject' }),
  async (req: Request, res: Response) => {
    const emp = req.employee!;
    const id = req.params.id;
    const { reason } = req.body as { reason?: string };

    const q = await poolA().query(
      `UPDATE transfer_requests
       SET status='REJECTED',
           approved_by_employee_id=$1,
           rejection_reason=$2,
           updated_at=CURRENT_TIMESTAMP
       WHERE id=$3 AND status='PENDING'
       RETURNING id, status`,
      [emp.id, reason ?? null, id],
    );

    if (q.rows.length === 0) return res.status(404).json({ error: 'Transfer request not found or not pending' });
    return res.json({ request: q.rows[0] });
  },
);

// List requests (simple).
transfersRouter.get(
  '/requests',
  requireEmployeeAuth,
  async (_req: Request, res: Response) => {
    const q = await poolA().query(
      `SELECT id, status, amount, created_at, updated_at, created_by_employee_id, approved_by_employee_id, execution_tx_id
       FROM transfer_requests
       ORDER BY created_at DESC
       LIMIT 50`,
    );
    return res.json({ requests: q.rows });
  },
);

