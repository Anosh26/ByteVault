import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
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

  let clientA: PoolClient | undefined;
  let clientB: PoolClient | undefined;
  let phase2 = false;

  try {
    clientA = await poolA().connect();
    clientB = await poolB().connect();

    await clientA.query('SET statement_timeout = 5000');
    await clientB.query('SET statement_timeout = 5000');
    await clientA.query('SET lock_timeout = 3000');
    await clientB.query('SET lock_timeout = 3000');

    await clientA.query('BEGIN');
    await clientB.query('BEGIN');

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

    const updateA = await clientA.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [amount, fromAccountId]);
    if (updateA.rowCount === 0) throw new Error('Source account not found');

    const updateB = await clientB.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [amount, toAccountId]);
    if (updateB.rowCount === 0) throw new Error('Destination account not found');

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

    await clientA.query(
      "INSERT INTO transactions (id, account_id, type, amount, status) VALUES ($1, $2, 'DEBIT', $3, 'COMPLETED')",
      [txId, fromAccountId, amount],
    );
    await clientB.query(
      "INSERT INTO transactions (id, account_id, type, amount, status) VALUES ($1, $2, 'CREDIT', $3, 'COMPLETED')",
      [txId, toAccountId, amount],
    );

    await clientA.query(`PREPARE TRANSACTION '${txId}_A'`);
    await clientB.query(`PREPARE TRANSACTION '${txId}_B'`);

    phase2 = true;
    try {
      await clientA.query(`COMMIT PREPARED '${txId}_A'`);
      await clientB.query(`COMMIT PREPARED '${txId}_B'`);
    } catch (commitErr) {
      console.error('CRITICAL: COMMIT PREPARED failed', txId, commitErr);
      throw commitErr;
    }

    return { transactionId: txId };
  } catch (error) {
    console.error('Distributed transaction failed, initiating rollback:', error);

    if (!phase2) {
      try {
        if (clientA) await clientA.query('ROLLBACK').catch(() => {});
        if (clientB) await clientB.query('ROLLBACK').catch(() => {});
        if (clientA) await clientA.query(`ROLLBACK PREPARED '${txId}_A'`).catch(() => {});
        if (clientB) await clientB.query(`ROLLBACK PREPARED '${txId}_B'`).catch(() => {});
      } catch (rollbackError) {
        console.error('CRITICAL: Manual operator intervention required to resolve 2PC locks', rollbackError);
      }
    }

    throw error;
  } finally {
    if (clientA) clientA.release();
    if (clientB) clientB.release();
  }
}

export const transferFunds = async (req: Request, res: Response) => {
  const { fromAccount, toAccount, amount } = req.body as {
    fromAccount?: string;
    toAccount?: string;
    amount?: string;
  };

  if (!fromAccount || !toAccount || !amount || !/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Valid fromAccount, toAccount, amount (string) required' });
  }

  try {
    const result = await execute2pcTransfer({
      fromAccountId: fromAccount,
      toAccountId: toAccount,
      amount: Number(amount),
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
