import {
  socialAgentApi,
  type SocialCodexRunSummary,
  type SocialAgentPermissionMode,
  type UserFacingAgentResponse,
  type UserFacingAgentSessionSnapshot,
  type UserFacingAgentStreamEvent,
} from '../../../api/socialAgentApi';
import {
  publicProcessLabelForInternalName,
  sanitizePublicProcessText,
} from '../../assistant-ui/public-process-text';
import {
  isGenericSocialCodexProcessTitle,
  isKnownSocialCodexStageTitle,
  socialCodexStageDetail,
  socialCodexStageLabel,
  socialCodexStageTitle,
  type SocialCodexProcessState,
} from '../../../lib/socialCodexProcessCopy';
import type { AgentAdapter } from './agentAdapter.types';
import type { AgentLifecycle, AgentRunResponse, AgentStreamEvent } from './agentApi.types';
import { lifecycleFromLightStatus, lifecycleFromResponse, mapAgentError } from './agentLifecycle';
import { socialCodexTaskIdFromThreadId } from '../socialCodexThreadId';

type SocialAgentApiClient = Pick<
  typeof socialAgentApi,
  'runUserFacingStream' | 'handleMessage' | 'performActionStream' | 'restoreSession'
> & {
  handleMessageStream?: typeof socialAgentApi.handleMessageStream;
};

export function createRealAgentAdapter(
  apiClient: SocialAgentApiClient = socialAgentApi,
): AgentAdapter {
  return {
    async run(request, handlers) {
      const resolvedTaskId = resolveRequestTaskId(request.taskId, request.clientContext?.threadId);
      let observedTaskId = resolvedTaskId ?? null;
      const useMessageStream = shouldUseRouteMessageStream(request);
      const runStream =
        useMessageStream && apiClient.handleMessageStream ? apiClient.handleMessageStream : null;
      const forwardEvent = createMappedStreamEventForwarder({
        onEvent: handlers.onEvent,
        onRawEvent: (event) => {
          observedTaskId = taskIdFromStreamEvent(event) ?? observedTaskId;
        },
      });
      try {
        const clientContext = withConversationIntent(
          request.clientContext,
          request.conversationIntent,
        );
        const response = runStream
          ? await runStream(
              {
                message: request.goal,
                taskId: resolvedTaskId ?? request.taskId,
                idempotencyKey: request.idempotencyKey,
                conversationIntent: request.conversationIntent,
                clientContext,
              },
              forwardEvent,
              handlers.signal,
            )
          : await apiClient.runUserFacingStream(
              {
                goal: request.goal,
                permissionMode: request.permissionMode,
                conversationIntent: request.conversationIntent,
                taskId: resolvedTaskId ?? request.taskId,
                city: request.city,
                idempotencyKey: request.idempotencyKey,
                clientContext,
              },
              forwardEvent,
              handlers.signal,
            );
        return toRunResponse(response, observedTaskId);
      } catch (error) {
        if (handlers.signal?.aborted) throw mapAgentError(error);
        const restored = await recoverInterruptedStream(apiClient, observedTaskId);
        if (restored) {
          const response = toRunResponsePreferTask(restored, observedTaskId);
          handlers.onEvent({
            type: 'result',
            lifecycle: response.lifecycle,
            result: response.response,
          });
          return response;
        }
        throw mapAgentError(error);
      }
    },

    async performAction(taskId, request, handlers) {
      if (!request.idempotencyKey)
        throw mapAgentError(new Error('MISSING_INFO: idempotencyKey is required'));
      try {
        const forwardEvent = createMappedStreamEventForwarder({
          onEvent: (event) => handlers?.onEvent(event),
        });
        const actionInput = {
          taskId,
          action: request.action,
          idempotencyKey: request.idempotencyKey,
          payload: { ...(request.payload ?? {}) },
        };
        const response = await apiClient.performActionStream(
          actionInput,
          forwardEvent,
          handlers?.signal,
        );
        return toRunResponse(response);
      } catch (error) {
        if (handlers?.signal?.aborted) throw mapAgentError(error);
        const restored = await recoverInterruptedStream(apiClient, taskId);
        if (restored) {
          const response = toRunResponsePreferTask(restored, taskId);
          handlers?.onEvent({
            type: 'result',
            lifecycle: response.lifecycle,
            result: response.response,
          });
          return response;
        }
        throw mapAgentError(error);
      }
    },

    async restoreSession(taskId) {
      try {
        const snapshot = await apiClient.restoreSession(taskId);
        const restored = responseFromSessionSnapshot(snapshot);
        if (restored) {
          const response = toRunResponse(restored);
          return {
            ...response,
            taskId: snapshot.activeTaskId ?? response.taskId ?? null,
            taskStatus: typeof snapshot.task?.status === 'string' ? snapshot.task.status : null,
          };
        }
      } catch {
        // Keep restore non-blocking. A failed restore should not break a fresh Agent page.
      }
      return null;
    },
  };
}

function resolveRequestTaskId(
  taskId: number | null | undefined,
  threadId: string | null | undefined,
): number | null {
  if (typeof taskId === 'number' && Number.isFinite(taskId) && taskId > 0) {
    return Math.trunc(taskId);
  }
  const parsed = socialCodexTaskIdFromThreadId(threadId);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function createMappedStreamEventForwarder(input: {
  onEvent?: (event: AgentStreamEvent) => void;
  onRawEvent?: (event: UserFacingAgentStreamEvent) => void;
}) {
  let previousAssistantDelta: AssistantStreamDedupKey | null = null;
  return (event: UserFacingAgentStreamEvent) => {
    input.onRawEvent?.(event);
    const mapped = withLifecycle(event);
    throwIfStreamError(mapped);
    if (!mapped) return;
    if (isDuplicatedDualProtocolAssistantDelta(mapped, previousAssistantDelta)) {
      return;
    }
    if (mapped.type === 'assistant_delta') {
      previousAssistantDelta = assistantDeltaDedupKey(mapped);
    }
    input.onEvent?.(mapped);
  };
}

type AssistantStreamDedupKey = {
  key: string;
  protocol: string | null;
};

function isDuplicatedDualProtocolAssistantDelta(
  event: AgentStreamEvent,
  previous: AssistantStreamDedupKey | null,
): boolean {
  if (event.type !== 'assistant_delta') return false;
  const current = assistantDeltaDedupKey(event);
  if (!previous || previous.key !== current.key) return false;
  return (
    previous.protocol !== current.protocol &&
    (previous.protocol === 'social_agent_event_v2' || current.protocol === 'social_agent_event_v2')
  );
}

function assistantDeltaDedupKey(
  event: Extract<AgentStreamEvent, { type: 'assistant_delta' }>,
): AssistantStreamDedupKey {
  return {
    key: [event.source ?? '', normalizeAssistantDeltaForDedup(event.delta ?? '')].join('\u001f'),
    protocol: sourceProtocolFromMappedEvent(event),
  };
}

function normalizeAssistantDeltaForDedup(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function sourceProtocolFromMappedEvent(event: AgentStreamEvent): string | null {
  const protocol = event.metadata?.sourceProtocol;
  return typeof protocol === 'string' && protocol.trim() ? protocol.trim() : null;
}

function withConversationIntent<
  T extends { conversationIntent?: 'conversation' | 'social' | 'approval' },
>(
  clientContext: Omit<T, 'conversationIntent'> | T | undefined,
  conversationIntent: 'conversation' | 'social' | 'approval' | undefined,
): T | undefined {
  if (!clientContext) return undefined;
  return {
    ...clientContext,
    ...(conversationIntent ? { conversationIntent } : {}),
  } as T;
}

function shouldUseRouteMessageStream(request: {
  conversationIntent?: 'conversation' | 'social' | 'approval';
  taskId?: number | null;
}) {
  return request.conversationIntent === 'conversation' || request.conversationIntent === 'social';
}

export function mapUserFacingAgentStreamEvent(
  event: UserFacingAgentStreamEvent,
): AgentStreamEvent | null {
  return withLifecycle(event);
}

async function recoverInterruptedStream(
  apiClient: SocialAgentApiClient,
  taskId: number | null,
): Promise<UserFacingAgentResponse | null> {
  if (!taskId) return null;
  try {
    const snapshot = await apiClient.restoreSession(taskId);
    return responseFromSessionSnapshot(snapshot);
  } catch {
    return null;
  }
}

function withLifecycle(event: UserFacingAgentStreamEvent): AgentStreamEvent | null {
  const explicitLifecycle = readLifecycle(event);
  if (event.type === 'status') {
    const lifecycle = explicitLifecycle ?? lifecycleFromLightStatus(event.lightStatus);
    const state = 'running';
    const title = legacyTitleForLifecycle(lifecycle, state);
    return {
      type: 'progress',
      id: 'social-codex:summary',
      kind: 'status',
      title,
      detail: undefined,
      state,
      lifecycle,
      metadata: {
        processType: 'run_summary',
        originalProcessType: 'legacy_status',
        sourceProtocol: 'legacy_agent_stream',
        taskId: event.taskId ?? null,
        threadId: event.threadId ?? null,
        stageLabel: stageLabelForLifecycle(lifecycle),
        displayState: state,
        displayMode: 'covering_status',
        updateModel: 'latest_state',
        defaultVisibleCount: 1,
        historyVisibility: 'collapsed',
      },
    };
  }
  if (isSocialAgentEventV2(event)) {
    if (event.visibility !== 'user_visible') return null;
    return socialAgentV2ToProgress(event);
  }
  if (event.type === 'result') {
    return { ...event, lifecycle: explicitLifecycle ?? lifecycleFromResponse(event.result) };
  }
  if (event.type === 'error') {
    return { ...event, lifecycle: explicitLifecycle ?? 'failed' };
  }
  if (event.type === 'assistant_delta' || event.type === 'assistant_done') {
    return explicitLifecycle
      ? { ...event, lifecycle: explicitLifecycle }
      : { ...event, lifecycle: undefined };
  }
  if (event.type === 'progress') {
    return legacyProgressEventToSummary(event, explicitLifecycle);
  }
  if (event.type === 'agent_loop_step') {
    return legacyProcessEventToSummary(event, explicitLifecycle);
  }
  if (event.type === 'tool_call' || event.type === 'tool_result') {
    return legacyProcessEventToSummary(event, explicitLifecycle);
  }
  if (event.type === 'approval_required') {
    return {
      type: 'progress',
      id: `approval-${event.approvalId ?? event.actionType}`,
      kind: 'status',
      title: '等待你确认',
      detail: event.summary,
      state: 'waiting',
      lifecycle: explicitLifecycle ?? 'waiting_confirmation',
      metadata: {
        processType: 'approval',
        approvalId: event.approvalId,
        actionType: event.actionType,
        riskLevel: event.riskLevel,
      },
    };
  }
  return null;
}

function throwIfStreamError(event: AgentStreamEvent | null): void {
  if (event?.type !== 'error') return;
  throw agentStreamEventError(event);
}

function agentStreamEventError(event: Extract<AgentStreamEvent, { type: 'error' }>) {
  const error = new Error(event.message) as Error & {
    code?: string;
    retryable?: boolean;
    recoveryNotice?: Extract<UserFacingAgentStreamEvent, { type: 'error' }>['recoveryNotice'];
  };
  error.name = event.code || 'AGENT_STREAM_FAILED';
  error.code = event.code;
  error.retryable = event.retryable;
  error.recoveryNotice = event.recoveryNotice;
  return error;
}

function legacyProgressEventToSummary(
  event: Extract<UserFacingAgentStreamEvent, { type: 'progress' }>,
  explicitLifecycle: AgentLifecycle | null,
): AgentStreamEvent {
  if (!shouldCollapseLegacyProgressEvent(event)) {
    const progressEvent: Omit<typeof event, 'lifecycle'> = {
      type: event.type,
      id: event.id,
      kind: event.kind,
      title: event.title,
      detail: event.detail,
      state: event.state,
      metadata: event.metadata,
      snapshot: event.snapshot,
    };
    return explicitLifecycle ? { ...progressEvent, lifecycle: explicitLifecycle } : progressEvent;
  }
  const state = progressStateFromStatus(event.state);
  const lifecycle =
    explicitLifecycle ?? lifecycleFromLegacyProgressEvent(event.title, event.detail, event.kind);
  const title = legacyProcessTitle(event.title, lifecycle, state);
  const detail = legacyProcessDetail(event.detail, title);
  const stepId = safeProgressId(event.metadata?.stepId, event.id);
  const originalProcessType = legacyExplicitProcessType(event.metadata) ?? 'legacy_progress';

  return {
    type: 'progress',
    id: 'social-codex:summary',
    kind: 'status',
    title,
    detail,
    state,
    lifecycle,
    metadata: {
      ...publicLegacyProgressMetadata(event.metadata),
      processType: 'run_summary',
      originalProcessType,
      sourceProtocol: 'legacy_agent_stream',
      stepId,
      stageLabel: stageLabelForLifecycle(lifecycle),
      displayState: state,
    },
    snapshot: event.snapshot,
  };
}

function shouldCollapseLegacyProgressEvent(
  event: Extract<UserFacingAgentStreamEvent, { type: 'progress' }>,
): boolean {
  const explicitProcessType = legacyExplicitProcessType(event.metadata);
  if (explicitProcessType === 'approval') return false;
  if (isRecord(event.snapshot)) return false;
  if (!isRecord(event.metadata)) return false;

  // Backend legacy tool/process progress carries these internal breadcrumbs.
  // Checkpoint/replay/fork UI can carry a safe step snapshot that powers the
  // expanded evidence panel, so keep those expandable.
  return Boolean(
    event.metadata.stepId ||
    event.metadata.agentName ||
    event.metadata.toolName ||
    explicitProcessType,
  );
}

function legacyProcessEventToSummary(
  event: Extract<
    UserFacingAgentStreamEvent,
    { type: 'agent_loop_step' | 'tool_call' | 'tool_result' }
  >,
  explicitLifecycle: AgentLifecycle | null,
): AgentStreamEvent {
  const state = event.type === 'tool_call' ? 'running' : progressStateFromStatus(event.status);
  const lifecycle = explicitLifecycle ?? lifecycleFromLegacyProcessEvent(event);
  const stepId = legacyProcessStepId(event);
  const title = legacyProcessTitle(event.title, lifecycle, state);
  const detail = legacyProcessDetail(event.detail, title);

  return {
    type: 'progress',
    id: 'social-codex:summary',
    kind: 'status',
    title,
    detail,
    state,
    lifecycle,
    metadata: {
      processType: 'run_summary',
      originalProcessType:
        event.type === 'agent_loop_step' ? 'legacy_agent_loop_step' : 'legacy_tool_progress',
      sourceProtocol: 'legacy_agent_stream',
      legacyEventType: event.type,
      stepId,
      phase: event.type === 'agent_loop_step' ? event.phase : undefined,
      agentName: publicScalar(event.agentName) ?? undefined,
      toolName: publicScalar(event.toolName) ?? undefined,
      stageLabel: stageLabelForLifecycle(lifecycle),
      displayState: state,
    },
  };
}

function legacyExplicitProcessType(metadata: unknown): string | null {
  if (!isRecord(metadata)) return null;
  const processType = metadata.processType;
  if (typeof processType !== 'string') return null;
  const normalized = processType.trim().toLowerCase();
  if (!normalized) return null;
  return normalized.replace(/[^a-z0-9_:-]+/g, '_').slice(0, 80);
}

function publicLegacyProgressMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const source = metadata as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const stepId = publicScalar(source.stepId);
  const agentName = publicScalar(source.agentName);
  const toolName = publicScalar(source.toolName);
  if (stepId) out.stepId = stepId;
  if (agentName) out.agentName = agentName;
  if (toolName) out.toolName = toolName;
  return out;
}

function lifecycleFromLegacyProgressEvent(
  title: unknown,
  detail: unknown,
  kind: unknown,
): AgentLifecycle {
  const text = `${typeof title === 'string' ? title : ''} ${
    typeof detail === 'string' ? detail : ''
  } ${typeof kind === 'string' ? kind : ''}`.toLowerCase();
  if (/approval|confirm|确认|发送邀请前/.test(text)) return 'waiting_confirmation';
  if (/candidate|search|match|筛选|候选|公开可发现|找人/.test(text)) {
    return 'searching_candidates';
  }
  if (/rank|sort|排序|整理合适|推荐|排除/.test(text)) return 'ranking_matches';
  if (/safety|risk|安全|边界/.test(text)) return 'checking_safety';
  if (/opener|开场白/.test(text)) return 'drafting_opener';
  if (/profile|life|graph|memory|画像|偏好|记忆/.test(text)) return 'reading_life_graph';
  return 'analyzing_intent';
}

function lifecycleFromLegacyProcessEvent(
  event: Extract<
    UserFacingAgentStreamEvent,
    { type: 'agent_loop_step' | 'tool_call' | 'tool_result' }
  >,
): AgentLifecycle {
  const text =
    `${event.title} ${event.detail ?? ''} ${event.type === 'agent_loop_step' ? event.phase : ''} ${
      event.toolName ?? ''
    }`.toLowerCase();
  if (/approval|confirm|确认|发送邀请前/.test(text)) return 'waiting_confirmation';
  if (/candidate|search|match|筛选|候选|公开可发现|找人/.test(text)) {
    return 'searching_candidates';
  }
  if (/rank|sort|排序|整理合适|推荐/.test(text)) return 'ranking_matches';
  if (/safety|risk|安全|边界/.test(text)) return 'checking_safety';
  if (/opener|开场白/.test(text)) return 'drafting_opener';
  if (/profile|life|graph|memory|画像|偏好|记忆/.test(text)) return 'reading_life_graph';
  return 'analyzing_intent';
}

function legacyProcessStepId(
  event: Extract<
    UserFacingAgentStreamEvent,
    { type: 'agent_loop_step' | 'tool_call' | 'tool_result' }
  >,
): string {
  if (event.type === 'agent_loop_step') {
    return safeProgressId(event.stepId, `${event.phase}-${event.title}`);
  }
  return safeProgressId(event.stepId, event.toolName);
}

function legacyProcessTitle(
  value: unknown,
  lifecycle: AgentLifecycle,
  state: 'running' | 'done' | 'failed' | 'waiting',
): string {
  const explicit = sanitizePublicV2DisplayText(value);
  if (explicit && !isGenericLegacyProcessCopy(explicit)) return explicit;
  return legacyTitleForLifecycle(lifecycle, state);
}

function legacyProcessDetail(value: unknown, title: string): string | undefined {
  const explicit = sanitizePublicV2DisplayText(value);
  if (!explicit || isGenericLegacyProcessCopy(explicit) || explicit === title) return undefined;
  return explicit;
}

function legacyTitleForLifecycle(
  lifecycle: AgentLifecycle,
  state: 'running' | 'done' | 'failed' | 'waiting',
): string {
  const done = state === 'done';
  if (state === 'failed') return '刚才连接不稳，可以继续';
  if (state === 'waiting' || lifecycle === 'waiting_confirmation') {
    return done ? '已处理你的确认' : '需要你确认后继续';
  }
  if (lifecycle === 'reading_life_graph') {
    return done ? '已读取你的偏好' : '正在读取你的偏好';
  }
  if (lifecycle === 'searching_candidates') {
    return done ? '已筛选公开可发现的人' : '正在筛选公开可发现的人';
  }
  if (lifecycle === 'ranking_matches') {
    return done ? '已整理合适机会' : '正在整理合适机会';
  }
  if (lifecycle === 'checking_safety') {
    return done ? '已检查安全边界' : '正在检查安全边界';
  }
  if (lifecycle === 'drafting_opener') {
    return done ? '已生成开场白' : '正在生成开场白';
  }
  if (lifecycle === 'completed') return '已整理当前进度';
  return done ? '已理解你的需求' : '正在理解你的需求';
}

function stageLabelForLifecycle(lifecycle: AgentLifecycle): string {
  if (lifecycle === 'reading_life_graph') return '读取上下文';
  if (lifecycle === 'searching_candidates') return '查找候选';
  if (lifecycle === 'ranking_matches') return '整理推荐';
  if (lifecycle === 'checking_safety') return '安全检查';
  if (lifecycle === 'drafting_opener') return '生成开场白';
  if (lifecycle === 'waiting_confirmation') return '等待确认';
  return '理解需求';
}

function isGenericLegacyProcessCopy(value: string): boolean {
  const normalized = value.replace(/\s+/g, '');
  const tokenSets = [
    ['正在', '处理', '这一步'],
    ['正在', '推进', '这一步'],
    ['正在', '推进', '进度'],
    ['正在', '处理', '步骤'],
    ['正在', '整理', '当前', '信息'],
    ['正在', '思考'],
    ['已整理', '结果'],
    ['已整理', '进度'],
    ['已完成', '这一步'],
    ['已完成'],
    ['工具'],
    ['步骤'],
    ['调用'],
  ];
  return tokenSets.some((tokens) => tokens.every((token) => normalized.includes(token)));
}

function isSocialAgentEventV2(
  event: UserFacingAgentStreamEvent,
): event is Extract<UserFacingAgentStreamEvent, { eventId: string }> {
  return (
    typeof (event as { eventId?: unknown }).eventId === 'string' &&
    typeof (event as { seq?: unknown }).seq === 'number' &&
    typeof (event as { stage?: unknown }).stage === 'string'
  );
}

function socialAgentV2ToProgress(
  event: Extract<UserFacingAgentStreamEvent, { eventId: string }>,
): AgentStreamEvent {
  if (event.type === 'assistant.delta') {
    const delta = typeof event.payload?.delta === 'string' ? event.payload.delta : '';
    return {
      type: 'assistant_delta',
      lifecycle: lifecycleFromV2Stage(event.stage),
      messageId: event.messageId ?? assistantMessageIdFromV2Payload(event.payload) ?? undefined,
      delta,
      source: assistantSourceFromV2Payload(event.payload) ?? 'llm',
      metadata: {
        sourceProtocol: 'social_agent_event_v2',
        eventId: event.eventId,
        seq: event.seq,
        runId: event.runId,
        taskId: event.taskId ?? null,
        threadId: event.threadId ?? null,
      },
    };
  }
  const runSummary = publicV2RunSummary(event.payload);
  const title = runSummary?.title ?? publicV2Title(event);
  const detail = runSummary?.detail ?? publicV2Detail(event);
  return {
    type: 'progress',
    id: progressIdForV2(event),
    kind: kindFromV2(event),
    title,
    detail,
    state: progressStateFromRunSummary(runSummary) ?? progressStateFromV2(event.display?.state),
    lifecycle: lifecycleFromV2Stage(event.stage),
    metadata: publicV2Metadata(event, runSummary),
  };
}

function assistantSourceFromV2Payload(
  payload: Record<string, unknown> | undefined,
): 'llm' | 'fallback' | null {
  const source = typeof payload?.source === 'string' ? payload.source.trim() : '';
  return source === 'llm' || source === 'fallback' ? source : null;
}

function assistantMessageIdFromV2Payload(
  payload: Record<string, unknown> | undefined,
): string | null {
  const messageId = typeof payload?.messageId === 'string' ? payload.messageId.trim() : '';
  return messageId || null;
}

function publicV2Title(event: Extract<UserFacingAgentStreamEvent, { eventId: string }>): string {
  const explicit = sanitizePublicV2DisplayText(event.display?.title);
  const stageState = v2ProcessState(event);
  const stageTitle = socialCodexStageTitle(event.stage, stageState);
  const slotSummary = publicSlotSummaryFromPayload(event.payload);
  if (event.type === 'run.failed') return '这段需求还在';
  if (event.type === 'slot.filled' && slotSummary) return `已记住：${slotSummary}`;
  if (event.type === 'slot.completed' && slotSummary) return `已确认：${slotSummary}`;
  if (
    explicit &&
    !isGenericSocialCodexProcessTitle(explicit) &&
    !shouldPreferV2StageCopy(event, explicit, stageTitle)
  ) {
    return explicit;
  }
  if (event.type === 'run.started') return stageTitle ?? '正在理解你的需求';
  if (event.type === 'visible_process.delta') return stageTitle ?? '正在理解你的需求';
  if (event.type === 'tool.started') return stageTitle ?? '正在整理当前信息';
  if (event.type === 'tool.progress') return stageTitle ?? '正在整理当前信息';
  if (event.type === 'tool.done') return stageTitle ?? '已整理当前进度';
  if (event.type === 'slot.filled') return '已记住你刚补充的信息';
  if (event.type === 'slot.completed') return stageTitle ?? '已记录你的关键信息';
  if (event.type === 'opportunity_card.created') {
    return socialCodexStageTitle('create_opportunity_card', 'done') ?? '这张约练卡可以发布到发现';
  }
  if (event.type === 'candidate_search.started') {
    return socialCodexStageTitle('search_candidates', 'running') ?? '正在筛选公开可发现的人';
  }
  if (event.type === 'memory.saved') return '这些信息下次会继续使用';
  if (event.type === 'candidate_search.done') {
    return socialCodexStageTitle('search_candidates', 'done') ?? '已筛选公开可发现的人';
  }
  if (event.type === 'safety_check.done') {
    return socialCodexStageTitle('safety_filter', 'done') ?? '已检查安全边界';
  }
  if (event.type === 'approval.required') return stageTitle ?? '需要你确认后继续';
  if (event.type === 'approval.resolved') return stageTitle ?? '已处理你的确认';
  if (event.type === 'run.completed') return stageTitle ?? '已整理当前进度';
  return stageTitle ?? '正在整理当前进度';
}

function publicV2Detail(
  event: Extract<UserFacingAgentStreamEvent, { eventId: string }>,
): string | undefined {
  const explicit = sanitizePublicV2DisplayText(event.display?.detail);
  const explicitTitle = sanitizePublicV2DisplayText(event.display?.title);
  const stageTitle = socialCodexStageTitle(event.stage, v2ProcessState(event));
  const slotSummary = publicSlotSummaryFromPayload(event.payload);
  if ((event.type === 'slot.filled' || event.type === 'slot.completed') && slotSummary) {
    return undefined;
  }
  if (explicit && !shouldPreferV2StageCopy(event, explicitTitle, stageTitle)) return explicit;
  if (event.type === 'candidate_search.done') {
    const candidateCount =
      readPositiveNumber(event.payload?.candidateCount) ??
      readPositiveNumber(event.payload?.count) ??
      readPositiveNumber(event.payload?.activityCount);
    if (candidateCount) return `找到 ${candidateCount} 个公开可发现的人或活动。`;
  }
  if (event.type === 'memory.saved') {
    const factSummary = publicLifeGraphFactSummary(event.payload);
    if (factSummary) return `已整理：${factSummary}`;
    const factCount = readLifeGraphFactCount(event.payload);
    if (factCount) return `已保存 ${factCount} 条稳定偏好，后续约练会继续参考。`;
  }
  if (event.type === 'opportunity_card.created') return '你确认后，它可以发布到发现页。';
  if (event.type === 'approval.required') return '确认前不会发布、发送邀请或交换敏感信息。';
  if (event.type === 'safety_check.done') return '涉及位置、联系方式和陌生人连接时会继续征得确认。';
  return socialCodexStageDetail(event.stage, v2ProcessState(event)) ?? undefined;
}

type PublicSocialCodexRunSummary = Pick<
  SocialCodexRunSummary,
  | 'state'
  | 'title'
  | 'detail'
  | 'displayMode'
  | 'updateModel'
  | 'defaultVisibleCount'
  | 'historyVisibility'
  | 'currentStage'
  | 'currentEventId'
  | 'currentSeq'
  | 'pendingApproval'
  | 'candidateCount'
  | 'activityCount'
  | 'hasOpportunityCard'
  | 'savedMemory'
  | 'visibleStepCount'
  | 'expandable'
>;

function publicV2RunSummary(
  payload: Record<string, unknown> | undefined,
): PublicSocialCodexRunSummary | null {
  const summary = firstRecord(
    payload?.summary,
    payload?.replaySummary,
    isRecord(payload?.replay) ? payload.replay.summary : null,
  );
  if (!summary) return null;
  const title = sanitizePublicV2Text(summary.title);
  if (!title) return null;
  const state = publicRunSummaryState(summary.state);
  const detail = sanitizePublicV2Text(summary.detail);
  return {
    state,
    title,
    detail,
    displayMode: 'covering_status',
    updateModel: 'latest_state',
    defaultVisibleCount: 1,
    historyVisibility: 'collapsed',
    currentStage: publicSocialAgentStage(summary.currentStage),
    currentEventId: publicScalar(summary.currentEventId)?.toString() ?? null,
    currentSeq: readPositiveNumber(summary.currentSeq),
    pendingApproval: summary.pendingApproval === true,
    candidateCount: readPositiveNumber(summary.candidateCount),
    activityCount: readPositiveNumber(summary.activityCount),
    hasOpportunityCard: summary.hasOpportunityCard === true,
    savedMemory: summary.savedMemory === true,
    visibleStepCount: readPositiveNumber(summary.visibleStepCount) ?? 1,
    expandable: summary.expandable === true,
  };
}

function publicRunSummaryState(value: unknown): SocialCodexRunSummary['state'] {
  if (value === 'waiting' || value === 'completed' || value === 'failed') return value;
  return 'running';
}

function progressStateFromRunSummary(
  summary: PublicSocialCodexRunSummary | null,
): 'running' | 'done' | 'failed' | 'waiting' | null {
  if (!summary) return null;
  if (summary.state === 'completed') return 'done';
  if (summary.state === 'failed') return 'failed';
  if (summary.state === 'waiting') return 'waiting';
  return 'running';
}

function publicSocialAgentStage(value: unknown): SocialCodexRunSummary['currentStage'] {
  return typeof value === 'string' ? (value as SocialCodexRunSummary['currentStage']) : null;
}

function shouldPreferV2StageCopy(
  event: Extract<UserFacingAgentStreamEvent, { eventId: string }>,
  explicitTitle: string | null,
  stageTitle: string | null,
) {
  if (!explicitTitle || !stageTitle || explicitTitle === stageTitle) return false;
  if (event.type === 'approval.required' || event.type === 'approval.resolved') return false;
  return isKnownSocialCodexStageTitle(explicitTitle);
}

function publicV2Metadata(
  event: Extract<UserFacingAgentStreamEvent, { eventId: string }>,
  runSummary: PublicSocialCodexRunSummary | null = null,
): Record<string, unknown> {
  const originalProcessType = publicV2ProcessType(event.type);
  const surfaceIntent = surfaceIntentForV2(event, originalProcessType);
  const metadata: Record<string, unknown> = {
    eventId: event.eventId,
    seq: event.seq,
    threadId: publicScalar(event.threadId),
    taskId: event.taskId,
    processType: processTypeForV2Surface(event, originalProcessType),
    originalProcessType,
    surfaceIntent,
    stageLabel: socialCodexStageLabel(event.stage),
    displayState: event.display?.state ?? 'running',
    source: runSummary ? 'replay.summary' : 'social_agent_event_v2',
    sourceProtocol: 'social_agent_event_v2',
  };
  if (processTypeForV2Surface(event, originalProcessType) === 'run_summary') {
    metadata.displayMode = runSummary?.displayMode ?? 'covering_status';
    metadata.updateModel = runSummary?.updateModel ?? 'latest_state';
    metadata.defaultVisibleCount = runSummary?.defaultVisibleCount ?? 1;
    metadata.historyVisibility = runSummary?.historyVisibility ?? 'collapsed';
  }
  if (runSummary) {
    metadata.summaryState = runSummary.state;
    metadata.displayState = progressStateFromRunSummary(runSummary) ?? metadata.displayState;
    metadata.currentStage = runSummary.currentStage;
    metadata.currentEventId = runSummary.currentEventId;
    metadata.currentSeq = runSummary.currentSeq;
    metadata.visibleStepCount = runSummary.visibleStepCount;
    metadata.expandable = runSummary.expandable;
    metadata.pendingApproval = runSummary.pendingApproval;
    if (runSummary.candidateCount) metadata.candidateCount = runSummary.candidateCount;
    if (runSummary.activityCount) metadata.activityCount = runSummary.activityCount;
    if (runSummary.hasOpportunityCard) metadata.hasOpportunityCard = true;
    if (runSummary.savedMemory) metadata.savedMemory = true;
  }
  if (event.type === 'approval.required' || event.type === 'approval.resolved') {
    const approvalId = publicScalar(event.payload?.approvalId);
    const riskLevel = publicScalar(event.payload?.riskLevel);
    const actionType = publicScalar(event.payload?.actionType);
    if (approvalId) metadata.approvalId = approvalId;
    if (riskLevel) metadata.riskLevel = riskLevel;
    if (actionType) metadata.actionType = actionType;
    const approvalRuntime = publicApprovalRuntimeMetadata(event.payload);
    Object.assign(metadata, approvalRuntime);
  }
  if (event.type === 'candidate_search.done') {
    const candidateCount =
      readPositiveNumber(event.payload?.candidateCount) ??
      readPositiveNumber(event.payload?.count) ??
      readPositiveNumber(event.payload?.activityCount);
    if (candidateCount) metadata.candidateCount = candidateCount;
  }
  if (event.type === 'slot.filled' || event.type === 'slot.completed') {
    const slotSummary = publicSlotSummaryFromPayload(event.payload);
    if (slotSummary) metadata.slotSummary = slotSummary;
  }
  if (event.type === 'memory.saved') {
    const factCount = readLifeGraphFactCount(event.payload);
    if (factCount) metadata.lifeGraphFactCount = factCount;
  }
  return metadata;
}

function surfaceIntentForV2(
  event: Extract<UserFacingAgentStreamEvent, { eventId: string }>,
  processType: string,
): 'conversation' | 'social' | 'approval' {
  if (processType === 'approval' || event.stage === 'approval') return 'approval';
  if (
    /^(profile_gate|slot_filling|create_opportunity_card|publish_to_discover|search_candidates|safety_filter|rank_candidates|generate_opener|send_invite|life_graph_writeback)$/i.test(
      event.stage,
    )
  ) {
    return 'social';
  }
  if (
    processType === 'slot_memory' ||
    processType === 'candidate_search' ||
    processType === 'opportunity_card' ||
    processType === 'memory' ||
    processType === 'safety'
  ) {
    return 'social';
  }
  return 'conversation';
}

function publicApprovalRuntimeMetadata(
  payload: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const source = isRecord(payload) ? payload : {};
  const socialCodex = isRecord(source.socialCodex) ? source.socialCodex : {};
  const approvalPolicy = isRecord(socialCodex.approvalPolicy) ? socialCodex.approvalPolicy : {};
  const policy = isRecord(source.policy) ? source.policy : {};
  const dryRunPreview = firstRecord(
    source.dryRunPreview,
    socialCodex.dryRunPreview,
    policy.dryRunPreview,
  );
  const title = sanitizePublicV2Text(dryRunPreview?.title);
  const summary = sanitizePublicV2Text(dryRunPreview?.summary);
  const sideEffectAllowed =
    typeof dryRunPreview?.sideEffectAllowedBeforeApproval === 'boolean'
      ? dryRunPreview.sideEffectAllowedBeforeApproval
      : approvalPolicy.sideEffectsBeforeApproval === 'none'
        ? false
        : undefined;
  const auditRequired =
    typeof source.auditRequired === 'boolean'
      ? source.auditRequired
      : typeof socialCodex.auditRequired === 'boolean'
        ? socialCodex.auditRequired
        : typeof approvalPolicy.auditRequired === 'boolean'
          ? approvalPolicy.auditRequired
          : undefined;
  const executionContract =
    typeof socialCodex.executionContract === 'string'
      ? socialCodex.executionContract
      : typeof source.executionContract === 'string'
        ? source.executionContract
        : null;
  const out: Record<string, unknown> = {
    dryRunAvailable: Boolean(title || summary || dryRunPreview),
  };
  if (title) out.dryRunPreviewTitle = title;
  if (summary) out.dryRunPreviewSummary = summary;
  if (typeof sideEffectAllowed === 'boolean') {
    out.sideEffectAllowedBeforeApproval = sideEffectAllowed;
  }
  if (typeof auditRequired === 'boolean') out.auditRequired = auditRequired;
  const boundary = publicExecutionBoundary(executionContract);
  if (boundary) out.executionBoundary = boundary;
  if (approvalPolicy.resumeAfterDecision === true || isRecord(source.resumeCursor)) {
    out.resumePolicy = '同意后接着当前进度继续';
  }
  return out;
}

function firstRecord(...values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    if (isRecord(value)) return value;
  }
  return null;
}

function publicExecutionBoundary(contract: string | null): string | null {
  if (!contract) return null;
  if (/approval_required|dry_run|audit/i.test(contract)) {
    return '需要先预览，并由你确认后继续';
  }
  if (/blocked/i.test(contract)) return '这个动作已被安全边界拦截';
  return null;
}

function publicV2ProcessType(type: string): string {
  if (type.startsWith('tool.')) return 'tool_progress';
  if (type.startsWith('slot.')) return 'slot_memory';
  if (type.startsWith('approval.')) return 'approval';
  if (type.startsWith('candidate_search.')) return 'candidate_search';
  if (type === 'opportunity_card.created') return 'opportunity_card';
  if (type === 'memory.saved') return 'memory';
  if (type === 'safety_check.done') return 'safety';
  if (type.startsWith('run.')) return 'run';
  return 'visible_process';
}

function processTypeForV2Surface(
  event: Extract<UserFacingAgentStreamEvent, { eventId: string }>,
  processType: string,
): string {
  if (processType === 'approval') return 'approval';
  if (event.type === 'assistant.delta') return processType;
  return 'run_summary';
}

function progressIdForV2(event: Extract<UserFacingAgentStreamEvent, { eventId: string }>): string {
  const processType = publicV2ProcessType(event.type);
  if (processType !== 'approval' && event.type !== 'assistant.delta') {
    return 'social-codex:summary';
  }
  if (processType === 'run') return 'social-codex:run';
  if (processType === 'visible_process') return `social-codex:${publicV2StageId(event.stage)}`;
  return `social-codex:${publicV2ProcessId(processType)}`;
}

function publicV2StageId(stage: string): string {
  if (stage === 'detect_social_intent') return 'intent';
  if (stage === 'hydrate_context') return 'context';
  if (stage === 'profile_gate') return 'profile';
  if (stage === 'slot_filling') return 'slots';
  if (stage === 'create_opportunity_card') return 'opportunity';
  if (stage === 'publish_to_discover') return 'discover';
  if (stage === 'search_candidates') return 'candidates';
  if (stage === 'safety_filter') return 'safety';
  if (stage === 'rank_candidates') return 'ranking';
  if (stage === 'generate_opener') return 'opener';
  if (stage === 'approval') return 'approval';
  if (stage === 'send_invite') return 'invite';
  if (stage === 'life_graph_writeback') return 'memory';
  return 'progress';
}

function publicV2ProcessId(processType: string): string {
  return processType.replace(/_/g, '-').replace(/[^a-z0-9:-]+/g, '-') || 'progress';
}

function sanitizePublicV2DisplayText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const mappedInternalName = publicProcessLabelForInternalName(value);
  if (mappedInternalName) return mappedInternalName;
  if (containsSensitivePublicV2Text(value)) return null;
  if (containsTechnicalV2Text(value)) return null;
  const sanitized = sanitizePublicProcessText(value);
  if (!sanitized) return null;
  return sanitized;
}

function v2ProcessState(
  event: Extract<UserFacingAgentStreamEvent, { eventId: string }>,
): SocialCodexProcessState {
  const displayState = event.display?.state;
  if (displayState === 'failed') return 'failed';
  if (displayState === 'waiting') return 'waiting';
  if (displayState === 'done') return 'done';
  if (event.type === 'run.failed') return 'failed';
  if (
    event.type === 'run.completed' ||
    event.type === 'tool.done' ||
    event.type === 'slot.completed' ||
    event.type === 'approval.resolved' ||
    event.type === 'candidate_search.done' ||
    event.type === 'safety_check.done' ||
    event.type === 'opportunity_card.created' ||
    event.type === 'memory.saved'
  ) {
    return 'done';
  }
  if (event.type === 'approval.required') return 'waiting';
  return 'running';
}

const TECHNICAL_NEXT_STEP_WORD = ['plan', 'ner'].join('');
const TECHNICAL_TRACE_WORD = ['trace', 'id'].join('');
const TECHNICAL_RAW_STRUCTURED_WORD = ['raw', '\\s+', 'json'].join('');
const TECHNICAL_NEXT_STEP_RE = new RegExp(`\\b${TECHNICAL_NEXT_STEP_WORD}\\b`, 'i');
const TECHNICAL_NEXT_STEP_RE_GLOBAL = new RegExp(
  `\\b${TECHNICAL_NEXT_STEP_WORD}\\b`,
  'gi',
);
const TECHNICAL_TRACE_RE = new RegExp(`\\b${TECHNICAL_TRACE_WORD}\\b`, 'i');
const TECHNICAL_TRACE_RE_GLOBAL = new RegExp(`\\b${TECHNICAL_TRACE_WORD}\\b`, 'gi');
const TECHNICAL_RAW_STRUCTURED_RE = new RegExp(
  `\\b${TECHNICAL_RAW_STRUCTURED_WORD}\\b`,
  'i',
);
const TECHNICAL_RAW_STRUCTURED_RE_GLOBAL = new RegExp(
  `\\b${TECHNICAL_RAW_STRUCTURED_WORD}\\b`,
  'gi',
);

function containsTechnicalV2Text(value: string): boolean {
  const normalized = value.toLowerCase();
  return [
    /\bvisible_process\.delta\b/,
    /\bassistant\.delta\b/,
    /\btool\.(started|progress|done)\b/,
    /\bslot\.(filled|completed)\b/,
    /\bmemory\.saved\b/,
    /\bapproval\.(required|resolved)\b/,
    /\brun\.(started|completed|failed)\b/,
    /\bhydrate_context\b/,
    /\bslot_filling\b/,
    /\btool[_\s-]?call\w*\b/,
    /\btool[_\s-]?result\w*\b/,
    TECHNICAL_NEXT_STEP_RE,
    TECHNICAL_TRACE_RE,
    /\brunid\b/,
    /\bpayload\b/,
    TECHNICAL_RAW_STRUCTURED_RE,
    /\bdebug\b/,
    /\binternal\b/,
  ].some((pattern) => pattern.test(normalized));
}

function publicScalar(value: unknown): string | number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (
    new RegExp(
      ['trace', TECHNICAL_NEXT_STEP_WORD, 'raw', 'debug', 'stack', 'internal'].join(
        '|',
      ),
      'i',
    ).test(trimmed)
  ) {
    return null;
  }
  if (containsSensitivePublicV2Text(trimmed)) return null;
  return trimmed.slice(0, 80);
}

function sanitizePublicV2Text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (containsSensitivePublicV2Text(trimmed)) return null;
  const sanitizedProcessText = sanitizePublicProcessText(trimmed);
  if (!sanitizedProcessText) return null;
  if (sanitizedProcessText !== trimmed) return sanitizedProcessText;
  const normalized = trimmed.toLowerCase();
  const technicalMatches = [
    /\bhydrate_context\b/,
    /\bslot_filling\b/,
    /\btool[_\s-]?call\w*\b/,
    /\btool[_\s-]?result\w*\b/,
    TECHNICAL_NEXT_STEP_RE,
    TECHNICAL_TRACE_RE,
    /\brunid\b/,
    /\bpayload\b/,
    TECHNICAL_RAW_STRUCTURED_RE,
    /\bdebug\b/,
    /\binternal\b/,
  ].filter((pattern) => pattern.test(normalized)).length;
  if (technicalMatches >= 1 && !/[\u4e00-\u9fff]/.test(trimmed)) return null;
  const withoutForbidden = trimmed
    .replace(/\bhydrate_context\b/gi, '读取上下文')
    .replace(/\bslot_filling\b/gi, '补齐信息')
    .replace(/\btool[_\s-]?call\w*\b/gi, '处理步骤')
    .replace(/\btool[_\s-]?result\w*\b/gi, '处理结果')
    .replace(TECHNICAL_NEXT_STEP_RE_GLOBAL, '下一步')
    .replace(TECHNICAL_TRACE_RE_GLOBAL, '')
    .replace(/\brunid\b/gi, '')
    .replace(/\bpayload\b/gi, '')
    .replace(TECHNICAL_RAW_STRUCTURED_RE_GLOBAL, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!withoutForbidden) return null;
  return withoutForbidden.slice(0, 160);
}

function containsSensitivePublicV2Text(value: string): boolean {
  return [
    /\b1[3-9]\d{9}\b/,
    /\b(?:wechat|weixin|wx|vx)\b/i,
    /微信|电话|手机号|联系方式|门牌|单元|楼栋|宿舍|寝室/,
    /经度|纬度|坐标|定位|导航|地图链接|高德|百度地图|腾讯地图/,
    /\b(?:amap|gaode|baidu|qq\.com\/map|geo:)/i,
    /[-+]?(?:[1-8]?\d(?:\.\d{4,})?|90(?:\.0{4,})?)\s*[,，]\s*[-+]?(?:1[0-7]\d|\d{1,2}|180)(?:\.\d{4,})?/,
  ].some((pattern) => pattern.test(value));
}

function publicSlotSummary(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const labels = [
    publicSlotValue(record.time_window),
    publicSlotValue(record.activity),
    publicSlotValue(record.location_text ?? record.geo_area),
    publicSlotValue(record.intensity),
    publicSlotValue(record.candidate_preference),
    publicSlotValue(record.safety_boundary),
  ]
    .filter((item): item is string | number => item !== null)
    .map(String);
  return labels.length > 0 ? labels.join('、').slice(0, 120) : null;
}

function publicSlotSummaryFromPayload(payload: Record<string, unknown> | undefined): string | null {
  if (!isRecord(payload)) return null;
  return (
    publicSlotSummary(payload.slots) ??
    publicSlotSummary(payload.taskSlots) ??
    publicKnownSlotConstraintSummary(payload.knownTaskSlotConstraints) ??
    publicKnownSlotConstraintSummary(payload.taskSlotConstraints) ??
    publicKnownSlotConstraintSummary(payload.knownSlots)
  );
}

function publicKnownSlotConstraintSummary(value: unknown): string | null {
  const knownSlots = publicKnownSlotArray(value);
  if (!knownSlots) return null;
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const slot of knownSlots) {
    const slotValue = publicKnownSlotValue(slot);
    if (slotValue === null) continue;
    const label = String(slotValue);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels.length > 0 ? labels.join('、').slice(0, 120) : null;
}

function publicKnownSlotArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return null;
  if (Array.isArray(value.knownSlots)) return value.knownSlots;
  if (Array.isArray(value.slots)) return value.slots;
  return null;
}

function publicKnownSlotValue(value: unknown): string | number | null {
  if (isRecord(value) && !Array.isArray(value)) {
    return (
      publicSlotValue(value.value) ??
      publicSlotValue(value.displayValue) ??
      publicSlotValue(value.summary)
    );
  }
  return publicSlotValue(value);
}

function publicSlotValue(value: unknown): string | number | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return publicScalar((value as Record<string, unknown>).value);
  }
  return publicScalar(value);
}

function kindFromV2(
  event: Extract<UserFacingAgentStreamEvent, { eventId: string }>,
): 'analysis' | 'tool' | 'status' {
  if (
    event.type.startsWith('tool.') ||
    event.type.startsWith('candidate_search') ||
    event.type === 'opportunity_card.created'
  ) {
    return 'tool';
  }
  if (
    event.type.includes('approval') ||
    event.type.includes('memory') ||
    event.type.includes('slot')
  ) {
    return 'status';
  }
  return 'analysis';
}

function progressStateFromV2(
  state?: 'running' | 'done' | 'waiting' | 'failed',
): 'running' | 'done' | 'failed' | 'waiting' {
  if (state === 'done') return 'done';
  if (state === 'failed') return 'failed';
  if (state === 'waiting') return 'waiting';
  return 'running';
}

function lifecycleFromV2Stage(stage: string): AgentLifecycle {
  if (stage === 'hydrate_context' || stage === 'profile_gate') return 'reading_life_graph';
  if (stage === 'search_candidates') return 'searching_candidates';
  if (stage === 'rank_candidates') return 'ranking_matches';
  if (stage === 'safety_filter') return 'checking_safety';
  if (stage === 'generate_opener') return 'drafting_opener';
  if (stage === 'approval') return 'waiting_confirmation';
  if (stage === 'life_graph_writeback') return 'completed';
  return 'analyzing_intent';
}

function taskIdFromStreamEvent(event: UserFacingAgentStreamEvent): number | null {
  if (event.type === 'status') {
    return readPositiveNumber(event.taskId);
  }
  if (isSocialAgentEventV2(event)) {
    return readPositiveNumber(event.taskId);
  }
  if (event.type === 'result') {
    return findTaskId(event.result);
  }
  return null;
}

function readLifeGraphFactCount(payload: Record<string, unknown> | undefined): number | null {
  if (Array.isArray(payload?.lifeGraphFacts)) return payload.lifeGraphFacts.length;
  return readPositiveNumber(payload?.factCount);
}

function publicLifeGraphFactSummary(payload: Record<string, unknown> | undefined): string | null {
  if (!Array.isArray(payload?.lifeGraphFacts)) return null;
  const lines = payload.lifeGraphFacts
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const fact = item as Record<string, unknown>;
      const label = sanitizePublicV2Text(fact.label);
      const value = sanitizePublicV2Text(fact.displayValue);
      if (!label || !value) return null;
      return `${label}：${value}`;
    })
    .filter((item): item is string => Boolean(item));
  if (lines.length === 0) return null;
  return lines.slice(0, 3).join('；').slice(0, 180);
}

function readPositiveNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function progressStateFromStatus(
  status?: string | null,
): 'running' | 'done' | 'failed' | 'waiting' {
  if (status === 'done' || status === 'succeeded' || status === 'success') return 'done';
  if (status === 'failed' || status === 'error') return 'failed';
  if (status === 'waiting' || status === 'blocked') return 'waiting';
  return 'running';
}

function safeProgressId(value: unknown, fallback: string): string {
  const raw = typeof value === 'string' && value.trim() ? value : fallback;
  return (
    raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._:-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'step-unknown'
  );
}

function toRunResponse(
  response: UserFacingAgentResponse,
  restoredTaskId?: number | null,
): AgentRunResponse {
  return {
    response,
    lifecycle: lifecycleFromResponse(response),
    taskId: restoredTaskId ?? findTaskId(response) ?? null,
  };
}

function toRunResponsePreferTask(
  response: UserFacingAgentResponse,
  taskId: number | null,
): AgentRunResponse {
  return {
    response,
    lifecycle: lifecycleFromResponse(response),
    taskId,
  };
}

function findTaskId(response: UserFacingAgentResponse): number | null {
  const responseTaskId = Number(response.taskId);
  if (Number.isFinite(responseTaskId) && responseTaskId > 0) {
    return responseTaskId;
  }
  for (const card of response.cards) {
    const taskId = Number(card.data.taskId ?? card.data.agentTaskId);
    if (Number.isFinite(taskId) && taskId > 0) return taskId;
    for (const action of card.actions) {
      const actionTaskId = Number(action.payload?.taskId ?? action.payload?.agentTaskId);
      if (Number.isFinite(actionTaskId) && actionTaskId > 0) return actionTaskId;
    }
  }
  return null;
}

function responseFromSessionSnapshot(
  snapshot: UserFacingAgentSessionSnapshot,
): UserFacingAgentResponse | null {
  if (!snapshot.hasSession) return null;
  const raw = snapshot.result;
  if (!isRecord(raw)) return null;
  if (isUserFacingAgentResponse(raw)) return raw;
  const cards = Array.isArray(raw.cards) ? raw.cards : [];
  if (typeof raw.assistantMessage !== 'string' && cards.length === 0) return null;
  const permissionMode =
    readPermissionMode(raw.permissionMode) ??
    readPermissionMode(snapshot.task?.permissionMode) ??
    'limited_auto';
  return {
    assistantMessage: typeof raw.assistantMessage === 'string' ? raw.assistantMessage : '',
    lightStatus: inferLightStatus(raw, cards),
    cards: cards as UserFacingAgentResponse['cards'],
    safeStatus: isSafeStatus(raw.safeStatus)
      ? raw.safeStatus
      : {
          blocked: false,
          level: 'low',
          boundaryNotes: [],
          requiredConfirmations: [],
        },
    pendingConfirmations: Array.isArray(raw.pendingConfirmations)
      ? (raw.pendingConfirmations as UserFacingAgentResponse['pendingConfirmations'])
      : [],
    permissionMode,
    lifeGraphWritebackProposal: isRecord(raw.lifeGraphWritebackProposal)
      ? raw.lifeGraphWritebackProposal
      : undefined,
    workflow: isRecord(raw.workflow)
      ? (raw.workflow as unknown as UserFacingAgentResponse['workflow'])
      : undefined,
  };
}

function readLifecycle(value: unknown): AgentLifecycle | null {
  if (!isRecord(value)) return null;
  const lifecycle = value.lifecycle;
  return isAgentLifecycle(lifecycle) ? lifecycle : null;
}

function isAgentLifecycle(value: unknown): value is AgentLifecycle {
  return (
    value === 'received' ||
    value === 'idle' ||
    value === 'input_focused' ||
    value === 'user_submitted' ||
    value === 'analyzing_intent' ||
    value === 'reading_life_graph' ||
    value === 'searching_candidates' ||
    value === 'ranking_matches' ||
    value === 'checking_safety' ||
    value === 'drafting_opener' ||
    value === 'waiting_confirmation' ||
    value === 'completed' ||
    value === 'failed'
  );
}

function isUserFacingAgentResponse(value: unknown): value is UserFacingAgentResponse {
  if (!isRecord(value)) return false;
  return (
    typeof value.assistantMessage === 'string' &&
    typeof value.lightStatus === 'string' &&
    Array.isArray(value.cards) &&
    isSafeStatus(value.safeStatus) &&
    Array.isArray(value.pendingConfirmations) &&
    readPermissionMode(value.permissionMode) !== null
  );
}

function isSafeStatus(value: unknown): value is UserFacingAgentResponse['safeStatus'] {
  return (
    isRecord(value) &&
    typeof value.blocked === 'boolean' &&
    typeof value.level === 'string' &&
    Array.isArray(value.boundaryNotes) &&
    Array.isArray(value.requiredConfirmations)
  );
}

function readPermissionMode(value: unknown): SocialAgentPermissionMode | null {
  if (
    value === 'assist' ||
    value === 'confirm' ||
    value === 'manual_confirm' ||
    value === 'limited_auto' ||
    value === 'open' ||
    value === 'lab'
  ) {
    return value;
  }
  return null;
}

function inferLightStatus(
  raw: Record<string, unknown>,
  cards: unknown[],
): UserFacingAgentResponse['lightStatus'] {
  if (isSafeStatus(raw.safeStatus) && (raw.safeStatus.blocked || raw.safeStatus.level !== 'low')) {
    return '正在检查安全边界';
  }
  if (cards.some((card) => isRecord(card) && card.status === 'waiting_confirmation')) {
    return '正在等待你确认';
  }
  if (cards.some((card) => isRecord(card) && card.type === 'opener_approval')) {
    return '正在等待你确认';
  }
  if (cards.some((card) => isRecord(card) && card.type === 'candidate_card')) {
    return '正在筛选公开可发现的人';
  }
  return '正在理解你的需求';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
