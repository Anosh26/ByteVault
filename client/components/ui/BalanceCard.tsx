import { formatInr } from '@/lib/format';

export default function BalanceCard({
  amountInr,
  loading,
}: {
  amountInr: number;
  loading?: boolean;
}) {
  const display = loading ? '…' : formatInr(amountInr);

  return (
    <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-blue-900 p-8 shadow-xl">
      <p className="text-sm font-medium uppercase tracking-wider text-blue-100/90">Total on MAIN (all listed accounts)</p>
      <h2 className="mt-2 text-4xl font-bold tabular-nums">{display}</h2>
      <p className="mt-2 text-sm text-blue-100/70">Balances are shown in INR to match the ledger.</p>
    </div>
  );
}
