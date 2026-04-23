'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/axios';
import { Send } from 'lucide-react';
import { newIdempotencyKey } from '@/lib/idempotency';
import { usePortal } from '../layout';

export default function CustomerTransfer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, reload } = usePortal();
  const accountId = searchParams.get('accountId') || data?.accounts?.[0]?.id;

  const [toAccount, setToAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId) {
      setError('No source account selected.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('customerToken');
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      const payload = {
        fromAccountId: accountId,
        toAccountNumber: toAccount,
        amountCents: Math.round(Number(amount) * 100),
      };

      await api.post('/api/customer/transfer', payload, {
        headers: {
          'Idempotency-Key': newIdempotencyKey(),
        }
      });
      
      setSuccess(true);
      reload();
      setTimeout(() => {
        router.push('/portal/dashboard');
      }, 2000);
      
    } catch (err: any) {
      setError(err.response?.data?.error || 'Transfer failed');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="glass-card p-10 text-center max-w-md w-full">
          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6">
            <Send className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Transfer Initiated!</h2>
          <p className="text-slate-400 mb-6">Your transfer is pending bank approval. Your available balance has been reduced by the hold amount. Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-xl">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Send Money</h2>
        <p className="text-slate-500 text-sm mt-1">Transfer funds to any account across branches.</p>
      </div>

      {/* Source Account Selector */}
      {data && data.accounts.length > 1 && (
        <div className="glass-card p-4">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">From Account</div>
          <select
            className="w-full bg-slate-900 border border-white/10 rounded-lg p-3 text-white font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            value={accountId}
            onChange={e => router.push(`/portal/transfer?accountId=${e.target.value}`)}
          >
            {data.accounts.map((acc: any) => (
              <option key={acc.id} value={acc.id}>
                {acc.account_number} — Available: ₹{acc.available_balance}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="glass-card p-8">
        <form onSubmit={handleTransfer} className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">To Account Number</label>
            <input
              type="text"
              value={toAccount}
              onChange={e => setToAccount(e.target.value)}
              className="w-full bg-slate-900 border border-white/10 rounded-lg p-4 text-white font-mono text-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder="e.g. 10002"
              required
            />
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Amount (₹)</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full bg-slate-900 border border-white/10 rounded-lg p-4 text-white text-2xl font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder="0.00"
              min="1"
              step="0.01"
              required
            />
          </div>

          {error && <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg font-medium">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-lg transition-all text-lg shadow-lg shadow-emerald-900/50 flex justify-center items-center gap-2"
          >
            {loading ? <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" /> : <><Send className="w-5 h-5" /> Send Transfer</>}
          </button>
        </form>
      </div>
    </div>
  );
}
