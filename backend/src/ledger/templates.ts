import type { PoolClient } from 'pg';
import { ensureCustomerLedgerAccount, ensureInternalLedgerAccount, postJournalEntry } from './ledger.ts';

export const INTERNAL_ACCOUNTS = {
  CLEARING_INTERBRANCH: { code: 'CLEARING_INTERBRANCH', name: 'Inter-branch clearing' },
  SUSPENSE_GENERAL: { code: 'SUSPENSE_GENERAL', name: 'General suspense account' },
  FEE_REVENUE: { code: 'FEE_REVENUE', name: 'Platform fee revenue' },
} as const;

export async function postInterBranchTransferOutTemplate(params: {
  client: PoolClient;
  fromAccountId: string;
  amountCents: number;
  txId: string;
}) {
  const { client, fromAccountId, amountCents, txId } = params;

  const mainCustomer = await ensureCustomerLedgerAccount({ client, accountId: fromAccountId });
  const mainClearing = await ensureInternalLedgerAccount({
    client,
    code: INTERNAL_ACCOUNTS.CLEARING_INTERBRANCH.code,
    name: INTERNAL_ACCOUNTS.CLEARING_INTERBRANCH.name,
  });

  return postJournalEntry({
    client,
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
}

export async function postInterBranchTransferInTemplate(params: {
  client: PoolClient;
  toAccountId: string;
  amountCents: number;
  txId: string;
}) {
  const { client, toAccountId, amountCents, txId } = params;

  const subCustomer = await ensureCustomerLedgerAccount({ client, accountId: toAccountId });
  const subClearing = await ensureInternalLedgerAccount({
    client,
    code: INTERNAL_ACCOUNTS.CLEARING_INTERBRANCH.code,
    name: INTERNAL_ACCOUNTS.CLEARING_INTERBRANCH.name,
  });

  return postJournalEntry({
    client,
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
}

export async function postFeeTemplate(params: {
  client: PoolClient;
  fromAccountId: string;
  feeAmountCents: number;
  txId: string;
  description?: string;
}) {
  const { client, fromAccountId, feeAmountCents, txId, description } = params;
  
  const customer = await ensureCustomerLedgerAccount({ client, accountId: fromAccountId });
  const feeRevenue = await ensureInternalLedgerAccount({
    client,
    code: INTERNAL_ACCOUNTS.FEE_REVENUE.code,
    name: INTERNAL_ACCOUNTS.FEE_REVENUE.name,
  });

  return postJournalEntry({
    client,
    input: {
      kind: 'FEE',
      description: description || `Fee charge (${txId})`,
      externalRef: txId,
      lines: [
        { ledgerAccountId: customer.ledgerAccountId, amountCents: -feeAmountCents, memo: 'Debit fee from customer' },
        { ledgerAccountId: feeRevenue.ledgerAccountId, amountCents: feeAmountCents, memo: 'Credit fee revenue' },
      ],
    },
  });
}

export async function postSuspenseTemplate(params: {
  client: PoolClient;
  accountId: string;
  amountCents: number;
  txId: string;
  direction: 'IN' | 'OUT';
  description?: string;
}) {
  const { client, accountId, amountCents, txId, direction, description } = params;

  const customer = await ensureCustomerLedgerAccount({ client, accountId });
  const suspense = await ensureInternalLedgerAccount({
    client,
    code: INTERNAL_ACCOUNTS.SUSPENSE_GENERAL.code,
    name: INTERNAL_ACCOUNTS.SUSPENSE_GENERAL.name,
  });

  return postJournalEntry({
    client,
    input: {
      kind: 'SUSPENSE',
      description: description || `Suspense adjustment (${txId})`,
      externalRef: txId,
      lines: [
        { 
          ledgerAccountId: customer.ledgerAccountId, 
          amountCents: direction === 'IN' ? amountCents : -amountCents, 
          memo: direction === 'IN' ? 'Credit customer' : 'Debit customer' 
        },
        { 
          ledgerAccountId: suspense.ledgerAccountId, 
          amountCents: direction === 'IN' ? -amountCents : amountCents, 
          memo: direction === 'IN' ? 'Debit suspense' : 'Credit suspense' 
        },
      ],
    },
  });
}
