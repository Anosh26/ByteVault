import express from 'express';
import { poolA } from '../db.ts';
import { requireEmployeeAuth, requireEmployeeRole } from '../middleware/auth.ts';
import { asyncHandler } from '../utils/http.ts';

export const auditRouter = express.Router();

auditRouter.get(
  '/',
  requireEmployeeAuth,
  requireEmployeeRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const q = await poolA().query(
      `SELECT id, actor_type, actor_id, action, entity_type, entity_id, meta, created_at
       FROM audit_logs
       ORDER BY created_at DESC
       LIMIT 100`,
    );
    res.json({ logs: q.rows });
  }),
);
