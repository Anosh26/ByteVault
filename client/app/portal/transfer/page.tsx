'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/axios';
import { ArrowLeft, Send } from 'lucide-react';
import Link from 'next/link';
import { newIdempotencyKey } from '@/lib/idempotency';

export default function CustomerTransfer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountId = searchParams.get('accountId');

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
      // Wait 2 seconds and redirect to dashboard to see hold
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
      <div className="min-h-screen bg-slate-950 p-4 md:p-8 flex items-center justify-center">
        <div className="glass-card p-8 text-center max-w-md w-full">
          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6">
            <Send className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Transfer Initiated!</h2>
          <p className="text-slate-400 mb-6">Your transfer is pending bank approval. Redirecting you to your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-xl mx-auto space-y-8">
        <header className="flex items-center gap-4 pb-6 border-b border-white/10">
          <Link href="/portal/dashboard" className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold text-white">Send Money</h1>
        </header>

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
    </div>
  );
}
