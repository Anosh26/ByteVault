import express from 'express';
import { z } from 'zod';
import { poolA } from '../db.ts';
import { requireEmployeeAuth, requireEmployeeRole } from '../middleware/auth.ts';
import { requireIdempotencyKey } from '../middleware/idempotency.ts';
import { asyncHandler, parseOrThrow } from '../utils/http.ts';

export const holdsRouter = express.Router();

const createHoldSchema = z.object({
  accountId: z.string().uuid(),
  amountInr: z.number().positive(),
  reason: z.string().max(200).optional(),
  // minutes from now; if omitted, no expiry
  ttlMinutes: z.number().int().positive().max(60 * 24 * 30).optional(),
});

// Admin-only for now: create a hold/authorization (reserve funds).
holdsRouter.post(
  '/',
  requireEmployeeAuth,
  requireEmployeeRole('ADMIN'),
  requireIdempotencyKey({ routeTag: 'POST /api/holds' }),
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(createHoldSchema, req.body);
    const amountCents = Math.round(body.amountInr * 100);
    const expiresAt = body.ttlMinutes ? new Date(Date.now() + body.ttlMinutes * 60_000) : null;

    const q = await poolA().query(
      `INSERT INTO account_holds (account_id, amount_cents, reason, status, expires_at)
       VALUES ($1, $2, $3, 'ACTIVE', $4)
       RETURNING id, account_id, amount_cents, reason, status, expires_at, created_at, released_at`,
      [body.accountId, amountCents, body.reason ?? null, expiresAt],
    );
    return res.status(201).json({ hold: q.rows[0] });
  }),
);

const releaseHoldSchema = z.object({
  // if true, mark as CAPTURED (funds were used); else RELEASED (funds freed)
  capture: z.boolean().optional().default(false),
});

// Admin-only for now: release/capture a hold.
holdsRouter.post(
  '/:id/release',
  requireEmployeeAuth,
  requireEmployeeRole('ADMIN'),
  requireIdempotencyKey({ routeTag: 'POST /api/holds/:id/release' }),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const body = parseOrThrow(releaseHoldSchema, req.body);
    const nextStatus = body.capture ? 'CAPTURED' : 'RELEASED';

    const q = await poolA().query(
      `UPDATE account_holds
       SET status=$1, released_at=CURRENT_TIMESTAMP
       WHERE id=$2 AND status='ACTIVE'
       RETURNING id, account_id, amount_cents, reason, status, expires_at, created_at, released_at`,
      [nextStatus, id],
    );
    if (q.rows.length === 0) return res.status(404).json({ error: 'Hold not found or not active' });
    return res.json({ hold: q.rows[0] });
  }),
);

// List holds for an account.
holdsRouter.get(
  '/by-account/:accountId',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    const accountId = String(req.params.accountId);
    const status = (req.query.status as string | undefined) ?? 'ACTIVE';
    const q = await poolA().query(
      `SELECT id, account_id, amount_cents, reason, status, expires_at, created_at, released_at
       FROM account_holds
       WHERE account_id=$1 AND status=$2
       ORDER BY created_at DESC
       LIMIT 100`,
      [accountId, status],
    );
    return res.json({ holds: q.rows });
  }),
);

