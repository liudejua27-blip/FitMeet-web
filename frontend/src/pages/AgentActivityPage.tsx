import { memo, useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '../stores';
import * as api from '../api/client';

type ActionResult = 'success' | 'blocked' | 'pending_approval' | 'error';

interface ActivityLog {
  id: number;
  action: string;
  result: ActionResult;
  riskScore: number;
  blockReason: string | null;
  createdAt: string;
  agentConnection?: { agentDisplayName: string };
}

interface Paged<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

const RESULT_STYLE: Record<ActionResult, string> = {
  success:          'bg-[#6B7A5A]/20 text-[#A8B890]',
  blocked:          'bg-red-500/10 text-red-400',
  pending_approval: 'bg-yellow-500/10 text-yellow-400',
  error:            'bg-zinc-500/10 text-zinc-400',
};

const RESULT_LABEL: Record<ActionResult, string> = {
  success:          '成功',
  blocked:          '已拦截',
  pending_approval: '待确认',
  error:            '错误',
};

function RiskBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = score < 0.4 ? '#6B7A5A' : score < 0.7 ? '#C8A840' : '#C84840';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#2a2a22]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] tabular-nums text-[#555550]">{pct}</span>
    </div>
  );
}

export const AgentActivityPage = memo(function AgentActivityPage() {
  const { isLoggedIn, openLogin } = useAuthStore();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const LIMIT = 20;

  const fetchLogs = useCallback(async (p: number) => {
    if (!isLoggedIn) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.request<Paged<ActivityLog>>(`/agents/activity?page=${p}&limit=${LIMIT}`);
      setLogs(data.data);
      setTotal(data.total);
      setPage(p);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => { fetchLogs(1); }, [fetchLogs]);

  if (!isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-zinc-400">请先登录以查看 Agent 活动记录</p>
        <button onClick={openLogin} className="rounded-xl bg-[#6B7A5A] px-6 py-2 text-sm text-white">
          登录
        </button>
      </div>
    );
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="min-h-screen bg-[#0d0d0b] text-[#E8E4DC] px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-light tracking-tight text-[#F4EFE6]">Agent 活动记录</h1>
          <p className="mt-1 text-sm text-[#555550]">所有 Agent 操作的完整审计日志，共 {total} 条</p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-[#555550] py-4">加载中…</p>
        ) : logs.length === 0 ? (
          <div className="rounded-2xl border border-[#1a1a14] bg-[#111110] p-10 text-center text-sm text-[#3a3a32]">
            暂无 Agent 活动记录
          </div>
        ) : (
          <>
            {/* Table */}
            <div className="overflow-x-auto rounded-2xl border border-[#1e1e18]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1e1e18] text-[10px] uppercase tracking-wider text-[#444440]">
                    <th className="px-4 py-3 text-left">时间</th>
                    <th className="px-4 py-3 text-left">Agent</th>
                    <th className="px-4 py-3 text-left">操作</th>
                    <th className="px-4 py-3 text-left">结果</th>
                    <th className="px-4 py-3 text-left">风险值</th>
                    <th className="px-4 py-3 text-left">原因</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#161610]">
                  {logs.map((log) => (
                    <tr key={log.id} className="bg-[#111110] hover:bg-[#151510] transition-colors">
                      <td className="px-4 py-3 text-xs text-[#555550] whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('zh-CN', {
                          month: '2-digit', day: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#8C8A6E] max-w-[120px] truncate">
                        {log.agentConnection?.agentDisplayName ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-[#C8C4B0]">{log.action}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${RESULT_STYLE[log.result]}`}>
                          {RESULT_LABEL[log.result]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <RiskBar score={log.riskScore} />
                      </td>
                      <td className="px-4 py-3 text-xs text-[#555550] max-w-[160px] truncate">
                        {log.blockReason ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => fetchLogs(page - 1)}
                  disabled={page <= 1}
                  className="rounded-lg border border-[#2a2a22] px-4 py-1.5 text-xs text-[#8C8A6E] disabled:opacity-30 hover:border-[#3a3a30] transition"
                >
                  上一页
                </button>
                <span className="text-xs text-[#444440]">{page} / {totalPages}</span>
                <button
                  onClick={() => fetchLogs(page + 1)}
                  disabled={page >= totalPages}
                  className="rounded-lg border border-[#2a2a22] px-4 py-1.5 text-xs text-[#8C8A6E] disabled:opacity-30 hover:border-[#3a3a30] transition"
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});
