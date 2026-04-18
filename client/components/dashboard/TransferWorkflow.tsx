'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/axios';
import { newIdempotencyKey } from '@/lib/idempotency';
import { formatInr } from '@/lib/format';
import type { Employee, TransferRequestRow } from '@/lib/types';

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

  async function onCreateRequest(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const n = Number(amount);
    if (!fromAccountNumber.trim() || !toAccountNumber.trim() || !Number.isFinite(n) || n <= 0) {
      setFormError('Enter valid account numbers and a positive amount.');
      return;
    }
    setFormLoading(true);
    try {
      await api.post(
        '/api/transfers/requests',
        {
          fromAccountNumber: fromAccountNumber.trim(),
          toAccountNumber: toAccountNumber.trim(),
          amount: n,
        },
        { headers: { 'Idempotency-Key': newIdempotencyKey() } },
      );
      setFromAccountNumber('');
      setToAccountNumber('');
      setAmount('');
      await loadRequests();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string; details?: string } } })?.response?.data?.error ??
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
    <div className="space-y-6">
      {roleCanCreate(employee.role) ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <h3 className="text-lg font-semibold text-white">New inter-branch transfer request</h3>
          <p className="mt-1 text-sm text-slate-400">
            From account must be on <span className="text-slate-200">MAIN</span>; to account on{' '}
            <span className="text-slate-200">SUB</span> (per settlement rules).
          </p>
          <form className="mt-4 grid gap-4 sm:grid-cols-3" onSubmit={onCreateRequest}>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">From account #</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={fromAccountNumber}
                onChange={(e) => setFromAccountNumber(e.target.value)}
                placeholder="MAIN branch"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">To account #</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={toAccountNumber}
                onChange={(e) => setToAccountNumber(e.target.value)}
                placeholder="SUB branch"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Amount (INR)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={formLoading}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {formLoading ? 'Submitting…' : 'Submit request'}
              </button>
              {formError ? <span className="text-sm text-red-300">{formError}</span> : null}
            </div>
          </form>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-white">Transfer requests</h3>
          <button
            type="button"
            onClick={() => void loadRequests()}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            Refresh
          </button>
        </div>
        {actionError ? (
          <p className="mt-3 text-sm text-red-300" role="alert">
            {actionError}
          </p>
        ) : null}
        {listError ? (
          <p className="mt-3 text-sm text-red-300">{listError}</p>
        ) : loading ? (
          <p className="mt-4 text-sm text-slate-400">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No transfer requests yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {requests.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/80 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-mono text-xs text-slate-500">{r.id}</p>
                  <p className="mt-1 text-lg font-semibold text-white">{formatInr(Number(r.amount))}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(r.created_at).toLocaleString()} ·{' '}
                    <span
                      className={
                        r.status === 'EXECUTED'
                          ? 'text-emerald-400'
                          : r.status === 'FAILED' || r.status === 'REJECTED'
                            ? 'text-red-400'
                            : 'text-amber-300'
                      }
                    >
                      {r.status}
                    </span>
                    {r.execution_tx_id ? (
                      <span className="ml-2 font-mono text-slate-400">tx {r.execution_tx_id}</span>
                    ) : null}
                  </p>
                </div>
                {r.status === 'PENDING' && roleCanCheck(employee.role) ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-white placeholder-slate-600"
                      placeholder="Reject reason (optional)"
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
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
                      >
                        {actionLoadingId === r.id ? '…' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        disabled={actionLoadingId === r.id}
                        onClick={() => void onReject(r.id)}
                        className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-1.5 text-sm font-medium text-red-200 hover:bg-red-900/50 disabled:opacity-60"
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
  );
}
