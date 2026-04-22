import { poolA } from "../src/db.ts";
import { hashPassword } from "../src/utils/password.ts";

const args = Bun.argv.slice(2);
const params: Record<string, string> = {};

for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) {
    const key = args[i].slice(2);
    const value = args[++i];
    params[key] = value;
  }
}

const { email, password, role, branch, name } = params;

if (!email || !password || !role || !branch || !name) {
  console.error("Usage: bun scripts/onboard.ts --email <email> --password <password> --role <role> --branch <branch_code> --name <full_name>");
  process.exit(1);
}

try {
  const branchRes = await poolA().query("SELECT id FROM branches WHERE branch_code = $1", [branch]);
  if (branchRes.rows.length === 0) throw new Error(`Branch ${branch} not found`);
  const branchId = branchRes.rows[0].id;

  await poolA().query("BEGIN");

  const empRes = await poolA().query(
    `INSERT INTO employees (email, full_name, role, branch_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, branch_id = EXCLUDED.branch_id
     RETURNING id`,
    [email, name, role, branchId]
  );

  const employeeId = empRes.rows[0].id;
  const passwordHash = await hashPassword(password);

  await poolA().query(
    `INSERT INTO employee_credentials (employee_id, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (employee_id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [employeeId, passwordHash]
  );

  await poolA().query("COMMIT");
  console.log(`Successfully onboarded ${email} (ID: ${employeeId})`);
} catch (err) {
  await poolA().query("ROLLBACK");
  console.error("Onboarding failed:", err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await poolA().end();
}
