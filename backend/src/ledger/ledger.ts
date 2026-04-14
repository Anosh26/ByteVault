import { z } from 'zod';
import type { PoolClient } from 'pg';

export type LedgerAccountType = 'CUSTOMER' | 'INTERNAL';

export const postEntrySchema = z.object({
  kind: z.string().min(1).max(40),
  description: z.string().max(5000).optional(),
  externalRef: z.string().max(120).optional(),
  createdByEmployeeId: z.string().uuid().optional(),
  lines: z
    .array(
      z.object({
        ledgerAccountId: z.string().uuid(),
        amountCents: z.number().int(),
        memo: z.string().max(5000).optional(),
      }),
    )
    .min(2),
});

export type PostEntryInput = z.infer<typeof postEntrySchema>;

function sumCents(lines: { amountCents: number }[]): number {
  return lines.reduce((a, b) => a + b.amountCents, 0);
}

export async function ensureCustomerLedgerAccount(params: {
  client: PoolClient;
  accountId: string;
  currency?: string;
}): Promise<{ ledgerAccountId: string }> {
  const { client, accountId } = params;
  const currency = params.currency ?? 'INR';

  const existing = await client.query(
    `SELECT id FROM ledger_accounts WHERE type='CUSTOMER' AND ref_account_id=$1`,
    [accountId],
  );
  if (existing.rows.length > 0) return { ledgerAccountId: existing.rows[0].id as string };

  const acc = await client.query(`SELECT account_number FROM accounts WHERE id=$1`, [accountId]);
  if (acc.rows.length === 0) throw new Error('Account not found for ledger account creation');

  const created = await client.query(
    `INSERT INTO ledger_accounts (name, type, currency, ref_account_id)
     VALUES ($1, 'CUSTOMER', $2, $3)
     RETURNING id`,
    [`Customer ${acc.rows[0].account_number}`, currency, accountId],
  );
  return { ledgerAccountId: created.rows[0].id as string };
}

export async function postJournalEntry(params: { client: PoolClient; input: PostEntryInput }) {
  const { client, input } = params;

  const total = sumCents(input.lines);
  if (total !== 0) {
    throw new Error(`Unbalanced journal entry (sumCents=${total})`);
  }

  const entry = await client.query(
    `INSERT INTO journal_entries (kind, description, external_ref, created_by_employee_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, kind, external_ref, created_at`,
    [input.kind, input.description ?? null, input.externalRef ?? null, input.createdByEmployeeId ?? null],
  );

  const entryId = entry.rows[0].id as string;

  for (const line of input.lines) {
    await client.query(
      `INSERT INTO journal_lines (entry_id, ledger_account_id, amount_cents, memo)
       VALUES ($1, $2, $3, $4)`,
      [entryId, line.ledgerAccountId, line.amountCents, line.memo ?? null],
    );
  }

  return { entry: entry.rows[0], entryId };
}

