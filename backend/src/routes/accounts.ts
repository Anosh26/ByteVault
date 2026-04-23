import express from 'express';
import { z } from 'zod';
import { poolA } from '../db.ts';
import { requireEmployeeAuth, requireEmployeeRole } from '../middleware/auth.ts';
import { asyncHandler, parseOrThrow } from '../utils/http.ts';

export const accountsRouter = express.Router();

const createAccountSchema = z.object({
  userId: z.string().uuid(),
  branchId: z.string().uuid(),
  accountNumber: z.string().min(3).max(20),
  initialBalance: z.number().nonnegative().optional().default(0),
});

accountsRouter.post(
  '/',
  requireEmployeeAuth,
  requireEmployeeRole('MAKER', 'MANAGER', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(createAccountSchema, req.body);

    const q = await poolA().query(
      `INSERT INTO accounts (user_id, branch_id, account_number, balance, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')
       RETURNING id, user_id, branch_id, account_number, balance, status, created_at`,
      [body.userId, body.branchId, body.accountNumber, body.initialBalance],
    );
    res.status(201).json({ account: q.rows[0] });
  }),
);

accountsRouter.get(
  '/',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
    const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);
    const q = await poolA().query(
      `SELECT a.id, a.user_id, a.branch_id, a.account_number, a.balance, a.status, a.created_at, a.updated_at, u.kyc_status
       FROM accounts a
       JOIN users u ON a.user_id = u.id
       ORDER BY a.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    res.json({ accounts: q.rows, page: { limit, offset } });
  }),
);

accountsRouter.get(
  '/by-number/:accountNumber',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    const accountNumber = req.params.accountNumber;
    const q = await poolA().query(
      `SELECT id, user_id, branch_id, account_number, balance, status, created_at, updated_at
       FROM accounts
       WHERE account_number = $1`,
      [accountNumber],
    );
    if (q.rows.length === 0) return res.status(404).json({ error: 'Account not found' });
    res.json({ account: q.rows[0] });
  }),
);

accountsRouter.get(
  '/:id',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const q = await poolA().query(
      `SELECT a.id, a.user_id, a.branch_id, a.account_number, a.balance, a.status, a.created_at, a.updated_at, u.kyc_status
       FROM accounts a
       JOIN users u ON a.user_id = u.id
       WHERE a.id = $1`,
      [id],
    );
    if (q.rows.length === 0) return res.status(404).json({ error: 'Account not found' });
    res.json({ account: q.rows[0] });
  }),
);

