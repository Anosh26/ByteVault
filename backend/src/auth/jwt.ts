import jwt from 'jsonwebtoken';

export type EmployeeRole = 'MAKER' | 'CHECKER' | 'MANAGER' | 'ADMIN';

export type JwtEmployeeClaims = {
  sub: string; // employee_id UUID
  email: string;
  role: EmployeeRole;
  branchId: string | null;
};

const issuer = process.env.JWT_ISSUER || 'bytevault';
const audience = process.env.JWT_AUDIENCE || 'bytevault-client';

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

export function signEmployeeToken(
  claims: JwtEmployeeClaims,
  opts?: { expiresIn?: string },
): string {
  return jwt.sign(claims, getSecret(), {
    algorithm: 'HS256',
    expiresIn: (opts?.expiresIn ?? '2h') as any,
    issuer,
    audience,
  });
}

export function verifyEmployeeToken(token: string): JwtEmployeeClaims {
  const decoded = jwt.verify(token, getSecret(), {
    algorithms: ['HS256'],
    issuer,
    audience,
  });
  return decoded as JwtEmployeeClaims;
}

