'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Navbar() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    setIsLoggedIn(Boolean(window.localStorage.getItem('bytevault_access_token')));
  }, [pathname]);

  const logout = () => {
    window.localStorage.removeItem('bytevault_access_token');
    document.cookie = 'bv_logged_in=; path=/; max-age=0';
    setIsLoggedIn(false);
    router.push('/login');
    router.refresh();
  };

  return (
    <nav className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950">
      <Link
        href={isLoggedIn ? '/dashboard' : '/login'}
        className="text-2xl font-bold tracking-tighter text-blue-500"
      >
        BYTE <span className="text-white">VAULT</span>
      </Link>

      <div className="space-x-6 text-sm font-medium">
        {isLoggedIn ? (
          <>
            <Link href="/dashboard" className="text-slate-400 hover:text-white transition">
              Dashboard
            </Link>
            <Link href="/admin" className="text-slate-400 hover:text-red-400 transition">
              Admin
            </Link>
            <button
              onClick={logout}
              className="bg-red-600/10 text-red-500 px-4 py-2 rounded-lg hover:bg-red-600 hover:text-white transition"
            >
              Logout
            </button>
          </>
        ) : (
          <Link href="/login" className="bg-blue-600 px-4 py-2 rounded-lg text-white">
            Login
          </Link>
        )}
      </div>
    </nav>
  );
}