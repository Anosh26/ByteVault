import express from 'express';
import { z } from 'zod';
import { poolA } from '../db.ts';
import { requireEmployeeAuth, requireEmployeeRole } from '../middleware/auth.ts';
import { asyncHandler, parseOrThrow } from '../utils/http.ts';

export const usersRouter = express.Router();

const createUserSchema = z.object({
  email: z.string().email(),
  phone: z.string().min(3).max(30),
  panCard: z.string().length(10).optional(),
  fullName: z.string().min(2).max(150),
  password: z.string().min(6).optional(),
});

usersRouter.post(
  '/',
  requireEmployeeAuth,
  requireEmployeeRole('MAKER', 'MANAGER', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const { hashPassword } = require('../utils/password.ts');
    const body = parseOrThrow(createUserSchema, req.body);
    const password = body.password || 'securepass'; // Default for demo if not provided
    const hashedPassword = await hashPassword(password);

    const client = await poolA().connect();
    try {
      await client.query('BEGIN');
      
      const userQ = await client.query(
        `INSERT INTO users (email, phone, pan_card, password_hash, full_name, kyc_status)
         VALUES ($1, $2, $3, $4, $5, 'PENDING')
         RETURNING id, email, phone, pan_card, full_name, kyc_status, created_at`,
        [body.email, body.phone, body.panCard || null, hashedPassword, body.fullName],
      );
      const user = userQ.rows[0];

      // Automatically create a default savings account
      const account_number = Math.floor(10000 + Math.random() * 90000).toString();
      await client.query(
        `INSERT INTO accounts (user_id, branch_id, account_number, balance, status)
         VALUES ($1, (SELECT id FROM branches WHERE name = 'MAIN' LIMIT 1), $2, 0, 'ACTIVE')`,
        [user.id, account_number]
      );

      await client.query('COMMIT');
      res.status(201).json({ user, initialAccount: account_number });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

usersRouter.get(
  '/',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
    const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);

    const q = await poolA().query(
      `SELECT u.id, u.email, u.phone, u.pan_card, u.full_name, u.kyc_status, u.created_at,
              COALESCE(SUM(a.balance), 0)::numeric AS total_balance,
              COUNT(a.id)::int AS account_count
       FROM users u
       LEFT JOIN accounts a ON a.user_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    res.json({ users: q.rows, page: { limit, offset } });
  }),
);

usersRouter.get(
  '/:id',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const q = await poolA().query(
      `SELECT id, email, phone, pan_card, full_name, kyc_status, created_at
       FROM users
       WHERE id = $1`,
      [id],
    );
    if (q.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: q.rows[0] });
  }),
);

const kycSchema = z.object({
  status: z.enum(['VERIFIED', 'REJECTED']),
});

usersRouter.post(
  '/:id/kyc',
  requireEmployeeAuth,
  requireEmployeeRole('MAKER', 'CHECKER', 'MANAGER', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const body = parseOrThrow(kycSchema, req.body);

    const q = await poolA().query(
      `UPDATE users
       SET kyc_status = $1
       WHERE id = $2
       RETURNING id, email, full_name, kyc_status`,
      [body.status, id],
    );

    if (q.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: q.rows[0] });
  }),
);

