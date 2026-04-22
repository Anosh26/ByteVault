'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/axios';
import { formatInr } from '@/lib/format';
import { Users, FileText, BarChart3, RotateCcw, Calendar, RefreshCcw, ArrowRightLeft } from 'lucide-react';
import { newIdempotencyKey } from '@/lib/idempotency';

type UserRow = {
  id: string;
  email: string;
  phone: string;
  full_name: string;
  kyc_status: string;
  created_at: string;
};

type JournalEntry = {
  id: string;
  kind: string;
  description: string;
  external_ref: string | null;
  reversal_of_entry_id: string | null;
  created_at: string;
};

type ReconResult = {
  code: string;
  name: string;
  net_balance_cents: string;
};

export default function AdminPage() {
  const [tab, setTab] = useState<'users' | 'journal' | 'recon'>('users');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Users data
  const [users, setUsers] = useState<UserRow[]>([]);
  // Journal data
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  // Recon data
  const [reconReport, setReconReport] = useState<ReconResult[]>([]);
  const [startDate, setStartDate] = useState(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const loadUsers = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.get<{ users: UserRow[] }>('/api/users');
      setUsers(res.data.users ?? []);
    } catch {
      setError('Could not load customers');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadJournal = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.get<{ entries: JournalEntry[] }>('/api/ledger/entries');
      setEntries(res.data.entries ?? []);
    } catch {
      setError('Could not load journal entries');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRecon = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.get<{ totals: ReconResult[] }>(`/api/ledger/reconciliation/report?start_date=${startDate}&end_date=${endDate}`);
      setReconReport(res.data.totals ?? []);
    } catch {
      setError('Reconciliation report failed');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    if (tab === 'users') void loadUsers();
    else if (tab === 'journal') void loadJournal();
    else if (tab === 'recon') void loadRecon();
  }, [tab, loadUsers, loadJournal, loadRecon]);

  async function onReverse(entryId: string) {
    const reason = window.prompt('Enter reason for reversal:');
    if (!reason) return;

    try {
      await api.post(`/api/ledger/entries/${entryId}/reverse`, 
        { reason },
        { headers: { 'Idempotency-Key': newIdempotencyKey() } }
      );
      void loadJournal();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Reversal failed');
    }
  }

  return (
    <div className="min-h-screen bg-[#020617] px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight glow-text">Admin Terminal</h1>
            <p className="text-slate-500 text-sm font-medium mt-1 uppercase tracking-widest">Internal Ledger Control & Auditing</p>
          </div>
          
          <nav className="flex gap-1 rounded-xl bg-slate-900/50 p-1 border border-white/5">
            <button
              onClick={() => setTab('users')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all ${tab === 'users' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              <Users suppressHydrationWarning className="h-4 w-4" /> Users
            </button>
            <button
              onClick={() => setTab('journal')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all ${tab === 'journal' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              <FileText suppressHydrationWarning className="h-4 w-4" /> Journal
            </button>
            <button
              onClick={() => setTab('recon')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all ${tab === 'recon' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              <BarChart3 suppressHydrationWarning className="h-4 w-4" /> Recon
            </button>
          </nav>
        </header>

        {error && (
          <div className="mt-8 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400 font-medium">
            {error}
          </div>
        )}

        <main className="mt-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {tab === 'users' && (
            <div className="glass-card overflow-hidden">
               <div className="p-6 border-b border-white/5 flex items-center justify-between">
                 <h3 className="font-bold text-white flex items-center gap-2"><Users suppressHydrationWarning className="h-4 w-4 text-blue-400" /> Customer Registry</h3>
                 <button onClick={() => void loadUsers()} className="text-slate-500 hover:text-blue-400 transition-colors"><RefreshCcw suppressHydrationWarning className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-left text-sm border-collapse">
                   <thead>
                     <tr className="bg-slate-950/50 text-[10px] uppercase tracking-widest text-slate-500 h-10">
                       <th className="px-6">Name</th>
                       <th className="px-6">Email / Phone</th>
                       <th className="px-6">KYC Status</th>
                       <th className="px-6 text-right">Registered</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-white/[0.03]">
                     {users.map(u => (
                       <tr key={u.id} className="hover:bg-white/[0.02] transition-colors group">
                         <td className="px-6 py-4 font-bold text-white">{u.full_name}</td>
                         <td className="px-6 py-4">
                           <div className="text-slate-300">{u.email}</div>
                           <div className="text-[10px] text-slate-500 font-mono">{u.phone}</div>
                         </td>
                         <td className="px-6 py-4"><span className={`badge ${u.kyc_status === 'VERIFIED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400'}`}>{u.kyc_status}</span></td>
                         <td className="px-6 py-4 text-right text-slate-500 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            </div>
          )}

          {tab === 'journal' && (
            <div className="glass-card overflow-hidden">
               <div className="p-6 border-b border-white/5 flex items-center justify-between">
                  <h3 className="font-bold text-white flex items-center gap-2"><FileText suppressHydrationWarning className="h-4 w-4 text-purple-400" /> General Ledger Journal</h3>
                  <button onClick={() => void loadJournal()} className="text-slate-500 hover:text-purple-400 transition-colors"><RefreshCcw suppressHydrationWarning className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-left text-sm border-collapse">
                   <thead>
                     <tr className="bg-slate-950/50 text-[10px] uppercase tracking-widest text-slate-500 h-10">
                       <th className="px-6">Status / ID</th>
                       <th className="px-6">Description</th>
                       <th className="px-6">Date</th>
                       <th className="px-6 text-right">Actions</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-white/[0.03]">
                     {entries.map(e => (
                       <tr key={e.id} className="hover:bg-white/[0.02] transition-colors group">
                         <td className="px-6 py-4">
                            {e.kind === 'REVERSAL' ? (
                              <span className="badge bg-red-500/10 text-red-400 border border-red-500/20">REVERSAL</span>
                            ) : e.reversal_of_entry_id ? (
                              <span className="badge bg-slate-500/10 text-slate-400 border border-white/5">REVERSED</span>
                            ) : (
                              <span className="badge bg-blue-500/10 text-blue-400 border border-blue-500/20">{e.kind}</span>
                            )}
                            <div className="mt-1 font-mono text-[9px] text-slate-600">{e.id}</div>
                         </td>
                         <td className="px-6 py-4">
                           <div className="font-medium text-slate-200">{e.description}</div>
                           {e.external_ref && <div className="text-[10px] text-slate-500">Ref: {e.external_ref}</div>}
                         </td>
                         <td className="px-6 py-4 text-slate-500 text-xs">{new Date(e.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                         <td className="px-6 py-4 text-right">
                           {!e.reversal_of_entry_id && e.kind !== 'REVERSAL' && (
                             <button
                               onClick={() => onReverse(e.id)}
                               className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-400 transition-all hover:bg-red-500 hover:text-white"
                             >
                               <RotateCcw suppressHydrationWarning className="h-3 w-3" /> Reverse
                             </button>
                           )}
                           {e.reversal_of_entry_id && (
                             <div className="text-[10px] text-slate-500 italic">Reversed by {e.reversal_of_entry_id.slice(0,8)}</div>
                           )}
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            </div>
          )}

          {tab === 'recon' && (
            <div className="space-y-6">
              <div className="glass-card p-6 flex flex-wrap items-end gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1"><Calendar suppressHydrationWarning className="h-3 w-3" /> Start Date</label>
                  <input type="date" className="input-field max-w-[200px]" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1"><Calendar suppressHydrationWarning className="h-3 w-3" /> End Date</label>
                  <input type="date" className="input-field max-w-[200px]" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
                <button onClick={() => void loadRecon()} className="btn-primary flex items-center gap-2 h-11 px-8"><BarChart3 suppressHydrationWarning className="h-4 w-4" /> Run Reconciliation</button>
              </div>

              <div className="glass-card overflow-hidden">
                <div className="p-6 border-b border-white/5 h-16 flex items-center">
                  <h3 className="font-bold text-white flex items-center gap-2"><ArrowRightLeft suppressHydrationWarning className="h-4 w-4 text-emerald-400" /> Internal Account Net Balances</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-950/50 text-[10px] uppercase tracking-widest text-slate-500 h-12">
                        <th className="px-6 font-bold">Account Registry Code</th>
                        <th className="px-6 font-bold">Display Name</th>
                        <th className="px-6 text-right font-bold">Period Multi-Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                      {reconReport.map(r => (
                        <tr key={r.code} className="hover:bg-white/[0.01]">
                          <td className="px-6 py-5 font-mono text-xs text-emerald-500">{r.code}</td>
                          <td className="px-6 py-5 font-bold text-slate-200">{r.name}</td>
                          <td className={`px-6 py-5 text-right font-mono text-lg font-black ${Number(r.net_balance_cents) === 0 ? 'text-slate-600' : 'text-white'}`}>
                            {formatInr(Number(r.net_balance_cents) / 100)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-6 bg-slate-950/50 border-t border-white/5 text-[10px] text-slate-500 leading-relaxed italic">
                  Note: Values representing Internal Clearing accounts should strictly net to ₹0.00 at the end of settled business cycles. Residual balances indicate pending items in the distribution pipeline.
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
