'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/axios';
import { formatInr } from '@/lib/format';
import { Wallet, ArrowRightLeft, ShieldAlert, LogOut } from 'lucide-react';
import Link from 'next/link';

export default function CustomerDashboard() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('customerToken');
    if (!token) {
      router.push('/portal/login');
      return;
    }
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    api.get('/api/customer/dashboard')
      .then(res => setData(res.data))
      .catch(() => {
        localStorage.removeItem('customerToken');
        router.push('/portal/login');
      });
  }, [router]);

  if (error) return <div className="p-8 text-red-500">{error}</div>;
  if (!data) return <div className="p-8 text-white flex justify-center mt-20"><div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" /></div>;

  const kycVerified = data.kycStatus === 'VERIFIED';

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="flex justify-between items-center pb-6 border-b border-white/10">
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-500">ByteVault Portal</h1>
          <button 
            onClick={() => { localStorage.removeItem('customerToken'); router.push('/portal/login'); }}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-sm font-medium transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </header>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            {/* Accounts Loop */}
            {data.accounts.map((acc: any) => (
              <div key={acc.id} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-white/10 p-8 shadow-2xl">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                  <Wallet className="w-48 h-48" />
                </div>
                
                <div className="relative z-10">
                  <h2 className="text-slate-400 font-medium uppercase tracking-wider text-xs mb-1">Available Balance</h2>
                  <div className="text-5xl font-bold text-white mb-6 tracking-tight">
                    {formatInr(acc.available_balance)}
                  </div>
                  
                  <div className="flex gap-8 border-t border-white/10 pt-6 mt-6">
                    <div>
                      <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Account Number</div>
                      <div className="font-mono text-slate-200">{acc.account_number}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Ledger Balance</div>
                      <div className="font-mono text-slate-400">{formatInr(Number(acc.ledger_balance_cents)/100)}</div>
                    </div>
                    {Number(acc.hold_cents) > 0 && (
                      <div>
                        <div className="text-amber-500/70 text-xs uppercase tracking-wider mb-1">Active Holds</div>
                        <div className="font-mono text-amber-400">{formatInr(Number(acc.hold_cents)/100)}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            <div className="glass-card p-6">
              <h3 className="text-lg font-bold text-white mb-4">Recent Transactions</h3>
              {data.recentTransactions.length === 0 ? (
                <div className="text-slate-500 py-8 text-center border border-dashed border-white/10 rounded-xl">No recent transactions.</div>
              ) : (
                <div className="divide-y divide-white/5">
                  {data.recentTransactions.map((tx: any) => (
                    <div key={tx.id} className="py-4 flex justify-between items-center group">
                      <div>
                        <div className="font-medium text-slate-200 group-hover:text-emerald-400 transition-colors">{tx.kind}</div>
                        <div className="text-xs text-slate-500 mt-1">{tx.description}</div>
                        <div className="text-[10px] text-slate-600 mt-1">{new Date(tx.created_at).toLocaleString()}</div>
                      </div>
                      <div className={`font-mono font-bold ${Number(tx.amount_cents) > 0 ? 'text-emerald-400' : 'text-white'}`}>
                        {Number(tx.amount_cents) > 0 ? '+' : ''}{formatInr(Number(tx.amount_cents) / 100)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {data.kycStatus !== 'VERIFIED' && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 flex gap-3 items-start">
                <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-amber-400 font-bold text-sm">Action Required</h4>
                  <p className="text-amber-500/80 text-xs mt-1 leading-relaxed">
                    Your KYC status is currently {data.kycStatus}. Please visit your nearest branch to verify your identity. Outbound transfers are disabled.
                  </p>
                </div>
              </div>
            )}

            <div className="glass-card p-6">
              <h3 className="text-white font-bold mb-4">Quick Actions</h3>
              {data.kycStatus === 'VERIFIED' ? (
                <Link 
                  href={`/portal/transfer?accountId=${data.accounts[0]?.id}`}
                  className="flex items-center justify-between p-4 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400 group-hover:scale-110 transition-transform">
                      <ArrowRightLeft className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-emerald-400 font-bold">Send Money</div>
                      <div className="text-emerald-500/70 text-xs">Transfer to any branch</div>
                    </div>
                  </div>
                </Link>
              ) : (
                <div className="flex items-center justify-between p-4 bg-slate-800/50 border border-white/5 rounded-xl opacity-50 cursor-not-allowed">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-700/50 rounded-lg text-slate-500">
                      <ArrowRightLeft className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-slate-400 font-bold">Send Money</div>
                      <div className="text-slate-500 text-xs">Transfers locked (KYC)</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
