'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import api from '@/lib/axios';
import type { Employee } from '@/lib/types';
import { Shield, LayoutDashboard, Settings, LogOut, Loader2 } from 'lucide-react';

export default function Navbar() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [ready, setReady] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const token = window.localStorage.getItem('bytevault_access_token');
    if (!token) {
      setEmployee(null);
      setReady(true);
      return;
    }
    api
      .get<{ employee: Employee }>('/api/auth/me')
      .then((res) => setEmployee(res.data.employee))
      .catch(() => setEmployee(null))
      .finally(() => setReady(true));
  }, [pathname]);

  const logout = () => {
    window.localStorage.removeItem('bytevault_access_token');
    document.cookie = 'bv_logged_in=; path=/; max-age=0';
    setEmployee(null);
    router.push('/login');
    router.refresh();
  };

  const isLoggedIn = Boolean(employee);

  // Hide Navbar on login page
  if (pathname === '/login') return null;

  return (
    <nav className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/80 backdrop-blur-md px-6 py-4">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <Link
          href={isLoggedIn ? '/dashboard' : '/login'}
          className="flex items-center gap-2 group transition-transform active:scale-95"
        >
          <div className="rounded-lg bg-blue-600 p-1.5 shadow-lg shadow-blue-500/20">
            <Shield suppressHydrationWarning className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-black tracking-tighter text-white">
            BYTE<span className="text-blue-500">VAULT</span>
          </span>
        </Link>

        <div className="flex items-center gap-6">
          {!ready ? (
            <Loader2 suppressHydrationWarning className="h-4 w-4 animate-spin text-slate-500" />
          ) : isLoggedIn ? (
            <>
              <div className="hidden lg:flex flex-col items-end gap-0.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 leading-none">{employee?.role}</span>
                <span className="text-xs font-medium text-slate-400">{employee?.email}</span>
              </div>
              
              <div className="h-4 w-px bg-white/5 mx-2 hidden sm:block" />

              <div className="flex items-center gap-2">
                <Link 
                  href="/dashboard" 
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${pathname === '/dashboard' ? 'bg-white/5 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                >
                  <LayoutDashboard suppressHydrationWarning className="h-4 w-4" />
                  <span className="hidden sm:inline">Dashboard</span>
                </Link>

                {employee?.role === 'ADMIN' && (
                  <Link 
                    href="/admin" 
                    className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${pathname === '/admin' ? 'bg-red-500/10 text-red-400' : 'text-slate-400 hover:text-red-400 hover:bg-white/5'}`}
                  >
                    <Settings suppressHydrationWarning className="h-4 w-4" />
                    <span className="hidden sm:inline">Admin</span>
                  </Link>
                )}

                {employee?.role === 'ADMIN' && (
                  <Link 
                    href="/admin/audit" 
                    className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${pathname === '/admin/audit' ? 'bg-blue-500/10 text-blue-400' : 'text-slate-400 hover:text-blue-400 hover:bg-white/5'}`}
                  >
                    <LayoutDashboard suppressHydrationWarning className="h-4 w-4" />
                    <span className="hidden sm:inline">Audit Trail</span>
                  </Link>
                )}

                <button
                  type="button"
                  onClick={logout}
                  className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-slate-500 transition-all hover:bg-red-500/10 hover:text-red-400"
                >
                  <LogOut suppressHydrationWarning className="h-4 w-4" />
                  <span className="hidden sm:inline">Exit</span>
                </button>
              </div>
            </>
          ) : (
            <Link href="/login" className="btn-primary py-2 text-xs">
              Employee Portal
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
