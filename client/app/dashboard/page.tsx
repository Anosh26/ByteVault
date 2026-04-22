'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '@/lib/axios';
import BalanceCard from '@/components/ui/BalanceCard';
import AccountsTable from '@/components/dashboard/AccountsTable';
import TransferWorkflow from '@/components/dashboard/TransferWorkflow';
import type { AccountRow, Employee } from '@/lib/types';

export default function DashboardPage() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [meRes, accRes] = await Promise.all([
        api.get<{ employee: Employee }>('/api/auth/me'),
        api.get<{ accounts: AccountRow[] }>('/api/accounts'),
      ]);
      setEmployee(meRes.data.employee);
      setAccounts(accRes.data.accounts ?? []);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not load dashboard';
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalBalance = useMemo(() => {
    return accounts.reduce((sum, a) => sum + Number(a.balance), 0);
  }, [accounts]);

  if (loading && !employee) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-slate-950">
        <p className="text-slate-400">Loading your workspace…</p>
      </div>
    );
  }

  if (error && !employee) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-slate-950 px-4">
        <p className="text-center text-red-300">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!employee) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto max-w-5xl px-4 py-10 md:px-8">
        <header className="mb-10">
          <p className="text-sm font-medium uppercase tracking-wide text-blue-400/90">Employee workspace</p>
          <h1 className="mt-2 text-3xl font-bold text-white">
            Hello, <span className="text-slate-200">{employee.email}</span>
          </h1>
          <p className="mt-1 text-slate-400">
            Role: <span className="font-medium text-slate-200">{employee.role}</span>
            {employee.branchId ? (
              <>
                {' '}
                · Branch: <span className="font-bold text-slate-200">{employee.branchName || employee.branchId}</span>
              </>
            ) : null}
          </p>
        </header>

        {error ? (
          <div className="mb-6 rounded-xl border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
            {error}
          </div>
        ) : null}

        <div className="grid gap-10">
          <BalanceCard amountInr={totalBalance} loading={loading} />
          <AccountsTable accounts={accounts} loading={loading} error={null} />
          <TransferWorkflow employee={employee} />
        </div>
      </div>
    </div>
  );
}
