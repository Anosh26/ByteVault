import type { Request, Response } from 'express';
import express from 'express';
import { poolA } from '../db.ts';
import { hashPassword } from '../utils/password.ts';

export const devRouter = express.Router();

// Dev-only helper: create or update an employee credential.
// Protect this in real deployments (or remove entirely).
devRouter.post('/employee-credentials', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const emp = await poolA().query('SELECT id FROM employees WHERE email = $1', [email]);
  if (emp.rows.length === 0) return res.status(404).json({ error: 'employee not found' });

  const passwordHash = await hashPassword(password);
  await poolA().query(
    `INSERT INTO employee_credentials (employee_id, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (employee_id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [emp.rows[0].id, passwordHash],
  );

  return res.json({ ok: true, employeeId: emp.rows[0].id });
});

