'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/axios';
import { Shield, Lock, Mail, Loader2, Sparkles, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/api/auth/employee/login', { email, password });
      const { accessToken } = res.data ?? {};
      if (!accessToken) throw new Error('No access token returned');
      window.sessionStorage.setItem('bytevault_access_token', accessToken);
      router.push('/dashboard');
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Login failed';
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-[90vh] items-center justify-center px-4 overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-1/4 -left-20 h-96 w-96 rounded-full bg-blue-600/10 blur-[100px] animate-float" />
      <div className="absolute bottom-1/4 -right-20 h-96 w-96 rounded-full bg-purple-600/10 blur-[100px] animate-float" style={{ animationDelay: '-3s' }} />

      <div className="relative w-full max-w-md animate-in fade-in zoom-in duration-700">
        <div className="glass-card p-10 shadow-[0_0_80px_-20px_rgba(59,130,246,0.15)] ring-1 ring-white/10">
          
          <div className="flex flex-col items-center">
            <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-xl shadow-blue-500/20 mb-6 group cursor-default">
              <Shield suppressHydrationWarning className="h-8 w-8 text-white transition-transform group-hover:scale-110" />
            </div>
            <h2 className="text-3xl font-black glow-text tracking-tight">Access ByteVault</h2>
            <p className="mt-2 text-sm text-slate-500 font-medium">Enterprise Distributed Ledger System</p>
          </div>

          <form className="mt-10 space-y-5" onSubmit={onSubmit}>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Work Email</label>
                <div className="relative group">
                  <Mail suppressHydrationWarning className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 transition-colors group-focus-within:text-blue-400" />
                  <input 
                    type="email" 
                    className="input-field pl-11"
                    placeholder="name@bytevault.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Password</label>
                <div className="relative group">
                  <Lock suppressHydrationWarning className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 transition-colors group-focus-within:text-blue-400" />
                  <input 
                    type={showPassword ? "text" : "password"} 
                    className="input-field pl-11 pr-11"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-400 font-bold animate-in shake-in duration-300">
                {error}
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="btn-primary w-full h-12 flex items-center justify-center gap-2 group mt-2"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Sparkles suppressHydrationWarning className="h-4 w-4 text-blue-200 transition-transform group-hover:rotate-12" />
                  Authenticate Securely
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-white/5 flex flex-col items-center justify-center gap-6">
            <button
              onClick={() => router.push('/portal/login')}
              className="text-xs font-bold text-slate-400 hover:text-white transition-colors"
            >
              Are you a customer? Go to Customer Portal →
            </button>
            <div className="flex items-center gap-6">
              <div className="flex flex-col items-center gap-1.5">
                 <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                 <span className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter">System Ready</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 grayscale opacity-40 hover:grayscale-0 hover:opacity-100 transition-all cursor-help">
                 <Shield suppressHydrationWarning className="h-3 w-3 text-blue-500" />
                 <span className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter">2PC Enforced</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}