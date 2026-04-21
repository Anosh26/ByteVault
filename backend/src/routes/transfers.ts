import type { Request, Response } from 'express';
import express from 'express';
import { poolA } from '../db.ts';
import { requireEmployeeAuth, requireEmployeeRole } from '../middleware/auth.ts';
import { requireIdempotencyKey } from '../middleware/idempotency.ts';
import { execute2pcTransfer } from '../controllers/transaction.controller.ts';
import { getAvailableCustomerBalanceCents } from '../ledger/ledger.ts';

type ResolveResult = { accountId: string; branch: 'MAIN' | 'SUB' };

async function resolveAccountByNumber(accountNumber: string): Promise<ResolveResult | null> {
  const local = await poolA().query('SELECT id FROM accounts WHERE account_number = $1', [accountNumber]);
  if (local.rows.length > 0) return { accountId: local.rows[0].id as string, branch: 'MAIN' };

  const foreign = await poolA().query('SELECT id FROM fdw_sub.accounts WHERE account_number = $1', [
    accountNumber,
  ]);
  if (foreign.rows.length > 0) return { accountId: foreign.rows[0].id as string, branch: 'SUB' };

  return null;
}

export const transfersRouter = express.Router();

async function audit(params: {
  actorEmployeeId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  meta?: unknown;
}) {
  const { actorEmployeeId, action, entityType, entityId, meta } = params;
  await poolA().query(
    `INSERT INTO audit_logs (actor_type, actor_id, action, entity_type, entity_id, meta)
     VALUES ('EMPLOYEE', $1, $2, $3, $4, $5)`,
    [actorEmployeeId, action, entityType, entityId ?? null, meta ?? null],
  );
}

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
      amount?: string;
    };

    if (!fromAccountNumber || !toAccountNumber || !amount || !/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Valid fromAccountNumber, toAccountNumber, amount (string) required' });
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

    const amountCents = Math.round(Number(amount) * 100);
    const client = await poolA().connect();
    let insertId, insertStatus, insertCreatedAt;
    try {
      await client.query('BEGIN');
      await client.query('SELECT 1 FROM accounts WHERE id = $1 FOR UPDATE', [from.accountId]);
      const available = await getAvailableCustomerBalanceCents({ client, accountId: from.accountId });
      if (available.availableCents < amountCents) {
        throw new Error('Insufficient funds');
      }

      const holdRes = await client.query(
        `INSERT INTO account_holds (account_id, amount_cents, reason, status)
         VALUES ($1, $2, 'Transfer Request', 'ACTIVE') RETURNING id`,
        [from.accountId, amountCents]
      );

      const insertRes = await client.query(
        `INSERT INTO transfer_requests (
           created_by_employee_id,
           from_account_id, to_account_number, to_account_id,
           amount, hold_id, status
         ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
         RETURNING id, status, created_at`,
        [emp.id, from.accountId, toAccountNumber, to.accountId, amount, holdRes.rows[0].id],
      );
      
      insertId = insertRes.rows[0].id;
      insertStatus = insertRes.rows[0].status;
      insertCreatedAt = insertRes.rows[0].created_at;
      await client.query('COMMIT');
    } catch (e: any) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: e.message || 'Transfer request failed' });
    } finally {
      client.release();
    }

    await audit({
      actorEmployeeId: emp.id,
      action: 'TRANSFER_REQUEST_CREATED',
      entityType: 'transfer_request',
      entityId: insertId,
      meta: { fromAccountNumber, toAccountNumber, amount },
    });

    return res.status(201).json({ request: { id: insertId, status: insertStatus, created_at: insertCreatedAt } });
  },
);

transfersRouter.post(
  '/requests/:id/approve',
  requireEmployeeAuth,
  requireEmployeeRole('CHECKER', 'MANAGER', 'ADMIN'),
  requireIdempotencyKey({ routeTag: 'POST /api/transfers/requests/:id/approve' }),
  async (req: Request, res: Response) => {
    const emp = req.employee!;
    const id = String(req.params.id);

    const client = await poolA().connect();
    let isReleased = false;
    try {
      await client.query('BEGIN');

      const q = await client.query(
        `SELECT id, from_account_id, to_account_number, to_account_id, amount, hold_id, status
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
        hold_id: string | null;
        status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'FAILED';
      };

      if (row.status !== 'PENDING') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `Request not pending (status=${row.status})` });
      }

      const toResolved =
        row.to_account_id ??
        (await (async () => {
          const r = await resolveAccountByNumber(row.to_account_number);
          if (!r || r.branch !== 'SUB') throw new Error('to account not found in SUB at approval time');
          return r.accountId;
        })());

      await client.query(
        `UPDATE transfer_requests
         SET status='APPROVED', approved_by_employee_id=$1, updated_at=CURRENT_TIMESTAMP
         WHERE id=$2`,
        [emp.id, row.id],
      );

      await client.query('COMMIT');
      client.release();
      isReleased = true;

      const exec = await execute2pcTransfer({
        fromAccountId: row.from_account_id,
        toAccountId: toResolved,
        amount: Number(row.amount),
        holdId: row.hold_id ?? undefined,
      });

      await poolA().query(
        `UPDATE transfer_requests
         SET status='EXECUTED', approved_by_employee_id=$1, execution_tx_id=$2, updated_at=CURRENT_TIMESTAMP
         WHERE id=$3`,
        [emp.id, exec.transactionId, row.id],
      );

      await audit({
        actorEmployeeId: emp.id,
        action: 'TRANSFER_REQUEST_APPROVED_EXECUTED',
        entityType: 'transfer_request',
        entityId: row.id,
        meta: { executionTxId: exec.transactionId },
      });

      return res.json({ ok: true, transactionId: exec.transactionId });
    } catch (e) {
      if (!isReleased) await client.query('ROLLBACK').catch(() => {});
      try {
        const failRes = await poolA().query(
          `UPDATE transfer_requests
           SET status='FAILED', updated_at=CURRENT_TIMESTAMP
           WHERE id=$1 AND status IN ('PENDING','APPROVED')
           RETURNING hold_id`,
          [req.params.id],
        );
        
        if (failRes.rows.length > 0 && failRes.rows[0].hold_id) {
          await poolA().query(
            `UPDATE account_holds
             SET status='RELEASED', released_at=CURRENT_TIMESTAMP
             WHERE id=$1 AND status='ACTIVE'`,
            [failRes.rows[0].hold_id]
          );
        }
      } catch {}

      try {
        await audit({
          actorEmployeeId: emp.id,
          action: 'TRANSFER_REQUEST_APPROVE_FAILED',
          entityType: 'transfer_request',
          entityId: id,
          meta: { error: e instanceof Error ? e.message : 'Unknown error' },
        });
      } catch {}

      return res.status(500).json({ error: 'Approval/execute failed', details: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      if (!isReleased) client.release();
    }
  },
);

transfersRouter.post(
  '/requests/:id/reject',
  requireEmployeeAuth,
  requireEmployeeRole('CHECKER', 'MANAGER', 'ADMIN'),
  requireIdempotencyKey({ routeTag: 'POST /api/transfers/requests/:id/reject' }),
  async (req: Request, res: Response) => {
    const emp = req.employee!;
    const id = req.params.id;
    const { reason } = req.body as { reason?: string };

    const client = await poolA().connect();
    let q;
    try {
      await client.query('BEGIN');
      q = await client.query(
        `UPDATE transfer_requests
         SET status='REJECTED',
             approved_by_employee_id=$1,
             rejection_reason=$2,
             updated_at=CURRENT_TIMESTAMP
         WHERE id=$3 AND status='PENDING'
         RETURNING id, status, hold_id`,
        [emp.id, reason ?? null, id],
      );

      if (q.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Transfer request not found or not pending' });
      }

      if (q.rows[0].hold_id) {
        await client.query(
          `UPDATE account_holds SET status = 'RELEASED', released_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'ACTIVE'`,
          [q.rows[0].hold_id]
        );
      }
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    await audit({
      actorEmployeeId: emp.id,
      action: 'TRANSFER_REQUEST_REJECTED',
      entityType: 'transfer_request',
      entityId: q.rows[0].id,
      meta: { reason: reason ?? null },
    });

    return res.json({ request: q.rows[0] });
  },
);

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
