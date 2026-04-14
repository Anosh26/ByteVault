const transactions = [
  { id: 1, name: 'Amazon Web Services', date: 'Oct 24', amount: '-$120.00', type: 'debit' },
  { id: 2, name: 'Salary Deposit', date: 'Oct 23', amount: '+$2,500.00', type: 'credit' },
];

export default function TransactionList() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <h3 className="text-xl font-bold mb-4">Recent Activity</h3>
      <div className="space-y-4">
        {transactions.map((t) => (
          <div
            key={t.id}
            className="flex justify-between items-center p-3 hover:bg-slate-800/50 rounded-xl transition"
          >
            <div>
              <p className="font-semibold">{t.name}</p>
              <p className="text-sm text-slate-400">{t.date}</p>
            </div>
            <p className={`font-mono font-bold ${t.type === 'credit' ? 'text-green-400' : 'text-red-400'}`}>
              {t.amount}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

