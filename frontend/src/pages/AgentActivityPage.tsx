import { memo, useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '../stores';
import * as api from '../api/client';

type AgentActionStatus = 'planned' | 'executed' | 'pending_approval' | 'rejected' | 'failed';
type AgentRiskLevel = 'low' | 'medium' | 'high';

interface ActivityLog {
  id: number;
  agentId: number | null;
  agentTaskId: number | null;
  actionType: string;
  actionStatus: string;
  riskLevel: string;
  inputSummary: string | null;
  outputSummary: string | null;
  reason: string | null;
  createdAt: string;
}

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

const STATUS_STYLE: Record<AgentActionStatus, string> = {
  planned:          'bg-zinc-500/10 text-zinc-400',
  executed:         'bg-[#6B7A5A]/20 text-[#A8B890]',
  pending_approval: 'bg-yellow-500/10 text-yellow-400',
  rejected:         'bg-red-500/10 text-red-400',
  failed:           'bg-red-500/10 text-red-400',
};

const STATUS_LABEL: Record<AgentActionStatus, string> = {
  planned:          '已计划',
  executed:         '已执行',
  pending_approval: '待确认',
  rejected:         '已拒绝',
  failed:           '失败',
};

const RISK_LABEL: Record<AgentRiskLevel, string> = {
  low: '低',
  medium: '中',
  high: '高',
};

const RISK_STYLE: Record<AgentRiskLevel, string> = {
  low: 'bg-[#6B7A5A]/20 text-[#A8B890]',
  medium: 'bg-yellow-500/10 text-yellow-400',
  high: 'bg-red-500/10 text-red-400',
};

function normalizeStatus(status: string): AgentActionStatus | null {
  return status in STATUS_LABEL ? (status as AgentActionStatus) : null;
}

function normalizeRiskLevel(level: string): AgentRiskLevel | null {
  return level in RISK_LABEL ? (level as AgentRiskLevel) : null;
}

function RiskBadge({ level }: { level: string }) {
  const normalized = normalizeRiskLevel(level);
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${normalized ? RISK_STYLE[normalized] : 'bg-zinc-500/10 text-zinc-400'}`}>
      {normalized ? RISK_LABEL[normalized] : level || '未知'}
    </span>
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
      const data = await api.requestProtected<Paged<ActivityLog>>(
        `/agents/activity?page=${p}&limit=${LIMIT}`,
      );
      setLogs(data.items);
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
                    <th className="px-4 py-3 text-left">来源</th>
                    <th className="px-4 py-3 text-left">操作</th>
                    <th className="px-4 py-3 text-left">状态</th>
                    <th className="px-4 py-3 text-left">风险</th>
                    <th className="px-4 py-3 text-left">原因</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#161610]">
                  {logs.map((log) => {
                    const status = normalizeStatus(log.actionStatus);
                    return (
                      <tr key={log.id} className="bg-[#111110] hover:bg-[#151510] transition-colors">
                      <td className="px-4 py-3 text-xs text-[#555550] whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('zh-CN', {
                          month: '2-digit', day: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#8C8A6E] max-w-[120px] truncate">
                        {log.agentId ? `Agent #${log.agentId}` : '系统'}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-[#C8C4B0]">{log.actionType}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${status ? STATUS_STYLE[status] : 'bg-zinc-500/10 text-zinc-400'}`}>
                          {status ? STATUS_LABEL[status] : log.actionStatus || '未知'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <RiskBadge level={log.riskLevel} />
                      </td>
                      <td className="px-4 py-3 text-xs text-[#555550] max-w-[160px] truncate">
                        {log.reason ?? log.outputSummary ?? log.inputSummary ?? (log.agentTaskId ? `task #${log.agentTaskId}` : '—')}
                      </td>
                      </tr>
                    );
                  })}
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
