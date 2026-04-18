'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import api from '@/lib/axios';
import type { Employee } from '@/lib/types';

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

  return (
    <nav className="flex items-center justify-between border-b border-slate-800 bg-slate-950 p-6">
      <Link
        href={isLoggedIn ? '/dashboard' : '/login'}
        className="text-2xl font-bold tracking-tighter text-blue-500"
      >
        BYTE <span className="text-white">VAULT</span>
      </Link>

      <div className="flex flex-wrap items-center gap-4 text-sm font-medium">
        {!ready ? (
          <span className="h-9 w-24 animate-pulse rounded-lg bg-slate-800/80" aria-hidden />
        ) : isLoggedIn ? (
          <>
            <span className="hidden text-slate-500 sm:inline">{employee?.email}</span>
            <Link href="/dashboard" className="text-slate-400 transition hover:text-white">
              Dashboard
            </Link>
            <Link href="/admin" className="text-slate-400 transition hover:text-red-400">
              Admin
            </Link>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg bg-red-600/10 px-4 py-2 text-red-500 transition hover:bg-red-600 hover:text-white"
            >
              Logout
            </button>
          </>
        ) : (
          <Link href="/login" className="rounded-lg bg-blue-600 px-4 py-2 text-white">
            Login
          </Link>
        )}
      </div>
    </nav>
  );
}
