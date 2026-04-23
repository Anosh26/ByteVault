import type { Request, Response, NextFunction } from 'express';
import { verifyEmployeeToken, type EmployeeRole, type JwtEmployeeClaims } from '../auth/jwt.ts';

export type AuthedEmployee = {
  id: string;
  email: string;
  role: EmployeeRole;
  branchId: string | null;
  branchName: string | null;
};

declare global {
  namespace Express {
    interface Request {
      employee?: AuthedEmployee;
      user?: AuthedCustomer;
    }
  }
}

export type AuthedCustomer = {
  id: string;
  email: string;
  kycStatus: string;
};

function parseBearerToken(req: Request): string | null {
  const header = req.header('authorization') || req.header('Authorization');
  if (!header) return null;
  const [kind, token] = header.split(' ');
  if (kind !== 'Bearer' || !token) return null;
  return token;
}

export function requireEmployeeAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = parseBearerToken(req);
    if (!token) return res.status(401).json({ error: 'Missing Bearer token' });

    const claims: JwtEmployeeClaims = verifyEmployeeToken(token);
    req.employee = {
      id: claims.sub,
      email: claims.email,
      role: claims.role,
      branchId: claims.branchId,
      branchName: claims.branchName,
    };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireEmployeeRole(...roles: EmployeeRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const emp = req.employee;
    if (!emp) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(emp.role)) return res.status(403).json({ error: 'Forbidden' });
    return next();
  };
}

export function requireCustomerAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = parseBearerToken(req);
    if (!token) return res.status(401).json({ error: 'Missing Bearer token' });

    // Assuming we import verifyCustomerToken
    const { verifyCustomerToken } = require('../auth/jwt.ts');
    const claims = verifyCustomerToken(token);
    
    req.user = {
      id: claims.sub,
      email: claims.email,
      kycStatus: claims.kycStatus,
    };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

