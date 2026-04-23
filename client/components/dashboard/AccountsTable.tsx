'use client';

import { formatInr } from '@/lib/format';
import type { AccountRow } from '@/lib/types';

export default function AccountsTable({
  accounts,
  loading,
  error,
}: {
  accounts: AccountRow[];
  loading: boolean;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="rounded-2xl border border-red-900/40 bg-red-950/30 p-6 text-sm text-red-200">
        {error}
      </div>
    );
  }
  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 text-sm text-slate-400">Loading accounts…</div>
    );
  }
  if (accounts.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 text-sm text-slate-500">
        No accounts on MAIN branch yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50">
      <div className="border-b border-slate-800 px-6 py-4">
        <h3 className="text-lg font-semibold text-white">Accounts (MAIN)</h3>
        <p className="text-xs text-slate-500">Served from the primary database; totals match the employee dashboard.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="bg-slate-950/80 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-6 py-3 font-medium">Account</th>
              <th className="px-6 py-3 font-medium">Balance</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium">KYC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {accounts.map((a) => (
              <tr key={a.id} className="hover:bg-slate-800/40">
                <td className="px-6 py-3 font-mono text-slate-200">{a.account_number}</td>
                <td className="px-6 py-3 font-medium text-white">{formatInr(Number(a.balance))}</td>
                <td className="px-6 py-3 text-slate-400">{a.status}</td>
                <td className="px-6 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      a.kyc_status === 'VERIFIED'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : a.kyc_status === 'REJECTED'
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}
                  >
                    {a.kyc_status ?? 'PENDING'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
