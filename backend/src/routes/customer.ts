import express from 'express';
import { z } from 'zod';
import { poolA } from '../db.ts';
import { verifyPassword } from '../utils/password.ts';
import { signCustomerToken } from '../auth/jwt.ts';
import { requireCustomerAuth } from '../middleware/auth.ts';
import { requireIdempotencyKey } from '../middleware/idempotency.ts';
import { asyncHandler, parseOrThrow } from '../utils/http.ts';
import { AuditService } from '../services/AuditService.ts';

export const customerRouter = express.Router();

// A. POST /api/customer/auth/login
customerRouter.post('/auth/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const q = await poolA().query(
    `SELECT id, email, password_hash, kyc_status, full_name
     FROM users
     WHERE email = $1`,
    [email],
  );
  if (q.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

  const row = q.rows[0];
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signCustomerToken({
    sub: row.id,
    email: row.email,
    role: 'CUSTOMER',
    kycStatus: row.kyc_status,
  });

  return res.json({
    accessToken: token,
    tokenType: 'Bearer',
    user: { id: row.id, email: row.email, kycStatus: row.kyc_status, fullName: row.full_name },
  });
}));

// B. GET /api/customer/dashboard
customerRouter.get('/dashboard', requireCustomerAuth, asyncHandler(async (req, res) => {
  const user = req.user!;
  const client = await poolA().connect();

  try {
    // 1. Fetch active accounts
    const accountsRes = await client.query(
      `SELECT a.id, a.account_number, a.balance, a.status,
              (a.balance * 100)::bigint AS ledger_balance_cents,
              COALESCE(SUM(h.amount_cents), 0)::bigint AS hold_cents
       FROM accounts a
       LEFT JOIN account_holds h ON h.account_id = a.id AND h.status = 'ACTIVE'
       WHERE a.user_id = $1 AND a.status = 'ACTIVE'
       GROUP BY a.id, a.account_number, a.balance, a.status`,
      [user.id]
    );

    const accounts = accountsRes.rows.map(acc => {
      const availableCents = Number(acc.ledger_balance_cents) - Number(acc.hold_cents);
      return {
        ...acc,
        available_balance_cents: availableCents,
        available_balance: availableCents / 100,
      };
    });

    // 2. Fetch transaction history
    const historyRes = await client.query(
      `SELECT je.id, je.kind, je.description, je.created_at, jl.amount_cents 
       FROM journal_entries je
       JOIN journal_lines jl ON je.id = jl.entry_id
       JOIN ledger_accounts la ON jl.ledger_account_id = la.id
       WHERE la.ref_account_id IN (SELECT id FROM accounts WHERE user_id = $1)
       ORDER BY je.created_at DESC LIMIT 10`,
      [user.id]
    );

    // 3. Fetch user details (full name)
    const userRes = await client.query(`SELECT full_name FROM users WHERE id = $1`, [user.id]);
    
    // 4. Fetch pending transfers (The Pipeline)
    const pendingRes = await client.query(
      `SELECT id, to_account_number, amount, status, created_at
       FROM transfer_requests
       WHERE created_by_user_id = $1 AND status = 'PENDING'
       ORDER BY created_at DESC`,
      [user.id]
    );

    res.json({ 
      accounts, 
      recentTransactions: historyRes.rows, 
      kycStatus: user.kycStatus,
      fullName: userRes.rows[0]?.full_name,
      pendingTransfers: pendingRes.rows 
    });
  } finally {
    client.release();
  }
}));

// C. POST /api/customer/transfer
const transferSchema = z.object({
  fromAccountId: z.string().uuid(),
  toAccountNumber: z.string().min(5),
  amountCents: z.number().int().positive(),
});

customerRouter.post(
  '/transfer',
  requireCustomerAuth,
  requireIdempotencyKey({ actorType: 'USER' }),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    if (user.kycStatus !== 'VERIFIED') {
      return res.status(403).json({ error: 'KYC Verification Required to transfer funds.' });
    }

    const { fromAccountId, toAccountNumber, amountCents } = parseOrThrow(transferSchema, req.body);

    const client = await poolA().connect();
    try {
      await client.query('BEGIN');

      // Verify account belongs to user
      const accRes = await client.query(
        `SELECT id, (balance * 100)::bigint AS ledger_balance_cents
         FROM accounts
         WHERE id = $1 AND user_id = $2 AND status = 'ACTIVE'
         FOR UPDATE`,
        [fromAccountId, user.id]
      );

      if (accRes.rows.length === 0) {
        throw new Error('Source account not found or invalid');
      }

      const account = accRes.rows[0];

      // Calculate available balance
      const holdsRes = await client.query(
        `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS active_holds
         FROM account_holds
         WHERE account_id = $1 AND status = 'ACTIVE'`,
        [fromAccountId]
      );
      const activeHolds = Number(holdsRes.rows[0].active_holds);
      const availableCents = Number(account.ledger_balance_cents) - activeHolds;

      if (availableCents < amountCents) {
        throw new Error('Insufficient available balance');
      }

      // Insert account hold
      const holdRes = await client.query(
        `INSERT INTO account_holds (account_id, amount_cents, reason, status)
         VALUES ($1, $2, 'Pending Customer Transfer', 'ACTIVE')
         RETURNING id`,
        [fromAccountId, amountCents]
      );
      const holdId = holdRes.rows[0].id;

      // Insert transfer request
      const reqRes = await client.query(
        `INSERT INTO transfer_requests (
           created_by_user_id, from_account_id, to_account_number, hold_id, amount, status
         ) VALUES ($1, $2, $3, $4, $5, 'PENDING')
         RETURNING id`,
        [user.id, fromAccountId, toAccountNumber, holdId, amountCents / 100]
      );

      await client.query('COMMIT');

      await AuditService.log({
        actorId: user.id,
        action: 'CUSTOMER_TRANSFER_INITIATED',
        entityType: 'transfer_request',
        entityId: reqRes.rows[0].id,
        meta: { amountCents, toAccountNumber },
      });

      return res.json({ ok: true, transferRequestId: reqRes.rows[0].id });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  })
);
