import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { poolA } from '../db.ts';

function stableJson(obj: unknown): string {
  // good enough for now; we mainly need determinism for typical JSON bodies.
  return JSON.stringify(obj, Object.keys(obj as any).sort());
}

// Add actorType to the accepted options
export function requireIdempotencyKey(opts?: { routeTag?: string; actorType?: 'EMPLOYEE' | 'USER' }) {
  const routeTag = opts?.routeTag ?? 'unknown';
  const expectedActorType = opts?.actorType ?? 'EMPLOYEE'; // Default to EMPLOYEE if omitted

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = req.header('Idempotency-Key');
    if (!key) return res.status(400).json({ error: 'Missing Idempotency-Key header' });
    if (key.length > 128) return res.status(400).json({ error: 'Idempotency-Key too long' });

    // 1. Check the correct object (req.user vs req.employee) based on the route
    const actor = expectedActorType === 'USER' ? req.user : req.employee;
    if (!actor) return res.status(401).json({ error: 'Not authenticated' });

    const requestHash = crypto
      .createHash('sha256')
      .update(stableJson(req.body ?? {}))
      .digest('hex');

    // 2. Use $4 dynamically instead of hardcoding 'EMPLOYEE'
    const finalize = async (status: 'COMPLETED' | 'FAILED', code: number, body: unknown) => {
      await poolA().query(
        `UPDATE idempotency_keys
         SET status = $1,
             response_code = $2,
             response_body = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE actor_type = $4
           AND actor_id = $5
           AND key = $6
           AND route = $7`,
        [status, code, body, expectedActorType, actor.id, key, routeTag],
      );
    };

    // 3. Use $1 dynamically here too
    const existing = await poolA().query(
      `SELECT status, request_hash, response_code, response_body
       FROM idempotency_keys
       WHERE actor_type = $1
         AND actor_id = $2
         AND key = $3
         AND route = $4`,
      [expectedActorType, actor.id, key, routeTag],
    );

    // ... (keep the rest of your existing existing.rows checks)

    // 4. Update the INSERT statement to use $1 for expectedActorType
    if (existing.rows.length === 0) {
      await poolA().query(
        `INSERT INTO idempotency_keys (actor_type, actor_id, key, route, request_hash, status)
         VALUES ($1, $2, $3, $4, $5, 'IN_PROGRESS')`,
        [expectedActorType, actor.id, key, routeTag, requestHash],
      );
    }

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

