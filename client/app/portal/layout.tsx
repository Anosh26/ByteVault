'use client';

import { useEffect, useState, createContext, useContext, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import api from '@/lib/axios';
import { formatInr } from '@/lib/format';
import Link from 'next/link';
import {
  LayoutDashboard,
  ArrowRightLeft,
  Clock,
  ShieldAlert,
  LogOut,
  Wallet,
  ChevronRight,
  Shield,
} from 'lucide-react';

type DashboardData = {
  accounts: any[];
  recentTransactions: any[];
  kycStatus: string;
  fullName?: string;
  pendingTransfers?: any[];
};

const PortalContext = createContext<{
  data: DashboardData | null;
  reload: () => void;
}>({ data: null, reload: () => {} });

export function usePortal() {
  return useContext(PortalContext);
}

const navItems = [
  { href: '/portal/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/portal/history', label: 'History', icon: Clock },
  { href: '/portal/transfer', label: 'Send Money', icon: ArrowRightLeft, kycRequired: true },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const isLoginPage = pathname === '/portal/login';

  const loadData = useCallback(async () => {
    const token = localStorage.getItem('customerToken');
    if (!token) {
      router.push('/portal/login');
      return;
    }
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    try {
      const res = await api.get('/api/customer/dashboard');
      setData(res.data);
    } catch {
      localStorage.removeItem('customerToken');
      router.push('/portal/login');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (isLoginPage) {
      setLoading(false);
      return;
    }
    loadData();
  }, [isLoginPage, loadData]);

  if (isLoginPage) return <>{children}</>;

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const totalAvailable = data.accounts.reduce(
    (sum: number, acc: any) => sum + Number(acc.available_balance ?? 0),
    0
  );

  function handleLogout() {
    localStorage.removeItem('customerToken');
    router.push('/portal/login');
  }

  return (
    <PortalContext.Provider value={{ data, reload: loadData }}>
      <div className="min-h-screen bg-slate-950 flex">
        {/* Sidebar */}
        <aside className="w-72 border-r border-white/5 bg-slate-950 flex flex-col shrink-0 sticky top-0 h-screen overflow-y-auto">
          {/* Brand */}
          <div className="p-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-900/40">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">ByteVault</h1>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-medium">Customer Portal</p>
              </div>
            </div>
            
            {/* Hello Message */}
            <div className="mt-6">
              <h2 className="text-slate-400 text-xs font-medium">Welcome back,</h2>
              <p className="text-white font-bold text-lg truncate">{data.fullName || 'User'}</p>
            </div>
          </div>

          {/* Balance Summary Card */}
          <div className="mx-4 mb-4 p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/10">
            <div className="text-[10px] text-emerald-400/70 uppercase tracking-widest font-bold mb-1">Total Available</div>
            <div className="text-2xl font-bold text-white tracking-tight">{formatInr(totalAvailable)}</div>
            <div className="text-[10px] text-slate-500 mt-1">{data.accounts.length} account{data.accounts.length !== 1 ? 's' : ''}</div>
          </div>

          {/* KYC Alert */}
          {data.kycStatus !== 'VERIFIED' && (
            <div className="mx-4 mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/15 flex gap-2.5 items-start">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-amber-400 font-bold text-xs">KYC {data.kycStatus}</div>
                <p className="text-amber-500/70 text-[10px] mt-0.5 leading-relaxed">
                  Visit your branch to verify identity. Transfers are disabled.
                </p>
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="px-3 flex-1 space-y-1">
            <div className="text-[10px] text-slate-600 uppercase tracking-widest font-bold px-3 mb-2">Menu</div>
            {navItems.map(item => {
              const isActive = pathname === item.href || (item.href !== '/portal/dashboard' && pathname.startsWith(item.href));
              const isLocked = item.kycRequired && data.kycStatus !== 'VERIFIED';

              if (isLocked) {
                return (
                  <div
                    key={item.href}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 cursor-not-allowed opacity-50"
                  >
                    <item.icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{item.label}</span>
                    <span className="ml-auto text-[9px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-full font-bold">KYC</span>
                  </div>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${
                    isActive
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <item.icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'group-hover:text-white'}`} />
                  <span className="text-sm font-medium">{item.label}</span>
                  {isActive && <ChevronRight className="w-3 h-3 ml-auto" />}
                </Link>
              );
            })}
          </nav>

          {/* Accounts List */}
          <div className="px-3 mt-4 mb-4">
            <div className="text-[10px] text-slate-600 uppercase tracking-widest font-bold px-3 mb-2">Accounts</div>
            {data.accounts.map((acc: any) => (
              <div key={acc.id} className="px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                      <Wallet className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <div>
                      <div className="text-xs font-mono text-slate-300">{acc.account_number}</div>
                      <div className="text-[10px] text-slate-600">{acc.status}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono font-bold text-white">{formatInr(acc.available_balance)}</div>
                    {Number(acc.hold_cents) > 0 && (
                      <div className="text-[9px] text-amber-400 font-mono">-{formatInr(Number(acc.hold_cents) / 100)} held</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Transaction Pipeline */}
          {data.pendingTransfers && data.pendingTransfers.length > 0 && (
            <div className="px-3 mt-4 mb-4">
              <div className="text-[10px] text-amber-500 uppercase tracking-widest font-bold px-3 mb-2 flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Pipeline (Pending)
              </div>
              <div className="space-y-1">
                {data.pendingTransfers.map((pt: any) => (
                  <div key={pt.id} className="px-3 py-2.5 rounded-xl bg-amber-500/5 border border-amber-500/10">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] text-slate-400">To {pt.to_account_number}</span>
                      <span className="text-[10px] font-bold text-amber-500">₹{pt.amount}</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                      <div className="bg-amber-500 h-full w-1/3 animate-progress" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Logout */}
          <div className="mt-auto p-4 border-t border-white/5">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/5 transition-all text-sm font-medium"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 md:p-10 overflow-y-auto min-h-screen">
          {children}
        </main>
      </div>
    </PortalContext.Provider>
  );
}
