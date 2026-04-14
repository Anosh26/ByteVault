import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { poolA } from '../db.ts';

function stableJson(obj: unknown): string {
  // good enough for now; we mainly need determinism for typical JSON bodies.
  return JSON.stringify(obj, Object.keys(obj as any).sort());
}

export function requireIdempotencyKey(opts?: { routeTag?: string }) {
  const routeTag = opts?.routeTag ?? 'unknown';

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = req.header('Idempotency-Key');
    if (!key) return res.status(400).json({ error: 'Missing Idempotency-Key header' });
    if (key.length > 128) return res.status(400).json({ error: 'Idempotency-Key too long' });

    const actor = req.employee;
    if (!actor) return res.status(401).json({ error: 'Not authenticated' });

    const requestHash = crypto
      .createHash('sha256')
      .update(stableJson(req.body ?? {}))
      .digest('hex');

    const finalize = async (status: 'COMPLETED' | 'FAILED', code: number, body: unknown) => {
      await poolA().query(
        `UPDATE idempotency_keys
         SET status = $1,
             response_code = $2,
             response_body = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE actor_type = 'EMPLOYEE'
           AND actor_id = $4
           AND key = $5
           AND route = $6`,
        [status, code, body, actor.id, key, routeTag],
      );
    };

    const existing = await poolA().query(
      `SELECT status, request_hash, response_code, response_body
       FROM idempotency_keys
       WHERE actor_type = 'EMPLOYEE'
         AND actor_id = $1
         AND key = $2
         AND route = $3`,
      [actor.id, key, routeTag],
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0] as {
        status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
        request_hash: string;
        response_code: number | null;
        response_body: any;
      };

      if (row.request_hash !== requestHash) {
        return res.status(409).json({ error: 'Idempotency-Key reuse with different request body' });
      }

      if (row.status === 'COMPLETED' && row.response_code) {
        return res.status(row.response_code).json(row.response_body);
      }

      return res.status(409).json({ error: 'Request already in progress' });
    }

    await poolA().query(
      `INSERT INTO idempotency_keys (actor_type, actor_id, key, route, request_hash, status)
       VALUES ('EMPLOYEE', $1, $2, $3, $4, 'IN_PROGRESS')`,
      [actor.id, key, routeTag, requestHash],
    );

    const originalJson = res.json.bind(res);
    res.json = ((body: any) => {
      const statusCode = res.statusCode || 200;
      const status: 'COMPLETED' | 'FAILED' = statusCode >= 400 ? 'FAILED' : 'COMPLETED';
      finalize(status, statusCode, body).catch(console.error);
      return originalJson(body);
    }) as any;

    try {
      return next();
    } catch (e) {
      // In case a handler throws synchronously, mark FAILED so the key doesn't stick IN_PROGRESS.
      finalize('FAILED', 500, { error: 'Unhandled exception', details: String(e) }).catch(console.error);
      throw e;
    }
  };
}

