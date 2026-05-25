import clsx from 'clsx';
import { memo, useEffect, useRef, useState, type FormEvent } from 'react';
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
  type SocialAgentTaskTimelineSnapshot,
  type SocialAgentTimelineMessage,
  type SocialAgentToolCall,
} from '../api/socialAgentApi';
import { cleanDisplayArray, cleanDisplayText } from '../lib/displayText';
import { messageUrlWithSocialAgentReturn } from '../lib/socialAgentReturnUrl';

type MessageKind = 'text' | 'risk' | 'approval' | 'profile';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  kind?: MessageKind;
  content: string;
  activityResults?: SocialAgentActivityResult[];
  pendingApproval?: SocialAgentPendingApproval;
  profileCard?: ProfileCardData;
};

type ProfileCardData = {
  summary: string[];
  missing: string[];
};

type StatusStep = {
  id: string;
  text: string;
  state: SocialAgentStepStatus;
};

type ToolCallViewStatus = 'running' | 'success' | 'failed' | 'blocked';

type ToolCallView = {
  id: string;
  stepId: string | null;
  toolName: string;
  status: ToolCallViewStatus;
  label: string;
  detail: string;
  count: number | null;
  durationMs: number | null;
  startedAt: string | null;
  completedAt: string | null;
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
const SOCIAL_AGENT_CURRENT_TASK_STORAGE_KEY = 'fitmeet-social-agent-current-task-id';

export const SocialAgentConsolePage = memo(function SocialAgentConsolePage() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [statuses, setStatuses] = useState<StatusStep[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallView[]>([]);
  const [result, setResult] = useState<SocialAgentChatRunResult | null>(null);
  const [shouldShowCandidateCards, setShouldShowCandidateCards] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [draftPublish, setDraftPublish] = useState<DraftPublishState>({ status: 'idle' });
  const [candidateStates, setCandidateStates] = useState<Record<string, CandidateActionSnapshot>>(
    {},
  );
  const [actionStatus, setActionStatus] = useState('');
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const [, setTaskSummary] = useState<SocialAgentTaskTimelineSnapshot['task'] | null>(
    null,
  );
  const [, setTaskMemory] = useState<Record<string, unknown>>({});
  const [, setRestoredAt] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState('');
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const started = isRestoring || messages.length > 0 || Boolean(result) || Boolean(activeTaskId);
  const draft = result?.socialRequestDraft ?? null;
  const candidates = result?.candidates ?? [];
  const visibleCandidates = shouldShowCandidateCards && !isRunning ? candidates : [];
  const publicIntentCards = visibleCandidates.filter(isPublicIntentCandidate);
  const realCandidateCards = visibleCandidates.filter((candidate) => !isPublicIntentCandidate(candidate));

  const applyTimelineSnapshot = (snapshot: SocialAgentTaskTimelineSnapshot | null) => {
    if (!snapshot) {
      setActiveTaskId(null);
      setMessages([]);
      setStatuses([]);
      setToolCalls([]);
      setResult(null);
      setShouldShowCandidateCards(false);
      setCandidateStates({});
      setDraftPublish({ status: 'idle' });
      setTaskSummary(null);
      setTaskMemory({});
      setRestoredAt(null);
      setActionStatus('');
      return;
    }

    const restoredResult = snapshot.result ?? null;
    const restoredEvents = snapshot.events
      .map(normalizeTaskEvent)
      .filter((event): event is SocialAgentTaskEvent => !!event);
    const restoredToolCalls = toolCallsFromEvents(restoredEvents);
    const fallbackToolCalls = restoredResult ? toolCallsFromRunResult(restoredResult) : [];
    const nextToolCalls = restoredToolCalls.length > 0 ? restoredToolCalls : fallbackToolCalls;
    const latestRun = snapshot.latestRun;
    const runMode =
      latestRun?.result && isReplanRunResult(latestRun.result) ? 'follow_up' : 'initial';

    setActiveTaskId(snapshot.taskId);
  setTaskSummary(snapshot.task);
  setTaskMemory(snapshot.memory ?? {});
  setRestoredAt(snapshot.restoredAt ?? null);
    rememberCurrentTaskId(snapshot.taskId);
    replaceSocialAgentTaskUrl(snapshot.taskId);
    setMessages(
      snapshot.messages
        .map(messageFromTimeline)
        .filter((message): message is Message => !!message),
    );
    setResult(restoredResult);
    setShouldShowCandidateCards(shouldShowCandidateCardsForResult(restoredResult));
    setToolCalls(nextToolCalls);
    setCandidateStates(
      candidateStatesFromSession(
        restoredResult?.candidates ?? [],
        snapshot.candidateActions ?? {},
        snapshot.pendingApprovals ?? [],
      ),
    );
    setDraftPublish(draftPublishFromSession(restoredResult));
    setStatuses(
      latestRun
        ? statusesFromRun(latestRun, eventsForRun(restoredEvents, latestRun), runMode)
        : restoredResult?.visibleSteps.length
          ? statusesFromVisibleSteps(restoredResult.visibleSteps)
          : [],
    );
    setActionStatus(
      restoredResult || snapshot.messages.length > 0
        ? `已恢复 task #${snapshot.taskId} 的聊天和工具执行上下文。`
        : '',
    );
  };

  useEffect(() => {
    let ignore = false;
    const restore = async () => {
      setIsRestoring(true);
      setRestoreError('');
      try {
        const requestedTaskId = readTaskIdFromUrl();
        const currentTask = requestedTaskId ? null : await socialAgentApi.getCurrentTask();
        const taskId = requestedTaskId ?? currentTask?.taskId ?? readRememberedTaskId();
        if (!taskId) {
          if (!ignore) applyTimelineSnapshot(null);
          return;
        }
        const snapshot = await socialAgentApi.getTaskTimeline(taskId);
        if (!ignore) applyTimelineSnapshot(snapshot);
      } catch (error) {
        if (!ignore) {
          const message = errorMessage(error, '会话恢复失败，请刷新后重试。');
          clearRememberedTaskId();
          setRestoreError(message);
          setActionStatus(message);
        }
      } finally {
        if (!ignore) setIsRestoring(false);
      }
    };
    void restore();
    return () => {
      ignore = true;
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const goal = cleanDisplayText(input, '').trim();
    if (!goal || isRunning) return;

    setIsRunning(true);
    setIsPublishing(false);
    setActionStatus('');
    setRestoreError('');
    setStatuses([]);
    setToolCalls([]);
    setShouldShowCandidateCards(false);
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
      if (handled.taskId) {
        setActiveTaskId(handled.taskId);
        rememberCurrentTaskId(handled.taskId);
        replaceSocialAgentTaskUrl(handled.taskId);
      }

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
          const profileCard = profileCardFromAssistantMessage(
            handled.intent,
            handled.assistantMessage,
          );
          const extra: Message[] = [
            {
              id: nextId('assistant'),
              role: 'assistant',
              content: handled.assistantMessage,
              activityResults: handled.activityResults ?? undefined,
              profileCard: profileCard ?? undefined,
            },
          ];
          if (profileCard) {
            extra.push({
              id: nextId('profile'),
              role: 'assistant',
              kind: 'profile',
              content: '画像摘要',
              profileCard,
            });
          }
          if (handled.intent === 'safety_or_boundary' && handled.savedContext) {
            extra.push({
              id: nextId('risk'),
              role: 'assistant',
              kind: 'risk',
              content:
                '已记住你的边界，后续匹配会硬过滤。首次线下见面建议选择公开场所，并保留平台内沟通记录。',
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
        setShouldShowCandidateCards(false);
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
      await pollAgentRun(
        queued.taskId,
        queued.runId,
        handled.runMode ?? 'initial',
        handled.intent,
      );
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
        items.map((item) => (item.state === 'running' ? { ...item, state: 'failed' } : item)),
      );
    } finally {
      setIsRunning(false);
    }
  };

  const pollAgentRun = async (
    taskId: number,
    runId: string,
    mode: 'initial' | 'follow_up',
    intent: SocialAgentIntentType,
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
        setShouldShowCandidateCards(shouldShowCandidateCardsForResult(refreshed, intent));
        setActiveTaskId(refreshed.taskId);
        setCandidateStates({});
        setDraftPublish({ status: 'idle' });
        setMessages((items) => [
          ...items,
          {
            id: nextId('assistant'),
            role: 'assistant',
            content:
              mode === 'follow_up' && isReplanRunResult(refreshed)
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
    const runEvents = eventsForRun(events, run);
    setStatuses(statusesFromRun(run, runEvents, mode));
    const calls = toolCallsFromEvents(runEvents);
    if (calls.length > 0) {
      setToolCalls(calls);
    } else if (run.result) {
      const resultCalls = toolCallsFromRunResult(run.result);
      if (resultCalls.length > 0) setToolCalls(resultCalls);
    }
    if (runEvents.some((event) => event.eventType === 'social_agent.llm.timeout')) {
      setActionStatus('AI 分析超时，已使用规则匹配继续执行。');
    }
  };

  const setCandidateAction = (actionKey: string, patch: Partial<CandidateActionSnapshot>) => {
    setCandidateStates((current) => ({
      ...current,
      [actionKey]: {
        ...emptyCandidateActionState(),
        ...(current[actionKey] ?? {}),
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
    setToolCalls((current) =>
      upsertToolCallView(
        current,
        syntheticToolCallView('publish_social_request', 'running', null),
      ),
    );

    try {
      const published = await socialAgentApi.publishSocialRequest(result.taskId, draft);
      setToolCalls((current) =>
        upsertToolCallView(
          current,
          syntheticToolCallView('publish_social_request', 'success', {
            socialRequestId: published.socialRequestId,
            publicIntentId: published.publicIntentId,
          }),
        ),
      );
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
      setActionStatus(
        `约练已发布，已同步到大厅。后续匹配、消息和候选动作都会关联 task #${result.taskId}。`,
      );
    } catch (error) {
      const message = errorMessage(error, '发布失败，请稍后再试。');
      setToolCalls((current) =>
        upsertToolCallView(
          current,
          syntheticToolCallView('publish_social_request', 'failed', { error: message }),
        ),
      );
      setDraftPublish((current) => ({ ...current, status: 'failed', error: message }));
      setActionStatus(message);
    } finally {
      setIsPublishing(false);
    }
  };

  const saveCandidate = async (candidate: SocialAgentChatCandidate) => {
    const actionKey = candidateActionKey(candidate);
    const state = candidateStates[actionKey];
    const targetUserId = candidateTargetUserId(candidate);
    if (!result?.taskId || state?.save === 'saving') return;
    if (!targetUserId) {
      const message = '这个候选缺少目标用户，无法操作。';
      setCandidateAction(actionKey, { save: 'failed', error: message });
      setActionStatus(message);
      return;
    }
    setCandidateAction(actionKey, { save: 'saving', error: null });
    setActionStatus(`正在收藏 ${displayName(candidate)}，并通过 SaveCandidate 写入候选记录...`);

    try {
      const saved = await socialAgentApi.saveCandidate(result.taskId, {
        candidateRecordId: candidate.candidateRecordId,
        publicIntentId: candidate.publicIntentId,
        socialRequestId: candidate.socialRequestId ?? draft?.socialRequestId ?? null,
        targetUserId,
        candidate: {
          targetUserId,
          userId: candidate.userId,
          candidateUserId: targetUserId,
          publicIntentId: candidate.publicIntentId,
          nickname: candidate.nickname,
          score: candidate.score,
          reasons: candidate.reasons,
        },
      });
      if (saved.status !== 'succeeded') {
        throw new Error(toolActionErrorMessage(saved, '收藏失败，请稍后再试。'));
      }
      setToolCalls((current) => upsertToolCallView(current, toolCallViewFromRecord(saved)));
      setCandidateAction(actionKey, { save: 'saved', error: null });
      setActionStatus(
        `${displayName(candidate)} 已收藏，候选状态已持久化并关联 task #${result.taskId}。`,
      );
    } catch (error) {
      const message = errorMessage(error, '收藏失败，请稍后再试。');
      setCandidateAction(actionKey, { save: 'failed', error: message });
      setActionStatus(message);
    }
  };

  const sendMessage = async (candidate: SocialAgentChatCandidate) => {
    const message = cleanDisplayText(candidate.suggestedMessage, '').trim();
    const actionKey = candidateActionKey(candidate);
    const state = candidateStates[actionKey];
    const targetUserId = candidateTargetUserId(candidate);
    if (!result?.taskId || !message || state?.send === 'sending') return;
    if (!targetUserId) {
      const messageText = '这个候选缺少目标用户，无法操作。';
      setCandidateAction(actionKey, { send: 'failed', error: messageText });
      setActionStatus(messageText);
      return;
    }
    setCandidateAction(actionKey, { send: 'sending', error: null });
    setActionStatus(`正在发送给 ${displayName(candidate)}，并记录确认事件...`);

    try {
      const sent = await socialAgentApi.sendCandidateMessage(result.taskId, {
        candidateUserId: targetUserId,
        targetUserId,
        message,
        suggestedOpener: message,
        candidateRecordId: candidate.candidateRecordId,
        publicIntentId: candidate.publicIntentId,
        socialRequestId: candidate.socialRequestId ?? draft?.socialRequestId ?? null,
        candidate: {
          targetUserId,
          userId: candidate.userId,
          candidateUserId: targetUserId,
          publicIntentId: candidate.publicIntentId,
          nickname: candidate.nickname,
          score: candidate.score,
          reasons: candidate.reasons,
          candidateRecordId: candidate.candidateRecordId,
          socialRequestId: candidate.socialRequestId,
        },
      });
      const pending = isPendingActionStatus(sent.status);
      const messageAction = sent.messageAction;
      if (isFailedCandidateAction(sent.success, sent.status, messageAction, pending)) {
        throw new Error(toolActionErrorMessage(sent.toolCall, '发送失败，请稍后再试。'));
      }
      const messageToolCall = sent.toolCall;
      if (messageToolCall) {
        setToolCalls((current) =>
          upsertToolCallView(current, toolCallViewFromRecord(messageToolCall)),
        );
      }
      setCandidateAction(actionKey, {
        send: pending ? 'pendingApproval' : 'sent',
        error: null,
        conversationId: sent.conversationId,
        messageId: sent.messageId,
      });
      setResult((current) =>
        current
          ? {
              ...current,
              candidates: current.candidates.map((item) =>
                candidateActionKey(item) === actionKey
                  ? { ...item, status: sent.candidateStatus ?? 'messaged' }
                  : item,
              ),
            }
          : current,
      );
      setActionStatus(
        pending
          ? '待确认'
          : sent.conversationId
            ? `已发送给 ${displayName(candidate)}，可前往消息查看。`
            : `已发送给 ${displayName(candidate)}，消息已关联 task #${result.taskId}。`,
      );
      if (!pending && sent.conversationId) {
        navigate(messageUrlWithSocialAgentReturn(sent.conversationId, result.taskId ?? activeTaskId));
      }
    } catch (error) {
      const messageText = isServerError(error)
        ? '发送失败，请稍后重试。'
        : errorMessage(error, '发送失败，请稍后重试。');
      setCandidateAction(actionKey, { send: 'failed', error: messageText });
      setActionStatus(messageText);
    }
  };

  const connectCandidate = async (candidate: SocialAgentChatCandidate) => {
    const actionKey = candidateActionKey(candidate);
    const state = candidateStates[actionKey];
    const targetUserId = candidateTargetUserId(candidate);
    if (!result?.taskId || state?.connect === 'connecting') return;
    if (!targetUserId) {
      const message = '这个候选缺少目标用户，无法操作。';
      setCandidateAction(actionKey, { connect: 'failed', error: message });
      setActionStatus(message);
      return;
    }
    setCandidateAction(actionKey, { connect: 'connecting', error: null });
    setActionStatus(`正在添加 ${displayName(candidate)} 为好友，并创建站内会话...`);

    try {
      const connection = await socialAgentApi.connectCandidate(result.taskId, {
        candidateUserId: targetUserId,
        candidateRecordId: candidate.candidateRecordId,
        publicIntentId: candidate.publicIntentId,
        socialRequestId: candidate.socialRequestId ?? draft?.socialRequestId ?? null,
        targetUserId,
        candidate: {
          targetUserId,
          userId: candidate.userId,
          candidateUserId: targetUserId,
          publicIntentId: candidate.publicIntentId,
          nickname: candidate.nickname,
          score: candidate.score,
          reasons: candidate.reasons,
        },
      });
      const pending = isPendingActionStatus(connection.status);
      const friendAction = connection.friendAction;
      if (
        isFailedCandidateAction(connection.success, connection.status, friendAction, pending)
      ) {
        throw new Error(toolActionErrorMessage(connection.toolCall, '加好友失败，请稍后再试。'));
      }
      const friendToolCall = connection.toolCall;
      if (friendToolCall) {
        setToolCalls((current) =>
          upsertToolCallView(current, toolCallViewFromRecord(friendToolCall)),
        );
      }
      if (connection.conversationId) {
        const returnTaskId = result.taskId ?? activeTaskId;
        setCandidateAction(actionKey, {
          connect: 'connected',
          error: null,
          conversationId: connection.conversationId,
          friendRequestId: connection.friendRequestId,
        });
        setActionStatus(`${displayName(candidate)} 已加为好友，正在进入聊天。`);
        navigate(messageUrlWithSocialAgentReturn(connection.conversationId, returnTaskId));
        return;
      }
      setCandidateAction(actionKey, {
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
      setCandidateAction(actionKey, { connect: 'failed', error: message });
      setActionStatus(message);
    }
  };

  const startNewTask = () => {
    setInput('');
    setMessages([]);
    setStatuses([]);
    setToolCalls([]);
    setResult(null);
    setShouldShowCandidateCards(false);
    setDraftPublish({ status: 'idle' });
    setCandidateStates({});
    setActionStatus('');
    setRestoreError('');
    setActiveTaskId(null);
    setTaskSummary(null);
    setTaskMemory({});
    setRestoredAt(null);
    clearRememberedTaskId();
    replaceSocialAgentTaskUrl(null);
  };

  const queuePrompt = (text: string) => {
    setInput(text);
    window.setTimeout(() => inputRef.current?.focus(), 0);
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

  useEffect(() => {
    if (!started) return;
    chatEndRef.current?.scrollIntoView({
      block: 'end',
      behavior: isRunning ? 'smooth' : 'auto',
    });
  }, [
    actionStatus,
    candidates.length,
    draft?.title,
    isRunning,
    messages.length,
    started,
    statuses.length,
    toolCalls.length,
  ]);

  return (
    <div className="min-h-screen bg-[#f8f8f6] text-[#202124]">
      <TopStatusBar
        agentState={agentState}
        currentGoal={currentGoal}
        pendingApprovals={pendingApprovalsCount}
        activeTaskId={activeTaskId}
        onNewTask={startNewTask}
      />
      <div
        className={clsx(
          'mx-auto flex min-h-screen w-full flex-col px-4 pb-56 pt-24 sm:px-6',
          started ? 'max-w-4xl' : 'max-w-4xl',
        )}
      >
        <section className="mx-auto mt-4 flex w-full max-w-4xl flex-1 flex-col">
          {!started ? (
            <AgentWelcome onPrompt={queuePrompt} />
          ) : (
            <div className="space-y-5">
              {isRestoring ? <RestoringState /> : null}

              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}

              {restoreError && !isRestoring ? (
                <div className="rounded-2xl border border-[#f3e3b3] bg-[#fffaeb] px-4 py-3 text-sm font-bold text-[#7a5a12]">
                  {restoreError}
                </div>
              ) : null}

              {statuses.length > 0 || toolCalls.length > 0 ? (
                <StatusStream
                  statuses={statuses}
                  toolCalls={toolCalls}
                  result={result}
                  isRunning={isRunning}
                />
              ) : null}

              {draft ? (
                <DraftCard
                  draft={draft}
                  publishState={draftPublish}
                  isPublishing={isPublishing}
                  onPublish={publishDraft}
                />
              ) : null}

              {shouldShowCandidateCards && result && visibleCandidates.length === 0 ? (
                <EmptyResult onQuickAction={(text) => setInput(text)} />
              ) : visibleCandidates.length > 0 ? (
                <div className="space-y-3">
                  {realCandidateCards.length > 0 ? (
                    <CandidateResultGroup
                      title="候选人"
                      count={realCandidateCards.length}
                      candidates={realCandidateCards}
                      candidateStates={candidateStates}
                      onSave={saveCandidate}
                      onSendMessage={sendMessage}
                      onConnect={connectCandidate}
                    />
                  ) : null}
                  {publicIntentCards.length > 0 ? (
                    <CandidateResultGroup
                      title="公开约练卡片"
                      count={publicIntentCards.length}
                      candidates={publicIntentCards}
                      candidateStates={candidateStates}
                      onSave={saveCandidate}
                      onSendMessage={sendMessage}
                      onConnect={connectCandidate}
                    />
                  ) : null}
                </div>
              ) : null}

              {actionStatus ? (
                <div className="rounded-xl bg-[#f1f1ee] px-3 py-2 text-sm font-bold text-[#686963]">
                  {actionStatus}
                </div>
              ) : null}
              <div ref={chatEndRef} className="h-36 scroll-mb-44" aria-hidden="true" />
            </div>
          )}
        </section>
      </div>

      <form
        onSubmit={submit}
        className="fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-[#f8f8f6] via-[#f8f8f6] to-transparent px-4 pb-5 pt-8"
      >
        <PromptRail started={started} onPrompt={queuePrompt} />
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-[28px] border border-[#deded8] bg-white p-2 shadow-[0_12px_36px_rgba(32,33,36,0.12)]">
          {!started ? <ConfirmModeBadge className="mb-1 hidden sm:flex" /> : null}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={isRestoring}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            className="max-h-32 min-h-[46px] flex-1 resize-none border-0 bg-transparent px-3 py-3 text-[15px] leading-6 text-[#202124] outline-none placeholder:text-[#8c8d88]"
            placeholder={
              result?.taskId || activeTaskId
                ? '继续聊天、补充偏好，或调整搜索条件...'
                : '先聊天，或说出你想找的人/活动...'
            }
          />
          <button
            type="submit"
            disabled={isRestoring || isRunning || !cleanDisplayText(input, '').trim()}
            className="mb-1 flex h-10 shrink-0 items-center justify-center rounded-full bg-[#202124] px-4 text-sm font-black text-white transition hover:bg-[#343633] disabled:cursor-not-allowed disabled:bg-[#d2d2cc]"
            aria-label="发送"
          >
            {isRestoring ? '恢复中' : isRunning ? '处理中' : '发送'}
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
  activeTaskId,
  onNewTask,
}: {
  agentState: AgentState;
  currentGoal: string;
  pendingApprovals: number;
  activeTaskId: number | null;
  onNewTask: () => void;
}) {
  const isLive = agentState === 'analyzing' || agentState === 'searching';
  return (
    <div className="fixed left-0 right-0 top-0 z-30 border-b border-[#e6e6df] bg-[#f8f8f6]/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
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
          <div
            className="hidden min-w-0 flex-1 truncate text-[12px] text-[#777872] sm:block"
            title={currentGoal}
          >
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
        {activeTaskId ? (
          <button
            type="button"
            onClick={onNewTask}
            className="h-8 shrink-0 rounded-full border border-[#deded8] bg-white px-3 text-[12px] font-black text-[#3f403b] transition hover:border-[#202124]"
          >
            开启新任务
          </button>
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

const starterPrompts = [
  '帮我找青岛拍照搭子，优先真实用户和公开约练卡片',
  '读取我的人物画像，告诉我怎么提高匹配质量',
  '帮我生成一张周末约练卡，并匹配合适的人',
  '查看当前待确认动作，再建议下一步',
] as const;

const activePrompts = [
  '继续扩大搜索范围',
  '只保留真实用户画像',
  '换成公开地点和白天时间',
  '总结当前候选并推荐下一步',
] as const;

function AgentWelcome({ onPrompt }: { onPrompt: (text: string) => void }) {
  return (
    <div className="flex flex-1 flex-col justify-center pb-24">
      <div className="mx-auto w-full max-w-3xl">
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#dfe5ef] bg-[#f4f8ff] text-2xl font-black text-[#315fa8]">
            AI
          </div>
          <h1 className="text-3xl font-normal text-[#2f302d] sm:text-5xl">
            你想认识什么样的人？
          </h1>
        </div>
        <div className="mt-7 grid gap-2 sm:grid-cols-2">
          {starterPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onPrompt(prompt)}
              className="min-h-12 rounded-2xl border border-[#e2e5df] bg-white px-4 py-3 text-left text-sm font-bold leading-5 text-[#3f403b] shadow-[0_8px_22px_rgba(32,33,36,0.04)] transition hover:border-[#98b7e8] hover:bg-[#f7fbff]"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PromptRail({
  started,
  onPrompt,
}: {
  started: boolean;
  onPrompt: (text: string) => void;
}) {
  if (!started) return null;
  return (
    <div className="mx-auto mb-2 flex max-w-3xl gap-2 overflow-x-auto pb-1">
      {activePrompts.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onPrompt(prompt)}
          className="h-8 shrink-0 rounded-full border border-[#e2e5df] bg-white/90 px-3 text-xs font-bold text-[#555650] shadow-[0_6px_16px_rgba(32,33,36,0.05)] transition hover:border-[#98b7e8] hover:text-[#315fa8]"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}

export function AgentOverviewStrip({
  activeTaskId,
  taskStatus,
  toolCalls,
  candidateCount,
  publicIntentCount,
  pendingApprovals,
  restoredAt,
}: {
  activeTaskId: number | null;
  taskStatus: string | null;
  toolCalls: ToolCallView[];
  candidateCount: number;
  publicIntentCount: number;
  pendingApprovals: number;
  restoredAt: string | null;
}) {
  const successfulTools = toolCalls.filter((call) => call.status === 'success').length;
  const runningTools = toolCalls.filter((call) => call.status === 'running').length;
  const items = [
    { label: 'Task', value: activeTaskId ? `#${activeTaskId}` : '新任务' },
    { label: '状态', value: taskStatus ? taskStatusText(taskStatus) : '待输入' },
    { label: '工具', value: runningTools > 0 ? `${runningTools} running` : `${successfulTools}/${toolCalls.length}` },
    { label: '候选', value: `${candidateCount} 人 / ${publicIntentCount} 卡片` },
    { label: '确认', value: pendingApprovals > 0 ? `${pendingApprovals} 个` : '无' },
  ];
  return (
    <div className="rounded-2xl border border-[#e2e8f0] bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_52%,#f7fbf6_100%)] p-3 shadow-[0_10px_26px_rgba(32,33,36,0.05)]">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {items.map((item) => (
          <div key={item.label} className="min-w-0 rounded-xl bg-white/70 px-3 py-2">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8c8d88]">
              {item.label}
            </div>
            <div className="mt-1 truncate text-sm font-black text-[#202124]">{item.value}</div>
          </div>
        ))}
      </div>
      {restoredAt ? (
        <div className="mt-2 px-1 text-[11px] font-bold text-[#777872]">
          已从后端 timeline 恢复：{new Date(restoredAt).toLocaleString()}
        </div>
      ) : null}
    </div>
  );
}

export function TaskRunPanel({
  activeTaskId,
  taskSummary,
  statuses,
  result,
  pendingApprovals,
  candidateCount,
  publicIntentCount,
  draftStatus,
}: {
  activeTaskId: number | null;
  taskSummary: SocialAgentTaskTimelineSnapshot['task'] | null;
  statuses: StatusStep[];
  result: SocialAgentChatRunResult | null;
  pendingApprovals: number;
  candidateCount: number;
  publicIntentCount: number;
  draftStatus: DraftPublishState['status'];
}) {
  const activeStep = [...statuses].reverse().find((step) => step.state === 'running') ?? null;
  const doneSteps = statuses.filter((step) => step.state === 'done').length;
  return (
    <section className="rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-[0_10px_26px_rgba(32,33,36,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8c8d88]">
            Agent Run
          </div>
          <h2 className="mt-1 truncate text-sm font-black text-[#202124]">
            {activeTaskId ? `Task #${activeTaskId}` : '新任务'}
          </h2>
        </div>
        <span className="rounded-full bg-[#eef6ff] px-2.5 py-1 text-[11px] font-black text-[#315fa8]">
          {taskStatusText(taskSummary?.status ?? result?.status ?? 'pending')}
        </span>
      </div>
      <div className="mt-3 space-y-2 text-xs font-bold text-[#555650]">
        <div className="flex justify-between gap-3">
          <span>当前步骤</span>
          <span className="truncate text-right text-[#202124]">
            {activeStep?.text ?? (result ? '结果已整理完成' : '等待输入')}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span>完成步骤</span>
          <span className="text-[#202124]">{doneSteps}/{Math.max(statuses.length, doneSteps)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>候选资产</span>
          <span className="text-[#202124]">{candidateCount} 人 · {publicIntentCount} 卡</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>动作队列</span>
          <span className="text-[#202124]">
            {pendingApprovals > 0 ? `${pendingApprovals} 待确认` : draftStatusText(draftStatus)}
          </span>
        </div>
      </div>
    </section>
  );
}

const capabilityGroups = [
  {
    id: 'profile',
    title: '画像',
    prompt: '读取我的人物画像，并指出影响匹配质量的三项信息',
    tools: ['get_my_profile', 'get_ai_profile', 'read_long_term_memory'],
  },
  {
    id: 'search',
    title: '搜索',
    prompt: '搜索真实用户画像和公开约练卡片，给我一组高质量候选',
    tools: ['search_matches', 'search_real_candidates', 'search_public_intents', 'search_activities'],
  },
  {
    id: 'card',
    title: '卡片',
    prompt: '生成一张可以发布的约练卡片，并说明为什么这样写',
    tools: ['create_social_request', 'publish_social_request'],
  },
  {
    id: 'message',
    title: '消息',
    prompt: '为候选人生成低压力开场白，先不要自动发送',
    tools: ['draft_opener', 'send_message', 'send_message_to_candidate', 'connect_candidate', 'add_friend'],
  },
  {
    id: 'approval',
    title: '确认',
    prompt: '查看当前待确认动作，并按风险从低到高排序',
    tools: ['get_pending_approvals', 'approve_action', 'reject_action'],
  },
] as const;

export function CapabilityDock({
  toolCalls,
  onPrompt,
}: {
  toolCalls: ToolCallView[];
  onPrompt: (text: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-[#e7e7e0] bg-white p-4 shadow-[0_10px_26px_rgba(32,33,36,0.05)]">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8c8d88]">
        FitMeet Tools
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {capabilityGroups.map((group) => {
          const state = capabilityState(group.tools, toolCalls);
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => onPrompt(group.prompt)}
              className="min-h-16 rounded-2xl border border-[#edf0e9] bg-[#fbfbf8] px-3 py-2 text-left transition hover:border-[#98b7e8] hover:bg-[#f7fbff]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-black text-[#202124]">{group.title}</span>
                <span
                  className={clsx(
                    'h-2 w-2 rounded-full',
                    state === 'running' && 'animate-pulse bg-[#3a72d6]',
                    state === 'done' && 'bg-[#168a55]',
                    state === 'failed' && 'bg-[#c24135]',
                    state === 'idle' && 'bg-[#cfd3cb]',
                  )}
                />
              </div>
              <div className="mt-1 text-[11px] font-bold text-[#777872]">
                {capabilityLabel(state)}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function MemoryPanel({
  taskMemory,
  currentGoal,
}: {
  taskMemory: Record<string, unknown>;
  currentGoal: string;
}) {
  const highlights = memoryHighlights(taskMemory, currentGoal);
  return (
    <section className="rounded-2xl border border-[#e7e7e0] bg-white p-4 shadow-[0_10px_26px_rgba(32,33,36,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8c8d88]">
          Task Memory
        </div>
        <span className="rounded-full bg-[#f3f3ef] px-2 py-0.5 text-[10px] font-black text-[#686963]">
          后端
        </span>
      </div>
      {highlights.length > 0 ? (
        <div className="mt-3 space-y-2">
          {highlights.map((item) => (
            <div key={item.label} className="rounded-xl bg-[#fbfbf8] px-3 py-2">
              <div className="text-[10px] font-black text-[#8c8d88]">{item.label}</div>
              <div className="mt-1 line-clamp-2 text-xs font-bold leading-5 text-[#3f403b]">
                {item.value}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-[#ecece6] bg-[#fbfbf8] px-3 py-4 text-xs text-[#8c8d88]">
          暂无 task memory。
        </div>
      )}
    </section>
  );
}

function RestoringState() {
  return (
    <div className="flex justify-start">
      <div className="inline-flex max-w-[82%] items-center gap-3 rounded-[22px] border border-[#ecece8] bg-[#f5f5f3] px-4 py-3 text-[#666762] shadow-[0_10px_28px_rgba(32,33,36,0.06)]">
        <ThinkingMark state="running" />
        <span className="text-[15px] font-black leading-6">正在恢复上次会话</span>
      </div>
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
          <div className="text-[12px] font-black uppercase tracking-wide text-[#8a5a00]">
            风险提示
          </div>
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
            <div className="text-[12px] font-black uppercase tracking-wide text-[#777872]">
              待确认动作
            </div>
            <span
              className={clsx('rounded-full border px-2 py-[2px] text-[11px] font-bold', riskColor)}
            >
              {approval.riskLevel === 'high'
                ? '高风险'
                : approval.riskLevel === 'medium'
                  ? '中等风险'
                  : '低风险'}
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

  if (message.kind === 'profile' && message.profileCard) {
    return (
      <div className="flex justify-start">
        <ProfileSummaryCard data={message.profileCard} />
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
  const desc =
    activity.description?.length > 80
      ? `${activity.description.slice(0, 80)}…`
      : activity.description;
  return (
    <div className="rounded-xl border border-[#e4e4de] bg-white px-3 py-2 text-[13px] leading-5 text-[#2f302d]">
      <div className="flex items-center gap-2 text-[14px] font-semibold">
        <span className="truncate">{activity.title || '公开约练'}</span>
        {activity.city ? (
          <span className="text-[12px] font-normal text-[#686963]">· {activity.city}</span>
        ) : null}
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
            <span
              key={tag}
              className="rounded-full bg-[#f0efe9] px-2 py-[2px] text-[11px] text-[#555]"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProfileSummaryCard({ data }: { data: ProfileCardData }) {
  return (
    <article className="max-w-[82%] rounded-2xl border border-[#dfe8d8] bg-[#fbfff8] p-4 shadow-[0_8px_24px_rgba(32,33,36,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-black text-[#202124]">画像摘要</h3>
        <span className="rounded-full bg-[#e7f7ed] px-2.5 py-1 text-[11px] font-black text-[#168a55]">
          已整理
        </span>
      </div>
      {data.summary.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {data.summary.slice(0, 8).map((item) => (
            <span
              key={item}
              className="rounded-full border border-[#dbe8d5] bg-white px-2.5 py-1 text-xs font-bold text-[#3f403b]"
            >
              {item}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-3 rounded-xl bg-white/80 p-3 text-xs leading-5 text-[#555650]">
        <div className="font-black text-[#202124]">还可以补充</div>
        <div className="mt-1">
          {(data.missing.length > 0
            ? data.missing
            : ['可约时间', '具体活动类型', '边界要求']
          ).join('、')}
        </div>
      </div>
    </article>
  );
}

function StatusStream({
  statuses,
  toolCalls,
  result,
  isRunning,
}: {
  statuses: StatusStep[];
  toolCalls: ToolCallView[];
  result: SocialAgentChatRunResult | null;
  isRunning: boolean;
}) {
  const steps = progressStepsFromToolCalls(toolCalls, result, isRunning);
  const displaySteps = steps.length > 0 ? steps : statuses;
  const activeStep =
    [...displaySteps].reverse().find((step) => step.state === 'running') ??
    [...displaySteps].reverse().find((step) => step.state === 'failed') ??
    (isRunning ? displaySteps.find((step) => step.state === 'pending') : null) ??
    displaySteps[displaySteps.length - 1] ??
    null;
  const thinkingText = thinkingStepText(activeStep, result, isRunning);

  return (
    <div className="ml-0 flex max-w-[82%] justify-start">
      <div
        className={clsx(
          'inline-flex min-h-[52px] max-w-full items-center gap-3 rounded-[22px] border px-4 py-3 shadow-[0_10px_28px_rgba(32,33,36,0.06)] backdrop-blur-sm transition-all duration-300',
          activeStep?.state === 'failed'
            ? 'border-[#f1d4d0] bg-[#fff5f3] text-[#b42318]'
            : 'border-[#ecece8] bg-[#f5f5f3] text-[#666762]',
        )}
        aria-live="polite"
      >
        <ThinkingMark state={activeStep?.state ?? (isRunning ? 'running' : 'done')} />
        <span className="min-w-0 truncate text-[15px] font-black leading-6">{thinkingText}</span>
        <span className="shrink-0 text-[22px] font-light leading-none text-[#b3b4ad]">›</span>
      </div>
    </div>
  );
}

function thinkingStepText(
  activeStep: StatusStep | null,
  result: SocialAgentChatRunResult | null,
  isRunning: boolean,
): string {
  if (activeStep?.state === 'failed') return activeStep.text;
  if (activeStep?.text) return activeStep.text;
  if (result) return '结果已整理完成';
  return isRunning ? '正在思考搜索方向' : '思考完成';
}

function ThinkingMark({ state }: { state: SocialAgentStepStatus }) {
  if (state === 'failed') {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#ffe3df] text-[13px] font-black text-[#c24135]">
        !
      </span>
    );
  }

  return (
    <span
      className={clsx(
        'relative flex h-6 w-6 shrink-0 items-center justify-center text-[#5f6260]',
        state === 'running' && 'animate-pulse',
      )}
      aria-hidden="true"
    >
      <span className="absolute h-5 w-3 rounded-[50%] border-2 border-current" />
      <span className="absolute h-5 w-3 rotate-[60deg] rounded-[50%] border-2 border-current" />
      <span className="absolute h-5 w-3 -rotate-[60deg] rounded-[50%] border-2 border-current" />
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
    </span>
  );
}

export function ToolCallPanel({ toolCalls }: { toolCalls: ToolCallView[] }) {
  const recent = latestToolCallsByName(toolCalls).slice(-12);
  return (
    <section className="overflow-hidden rounded-[24px] border border-[#e7e7e0] bg-[linear-gradient(180deg,#ffffff_0%,#fafaf7_100%)] p-4 shadow-[0_12px_32px_rgba(32,33,36,0.07)]">
      <div className="flex items-start justify-between gap-3 border-b border-[#f0f0eb] pb-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8c8d88]">
            Light Log
          </div>
          <h2 className="mt-1 text-[14px] font-black text-[#202124]">Tool Calls</h2>
        </div>
        <span className="rounded-full bg-[#f3f3ef] px-2.5 py-1 text-[11px] font-black text-[#686963]">
          {recent.length}
        </span>
      </div>
      {recent.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2 font-mono text-[11px] leading-5">
          {recent.map((call) => (
            <div
              key={call.id}
              className="rounded-2xl border border-[#f0f0ea] bg-white/90 px-3 py-2.5 transition hover:border-[#e4e4dc]"
            >
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-2">
                  <span
                    className={clsx(
                      'h-2 w-2 shrink-0 rounded-full',
                      call.status === 'success' && 'bg-[#168a55]',
                      call.status === 'failed' && 'bg-[#c24135]',
                      call.status === 'running' && 'animate-pulse bg-[#3a72d6]',
                      call.status === 'blocked' && 'bg-[#d49a17]',
                    )}
                  />
                  <span className="truncate font-bold text-[#202124]">{call.toolName}</span>
                </div>
                <span
                  className={clsx(
                    'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em]',
                    call.status === 'success' && 'bg-[#e7f7ed] text-[#168a55]',
                    call.status === 'failed' && 'bg-[#fff0ed] text-[#b42318]',
                    call.status === 'running' && 'bg-[#edf3ff] text-[#3a72d6]',
                    call.status === 'blocked' && 'bg-[#fff6df] text-[#8a5a00]',
                  )}
                >
                  {call.status}
                </span>
              </div>
              {call.detail && call.detail !== 'completed' && call.detail !== 'running' ? (
                <div className="mt-1 pl-4 text-[10px] text-[#8c8d88]">{call.detail}</div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border border-dashed border-[#ecece6] bg-[#fbfbf8] px-3 py-4 text-xs text-[#8c8d88]">
          等待 Agent 调用工具...
        </div>
      )}
    </section>
  );
}

function latestToolCallsByName(toolCalls: ToolCallView[]): ToolCallView[] {
  const recent: ToolCallView[] = [];
  const seen = new Set<string>();

  for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
    const call = toolCalls[index];
    if (seen.has(call.toolName)) continue;
    seen.add(call.toolName);
    recent.push(call);
  }

  return recent.reverse();
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
        {cleanDisplayText(
          draft.description,
          cleanDisplayText(draft.rawText, 'AI 已生成约练草稿。'),
        )}
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
  const targetUserId = candidateTargetUserId(candidate);
  const canSave = Boolean(
    candidate.candidateRecordId || (candidate.socialRequestId && targetUserId),
  );
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
  const hasStatusNotice =
    isSent || isConnected || isSendPending || isConnectPending || Boolean(state.error);

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
          <p className="mt-1 text-xs font-bold text-[#777872]">{candidateLocation(candidate)}</p>
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
            state.error ? 'bg-[#fff0ed] text-[#b42318]' : 'bg-[#edf7ef] text-[#168a55]',
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
              ? '待确认'
              : isSending
                ? '发送中'
                : isSendFailed
                  ? '发送失败，重试'
                  : '确认发送'}
        </button>
        <button
          type="button"
          onClick={() => onConnect(candidate)}
          disabled={isConnecting || isConnected || isConnectPending}
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

function CandidateResultGroup({
  title,
  count,
  candidates,
  candidateStates,
  onSave,
  onSendMessage,
  onConnect,
}: {
  title: string;
  count: number;
  candidates: SocialAgentChatCandidate[];
  candidateStates: Record<string, CandidateActionSnapshot>;
  onSave: (candidate: SocialAgentChatCandidate) => void;
  onSendMessage: (candidate: SocialAgentChatCandidate) => void;
  onConnect: (candidate: SocialAgentChatCandidate) => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-[13px] font-black text-[#202124]">{title}</h2>
        <span className="rounded-full bg-[#f1f1ee] px-2 py-0.5 text-[11px] font-bold text-[#686963]">
          {count}
        </span>
      </div>
      <div className="space-y-3">
        {candidates.map((candidate) => (
          <CandidateCard
            key={`${candidate.source ?? 'candidate'}:${candidateTargetUserId(candidate) ?? 'missing'}:${candidate.publicIntentId ?? candidate.candidateRecordId ?? candidate.socialRequestId ?? 'transient'}`}
            candidate={candidate}
            state={candidateStates[candidateActionKey(candidate)] ?? emptyCandidateActionState()}
            onSave={onSave}
            onSendMessage={onSendMessage}
            onConnect={onConnect}
          />
        ))}
      </div>
    </section>
  );
}

function isPublicIntentCandidate(candidate: SocialAgentChatCandidate): boolean {
  return candidate.source === 'public_intent' || candidate.source === 'activity';
}

function EmptyResult({ onQuickAction }: { onQuickAction: (text: string) => void }) {
  const actions = [
    ['发布约练需求', '帮我发布一个约练需求'],
    ['放宽条件', '放宽城市、时间和兴趣条件再找真实用户'],
    ['完善我的画像', '我想完善我的 AI 人物画像'],
    ['换个城市/时间', '换个城市或时间再找真实用户'],
  ] as const;
  return (
    <div className="rounded-2xl border border-dashed border-[#d9d9d2] bg-white/70 p-5 text-sm leading-6 text-[#686963]">
      <div className="font-bold text-[#2f302d]">当前没有找到符合条件的真实用户。</div>
      <div className="mt-1">可以发布约练需求，或放宽城市、时间、兴趣条件后重新搜索。</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map(([label, text]) => (
          <button
            key={label}
            type="button"
            onClick={() => onQuickAction(text)}
            className="rounded-full border border-[#deded8] bg-white px-3 py-1.5 text-xs font-bold text-[#555650] hover:border-[#168a55] hover:text-[#168a55]"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function emptyCandidateActionState(): CandidateActionSnapshot {
  return { save: 'idle', send: 'idle', connect: 'idle', error: null };
}

function taskStatusText(status: string): string {
  const labels: Record<string, string> = {
    pending: '待处理',
    planning: '规划中',
    awaiting_confirmation: '待确认',
    executing: '执行中',
    waiting_result: '等结果',
    waiting_reply: '等回复',
    awaiting_feedback: '可继续聊',
    succeeded: '已完成',
    failed: '失败',
    cancelled: '已取消',
  };
  return labels[status] ?? status;
}

function draftStatusText(status: DraftPublishState['status']): string {
  const labels: Record<DraftPublishState['status'], string> = {
    idle: '草稿待确认',
    publishing: '发布中',
    published: '已发布',
    failed: '发布失败',
  };
  return labels[status];
}

type CapabilityState = 'idle' | 'running' | 'done' | 'failed';

function capabilityState(
  toolNames: readonly string[],
  toolCalls: ToolCallView[],
): CapabilityState {
  const related = toolCalls.filter((call) => toolNames.includes(call.toolName));
  if (related.some((call) => call.status === 'running')) return 'running';
  if (related.some((call) => call.status === 'failed' || call.status === 'blocked')) return 'failed';
  if (related.some((call) => call.status === 'success')) return 'done';
  return 'idle';
}

function capabilityLabel(state: CapabilityState): string {
  const labels: Record<CapabilityState, string> = {
    idle: 'ready',
    running: 'running',
    done: 'used',
    failed: 'attention',
  };
  return labels[state];
}

function memoryHighlights(
  taskMemory: Record<string, unknown>,
  currentGoal: string,
): Array<{ label: string; value: string }> {
  const shortTerm = isRecord(taskMemory.shortTerm) ? taskMemory.shortTerm : {};
  const chat = isRecord(taskMemory.socialAgentChat) ? taskMemory.socialAgentChat : {};
  const values = [
    {
      label: '当前目标',
      value: stringValue(shortTerm.currentGoal) ?? cleanDisplayText(currentGoal, ''),
    },
    {
      label: '补充要求',
      value: stringValue(shortTerm.latestUserFollowUp),
    },
    {
      label: '候选缓存',
      value: memoryCountText(shortTerm.candidates ?? chat.candidates, '个候选'),
    },
    {
      label: '待确认',
      value: memoryCountText(shortTerm.pendingActions, '个动作'),
    },
    {
      label: '安全边界',
      value: memorySummary(shortTerm.boundaries ?? taskMemory.boundaries),
    },
  ];
  return values
    .map((item) => ({ label: item.label, value: cleanDisplayText(item.value, '') }))
    .filter((item) => item.value)
    .slice(0, 5);
}

function memoryCountText(value: unknown, unit: string): string {
  const count = arrayLength(value);
  return count && count > 0 ? `${count} ${unit}` : '';
}

function memorySummary(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => cleanDisplayText(item, '')).filter(Boolean).slice(0, 4).join('，');
  }
  if (isRecord(value)) {
    return Object.values(value)
      .map((item) => cleanDisplayText(item, ''))
      .filter(Boolean)
      .slice(0, 4)
      .join('，');
  }
  return cleanDisplayText(value, '');
}

function readTaskIdFromUrl(): number | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return numberValue(params.get('taskId'));
}

function readRememberedTaskId(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(SOCIAL_AGENT_CURRENT_TASK_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return numberValue(parsed.currentTaskId);
  } catch {
    return numberValue(raw);
  }
}

function rememberCurrentTaskId(taskId: number): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    SOCIAL_AGENT_CURRENT_TASK_STORAGE_KEY,
    JSON.stringify({ currentTaskId: taskId, lastOpenedAt: new Date().toISOString() }),
  );
}

function clearRememberedTaskId(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SOCIAL_AGENT_CURRENT_TASK_STORAGE_KEY);
}

function replaceSocialAgentTaskUrl(taskId: number | null): void {
  if (typeof window === 'undefined') return;
  const nextUrl = taskId ? `/social-agent?taskId=${encodeURIComponent(taskId)}` : '/social-agent';
  window.history.replaceState(window.history.state, '', nextUrl);
}

function messageFromTimeline(message: SocialAgentTimelineMessage): Message | null {
  if (message.role !== 'user' && message.role !== 'assistant') return null;
  if (message.kind === 'status' || message.kind === 'tool' || message.kind === 'candidates') {
    return null;
  }
  return {
    id: cleanDisplayText(message.id, nextId('restored')),
    role: message.role,
    kind: message.kind === 'text' || message.kind === 'activityResults' ? undefined : message.kind,
    content: cleanDisplayText(message.text, ''),
    activityResults: message.activityResults,
    pendingApproval: message.pendingApproval,
    profileCard: profileCardFromAssistantMessage(
      'unknown',
      cleanDisplayText(message.text, ''),
    ) ?? undefined,
  };
}

function profileCardFromAssistantMessage(
  intent: SocialAgentIntentType | 'unknown',
  text: string,
): ProfileCardData | null {
  if (
    ![
      'profile_enrichment',
      'profile_enrichment_request',
      'correction_or_clarification',
      'profile_update',
      'unknown',
    ].includes(intent)
  ) {
    return null;
  }
  const content = cleanDisplayText(text, '');
  if (!/(已提取|写入 AI 画像|画像字段|还缺|缺少|可约时间|边界要求)/.test(content)) {
    return null;
  }
  const summary = Array.from(
    new Set(
      [
        ...content.matchAll(
          /(zodiac|mbti|city|school|targetPreference|socialGoal|height|weight|nearbyArea|gender|ageRange):\s*([^；\n]+)/gi,
        ),
      ]
        .map((match) => cleanDisplayText(match[2], ''))
        .filter(Boolean),
    ),
  );
  const missingPatterns: Array<[string, RegExp]> = [
    ['可约时间', /可约时间|availableTimes/i],
    ['具体活动类型', /具体活动类型|activityType/i],
    ['边界要求', /边界要求|privacyBoundary|明确边界/i],
    ['是否只接受校内/公共场所', /校内\/公共场所|公共场所|校内/i],
  ];
  const missing = missingPatterns
    .filter(([, pattern]) => pattern.test(content))
    .map(([label]) => label);

  return {
    summary,
    missing: Array.from(new Set(missing)),
  };
}

function draftPublishFromSession(
  result: SocialAgentChatRunResult | SocialAgentChatReplanRunResult | null,
): DraftPublishState {
  const draft = result?.socialRequestDraft;
  if (!draft) return { status: 'idle' };
  const record = draft as Record<string, unknown>;
  const published = record.status === 'published' || record.synced === true;
  return {
    status: published ? 'published' : 'idle',
    socialRequestId: numberValue(record.socialRequestId),
    publicIntentId: stringValue(record.publicIntentId),
    error: null,
  };
}

function statusesFromVisibleSteps(
  steps: SocialAgentChatRunResult['visibleSteps'],
): StatusStep[] {
  return steps.map((step) => ({
    id: step.id,
    text: runStepText(normalizeRunStepId(step.id, 'initial') ?? 'done', step.label, step.status),
    state: step.status,
  }));
}

function candidateStatesFromSession(
  candidates: SocialAgentChatCandidate[],
  candidateActions: Record<string, Record<string, unknown>>,
  pendingApprovals: SocialAgentPendingApproval[],
): Record<string, CandidateActionSnapshot> {
  const states: Record<string, CandidateActionSnapshot> = {};
  for (const candidate of candidates) {
    const targetUserId = candidateTargetUserId(candidate);
    const action = targetUserId ? candidateActions[String(targetUserId)] : undefined;
    const state = emptyCandidateActionState();
    if (candidate.status === 'approved') state.save = 'saved';
    if (candidate.status === 'messaged') state.send = 'sent';
    if (action) {
      state.save = normalizeCandidateActionState(action.save, state.save);
      state.send = normalizeCandidateActionState(action.send, state.send);
      state.connect = normalizeCandidateActionState(action.connect, state.connect);
      state.conversationId = stringValue(action.conversationId);
      state.messageId = stringValue(action.messageId);
      state.friendRequestId = stringValue(action.friendRequestId);
      state.error = stringValue(action.error);
    }
    states[candidateActionKey(candidate)] = state;
  }

  for (const approval of pendingApprovals) {
    const payload = isRecord(approval.payload) ? approval.payload : {};
    const targetUserId = numberValue(
      payload.targetUserId ?? payload.candidateUserId ?? payload.userId,
    );
    const candidate = candidates.find((item) => candidateTargetUserId(item) === targetUserId);
    if (!candidate) continue;
    const key = candidateActionKey(candidate);
    const state = states[key] ?? emptyCandidateActionState();
    if (/send|message/i.test(approval.actionType)) state.send = 'pendingApproval';
    if (/connect|friend|contact/i.test(approval.actionType)) state.connect = 'pendingApproval';
    states[key] = state;
  }

  return states;
}

function normalizeCandidateActionState(
  value: unknown,
  fallback: CandidateActionState,
): CandidateActionState {
  const text = stringValue(value);
  if (
    text === 'idle' ||
    text === 'saving' ||
    text === 'saved' ||
    text === 'sending' ||
    text === 'sent' ||
    text === 'connecting' ||
    text === 'connected' ||
    text === 'pendingApproval' ||
    text === 'failed'
  ) {
    return text;
  }
  return fallback;
}

function candidateActionText(state: CandidateActionSnapshot): string {
  if (state.connect === 'connected') return '已连接，正在打开消息页。';
  if (state.connect === 'pendingApproval') return '好友申请已发送，等待对方确认。';
  if (state.send === 'sent') {
    return state.conversationId ? '已发送，可前往消息查看。' : '已发送。';
  }
  if (state.send === 'pendingApproval') return '待确认。';
  if (state.save === 'saved') return '已收藏。';
  return '操作已完成。';
}

function isPendingActionStatus(status: string | null | undefined): boolean {
  return status === 'pending' || status === 'pending_approval' || status === 'requested';
}

function isFailedCandidateAction(
  success: boolean,
  status: string | null | undefined,
  action: { status?: string | null } | null | undefined,
  pending: boolean,
): boolean {
  if (pending) return false;
  if (status === 'failed' || action?.status === 'failed' || action?.status === 'blocked') return true;
  return !success;
}

function toolActionErrorMessage(
  action: SocialAgentToolCall | null | undefined,
  fallback: string,
): string {
  const error = action?.error;
  if (error && typeof error === 'object') {
    const message = cleanDisplayText((error as Record<string, unknown>).message, '');
    if (message) return message;
  }
  return fallback;
}

function progressStepsFromToolCalls(
  toolCalls: ToolCallView[],
  result: SocialAgentChatRunResult | null,
  isRunning: boolean,
): StatusStep[] {
  if (toolCalls.length === 0) return [];
  const steps = toolCalls.map((call) => ({
    id: `tool_${call.id}`,
    text: toolProgressText(call),
    state: toolCallStatusToStepState(call.status),
  }));
  const hasSearch = toolCalls.some(
    (call) =>
      ['search_matches', 'search_real_candidates', 'search_public_intents'].includes(
        call.toolName,
      ) && call.status === 'success',
  );
  if (hasSearch) {
    steps.push({
      id: 'boundary_filter',
      text: '已排除你自己和不符合边界的人',
      state: 'done',
    });
  }
  if (result) {
    steps.push({
      id: 'candidate_result',
      text:
        result.candidates.length > 0
          ? `找到 ${result.candidates.length} 个候选`
          : '没有找到符合条件的真实候选',
      state: 'done',
    });
  } else if (isRunning && toolCalls.every((call) => call.status !== 'running')) {
    steps.push({ id: 'candidate_result_pending', text: '正在整理候选结果', state: 'running' });
  }
  return steps;
}

function toolProgressText(call: ToolCallView): string {
  const prefix = call.status === 'running' ? '正在' : call.status === 'success' ? '已' : '';
  if (call.status === 'blocked') return `${call.label}被权限拦截`;
  if (call.status === 'failed') return `${call.label}失败`;
  if (call.toolName === 'get_my_profile' || call.toolName === 'get_ai_profile') {
    return call.status === 'running' ? '正在读取你的画像' : '已读取你的画像';
  }
  if (call.toolName === 'search_matches' || call.toolName === 'search_real_candidates') {
    return `${prefix}搜索真实用户画像${countSuffix(call.count)}`;
  }
  if (call.toolName === 'search_public_intents') {
    return `${prefix}搜索公开约练卡片${countSuffix(call.count)}`;
  }
  if (call.toolName === 'search_activities') {
    return `${prefix}搜索活动${countSuffix(call.count)}`;
  }
  return call.status === 'running' ? `正在${call.label}` : `已${call.label}`;
}

function countSuffix(count: number | null): string {
  return count == null ? '' : `：${count} 条`;
}

function toolCallsFromRunResult(
  result: SocialAgentChatRunResult | SocialAgentChatReplanRunResult,
): ToolCallView[] {
  const events = Array.isArray(result.events)
    ? result.events.map(normalizeTaskEvent).filter((event): event is SocialAgentTaskEvent => !!event)
    : [];
  const fromEvents = toolCallsFromEvents(events);
  if (fromEvents.length > 0) return fromEvents;

  const rawCalls = (result as { toolCalls?: unknown }).toolCalls;
  if (!Array.isArray(rawCalls)) return [];
  return rawCalls
    .map((call) =>
      isRecord(call) ? toolCallViewFromRecord(call as unknown as SocialAgentToolCall) : null,
    )
    .filter((call): call is ToolCallView => !!call);
}

function toolCallsFromEvents(events: SocialAgentTaskEvent[]): ToolCallView[] {
  const calls = new Map<string, ToolCallView>();
  for (const event of events) {
    if (
      event.eventType !== 'tool.called' &&
      event.eventType !== 'tool.returned' &&
      event.eventType !== 'tool.failed'
    ) {
      continue;
    }
    const payload = isRecord(event.payload) ? event.payload : {};
    const toolName = stringValue(payload.toolName ?? payload.tool);
    if (!toolName) continue;
    const id = event.toolCallId || `${event.stepId ?? toolName}:${toolName}`;
    const previous = calls.get(id);
    if (event.eventType === 'tool.called') {
      calls.set(id, {
        ...(previous ?? emptyToolCallView(id, toolName)),
        id,
        stepId: event.stepId,
        toolName,
        status: previous?.status ?? 'running',
        label: toolLabel(toolName),
        detail: previous?.detail ?? 'running',
        startedAt: previous?.startedAt ?? event.createdAt,
      });
      continue;
    }

    const rawStatus =
      payload.status ??
      (event.eventType === 'tool.failed'
        ? 'failed'
        : event.eventType === 'tool.returned'
          ? 'succeeded'
          : null);
    const status = toolCallStatusFromRaw(rawStatus);
    const output = isRecord(payload.output) ? payload.output : null;
    const error = isRecord(payload.error) ? payload.error : null;
    calls.set(id, {
      ...(previous ?? emptyToolCallView(id, toolName)),
      id,
      stepId: event.stepId,
      toolName,
      status,
      label: toolLabel(toolName),
      detail: toolDetail(toolName, status, output, error),
      count: toolOutputCount(toolName, output),
      completedAt: event.createdAt,
    });
  }
  return Array.from(calls.values());
}

function eventsForRun(
  events: SocialAgentTaskEvent[],
  run: SocialAgentAsyncRunResult,
): SocialAgentTaskEvent[] {
  return events.filter((event) => {
    const payload = isRecord(event.payload) ? event.payload : {};
    const runId = stringValue(payload.runId ?? payload.run_id ?? payload.asyncRunId);
    return !runId || runId === run.runId;
  });
}

function normalizeTaskEvent(value: unknown): SocialAgentTaskEvent | null {
  if (!isRecord(value)) return null;
  const eventType = stringValue(value.eventType);
  if (!eventType) return null;
  return {
    id: numberValue(value.id) ?? 0,
    taskId: numberValue(value.taskId) ?? 0,
    eventType,
    actor: stringValue(value.actor) ?? 'agent',
    summary: stringValue(value.summary) ?? '',
    payload: isRecord(value.payload) ? value.payload : {},
    stepId: stringValue(value.stepId) ?? null,
    toolCallId: stringValue(value.toolCallId) ?? null,
    createdAt: stringValue(value.createdAt) ?? new Date().toISOString(),
  };
}

function toolCallViewFromRecord(call: SocialAgentToolCall): ToolCallView {
  const toolName = stringValue(call.toolName) ?? 'unknown_tool';
  const status = toolCallStatusFromRaw(call.status);
  const output = isRecord(call.output) ? call.output : null;
  const error = isRecord(call.error) ? call.error : null;
  return {
    id: stringValue(call.id) ?? nextId(`tool_${toolName}`),
    stepId: stringValue(call.stepId) ?? null,
    toolName,
    status,
    label: toolLabel(toolName),
    detail: toolDetail(toolName, status, output, error),
    count: toolOutputCount(toolName, output),
    durationMs: numberValue(call.durationMs) ?? null,
    startedAt: stringValue(call.startedAt) ?? null,
    completedAt: stringValue(call.completedAt) ?? null,
  };
}

function syntheticToolCallView(
  toolName: string,
  status: ToolCallViewStatus,
  output: Record<string, unknown> | null,
): ToolCallView {
  return {
    id: `synthetic_${toolName}`,
    stepId: null,
    toolName,
    status,
    label: toolLabel(toolName),
    detail: toolDetail(toolName, status, output, null),
    count: toolOutputCount(toolName, output),
    durationMs: null,
    startedAt: null,
    completedAt: new Date().toISOString(),
  };
}

function upsertToolCallView(current: ToolCallView[], next: ToolCallView): ToolCallView[] {
  const index = current.findIndex((call) => call.id === next.id);
  if (index < 0) return [...current, next];
  return current.map((call, itemIndex) => (itemIndex === index ? next : call));
}

function emptyToolCallView(id: string, toolName: string): ToolCallView {
  return {
    id,
    stepId: null,
    toolName,
    status: 'running',
    label: toolLabel(toolName),
    detail: 'running',
    count: null,
    durationMs: null,
    startedAt: null,
    completedAt: null,
  };
}

function toolCallStatusFromRaw(value: unknown): ToolCallViewStatus {
  if (value === 'succeeded' || value === 'success' || value === 'executed') return 'success';
  if (value === 'blocked') return 'blocked';
  if (value === 'failed' || value === 'error') return 'failed';
  if (value === 'running') return 'running';
  return 'running';
}

function toolCallStatusToStepState(status: ToolCallViewStatus): SocialAgentStepStatus {
  if (status === 'success') return 'done';
  if (status === 'running') return 'running';
  return 'failed';
}

function toolLabel(toolName: string): string {
  const labels: Record<string, string> = {
    get_my_profile: '读取你的画像',
    get_ai_profile: '读取你的画像',
    get_current_task_memory: '读取当前任务记忆',
    search_matches: '搜索真实用户画像',
    search_real_candidates: '搜索真实用户画像',
    search_public_intents: '搜索公开约练卡片',
    rank_candidates: '更新候选排序',
    search_activities: '搜索活动',
    explain_matches: '更新候选排序',
    draft_opener: '生成开场白',
    publish_social_request: '发布约练需求',
    create_social_request: '生成约练草稿',
    save_candidate: '收藏候选',
    send_message_to_candidate: '发送候选消息',
    send_message: '发送消息',
    connect_candidate: '连接候选',
    add_friend: '添加好友',
    get_conversations: '读取会话',
    get_agent_inbox: '读取 Agent Inbox',
    get_pending_approvals: '读取待确认动作',
    approve_action: '批准动作',
    reject_action: '拒绝动作',
    read_long_term_memory: '读取长期记忆',
    summarize_current_task: '总结当前任务',
    get_candidate_pool_debug: '读取候选池诊断',
  };
  return labels[toolName] ?? toolName.replace(/_/g, ' ');
}

function toolDetail(
  toolName: string,
  status: ToolCallViewStatus,
  output: Record<string, unknown> | null,
  error: Record<string, unknown> | null,
): string {
  if (status === 'running') return 'running';
  if (status === 'failed' || status === 'blocked') {
    return stringValue(error?.message ?? error?.code) ?? status;
  }
  const count = toolOutputCount(toolName, output);
  if (count != null) return `${count} 条`;
  const id = numberValue(
    output?.socialRequestId ?? output?.activityId ?? output?.messageId ?? output?.conversationId,
  );
  if (id != null) return `#${id}`;
  return 'completed';
}

function toolOutputCount(toolName: string, output: Record<string, unknown> | null): number | null {
  if (!output) return null;
  if (toolName === 'search_matches' || toolName === 'search_real_candidates') {
    return arrayLength(output.candidates ?? output.realCandidates ?? output.matches);
  }
  if (toolName === 'search_public_intents') {
    return arrayLength(
      output.publicIntents ?? output.intents ?? output.activities ?? output.activityResults ?? output.candidates,
    );
  }
  if (toolName === 'search_activities') {
    return arrayLength(output.activities ?? output.activityResults);
  }
  if (toolName === 'get_conversations') return arrayLength(output.conversations);
  if (toolName === 'get_agent_inbox') {
    return (
      (arrayLength(output.events) ?? 0) +
      (arrayLength(output.conversations) ?? 0) +
      (arrayLength(output.messages) ?? 0)
    );
  }
  if (toolName === 'get_pending_approvals') return arrayLength(output.approvals);
  return null;
}

function arrayLength(value: unknown): number | null {
  return Array.isArray(value) ? value.length : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
          text: run.result ? `已刷新计划和 ${run.result.candidates.length} 位候选人` : '已完成',
          state: 'done',
        };
      }
      return existing
        ? { ...existing, text: runStepText(id, stepLabels[id] ?? existing.text, 'done'), state: 'done' }
        : { id, text: runStepText(id, stepLabels[id] ?? '', 'done'), state: 'done' };
    }
    if (run.status === 'failed') {
      if (existing)
        return existing.state === 'running' ? { ...existing, state: 'failed' } : existing;
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
  if (id === 'permission')
    return state === 'done'
      ? '已检查权限模式'
      : `正在检查权限模式：${CONFIRM_PERMISSION_MODE_LABEL}`;
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

function shouldShowCandidateCardsForResult(
  result: SocialAgentChatRunResult | SocialAgentChatReplanRunResult | null,
  intent?: SocialAgentIntentType,
): boolean {
  if (!result || result.candidates.length === 0) return false;
  if (
    intent &&
    !['social_search', 'activity_search', 'candidate_followup'].includes(intent)
  ) {
    return false;
  }
  return Boolean(result.socialRequestDraft || intent);
}

function displayName(candidate: SocialAgentChatCandidate): string {
  return cleanDisplayText(candidate.displayName ?? candidate.nickname, `用户 #${candidate.userId}`);
}

function candidateActionKey(candidate: SocialAgentChatCandidate): string {
  const targetUserId = candidateTargetUserId(candidate) ?? 'missing';
  return [
    candidate.source ?? 'candidate',
    targetUserId,
    candidate.publicIntentId ??
      candidate.candidateRecordId ??
      candidate.socialRequestId ??
      candidate.activityId ??
      'transient',
  ].join(':');
}

function candidateTargetUserId(candidate: SocialAgentChatCandidate): number | null {
  const id = candidate.targetUserId ?? candidate.candidateUserId ?? candidate.userId;
  return Number.isFinite(id) && id > 0 ? id : null;
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
  if (
    /API|DeepSeek HTTP|JSON|stack|exception|Mongo|Postgres|database|enum|tool|undefined|null|Cannot |TypeError|ReferenceError/i.test(
      message,
    )
  ) {
    return '这次操作没有完成，我已经保留当前上下文。你可以稍后重试，或先继续补充条件。';
  }
  return message;
}

function isServerError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number' &&
    ((error as { status: number }).status >= 500)
  );
}

function nextId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
