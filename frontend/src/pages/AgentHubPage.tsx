import { memo, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores';
import * as api from '../api/client';

type PermissionLevel = 'read_only' | 'draft_mode' | 'basic' | 'standard' | 'open' | 'sandbox_internal';
type ConnectionStatus = 'active' | 'suspended' | 'revoked';

interface AgentConnection {
  id: number;
  agentName: string;
  agentDisplayName: string;
  permissionLevel: PermissionLevel;
  status: ConnectionStatus;
  dailyActionsUsed: number;
  dailyActionLimit: number;
  lastActiveAt: string | null;
  createdAt: string;
}

interface RegisterForm {
  agentName: string;
  agentDisplayName: string;
  agentWebhookUrl: string;
  permissionLevel: PermissionLevel;
  dailyActionLimit: number;
}

const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  read_only: '只读',
  draft_mode: '草稿模式',
  basic: '基础模式',
  standard: '正常模式',
  open: '开放模式',
  sandbox_internal: '内部沙盒',
};

const PERMISSION_DESCRIPTIONS: Record<PermissionLevel, string> = {
  read_only: '只能读取偏好和匹配结果。',
  draft_mode: '可提交社交需求和生成草稿，不能直接连接。',
  basic: '可提交需求与草稿，用户确认后才执行连接动作。',
  standard: '允许低风险自动动作，高风险仍需确认。',
  open: '最高自由度，仅受平台安全风控拦截。',
  sandbox_internal: '内部沙盒：不会接触真实用户。',
};

const STATUS_STYLE: Record<ConnectionStatus, string> = {
  active: 'bg-[#6B7A5A]/20 text-[#C8FF80]',
  suspended: 'bg-yellow-500/10 text-yellow-300',
  revoked: 'bg-red-500/10 text-red-300',
};

export const AgentHubPage = memo(function AgentHubPage() {
  const { isLoggedIn, openLogin, user } = useAuthStore();
  const [connections, setConnections] = useState<AgentConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<RegisterForm>({
    agentName: 'openclaw',
    agentDisplayName: 'OpenClaw',
    agentWebhookUrl: '',
    permissionLevel: 'basic',
    dailyActionLimit: 100,
  });
  const isVerified = Boolean(user?.verified);

  const fetchConnections = useCallback(async () => {
    if (!isLoggedIn) return;
    if (!isVerified) {
      setConnections([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api.request<AgentConnection[]>('/agents/connections');
      setConnections(data);
    } catch (e: unknown) {
      setError(formatAgentError(e, '加载 Agent 连接失败'));
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, isVerified]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const handleRegister = async () => {
    setError(null);
    setCopied(false);
    setNewToken(null);
    if (!isVerified) {
      setError('生成 Agent Token 前需要先完成实名认证。请到「我的主页 > 设置 > 安全与认证」提交实名信息，审核通过后再生成。');
      return;
    }
    try {
      const result = await api.request<{ agentToken: string }>('/agents/personal-token', {
        method: 'POST',
      });
      setNewToken(result.agentToken);
      setShowForm(false);
      fetchConnections();
    } catch (e: unknown) {
      setError(formatAgentError(e, '注册 Agent Token 失败'));
    }
  };

  const handleCopyToken = async () => {
    if (!newToken) return;
    await navigator.clipboard.writeText(newToken);
    setCopied(true);
  };

  const handleRevoke = async (id: number) => {
    if (!window.confirm('确认撤销这个 Agent Token？撤销后 OpenClaw 将无法继续调用 FitMeet。')) return;
    try {
      await api.request(`/agents/connections/${id}`, { method: 'DELETE' });
      setConnections((prev) => prev.filter((c) => c.id !== id));
    } catch (e: unknown) {
      setError(formatAgentError(e, '撤销失败'));
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <p className="text-zinc-500">请先登录 FitMeet，然后为 OpenClaw 创建 Agent Token。</p>
        <button onClick={openLogin} className="rounded-xl bg-[#6B7A5A] px-6 py-2 text-sm text-white">
          登录
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0b] px-4 py-8 text-[#E8E4DC] sm:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-light tracking-tight text-[#F4EFE6]">Agent Token</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#8C8A6E]">
                  给 OpenClaw、QClaw 或自定义 Agent 创建访问凭证。Token 让 FitMeet 知道 Agent 代表哪个用户、拥有哪些权限、调用记录归属到谁。
                </p>
                <Link
                  to="/agent-control"
                  className="mt-3 inline-flex items-center gap-1 text-xs text-[#C8FF80] underline-offset-4 hover:underline"
                >
                  打开 Agent 控制台 · 权限与待确认动作 →
                </Link>
              </div>
              <button
                onClick={handleRegister}
                className={`shrink-0 rounded-xl px-5 py-2 text-sm font-medium text-white transition ${
                  isVerified
                    ? 'bg-[#6B7A5A] hover:bg-[#7A8A68]'
                    : 'border border-[#6B7A5A]/35 bg-[#6B7A5A]/35 text-[#E8E4DC]/80 hover:bg-[#6B7A5A]/45'
                }`}
              >
                {isVerified ? '生成专属 Token' : '先完成实名'}
              </button>
            </div>

            {!isVerified && (
              <div className="mt-5 rounded-xl border border-[#6B7A5A]/25 bg-[#6B7A5A]/10 px-4 py-3 text-sm leading-6 text-[#D6D0BC]">
                Agent Token 会代表你的账号调用 FitMeet，因此需要先通过实名认证。
                <Link to="/profile" className="ml-1 font-medium text-[#C8FF80] underline underline-offset-4">
                  去我的主页提交认证
                </Link>
              </div>
            )}

            {error && (
              <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {newToken && (
              <div className="mt-5 rounded-xl border border-[#3a3a30] bg-[#111110] p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-wider text-[#C8FF80]">Agent Token 仅显示一次</p>
                  <button
                    onClick={handleCopyToken}
                    className="rounded-lg border border-[#2a2a22] px-3 py-1.5 text-xs text-[#E8E4DC] transition hover:border-[#6B7A5A]"
                  >
                    {copied ? '已复制' : '复制'}
                  </button>
                </div>
                <code className="mt-3 block select-all break-all rounded-lg bg-[#0A0A09] p-4 font-mono text-xs text-[#C8FF80]">
                  {newToken}
                </code>
                <pre className="mt-3 overflow-x-auto rounded-lg bg-[#0A0A09] p-4 text-xs leading-6 text-[#A9A595]">
                  <code>{`FITMEET_API_BASE_URL=https://your-fitmeet-domain.com/api
FITMEET_AGENT_TOKEN=${newToken}`}</code>
                </pre>
              </div>
            )}

            {showForm && (
              <div className="mt-5 rounded-2xl border border-[#2a2a22] bg-[#111110] p-6">
                <p className="text-sm font-medium text-[#E8E4DC]">创建 OpenClaw Token</p>
                <p className="mt-1 text-xs text-[#696955]">推荐权限选择“辅助模式”：OpenClaw 可以提交需求，真正连接前仍由用户确认。</p>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Field label="Agent 类型">
                    <select
                      value={form.agentName}
                      onChange={(e) => setForm((f) => ({ ...f, agentName: e.target.value }))}
                      className="w-full rounded-xl border border-[#2a2a22] bg-[#0d0d0b] px-3 py-2 text-sm text-[#E8E4DC] outline-none focus:border-[#6B7A5A]"
                    >
                      {['openclaw', 'codex', 'hermes', 'qclaw', 'custom'].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </Field>

                  <Field label="显示名称">
                    <input
                      value={form.agentDisplayName}
                      onChange={(e) => setForm((f) => ({ ...f, agentDisplayName: e.target.value }))}
                      placeholder="OpenClaw"
                      className="w-full rounded-xl border border-[#2a2a22] bg-[#0d0d0b] px-3 py-2 text-sm text-[#E8E4DC] placeholder-[#555550] outline-none focus:border-[#6B7A5A]"
                    />
                  </Field>

                  <Field label="权限等级">
                    <select
                      value={form.permissionLevel}
                      onChange={(e) => setForm((f) => ({ ...f, permissionLevel: e.target.value as PermissionLevel }))}
                      className="w-full rounded-xl border border-[#2a2a22] bg-[#0d0d0b] px-3 py-2 text-sm text-[#E8E4DC] outline-none focus:border-[#6B7A5A]"
                    >
                      {(Object.entries(PERMISSION_LABELS) as [PermissionLevel, string][]).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs leading-5 text-[#696955]">{PERMISSION_DESCRIPTIONS[form.permissionLevel]}</p>
                  </Field>

                  <Field label="每日调用上限">
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={form.dailyActionLimit}
                      onChange={(e) => setForm((f) => ({ ...f, dailyActionLimit: +e.target.value }))}
                      className="w-full rounded-xl border border-[#2a2a22] bg-[#0d0d0b] px-3 py-2 text-sm text-[#E8E4DC] outline-none focus:border-[#6B7A5A]"
                    />
                  </Field>

                  <Field label="Webhook URL（可选）" className="sm:col-span-2">
                    <input
                      value={form.agentWebhookUrl}
                      onChange={(e) => setForm((f) => ({ ...f, agentWebhookUrl: e.target.value }))}
                      placeholder="https://..."
                      className="w-full rounded-xl border border-[#2a2a22] bg-[#0d0d0b] px-3 py-2 text-sm text-[#E8E4DC] placeholder-[#555550] outline-none focus:border-[#6B7A5A]"
                    />
                  </Field>
                </div>

                <div className="mt-5 flex gap-3">
                  <button
                    onClick={handleRegister}
                    className="rounded-xl bg-[#6B7A5A] px-6 py-2 text-sm font-medium text-white transition hover:bg-[#7A8A68]"
                  >
                    生成 Token
                  </button>
                  <button
                    onClick={() => setShowForm(false)}
                    className="rounded-xl border border-[#2a2a22] px-6 py-2 text-sm text-[#8C8A6E] transition hover:text-[#E8E4DC]"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </section>

          <aside className="rounded-2xl border border-[#1e1e18] bg-[#111110] p-5">
            <h2 className="text-base font-medium text-[#F4EFE6]">配置步骤</h2>
            <div className="mt-4 space-y-4 text-sm leading-6 text-[#A9A595]">
              <Step index={1}>
                <span>下载 Social Skills：</span>
                <code className="break-all rounded bg-black/20 px-1.5 py-0.5">
                  git clone https://github.com/LiuChong27/social-skills.git
                </code>
              </Step>
              <Step index={2}>在这里创建 OpenClaw Agent Token，并复制保存。</Step>
              <Step index={3}>在 OpenClaw 本地配置 `FITMEET_API_BASE_URL` 和 `FITMEET_AGENT_TOKEN`。</Step>
              <Step index={4}>让 OpenClaw 调用 `/api/agent/skills/manifest` 验证连接。</Step>
            </div>
          </aside>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-[#F4EFE6]">已创建的 Agent Token</h2>
            <button onClick={fetchConnections} className="text-xs text-[#8C8A6E] transition hover:text-[#E8E4DC]">刷新</button>
          </div>

          {loading ? (
            <p className="py-4 text-sm text-[#555550]">加载中...</p>
          ) : connections.length === 0 ? (
            <div className="rounded-2xl border border-[#1a1a14] bg-[#111110] p-10 text-center text-sm text-[#555550]">
              暂无 Agent Token。点击“创建 Token”开始。
            </div>
          ) : (
            connections.map((conn) => (
              <div
                key={conn.id}
                className="flex items-center gap-4 rounded-2xl border border-[#1e1e18] bg-[#111110] px-5 py-4"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1e1e14] text-sm font-bold text-[#8C8A6E]">
                  {conn.agentDisplayName[0]?.toUpperCase() ?? 'A'}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-[#E8E4DC]">{conn.agentDisplayName}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${STATUS_STYLE[conn.status]}`}>
                      {conn.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[#696955]">
                    {PERMISSION_LABELS[conn.permissionLevel]} · 今日 {conn.dailyActionsUsed}/{conn.dailyActionLimit} 次
                    {conn.lastActiveAt && ` · 最后活跃 ${new Date(conn.lastActiveAt).toLocaleString('zh-CN')}`}
                  </p>
                </div>

                {conn.status !== 'revoked' && (
                  <button
                    onClick={() => handleRevoke(conn.id)}
                    className="shrink-0 text-xs text-[#8C8A6E] transition hover:text-red-300"
                  >
                    撤销
                  </button>
                )}
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
});

function Field({
  children,
  label,
  className = '',
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <label className={`block space-y-2 ${className}`}>
      <span className="text-xs font-medium text-[#8C8A6E]">{label}</span>
      {children}
    </label>
  );
}

function Step({ index, children }: { index: number; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#6B7A5A] text-[11px] font-bold text-white">
        {index}
      </span>
      <p>{children}</p>
    </div>
  );
}

function formatAgentError(error: unknown, fallback: string) {
  if (error instanceof api.ApiError) {
    const responseCode =
      typeof error.payload?.message === 'object' &&
      !Array.isArray(error.payload.message) &&
      error.payload.message !== null &&
      'code' in error.payload.message
        ? String((error.payload.message as { code?: unknown }).code)
        : undefined;
    if (
      error.status === 409 ||
      responseCode === 'AGENT_TOKEN_ALREADY_EXISTS' ||
      error.rawBody?.includes('AGENT_TOKEN_ALREADY_EXISTS')
    ) {
      return '已有可用 Token。Token 只显示一次；如需重新生成，请先撤销现有 Token。';
    }

    if (error.status === 401) {
      return '请重新登录后再生成 Agent Token。';
    }

    if (error.status === 403) {
      return '实名未通过或权限不足，请先完成实名认证后再生成 Agent Token。';
    }

    if (error.status >= 500) {
      return 'Agent Token 服务异常，请稍后重试；如果持续失败，请检查后端日志。';
    }
  }

  return error instanceof Error ? error.message : fallback;
}
