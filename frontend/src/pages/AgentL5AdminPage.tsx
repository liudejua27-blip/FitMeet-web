import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  Activity,
  Brain,
  DatabaseZap,
  GitBranch,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Users,
} from 'lucide-react';

import {
  adminRbacApi,
  type AdminAuditLogDto,
  type AdminRoleDto,
  type AdminUserRolesDto,
} from '../api/adminRbacApi';
import {
  agentL5RuntimeApi,
  type AgentCanaryDecision,
  type AgentL5DashboardDto,
  type AgentMeetLoopStateDto,
  type AgentObservabilityDto,
  type AgentOnlineReplaySampleDto,
  type AgentSkillPatchDto,
  type AgentSkillPatchEffectDto,
  type AgentSubagentMemoryDto,
  type SocialAgentMessageFeedbackDto,
  type SocialAgentRuntimeMetricsDto,
  type SubagentWorkerJobDto,
} from '../api/agentL5RuntimeApi';
import { WebsiteLayout } from '../components/website/WebsitePlatform';

type AdminTab =
  | 'replay'
  | 'memory'
  | 'meetLoop'
  | 'canary'
  | 'auto'
  | 'feedback'
  | 'observability'
  | 'workers'
  | 'rbac';

const tabs: Array<{ key: AdminTab; label: string; description: string }> = [
  { key: 'replay', label: 'Replay Case', description: '线上对话回放与评测样本' },
  { key: 'memory', label: 'Subagent Memory', description: '子 Agent 观察、批判和交接' },
  { key: 'meetLoop', label: 'Meet-loop State', description: '邀请到评价的事件状态机' },
  { key: 'canary', label: 'Canary Decision', description: '补丁灰度效果和发布决策' },
  { key: 'auto', label: 'Auto Runner', description: '自动 patch、eval、灰度和回滚' },
  { key: 'feedback', label: 'Message Feedback', description: '用户点赞点踩与自进化信号' },
  { key: 'observability', label: 'Observability', description: 'trace、延迟、失败和报警' },
  { key: 'workers', label: 'Worker Queue', description: 'DB 队列、心跳和失败重试' },
  { key: 'rbac', label: 'RBAC', description: '角色、授权和审计日志' },
];

export const AgentL5AdminPage = memo(function AgentL5AdminPage() {
  const [dashboard, setDashboard] = useState<AgentL5DashboardDto | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('replay');
  const [agentFilter, setAgentFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [patchFilter, setPatchFilter] = useState('');
  const [feedbackFilter, setFeedbackFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [runnerBusy, setRunnerBusy] = useState(false);
  const [satisfactionBusy, setSatisfactionBusy] = useState(false);
  const [error, setError] = useState('');
  const [runnerNotice, setRunnerNotice] = useState('');

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError('');
    try {
      const next = await agentL5RuntimeApi.dashboard(40);
      setDashboard(next);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const runAutoRunnerOnce = useCallback(async () => {
    setRunnerBusy(true);
    setRunnerNotice('');
    setError('');
    try {
      const result = await agentL5RuntimeApi.runAutoRunnerOnce();
      setRunnerNotice(
        `已生成 ${result.createdPatchIds.length} 个 patch，自动发布 ${result.autoPublishedPatchIds.length} 个，回收 ${result.reconciled.length} 个 canary 决策。`,
      );
      await load('refresh');
      setActiveTab('auto');
    } catch (runError) {
      setError(friendlyError(runError));
    } finally {
      setRunnerBusy(false);
    }
  }, [load]);

  const recordSatisfaction = useCallback(async (score: number) => {
    setSatisfactionBusy(true);
    setRunnerNotice('');
    setError('');
    try {
      const observability = await agentL5RuntimeApi.recordSatisfaction({
        score,
        source: 'agent_l5_admin_panel',
      });
      setDashboard((current) =>
        current
          ? {
              ...current,
              observability,
            }
          : current,
      );
      setRunnerNotice(`已记录满意度 ${(score * 100).toFixed(0)}%。`);
      setActiveTab('observability');
    } catch (satisfactionError) {
      setError(friendlyError(satisfactionError));
    } finally {
      setSatisfactionBusy(false);
    }
  }, []);

  const requeueWorkerJob = useCallback(
    async (id: number) => {
      setError('');
      try {
        await agentL5RuntimeApi.requeueSubagentWorkerJob(id);
        await load('refresh');
        setActiveTab('workers');
      } catch (jobError) {
        setError(friendlyError(jobError));
      }
    },
    [load],
  );

  const cancelWorkerJob = useCallback(
    async (id: number) => {
      setError('');
      try {
        await agentL5RuntimeApi.cancelSubagentWorkerJob(id);
        await load('refresh');
        setActiveTab('workers');
      } catch (jobError) {
        setError(friendlyError(jobError));
      }
    },
    [load],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  const filteredMemory = useMemo(() => {
    const items = dashboard?.subagentMemory ?? [];
    if (!agentFilter) return items;
    return items.filter((item) => item.agentName === agentFilter);
  }, [agentFilter, dashboard?.subagentMemory]);

  const filteredMeetLoops = useMemo(() => {
    const items = dashboard?.meetLoopStates ?? [];
    if (!stageFilter) return items;
    return items.filter((item) => item.stage === stageFilter);
  }, [dashboard?.meetLoopStates, stageFilter]);

  const filteredPatchEffects = useMemo(() => {
    const items = dashboard?.patchEffects ?? [];
    const patchId = Number(patchFilter);
    if (!patchFilter || !Number.isFinite(patchId)) return items;
    return items.filter((item) => item.patchId === patchId);
  }, [dashboard?.patchEffects, patchFilter]);

  const filteredMessageFeedback = useMemo(() => {
    const items = dashboard?.messageFeedback ?? [];
    if (feedbackFilter === 'positive' || feedbackFilter === 'negative') {
      return items.filter((item) => item.value === feedbackFilter);
    }
    return items;
  }, [dashboard?.messageFeedback, feedbackFilter]);

  const agentNames = useMemo(
    () => unique((dashboard?.subagentMemory ?? []).map((item) => item.agentName)),
    [dashboard?.subagentMemory],
  );
  const stages = useMemo(
    () => unique((dashboard?.meetLoopStates ?? []).map((item) => item.stage)),
    [dashboard?.meetLoopStates],
  );

  return (
    <WebsiteLayout>
      <main className="platform-legacy-page min-h-screen bg-[#080909] px-4 py-8 text-[#f6efe5] sm:px-6">
        <div className="mx-auto max-w-7xl">
          <header className="flex flex-col gap-4 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#c8ff80]">
                Agent L5 Runtime
              </p>
              <h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">
                后台智能体运行管理
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#a99b8d]">
                监控 replay case、subagent memory、meet-loop state、canary decision 和生产可观测性，
                用于判断 Agent 是否稳定、可评测、可回滚、可报警。
              </p>
            </div>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#c8ff80]/40 bg-[#c8ff80] px-4 py-3 text-sm font-black text-[#111315] shadow-[0_18px_42px_rgba(200,255,128,0.16)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading || refreshing}
              onClick={() => void load('refresh')}
            >
              <RefreshCw className={clsx('h-4 w-4', refreshing && 'animate-spin')} />
              刷新运行态
            </button>
          </header>

          {error ? (
            <p className="mt-5 rounded-lg border border-[#ef4444]/30 bg-[#ef4444]/10 px-4 py-3 text-sm font-bold text-[#ffb4b4]">
              {error}
            </p>
          ) : null}

          {runnerNotice ? (
            <p className="mt-5 rounded-lg border border-[#c8ff80]/25 bg-[#c8ff80]/10 px-4 py-3 text-sm font-bold text-[#dfff9f]">
              {runnerNotice}
            </p>
          ) : null}

          <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Metric
              icon={<DatabaseZap className="h-5 w-5" />}
              label="Replay Cases"
              value={dashboard?.summary.replayCases ?? 0}
              detail={`${dashboard?.summary.replayUsedForEval ?? 0} used for eval`}
            />
            <Metric
              icon={<Brain className="h-5 w-5" />}
              label="Subagent Memory"
              value={dashboard?.summary.subagentMemories ?? 0}
              detail={`${dashboard?.summary.activeSubagents ?? 0} active agents`}
            />
            <Metric
              icon={<GitBranch className="h-5 w-5" />}
              label="Meet-loop States"
              value={dashboard?.summary.meetLoopStates ?? 0}
              detail={`${dashboard?.summary.activeMeetLoops ?? 0} active loops`}
            />
            <Metric
              icon={<ServerCog className="h-5 w-5" />}
              label="Worker Jobs"
              value={dashboard?.summary.subagentWorkerJobs ?? dashboard?.workerJobs?.length ?? 0}
              detail={`${dashboard?.summary.failedSubagentWorkerJobs ?? 0} failed jobs`}
            />
            <Metric
              icon={<ShieldCheck className="h-5 w-5" />}
              label="Active Alerts"
              value={dashboard?.summary.activeAlerts ?? dashboard?.observability?.alerts?.length ?? 0}
              detail={`${dashboard?.summary.rollbackSignals ?? 0} rollback signals`}
            />
            <Metric
              icon={<Activity className="h-5 w-5" />}
              label="Message Feedback"
              value={dashboard?.summary.messageFeedback ?? dashboard?.messageFeedback?.length ?? 0}
              detail={`${dashboard?.summary.negativeMessageFeedback ?? 0} negative signals`}
            />
          </section>

          <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.035]">
            <div className="grid gap-2 border-b border-white/10 p-3 md:grid-cols-3 xl:grid-cols-9">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  className={clsx(
                    'rounded-lg px-4 py-3 text-left transition',
                    activeTab === tab.key
                      ? 'bg-[#f6efe5] text-[#111315]'
                      : 'bg-white/[0.035] text-[#c9b9a7] hover:bg-white/[0.07] hover:text-white',
                  )}
                  onClick={() => setActiveTab(tab.key)}
                >
                  <span className="block text-sm font-black">{tab.label}</span>
                  <span className="mt-1 block text-xs font-bold opacity-70">{tab.description}</span>
                </button>
              ))}
            </div>

            <div className="p-5">
              {loading ? (
                <LoadingState />
              ) : activeTab === 'replay' ? (
                <ReplayCasePanel items={dashboard?.replaySamples ?? []} />
              ) : activeTab === 'memory' ? (
                <SubagentMemoryPanel
                  agentFilter={agentFilter}
                  agentNames={agentNames}
                  items={filteredMemory}
                  onAgentFilterChange={setAgentFilter}
                />
              ) : activeTab === 'meetLoop' ? (
                <MeetLoopPanel
                  items={filteredMeetLoops}
                  onStageFilterChange={setStageFilter}
                  stageFilter={stageFilter}
                  stages={stages}
                />
              ) : activeTab === 'canary' ? (
                <CanaryPanel
                  items={filteredPatchEffects}
                  onPatchFilterChange={setPatchFilter}
                  patchFilter={patchFilter}
                />
              ) : activeTab === 'auto' ? (
                <AutoRunnerPanel
                  items={dashboard?.autoRuns ?? []}
                  onRunOnce={runAutoRunnerOnce}
                  runnerBusy={runnerBusy}
                />
              ) : activeTab === 'feedback' ? (
                <MessageFeedbackPanel
                  feedbackFilter={feedbackFilter}
                  items={filteredMessageFeedback}
                  onFeedbackFilterChange={setFeedbackFilter}
                />
              ) : activeTab === 'observability' ? (
                <ObservabilityPanel
                  observability={dashboard?.observability ?? null}
                  onRecordSatisfaction={recordSatisfaction}
                  satisfactionBusy={satisfactionBusy}
                  socialAgentMetrics={dashboard?.socialAgentMetrics ?? null}
                />
              ) : activeTab === 'workers' ? (
                <WorkerQueuePanel
                  jobs={dashboard?.workerJobs ?? []}
                  onCancel={cancelWorkerJob}
                  onRequeue={requeueWorkerJob}
                />
              ) : (
                <RbacPanel />
              )}
            </div>
          </section>
        </div>
      </main>
    </WebsiteLayout>
  );
});

function Metric({
  detail,
  icon,
  label,
  value,
}: {
  detail: string;
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.22)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#8f8174]">{label}</p>
        <span className="rounded-lg border border-[#c8ff80]/25 bg-[#c8ff80]/10 p-2 text-[#dfff9f]">
          {icon}
        </span>
      </div>
      <p className="mt-4 text-3xl font-black text-white">{value}</p>
      <p className="mt-2 text-xs font-bold text-[#a99b8d]">{detail}</p>
    </div>
  );
}

function WorkerQueuePanel({
  jobs,
  onCancel,
  onRequeue,
}: {
  jobs: SubagentWorkerJobDto[];
  onCancel: (id: number) => void;
  onRequeue: (id: number) => void;
}) {
  return (
    <PanelShell
      count={jobs.length}
      description="展示 PostgreSQL/TypeORM subagent worker job，支持失败重试和取消积压任务。"
      title="Subagent DB Worker Queue"
    >
      <DataTable
        emptyText="暂无 worker job"
        headers={[
          'ID',
          'Agent',
          'Queue',
          'Status',
          'Attempts',
          'Run',
          'Lock',
          'Error',
          'Actions',
        ]}
        rows={jobs.map((job) => [
          `#${job.id}`,
          job.agentName,
          job.queueName,
          <StatusPill key="status" tone={workerJobTone(job.status)}>
            {job.status}
          </StatusPill>,
          `${job.attempts}/${job.maxAttempts}`,
          job.runId ?? '-',
          job.lockedBy ? `${job.lockedBy} until ${formatDate(job.lockedUntil)}` : '-',
          job.lastError ?? jsonPreview(job.result),
          <div className="flex flex-wrap gap-2" key="actions">
            <button
              className="rounded-lg border border-[#c8ff80]/30 px-3 py-1.5 text-xs font-black text-[#dfff9f] disabled:opacity-40"
              disabled={job.status === 'running'}
              onClick={() => onRequeue(job.id)}
            >
              Requeue
            </button>
            <button
              className="rounded-lg border border-[#ef4444]/30 px-3 py-1.5 text-xs font-black text-[#ffb4b4] disabled:opacity-40"
              disabled={job.status === 'succeeded' || job.status === 'cancelled'}
              onClick={() => onCancel(job.id)}
            >
              Cancel
            </button>
          </div>,
        ])}
      />
    </PanelShell>
  );
}

function RbacPanel() {
  const [roles, setRoles] = useState<AdminRoleDto[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogDto[]>([]);
  const [userRoles, setUserRoles] = useState<AdminUserRolesDto | null>(null);
  const [targetUserId, setTargetUserId] = useState('1');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadRbac = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [nextRoles, nextAudit] = await Promise.all([
        adminRbacApi.roles(),
        adminRbacApi.auditLogs(80),
      ]);
      setRoles(nextRoles);
      setAuditLogs(nextAudit);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadRbac();
  }, [loadRbac]);

  const loadUserRoles = async () => {
    const userId = Number(targetUserId);
    if (!Number.isFinite(userId) || userId <= 0) return;
    setBusy(true);
    setError('');
    try {
      const next = await adminRbacApi.userRoles(userId);
      setUserRoles(next);
      setSelectedRoles(next.roles);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  };

  const saveUserRoles = async () => {
    const userId = Number(targetUserId);
    if (!Number.isFinite(userId) || userId <= 0) return;
    setBusy(true);
    setError('');
    try {
      const next = await adminRbacApi.setUserRoles(userId, selectedRoles);
      setUserRoles(next);
      const nextAudit = await adminRbacApi.auditLogs(80);
      setAuditLogs(nextAudit);
    } catch (saveError) {
      setError(friendlyError(saveError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PanelShell
      action={
        <button
          className="inline-flex items-center gap-2 rounded-lg border border-[#c8ff80]/35 bg-[#c8ff80]/10 px-4 py-2 text-sm font-black text-[#dfff9f] disabled:opacity-60"
          disabled={busy}
          onClick={() => void loadRbac()}
        >
          <RefreshCw className={clsx('h-4 w-4', busy && 'animate-spin')} />
          Refresh
        </button>
      }
      count={roles.length}
      description="正式 RBAC 运行时权限模型：ADMIN_USER_IDS 只用于 bootstrap，后台判断读取角色授权和审计日志。"
      title="Admin RBAC"
    >
      {error ? (
        <p className="mb-4 rounded-lg border border-[#ef4444]/30 bg-[#ef4444]/10 px-3 py-2 text-sm font-bold text-[#ffb4b4]">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-xl border border-white/10 bg-[#0b0c0d] p-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[#c8ff80]" />
            <h3 className="text-sm font-black text-white">用户授权</h3>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <input
              className="min-w-[180px] rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-bold text-white outline-none"
              inputMode="numeric"
              onChange={(event) => setTargetUserId(event.target.value)}
              value={targetUserId}
            />
            <button
              className="rounded-lg border border-white/15 px-3 py-2 text-sm font-black text-white"
              disabled={busy}
              onClick={() => void loadUserRoles()}
            >
              Load
            </button>
            <button
              className="rounded-lg border border-[#c8ff80]/30 px-3 py-2 text-sm font-black text-[#dfff9f]"
              disabled={busy}
              onClick={() => void saveUserRoles()}
            >
              Save
            </button>
          </div>
          <div className="mt-4 grid gap-2">
            {roles.map((role) => (
              <label
                className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-sm font-bold text-[#c9b9a7]"
                key={role.key}
              >
                <input
                  checked={selectedRoles.includes(role.key)}
                  className="mt-1"
                  onChange={(event) =>
                    setSelectedRoles((current) =>
                      event.target.checked
                        ? unique([...current, role.key])
                        : current.filter((item) => item !== role.key),
                    )
                  }
                  type="checkbox"
                />
                <span>
                  <span className="block text-white">{role.name}</span>
                  <span className="block text-xs text-[#8f8174]">
                    {role.key} · {role.permissions.join(', ')}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {userRoles ? (
            <p className="mt-3 text-xs font-bold text-[#8f8174]">
              User {userRoles.userId}: {userRoles.permissions.join(', ') || '暂无权限'}
            </p>
          ) : null}
        </section>

        <DataTable
          emptyText="暂无审计日志"
          headers={['ID', 'User', 'Permission', 'Decision', 'Route', 'Reason', 'Created']}
          rows={auditLogs.map((log) => [
            `#${log.id}`,
            log.userId ?? '-',
            log.permission ?? '-',
            <StatusPill key="decision" tone={log.decision === 'denied' ? 'danger' : 'good'}>
              {log.decision}
            </StatusPill>,
            log.route,
            log.reason || jsonPreview(log.metadata),
            formatDate(log.createdAt),
          ])}
        />
      </div>
    </PanelShell>
  );
}

function ReplayCasePanel({ items }: { items: AgentOnlineReplaySampleDto[] }) {
  return (
    <PanelShell
      count={items.length}
      description="从真实线上任务捕获回放样本，发布 patch 前可进入自动 eval runner。"
      title="Replay Case"
    >
      <DataTable
        emptyText="暂无 replay case"
        headers={['ID', 'Task', 'Eval', 'Status', 'Input', 'Expected', 'Last replay', 'Created']}
        rows={items.map((item) => [
          `#${item.id}`,
          item.agentTaskId ? `Task ${item.agentTaskId}` : '-',
          item.evalCaseId ? `Eval ${item.evalCaseId}` : '-',
          <StatusPill key="status" tone={item.status === 'used_for_eval' ? 'good' : 'neutral'}>
            {item.status}
          </StatusPill>,
          jsonPreview(item.input),
          jsonPreview(item.expectedBehavior),
          <ReplayRegressionSummary key="regression" lastReplay={item.lastReplay} />,
          formatDate(item.createdAt),
        ])}
      />
    </PanelShell>
  );
}

function ReplayRegressionSummary({
  lastReplay,
}: {
  lastReplay: AgentOnlineReplaySampleDto['lastReplay'];
}) {
  if (!lastReplay) return <span className="text-[#8f8174]">未回放</span>;
  const replay = readRecord(lastReplay);
  const checks = Array.isArray(replay.regressionChecks)
    ? replay.regressionChecks
        .map((item) => readReplayRegressionCheck(item))
        .filter((item): item is ReplayRegressionCheck => Boolean(item))
    : [];
  if (!checks.length) return <span>{jsonPreview(lastReplay)}</span>;

  const failed = checks.filter((item) => !item.pass);
  const visibleChecks = failed.length ? failed.slice(0, 3) : checks.slice(0, 3);
  return (
    <div className="grid gap-2" data-testid="social-codex-regression-summary">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={failed.length ? 'danger' : 'good'}>
          {failed.length ? `${failed.length} failed` : 'all passed'}
        </StatusPill>
        <span className="text-xs font-bold text-[#8f8174]">{checks.length} checks</span>
      </div>
      <div className="grid gap-1">
        {visibleChecks.map((item) => (
          <div className="flex items-start gap-2 text-xs leading-5" key={item.id}>
            <span
              className={clsx(
                'mt-1 h-2 w-2 shrink-0 rounded-full',
                item.pass ? 'bg-[#c8ff80]' : 'bg-[#ef4444]',
              )}
            />
            <span className="min-w-0 break-words text-[#c9b9a7]">
              {item.label || item.id}: {item.message || (item.pass ? '通过' : '失败')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SubagentMemoryPanel({
  agentFilter,
  agentNames,
  items,
  onAgentFilterChange,
}: {
  agentFilter: string;
  agentNames: string[];
  items: AgentSubagentMemoryDto[];
  onAgentFilterChange: (value: string) => void;
}) {
  return (
    <PanelShell
      action={
        <select
          className="rounded-lg border border-white/10 bg-[#0b0c0d] px-3 py-2 text-sm font-bold text-white outline-none"
          value={agentFilter}
          onChange={(event) => onAgentFilterChange(event.target.value)}
        >
          <option value="">全部子 Agent</option>
          {agentNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      }
      count={items.length}
      description="每个子 Agent 独立记录 input、tool observation、critique 和 handoff output。"
      title="Subagent Memory"
    >
      <DataTable
        emptyText="暂无 subagent memory"
        headers={['ID', 'Agent', 'Scope', 'Task', 'Observation', 'Critique', 'Handoff', 'Updated']}
        rows={items.map((item) => [
          `#${item.id}`,
          item.agentName,
          item.memoryScope,
          item.agentTaskId ? `Task ${item.agentTaskId}` : '-',
          jsonPreview(item.observation),
          jsonPreview(item.critique),
          jsonPreview(item.handoffOutput),
          formatDate(item.updatedAt),
        ])}
      />
    </PanelShell>
  );
}

function MeetLoopPanel({
  items,
  onStageFilterChange,
  stageFilter,
  stages,
}: {
  items: AgentMeetLoopStateDto[];
  onStageFilterChange: (value: string) => void;
  stageFilter: string;
  stages: string[];
}) {
  return (
    <PanelShell
      action={
        <select
          className="rounded-lg border border-white/10 bg-[#0b0c0d] px-3 py-2 text-sm font-bold text-white outline-none"
          value={stageFilter}
          onChange={(event) => onStageFilterChange(event.target.value)}
        >
          <option value="">全部阶段</option>
          {stages.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>
      }
      count={items.length}
      description="观察发起邀请、对方回复、改期、见面、评价和回写 Life Graph 的状态推进。"
      title="Meet-loop State"
    >
      <div className="grid gap-4">
        {items.length ? (
          items.map((item) => <MeetLoopCard item={item} key={item.id} />)
        ) : (
          <EmptyState text="暂无 meet-loop state" />
        )}
      </div>
    </PanelShell>
  );
}

function MeetLoopCard({ item }: { item: AgentMeetLoopStateDto }) {
  const transitions = item.transitionHistory ?? [];
  return (
    <article className="rounded-xl border border-white/10 bg-[#0b0c0d] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={item.completedAt ? 'good' : 'warn'}>{item.stage}</StatusPill>
            <span className="text-xs font-bold text-[#8f8174]">Task {item.agentTaskId}</span>
            {item.activityId ? (
              <span className="text-xs font-bold text-[#8f8174]">Activity {item.activityId}</span>
            ) : null}
            {item.candidateUserId ? (
              <span className="text-xs font-bold text-[#8f8174]">Candidate {item.candidateUserId}</span>
            ) : null}
          </div>
          <p className="mt-3 text-sm font-black text-white">Waiting for: {item.waitingFor}</p>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-[#a99b8d]">{jsonPreview(item.state)}</p>
        </div>
        <p className="text-xs font-bold text-[#8f8174]">{formatDate(item.updatedAt)}</p>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {transitions.slice(-6).map((transition, index) => (
          <div
            className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-bold text-[#c9b9a7]"
            key={`${item.id}-${index}`}
          >
            <span className="text-[#f6efe5]">{String(transition.from ?? 'start')}</span>
            <span className="mx-2 text-[#8f8174]">→</span>
            <span className="text-[#c8ff80]">{String(transition.to ?? '-')}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function CanaryPanel({
  items,
  onPatchFilterChange,
  patchFilter,
}: {
  items: AgentSkillPatchEffectDto[];
  onPatchFilterChange: (value: string) => void;
  patchFilter: string;
}) {
  return (
    <PanelShell
      action={
        <input
          className="rounded-lg border border-white/10 bg-[#0b0c0d] px-3 py-2 text-sm font-bold text-white outline-none"
          inputMode="numeric"
          onChange={(event) => onPatchFilterChange(event.target.value)}
          placeholder="Patch ID"
          value={patchFilter}
        />
      }
      count={items.length}
      description="展示 canary patch 的线上指标、样本量和自动 promote / rollback 信号。"
      title="Canary Decision"
    >
      <DataTable
        emptyText="暂无 canary decision"
        headers={['ID', 'Patch', 'Metric', 'Value', 'Sample', 'Decision', 'Note', 'Created']}
        rows={items.map((item) => [
          `#${item.id}`,
          `Patch ${item.patchId}`,
          item.metric,
          item.value.toFixed(3),
          item.sampleSize ?? '-',
          <StatusPill key="decision" tone={decisionTone(item.decision)}>
            {item.decision}
          </StatusPill>,
          item.note || jsonPreview(item.context),
          formatDate(item.createdAt),
        ])}
      />
    </PanelShell>
  );
}

function MessageFeedbackPanel({
  feedbackFilter,
  items,
  onFeedbackFilterChange,
}: {
  feedbackFilter: string;
  items: SocialAgentMessageFeedbackDto[];
  onFeedbackFilterChange: (value: string) => void;
}) {
  const negative = items.filter((item) => item.value === 'negative').length;
  return (
    <PanelShell
      action={
        <select
          className="rounded-lg border border-white/10 bg-[#0b0c0d] px-3 py-2 text-sm font-bold text-white outline-none"
          value={feedbackFilter}
          onChange={(event) => onFeedbackFilterChange(event.target.value)}
        >
          <option value="">全部评价</option>
          <option value="positive">Positive</option>
          <option value="negative">Negative</option>
        </select>
      }
      count={items.length}
      description={`用户对单条 assistant 消息的点赞/点踩。负反馈会进入 replay/self-improve 的候选信号池，当前列表负反馈 ${negative} 条。`}
      title="Message Feedback"
    >
      <DataTable
        emptyText="暂无 message feedback"
        headers={['ID', 'Value', 'Task', 'Message', 'Trace', 'Source', 'Reason / Metadata', 'Updated']}
        rows={items.map((item) => [
          `#${item.id}`,
          <StatusPill key="value" tone={item.value === 'negative' ? 'danger' : 'good'}>
            {item.value}
          </StatusPill>,
          item.agentTaskId ? `Task ${item.agentTaskId}` : '-',
          item.messageId,
          item.traceId ?? item.runId ?? '-',
          item.source,
          item.reason || jsonPreview(item.metadata),
          formatDate(item.updatedAt),
        ])}
      />
    </PanelShell>
  );
}

function AutoRunnerPanel({
  items,
  onRunOnce,
  runnerBusy,
}: {
  items: AgentSkillPatchDto[];
  onRunOnce: () => void;
  runnerBusy: boolean;
}) {
  return (
    <PanelShell
      action={
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#c8ff80]/35 bg-[#c8ff80]/10 px-4 py-2 text-sm font-black text-[#dfff9f] transition hover:bg-[#c8ff80]/18 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={runnerBusy}
          onClick={onRunOnce}
        >
          <RefreshCw className={clsx('h-4 w-4', runnerBusy && 'animate-spin')} />
          Run once
        </button>
      }
      count={items.length}
      description="展示自动失败聚类、patch 草案、eval runner、canary 灰度和回滚原因。高风险 patch 会停在人审。"
      title="Auto Patch Queue"
    >
      <DataTable
        emptyText="暂无 auto runner 记录"
        headers={[
          'ID',
          'Title',
          'Type',
          'Status',
          'Risk',
          'Target',
          'Eval',
          'Rollout',
          'Rollback',
          'Updated',
        ]}
        rows={items.map((item) => {
          const patch = item.patch ?? {};
          const lastEvaluation = readRecord(patch.lastEvaluation);
          const rollout = readRecord(patch.rollout);
          const rollback = readRecord(patch.rollback);
          return [
            `#${item.id}`,
            item.title,
            item.patchType,
            <StatusPill key="status" tone={patchStatusTone(item.status)}>
              {item.status}
            </StatusPill>,
            <StatusPill key="risk" tone={riskTone(item.riskLevel)}>
              {item.riskLevel}
            </StatusPill>,
            item.target || '-',
            lastEvaluation.evaluatedAt
              ? `${String(lastEvaluation.passRate ?? '-')} pass`
              : `${item.evalCaseIds?.length ?? 0} eval case(s)`,
            rollout.state ? `${String(rollout.state)} ${String(rollout.percent ?? '')}%` : '-',
            rollback.reason ? String(rollback.reason) : '-',
            formatDate(item.updatedAt),
          ];
        })}
      />
    </PanelShell>
  );
}

function ObservabilityPanel({
  observability,
  onRecordSatisfaction,
  satisfactionBusy,
  socialAgentMetrics,
}: {
  observability: AgentObservabilityDto | null;
  onRecordSatisfaction: (score: number) => void;
  satisfactionBusy: boolean;
  socialAgentMetrics: SocialAgentRuntimeMetricsDto | null;
}) {
  const counters = observability?.counters ?? {};
  const latency = observability?.latency ?? {};
  const llmTokenCost = observability?.llmTokenCost ?? {};
  const executionCost = observability?.executionCostSummary;
  const llmContextBudgetRecommendations =
    observability?.llmContextBudgetRecommendations ?? {};
  const recentRunCost = observability?.recentRunCostSummary ?? [];
  const failureReasons = observability?.failureReasons ?? {};
  const queueDepth = observability?.queueDepth ?? {};
  const alerts = observability?.alerts ?? [];
  const healthRows = [
    ['Agent runs', counter(counters, 'agent_run.started'), counter(counters, 'agent_run.failed')],
    ['LLM calls', counter(counters, 'llm.total'), counter(counters, 'llm.failed')],
    ['Tool calls', counter(counters, 'tool.total'), counter(counters, 'tool.failed')],
    ['Approval blocked', counter(counters, 'approval.blocked'), '-'],
    ['SSE streams', counter(counters, 'sse.started'), counter(counters, 'sse.interrupted')],
    ['DB queries', counter(counters, 'db.query_total'), counter(counters, 'db.slow_query')],
    ['User satisfaction', counter(counters, 'user_satisfaction.total'), counter(counters, 'user_satisfaction.low')],
  ];
  const latencyRows = [
    ['Agent run latency', latencyValue(latency, 'agent_run')],
    ['LLM first token', firstLatencyValue(latency, 'llm_first_token')],
    ['LLM total latency', firstLatencyValue(latency, 'llm')],
    ['SSE latency', firstLatencyValue(latency, 'sse')],
    ['User satisfaction avg', satisfactionValue(latency)],
  ];
  const llmTokenRows = Object.entries(llmTokenCost)
    .sort(([, left], [, right]) => right.calls - left.calls)
    .map(([useCase, bucket]) => {
      const recommendation = llmContextBudgetRecommendations[useCase];
      return [
        useCase,
        String(bucket.calls),
        recommendation?.mode === 'strict' ? (
          <StatusPill key={`${useCase}-mode`} tone="warn">
            strict
          </StatusPill>
        ) : (
          <StatusPill key={`${useCase}-mode`} tone="good">
            standard
          </StatusPill>
        ),
        formatContextBudgetReasons(recommendation?.reasons),
        formatPercent(bucket.promptCacheHitRate),
        compactNumber(bucket.promptTokens),
        compactNumber(bucket.estimatedBillableInputTokens),
        compactNumber(bucket.completionTokens + bucket.reasoningTokens),
        compactNumber(bucket.avgApproxPromptChars),
        bucket.models.join(', ') || '-',
      ];
    });
  const executionCostItems = executionCostSummaryItems(executionCost);
  const llmStageCostItems = llmStageCostSummaryItems(executionCost);
  const toolStageCostItems = toolStageCostSummaryItems(executionCost);
  const recentRunCostRows = recentRunCost.slice(0, 8).map((run) => [
    <div key={`${run.runId}-run`} className="grid gap-1">
      <span className="font-black text-white">{run.runId}</span>
      <span className="text-xs font-bold text-[#8f8174]">
        task {run.taskId ?? '-'} · {formatDate(run.updatedAt)}
      </span>
    </div>,
    <StatusPill key={`${run.runId}-status`} tone={runStatusTone(run.status)}>
      {run.status}
    </StatusPill>,
    `${run.llmCallCount} LLM · ${run.toolCallCount} tools`,
    formatPercent(run.promptCacheHitRate),
    compactNumber(run.estimatedBillableInputTokens),
    compactNumber(run.completionTokens + run.reasoningTokens),
    topRunCostKeys(run.llmUseCases),
    topRunCostKeys(run.tools),
    run.models.join(', ') || '-',
  ]);
  const llmOutputCacheItems = cacheSummaryItems(
    socialAgentMetrics?.llmOutputCacheSummary,
  );
  const promptFingerprintItems = promptFingerprintSummaryItems(
    socialAgentMetrics?.llmPromptFingerprintSummary,
  );
  const toolResultCacheItems = cacheSummaryItems(
    socialAgentMetrics?.toolResultCacheSummary,
  );
  const embeddingCacheItems = cacheSummaryItems(
    socialAgentMetrics?.embeddingCacheSummary,
  );
  const cacheEfficiencyItems = cacheEfficiencySummaryItems(
    socialAgentMetrics?.cacheEfficiencySummary,
  );
  const workflowEfficiencyItems = workflowEfficiencySummaryItems(
    socialAgentMetrics?.workflowEfficiencySummary,
  );
  const deterministicRouteItems = deterministicRouteSummaryItems(
    socialAgentMetrics?.deterministicRouteEfficiencySummary,
  );
  const deterministicActionItems = deterministicActionSummaryItems(
    socialAgentMetrics?.deterministicActionEfficiencySummary,
  );
  const tokenOptimizationItems = tokenOptimizationSummaryItems(
    socialAgentMetrics?.tokenOptimizationSummary,
  );

  return (
    <PanelShell
      action={
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-lg border border-[#c8ff80]/35 bg-[#c8ff80]/10 px-3 py-2 text-sm font-black text-[#dfff9f] transition hover:bg-[#c8ff80]/18 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={satisfactionBusy}
            onClick={() => onRecordSatisfaction(1)}
          >
            满意
          </button>
          <button
            className="rounded-lg border border-[#f4d06f]/35 bg-[#f4d06f]/10 px-3 py-2 text-sm font-black text-[#ffeab0] transition hover:bg-[#f4d06f]/18 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={satisfactionBusy}
            onClick={() => onRecordSatisfaction(0.5)}
          >
            待改进
          </button>
        </div>
      }
      count={alerts.length}
      description="展示生产 trace 相关指标：token latency、工具耗时、失败原因、审批阻塞、满意度、SSE 中断、慢查询和队列积压。"
      title="Production Observability"
    >
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <DataTable
          emptyText="暂无运行指标"
          headers={['Signal', 'Total', 'Problem']}
          rows={healthRows.map(([name, total, problem]) => [name, total, problem])}
        />
        <DataTable
          emptyText="暂无延迟指标"
          headers={['Metric', 'Value']}
          rows={latencyRows}
        />
      </div>

      <div className="mt-5">
        <DataTable
          emptyText="暂无 LLM token 成本数据"
          headers={[
            'Use case',
            'Calls',
            'Mode',
            'Reason',
            'Cache hit',
            'Prompt tokens',
            'Billable input',
            'Output tokens',
            'Avg prompt chars',
            'Models',
          ]}
          rows={llmTokenRows}
        />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <ObservabilityList
          emptyText="暂无 run 调用密度数据"
          items={executionCostItems}
          title="Run Cost Density"
        />
        <ObservabilityList
          emptyText="暂无 LLM stage cost"
          items={llmStageCostItems}
          title="LLM Stage Cost"
        />
        <ObservabilityList
          emptyText="暂无 tool stage cost"
          items={toolStageCostItems}
          title="Tool Stage Cost"
        />
      </div>

      <div className="mt-5">
        <DataTable
          emptyText="暂无 run 级成本记录"
          headers={[
            'Run',
            'Status',
            'Calls',
            'Cache hit',
            'Billable input',
            'Output tokens',
            'LLM use cases',
            'Tools',
            'Models',
          ]}
          rows={recentRunCostRows}
        />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <ObservabilityList
          emptyText="暂无活跃报警"
          items={alerts.map((alert) => ({
            key: alert.code,
            label: alert.message,
            value: `${alert.severity} · ${alert.value} / ${alert.threshold}`,
            tone: alert.severity === 'critical' ? 'danger' : 'warn',
          }))}
          title="Alerts"
        />
        <ObservabilityList
          emptyText="暂无失败原因"
          items={topEntries(failureReasons).map(([key, value]) => ({
            key,
            label: key,
            value: String(value),
            tone: 'danger',
          }))}
          title="Failure Reasons"
        />
        <ObservabilityList
          emptyText="暂无队列积压"
          items={topEntries(queueDepth).map(([key, value]) => ({
            key,
            label: key,
            value: String(value),
            tone: value > 20 ? 'warn' : 'neutral',
          }))}
          title="Queue Backlog"
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <ObservabilityList
          emptyText="暂无 token 优化汇总"
          items={tokenOptimizationItems}
          title="Token Optimization"
        />
        <ObservabilityList
          emptyText="暂无 workflow 命中数据"
          items={workflowEfficiencyItems}
          title="Workflow Efficiency"
        />
        <ObservabilityList
          emptyText="暂无确定性普通回复数据"
          items={deterministicRouteItems}
          title="Deterministic Replies"
        />
        <ObservabilityList
          emptyText="暂无确定性动作数据"
          items={deterministicActionItems}
          title="Deterministic Actions"
        />
        <ObservabilityList
          emptyText="暂无缓存效率汇总"
          items={cacheEfficiencyItems}
          title="Cache Efficiency"
        />
        <ObservabilityList
          emptyText="暂无 LLM 输出缓存数据"
          items={llmOutputCacheItems}
          title="LLM Output Cache"
        />
        <ObservabilityList
          emptyText="暂无 prompt prefix 复用数据"
          items={promptFingerprintItems}
          title="Prompt Prefix Reuse"
        />
        <ObservabilityList
          emptyText="暂无工具结果缓存数据"
          items={toolResultCacheItems}
          title="Tool Result Cache"
        />
        <ObservabilityList
          emptyText="暂无 embedding 缓存数据"
          items={embeddingCacheItems}
          title="Embedding Cache"
        />
      </div>
    </PanelShell>
  );
}

function ObservabilityList({
  emptyText,
  items,
  title,
}: {
  emptyText: string;
  items: Array<{
    key: string;
    label: string;
    tone: 'danger' | 'good' | 'neutral' | 'warn';
    value: string;
  }>;
  title: string;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-[#0b0c0d] p-4">
      <h3 className="text-sm font-black text-white">{title}</h3>
      <div className="mt-3 grid gap-2">
        {items.length ? (
          items.map((item) => (
            <div
              className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2"
              key={item.key}
            >
              <span className="min-w-0 break-words text-xs font-bold leading-5 text-[#c9b9a7]">
                {item.label}
              </span>
              <StatusPill tone={item.tone}>{item.value}</StatusPill>
            </div>
          ))
        ) : (
          <p className="rounded-lg border border-dashed border-white/10 px-3 py-5 text-center text-xs font-bold text-[#8f8174]">
            {emptyText}
          </p>
        )}
      </div>
    </section>
  );
}

function PanelShell({
  action,
  children,
  count,
  description,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  count: number;
  description: string;
  title: string;
}) {
  return (
    <div>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-[#c8ff80]" />
            <h2 className="text-xl font-black text-white">{title}</h2>
            <span className="rounded-full border border-white/10 px-2 py-1 text-xs font-black text-[#c9b9a7]">
              {count}
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#a99b8d]">{description}</p>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function DataTable({
  emptyText,
  headers,
  rows,
}: {
  emptyText: string;
  headers: string[];
  rows: Array<Array<ReactNode>>;
}) {
  if (!rows.length) return <EmptyState text={emptyText} />;
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full min-w-[1080px] border-separate border-spacing-0 text-left text-sm">
        <thead className="bg-white/[0.04] text-xs font-black uppercase tracking-[0.16em] text-[#8f8174]">
          <tr>
            {headers.map((header) => (
              <th className="border-b border-white/10 px-3 py-3" key={header}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr className="text-[#f6efe5]" key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td
                  className="max-w-[280px] border-b border-white/10 px-3 py-3 align-top text-sm"
                  key={`${rowIndex}-${cellIndex}`}
                >
                  {typeof cell === 'string' || typeof cell === 'number' ? (
                    <span className="line-clamp-3 break-words">{cell}</span>
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({
  children,
  tone,
}: {
  children: ReactNode;
  tone: 'good' | 'neutral' | 'warn' | 'danger';
}) {
  return (
    <span
      className={clsx(
        'inline-flex rounded-full border px-2.5 py-1 text-xs font-black',
        tone === 'good' && 'border-[#c8ff80]/30 bg-[#c8ff80]/12 text-[#dfff9f]',
        tone === 'neutral' && 'border-white/10 bg-white/[0.06] text-[#c9b9a7]',
        tone === 'warn' && 'border-[#f4d06f]/30 bg-[#f4d06f]/12 text-[#ffeab0]',
        tone === 'danger' && 'border-[#ef4444]/30 bg-[#ef4444]/12 text-[#ffb4b4]',
      )}
    >
      {children}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-white/10 bg-[#0b0c0d]">
      <div className="flex items-center gap-3 text-sm font-black text-[#c9b9a7]">
        <RefreshCw className="h-4 w-4 animate-spin text-[#c8ff80]" />
        正在加载 Agent L5 运行态
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-[#0b0c0d] px-4 py-10 text-center text-sm font-bold text-[#8f8174]">
      {text}
    </div>
  );
}

function decisionTone(decision: AgentCanaryDecision) {
  if (decision === 'promote') return 'good';
  if (decision === 'rollback') return 'danger';
  return 'warn';
}

function workerJobTone(status: SubagentWorkerJobDto['status']) {
  if (status === 'succeeded') return 'good';
  if (status === 'failed' || status === 'cancelled') return 'danger';
  if (status === 'running') return 'warn';
  return 'neutral';
}

function runStatusTone(
  status: NonNullable<AgentObservabilityDto['recentRunCostSummary']>[number]['status'],
) {
  if (status === 'completed') return 'good';
  if (status === 'failed') return 'danger';
  if (status === 'approval_required' || status === 'started') return 'warn';
  return 'neutral';
}

function patchStatusTone(status: AgentSkillPatchDto['status']) {
  if (status === 'published' || status === 'approved') return 'good';
  if (status === 'rolled_back' || status === 'rejected') return 'danger';
  if (status === 'pending_review' || status === 'draft') return 'warn';
  return 'neutral';
}

function riskTone(riskLevel: AgentSkillPatchDto['riskLevel']) {
  if (riskLevel === 'low') return 'good';
  if (riskLevel === 'high') return 'danger';
  return 'warn';
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

type ReplayRegressionCheck = {
  id: string;
  label: string;
  pass: boolean;
  message: string;
};

function readReplayRegressionCheck(value: unknown): ReplayRegressionCheck | null {
  const record = readRecord(value);
  if (!record.id) return null;
  return {
    id: String(record.id),
    label: typeof record.label === 'string' ? record.label : String(record.id),
    pass: record.pass === true,
    message: typeof record.message === 'string' ? record.message : '',
  };
}

function jsonPreview(value: unknown) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value || '-';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value).slice(0, 220);
  } catch {
    return String(value);
  }
}

function counter(counters: Record<string, number>, key: string) {
  return counters[key] ?? 0;
}

function latencyValue(
  latency: Record<string, { avgMs: number; count: number; maxMs: number }>,
  key: string,
) {
  const bucket = latency[key];
  if (!bucket?.count) return '-';
  return `${bucket.avgMs}ms avg · ${bucket.maxMs}ms max · ${bucket.count} samples`;
}

function firstLatencyValue(
  latency: Record<string, { avgMs: number; count: number; maxMs: number }>,
  prefix: string,
) {
  const bucket = Object.entries(latency)
    .filter(([key, value]) => key.startsWith(`${prefix}.`) && value.count > 0)
    .sort(([, left], [, right]) => right.count - left.count)[0]?.[1];
  if (!bucket) return '-';
  return `${bucket.avgMs}ms avg · ${bucket.maxMs}ms max · ${bucket.count} samples`;
}

function satisfactionValue(
  latency: Record<string, { avgMs: number; count: number; maxMs: number }>,
) {
  const bucket = latency['user_satisfaction.score'];
  if (!bucket?.count) return '-';
  return `${Math.round(bucket.avgMs * 100)}% avg · ${bucket.count} samples`;
}

function tokenOptimizationSummaryItems(
  summary:
    | SocialAgentRuntimeMetricsDto['tokenOptimizationSummary']
    | undefined,
): Array<{
  key: string;
  label: string;
  tone: 'danger' | 'good' | 'neutral' | 'warn';
  value: string;
}> {
  if (!summary) return [];
  return [
    {
      key: 'token-optimization-avoided-llm',
      label: 'Estimated avoided LLM calls',
      value: compactNumber(summary.estimatedAvoidedLlmCalls),
      tone: summary.estimatedAvoidedLlmCalls > 0 ? 'good' : 'neutral',
    },
    {
      key: 'token-optimization-cache-hit',
      label: 'Combined cache hit rate',
      value: `${formatPercent(summary.cacheHitRate)} · ${summary.cacheHits}/${summary.cacheTotal}`,
      tone:
        summary.cacheTotal === 0
          ? 'neutral'
          : summary.cacheHitRate >= 0.5
            ? 'good'
            : 'warn',
    },
    {
      key: 'token-optimization-saved-context',
      label: 'Saved context chars',
      value: compactNumber(summary.savedApproxPromptChars),
      tone: summary.savedApproxPromptChars > 0 ? 'good' : 'neutral',
    },
    {
      key: 'token-optimization-prefix-reuse',
      label: 'Prompt prefix reuse',
      value: `${formatPercent(summary.promptPrefixReuseRate)} · ${summary.distinctPromptPrefixHashes} prefixes`,
      tone:
        summary.promptFingerprintObservations === 0
          ? 'neutral'
          : summary.promptPrefixReuseRate >= 0.5
            ? 'good'
            : 'warn',
    },
  ];
}

function deterministicActionSummaryItems(
  summary:
    | SocialAgentRuntimeMetricsDto['deterministicActionEfficiencySummary']
    | undefined,
): Array<{
  key: string;
  label: string;
  tone: 'danger' | 'good' | 'neutral' | 'warn';
  value: string;
}> {
  if (!summary) return [];
  const rows: Array<{
    key: string;
    label: string;
    tone: 'danger' | 'good' | 'neutral' | 'warn';
    value: string;
  }> = [
    {
      key: 'deterministic-actions-total',
      label: 'Deterministic low-risk actions',
      value: `${summary.total} actions`,
      tone: summary.total > 0 ? 'good' : 'neutral',
    },
    {
      key: 'deterministic-actions-avoided-llm',
      label: 'Avoided final LLM calls',
      value: compactNumber(summary.estimatedAvoidedLlmCalls),
      tone: summary.estimatedAvoidedLlmCalls > 0 ? 'good' : 'neutral',
    },
  ];

  for (const [action, count] of Object.entries(summary.byAction ?? {})
    .sort(([, left], [, right]) => right - left)
    .slice(0, 6)) {
    rows.push({
      key: `deterministic-action-${action}`,
      label: action,
      value: `${count} hits`,
      tone: 'good',
    });
  }
  return rows;
}

function deterministicRouteSummaryItems(
  summary:
    | SocialAgentRuntimeMetricsDto['deterministicRouteEfficiencySummary']
    | undefined,
): Array<{
  key: string;
  label: string;
  tone: 'danger' | 'good' | 'neutral' | 'warn';
  value: string;
}> {
  if (!summary) return [];
  const rows: Array<{
    key: string;
    label: string;
    tone: 'danger' | 'good' | 'neutral' | 'warn';
    value: string;
  }> = [
    {
      key: 'deterministic-replies-total',
      label: 'Deterministic chat replies',
      value: `${summary.total} replies`,
      tone: summary.total > 0 ? 'good' : 'neutral',
    },
    {
      key: 'deterministic-replies-avoided-llm',
      label: 'Avoided conversational LLM calls',
      value: compactNumber(summary.estimatedAvoidedLlmCalls),
      tone: summary.estimatedAvoidedLlmCalls > 0 ? 'good' : 'neutral',
    },
  ];

  for (const [intent, count] of Object.entries(summary.byIntent ?? {})
    .sort(([, left], [, right]) => right - left)
    .slice(0, 6)) {
    rows.push({
      key: `deterministic-reply-${intent}`,
      label: intent,
      value: `${count} hits`,
      tone: 'good',
    });
  }
  return rows;
}

function promptFingerprintSummaryItems(
  summary:
    | SocialAgentRuntimeMetricsDto['llmPromptFingerprintSummary']
    | undefined,
): Array<{
  key: string;
  label: string;
  tone: 'danger' | 'good' | 'neutral' | 'warn';
  value: string;
}> {
  return Object.entries(summary ?? {})
    .sort(([, left], [, right]) => right.observations - left.observations)
    .slice(0, 8)
    .map(([key, value]) => {
      const tone: 'good' | 'neutral' | 'warn' =
        value.observations === 0
          ? 'neutral'
          : value.promptPrefixReuseRate >= 0.5
            ? 'good'
            : 'warn';
      return {
        key,
        label: key,
        value: `${formatPercent(value.promptPrefixReuseRate)} reuse · ${value.distinctPromptPrefixHashes} prefix · ${value.distinctDynamicContextHashes} dynamic`,
        tone,
      };
    });
}

function cacheSummaryItems(
  summary: SocialAgentRuntimeMetricsDto['llmOutputCacheSummary'] | undefined,
): Array<{
  key: string;
  label: string;
  tone: 'danger' | 'good' | 'neutral' | 'warn';
  value: string;
}> {
  return Object.entries(summary ?? {})
    .sort(([, left], [, right]) => right.total - left.total)
    .slice(0, 8)
    .map(([key, value]) => ({
      key,
      label: key,
      value: `${formatPercent(value.hitRate)} · saved ${compactNumber(
        value.savedApproxPromptChars,
      )} chars`,
      tone: value.hitRate >= 0.5 ? 'good' : value.total > 0 ? 'warn' : 'neutral',
    }));
}

function cacheEfficiencySummaryItems(
  summary: SocialAgentRuntimeMetricsDto['cacheEfficiencySummary'] | undefined,
): Array<{
  key: string;
  label: string;
  tone: 'danger' | 'good' | 'neutral' | 'warn';
  value: string;
}> {
  const labels = {
    combined: 'Combined Cache',
    embedding: 'Embedding',
    llmOutput: 'LLM Output',
    toolResult: 'Tool Result',
  } as const;

  return (['combined', 'llmOutput', 'toolResult', 'embedding'] as const)
    .map((key) => {
      const value = summary?.[key];
      if (!value) return null;
      const tone: 'good' | 'neutral' | 'warn' =
        value.total === 0 ? 'neutral' : value.hitRate >= 0.5 ? 'good' : 'warn';
      return {
        key,
        label: labels[key],
        value: `${formatPercent(value.hitRate)} · ${value.hits}/${value.total} hit · saved ${compactNumber(
          value.savedApproxPromptChars,
        )} chars`,
        tone,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function workflowEfficiencySummaryItems(
  summary: SocialAgentRuntimeMetricsDto['workflowEfficiencySummary'] | undefined,
): Array<{
  key: string;
  label: string;
  tone: 'danger' | 'good' | 'neutral' | 'warn';
  value: string;
}> {
  if (!summary) return [];

  const reasonLabels: Record<string, string> = {
    candidate_refinement_workflow: 'Candidate refinement',
    explicit_social_workflow: 'Explicit social workflow',
    social_action_workflow: 'Social action workflow',
  };
  const topReason = Object.entries(summary.byReason ?? {}).sort(
    ([, left], [, right]) => right - left,
  )[0];

  return [
    {
      key: 'workflow-route-rate',
      label: 'Workflow route rate',
      value: `${formatPercent(summary.workflowRouteRate)} · ${summary.total}/${summary.totalIntentRoutes} routes`,
      tone:
        summary.totalIntentRoutes === 0
          ? 'neutral'
          : summary.workflowRouteRate >= 0.3
            ? 'good'
            : 'warn',
    },
    {
      key: 'estimated-avoided-llm-calls',
      label: 'Estimated avoided LLM calls',
      value: compactNumber(summary.estimatedAvoidedLlmCalls),
      tone: summary.estimatedAvoidedLlmCalls > 0 ? 'good' : 'neutral',
    },
    {
      key: 'top-workflow-reason',
      label: 'Top workflow reason',
      value: topReason
        ? `${reasonLabels[topReason[0]] ?? topReason[0]} · ${topReason[1]}`
        : '-',
      tone: topReason ? 'good' : 'neutral',
    },
  ];
}

function executionCostSummaryItems(
  summary: AgentObservabilityDto['executionCostSummary'] | undefined,
): Array<{
  key: string;
  label: string;
  tone: 'danger' | 'good' | 'neutral' | 'warn';
  value: string;
}> {
  if (!summary) return [];
  return [
    {
      key: 'agent-runs',
      label: 'Agent runs',
      value: compactNumber(summary.agentRunCount),
      tone: 'neutral',
    },
    {
      key: 'llm-calls',
      label: 'LLM calls',
      value: `${compactNumber(summary.llmCallCount)} · ${summary.avgLlmCallsPerRun}/run`,
      tone: summary.avgLlmCallsPerRun > 2 ? 'warn' : 'good',
    },
    {
      key: 'tool-calls',
      label: 'Tool calls',
      value: `${compactNumber(summary.toolCallCount)} · ${summary.avgToolCallsPerRun}/run`,
      tone: summary.avgToolCallsPerRun > 8 ? 'warn' : 'good',
    },
  ];
}

function llmStageCostSummaryItems(
  summary: AgentObservabilityDto['executionCostSummary'] | undefined,
): Array<{
  key: string;
  label: string;
  tone: 'danger' | 'good' | 'neutral' | 'warn';
  value: string;
}> {
  return Object.entries(summary?.llmByUseCase ?? {})
    .sort(([, left], [, right]) => right.calls - left.calls)
    .slice(0, 8)
    .map(([useCase, bucket]) => ({
      key: useCase,
      label: useCase,
      value: `${compactNumber(bucket.calls)} calls · ${compactNumber(
        bucket.estimatedBillableInputTokens,
      )} input · ${compactNumber(
        bucket.completionTokens + bucket.reasoningTokens,
      )} output · ${bucket.avgLatencyMs ? `${bucket.avgLatencyMs}ms` : '-'}`,
      tone: bucket.estimatedBillableInputTokens > 6000 ? 'warn' : 'neutral',
    }));
}

function toolStageCostSummaryItems(
  summary: AgentObservabilityDto['executionCostSummary'] | undefined,
): Array<{
  key: string;
  label: string;
  tone: 'danger' | 'good' | 'neutral' | 'warn';
  value: string;
}> {
  return Object.entries(summary?.toolByName ?? {})
    .sort(([, left], [, right]) => right.calls - left.calls)
    .slice(0, 8)
    .map(([toolName, bucket]) => ({
      key: toolName,
      label: toolName,
      value: `${compactNumber(bucket.calls)} calls · ${compactNumber(
        bucket.failed,
      )} failed · ${compactNumber(bucket.blocked)} blocked · ${
        bucket.avgLatencyMs ? `${bucket.avgLatencyMs}ms` : '-'
      }`,
      tone: bucket.failed > 0 ? 'warn' : 'neutral',
    }));
}

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${Math.round(value * 1000) / 10}%`;
}

function formatContextBudgetReasons(reasons: string[] | undefined) {
  if (!reasons?.length) return '-';
  const labels: Record<string, string> = {
    avg_prompt_context_too_large: 'prompt too large',
    avg_billable_input_high: 'billable input high',
    prompt_cache_hit_rate_low: 'cache hit low',
    prompt_prefix_churn_high: 'prefix churn',
  };
  return reasons.map((reason) => labels[reason] ?? reason).join(', ');
}

function compactNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function topEntries(record: Record<string, number>) {
  return Object.entries(record)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 8);
}

function topRunCostKeys(
  record:
    | Record<string, number>
    | Record<string, { calls: number; failed?: number; blocked?: number }>,
) {
  const entries = Object.entries(record)
    .map(([key, value]) => [
      key,
      typeof value === 'number' ? value : value.calls,
    ] as const)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 3);
  if (!entries.length) return '-';
  return entries.map(([key, value]) => `${key} ${value}`).join(', ');
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function friendlyError(error: unknown) {
  if (error instanceof Error && error.message) {
    if (/^\s*[{[]/.test(error.message) || /stack|trace|exception/i.test(error.message)) {
      return 'Agent L5 运行态暂时无法加载，请稍后重试。';
    }
    return error.message;
  }
  return 'Agent L5 运行态暂时无法加载，请稍后重试。';
}

export default AgentL5AdminPage;
