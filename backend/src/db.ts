import { Pool } from 'pg';

let _poolA: Pool | null = null;
let _poolB: Pool | null = null;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export function poolA(): Pool {
  if (!_poolA) _poolA = new Pool({ connectionString: requireEnv('BRANCH_A_DB_URL') });
  return _poolA;
}

export function poolB(): Pool {
  if (!_poolB) _poolB = new Pool({ connectionString: requireEnv('BRANCH_B_DB_URL') });
  return _poolB;
}

