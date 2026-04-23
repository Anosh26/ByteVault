import { poolA } from "../src/db.ts";

async function seed() {
  try {
    const branchRes = await poolA().query("SELECT id FROM branches WHERE branch_code = 'MAIN'");
    if (branchRes.rows.length === 0) throw new Error("MAIN branch not found. Run migrations/init first.");
    const branchId = branchRes.rows[0].id;

    // 1. Create a User
    const userRes = await poolA().query(
      `INSERT INTO users (email, phone, password_hash, full_name, kyc_status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
      ['john.doe@example.com', '1234567890', 'HASH', 'John Doe', 'VERIFIED']
    );
    const userId = userRes.rows[0].id;
    console.log(`User created: John Doe (${userId})`);

    // 2. Create an Account
    const accRes = await poolA().query(
      `INSERT INTO accounts (user_id, branch_id, account_number, balance, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')
       ON CONFLICT (account_number) DO NOTHING
       RETURNING id, account_number`,
      [userId, branchId, '1001001001', 50000.00]
    );
    if (accRes.rows.length > 0) {
      console.log(`Account created: ${accRes.rows[0].account_number}`);
    } else {
      console.log("Account already exists.");
    }

    // 3. Create some Audit Logs
    await poolA().query(
      `INSERT INTO audit_logs (actor_type, actor_id, action, entity_type, entity_id, meta)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['EMPLOYEE', userId, 'CREATE_ACCOUNT', 'ACCOUNT', userId, { note: 'Initial seed' }]
    );
    console.log("Audit log created.");

    console.log("Seeding completed successfully!");
  } catch (err) {
    console.error("Seeding failed:", err);
  } finally {
    await poolA().end();
  }
}

seed();
