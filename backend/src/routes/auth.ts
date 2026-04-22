import type { Request, Response } from 'express';
import express from 'express';
import { poolA } from '../db.ts';
import { verifyPassword } from '../utils/password.ts';
import { signEmployeeToken } from '../auth/jwt.ts';
import { requireEmployeeAuth } from '../middleware/auth.ts';

export const authRouter = express.Router();

authRouter.post('/employee/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const q = await poolA().query(
    `SELECT e.id, e.email, e.role, e.branch_id, b.name as branch_name, c.password_hash
     FROM employees e
     JOIN employee_credentials c ON c.employee_id = e.id
     LEFT JOIN branches b ON b.id = e.branch_id
     WHERE e.email = $1`,
    [email],
  );
  if (q.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

  const row = q.rows[0] as {
    id: string;
    email: string;
    role: 'MAKER' | 'CHECKER' | 'MANAGER' | 'ADMIN';
    branch_id: string | null;
    branch_name: string | null;
    password_hash: string;
  };

  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signEmployeeToken({
    sub: row.id,
    email: row.email,
    role: row.role,
    branchId: row.branch_id,
    branchName: row.branch_name,
  });

  return res.json({
    accessToken: token,
    tokenType: 'Bearer',
    employee: { id: row.id, email: row.email, role: row.role, branchId: row.branch_id, branchName: row.branch_name },
  });
});

authRouter.get('/me', requireEmployeeAuth, async (req: Request, res: Response) => {
  const emp = req.employee!;
  return res.json({ employee: emp });
});

