import type { Request, Response } from 'express';
import crypto from 'crypto';
import { poolA, poolB } from '../db.ts';
import { ensureCustomerLedgerAccount, ensureInternalLedgerAccount, postJournalEntry } from '../ledger/ledger.ts';

export async function execute2pcTransfer(params: {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
}): Promise<{ transactionId: string }> {
  const { fromAccountId, toAccountId, amount } = params;

  const txId = `tx_${crypto.randomUUID().replace(/-/g, '')}`;
  const amountCents = Math.round(amount * 100);

  const clientA = await poolA().connect();
  const clientB = await poolB().connect();

  try {
    await clientA.query('SET statement_timeout = 5000');
    await clientB.query('SET statement_timeout = 5000');
    await clientA.query('SET lock_timeout = 3000');
    await clientB.query('SET lock_timeout = 3000');

    await clientA.query('BEGIN');
    await clientB.query('BEGIN');

    // MAIN: lock source account row and validate cached balance (ledger will become source of truth later).
    const balanceRes = await clientA.query('SELECT balance FROM accounts WHERE id = $1 FOR UPDATE', [fromAccountId]);

    if (balanceRes.rows.length === 0 || Number(balanceRes.rows[0].balance) < amount) {
      throw new Error('Insufficient funds or account not found');
    }

    // Update cached balances (kept for compatibility; later we can derive from ledger).
    await clientA.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [amount, fromAccountId]);
    await clientB.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [amount, toAccountId]);

    // Ledger posting template (inter-branch clearing):
    // - Main:  debit CUSTOMER(from)  / credit INTERNAL(CLEARING)
    // - Sub:   debit INTERNAL(CLEARING) / credit CUSTOMER(to)
    const mainCustomer = await ensureCustomerLedgerAccount({ client: clientA, accountId: fromAccountId });
    const subCustomer = await ensureCustomerLedgerAccount({ client: clientB, accountId: toAccountId });

    const mainClearing = await ensureInternalLedgerAccount({
      client: clientA,
      code: 'CLEARING_INTERBRANCH',
      name: 'Inter-branch clearing',
    });
    const subClearing = await ensureInternalLedgerAccount({
      client: clientB,
      code: 'CLEARING_INTERBRANCH',
      name: 'Inter-branch clearing',
    });

    await postJournalEntry({
      client: clientA,
      input: {
        kind: 'TRANSFER_OUT',
        description: `Inter-branch transfer out (${txId})`,
        externalRef: txId,
        lines: [
          { ledgerAccountId: mainCustomer.ledgerAccountId, amountCents: -amountCents, memo: 'Debit customer' },
          { ledgerAccountId: mainClearing.ledgerAccountId, amountCents: amountCents, memo: 'Credit clearing' },
        ],
      },
    });

    await postJournalEntry({
      client: clientB,
      input: {
        kind: 'TRANSFER_IN',
        description: `Inter-branch transfer in (${txId})`,
        externalRef: txId,
        lines: [
          { ledgerAccountId: subClearing.ledgerAccountId, amountCents: -amountCents, memo: 'Debit clearing' },
          { ledgerAccountId: subCustomer.ledgerAccountId, amountCents: amountCents, memo: 'Credit customer' },
        ],
      },
    });

    // Keep legacy transaction rows for now (compatibility / UI). Ledger is the real source of truth going forward.
    await clientA.query(
      "INSERT INTO transactions (id, account_id, type, amount, status) VALUES ($1, $2, 'DEBIT', $3, 'PENDING')",
      [txId, fromAccountId, amount],
    );
    await clientB.query(
      "INSERT INTO transactions (id, account_id, type, amount, status) VALUES ($1, $2, 'CREDIT', $3, 'PENDING')",
      [txId, toAccountId, amount],
    );

    await clientA.query(`PREPARE TRANSACTION '${txId}_A'`);
    await clientB.query(`PREPARE TRANSACTION '${txId}_B'`);

    await clientA.query(`COMMIT PREPARED '${txId}_A'`);
    await clientB.query(`COMMIT PREPARED '${txId}_B'`);

    clientA
      .query("UPDATE transactions SET status = 'COMPLETED' WHERE id = $1", [txId])
      .catch(console.error);
    clientB
      .query("UPDATE transactions SET status = 'COMPLETED' WHERE id = $1", [txId])
      .catch(console.error);

    return { transactionId: txId };
  } catch (error) {
    console.error('Distributed transaction failed, initiating rollback:', error);

    try {
      await clientA.query('ROLLBACK').catch(() => {});
      await clientB.query('ROLLBACK').catch(() => {});
      await clientA.query(`ROLLBACK PREPARED '${txId}_A'`).catch(() => {});
      await clientB.query(`ROLLBACK PREPARED '${txId}_B'`).catch(() => {});
    } catch (rollbackError) {
      console.error('CRITICAL: Manual operator intervention required to resolve 2PC locks', rollbackError);
    }

    throw error;
  } finally {
    clientA.release();
    clientB.release();
  }
}

export const transferFunds = async (req: Request, res: Response) => {
  const { fromAccount, toAccount, amount } = req.body;

  if (!fromAccount || !toAccount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid transfer details' });
  }

  try {
    const result = await execute2pcTransfer({
      fromAccountId: fromAccount,
      toAccountId: toAccount,
      amount,
    });

    return res.status(200).json({
      message: 'Transfer completed successfully',
      transactionId: result.transactionId,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Transfer failed. Transaction rolled back securely.',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
