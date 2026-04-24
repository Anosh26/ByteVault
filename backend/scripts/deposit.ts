import { poolA } from "../src/db.ts";
import { ensureCustomerLedgerAccount, ensureInternalLedgerAccount, postJournalEntry } from "../src/ledger/ledger.ts";
import crypto from "crypto";

const args = Bun.argv.slice(2);
const params: Record<string, string> = {};

for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) {
    const key = args[i].slice(2);
    const value = args[++i];
    params[key] = value;
  }
}

const { account, amount } = params;

if (!account || !amount || isNaN(Number(amount)) || Number(amount) <= 0) {
  console.error("Usage: bun scripts/deposit.ts --account <account_number> --amount <amount_in_rupees>");
  process.exit(1);
}

async function deposit() {
  const client = await poolA().connect();
  try {
    await client.query("BEGIN");

    // 1. Find Account
    const accRes = await client.query("SELECT id FROM accounts WHERE account_number = $1 FOR UPDATE", [account]);
    if (accRes.rows.length === 0) throw new Error(`Account ${account} not found`);
    const accountId = accRes.rows[0].id;

    const amountCents = Math.round(Number(amount) * 100);
    const txId = `dep_${crypto.randomUUID().replace(/-/g, '')}`;

    // 2. Update Balance
    await client.query("UPDATE accounts SET balance = balance + $1 WHERE id = $2", [Number(amount), accountId]);

    // 3. Create Transaction Record
    await client.query(
      "INSERT INTO transactions (id, account_id, type, amount, status) VALUES ($1, $2, 'CREDIT', $3, 'COMPLETED')",
      [txId, accountId, Number(amount)]
    );

    // 4. Ledger Entry (Double-Entry)
    // Debit Vault/Cash (Internal) -> Credit Customer
    const customerLedger = await ensureCustomerLedgerAccount({ client, accountId });
    const cashLedger = await ensureInternalLedgerAccount({ client, code: 'VAULT_CASH', name: 'Physical Vault Cash' });

    await postJournalEntry({
      client,
      input: {
        kind: 'DEPOSIT',
        description: `Cash deposit at branch`,
        externalRef: txId,
        lines: [
          { ledgerAccountId: cashLedger.ledgerAccountId, amountCents: -amountCents, memo: 'Debit Vault Cash' },
          { ledgerAccountId: customerLedger.ledgerAccountId, amountCents: amountCents, memo: 'Credit Customer' }
        ]
      }
    });

    await client.query("COMMIT");
    console.log(`Successfully deposited ₹${amount} into account ${account}. Transaction ID: ${txId}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Deposit failed:", err instanceof Error ? err.message : err);
  } finally {
    client.release();
    await poolA().end();
  }
}

deposit();
