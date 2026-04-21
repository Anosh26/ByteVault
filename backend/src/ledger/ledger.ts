import { z } from 'zod';
import type { PoolClient } from 'pg';

export type LedgerAccountType = 'CUSTOMER' | 'INTERNAL';

export const postEntrySchema = z.object({
  kind: z.string().min(1).max(40),
  description: z.string().max(5000).optional(),
  externalRef: z.string().max(120).optional(),
  reversalOfEntryId: z.string().uuid().optional(),
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
  const ledgerAccountId: string | null =
    existing.rows.length > 0 ? (existing.rows[0].id as string) : null;

  const acc = await client.query(`SELECT account_number FROM accounts WHERE id=$1`, [accountId]);
  if (acc.rows.length === 0) throw new Error('Account not found for ledger account creation');

  const ensuredId =
    ledgerAccountId ??
    ((
      await client.query(
        `INSERT INTO ledger_accounts (name, type, currency, ref_account_id)
         VALUES ($1, 'CUSTOMER', $2, $3)
         RETURNING id`,
        [`Customer ${acc.rows[0].account_number}`, currency, accountId],
      )
    ).rows[0].id as string);

  // If this account existed with a cached balance before ledger was introduced,
  // create an idempotent opening-balance entry so ledger and cache start aligned.
  const cachedBal = await client.query(`SELECT balance FROM accounts WHERE id=$1`, [accountId]);
  const cachedCents = Math.round(Number(cachedBal.rows[0]?.balance ?? 0) * 100);
  if (cachedCents !== 0) {
    const extRef = `OPENING:${accountId}`;
    const already = await client.query(
      `SELECT 1 FROM journal_entries WHERE external_ref=$1 AND kind='OPENING_BALANCE'`,
      [extRef],
    );
    if (already.rows.length === 0) {
      const currentBal = await getLedgerBalanceCents({ client, ledgerAccountId: ensuredId });
      const deltaCents = cachedCents - currentBal.balanceCents;
      if (deltaCents === 0) {
        return { ledgerAccountId: ensuredId };
      }
      const equity = await ensureInternalLedgerAccount({
        client,
        code: 'EQUITY_OPENING_BALANCE',
        name: 'Opening balance equity',
        currency,
      });
      await postJournalEntry({
        client,
        input: {
          kind: 'OPENING_BALANCE',
          description: `Opening balance for account ${acc.rows[0].account_number}`,
          externalRef: extRef,
          lines: [
            // Adjust customer to match cached balance at ledger-introduction time.
            { ledgerAccountId: ensuredId, amountCents: deltaCents, memo: 'Opening balance adjustment' },
            // Offset in equity to keep entry balanced.
            { ledgerAccountId: equity.ledgerAccountId, amountCents: -deltaCents, memo: 'Offset' },
          ],
        },
      });
    }
  }

  return { ledgerAccountId: ensuredId };
}

export async function ensureInternalLedgerAccount(params: {
  client: PoolClient;
  code: string;
  name: string;
  currency?: string;
}): Promise<{ ledgerAccountId: string }> {
  const { client, code, name } = params;
  const currency = params.currency ?? 'INR';

  const existing = await client.query(`SELECT id FROM ledger_accounts WHERE type='INTERNAL' AND code=$1`, [
    code,
  ]);
  if (existing.rows.length > 0) return { ledgerAccountId: existing.rows[0].id as string };

  const created = await client.query(
    `INSERT INTO ledger_accounts (code, name, type, currency)
     VALUES ($1, $2, 'INTERNAL', $3)
     RETURNING id`,
    [code, name, currency],
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
    `INSERT INTO journal_entries (kind, description, external_ref, reversal_of_entry_id, created_by_employee_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, kind, external_ref, reversal_of_entry_id, created_at`,
    [input.kind, input.description ?? null, input.externalRef ?? null, input.reversalOfEntryId ?? null, input.createdByEmployeeId ?? null],
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

export async function getLedgerBalanceCents(params: {
  client: PoolClient;
  ledgerAccountId: string;
}): Promise<{ balanceCents: number }> {
  const q = await params.client.query(
    `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS balance_cents
     FROM journal_lines
     WHERE ledger_account_id = $1`,
    [params.ledgerAccountId],
  );
  return { balanceCents: Number(q.rows[0].balance_cents) };
}

export async function getAvailableCustomerBalanceCents(params: {
  client: PoolClient;
  accountId: string;
}): Promise<{ ledgerAccountId: string; balanceCents: number; heldCents: number; availableCents: number }> {
  const { client, accountId } = params;
  const ledgerAcc = await ensureCustomerLedgerAccount({ client, accountId });
  const bal = await getLedgerBalanceCents({ client, ledgerAccountId: ledgerAcc.ledgerAccountId });
  const holds = await client.query(
    `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS held_cents
     FROM account_holds
     WHERE account_id = $1
       AND status = 'ACTIVE'
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [accountId],
  );
  const heldCents = Number(holds.rows[0].held_cents);
  const availableCents = bal.balanceCents - heldCents;
  return { ledgerAccountId: ledgerAcc.ledgerAccountId, balanceCents: bal.balanceCents, heldCents, availableCents };
}


