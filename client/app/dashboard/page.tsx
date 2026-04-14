'use client';

import BalanceCard from '@/components/ui/BalanceCard';
import TransactionList from '@/components/ui/TransactionList';

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen bg-slate-950">
      <aside className="w-64 border-r border-slate-800 p-6 hidden md:block">
        <nav className="space-y-4">
          <div className="p-3 bg-blue-600/10 text-blue-500 rounded-lg font-bold">Dashboard</div>
          <div className="p-3 text-slate-400 hover:text-white cursor-pointer transition">Transactions</div>
          <div className="p-3 text-slate-400 hover:text-white cursor-pointer transition">Cards</div>
          <div className="p-3 text-slate-400 hover:text-white cursor-pointer transition">Settings</div>
        </nav>
      </aside>

      <main className="flex-1 p-8">
        <header className="mb-8">
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="text-slate-400">Here's what's happening with your vault today.</p>
        </header>

        <div className="grid gap-8">
          <BalanceCard amount="12,450.00" />
          <TransactionList />
        </div>
      </main>
    </div>
  );
}

