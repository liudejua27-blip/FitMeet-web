import clsx from 'clsx';
import { memo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  socialAgentApi,
  type SocialAgentActivityResult,
  type SocialAgentAsyncRunResult,
  type SocialAgentChatCandidate,
  type SocialAgentChatReplanRunResult,
  type SocialAgentChatRunResult,
  type SocialAgentIntentType,
  type SocialAgentPendingApproval,
  type SocialAgentStepStatus,
  type SocialAgentTaskEvent,
} from '../api/socialAgentApi';
import { cleanDisplayArray, cleanDisplayText } from '../lib/displayText';

type MessageKind = 'text' | 'risk' | 'approval';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  kind?: MessageKind;
  content: string;
  activityResults?: SocialAgentActivityResult[];
  pendingApproval?: SocialAgentPendingApproval;
};

type StatusStep = {
  id: string;
  text: string;
  state: SocialAgentStepStatus;
};

type DraftPublishState = {
  status: 'idle' | 'publishing' | 'published' | 'failed';
  socialRequestId?: number | null;
  publicIntentId?: string | null;
  error?: string | null;
};

type CandidateActionState =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'sending'
  | 'sent'
  | 'connecting'
  | 'connected'
  | 'pendingApproval'
  | 'failed';

type CandidateActionSnapshot = {
  save: CandidateActionState;
  send: CandidateActionState;
  connect: CandidateActionState;
  error?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  friendRequestId?: string | null;
};

const stepLabels: Record<string, string> = {
  understand: '正在理解你的社交需求',
  permission: '正在检查权限模式',
  deepseek: '正在调用 DeepSeek 生成匹配意图',
  search: '正在检索附近候选人',
  rank: '正在根据时间、地点、兴趣和安全边界排序',
  draft: '正在生成约练草稿',
  reason: '正在生成推荐理由',
  done: '已完成',
  append_context: '已写入当前任务上下文',
  follow_up_understand: '正在理解补充需求',
  follow_up_replan: '正在更新 Agent 执行计划',
  follow_up_search: '正在重新匹配候选人',
};

const followUpStepOrder = [
  'append_context',
  'follow_up_understand',
  'follow_up_replan',
  'draft',
  'search',
  'rank',
  'reason',
  'done',
] as const;

const initialStepOrder = [
  'understand',
  'permission',
  'deepseek',
  'draft',
  'search',
  'rank',
  'reason',
  'done',
] as const;

const CONFIRM_PERMISSION_MODE_LABEL = 'Confirm Mode';

export const SocialAgentConsolePage = memo(function SocialAgentConsolePage() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [statuses, setStatuses] = useState<StatusStep[]>([]);
  const [result, setResult] = useState<SocialAgentChatRunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [draftPublish, setDraftPublish] = useState<DraftPublishState>({ status: 'idle' });
  const [candidateStates, setCandidateStates] = useState<Record<number, CandidateActionSnapshot>>({});
  const [actionStatus, setActionStatus] = useState('');
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);

  const started = messages.length > 0;
  const draft = result?.socialRequestDraft ?? null;
  const candidates = result?.candidates ?? [];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const goal = cleanDisplayText(input, '').trim();
    if (!goal || isRunning) return;

    setIsRunning(true);
    setIsPublishing(false);
    setActionStatus('');
    setStatuses([]);
    const taskId = result?.taskId ?? activeTaskId;
    if (!taskId) {
      setDraftPublish({ status: 'idle' });
      setCandidateStates({});
      setResult(null);
    }
    setMessages((items) => [...items, { id: nextId('user'), role: 'user', content: goal }]);

    try {
      setInput('');
      const handled = await socialAgentApi.handleMessage({
        message: goal,
        taskId,
        hasCandidates: candidates.length > 0,
      });
      if (handled.taskId) setActiveTaskId(handled.taskId);

      if (!handled.shouldQueueRun || !handled.queuedRun) {
        if (handled.savedContext) {
          setStatuses([
            {
              id: 'append_context',
              text: handled.intent === 'safety_or_boundary' ? '已写入安全边界' : '已写入偏好上下文',
              state: 'done',
            },
          ]);
        }
        setMessages((items) => {
          const extra: Message[] = [
            {
              id: nextId('assistant'),
              role: 'assistant',
              content: handled.assistantMessage,
              activityResults: handled.activityResults ?? undefined,
            },
          ];
          if (handled.intent === 'safety_or_boundary' && handled.savedContext) {
            extra.push({
              id: nextId('risk'),
              role: 'assistant',
              kind: 'risk',
              content: '已记住你的边界，后续匹配会硬过滤。首次线下见面建议选择公开场所，并保留平台内沟通记录。',
            });
          }
          if (handled.pendingApproval) {
            extra.push({
              id: nextId('approval'),
              role: 'assistant',
              kind: 'approval',
              content: handled.pendingApproval.summary,
              pendingApproval: handled.pendingApproval,
            });
          }
          return [...items, ...extra];
        });
        return;
      }

      setDraftPublish({ status: 'idle' });
      setCandidateStates({});
      if (handled.runMode === 'initial') setResult(null);
      setMessages((items) => [
        ...items,
        { id: nextId('assistant'), role: 'assistant', content: handled.assistantMessage },
      ]);
      setStatuses(pendingStatusesForIntent(handled.intent, handled.runMode ?? 'initial'));
      const queued = handled.queuedRun;
      setActiveTaskId(queued.taskId);
      applyRunProgress(queued, [], handled.runMode ?? 'initial');
      await pollAgentRun(queued.taskId, queued.runId, handled.runMode ?? 'initial');
    } catch (error) {
      const msg = errorMessage(error);
      const isUnified = msg.startsWith('请求超时');
      setMessages((items) => [
        ...items,
        {
          id: nextId('assistant'),
          role: 'assistant',
          content: isUnified ? msg : `抱歉，这次没有处理成功。${msg}`,
        },
      ]);
      setStatuses((items) =>
        items.map((item) =>
          item.state === 'running' ? { ...item, state: 'failed' } : item,
        ),
      );
    } finally {
      setIsRunning(false);
    }
  };

  const pollAgentRun = async (
    taskId: number,
    runId: string,
    mode: 'initial' | 'follow_up',
  ) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 120_000) {
      const [run, timeline] = await Promise.all([
        socialAgentApi.getRunStatus(taskId, runId),
        socialAgentApi.getTaskEvents(taskId).catch(() => null),
      ]);
      applyRunProgress(run, timeline?.events ?? [], mode);

      if (run.status === 'completed' && run.result) {
        const refreshed = run.result;
        setResult(refreshed);
        setActiveTaskId(refreshed.taskId);
        setCandidateStates({});
        setDraftPublish({ status: 'idle' });
        setMessages((items) => [
          ...items,
          {
            id: nextId('assistant'),
            role: 'assistant',
            content: mode === 'follow_up' && isReplanRunResult(refreshed)
              ? replanAssistantMessage(refreshed)
              : assistantMessage(refreshed),
          },
        ]);
        return;
      }

      if (run.status === 'failed') {
        throw new Error(cleanDisplayText(run.error?.message, '重新规划失败，请稍后重试。'));
      }

      await delay(Math.max(800, Math.min(run.pollAfterMs ?? 1500, 3000)));
    }

    throw new Error(
      mode === 'follow_up'
        ? '重新规划仍在后台执行，你的补充信息已保存。请稍后再试。'
        : '搜索仍在后台执行，请稍后再试。',
    );
  };

  const applyRunProgress = (
    run: SocialAgentAsyncRunResult,
    events: SocialAgentTaskEvent[] = [],
    mode: 'initial' | 'follow_up' = 'follow_up',
  ) => {
    setStatuses(statusesFromRun(run, events, mode));
    if (events.some((event) => event.eventType === 'social_agent.llm.timeout')) {
      setActionStatus('AI 分析超时，已使用规则匹配继续执行。');
    }
  };

  const setCandidateAction = (
    userId: number,
    patch: Partial<CandidateActionSnapshot>,
  ) => {
    setCandidateStates((current) => ({
      ...current,
      [userId]: {
        ...emptyCandidateActionState(),
        ...(current[userId] ?? {}),
        ...patch,
      },
    }));
  };

  const publishDraft = async () => {
    if (!result?.taskId || !draft || isPublishing) return;
    if (draftPublish.status === 'published') {
      navigate('/hall');
      return;
    }
    setIsPublishing(true);
    setDraftPublish((current) => ({ ...current, status: 'publishing', error: null }));
    setActionStatus('正在发布约练，并写入 Agent 审计记录...');

    try {
      const published = await socialAgentApi.publishSocialRequest(result.taskId, draft);
      setDraftPublish({
        status: 'published',
        socialRequestId: published.socialRequestId,
        publicIntentId: published.publicIntentId,
        error: null,
      });
      setResult((current) =>
        current
          ? {
              ...current,
              status: published.taskStatus,
              socialRequestDraft: current.socialRequestDraft
                ? {
                    ...current.socialRequestDraft,
                    socialRequestId: published.socialRequestId,
                    publicIntentId: published.publicIntentId,
                    status: published.status,
                    synced: published.synced,
                  }
                : current.socialRequestDraft,
              candidates: current.candidates.map((candidate) => ({
                ...candidate,
                socialRequestId: candidate.socialRequestId ?? published.socialRequestId,
              })),
            }
          : current,
      );
      setActionStatus(`约练已发布，已同步到大厅。后续匹配、消息和候选动作都会关联 task #${result.taskId}。`);
    } catch (error) {
      const message = errorMessage(error, '发布失败，请稍后再试。');
      setDraftPublish((current) => ({ ...current, status: 'failed', error: message }));
      setActionStatus(message);
    } finally {
      setIsPublishing(false);
    }
  };

  const saveCandidate = async (candidate: SocialAgentChatCandidate) => {
    const state = candidateStates[candidate.userId];
    if (!result?.taskId || state?.save === 'saving') return;
    setCandidateAction(candidate.userId, { save: 'saving', error: null });
    setActionStatus(`正在收藏 ${displayName(candidate)}，并通过 SaveCandidate 写入候选记录...`);

    try {
      await socialAgentApi.saveCandidate(result.taskId, {
        candidateRecordId: candidate.candidateRecordId,
        socialRequestId: candidate.socialRequestId ?? draft?.socialRequestId ?? null,
        targetUserId: candidate.userId,
        candidate: {
          userId: candidate.userId,
          nickname: candidate.nickname,
          score: candidate.score,
          reasons: candidate.reasons,
        },
      });
      setCandidateAction(candidate.userId, { save: 'saved', error: null });
      setActionStatus(`${displayName(candidate)} 已收藏，候选状态已持久化并关联 task #${result.taskId}。`);
    } catch (error) {
      const message = errorMessage(error, '收藏失败，请稍后再试。');
      setCandidateAction(candidate.userId, { save: 'failed', error: message });
      setActionStatus(message);
    }
  };

  const sendMessage = async (candidate: SocialAgentChatCandidate) => {
    const message = cleanDisplayText(candidate.suggestedMessage, '').trim();
    const state = candidateStates[candidate.userId];
    if (!result?.taskId || !message || state?.send === 'sending') return;
    setCandidateAction(candidate.userId, { send: 'sending', error: null });
    setActionStatus(`正在发送给 ${displayName(candidate)}，并记录确认事件...`);

    try {
      const sent = await socialAgentApi.sendCandidateMessage(result.taskId, {
        candidateUserId: candidate.userId,
        targetUserId: candidate.userId,
        message,
        suggestedOpener: message,
        candidateRecordId: candidate.candidateRecordId,
        socialRequestId: candidate.socialRequestId ?? draft?.socialRequestId ?? null,
        candidate: {
          userId: candidate.userId,
          nickname: candidate.nickname,
          score: candidate.score,
          reasons: candidate.reasons,
          candidateRecordId: candidate.candidateRecordId,
          socialRequestId: candidate.socialRequestId,
        },
      });
      if (!sent.success || sent.status === 'failed') {
        throw new Error('发送失败，请稍后再试。');
      }
      setCandidateAction(candidate.userId, {
        send: sent.status === 'pending' || sent.status === 'pending_approval' ? 'pendingApproval' : 'sent',
        error: null,
        conversationId: sent.conversationId,
        messageId: sent.messageId,
      });
      setResult((current) =>
        current
          ? {
              ...current,
              candidates: current.candidates.map((item) =>
                item.userId === candidate.userId
                  ? { ...item, status: sent.candidateStatus ?? 'messaged' }
                  : item,
              ),
            }
          : current,
      );
      setActionStatus(
        sent.conversationId
          ? `已发送给 ${displayName(candidate)}，可前往消息查看。`
          : `已发送给 ${displayName(candidate)}，消息已关联 task #${result.taskId}。`,
      );
    } catch (error) {
      const messageText = errorMessage(error, '发送失败，请稍后再试。');
      setCandidateAction(candidate.userId, { send: 'failed', error: messageText });
      setActionStatus(messageText);
    }
  };

  const connectCandidate = async (candidate: SocialAgentChatCandidate) => {
    const state = candidateStates[candidate.userId];
    if (!result?.taskId || state?.connect === 'connecting') return;
    setCandidateAction(candidate.userId, { connect: 'connecting', error: null });
    setActionStatus(`正在添加 ${displayName(candidate)} 为好友，并创建站内会话...`);

    try {
      const connection = await socialAgentApi.connectCandidate(result.taskId, {
        candidateUserId: candidate.userId,
        candidateRecordId: candidate.candidateRecordId,
        socialRequestId: candidate.socialRequestId ?? draft?.socialRequestId ?? null,
        targetUserId: candidate.userId,
        candidate: {
          userId: candidate.userId,
          nickname: candidate.nickname,
          score: candidate.score,
          reasons: candidate.reasons,
        },
      });
      if (!connection.success || connection.status === 'failed') {
        throw new Error('加好友失败，请稍后再试。');
      }
      if (connection.conversationId) {
        setCandidateAction(candidate.userId, {
          connect: 'connected',
          error: null,
          conversationId: connection.conversationId,
          friendRequestId: connection.friendRequestId,
        });
        setActionStatus(`${displayName(candidate)} 已加为好友，正在进入聊天。`);
        navigate(`/messages?conversationId=${encodeURIComponent(connection.conversationId)}`);
        return;
      }
      const pending = connection.status === 'pending' || connection.status === 'requested';
      setCandidateAction(candidate.userId, {
        connect: pending ? 'pendingApproval' : 'connected',
        error: null,
        friendRequestId: connection.friendRequestId,
      });
      setActionStatus(
        pending
          ? '好友申请已发送，等待对方确认。'
          : `${displayName(candidate)} 好友动作已提交，但暂未创建会话。`,
      );
    } catch (error) {
      const message = errorMessage(error, '加好友失败，请稍后再试。');
      setCandidateAction(candidate.userId, { connect: 'failed', error: message });
      setActionStatus(message);
    }
  };

  const pendingApprovalsCount = messages.filter(
    (m) => m.kind === 'approval' && m.pendingApproval,
  ).length;
  const agentState = computeAgentState({
    isRunning,
    statuses,
    pendingApprovals: pendingApprovalsCount,
  });
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const currentGoal = result?.socialRequestDraft?.title || lastUserMessage?.content || '';

  return (
    <div className="min-h-screen bg-[#f8f8f6] text-[#202124]">
      <TopStatusBar
        agentState={agentState}
        currentGoal={currentGoal}
        pendingApprovals={pendingApprovalsCount}
      />
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 pb-40 pt-24 sm:px-6">
        <section className="mx-auto mt-4 flex w-full max-w-3xl flex-1 flex-col">
          {!started ? (
            <div className="flex flex-1 items-center justify-center pb-20">
              <h1 className="text-center text-3xl font-normal text-[#2f302d] sm:text-5xl">
                你想认识什么样的人？
              </h1>
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}

              {statuses.length > 0 ? <StatusStream statuses={statuses} /> : null}

              {draft ? (
                <DraftCard
                  draft={draft}
                  publishState={draftPublish}
                  isPublishing={isPublishing}
                  onPublish={publishDraft}
                />
              ) : null}

              {result && candidates.length === 0 ? (
                <EmptyResult />
              ) : candidates.length > 0 ? (
                <div className="space-y-3">
                  {candidates.map((candidate) => (
                    <CandidateCard
                      key={`${candidate.userId}:${candidate.candidateRecordId ?? 'candidate'}`}
                      candidate={candidate}
                      state={candidateStates[candidate.userId] ?? emptyCandidateActionState()}
                      onSave={saveCandidate}
                      onSendMessage={sendMessage}
                      onConnect={connectCandidate}
                    />
                  ))}
                </div>
              ) : null}

              {actionStatus ? (
                <div className="rounded-xl bg-[#f1f1ee] px-3 py-2 text-sm font-bold text-[#686963]">
                  {actionStatus}
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>

      <form
        onSubmit={submit}
        className="fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-[#f8f8f6] via-[#f8f8f6] to-transparent px-4 pb-5 pt-8"
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-[28px] border border-[#deded8] bg-white p-2 shadow-[0_12px_36px_rgba(32,33,36,0.12)]">
          {!started ? <ConfirmModeBadge className="mb-1 hidden sm:flex" /> : null}
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            className="max-h-32 min-h-[46px] flex-1 resize-none border-0 bg-transparent px-3 py-3 text-[15px] leading-6 text-[#202124] outline-none placeholder:text-[#8c8d88]"
            placeholder={result?.taskId || activeTaskId ? '继续聊天、补充偏好，或调整搜索条件...' : '先聊天，或说出你想找的人/活动...'}
          />
          <button
            type="submit"
            disabled={isRunning || !cleanDisplayText(input, '').trim()}
            className="mb-1 flex h-10 shrink-0 items-center justify-center rounded-full bg-[#202124] px-4 text-sm font-black text-white transition hover:bg-[#343633] disabled:cursor-not-allowed disabled:bg-[#d2d2cc]"
            aria-label="发送"
          >
            {isRunning ? '处理中' : '发送'}
          </button>
        </div>
        {!started ? (
          <div className="mx-auto mt-2 block max-w-3xl sm:hidden">
            <ConfirmModeBadge className="flex w-full" />
          </div>
        ) : null}
      </form>
    </div>
  );
});

type AgentState = 'online' | 'analyzing' | 'searching' | 'awaitingConfirmation';

function computeAgentState({
  isRunning,
  statuses,
  pendingApprovals,
}: {
  isRunning: boolean;
  statuses: StatusStep[];
  pendingApprovals: number;
}): AgentState {
  if (pendingApprovals > 0) return 'awaitingConfirmation';
  if (isRunning) {
    const searching = statuses.some(
      (s) => (s.id === 'search' || s.id === 'follow_up_search') && s.state === 'running',
    );
    return searching ? 'searching' : 'analyzing';
  }
  return 'online';
}

const agentStateLabel: Record<AgentState, string> = {
  online: '在线',
  analyzing: '正在分析',
  searching: '正在搜索',
  awaitingConfirmation: '等待确认',
};

const agentStateDotColor: Record<AgentState, string> = {
  online: 'bg-[#168a55]',
  analyzing: 'bg-[#3a72d6]',
  searching: 'bg-[#3a72d6]',
  awaitingConfirmation: 'bg-[#d49a17]',
};

function TopStatusBar({
  agentState,
  currentGoal,
  pendingApprovals,
}: {
  agentState: AgentState;
  currentGoal: string;
  pendingApprovals: number;
}) {
  const isLive = agentState === 'analyzing' || agentState === 'searching';
  return (
    <div className="fixed left-0 right-0 top-0 z-30 border-b border-[#e6e6df] bg-[#f8f8f6]/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-4xl items-center gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-2 text-[13px] font-black text-[#202124]">
          <span className="text-base">FitMeet</span>
          <span className="text-[#a8a9a3]">·</span>
          <span>Social Agent</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[12px] font-bold text-[#555]">
          <span
            className={clsx(
              'h-1.5 w-1.5 rounded-full',
              agentStateDotColor[agentState],
              isLive && 'animate-pulse',
            )}
          />
          {agentStateLabel[agentState]}
        </div>
        <div
          className="hidden h-7 items-center rounded-full border border-[#e4e4de] bg-white px-2.5 text-[11px] font-bold text-[#555] sm:flex"
          aria-label="权限模式"
        >
          {CONFIRM_PERMISSION_MODE_LABEL}
        </div>
        {currentGoal ? (
          <div className="hidden min-w-0 flex-1 truncate text-[12px] text-[#777872] sm:block" title={currentGoal}>
            目标：{currentGoal}
          </div>
        ) : (
          <div className="hidden flex-1 sm:block" />
        )}
        {pendingApprovals > 0 ? (
          <div className="flex items-center gap-1 rounded-full bg-[#fff0ed] px-2.5 py-1 text-[11px] font-bold text-[#b42318]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#b42318]" />
            {pendingApprovals} 个待确认
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ConfirmModeBadge({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        'h-10 shrink-0 items-center justify-center rounded-full border border-[#e4e4de] bg-[#f7f7f4] px-3 text-xs font-bold text-[#555]',
        className,
      )}
      aria-label="权限模式"
    >
      {CONFIRM_PERMISSION_MODE_LABEL}
    </div>
  );
}

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const activities = message.activityResults ?? [];

  if (message.kind === 'risk') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[82%] rounded-2xl border border-[#f3e3b3] bg-[#fffaeb] px-4 py-3 text-[14px] leading-6 text-[#7a5a12]">
          <div className="text-[12px] font-black uppercase tracking-wide text-[#8a5a00]">风险提示</div>
          <div className="mt-1">{message.content}</div>
        </div>
      </div>
    );
  }

  if (message.kind === 'approval' && message.pendingApproval) {
    const approval = message.pendingApproval;
    const riskColor =
      approval.riskLevel === 'high'
        ? 'border-[#f3b4ad] bg-[#fff0ed] text-[#b42318]'
        : approval.riskLevel === 'medium'
          ? 'border-[#f3e3b3] bg-[#fffaeb] text-[#7a5a12]'
          : 'border-[#cfe5d6] bg-[#f3faf5] text-[#168a55]';
    return (
      <div className="flex justify-start">
        <article className="max-w-[82%] rounded-2xl border border-[#e6e6df] bg-white p-4 shadow-[0_8px_24px_rgba(32,33,36,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[12px] font-black uppercase tracking-wide text-[#777872]">待确认动作</div>
            <span className={clsx('rounded-full border px-2 py-[2px] text-[11px] font-bold', riskColor)}>
              {approval.riskLevel === 'high' ? '高风险' : approval.riskLevel === 'medium' ? '中等风险' : '低风险'}
            </span>
          </div>
          <h3 className="mt-2 text-[15px] font-black text-[#202124]">{approval.actionType}</h3>
          <p className="mt-1 text-sm leading-6 text-[#555650]">{message.content}</p>
          <div className="mt-3 rounded-xl bg-[#f8f8f6] p-3 text-xs leading-5 text-[#686963]">
            该动作会进入待确认队列，Agent 不会绕过你直接执行。可在消息或好友页确认或拒绝。
          </div>
          {approval.expiresAt ? (
            <div className="mt-2 text-[11px] font-bold text-[#8c8d88]">
              过期时间：{new Date(approval.expiresAt).toLocaleString()}
            </div>
          ) : null}
        </article>
      </div>
    );
  }

  return (
    <div className={clsx('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={clsx(
          'max-w-[82%] rounded-2xl px-4 py-3 text-[15px] leading-7',
          isUser ? 'bg-[#ebeef7] text-[#202124]' : 'bg-transparent text-[#2f302d]',
        )}
      >
        <div>{message.content}</div>
        {!isUser && activities.length > 0 ? (
          <div className="mt-3 flex flex-col gap-2">
            {activities.map((activity) => (
              <ActivityResultCard key={activity.id} activity={activity} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ActivityResultCard({ activity }: { activity: SocialAgentActivityResult }) {
  const tags = activity.interestTags ?? [];
  const desc = activity.description?.length > 80 ? `${activity.description.slice(0, 80)}…` : activity.description;
  return (
    <div className="rounded-xl border border-[#e4e4de] bg-white px-3 py-2 text-[13px] leading-5 text-[#2f302d]">
      <div className="flex items-center gap-2 text-[14px] font-semibold">
        <span className="truncate">{activity.title || '公开约练'}</span>
        {activity.city ? <span className="text-[12px] font-normal text-[#686963]">· {activity.city}</span> : null}
        {activity.requestType ? (
          <span className="text-[12px] font-normal text-[#686963]">· {activity.requestType}</span>
        ) : null}
      </div>
      {desc ? <div className="mt-1 text-[#555]">{desc}</div> : null}
      {activity.timePreference ? (
        <div className="mt-1 text-[12px] text-[#686963]">时间：{activity.timePreference}</div>
      ) : null}
      {tags.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {tags.slice(0, 6).map((tag) => (
            <span key={tag} className="rounded-full bg-[#f0efe9] px-2 py-[2px] text-[11px] text-[#555]">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StatusStream({ statuses }: { statuses: StatusStep[] }) {
  return (
    <div className="ml-3 inline-flex max-w-full flex-col gap-1 border-l border-[#deded8] pl-3">
      {statuses.map((step) => (
        <div
          key={step.id}
          className="flex min-h-[20px] items-center gap-2 text-[13px] leading-5 text-[#686963] transition-all"
        >
          <StatusIcon state={step.state} />
          <span className="truncate">{step.text}</span>
        </div>
      ))}
    </div>
  );
}

function StatusIcon({ state }: { state: SocialAgentStepStatus }) {
  if (state === 'done') return <span className="text-[#168a55]">✓</span>;
  if (state === 'failed') return <span className="text-[#c24135]">!</span>;
  if (state === 'running') {
    return (
      <span className="h-2.5 w-2.5 animate-spin rounded-full border border-[#8a8b85] border-t-transparent" />
    );
  }
  return <span className="h-1.5 w-1.5 rounded-full bg-[#b7b8b1]" />;
}

function DraftCard({
  draft,
  publishState,
  isPublishing,
  onPublish,
}: {
  draft: NonNullable<SocialAgentChatRunResult['socialRequestDraft']>;
  publishState: DraftPublishState;
  isPublishing: boolean;
  onPublish: () => void;
}) {
  const tags = cleanDisplayArray(draft.interestTags);
  const isPublished = publishState.status === 'published';
  const isFailed = publishState.status === 'failed';
  return (
    <article className="rounded-2xl border border-[#e6e6df] bg-white p-4 shadow-[0_8px_24px_rgba(32,33,36,0.06)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-black text-[#777872]">约练草稿</div>
          <h2 className="mt-1 text-base font-black text-[#202124]">
            {cleanDisplayText(draft.title, '待确认约练')}
          </h2>
        </div>
        <span
          className={clsx(
            'rounded-full px-3 py-1 text-xs font-black',
            isPublished
              ? 'bg-[#e7f7ed] text-[#168a55]'
              : isFailed
                ? 'bg-[#fff0ed] text-[#b42318]'
                : 'bg-[#fff6df] text-[#8a5a00]',
          )}
        >
          {isPublished ? '已发布' : isFailed ? '发布失败' : '待确认'}
        </span>
      </div>
      {isPublished ? (
        <div className="mt-2 text-xs font-black text-[#168a55]">已同步到大厅</div>
      ) : null}
      <p className="mt-3 text-sm leading-6 text-[#555650]">
        {cleanDisplayText(draft.description, cleanDisplayText(draft.rawText, 'AI 已生成约练草稿。'))}
      </p>
      {tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-[#f1f1ee] px-2 py-1 text-[11px] font-bold text-[#666762]"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={onPublish}
        disabled={isPublishing}
        className="mt-4 rounded-full bg-[#202124] px-4 py-2 text-sm font-black text-white transition hover:bg-[#343633] disabled:cursor-not-allowed disabled:bg-[#d2d2cc]"
      >
        {isPublished
          ? '查看大厅展示'
          : isPublishing
            ? '发布中...'
            : isFailed
              ? '发布失败，重试'
              : '确认发布约练'}
      </button>
      {publishState.status === 'failed' && publishState.error ? (
        <div className="mt-3 rounded-xl bg-[#fff0ed] px-3 py-2 text-xs font-bold text-[#b42318]">
          {publishState.error}
        </div>
      ) : null}
    </article>
  );
}

function CandidateCard({
  candidate,
  state,
  onSave,
  onSendMessage,
  onConnect,
}: {
  candidate: SocialAgentChatCandidate;
  state: CandidateActionSnapshot;
  onSave: (candidate: SocialAgentChatCandidate) => void;
  onSendMessage: (candidate: SocialAgentChatCandidate) => void;
  onConnect: (candidate: SocialAgentChatCandidate) => void;
}) {
  const name = displayName(candidate);
  const avatar = cleanDisplayText(candidate.avatar, '');
  const tags = cleanDisplayArray(candidate.commonTags);
  const reasons = cleanDisplayArray(candidate.reasons);
  const warnings = cleanDisplayArray(candidate.risk?.warnings);
  const opener = cleanDisplayText(candidate.suggestedMessage, '');
  const canSave = Boolean(candidate.candidateRecordId || (candidate.socialRequestId && candidate.userId));
  const isSaved = state.save === 'saved' || candidate.status === 'approved';
  const isSaving = state.save === 'saving';
  const isSaveFailed = state.save === 'failed';
  const isSending = state.send === 'sending';
  const isSent = state.send === 'sent' || candidate.status === 'messaged';
  const isSendPending = state.send === 'pendingApproval';
  const isSendFailed = state.send === 'failed';
  const isConnecting = state.connect === 'connecting';
  const isConnected = state.connect === 'connected';
  const isConnectPending = state.connect === 'pendingApproval';
  const isConnectFailed = state.connect === 'failed';
  const hasStatusNotice = isSent || isConnected || isSendPending || isConnectPending || Boolean(state.error);

  return (
    <article className="rounded-2xl border border-[#e6e6df] bg-white p-4 shadow-[0_8px_24px_rgba(32,33,36,0.06)]">
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-black text-white"
          style={{ backgroundColor: cleanDisplayText(candidate.color, '#202124') }}
        >
          {avatar ? (
            <img src={avatar} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            name.slice(0, 1)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="truncate text-base font-black text-[#202124]">{name}</h3>
            <span className="text-sm font-black text-[#168a55]">
              {Math.round(candidate.score)}% 匹配
            </span>
          </div>
          <p className="mt-1 text-xs font-bold text-[#777872]">
            {candidateLocation(candidate)}
          </p>
        </div>
      </div>

      {tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-[#f1f1ee] px-2 py-1 text-[11px] font-bold text-[#666762]"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 space-y-1">
        {(reasons.length > 0 ? reasons : ['TA 与你的时间、地点或兴趣边界较匹配。'])
          .slice(0, 4)
          .map((reason) => (
            <p key={reason} className="text-sm leading-6 text-[#555650]">
              {reason}
            </p>
          ))}
      </div>

      {warnings.length > 0 ? (
        <div className="mt-3 rounded-xl bg-[#fff6df] p-3 text-xs leading-5 text-[#7a5a12]">
          {warnings.slice(0, 2).join('，')}
        </div>
      ) : null}

      {opener ? (
        <p className="mt-3 rounded-xl bg-[#f8f8f6] p-3 text-sm leading-6 text-[#555650]">
          {opener}
        </p>
      ) : null}

      {hasStatusNotice && (
        <div
          className={clsx(
            'mt-3 rounded-xl px-3 py-2 text-xs font-bold leading-5',
            state.error
              ? 'bg-[#fff0ed] text-[#b42318]'
              : 'bg-[#edf7ef] text-[#168a55]',
          )}
          role={state.error ? 'alert' : 'status'}
        >
          {state.error ?? candidateActionText(state)}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSave(candidate)}
          disabled={isSaved || isSaving || !canSave}
          className={clsx(
            'rounded-full border px-4 py-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-60',
            isSaveFailed
              ? 'border-[#f3b4ad] text-[#b42318] hover:bg-[#fff0ed]'
              : 'border-[#e4e4de] text-[#555] hover:border-[#c7c7bf]',
          )}
        >
          {isSaved ? '已收藏' : isSaving ? '正在收藏' : isSaveFailed ? '收藏失败，重试' : '收藏'}
        </button>
        <button
          type="button"
          onClick={() => onSendMessage(candidate)}
          disabled={!opener || isSending || isSent || isSendPending}
          className={clsx(
            'rounded-full px-4 py-2 text-sm font-black text-white transition disabled:cursor-not-allowed disabled:bg-[#d2d2cc]',
            isSendFailed ? 'bg-[#b42318] hover:bg-[#922018]' : 'bg-[#202124] hover:bg-[#343633]',
          )}
        >
          {isSent
            ? '已发送'
            : isSendPending
              ? '等待确认'
              : isSending
                ? '发送中'
                : isSendFailed
                  ? '发送失败，重试'
                  : '确认发送'}
        </button>
        <button
          type="button"
          onClick={() => onConnect(candidate)}
          disabled={isConnecting || isConnected || isConnectPending || !candidate.userId}
          className={clsx(
            'rounded-full border px-4 py-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-60',
            isConnectFailed
              ? 'border-[#f3b4ad] text-[#b42318] hover:bg-[#fff0ed]'
              : 'border-[#202124] text-[#202124] hover:bg-[#f1f1ee]',
          )}
        >
          {isConnected
            ? '已连接，正在跳转'
            : isConnectPending
              ? '等待确认'
              : isConnecting
                ? '正在连接'
                : isConnectFailed
                  ? '连接失败，重试'
                  : '加好友并聊天'}
        </button>
      </div>
    </article>
  );
}

function EmptyResult() {
  return (
    <div className="rounded-2xl border border-dashed border-[#d9d9d2] bg-white/70 p-5 text-sm leading-6 text-[#686963]">
      暂时没有找到符合条件的真实候选人。可以放宽城市、时间、距离或兴趣条件后重新搜索。
    </div>
  );
}

function emptyCandidateActionState(): CandidateActionSnapshot {
  return { save: 'idle', send: 'idle', connect: 'idle', error: null };
}

function candidateActionText(state: CandidateActionSnapshot): string {
  if (state.connect === 'connected') return '已连接，正在打开消息页。';
  if (state.connect === 'pendingApproval') return '好友申请已发送，等待对方确认。';
  if (state.send === 'sent') {
    return state.conversationId ? '已发送，可前往消息查看。' : '已发送。';
  }
  if (state.send === 'pendingApproval') return '消息已进入待确认队列。';
  if (state.save === 'saved') return '已收藏。';
  return '操作已完成。';
}

function pendingStatusesForIntent(
  intent: SocialAgentIntentType,
  mode: 'initial' | 'follow_up',
): StatusStep[] {
  const searchText = intent === 'activity_search' ? '正在搜索活动' : '正在搜索候选人';
  if (mode === 'follow_up') {
    return [
      { id: 'append_context', text: '已写入当前任务上下文', state: 'done' },
      { id: 'follow_up_understand', text: '正在理解补充需求', state: 'running' },
      { id: 'follow_up_replan', text: '正在更新 Agent 执行计划', state: 'pending' },
      { id: 'search', text: searchText, state: 'pending' },
    ];
  }
  return [
    { id: 'understand', text: '正在理解你的需求', state: 'running' },
    { id: 'search', text: searchText, state: 'pending' },
    { id: 'reason', text: '正在生成推荐理由', state: 'pending' },
  ];
}

function statusesFromRun(
  run: SocialAgentAsyncRunResult,
  events: SocialAgentTaskEvent[],
  mode: 'initial' | 'follow_up',
): StatusStep[] {
  const order = mode === 'initial' ? initialStepOrder : followUpStepOrder;
  const stepMap = new Map<string, StatusStep>();
  if (mode === 'follow_up') {
    stepMap.set('append_context', {
      id: 'append_context',
      text: '已写入当前任务上下文',
      state: 'done',
    });
  }

  for (const step of run.visibleSteps ?? []) {
    const id = normalizeRunStepId(step.id, mode);
    if (!id) continue;
    stepMap.set(id, {
      id,
      text: runStepText(id, step.label, step.status),
      state: step.status,
    });
  }

  if (events.some((event) => event.eventType === 'social_agent.llm.timeout')) {
    stepMap.set('follow_up_replan', {
      id: 'follow_up_replan',
      text: 'AI 分析超时，已使用规则匹配继续执行',
      state: 'done',
    });
  }

  const phaseId = normalizeRunStepId(run.phase, mode);
  const phaseIndex = phaseId ? (order as readonly string[]).indexOf(phaseId) : -1;
  return order.map((id, index) => {
    const existing = stepMap.get(id);
    if (run.status === 'completed') {
      if (id === 'done') {
        return {
          id,
          text: run.result
            ? `已刷新计划和 ${run.result.candidates.length} 位候选人`
            : '已完成',
          state: 'done',
        };
      }
      return existing ?? { id, text: runStepText(id, stepLabels[id] ?? '', 'done'), state: 'done' };
    }
    if (run.status === 'failed') {
      if (existing) return existing.state === 'running' ? { ...existing, state: 'failed' } : existing;
      return {
        id,
        text: stepLabels[id] ?? '正在处理任务',
        state: id === 'follow_up_replan' ? 'failed' : index < 2 ? 'done' : 'pending',
      };
    }
    if (existing) return existing;
    if (phaseIndex >= 0 && index < phaseIndex) {
      return { id, text: runStepText(id, stepLabels[id] ?? '', 'done'), state: 'done' };
    }
    if (phaseIndex >= 0 && index === phaseIndex) {
      return { id, text: runStepText(id, stepLabels[id] ?? '', 'running'), state: 'running' };
    }
    return { id, text: stepLabels[id] ?? '正在处理任务', state: 'pending' };
  });
}

function normalizeRunStepId(
  id: string,
  mode: 'initial' | 'follow_up',
): (typeof followUpStepOrder)[number] | (typeof initialStepOrder)[number] | null {
  if (id === 'task.created') return mode === 'follow_up' ? 'append_context' : 'understand';
  if (id === 'understand') return mode === 'follow_up' ? 'follow_up_understand' : 'understand';
  if (id === 'completed') return 'done';
  if (id === 'queued') return mode === 'follow_up' ? 'append_context' : 'understand';
  const order = mode === 'initial' ? initialStepOrder : followUpStepOrder;
  if ((order as readonly string[]).includes(id)) {
    return id as (typeof followUpStepOrder)[number];
  }
  return null;
}

function runStepText(
  id: (typeof followUpStepOrder)[number] | (typeof initialStepOrder)[number],
  label: string,
  state: SocialAgentStepStatus,
): string {
  if (id === 'understand') return state === 'done' ? '已理解需求' : '正在理解需求';
  if (id === 'permission') return state === 'done' ? '已检查权限模式' : `正在检查权限模式：${CONFIRM_PERMISSION_MODE_LABEL}`;
  if (id === 'deepseek') return state === 'done' ? '已生成匹配意图' : '正在生成匹配意图';
  if (id === 'search') return state === 'done' ? '已搜索候选人' : '正在搜索候选人';
  if (id === 'draft') return state === 'done' ? '已更新约练草稿' : '正在更新约练草稿';
  if (id === 'rank') return state === 'done' ? '已更新候选排序' : '正在更新候选排序';
  if (id === 'reason') return state === 'done' ? '已生成推荐理由' : '正在生成推荐理由';
  if (id === 'done') return state === 'done' ? '已完成' : '等待刷新结果';
  return cleanDisplayText(label, stepLabels[id] ?? '正在处理任务');
}

function assistantMessage(result: SocialAgentChatRunResult): string {
  const stable = cleanDisplayText(result.assistantMessage, '');
  if (stable && stable !== '内容已隐藏') return stable;
  if (result.candidates.length === 0) {
    return '我完成了搜索，但暂时没有找到符合安全边界和权限要求的真实候选人。';
  }
  const first = result.candidates[0];
  return `我找到了 ${result.candidates.length} 位真实候选人，优先推荐 ${displayName(first)}，匹配度 ${Math.round(first.score)}%。`;
}

function replanAssistantMessage(result: SocialAgentChatReplanRunResult): string {
  const replan = result.replan;
  const actionCount = replan.plan.length;
  const confirmationCount = replan.plan.filter((step) => step.requiresUserConfirmation).length;
  const timedOut = replan.fallbackReason === 'deepseek_timeout';
  const sourceText = replan.source === 'deepseek' ? 'DeepSeek' : '本地安全策略';
  const candidateText = result.candidates.length
    ? `并刷新出 ${result.candidates.length} 位候选人`
    : '但这次没有找到新的真实候选人';
  if (timedOut) {
    return `我已经保存你的补充，AI 分析超时，所以先用规则匹配继续执行，${candidateText}。发布、收藏和发送仍需要你确认。`;
  }
  if (actionCount === 0) {
    return `我已经把你的补充写入 task #${result.taskId}，${candidateText}。当前权限下没有可执行的新动作，发布、收藏和发送仍不会自动发生。`;
  }
  return `我已经根据你的补充重新规划 task #${result.taskId}，${candidateText}。这次由${sourceText}生成 ${actionCount} 个下一步动作，其中 ${confirmationCount} 个需要你确认；不会自动发送或发布。`;
}

function isReplanRunResult(
  result: SocialAgentChatRunResult | SocialAgentChatReplanRunResult,
): result is SocialAgentChatReplanRunResult {
  return 'replan' in result;
}

function displayName(candidate: SocialAgentChatCandidate): string {
  return cleanDisplayText(candidate.nickname, `用户 #${candidate.userId}`);
}

function candidateLocation(candidate: SocialAgentChatCandidate): string {
  const city = cleanDisplayText(candidate.city, '');
  if (city) return city;
  if (candidate.distanceKm == null) return '同城或附近';
  return `${candidate.distanceKm.toFixed(1)}km`;
}

function errorMessage(error: unknown, fallback = '请稍后再试。'): string {
  const raw = error instanceof Error && error.message.trim() ? error.message : '';
  const message = raw || fallback;
  if (
    /50[234]|Gateway Time-out|Bad Gateway|Service Unavailable|<html|<head|<body|<!DOCTYPE/i.test(
      message,
    ) ||
    /timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNABORTED|AbortError|NetworkError|Failed to fetch/i.test(
      message,
    )
  ) {
    return '请求超时，但你的补充信息已保存。请稍后重试。';
  }
  return message;
}

function nextId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
