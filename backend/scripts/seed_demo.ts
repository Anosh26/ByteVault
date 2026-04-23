import { poolA } from "../src/db.ts";

async function seed() {
  try {
    const branchRes = await poolA().query("SELECT id FROM branches WHERE branch_code = 'MAIN'");
    if (branchRes.rows.length === 0) throw new Error("MAIN branch not found.");
    const branchId = branchRes.rows[0].id;

    console.log("Starting correction seeding...");

    // 1. Create/Update Users
    const users = [
      { email: 'verified1@bytevault.com', name: 'Alice Verified', kyc: 'VERIFIED', phone: '1112223331' },
      { email: 'verified2@bytevault.com', name: 'Bob Verified', kyc: 'VERIFIED', phone: '1112223332' },
      { email: 'rejected1@bytevault.com', name: 'Charlie Rejected', kyc: 'REJECTED', phone: '1112223333' }
    ];

    const userIds: string[] = [];

    for (const u of users) {
      const res = await poolA().query(
        `INSERT INTO users (email, phone, password_hash, full_name, kyc_status)
         VALUES ($1, $2, 'HASH', $3, $4)
         ON CONFLICT (email) DO UPDATE SET kyc_status = EXCLUDED.kyc_status, full_name = EXCLUDED.full_name
         RETURNING id`,
        [u.email, u.phone, u.name, u.kyc]
      );
      userIds.push(res.rows[0].id);
      console.log(`User ${u.email} set to ${u.kyc}`);
    }

    // 2. Create Audit Logs
    const auditActions = [
      { type: 'EMPLOYEE', action: 'TRANSFER_APPROVED', entity: 'TRANSFER', meta: { amount: 5000, currency: 'INR' } },
      { type: 'EMPLOYEE', action: 'KYC_REVIEWED', entity: 'USER', meta: { result: 'VERIFIED', user: 'Alice' } },
      { type: 'EMPLOYEE', action: 'ACCOUNT_FROZEN', entity: 'ACCOUNT', meta: { reason: 'Suspicious activity' } },
      { type: 'USER', action: 'LOGIN', entity: 'USER', meta: { ip: '127.0.0.1' } },
      { type: 'EMPLOYEE', action: 'LIMIT_INCREASED', entity: 'ACCOUNT', meta: { old: 50000, new: 100000 } },
      { type: 'EMPLOYEE', action: 'TRANSFER_REVERSED', entity: 'LEDGER', meta: { original_tx: 'TX-9982' } }
    ];

    // Clear old logs for demo
    await poolA().query("DELETE FROM audit_logs");

    for (const a of auditActions) {
      await poolA().query(
        `INSERT INTO audit_logs (actor_type, actor_id, action, entity_type, entity_id, meta)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [a.type, userIds[0], a.action, a.entity, userIds[1], a.meta]
      );
    }
    console.log(`Inserted ${auditActions.length} audit logs.`);

    console.log("Seeding corrections completed!");
  } catch (err) {
    console.error("Seeding failed:", err);
  } finally {
    await poolA().end();
  }
}

seed();
