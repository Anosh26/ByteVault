'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/axios';
import { formatInr } from '@/lib/format';
import { Users, FileText, BarChart3, RotateCcw, Calendar, RefreshCcw, ArrowRightLeft, Zap, TrendingUp, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';
import { newIdempotencyKey } from '@/lib/idempotency';

type UserRow = {
  id: string;
  email: string;
  phone: string;
  pan_card: string | null;
  full_name: string;
  kyc_status: string;
  total_balance: string;
  account_count: number;
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
  const [tab, setTab] = useState<'users' | 'journal' | 'recon' | 'batch'>('users');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [eodState, setEodState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [eomState, setEomState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [eodResult, setEodResult] = useState<any>(null);
  const [eomResult, setEomResult] = useState<any>(null);

  // Users data
  const [users, setUsers] = useState<UserRow[]>([]);
  // Journal data
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  // Recon data
  const [reconReport, setReconReport] = useState<ReconResult[]>([]);

  // Add User Form State
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ fullName: '', email: '', phone: '', panCard: '', password: '' });
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

  async function runEod() {
    setEodState('loading');
    setEodResult(null);
    try {
      const res = await api.post('/api/admin/jobs/eod-trigger', {});
      setEodResult(res.data);
      setEodState('success');
    } catch (e: any) {
      setEodResult({ error: e.response?.data?.error || 'EOD failed' });
      setEodState('error');
    }
  }

  async function runEom() {
    setEomState('loading');
    setEomResult(null);
    try {
      const res = await api.post('/api/admin/jobs/eom-trigger', {});
      setEomResult(res.data);
      setEomState('success');
      void loadUsers();
    } catch (e: any) {
      setEomResult({ error: e.response?.data?.error || 'EOM failed' });
      setEomState('error');
    }
  }

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

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/api/users', newUser);
      setShowAddUser(false);
      setNewUser({ fullName: '', email: '', phone: '', panCard: '', password: '' });
      void loadUsers();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  }

  async function handleKycUpdate(userId: string, status: 'VERIFIED' | 'REJECTED') {
    try {
      await api.post(`/api/users/${userId}/kyc`, { status });
      void loadUsers();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to update KYC');
    }
  }

  return (
    <div className="min-h-screen bg-[#020617] flex">
      {/* Admin Sidebar */}
      <aside className="w-64 border-r border-white/5 bg-slate-950 flex flex-col shrink-0 sticky top-0 h-screen">
        <div className="p-6 pb-4">
          <h1 className="text-lg font-black tracking-tight glow-text">Admin Terminal</h1>
          <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold mt-1">Ledger Control & Auditing</p>
        </div>

        <nav className="px-3 flex-1 space-y-1">
          <div className="text-[10px] text-slate-600 uppercase tracking-widest font-bold px-3 mb-2">Management</div>
          {([
            { key: 'users', label: 'Users', icon: Users, color: 'blue' },
            { key: 'journal', label: 'Journal', icon: FileText, color: 'blue' },
            { key: 'recon', label: 'Recon', icon: BarChart3, color: 'blue' },
            { key: 'batch', label: 'Batch Jobs', icon: Zap, color: 'amber' },
          ] as const).map(item => {
            const isActive = tab === item.key;
            const activeClass = item.color === 'amber'
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              : 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
            return (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${isActive ? activeClass : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                <item.icon suppressHydrationWarning className="w-4 h-4" />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 p-6 md:p-10 overflow-y-auto min-h-screen">
        {error && (
          <div className="mb-8 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400 font-medium">
            {error}
          </div>
        )}

        <main className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          {tab === 'users' && (
            <div className="glass-card overflow-hidden">
               <div className="p-6 border-b border-white/5 flex items-center justify-between">
                  <h3 className="font-bold text-white flex items-center gap-2"><Users suppressHydrationWarning className="h-4 w-4 text-blue-400" /> Customer Registry</h3>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setShowAddUser(true)}
                      className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2"
                    >
                      <Users className="w-3 h-3" /> Register Customer
                    </button>
                    <button onClick={() => void loadUsers()} className="text-slate-500 hover:text-blue-400 transition-colors">
                      <RefreshCcw suppressHydrationWarning className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-left text-sm border-collapse">
                   <thead>
                     <tr className="bg-slate-950/50 text-[10px] uppercase tracking-widest text-slate-500 h-10">
                       <th className="px-6">Name</th>
                       <th className="px-6">Email / Phone</th>
                       <th className="px-6">KYC Status</th>
                       <th className="px-6 text-right">Balance</th>
                       <th className="px-6 text-right">Registered</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-white/[0.03]">
                     {users.map(u => (
                       <tr key={u.id} className="hover:bg-white/[0.02] transition-colors group">
                         <td className="px-6 py-4 font-bold text-white">{u.full_name}</td>
                         <td className="px-6 py-4">
                           <div className="text-slate-300">{u.email}</div>
                           <div className="text-[10px] text-slate-500 font-mono">{u.phone} {u.pan_card ? `• PAN: ${u.pan_card}` : ''}</div>
                         </td>
                         <td className="px-6 py-4">
                           <div className="flex items-center gap-2">
                             <span className={`badge ${u.kyc_status === 'VERIFIED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : u.kyc_status === 'REJECTED' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'}`}>
                               {u.kyc_status}
                             </span>
                             {u.kyc_status === 'PENDING' && (
                               <>
                                 <button onClick={() => handleKycUpdate(u.id, 'VERIFIED')} className="bg-emerald-600/20 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-bold hover:bg-emerald-600/40 transition-colors border border-emerald-500/20">Verify</button>
                                 <button onClick={() => handleKycUpdate(u.id, 'REJECTED')} className="bg-red-600/20 text-red-400 px-2 py-0.5 rounded text-[10px] font-bold hover:bg-red-600/40 transition-colors border border-red-500/20">Reject</button>
                               </>
                             )}
                           </div>
                         </td>
                         <td className="px-6 py-4 text-right">
                           <span className="font-mono font-bold text-white">{formatInr(Number(u.total_balance))}</span>
                           <div className="text-[10px] text-slate-500">{u.account_count} account{u.account_count !== 1 ? 's' : ''}</div>
                         </td>
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
                  <input type="date" className="input-field max-w-[200px]" value={startDate} onChange={setStartDate} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1"><Calendar suppressHydrationWarning className="h-3 w-3" /> End Date</label>
                  <input type="date" className="input-field max-w-[200px]" value={endDate} onChange={setEndDate} />
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
          {tab === 'batch' && (
            <div className="space-y-6">
              <div className="glass-card p-8">
                <div className="flex items-center gap-3 mb-2">
                  <Zap suppressHydrationWarning className="h-5 w-5 text-amber-400" />
                  <h3 className="text-lg font-black text-white">Batch Processing Engine</h3>
                </div>
                <p className="text-sm text-slate-500 mb-8">Admin-triggered settlement jobs. Each job is wrapped in a database transaction and emits audit logs upon completion. Verify results in the Audit Trail.</p>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="rounded-xl border border-white/5 bg-slate-900/50 p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <Calendar suppressHydrationWarning className="h-4 w-4 text-blue-400" />
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-400">End of Day</span>
                    </div>
                    <p className="text-white font-bold text-base">Run EOD Settlement</p>
                    <p className="text-slate-500 text-xs leading-relaxed">Refreshes materialized views, verifies clearing account nets to zero, audits frozen/suspense accounts, and calculates daily interest accruals (4% p.a.) for all ACTIVE accounts.</p>
                    <button
                      id="btn-run-eod"
                      onClick={() => void runEod()}
                      disabled={eodState === 'loading'}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
                    >
                      {eodState === 'loading' ? <RefreshCcw suppressHydrationWarning className="h-4 w-4 animate-spin" /> : <Zap suppressHydrationWarning className="h-4 w-4" />}
                      {eodState === 'loading' ? 'Running EOD...' : 'Run EOD Settlement'}
                    </button>
                    {eodState === 'success' && eodResult && (
                      <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-4 space-y-2">
                        <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                          <CheckCircle2 suppressHydrationWarning className="h-3.5 w-3.5" /> EOD Completed Successfully
                        </div>
                        <div className="font-mono text-xs text-slate-400">Accruals staged: <span className="text-white">{eodResult.accrualCount}</span></div>
                        <div className="font-mono text-xs text-slate-400">Clearing net: <span className="text-white">₹{(eodResult.clearingNetCents / 100).toFixed(2)}</span></div>
                        <a href="/admin/audit" className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors mt-1">
                          <ExternalLink suppressHydrationWarning className="h-3 w-3" /> Verify in Audit Trail
                        </a>
                      </div>
                    )}
                    {eodState === 'error' && eodResult && (
                      <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4">
                        <div className="flex items-center gap-2 text-red-400 font-bold text-xs mb-1">
                          <AlertTriangle suppressHydrationWarning className="h-3.5 w-3.5" /> EOD Failed
                        </div>
                        <div className="text-xs text-slate-400">{eodResult.error}</div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-white/5 bg-slate-900/50 p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <TrendingUp suppressHydrationWarning className="h-4 w-4 text-emerald-400" />
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-400">End of Month</span>
                    </div>
                    <p className="text-white font-bold text-base">Run EOM Interest Posting</p>
                    <p className="text-slate-500 text-xs leading-relaxed">Aggregates all PENDING interest accruals, posts balanced INTEREST_PAYMENT journal entries (Debit: Interest Expense / Credit: Customer), updates cached balances, and marks accruals as POSTED.</p>
                    <button
                      id="btn-run-eom"
                      onClick={() => void runEom()}
                      disabled={eomState === 'loading'}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
                    >
                      {eomState === 'loading' ? <RefreshCcw suppressHydrationWarning className="h-4 w-4 animate-spin" /> : <TrendingUp suppressHydrationWarning className="h-4 w-4" />}
                      {eomState === 'loading' ? 'Posting Interest...' : 'Run EOM Interest Posting'}
                    </button>
                    {eomState === 'success' && eomResult && (
                      <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-4 space-y-2">
                        <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                          <CheckCircle2 suppressHydrationWarning className="h-3.5 w-3.5" /> EOM Posting Completed
                        </div>
                        <div className="font-mono text-xs text-slate-400">Accounts posted: <span className="text-white">{eomResult.postedCount}</span></div>
                        {eomResult.message && <div className="text-xs text-slate-500 italic">{eomResult.message}</div>}
                        <a href="/admin/audit" className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors mt-1">
                          <ExternalLink suppressHydrationWarning className="h-3 w-3" /> Verify in Audit Trail
                        </a>
                      </div>
                    )}
                    {eomState === 'error' && eomResult && (
                      <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4">
                        <div className="flex items-center gap-2 text-red-400 font-bold text-xs mb-1">
                          <AlertTriangle suppressHydrationWarning className="h-3.5 w-3.5" /> EOM Failed
                        </div>
                        <div className="text-xs text-slate-400">{eomResult.error}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
      {/* Add User Modal */}
      {showAddUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-max-md p-8 relative animate-in fade-in zoom-in duration-300">
            <h2 className="text-xl font-bold text-white mb-6">Register New Customer</h2>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={newUser.fullName}
                  onChange={e => setNewUser({ ...newUser, fullName: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. John Doe"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={newUser.email}
                  onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="john@example.com"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Phone Number</label>
                <input
                  type="text"
                  required
                  value={newUser.phone}
                  onChange={e => setNewUser({ ...newUser, phone: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="+91 ..."
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">PAN Card (Optional)</label>
                <input
                  type="text"
                  maxLength={10}
                  value={newUser.panCard}
                  onChange={e => setNewUser({ ...newUser, panCard: e.target.value.toUpperCase() })}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                  placeholder="ABCDE1234F"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Password (Optional)</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Leave blank for 'securepass'"
                />
              </div>
              
              <div className="flex gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => setShowAddUser(false)}
                  className="flex-1 px-4 py-2.5 border border-white/10 rounded-xl text-slate-400 hover:bg-white/5 transition-all font-bold text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-900/40"
                >
                  {loading ? 'Registering...' : 'Register Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
