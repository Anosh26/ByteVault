'use client';

import { usePortal } from '../layout';
import { formatInr } from '@/lib/format';
import { Wallet, TrendingUp, TrendingDown, ArrowRightLeft } from 'lucide-react';

export default function CustomerDashboard() {
  const { data } = usePortal();
  if (!data) return null;

  const totalLedger = data.accounts.reduce((s: number, a: any) => s + Number(a.ledger_balance_cents), 0) / 100;
  const totalHolds = data.accounts.reduce((s: number, a: any) => s + Number(a.hold_cents), 0) / 100;
  const totalAvailable = data.accounts.reduce((s: number, a: any) => s + Number(a.available_balance ?? 0), 0);

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Overview</h2>
        <p className="text-slate-500 text-sm mt-1">Your financial snapshot at a glance.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-6 relative overflow-hidden">
          <div className="absolute -top-4 -right-4 opacity-5"><Wallet className="w-24 h-24" /></div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">Available Balance</div>
          <div className="text-3xl font-bold text-white tracking-tight">{formatInr(totalAvailable)}</div>
        </div>
        <div className="glass-card p-6 relative overflow-hidden">
          <div className="absolute -top-4 -right-4 opacity-5"><TrendingUp className="w-24 h-24" /></div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">Ledger Balance</div>
          <div className="text-3xl font-bold text-slate-300 tracking-tight">{formatInr(totalLedger)}</div>
        </div>
        <div className="glass-card p-6 relative overflow-hidden">
          <div className="absolute -top-4 -right-4 opacity-5"><TrendingDown className="w-24 h-24" /></div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">Active Holds</div>
          <div className={`text-3xl font-bold tracking-tight ${totalHolds > 0 ? 'text-amber-400' : 'text-slate-600'}`}>
            {totalHolds > 0 ? `-${formatInr(totalHolds)}` : formatInr(0)}
          </div>
        </div>
      </div>

      {/* Accounts Detail */}
      <div>
        <h3 className="text-lg font-bold text-white mb-4">Your Accounts</h3>
        <div className="grid gap-4">
          {data.accounts.map((acc: any) => (
            <div key={acc.id} className="glass-card p-6 flex items-center justify-between group hover:border-emerald-500/20 transition-all">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 flex items-center justify-center border border-emerald-500/10">
                  <Wallet className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <div className="font-mono text-white font-bold">{acc.account_number}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{acc.status} · Savings</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-white font-mono">{formatInr(acc.available_balance)}</div>
                {Number(acc.hold_cents) > 0 && (
                  <div className="text-[10px] text-amber-400 font-mono mt-0.5">
                    {formatInr(Number(acc.hold_cents) / 100)} held
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity (last 5 only — full list is in /history) */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">Recent Activity</h3>
          <a href="/portal/history" className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors">View All →</a>
        </div>
        <div className="glass-card overflow-hidden">
          {data.recentTransactions.length === 0 ? (
            <div className="text-slate-500 py-12 text-center text-sm">No transactions yet.</div>
          ) : (
            <div className="divide-y divide-white/5">
              {data.recentTransactions.slice(0, 5).map((tx: any) => (
                <div key={tx.id} className="px-6 py-4 flex justify-between items-center hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${Number(tx.amount_cents) > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                      <ArrowRightLeft className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-200 text-sm">{tx.kind}</div>
                      <div className="text-[10px] text-slate-600 mt-0.5">{new Date(tx.created_at).toLocaleString()}</div>
                    </div>
                  </div>
                  <div className={`font-mono font-bold text-sm ${Number(tx.amount_cents) > 0 ? 'text-emerald-400' : 'text-white'}`}>
                    {Number(tx.amount_cents) > 0 ? '+' : ''}{formatInr(Number(tx.amount_cents) / 100)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
