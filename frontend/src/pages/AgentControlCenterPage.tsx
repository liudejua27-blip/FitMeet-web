import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores';
import * as api from '../api/client';
import { ApiError } from '../api/client';

// ── Types kept narrow & local: this page owns the schema ─────────────
type AgentMode = 'assisted' | 'basic' | 'normal' | 'standard' | 'open';
type RiskLevel = 'low' | 'medium' | 'high';
type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

interface AgentSettings {
  id: number;
  userId: number;
  agentConnectionId: number | null;
  mode: AgentMode;
  allowSearch: boolean;
  allowDraftMessage: boolean;
  allowSendMessage: boolean;
  allowAutoReply: boolean;
  allowCreateActivity: boolean;
  allowJoinActivity: boolean;
  allowShareLocation: boolean;
  allowUploadProof: boolean;
  allowContactExchange: boolean;
  maxDailyMessages: number;
  requireApprovalForFirstMessage: boolean;
  requireApprovalForOfflineMeeting: boolean;
  requireApprovalForPhotoUpload: boolean;
  requireApprovalForAll: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ApprovalRequest {
  id: number;
  type: string;
  actionType?: string;
  skillName: string;
  payload: Record<string, unknown>;
  summary: string;
  reason?: string;
  createdBy?: string;
  relatedSocialRequestId?: number | null;
  relatedCandidateId?: number | null;
  riskLevel: RiskLevel;
  status: ApprovalStatus;
  agentRationale: string;
  expiresAt: string;
  createdAt: string;
}

const MODE_LABEL: Record<AgentMode, string> = {
  assisted: '基础模式',
  basic: '基础模式',
  normal: '正常模式',
  standard: '正常模式',
  open: '开放模式',
};

const MODE_DESC: Record<AgentMode, string> = {
  assisted:
    'Agent 只能建议和生成草稿；发送消息、邀约、加好友、创建活动都会进入待确认。',
  basic:
    'Agent 可以发帖、识别意图、搜索匹配、生成破冰话术与推荐。首条私信、交换联系方式、加好友、线下邀约、创建活动、上传完成凭证都需要你点「同意」后才会执行。最安全。',
  normal:
    'Agent 可以自动匹配、生成邀约并发送站内消息；加好友、交换联系方式、线下活动仍需确认。',
  standard:
    'Agent 可以发帖、自动筛选匹配、进行普通聊天与续聊、协助交换联系方式与发出活动邀请。首次联系陌生人、夜间 / 饮酒 / 支付 / 精确定位 / 上传照片 / 最终发布仍需你确认。',
  open:
    'Agent 拥有最高自由度：可以自动聊天、加好友、邀请用户、发布活动。平台仍会拦截违法、骚扰、色情、暴力、诱导转账、被对方拉黑或对方拒绝 Agent 等高风险行为，开放模式也不能绕过平台安全风控。',
};

const RISK_STYLE: Record<RiskLevel, { ring: string; pill: string; label: string }> = {
  low: {
    ring: 'shadow-[0_0_0_1px_rgba(200,255,128,0.18)]',
    pill: 'bg-[#6B7A5A]/20 text-[#C8FF80]',
    label: '低风险',
  },
  medium: {
    ring: 'shadow-[0_0_0_1px_rgba(255,193,128,0.25)]',
    pill: 'bg-amber-500/15 text-amber-200',
    label: '中风险',
  },
  high: {
    ring: 'shadow-[0_0_0_1px_rgba(255,90,90,0.35)]',
    pill: 'bg-red-500/15 text-red-300',
    label: '高风险',
  },
};

function formatErr(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return '请重新登录后再访问 Agent 控制台。';
    if (e.status === 403) return '实名未通过或权限不足，暂时无法访问 Agent 控制台。';
    // Avoid surfacing raw HTTP statusText like "Unauthorized" / "Forbidden".
    return e.message && e.message !== 'Unauthorized' && e.message !== 'Forbidden'
      ? e.message
      : fallback;
  }
  if (e instanceof Error) return e.message || fallback;
  return fallback;
}

function isAuthError(e: unknown): boolean {
  return e instanceof ApiError && e.status === 401;
}

function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return '已过期';
  const h = Math.floor(ms / 3_600_000);
  if (h >= 24) return `${Math.floor(h / 24)} 天后过期`;
  if (h >= 1) return `${h} 小时后过期`;
  return `${Math.max(1, Math.floor(ms / 60_000))} 分钟后过期`;
}

// ── Component ────────────────────────────────────────────────────────

export const AgentControlCenterPage = memo(function AgentControlCenterPage() {
  const { isLoggedIn, restoring, openLogin } = useAuthStore();
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [tab, setTab] = useState<'permissions' | 'approvals'>('approvals');

  const fetchAll = useCallback(async () => {
    // Wait for session restore to finish so we don't fire requests with a
    // stale/missing token from the persisted store.
    if (restoring || !isLoggedIn) return;
    if (!api.getToken()) {
      setAuthExpired(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setAuthExpired(false);
    try {
      const [s, a] = await Promise.all([
        api.request<AgentSettings>('/agent/permissions'),
        api.requestProtected<ApprovalRequest[]>('/agent/owner/pending-approvals'),
      ]);
      setSettings(s);
      setApprovals(a);
    } catch (e: unknown) {
      if (isAuthError(e)) {
        setAuthExpired(true);
      } else {
        setError(formatErr(e, '加载 Agent 控制台失败'));
      }
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, restoring]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const updateSettings = useCallback(
    async (patch: Partial<AgentSettings>) => {
      setSaving(true);
      setError(null);
      try {
        const next = await api.request<AgentSettings>('/agent/permissions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        setSettings(next);
      } catch (e: unknown) {
        if (isAuthError(e)) setAuthExpired(true);
        else setError(formatErr(e, '更新失败'));
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const handleApprove = useCallback(async (id: number) => {
    try {
      const res = await api.request<{
        ok: boolean;
        status: string;
        dispatched?: boolean;
        dispatchError?: string;
      }>(`/agent/approvals/${id}/approve`, { method: 'POST' });
      setApprovals((prev) => prev.filter((r) => r.id !== id));
      if (res?.dispatched === false && res?.dispatchError) {
        setError(`已批准但执行失败：${res.dispatchError}`);
      }
    } catch (e: unknown) {
      if (isAuthError(e)) setAuthExpired(true);
      else setError(formatErr(e, '同意失败'));
    }
  }, []);

  const handleReject = useCallback(async (id: number) => {
    try {
      await api.request(`/agent/approvals/${id}/reject`, { method: 'POST' });
      setApprovals((prev) => prev.filter((r) => r.id !== id));
    } catch (e: unknown) {
      if (isAuthError(e)) setAuthExpired(true);
      else setError(formatErr(e, '拒绝失败'));
    }
  }, []);

  const pendingHigh = useMemo(
    () => approvals.filter((a) => a.riskLevel === 'high').length,
    [approvals],
  );

  if (restoring) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-[#8C8A6E]">
        <p className="text-sm">正在恢复会话…</p>
      </div>
    );
  }

  if (!isLoggedIn || authExpired) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-[#E8E4DC]">
        <p className="text-zinc-500">
          {authExpired
            ? '请重新登录后再访问 Agent 控制台。'
            : '登录后管理 Agent 权限与待确认动作。'}
        </p>
        <button
          onClick={openLogin}
          className="rounded-xl bg-[#6B7A5A] px-6 py-2 text-sm text-white"
        >
          登录
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0b] px-4 py-8 text-[#E8E4DC] sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-[#8C8A6E]">
              FitMeet · Agent Console
            </p>
            <h1 className="mt-2 text-2xl font-light tracking-tight text-[#F4EFE6]">
              Agent 控制台
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#8C8A6E]">
              你是 Agent 的所有者。这里决定 OpenClaw / QClaw 能代表你做什么、
              以及哪些动作必须先由你点「同意」后才能执行。
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 text-right text-xs">
            <Link
              to="/agent-hub"
              className="text-[#C8FF80] underline-offset-4 hover:underline"
            >
              管理 Agent Token →
            </Link>
            <Link
              to="/agent-activity"
              className="text-[#8C8A6E] hover:text-[#E8E4DC]"
            >
              查看动作日志
            </Link>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* tabs */}
        <div className="flex gap-1 border-b border-[#2a2a22]">
          <TabBtn
            active={tab === 'approvals'}
            onClick={() => setTab('approvals')}
            badge={approvals.length || undefined}
            badgeTone={pendingHigh ? 'high' : 'normal'}
          >
            待确认动作
          </TabBtn>
          <TabBtn
            active={tab === 'permissions'}
            onClick={() => setTab('permissions')}
          >
            权限与配额
          </TabBtn>
        </div>

        {loading && <div className="py-12 text-center text-[#8C8A6E]">加载中…</div>}

        {!loading && tab === 'approvals' && (
          <ApprovalsPanel
            approvals={approvals}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        )}

        {!loading && tab === 'permissions' && settings && (
          <PermissionsPanel
            settings={settings}
            saving={saving}
            onChange={updateSettings}
          />
        )}
      </div>
    </div>
  );
});

// ── Tabs ────────────────────────────────────────────────────────────

interface TabBtnProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  badge?: number;
  badgeTone?: 'high' | 'normal';
}
function TabBtn({ active, onClick, children, badge, badgeTone }: TabBtnProps) {
  return (
    <button
      onClick={onClick}
      className={`relative -mb-px flex items-center gap-2 px-4 py-3 text-sm transition ${
        active
          ? 'border-b-2 border-[#C8FF80] text-[#F4EFE6]'
          : 'border-b-2 border-transparent text-[#8C8A6E] hover:text-[#E8E4DC]'
      }`}
    >
      {children}
      {badge !== undefined && (
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            badgeTone === 'high'
              ? 'bg-red-500/20 text-red-300'
              : 'bg-[#6B7A5A]/20 text-[#C8FF80]'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ── Approvals panel ─────────────────────────────────────────────────

interface ApprovalsPanelProps {
  approvals: ApprovalRequest[];
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
}
function ApprovalsPanel({ approvals, onApprove, onReject }: ApprovalsPanelProps) {
  if (approvals.length === 0) {
    return (
      <div className="rounded-2xl border border-[#2a2a22] bg-[#111110] p-12 text-center">
        <p className="text-sm text-[#8C8A6E]">暂无待你确认的动作。</p>
        <p className="mt-2 text-xs text-[#5e5d4e]">
          当 Agent 想代表你发出第一条消息、报名线下活动、上传照片或交换联系方式时，
          会先在这里等候你的同意。
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {approvals.map((a) => (
        <ApprovalCard
          key={a.id}
          approval={a}
          onApprove={() => onApprove(a.id)}
          onReject={() => onReject(a.id)}
        />
      ))}
    </div>
  );
}

function ApprovalCard({
  approval,
  onApprove,
  onReject,
}: {
  approval: ApprovalRequest;
  onApprove: () => void;
  onReject: () => void;
}) {
  const style = RISK_STYLE[approval.riskLevel] ?? RISK_STYLE.medium;
  const previewText =
    typeof approval.payload?.content === 'string'
      ? (approval.payload.content as string)
      : null;
  const targetName =
    typeof approval.payload?._targetDisplayName === 'string'
      ? (approval.payload._targetDisplayName as string)
      : typeof approval.payload?.targetName === 'string'
        ? (approval.payload.targetName as string)
        : null;
  const targetUserId =
    typeof approval.payload?.toUserId === 'number'
      ? (approval.payload.toUserId as number)
      : typeof approval.payload?.targetUserId === 'number'
        ? (approval.payload.targetUserId as number)
        : null;
  const candidateSnapshot = approval.payload?.candidateSnapshot as
    | { name?: string; score?: number; commonTags?: string[]; reasons?: string[] }
    | undefined;
  const actionVerb = approval.actionType || approval.skillName || approval.type;
  return (
    <article
      className={`rounded-2xl border border-[#2a2a22] bg-[#111110] p-5 ${style.ring}`}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${style.pill}`}
            >
              {style.label}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-wider text-[#5e5d4e]">
              {approval.actionType || approval.skillName || approval.type}
            </span>
            <span className="text-[11px] text-[#5e5d4e]">
              {timeUntil(approval.expiresAt)}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-[#F4EFE6]">
            {approval.summary || '该 Agent 请求执行一个需要你确认的动作。'}
          </p>
          {approval.agentRationale && (
            <p className="mt-1 text-xs leading-5 text-[#8C8A6E]">
              Agent 说明：{approval.agentRationale}
            </p>
          )}
          {approval.reason && (
            <p className="mt-1 text-xs leading-5 text-amber-200/90">
              为什么需要审批：{approval.reason}
            </p>
          )}
          <p className="mt-1 text-xs leading-5 text-[#8C8A6E]">
            审批后会执行：{describeApprovalEffect(actionVerb)}
          </p>
          {(targetName || targetUserId || candidateSnapshot) && (
            <div className="mt-2 rounded-lg border border-[#2a2a22] bg-[#0A0A09] px-3 py-2 text-xs leading-5 text-[#A9A595]">
              <div className="text-[#E8E4DC]">
                目标用户：{targetName || candidateSnapshot?.name || '候选人'}
                {targetUserId ? ` · #${targetUserId}` : ''}
              </div>
              {typeof candidateSnapshot?.score === 'number' && (
                <div>匹配分：{candidateSnapshot.score}</div>
              )}
              {candidateSnapshot?.commonTags?.length ? (
                <div>共同标签：{candidateSnapshot.commonTags.slice(0, 4).join('、')}</div>
              ) : null}
              {candidateSnapshot?.reasons?.length ? (
                <div>推荐原因：{candidateSnapshot.reasons.slice(0, 2).join('；')}</div>
              ) : null}
            </div>
          )}
          {(approval.relatedSocialRequestId || approval.relatedCandidateId) && (
            <p className="mt-1 text-[11px] text-[#5e5d4e]">
              关联需求 #{approval.relatedSocialRequestId ?? '-'} · 候选 #{approval.relatedCandidateId ?? '-'}
            </p>
          )}
        </div>
      </header>

      {previewText && (
        <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-[#0A0A09] p-3 text-xs leading-5 text-[#A9A595]">
          {previewText}
        </pre>
      )}

      <footer className="mt-4 flex items-center justify-end gap-2">
        <button
          onClick={onReject}
          className="rounded-lg border border-[#2a2a22] px-4 py-2 text-xs text-[#E8E4DC] transition hover:border-red-500/50 hover:text-red-300"
        >
          拒绝
        </button>
        <button
          onClick={onApprove}
          className="rounded-lg bg-[#6B7A5A] px-4 py-2 text-xs font-medium text-white transition hover:bg-[#7A8A68]"
        >
          同意并执行
        </button>
      </footer>
    </article>
  );
}

function describeApprovalEffect(actionType: string): string {
  switch (actionType) {
    case 'send_invite':
    case 'send_message':
      return '发送站内邀约消息，并推进候选人与需求状态';
    case 'add_friend':
      return '关注/添加该候选人为好友';
    case 'create_activity':
      return '创建活动邀约并邀请候选人参与';
    default:
      return actionType;
  }
}

// ── Permissions panel ───────────────────────────────────────────────

function PermissionsPanel({
  settings,
  saving,
  onChange,
}: {
  settings: AgentSettings;
  saving: boolean;
  onChange: (patch: Partial<AgentSettings>) => void;
}) {
  const modes: AgentMode[] = ['basic', 'standard', 'open'];
  return (
    <div className="space-y-6">
      {/* mode selector */}
      <section className="rounded-2xl border border-[#2a2a22] bg-[#111110] p-6">
        <h2 className="text-sm font-medium text-[#F4EFE6]">权限模式</h2>
        <p className="mt-1 text-xs text-[#8C8A6E]">
          这一项决定 Agent 默认有多少自由度。下面的开关可以更细粒度地覆盖它。
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {modes.map((m) => {
            const active = settings.mode === m;
            return (
              <button
                key={m}
                disabled={saving}
                onClick={() => onChange({ mode: m })}
                className={`rounded-xl border p-4 text-left transition ${
                  active
                    ? 'border-[#C8FF80] bg-[#6B7A5A]/15'
                    : 'border-[#2a2a22] bg-[#0A0A09] hover:border-[#3a3a30]'
                }`}
              >
                <p
                  className={`text-sm font-medium ${
                    active ? 'text-[#C8FF80]' : 'text-[#E8E4DC]'
                  }`}
                >
                  {MODE_LABEL[m]}
                </p>
                <p className="mt-2 text-xs leading-5 text-[#8C8A6E]">
                  {MODE_DESC[m]}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* capability switches */}
      <section className="rounded-2xl border border-[#2a2a22] bg-[#111110] p-6">
        <h2 className="text-sm font-medium text-[#F4EFE6]">能力开关</h2>
        <p className="mt-1 text-xs text-[#8C8A6E]">
          关闭后 Agent 即使是有限自治模式也无法触发对应动作。
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Toggle
            label="搜索（用户、活动、内容）"
            checked={settings.allowSearch}
            disabled={saving}
            onChange={(v) => onChange({ allowSearch: v })}
          />
          <Toggle
            label="生成消息草稿"
            checked={settings.allowDraftMessage}
            disabled={saving}
            onChange={(v) => onChange({ allowDraftMessage: v })}
          />
          <Toggle
            label="代发私信"
            checked={settings.allowSendMessage}
            disabled={saving}
            danger
            onChange={(v) => onChange({ allowSendMessage: v })}
          />
          <Toggle
            label="自动回复已有对话"
            checked={settings.allowAutoReply}
            disabled={saving}
            onChange={(v) => onChange({ allowAutoReply: v })}
          />
          <Toggle
            label="创建线下活动"
            checked={settings.allowCreateActivity}
            disabled={saving}
            danger
            onChange={(v) => onChange({ allowCreateActivity: v })}
          />
          <Toggle
            label="代你报名线下活动"
            checked={settings.allowJoinActivity}
            disabled={saving}
            danger
            onChange={(v) => onChange({ allowJoinActivity: v })}
          />
          <Toggle
            label="分享精确位置"
            checked={settings.allowShareLocation}
            disabled={saving}
            danger
            onChange={(v) => onChange({ allowShareLocation: v })}
          />
          <Toggle
            label="上传活动证明照片"
            checked={settings.allowUploadProof}
            disabled={saving}
            onChange={(v) => onChange({ allowUploadProof: v })}
          />
          <Toggle
            label="交换联系方式（微信 / 手机号）"
            checked={settings.allowContactExchange}
            disabled={saving}
            danger
            onChange={(v) => onChange({ allowContactExchange: v })}
          />
        </div>
      </section>

      {/* approval gates */}
      <section className="rounded-2xl border border-[#2a2a22] bg-[#111110] p-6">
        <h2 className="text-sm font-medium text-[#F4EFE6]">必须确认的动作</h2>
        <p className="mt-1 text-xs text-[#8C8A6E]">
          即使能力开关已开，下列动作仍会先弹给你审批。
        </p>
        <div className="mt-4 space-y-3">
          <Toggle
            label="给陌生人发首条消息"
            checked={settings.requireApprovalForFirstMessage}
            disabled={saving}
            onChange={(v) => onChange({ requireApprovalForFirstMessage: v })}
          />
          <Toggle
            label="确认线下见面 / 活动"
            checked={settings.requireApprovalForOfflineMeeting}
            disabled={saving}
            onChange={(v) => onChange({ requireApprovalForOfflineMeeting: v })}
          />
          <Toggle
            label="上传照片"
            checked={settings.requireApprovalForPhotoUpload}
            disabled={saving}
            onChange={(v) => onChange({ requireApprovalForPhotoUpload: v })}
          />
          <Toggle
            label="所有写动作都必须确认（最严格）"
            checked={settings.requireApprovalForAll}
            disabled={saving}
            danger
            onChange={(v) => onChange({ requireApprovalForAll: v })}
          />
        </div>
      </section>

      {/* quotas */}
      <section className="rounded-2xl border border-[#2a2a22] bg-[#111110] p-6">
        <h2 className="text-sm font-medium text-[#F4EFE6]">配额</h2>
        <p className="mt-1 text-xs text-[#8C8A6E]">
          每天 Agent 可代发的最大消息数。
        </p>
        <div className="mt-4 flex items-center gap-4">
          <input
            type="range"
            min={0}
            max={200}
            step={5}
            value={settings.maxDailyMessages}
            disabled={saving}
            onChange={(e) =>
              onChange({ maxDailyMessages: Number(e.target.value) })
            }
            className="flex-1 accent-[#C8FF80]"
          />
          <div className="w-20 rounded-lg bg-[#0A0A09] py-2 text-center font-mono text-sm text-[#C8FF80]">
            {settings.maxDailyMessages}
          </div>
        </div>
      </section>
    </div>
  );
}

function Toggle({
  label,
  checked,
  disabled,
  danger,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  danger?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 transition ${
        checked
          ? danger
            ? 'border-amber-500/40 bg-amber-500/5'
            : 'border-[#6B7A5A]/40 bg-[#6B7A5A]/10'
          : 'border-[#2a2a22] bg-[#0A0A09]'
      }`}
    >
      <span className="text-sm text-[#E8E4DC]">{label}</span>
      <span
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-block h-5 w-9 shrink-0 rounded-full transition ${
          checked
            ? danger
              ? 'bg-amber-500/70'
              : 'bg-[#C8FF80]'
            : 'bg-[#2a2a22]'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-[#0A0A09] transition-all ${
            checked ? 'left-4' : 'left-0.5'
          }`}
        />
      </span>
    </label>
  );
}

export default AgentControlCenterPage;
