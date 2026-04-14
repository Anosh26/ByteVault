export default function BalanceCard({ amount }: { amount: string }) {
  return (
    <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-8 rounded-2xl shadow-xl">
      <p className="text-blue-100 text-sm font-medium uppercase tracking-wider">Total Balance</p>
      <h2 className="text-4xl font-bold mt-2">$ {amount}</h2>
      <div className="flex gap-4 mt-6">
        <button className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm transition">
          Transfer
        </button>
        <button className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm transition">
          Deposit
        </button>
      </div>
    </div>
  );
}

