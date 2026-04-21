import type { Request, Response } from 'express';
import crypto from 'crypto';
import { poolA, poolB } from '../db.ts';
import {
  ensureCustomerLedgerAccount,
  ensureInternalLedgerAccount,
  getAvailableCustomerBalanceCents,
  postJournalEntry,
} from '../ledger/ledger.ts';
import { postInterBranchTransferOutTemplate, postInterBranchTransferInTemplate } from '../ledger/templates.ts';

export async function execute2pcTransfer(params: {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  holdId?: string;
}): Promise<{ transactionId: string }> {
  const { fromAccountId, toAccountId, amount, holdId } = params;

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

    // MAIN: lock source account row and validate available balance (ledger - holds).
    // We still keep cached balances for compatibility, but "can spend?" should come from the ledger model.
    const accLock = await clientA.query('SELECT id FROM accounts WHERE id = $1 FOR UPDATE', [fromAccountId]);
    if (accLock.rows.length === 0) throw new Error('Account not found');

    if (holdId) {
      await clientA.query(
        `UPDATE account_holds SET status = 'CAPTURED', released_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'ACTIVE'`,
        [holdId]
      );
    }

    const available = await getAvailableCustomerBalanceCents({ client: clientA, accountId: fromAccountId });
    if (available.availableCents < amountCents) {
      throw new Error('Insufficient funds');
    }

    // Update cached balances (kept for compatibility; later we can derive from ledger).
    await clientA.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [amount, fromAccountId]);
    await clientB.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [amount, toAccountId]);

    // Ledger posting template (inter-branch clearing):
    await postInterBranchTransferOutTemplate({
      client: clientA,
      fromAccountId,
      amountCents,
      txId,
    });

    await postInterBranchTransferInTemplate({
      client: clientB,
      toAccountId,
      amountCents,
      txId,
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
