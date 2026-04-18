'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/axios';

type UserRow = {
  id: string;
  email: string;
  phone: string;
  full_name: string;
  kyc_status: string;
  created_at: string;
};

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.get<{ users: UserRow[] }>('/api/users');
      setUsers(res.data.users ?? []);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Could not load customers';
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 md:px-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold text-red-400">Administration</h1>
        <p className="mt-2 text-slate-400">Customer records (MAIN database).</p>

        <div className="mt-8 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-white">Customers</h2>
          <button
            type="button"
            onClick={() => void load()}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            Refresh
          </button>
        </div>

        {error ? (
          <p className="mt-4 text-sm text-red-300">{error}</p>
        ) : loading ? (
          <p className="mt-6 text-sm text-slate-500">Loading…</p>
        ) : users.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">No users yet.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-slate-800 bg-slate-950/80 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Phone</th>
                    <th className="px-4 py-3 font-medium">KYC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-medium text-white">{u.full_name}</td>
                      <td className="px-4 py-3 text-slate-300">{u.email}</td>
                      <td className="px-4 py-3 font-mono text-slate-400">{u.phone}</td>
                      <td className="px-4 py-3 text-slate-400">{u.kyc_status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
