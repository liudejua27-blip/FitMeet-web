import { useCallback, useEffect, useState } from 'react';
import * as api from '@/api/client';
import { ApiError } from '@/api/client';
import { agentApprovalsApi } from '@/api/agentApprovalsApi';
import { useAuthStore } from '@/stores';
import { AgentStatusBadge } from './AgentStatusBadge';

type ConnectionSummary = {
  id: number;
  agentName: string;
  agentDisplayName: string;
  permissionLevel: string;
  status: 'active' | 'suspended' | 'revoked';
  dailyActionLimit: number;
  dailyActionsUsed: number;
  lastActiveAt: string | null;
  createdAt: string;
};

type ActivityLog = {
  id: number;
  agentConnectionId: number | null;
  action: string;
  result: string;
  riskScore: number;
  createdAt: string;
};

type ApprovalRequest = {
  id: number;
  agentConnectionId: number | null;
  type: string;
  actionType?: string;
  skillName?: string;
  summary: string;
  reason?: string;
  agentRationale?: string;
  payload?: Record<string, unknown>;
  riskLevel: string;
  expiresAt?: string;
  createdAt: string;
};

type AgentPermissions = {
  mode: 'assisted' | 'basic' | 'normal' | 'standard' | 'open';
  allowSendMessage: boolean;
  allowCreateActivity: boolean;
  allowContactExchange: boolean;
};

const PERMISSION_LABEL: Record<string, string> = {
  read_only: 'Read Only',
  draft_mode: 'Draft Mode',
  basic: 'Basic Mode',
  standard: 'Standard Mode',
  open: 'Open Mode',
  sandbox_internal: 'Sandbox',
};

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

// 后端的 ApiError.message 在 401/500 时常常只是 "Unauthorized" / "Internal
// server error"。这里把它翻译成对用户更友好的中文提示。
function friendlyError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return '登录已过期，请重新登录。';
    if (e.status === 403) return '当前账号没有访问 Agent Gateway 的权限。';
    if (e.status === 404) return '接口暂不可用，可能尚未上线。';
    if (e.status >= 500) return `${fallback}（服务暂时不可用，请稍后重试）`;
    const raw = e.message;
    if (!raw || raw === 'Unauthorized' || raw === 'Forbidden' || raw === 'Internal Server Error') {
      return fallback;
    }
    return raw;
  }
  if (e instanceof Error) return e.message || fallback;
  return fallback;
}

function describeApprovalEffect(actionType: string | undefined): string {
  switch (actionType) {
    case 'send_invite':
    case 'send_message':
      return '发送站内邀约消息并推进候选人状态';
    case 'add_friend':
      return '将该候选人加为好友';
    case 'invite_activity':
      return '向候选人发出活动邀请';
    case 'create_activity':
      return '创建活动并邀请候选人参与';
    default:
      return actionType || '执行该 Agent 行为';
  }
}

function pickString(obj: Record<string, unknown> | undefined, ...keys: string[]): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

function pickNumber(obj: Record<string, unknown> | undefined, ...keys: string[]): number | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

function autopilotEnabled(p: AgentPermissions | null): boolean {
  if (!p) return false;
  // 与 AgentControlCenterPage 的语义一致：开放/正常/标准 视为允许自动驾驶；
  // 同时需要至少一个 "代用户写动作" 的开关打开，否则只能生成草稿。
  const modeOk = p.mode === 'open' || p.mode === 'normal' || p.mode === 'standard';
  const writeOk =
    p.allowSendMessage || p.allowCreateActivity || p.allowContactExchange;
  return modeOk && writeOk;
}

export function AgentLiveControlPanel() {
  const openLogin = useAuthStore((state) => state.openLogin);
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [permissions, setPermissions] = useState<AgentPermissions | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [busyApproval, setBusyApproval] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!api.getToken()) {
      setConnections([]);
      setActivity([]);
      setApprovals([]);
      setPermissions(null);
      setError('登录已过期，请重新登录。');
      setLoading(false);
      return;
    }

    try {
      // 单个接口失败不应让整面板空白：分别 catch，落地空值，并把第一条非空
      // 错误暴露给用户。
      const [connsR, actR, pendingR, permR] = await Promise.allSettled([
        api.request<ConnectionSummary[]>('/agents/connections'),
        api.request<{ items?: ActivityLog[] }>('/agents/activity?page=1&limit=20'),
        agentApprovalsApi.pending(),
        api.request<AgentPermissions>('/agent/permissions'),
      ]);
      setConnections(connsR.status === 'fulfilled' ? connsR.value ?? [] : []);
      setActivity(
        actR.status === 'fulfilled' ? actR.value?.items ?? [] : [],
      );
      setApprovals(pendingR.status === 'fulfilled' ? pendingR.value ?? [] : []);
      setPermissions(permR.status === 'fulfilled' ? permR.value ?? null : null);

      const firstFail = [connsR, actR, pendingR, permR].find(
        (r) => r.status === 'rejected',
      );
      if (firstFail && firstFail.status === 'rejected') {
        setError(friendlyError(firstFail.reason, '加载 Agent Gateway 数据失败'));
      } else {
        setError(null);
      }
    } catch (e) {
      setError(friendlyError(e, '加载 Agent Gateway 数据失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSetStatus = async (id: number, next: 'pause' | 'resume') => {
    setBusyId(id);
    try {
      await api.request(`/agents/connections/${id}/${next}`, { method: 'POST' });
      await refresh();
    } catch (e) {
      setError(friendlyError(e, next === 'pause' ? '暂停 Agent 失败' : '启动 Agent 失败'));
    } finally {
      setBusyId(null);
    }
  };

  const handleApproval = async (id: number, decision: 'approve' | 'reject') => {
    setBusyApproval(id);
    try {
      if (decision === 'approve') await agentApprovalsApi.approve(id);
      else await agentApprovalsApi.reject(id);
      await refresh();
    } catch (e) {
      setError(
        friendlyError(e, decision === 'approve' ? '同意操作失败' : '拒绝操作失败'),
      );
    } finally {
      setBusyApproval(null);
    }
  };

  return (
    <section className="agent-connection-section" aria-label="Live agent control">
      <div className="agent-section-heading">
        <span>LIVE AGENT CONTROL</span>
        <h2>实时 Agent 控制</h2>
      </div>

      {error && (
        <div className="agent-reserved-banner" role="alert">
          <span>ERROR</span>
          <p>{error}</p>
          {error.includes('登录') && (
            <button type="button" className="agent-action agent-action--primary" onClick={openLogin}>
              重新登录
            </button>
          )}
        </div>
      )}

      {/* Autopilot 状态 —— 根据用户 AgentSettings.mode 推导 */}
      <div
        className="agent-reserved-banner"
        style={{
          borderColor: autopilotEnabled(permissions)
            ? 'rgba(200,255,128,0.25)'
            : 'rgba(244,239,230,0.12)',
          background: autopilotEnabled(permissions)
            ? 'rgba(107,122,90,0.12)'
            : 'rgba(13,13,11,0.6)',
        }}
      >
        <span>
          {autopilotEnabled(permissions) ? 'AUTOPILOT ACTIVE' : 'AUTOPILOT IDLE'}
        </span>
        <p>
          {permissions === null
            ? '正在读取自动驾驶状态…'
            : autopilotEnabled(permissions)
            ? 'AI 正在持续为你寻找合适人选，高风险动作仍会进入待审批队列。'
            : '自动驾驶未开启。可在「Agent 控制台 · 权限」中升级为「正常/开放」模式后启用。暂不支持从Web手动运行一次（后端 接口仅对 Agent Token 开放，未同步到 JWT）。'}
        </p>
      </div>

      {loading ? (
        <p style={{ color: 'rgba(244,239,230,0.6)', fontSize: 13 }}>
          正在加载已连接 Agent…
        </p>
      ) : connections.length === 0 ? (
        <p style={{ color: 'rgba(244,239,230,0.6)', fontSize: 13 }}>
          当前账号尚未注册任何 Agent 连接。先在「支持接入的 Agent」中完成注册即可。
        </p>
      ) : (
        <div className="agent-connection-list">
          {connections.map((conn) => {
            const limitText = `${conn.dailyActionsUsed}/${conn.dailyActionLimit}`;
            const isExpanded = expandedId === conn.id;
            const logsForAgent = activity.filter(
              (a) => a.agentConnectionId === conn.id,
            );
            const statusBadge =
              conn.status === 'active'
                ? 'Connected'
                : conn.status === 'suspended'
                ? 'Pending Approval'
                : 'Disabled';

            return (
              <article
                key={conn.id}
                className="agent-connection-card"
                aria-label={`${conn.agentDisplayName || conn.agentName} live control`}
              >
                <div className="agent-connection-card__halo" aria-hidden="true" />
                <div className="agent-connection-card__header">
                  <div className="agent-connection-card__identity">
                    <span className="agent-connection-card__mark">
                      {(conn.agentDisplayName || conn.agentName)
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    <div>
                      <h3>{conn.agentDisplayName || conn.agentName}</h3>
                      <p>#{conn.id} · {conn.agentName}</p>
                    </div>
                  </div>
                  <AgentStatusBadge value={statusBadge} />
                </div>

                <dl className="agent-connection-card__meta">
                  <div>
                    <dt>Autonomy Level</dt>
                    <dd>
                      {PERMISSION_LABEL[conn.permissionLevel] ??
                        conn.permissionLevel}
                    </dd>
                  </div>
                  <div>
                    <dt>Daily Limit</dt>
                    <dd>{limitText}</dd>
                  </div>
                  <div>
                    <dt>最近活动</dt>
                    <dd>{formatTime(conn.lastActiveAt)}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{conn.status}</dd>
                  </div>
                </dl>

                <div className="agent-connection-card__actions">
                  {conn.status === 'active' ? (
                    <button
                      type="button"
                      className="agent-action agent-action--ghost"
                      disabled={busyId === conn.id}
                      onClick={() => handleSetStatus(conn.id, 'pause')}
                    >
                      {busyId === conn.id ? '...' : 'Pause Agent'}
                    </button>
                  ) : conn.status === 'suspended' ? (
                    <button
                      type="button"
                      className="agent-action agent-action--primary"
                      disabled={busyId === conn.id}
                      onClick={() => handleSetStatus(conn.id, 'resume')}
                    >
                      {busyId === conn.id ? '...' : 'Resume Agent'}
                    </button>
                  ) : (
                    <button type="button" className="agent-action" disabled>
                      Revoked
                    </button>
                  )}
                  <button
                    type="button"
                    className="agent-action"
                    onClick={() =>
                      setExpandedId(isExpanded ? null : conn.id)
                    }
                  >
                    {isExpanded ? 'Hide Activity' : 'View Activity'}
                  </button>
                </div>

                {isExpanded && (
                  <div
                    className="agent-revoke-confirm"
                    style={{ marginTop: 18 }}
                  >
                    <p style={{ marginBottom: 8, fontWeight: 800 }}>
                      最近 20 条行为日志（仅显示此 Agent）
                    </p>
                    {logsForAgent.length === 0 ? (
                      <p>暂无记录。</p>
                    ) : (
                      <ul
                        style={{
                          listStyle: 'none',
                          margin: 0,
                          padding: 0,
                          maxHeight: 220,
                          overflowY: 'auto',
                        }}
                      >
                        {logsForAgent.map((log) => (
                          <li
                            key={log.id}
                            style={{
                              padding: '8px 0',
                              borderBottom:
                                '1px solid rgba(244,239,230,0.06)',
                              display: 'grid',
                              gridTemplateColumns: '1fr auto',
                              gap: 8,
                              color: 'rgba(244,239,230,0.72)',
                              fontSize: 12,
                            }}
                          >
                            <span>
                              <strong>{log.action}</strong> · {log.result}
                              {log.riskScore > 0
                                ? ` · risk ${log.riskScore.toFixed(2)}`
                                : ''}
                            </span>
                            <span style={{ opacity: 0.6 }}>
                              {formatTime(log.createdAt)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <div className="agent-section-heading" style={{ marginTop: 40 }}>
        <span>PENDING APPROVALS</span>
        <h2>待审批行为 ({approvals.length})</h2>
      </div>

      {approvals.length === 0 ? (
        <p style={{ color: 'rgba(244,239,230,0.6)', fontSize: 13 }}>
          当前没有待审批的 Agent 行为。
        </p>
      ) : (
        <div className="agent-connection-list">
          {approvals.map((req) => {
            const targetName = pickString(
              req.payload,
              '_targetDisplayName',
              'targetName',
              'candidateName',
            );
            const targetUserId = pickNumber(
              req.payload,
              'toUserId',
              'targetUserId',
              'candidateUserId',
            );
            const candidate = (req.payload?.candidateSnapshot ?? null) as
              | { name?: string; score?: number; commonTags?: string[]; reasons?: string[] }
              | null;
            const previewText = pickString(req.payload, 'content', 'message');
            return (
            <article
              key={req.id}
              className="agent-connection-card"
              aria-label={`Approval ${req.id}`}
            >
              <div className="agent-connection-card__halo" aria-hidden="true" />
              <div className="agent-connection-card__header">
                <div className="agent-connection-card__identity">
                  <span className="agent-connection-card__mark">AP</span>
                  <div>
                    <h3>{req.summary || req.actionType || req.type}</h3>
                    <p>
                      #{req.id} · {req.type}
                      {req.skillName ? ` · ${req.skillName}` : ''}
                    </p>
                  </div>
                </div>
                <AgentStatusBadge
                  value={
                    req.riskLevel === 'high'
                      ? 'High Risk'
                      : req.riskLevel === 'low'
                      ? 'Low Risk'
                      : 'Medium Risk'
                  }
                  compact
                />
              </div>

              <div
                style={{
                  display: 'grid',
                  gap: 6,
                  margin: '14px 0 4px',
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: 'rgba(244,239,230,0.78)',
                }}
              >
                {req.reason && (
                  <p style={{ color: 'rgba(255,193,128,0.9)' }}>
                    为什么需要审批：{req.reason}
                  </p>
                )}
                <p>
                  审批后会执行：{describeApprovalEffect(req.actionType || req.skillName || req.type)}
                </p>
                {(targetName || targetUserId || candidate) && (
                  <p>
                    目标用户：{targetName || candidate?.name || '候选人'}
                    {targetUserId ? ` · #${targetUserId}` : ''}
                    {typeof candidate?.score === 'number'
                      ? `（匹配分 ${candidate.score}）`
                      : ''}
                  </p>
                )}
                {candidate?.commonTags?.length ? (
                  <p style={{ color: 'rgba(244,239,230,0.55)' }}>
                    共同标签：{candidate.commonTags.slice(0, 4).join('、')}
                  </p>
                ) : null}
                {candidate?.reasons?.length ? (
                  <p style={{ color: 'rgba(244,239,230,0.55)' }}>
                    推荐原因：{candidate.reasons.slice(0, 2).join('；')}
                  </p>
                ) : null}
                {req.agentRationale && (
                  <p style={{ color: 'rgba(244,239,230,0.55)' }}>
                    Agent 说明：{req.agentRationale}
                  </p>
                )}
              </div>

              {previewText && (
                <pre
                  style={{
                    maxHeight: 120,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    background: 'rgba(10,10,9,0.8)',
                    color: 'rgba(169,165,149,0.95)',
                    padding: 10,
                    borderRadius: 8,
                    fontSize: 12,
                    lineHeight: 1.5,
                    margin: '4px 0 8px',
                  }}
                >
                  {previewText}
                </pre>
              )}

              <dl className="agent-connection-card__meta">
                <div>
                  <dt>Agent</dt>
                  <dd>#{req.agentConnectionId ?? '—'}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{formatTime(req.createdAt)}</dd>
                </div>
                <div>
                  <dt>Expires</dt>
                  <dd>{formatTime(req.expiresAt)}</dd>
                </div>
                <div>
                  <dt>Risk</dt>
                  <dd>{req.riskLevel}</dd>
                </div>
              </dl>

              <div className="agent-connection-card__actions">
                <button
                  type="button"
                  className="agent-action agent-action--primary"
                  disabled={busyApproval === req.id}
                  onClick={() => handleApproval(req.id, 'approve')}
                >
                  {busyApproval === req.id ? '...' : '同意 Approve'}
                </button>
                <button
                  type="button"
                  className="agent-action agent-action--ghost"
                  disabled={busyApproval === req.id}
                  onClick={() => handleApproval(req.id, 'reject')}
                >
                  {busyApproval === req.id ? '...' : '拒绝 Reject'}
                </button>
              </div>
            </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
