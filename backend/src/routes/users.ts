import express from 'express';
import { z } from 'zod';
import { poolA } from '../db.ts';
import { requireEmployeeAuth, requireEmployeeRole } from '../middleware/auth.ts';
import { asyncHandler, parseOrThrow } from '../utils/http.ts';

export const usersRouter = express.Router();

const createUserSchema = z.object({
  email: z.string().email(),
  phone: z.string().min(3).max(30),
  fullName: z.string().min(2).max(150),
});

usersRouter.post(
  '/',
  requireEmployeeAuth,
  requireEmployeeRole('MAKER', 'MANAGER', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(createUserSchema, req.body);

    const q = await poolA().query(
      `INSERT INTO users (email, phone, password_hash, full_name, kyc_status)
       VALUES ($1, $2, $3, $4, 'PENDING')
       RETURNING id, email, phone, full_name, kyc_status, created_at`,
      [body.email, body.phone, 'TEMP', body.fullName],
    );
    res.status(201).json({ user: q.rows[0] });
  }),
);

usersRouter.get(
  '/',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
    const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);

    const q = await poolA().query(
      `SELECT id, email, phone, full_name, kyc_status, created_at
       FROM users
       ORDER BY created_at DESC
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
      `SELECT id, email, phone, full_name, kyc_status, created_at
       FROM users
       WHERE id = $1`,
      [id],
    );
    if (q.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: q.rows[0] });
  }),
);

