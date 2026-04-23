'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/axios';

type AuditLog = {
  id: string;
  actor_type: string;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  meta: any;
  created_at: string;
};

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await api.get<{ logs: AuditLog[] }>('/api/audit');
        setLogs(res.data.logs);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to fetch audit logs');
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 p-8 text-slate-200">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10">
          <h1 className="text-3xl font-bold text-white">System Audit Trail</h1>
          <p className="text-slate-400">Operational history and compliance logs.</p>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-red-400">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950/50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-6 py-4">Timestamp</th>
                  <th className="px-6 py-4">Actor</th>
                  <th className="px-6 py-4">Action</th>
                  <th className="px-6 py-4">Entity</th>
                  <th className="px-6 py-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-slate-500">
                      Loading audit records...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-slate-500">
                      No audit records found.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/30">
                      <td className="whitespace-nowrap px-6 py-4 text-xs text-slate-400">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold uppercase text-blue-400">
                            {log.actor_type}
                          </span>
                          <span className="font-mono text-xs text-slate-300">{log.actor_id}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-white">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-xs text-slate-300">{log.entity_type}</span>
                          <span className="font-mono text-[10px] text-slate-500">
                            {log.entity_id}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <pre className="max-w-xs overflow-hidden text-ellipsis text-[10px] text-slate-500">
                          {JSON.stringify(log.meta)}
                        </pre>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
