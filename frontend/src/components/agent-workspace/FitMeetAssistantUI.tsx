import {
  type AppendMessage,
  AssistantRuntimeProvider,
  ExportedMessageRepository,
  WebSpeechDictationAdapter,
  useExternalStoreRuntime,
  type ThreadAssistantMessagePart,
  type ThreadMessageLike,
  type ThreadUserMessagePart,
} from '@assistant-ui/react';
import { type FormEvent, type ReactNode, useMemo } from 'react';

import type {
  FitMeetAlphaCard,
  FitMeetAgentThreadSummary,
  SocialAgentProfileGateStatus,
  SocialAgentReminderPreference,
  SocialAgentReminderPreferenceInput,
  UserFacingAgentResponse,
} from '../../api/socialAgentApi';
import { AssistantShell } from '../assistant-ui/assistant-shell';
import {
  FitMeetToolUIActionsProvider,
  type FitMeetToolActionInput,
} from '../assistant-ui/tool-ui-actions';
import { fitMeetAttachmentAdapter } from './fitMeetAttachmentAdapter';
import type {
  FitMeetAssistantAttachment,
  FitMeetAssistantMessage,
  FitMeetAssistantRecovery,
  FitMeetAssistantStep,
} from './FitMeetAssistantUI.types';

if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.scrollTo) {
  HTMLElement.prototype.scrollTo = function scrollToPolyfill() {
    return undefined;
  };
}

export type FitMeetAssistantUIProps = {
  messages: FitMeetAssistantMessage[];
  threads: FitMeetAgentThreadSummary[];
  threadsLoading: boolean;
  activeThreadId: string | null;
  steps: FitMeetAssistantStep[];
  isRunning: boolean;
  sessionRestoring: boolean;
  recovery?: FitMeetAssistantRecovery | null;
  profileGate?: SocialAgentProfileGateStatus | null;
  requiresAuth?: boolean;
  onSubmit: (
    event?: FormEvent,
    prompt?: string,
    attachments?: FitMeetAssistantAttachment[],
  ) => void;
  onStop: () => void;
  onReloadLast: () => void;
  onFeedback: (messageId: string, value: 'positive' | 'negative') => void;
  onBranchSwitch: (messageId: string, direction: 'previous' | 'next') => void;
  onNewConversation: () => void;
  onThreadSelect: (threadId: string) => void;
  onThreadRename: (threadId: string, title: string) => Promise<void> | void;
  onThreadDelete: (threadId: string) => Promise<void> | void;
  onLogin?: () => void;
  onRetryRecovery?: () => void;
  onDismissRecovery?: () => void;
  reminderPreference?: SocialAgentReminderPreference | null;
  reminderLoading?: boolean;
  reminderSaving?: boolean;
  reminderError?: string | null;
  focusReminderSettings?: boolean;
  onToggleReminders?: () => Promise<void> | void;
  onDisableReminders?: () => Promise<void> | void;
  onDismissReminder?: (reminderId: number | string) => Promise<void> | void;
  onUpdateReminderPreference?: (
    nextSettings: SocialAgentReminderPreferenceInput,
  ) => Promise<void> | void;
  onApproveApproval?: (approvalId: number) => Promise<void> | void;
  onRejectApproval?: (approvalId: number) => Promise<void> | void;
  onResumeState?: (input?: FitMeetToolActionInput) => Promise<void> | void;
  onRetryTool?: (input?: FitMeetToolActionInput) => Promise<void> | void;
  onReplayState?: (input?: FitMeetToolActionInput) => Promise<void> | void;
  onForkState?: (input?: FitMeetToolActionInput) => Promise<void> | void;
  onCardAction?: (input?: FitMeetToolActionInput) => Promise<void> | void;
};

type FitMeetAssistantRuntimeProviderProps = {
  children: ReactNode;
  messages: FitMeetAssistantMessage[];
  threads: FitMeetAgentThreadSummary[];
  threadsLoading: boolean;
  activeThreadId: string | null;
  steps: FitMeetAssistantStep[];
  isRunning: boolean;
  onSubmit: (
    event?: FormEvent,
    prompt?: string,
    attachments?: FitMeetAssistantAttachment[],
  ) => void;
  onStop: () => void;
  onReloadLast: () => void;
  onFeedback: (messageId: string, value: 'positive' | 'negative') => void;
  onNewConversation: () => void;
  onThreadSelect: (threadId: string) => void;
  onThreadRename: (threadId: string, title: string) => Promise<void> | void;
  onThreadDelete: (threadId: string) => Promise<void> | void;
};

const ASSISTANT_STREAMING_PLACEHOLDER = '\u200b';
const FITMEET_ASSISTANT_TOOL_SCHEMA_VERSION = 'fitmeet.tool-ui.v1';

const dictationAdapter =
  typeof window !== 'undefined' && WebSpeechDictationAdapter.isSupported()
    ? new WebSpeechDictationAdapter({
        language: 'zh-CN',
        continuous: true,
        interimResults: true,
      })
    : undefined;

function FitMeetAssistantRuntimeProvider({
  children,
  messages,
  threads,
  threadsLoading,
  activeThreadId,
  steps,
  isRunning,
  onSubmit,
  onStop,
  onReloadLast,
  onFeedback,
  onNewConversation,
  onThreadSelect,
  onThreadRename,
  onThreadDelete,
}: FitMeetAssistantRuntimeProviderProps) {
  const messageRepository = useMemo(
    () => buildFitMeetMessageRepository(messages, steps),
    [messages, steps],
  );
  const threadListAdapter = useMemo(
    () => ({
      threadId: activeThreadId ?? undefined,
      isLoading: threadsLoading,
      threads: threads.map((thread) => ({
        status: 'regular' as const,
        id: thread.id,
        remoteId: thread.id,
        externalId: String(thread.taskId),
        title: thread.title || thread.goal || '未命名对话',
        custom: {
          ...thread.custom,
          fitmeetTaskId: thread.taskId,
          fitmeetThreadId: thread.threadId,
          preview: thread.preview,
          updatedAt: thread.updatedAt,
          createdAt: thread.createdAt,
          messageCount: thread.messageCount,
          branch: thread.branch,
        },
      })),
      onSwitchToNewThread: async () => {
        onNewConversation();
      },
      onSwitchToThread: async (threadId: string) => {
        onThreadSelect(threadId);
      },
      onRename: async (threadId: string, title: string) => {
        await onThreadRename(threadId, title);
      },
      onDelete: async (threadId: string) => {
        await onThreadDelete(threadId);
      },
    }),
    [
      activeThreadId,
      onNewConversation,
      onThreadDelete,
      onThreadRename,
      onThreadSelect,
      threads,
      threadsLoading,
    ],
  );

  const runtime = useExternalStoreRuntime<FitMeetAssistantMessage>({
    messageRepository,
    convertMessage: (message, index) => convertFitMeetMessage(message, index, messages, steps),
    isRunning,
    onNew: async (message) => {
      const text = appendMessageText(message);
      if (text) onSubmit(undefined, text, appendMessageAttachments(message));
    },
    onEdit: async (message) => {
      const text = appendMessageText(message);
      if (text) onSubmit(undefined, text, appendMessageAttachments(message));
    },
    onReload: async () => {
      onReloadLast();
    },
    onCancel: async () => {
      onStop();
    },
    adapters: {
      attachments: fitMeetAttachmentAdapter,
      dictation: dictationAdapter,
      threadList: threadListAdapter,
      feedback: {
        submit: ({ message, type }) => {
          onFeedback(message.id, type);
        },
      },
    },
    unstable_capabilities: {
      copy: true,
    },
  });

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}

export function FitMeetAssistantUI(props: FitMeetAssistantUIProps) {
  const {
    onApproveApproval,
    onForkState,
    onRejectApproval,
    onResumeState,
    onReplayState,
    onRetryTool,
    onCardAction,
  } = props;
  const toolActions = useMemo(
    () => ({
      onApproveApproval: async (input: FitMeetToolActionInput) => {
        const approvalId = numberFromUnknown(input.approvalId);
        if (approvalId && onApproveApproval) await onApproveApproval(approvalId);
      },
      onRejectApproval: async (input: FitMeetToolActionInput) => {
        const approvalId = numberFromUnknown(input.approvalId);
        if (approvalId && onRejectApproval) await onRejectApproval(approvalId);
      },
      onResumeState,
      onRetryTool,
      onReplayState,
      onForkState,
      onCardAction,
    }),
    [
      onApproveApproval,
      onCardAction,
      onForkState,
      onRejectApproval,
      onReplayState,
      onResumeState,
      onRetryTool,
    ],
  );
  const liveProcessStatus = useMemo(() => inlineVisibleProcessStatus(props.steps), [props.steps]);
  const processStatusOwnedByMessage = useMemo(() => {
    const lastIndex = props.messages.length - 1;
    const lastMessage = props.messages[lastIndex];
    if (!lastMessage) return false;
    return shouldRenderProcessPart(lastMessage, lastIndex, props.messages, props.steps);
  }, [props.messages, props.steps]);

  return (
    <FitMeetAssistantRuntimeProvider
      messages={props.messages}
      threads={props.threads}
      threadsLoading={props.threadsLoading}
      activeThreadId={props.activeThreadId}
      steps={props.steps}
      isRunning={props.isRunning}
      onSubmit={props.onSubmit}
      onStop={props.onStop}
      onReloadLast={props.onReloadLast}
      onFeedback={props.onFeedback}
      onNewConversation={props.onNewConversation}
      onThreadSelect={props.onThreadSelect}
      onThreadRename={props.onThreadRename}
      onThreadDelete={props.onThreadDelete}
    >
      <FitMeetToolUIActionsProvider value={toolActions}>
        <AssistantShell
          messages={props.messages}
          threads={props.threads}
          threadsLoading={props.threadsLoading}
          activeThreadId={props.activeThreadId}
          isRunning={props.isRunning}
          liveProcessStatus={liveProcessStatus}
          processStatusOwnedByMessage={processStatusOwnedByMessage}
          sessionRestoring={props.sessionRestoring}
          recovery={props.recovery}
          profileGate={props.profileGate}
          requiresAuth={props.requiresAuth}
          onBranchSwitch={props.onBranchSwitch}
          onFeedback={props.onFeedback}
          onNewConversation={props.onNewConversation}
          onThreadRename={props.onThreadRename}
          onThreadDelete={props.onThreadDelete}
          onLogin={props.onLogin}
          onRetryRecovery={props.onRetryRecovery}
          onDismissRecovery={props.onDismissRecovery}
          reminderPreference={props.reminderPreference}
          reminderLoading={props.reminderLoading}
          reminderSaving={props.reminderSaving}
          reminderError={props.reminderError}
          focusReminderSettings={props.focusReminderSettings}
          onToggleReminders={props.onToggleReminders}
          onDisableReminders={props.onDisableReminders}
          onDismissReminder={props.onDismissReminder}
          onUpdateReminderPreference={props.onUpdateReminderPreference}
        />
      </FitMeetToolUIActionsProvider>
    </FitMeetAssistantRuntimeProvider>
  );
}

function buildFitMeetMessageRepository(
  messages: FitMeetAssistantMessage[],
  steps: FitMeetAssistantStep[],
) {
  let previousHeadId: string | null = null;
  let currentUserId: string | null = null;
  let currentBranchGroupId: string | null = null;
  const branchActiveIndexes = new Map<string, number>();

  for (const message of messages) {
    if (message.role === 'assistant' && message.branchable !== false && message.branch?.groupId) {
      branchActiveIndexes.set(
        message.branch.groupId,
        message.branch.activeIndex ?? message.branch.count,
      );
    }
  }

  const items = messages.map((message, index) => {
    let parentId = previousHeadId;
    if (message.role === 'user') {
      currentUserId = message.id;
      currentBranchGroupId = `branch-${message.id}`;
      parentId = previousHeadId;
      previousHeadId = message.id;
    } else if (message.role === 'assistant') {
      if (message.branchable === false || message.surfaceKind === 'recovery') {
        parentId = previousHeadId;
        previousHeadId = message.id;
        return {
          parentId,
          message: convertFitMeetMessage(message, index, messages, steps),
        };
      }
      const groupId = message.branch?.groupId ?? currentBranchGroupId;
      const branchParentId = groupId?.startsWith('branch-')
        ? groupId.slice('branch-'.length)
        : currentUserId;
      parentId = message.branch && branchParentId ? branchParentId : previousHeadId;
      const activeIndex =
        message.branch && groupId
          ? (branchActiveIndexes.get(groupId) ?? message.branch.count)
          : null;
      const isActiveBranch =
        !message.branch || !activeIndex || message.branch.index === activeIndex;
      if (isActiveBranch) previousHeadId = message.id;
    }

    return {
      parentId,
      message: convertFitMeetMessage(message, index, messages, steps),
    };
  });

  return ExportedMessageRepository.fromBranchableArray(items, {
    headId: previousHeadId,
  });
}

function convertFitMeetMessage(
  message: FitMeetAssistantMessage,
  index: number,
  messages: FitMeetAssistantMessage[],
  steps: FitMeetAssistantStep[],
): ThreadMessageLike {
  const content: ThreadAssistantMessagePart[] = [];
  const isStreamingAssistant = message.role === 'assistant' && message.status === 'streaming';
  const isThinkingPlaceholder = message.content === ASSISTANT_STREAMING_PLACEHOLDER;
  const hasVisibleText = message.content.trim().length > 0 && !isThinkingPlaceholder;
  const assistantCards =
    message.result && message.showSocialResult === true
      ? assistantCardsForResult(message.result)
      : [];
  const visibleProcessSteps = compactAssistantProcessSteps(steps);
  const processHistorySteps = compactAssistantProcessHistorySteps(steps);
  const visibleProcessSummary = visibleProcessSummaryForMessage(
    message,
    visibleSummaryFromProcessStep(primaryVisibleProcessStep(visibleProcessSteps)),
  );
  if (hasVisibleText) {
    content.push({ type: 'text', text: message.content });
  } else if (isStreamingAssistant) {
    content.push({ type: 'text', text: ASSISTANT_STREAMING_PLACEHOLDER });
  }
  if (shouldRenderProcessPart(message, index, messages, steps)) {
    content.push({
      type: 'data',
      name: 'fitmeet-process',
      data: {
        schemaVersion: FITMEET_ASSISTANT_TOOL_SCHEMA_VERSION,
        schemaType: 'agent.process',
        title: '正在处理',
        runtime: message.result?.runtime ?? null,
        visibleSummary: visibleProcessSummary,
        steps: visibleProcessSteps.map((step) => ({
          id: step.id,
          label: step.label,
          status: step.status,
          detail: step.detail,
          kind: step.kind,
          processType: step.processType,
          agentName: step.agentName ?? undefined,
          metadata: step.metadata,
          snapshot: step.snapshot,
        })),
        historySteps: processHistorySteps.map((step) => ({
          id: step.id,
          label: step.label,
          status: step.status,
          detail: step.detail,
          kind: step.kind,
          processType: step.processType,
          agentName: step.agentName ?? undefined,
          metadata: step.metadata,
          snapshot: step.snapshot,
        })),
      },
    });
  }
  if (
    message.role === 'assistant' &&
    message.result &&
    message.result.pendingConfirmations.length > 0
  ) {
    content.push({
      type: 'data',
      name: 'fitmeet-approval',
      data: {
        schemaVersion: FITMEET_ASSISTANT_TOOL_SCHEMA_VERSION,
        schemaType: 'safety.approval',
        title: '需要确认',
        runtime: message.result.runtime ?? null,
        pendingConfirmations: message.result.pendingConfirmations,
        resolvedApproval: message.resolvedApproval ?? null,
        safeStatus: message.result.safeStatus,
      },
    });
  }
  if (
    message.role === 'assistant' &&
    message.result &&
    message.showSocialResult === true &&
    assistantCards.length > 0
  ) {
    content.push({
      type: 'data',
      name: 'fitmeet-cards',
      data: {
        schemaVersion: FITMEET_ASSISTANT_TOOL_SCHEMA_VERSION,
        schemaType: 'agent.result_cards',
        title: '整理出的可用结果',
        runtime: message.result.runtime ?? null,
        cards: assistantCards,
      },
    });
  }
  return {
    id: message.id,
    role: message.role,
    content,
    attachments: message.attachments?.map((attachment) => ({
      id: attachment.id,
      type: attachment.type,
      name: attachment.name ?? 'attachment',
      contentType: attachment.contentType,
      content: attachment.content ?? [],
      status: { type: 'complete' },
    })),
    createdAt: new Date(),
    status:
      message.role === 'assistant'
        ? message.status === 'streaming'
          ? { type: 'running' }
          : { type: 'complete', reason: 'stop' }
        : undefined,
    metadata: {
      submittedFeedback:
        message.feedbackStatus === 'submitted' && message.feedback
          ? { type: message.feedback }
          : undefined,
      custom: {
        fitmeetMessageId: message.id,
        fitmeetTaskId: message.taskId,
        fitmeetTraceId: message.traceId,
        fitmeetAssistantMessageSource: message.assistantMessageSource,
        fitmeetBranch: message.branch,
        fitmeetFeedback: message.feedback,
        fitmeetReminderId: message.reminderId,
        fitmeetReminderContext: message.reminderContext,
        feedbackStatus: message.feedbackStatus,
        feedbackErrorValue: message.feedbackErrorValue,
        fitmeetThinking:
          isStreamingAssistant && !hasVisibleText && message.conversationIntent === 'conversation',
      },
    },
  } satisfies ThreadMessageLike;
}

function shouldRenderProcessPart(
  message: FitMeetAssistantMessage,
  index: number,
  messages: FitMeetAssistantMessage[],
  steps: FitMeetAssistantStep[],
) {
  if (message.role !== 'assistant') return false;
  if (index !== messages.length - 1) return false;
  if (isInitialConversationThinking(message, steps)) return false;
  if (!steps.some((step) => step.status !== 'pending')) return false;
  if (hasUserVisibleSocialCodexTrace(steps)) return true;
  if (message.conversationIntent !== 'conversation') return true;
  return hasResumableRuntime(message.result?.runtime);
}

function compactAssistantProcessSteps(steps: FitMeetAssistantStep[]) {
  const visible = steps.filter((step) => step.status !== 'pending');
  const latestApproval =
    [...visible]
      .reverse()
      .find((step) => step.processType === 'approval' && step.status !== 'success') ?? null;
  if (latestApproval) return [latestApproval];

  const latestRunSummary = [...visible].reverse().find(isRunSummaryFitMeetStep) ?? null;
  if (latestRunSummary) return [latestRunSummary];

  const latestActive =
    [...visible]
      .reverse()
      .find(
        (step) => step.status === 'running' || step.status === 'waiting' || step.status === 'error',
      ) ??
    visible.at(-1) ??
    null;
  return latestActive ? [latestActive] : [];
}

function compactAssistantProcessHistorySteps(steps: FitMeetAssistantStep[]) {
  const visible = steps.filter((step) => step.status !== 'pending');
  const latestRunSummary = [...visible].reverse().find(isRunSummaryFitMeetStep) ?? null;
  const latestApproval =
    [...visible]
      .reverse()
      .find((step) => step.processType === 'approval' && step.status !== 'success') ?? null;
  if (latestRunSummary && !latestApproval) {
    return [];
  }
  if (visible.length <= 4) return visible;

  const latestActive =
    [...visible]
      .reverse()
      .find(
        (step) => step.status === 'running' || step.status === 'waiting' || step.status === 'error',
      ) ??
    visible.at(-1) ??
    null;
  const deduped = new Map<string, FitMeetAssistantStep>();
  if (latestActive) {
    deduped.set(processStepKey(latestActive), latestActive);
  }

  for (const step of [...visible].reverse()) {
    if (deduped.size >= 4) break;
    if (latestActive && step.id === latestActive.id) continue;
    if (step.status !== 'success') continue;
    const key = processStepKey(step);
    if (deduped.has(key)) continue;
    deduped.set(key, step);
  }

  return Array.from(deduped.values());
}

function processStepKey(step: FitMeetAssistantStep) {
  return [
    step.processType ?? 'process',
    step.kind ?? 'step',
    step.label.replace(/\s+/g, ' ').trim(),
    step.detail?.replace(/\s+/g, ' ').trim() ?? '',
  ].join(':');
}

function isRunSummaryFitMeetStep(step: FitMeetAssistantStep) {
  return step.processType === 'run_summary' || step.metadata?.processType === 'run_summary';
}

function primaryVisibleProcessStep(steps: FitMeetAssistantStep[]) {
  return steps.find(isRunSummaryFitMeetStep) ?? steps[0] ?? null;
}

function visibleSummaryFromProcessStep(step: FitMeetAssistantStep | null) {
  if (!step) return null;
  const metadata = step.metadata ?? {};
  const processType =
    typeof metadata.processType === 'string' ? metadata.processType : step.processType;
  const isActionableOrRecoverableProcess =
    step.status === 'waiting' ||
    step.status === 'error' ||
    metadata.pendingApproval === true ||
    processType === 'approval';
  const shouldUseCoveringStatus =
    metadata.displayMode === 'covering_status' ||
    processType === 'run_summary' ||
    processType === 'visible_process' ||
    processType === 'slot_memory' ||
    processType === 'candidate_search' ||
    step.kind === 'status' ||
    step.kind === 'analysis' ||
    step.kind === 'tool';
  const shouldCollapseHistory = shouldUseCoveringStatus && !isActionableOrRecoverableProcess;
  return {
    source:
      typeof metadata.source === 'string'
        ? metadata.source
        : isRunSummaryFitMeetStep(step)
          ? 'run.summary'
          : 'visible_process.delta',
    title: step.label,
    detail: step.detail ?? null,
    state:
      step.status === 'success'
        ? 'completed'
        : step.status === 'error'
          ? 'failed'
          : step.status === 'waiting'
            ? 'waiting'
            : 'running',
    currentStage: typeof metadata.currentStage === 'string' ? metadata.currentStage : null,
    currentEventId: typeof metadata.currentEventId === 'string' ? metadata.currentEventId : null,
    currentSeq: typeof metadata.currentSeq === 'number' ? metadata.currentSeq : null,
    visibleStepCount:
      typeof metadata.visibleStepCount === 'number' ? metadata.visibleStepCount : null,
    expandable: metadata.expandable === true,
    pendingApproval: metadata.pendingApproval === true,
    candidateCount: typeof metadata.candidateCount === 'number' ? metadata.candidateCount : null,
    activityCount: typeof metadata.activityCount === 'number' ? metadata.activityCount : null,
    hasOpportunityCard: metadata.hasOpportunityCard === true,
    savedMemory: metadata.savedMemory === true,
    displayMode: shouldUseCoveringStatus ? 'covering_status' : null,
    updateModel:
      metadata.updateModel === 'latest_state' || shouldUseCoveringStatus ? 'latest_state' : null,
    defaultVisibleCount:
      typeof metadata.defaultVisibleCount === 'number'
        ? metadata.defaultVisibleCount
        : shouldUseCoveringStatus
          ? 1
          : null,
    historyVisibility:
      metadata.historyVisibility === 'collapsed' || shouldCollapseHistory ? 'collapsed' : null,
  };
}

function visibleProcessSummaryForMessage(
  message: FitMeetAssistantMessage,
  summary: ReturnType<typeof visibleSummaryFromProcessStep>,
) {
  const pendingApproval = Boolean(message.result?.pendingConfirmations?.length);
  if (pendingApproval) {
    return {
      ...summary,
      source: summary?.source ?? 'result.pending_approval',
      title: summary?.state === 'waiting' ? summary.title : '需要你确认这一步',
      detail: summary?.detail ?? '我会等你选择后再继续，不会自动执行高风险动作。',
      state: 'waiting' as const,
      pendingApproval: true,
      historyVisibility: null,
    };
  }

  const runtime = message.result?.runtime;
  const checkpointAction =
    runtime && typeof runtime === 'object' && 'checkpointAction' in runtime
      ? runtime.checkpointAction
      : null;
  if (checkpointAction === 'retry') {
    return {
      ...summary,
      source: summary?.source ?? 'result.checkpoint',
      title: '这一步没有完成',
      detail:
        summary?.detail ??
        summary?.title ??
        '可以从保存点重试，不会重复执行已确认的高风险动作。',
      state: 'failed' as const,
      historyVisibility: null,
    };
  }

  return summary;
}

function inlineVisibleProcessStatus(steps: FitMeetAssistantStep[]) {
  const visibleProcessSteps = compactAssistantProcessSteps(steps);
  const step = primaryVisibleProcessStep(visibleProcessSteps);
  if (!step) return null;
  const summary = visibleSummaryFromProcessStep(step);
  const title = stringFromUnknown(summary?.title) ?? stringFromUnknown(step.label);
  const detail = stringFromUnknown(summary?.detail) ?? stringFromUnknown(step.detail);
  const state = summary?.state;

  if (state === 'waiting') {
    return title || detail || '需要你确认这一步';
  }
  if (state === 'failed') {
    return title || detail || '这一步没有处理好，可以重试';
  }
  if (title) return title;
  return detail;
}

function hasUserVisibleSocialCodexTrace(steps: FitMeetAssistantStep[]) {
  return steps.some((step) => {
    if (step.status === 'pending') return false;
    if (!step.processType) return false;
    return step.processType !== 'run';
  });
}

function hasResumableRuntime(runtime: UserFacingAgentResponse['runtime'] | undefined | null) {
  if (!runtime) return false;
  return Boolean(runtime.checkpointId || runtime.canResume || runtime.canReplay || runtime.canFork);
}

function isInitialConversationThinking(
  message: FitMeetAssistantMessage,
  steps: FitMeetAssistantStep[],
) {
  if (message.conversationIntent !== 'conversation') return false;
  const activeSteps = steps.filter((step) => step.status !== 'pending');
  return (
    activeSteps.length === 1 &&
    activeSteps[0]?.id === 'understand' &&
    activeSteps[0]?.status === 'running' &&
    !activeSteps[0]?.detail
  );
}

function toToolUICard(card: FitMeetAlphaCard): Record<string, unknown> {
  return {
    schemaVersion: FITMEET_ASSISTANT_TOOL_SCHEMA_VERSION,
    id: card.id,
    type: card.type,
    schemaType: card.data.schemaType,
    title: card.title,
    body: card.body,
    status: card.status,
    data: card.data,
    actions: card.actions,
  };
}

function assistantCardsForResult(result: UserFacingAgentResponse): Record<string, unknown>[] {
  const cards = result.cards.map(toToolUICard);
  const lifeGraphCard = lifeGraphWritebackProposalToCard(result.lifeGraphWritebackProposal);
  return lifeGraphCard ? [...cards, lifeGraphCard] : cards;
}

function lifeGraphWritebackProposalToCard(
  proposal: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!isRecord(proposal)) return null;
  const signals = Array.isArray(proposal.proposedSignals)
    ? proposal.proposedSignals.filter(isRecord)
    : [];
  const summarySignal = signals.find((signal) => signal.field === 'meetLoop.replySummary');
  const fieldLabels = signals
    .map((signal) => stringFromUnknown(signal.label) ?? stringFromUnknown(signal.field))
    .filter((value): value is string => Boolean(value));
  const sourceSignals = signals
    .map((signal) => {
      const label = stringFromUnknown(signal.label) ?? stringFromUnknown(signal.field);
      const value = stringFromUnknown(signal.value);
      return label && value ? `${label}：${value}` : value;
    })
    .filter((value): value is string => Boolean(value));
  const proposalId =
    stringFromUnknown(proposal.messageId) ??
    stringFromUnknown(proposal.conversationId) ??
    'reply-writeback';

  return {
    id: `life-graph-writeback-${proposalId}`,
    type: 'profile_proposal',
    schemaVersion: FITMEET_ASSISTANT_TOOL_SCHEMA_VERSION,
    schemaType: 'life_graph.diff',
    title: '画像更新建议',
    body: stringFromUnknown(summarySignal?.value) ?? '我整理出一条可确认的互动信号。',
    status: 'waiting_confirmation',
    data: {
      schemaName: 'LifeGraphDiffCard',
      schemaVersion: FITMEET_ASSISTANT_TOOL_SCHEMA_VERSION,
      schemaType: 'life_graph.diff',
      writebackProposalId: proposalId,
      taskId: proposal.taskId,
      conversationId: proposal.conversationId,
      messageId: proposal.messageId,
      candidateUserId: proposal.candidateUserId,
      source: stringFromUnknown(proposal.source) ?? 'counterpart_reply',
      before: '等待你确认后再查看长期画像影响',
      after: stringFromUnknown(summarySignal?.value) ?? '保存这次脱敏互动信号',
      proposedFields: fieldLabels,
      sensitivityLevel: stringFromUnknown(proposal.sensitivityLevel) ?? 'medium',
      sourceSignals,
      confirmationBoundary: stringFromUnknown(proposal.confirmationBoundary),
      privacyBoundary: stringFromUnknown(proposal.privacyBoundary),
      memoryBoundary: stringFromUnknown(proposal.privacyBoundary),
      revokeHint: stringFromUnknown(proposal.revokeHint),
    },
    actions: [
      {
        id: `accept-${proposalId}`,
        label: '保留为推荐信号',
        action: 'life_graph.accept_update',
        schemaAction: 'life_graph.accept_update',
        requiresConfirmation: true,
        payload: {
          source: 'counterpart_reply',
          canCorrect: true,
          canRevoke: true,
          taskId: proposal.taskId,
          writebackProposalId: proposalId,
          conversationId: proposal.conversationId,
          messageId: proposal.messageId,
          candidateUserId: proposal.candidateUserId,
          proposedSignals: signals,
        },
      },
      {
        id: `reject-${proposalId}`,
        label: '暂不写入',
        action: 'life_graph.reject_update',
        schemaAction: 'life_graph.reject_update',
        requiresConfirmation: false,
        payload: {
          source: 'counterpart_reply',
          canCorrect: true,
          canRevoke: true,
          taskId: proposal.taskId,
          writebackProposalId: proposalId,
          conversationId: proposal.conversationId,
          messageId: proposal.messageId,
          candidateUserId: proposal.candidateUserId,
        },
      },
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringFromUnknown(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function appendMessageText(message: AppendMessage): string {
  return message.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('\n')
    .trim();
}

function appendMessageAttachments(message: AppendMessage): FitMeetAssistantAttachment[] {
  return (message.attachments ?? []).map((attachment) => ({
    id: attachment.id,
    type: attachment.type === 'image' ? 'image' : 'file',
    name: attachment.name,
    contentType: attachment.contentType,
    content: attachment.content as ThreadUserMessagePart[] | undefined,
  }));
}

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}
