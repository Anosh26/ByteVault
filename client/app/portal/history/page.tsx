'use client';

import { usePortal } from '../layout';
import { formatInr } from '@/lib/format';
import { ArrowRightLeft, ArrowDownLeft, ArrowUpRight } from 'lucide-react';

export default function HistoryPage() {
  const { data } = usePortal();
  if (!data) return null;

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Transaction History</h2>
        <p className="text-slate-500 text-sm mt-1">Complete record of your recent ledger activity.</p>
      </div>

      <div className="glass-card overflow-hidden">
        {data.recentTransactions.length === 0 ? (
          <div className="text-slate-500 py-16 text-center text-sm">No transactions found.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {data.recentTransactions.map((tx: any) => {
              const isCredit = Number(tx.amount_cents) > 0;
              return (
                <div key={tx.id} className="px-6 py-5 flex justify-between items-center hover:bg-white/[0.02] transition-colors group">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isCredit ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {isCredit ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="font-medium text-white text-sm group-hover:text-emerald-400 transition-colors">{tx.kind}</div>
                      <div className="text-xs text-slate-500 mt-1 max-w-md truncate">{tx.description || 'No description'}</div>
                      <div className="text-[10px] text-slate-600 mt-1">{new Date(tx.created_at).toLocaleString()}</div>
                    </div>
                  </div>
                  <div className={`font-mono font-bold ${isCredit ? 'text-emerald-400' : 'text-white'}`}>
                    {isCredit ? '+' : ''}{formatInr(Number(tx.amount_cents) / 100)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
