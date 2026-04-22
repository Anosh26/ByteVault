'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/axios';
import { newIdempotencyKey } from '@/lib/idempotency';
import { formatInr } from '@/lib/format';
import type { Employee, TransferRequestRow } from '@/lib/types';
import { ArrowRightLeft, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';

type BalanceInfo = {
  account: { id: string; accountNumber: string };
  ledger: { ledgerAccountId: string; balanceCents: number };
  holds: { heldCents: number; availableCents: number };
  cached: { balanceCents: number };
  deltaCents: number;
};

function roleCanCreate(role: Employee['role']): boolean {
  return role === 'MAKER' || role === 'MANAGER' || role === 'ADMIN';
}

function roleCanCheck(role: Employee['role']): boolean {
  return role === 'CHECKER' || role === 'MANAGER' || role === 'ADMIN';
}

export default function TransferWorkflow({ employee }: { employee: Employee }) {
  const [requests, setRequests] = useState<TransferRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [fromAccountNumber, setFromAccountNumber] = useState('');
  const [toAccountNumber, setToAccountNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const [fromBalance, setFromBalance] = useState<BalanceInfo | null>(null);
  const [fromBalanceLoading, setFromBalanceLoading] = useState(false);

  const [rejectDrafts, setRejectDrafts] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setListError(null);
    try {
      const res = await api.get<{ requests: TransferRequestRow[] }>('/api/transfers/requests');
      setRequests(res.data.requests ?? []);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to load requests';
      setListError(String(msg));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const refreshFromBalance = useCallback(async (acctNumber: string) => {
    const n = acctNumber.trim();
    if (!n) {
      setFromBalance(null);
      return;
    }
    setFromBalanceLoading(true);
    try {
      const acc = await api.get<{ account: { id: string; account_number: string } }>(`/api/accounts/by-number/${encodeURIComponent(n)}`);
      const accountId = acc.data.account.id;
      const bal = await api.get<BalanceInfo>(`/api/ledger/customer-accounts/${accountId}/balance`);
      setFromBalance(bal.data);
    } catch {
      setFromBalance(null);
    } finally {
      setFromBalanceLoading(false);
    }
  }, []);

  async function onCreateRequest(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    
    // Validate amount string format (same regex as backend)
    if (!fromAccountNumber.trim() || !toAccountNumber.trim() || !/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
      setFormError('Enter valid account numbers and a positive amount (e.g. 100.50).');
      return;
    }

    setFormLoading(true);
    try {
      await api.post(
        '/api/transfers/requests',
        {
          fromAccountNumber: fromAccountNumber.trim(),
          toAccountNumber: toAccountNumber.trim(),
          amount: amount, // Sending as string to avoid precision issues
        },
        { headers: { 'Idempotency-Key': newIdempotencyKey() } },
      );
      setFromAccountNumber('');
      setToAccountNumber('');
      setAmount('');
      setFromBalance(null);
      await loadRequests();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (err as Error)?.message ??
        'Request failed';
      setFormError(String(msg));
    } finally {
      setFormLoading(false);
    }
  }

  async function onApprove(id: string) {
    setActionLoadingId(id);
    setActionError(null);
    try {
      await api.post(`/api/transfers/requests/${id}/approve`, {}, { headers: { 'Idempotency-Key': newIdempotencyKey() } });
      await loadRequests();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string; details?: string } } })?.response?.data?.details ??
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Approve failed';
      setActionError(String(msg));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function onReject(id: string) {
    setActionLoadingId(id);
    setActionError(null);
    try {
      const reason = rejectDrafts[id]?.trim() || null;
      await api.post(
        `/api/transfers/requests/${id}/reject`,
        { reason },
        { headers: { 'Idempotency-Key': newIdempotencyKey() } },
      );
      setRejectDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await loadRequests();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Reject failed';
      setActionError(String(msg));
    } finally {
      setActionLoadingId(null);
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {roleCanCreate(employee.role) ? (
        <div className="glass-card p-6 shadow-2xl shadow-blue-500/5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
              <ArrowRightLeft suppressHydrationWarning className="h-5 w-5" />
            </div>
            <h3 className="text-xl font-bold glow-text">Initiate Inter-Branch Transfer</h3>
          </div>
          <p className="mt-2 text-sm text-slate-400">
            Source account must reside on <span className="font-semibold text-blue-400">MAIN</span> branch. 
            Destination on <span className="font-semibold text-purple-400">SUB</span>.
          </p>
          
          <form className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" onSubmit={onCreateRequest}>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">From Account #</label>
              <input
                className="input-field"
                value={fromAccountNumber}
                onChange={(e) => {
                  const v = e.target.value;
                  setFromAccountNumber(v);
                  void refreshFromBalance(v);
                }}
                placeholder="000XXX"
              />
              <div className="min-h-[1.25rem]">
                {fromBalanceLoading ? (
                  <span className="flex items-center gap-2 text-[10px] text-blue-400/80 animate-pulse">
                    <Clock suppressHydrationWarning className="h-3 w-3" /> Fetching ledger status...
                  </span>
                ) : fromBalance ? (
                  <div className="flex flex-col gap-0.5 text-[10px]">
                    <span className="text-slate-400 italic"> Ledger: {formatInr(fromBalance.ledger.balanceCents / 100)}</span>
                    <span className="font-bold text-emerald-400"> Available: {formatInr(fromBalance.holds.availableCents / 100)}</span>
                  </div>
                ) : fromAccountNumber.trim() ? (
                  <span className="text-[10px] text-red-400/80">Account not found in registry.</span>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">To Account #</label>
              <input
                className="input-field"
                value={toAccountNumber}
                onChange={(e) => setToAccountNumber(e.target.value)}
                placeholder="111XXX"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Amount (INR)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-sm">₹</span>
                <input
                  className="input-field pl-8"
                  value={amount}
                  autoComplete="off"
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="sm:col-span-2 lg:col-span-3 flex items-center justify-between gap-4 pt-2">
              <button
                type="submit"
                disabled={formLoading}
                className="btn-primary w-full sm:w-auto"
              >
                {formLoading ? 'Processing Ledger...' : 'Submit Settlement Request'}
              </button>
              {formError && (
                <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-2 text-xs text-red-400 border border-red-500/20">
                  <AlertCircle suppressHydrationWarning className="h-4 w-4 shrink-0" />
                  {formError}
                </div>
              )}
            </div>
          </form>
        </div>
      ) : null}

      <div className="glass-card glass-card-hover p-6 shadow-xl">
        <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
             <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
               <Clock suppressHydrationWarning className="h-5 w-5" />
             </div>
             <h3 className="text-xl font-bold text-white">Transaction Pipeline</h3>
          </div>
          <button
            type="button"
            onClick={() => void loadRequests()}
            className="text-xs font-bold uppercase tracking-widest text-blue-400 transition-colors hover:text-blue-300"
          >
            Refresh Data
          </button>
        </div>

        {actionError && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400 border border-red-500/20 animate-in fade-in zoom-in duration-300">
            <XCircle suppressHydrationWarning className="h-5 w-5 shrink-0" />
            {actionError}
          </div>
        )}

        <div className="mt-6">
          {listError ? (
            <div className="text-center py-12 text-slate-500">{listError}</div>
          ) : loading ? (
            <div className="space-y-4">
               {[1,2,3].map(i => (
                 <div key={i} className="h-20 w-full rounded-xl bg-slate-900/50 animate-pulse" />
               ))}
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-12 text-slate-600 font-medium italic">Empty pipeline. Use the form above to initiate funds movement.</div>
          ) : (
            <ul className="space-y-4">
              {requests.map((r) => (
                <li
                  key={r.id}
                  className="group relative flex flex-col gap-4 rounded-2xl border border-white/5 bg-slate-950/40 p-5 transition-all hover:bg-slate-950/60 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex items-start gap-4">
                    <div className="mt-1">
                      {r.status === 'EXECUTED' ? (
                        <CheckCircle2 suppressHydrationWarning className="h-6 w-6 text-emerald-500" />
                      ) : r.status === 'FAILED' || r.status === 'REJECTED' ? (
                        <XCircle suppressHydrationWarning className="h-6 w-6 text-red-500" />
                      ) : (
                        <Clock suppressHydrationWarning className="h-6 w-6 text-amber-500 animate-pulse" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                         <span className="font-mono text-[10px] font-bold text-slate-600 group-hover:text-slate-400 transition-colors uppercase tracking-tight">{r.id.split('-')[0]}...{r.id.split('-').pop()}</span>
                         <span className={`badge ${
                           r.status === 'EXECUTED' ? 'bg-emerald-500/10 text-emerald-400' :
                           r.status === 'PENDING' ? 'bg-amber-500/10 text-amber-400' :
                           'bg-red-500/10 text-red-400'
                         }`}>
                           {r.status}
                         </span>
                      </div>
                      <p className="mt-1 text-xl font-black text-white">{formatInr(Number(r.amount))}</p>
                      <p className="text-[10px] font-medium text-slate-500 mt-0.5">
                        {new Date(r.created_at).toLocaleDateString()} at {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {r.execution_tx_id && <span className="ml-2 font-mono opacity-60">· ledger_tx_{r.execution_tx_id.slice(0,8)}</span>}
                      </p>
                    </div>
                  </div>

                  {r.status === 'PENDING' && roleCanCheck(employee.role) ? (
                    <div className="flex flex-col gap-3 rounded-xl bg-white/5 p-3 md:flex-row md:items-center">
                      <input
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 md:w-48"
                        placeholder="Rejection note..."
                        value={rejectDrafts[r.id] ?? ''}
                        onChange={(e) =>
                          setRejectDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))
                        }
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={actionLoadingId === r.id}
                          onClick={() => void onApprove(r.id)}
                          className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-500 active:scale-95 transition-all md:flex-none"
                        >
                          {actionLoadingId === r.id ? 'Settling...' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          disabled={actionLoadingId === r.id}
                          onClick={() => void onReject(r.id)}
                          className="flex-1 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-2 text-xs font-bold text-red-200 hover:bg-red-900/50 active:scale-95 transition-all md:flex-none"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
