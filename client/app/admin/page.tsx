export default function AdminPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-red-500">System Administrator</h1>
      <p className="text-slate-400 mt-2">Sensitive operations only.</p>

      <div className="mt-8 grid gap-4">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
          <h3 className="font-bold text-white text-lg">Manage Users</h3>
          <p className="text-sm text-slate-500">View and edit all account holders.</p>
        </div>
      </div>
    </div>
  );
}

