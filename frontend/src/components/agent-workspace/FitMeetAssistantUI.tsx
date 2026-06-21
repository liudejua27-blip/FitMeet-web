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
import { agentCardIdentityHints } from './agentCardIdentity';

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
  onApproveApproval?: (
    approvalId: number,
    context?: {
      messageId?: string | null;
      cardId?: string | null;
      inline?: boolean;
    },
  ) => Promise<UserFacingAgentResponse | void> | UserFacingAgentResponse | void;
  onRejectApproval?: (
    approvalId: number,
    context?: {
      inline?: boolean;
    },
  ) => Promise<void> | void;
  onResumeState?: (input?: FitMeetToolActionInput) => Promise<void> | void;
  onRetryTool?: (input?: FitMeetToolActionInput) => Promise<void> | void;
  onReplayState?: (input?: FitMeetToolActionInput) => Promise<void> | void;
  onForkState?: (input?: FitMeetToolActionInput) => Promise<void> | void;
  onCardAction?: (
    input?: FitMeetToolActionInput,
  ) => Promise<UserFacingAgentResponse | void> | UserFacingAgentResponse | void;
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
        if (approvalId && onApproveApproval) {
          return await onApproveApproval(approvalId, {
            messageId: input.messageId ?? null,
            cardId: input.cardId ?? null,
            inline: Boolean(input.messageId || input.cardId),
          });
        }
        return undefined;
      },
      onRejectApproval: async (input: FitMeetToolActionInput) => {
        const approvalId = numberFromUnknown(input.approvalId);
        if (approvalId && onRejectApproval) {
          await onRejectApproval(approvalId, {
            inline: Boolean(input.messageId || input.cardId),
          });
        }
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
  const pendingConfirmations = message.result?.pendingConfirmations ?? [];
  const {
    cards: assistantCardsWithInlineApprovals,
    standaloneConfirmations,
  } = attachPendingConfirmationsToAssistantCards(assistantCards, pendingConfirmations);
  const visibleProcessSteps = compactAssistantProcessSteps(steps);
  const checkpointRuntimeSteps = processStepsFromRuntime(message.result?.runtime, message.content);
  const resultProcessSteps = processStepsFromResult(message.result);
  const runtimeProcessSteps =
    checkpointRuntimeSteps.length > 0 && !hasActionableProcessSteps(visibleProcessSteps)
      ? checkpointRuntimeSteps
      : visibleProcessSteps.length > 0
        ? visibleProcessSteps
        : checkpointRuntimeSteps.length > 0
          ? checkpointRuntimeSteps
          : resultProcessSteps;
  const processHistorySteps =
    steps.some((step) => step.status !== 'pending')
      ? compactAssistantProcessHistorySteps(steps)
      : runtimeProcessSteps;
  const visibleProcessSummary = visibleProcessSummaryForMessage(
    message,
    visibleSummaryFromProcessStep(primaryVisibleProcessStep(runtimeProcessSteps)),
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
        steps: runtimeProcessSteps.map((step) => ({
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
    standaloneConfirmations.length > 0
  ) {
    content.push({
      type: 'data',
      name: 'fitmeet-approval',
      data: {
        schemaVersion: FITMEET_ASSISTANT_TOOL_SCHEMA_VERSION,
        schemaType: 'safety.approval',
        title: '需要确认',
        runtime: message.result.runtime ?? null,
        pendingConfirmations: standaloneConfirmations,
        resolvedApproval: message.resolvedApproval ?? null,
        safeStatus: message.result.safeStatus,
      },
    });
  }
  if (
    message.role === 'assistant' &&
    message.result &&
    message.showSocialResult === true &&
    assistantCardsWithInlineApprovals.length > 0
  ) {
    content.push({
      type: 'data',
      name: 'fitmeet-cards',
      data: {
        schemaVersion: FITMEET_ASSISTANT_TOOL_SCHEMA_VERSION,
        schemaType: 'agent.result_cards',
        title: '整理出的可用结果',
        runtime: message.result.runtime ?? null,
        cards: assistantCardsWithInlineApprovals,
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
        taskId: message.taskId,
        fitmeetThreadId:
          stringFromUnknown(message.result?.runtime?.threadId) ??
          (message.taskId ? `agent-task:${message.taskId}` : null),
        threadId:
          stringFromUnknown(message.result?.runtime?.threadId) ??
          (message.taskId ? `agent-task:${message.taskId}` : null),
        fitmeetRunId: message.runId ?? stringFromUnknown(message.result?.runtime?.runId),
        runId: message.runId ?? stringFromUnknown(message.result?.runtime?.runId),
        fitmeetAssistantRunMessageId:
          message.messageId ?? stringFromUnknown(message.result?.runtime?.messageId),
        fitmeetTraceId: message.traceId,
        fitmeetAssistantMessageSource: message.assistantMessageSource,
        fitmeetBranch: message.branch,
        fitmeetCreatesBranch: message.createsBranch === true,
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
  if (
    !steps.some((step) => step.status !== 'pending') &&
    !hasResumableRuntime(message.result?.runtime) &&
    !message.result?.cards.some(isAssistantVisibleResultCard) &&
    !message.result?.pendingConfirmations.length
  ) {
    return false;
  }
  if (
    message.status !== 'streaming' &&
    hasFinalAssistantSurface(message) &&
    !hasActionableProcessSurface(message, steps) &&
    !message.result?.cards.some(isAssistantVisibleResultCard)
  ) {
    return false;
  }
  if (hasUserVisibleSocialCodexTrace(steps)) return true;
  if (message.conversationIntent !== 'conversation') return true;
  return hasResumableRuntime(message.result?.runtime);
}

function hasFinalAssistantSurface(message: FitMeetAssistantMessage) {
  if (message.content.trim().length > 0 && message.content !== ASSISTANT_STREAMING_PLACEHOLDER) {
    return true;
  }
  if (message.result?.cards.length) return true;
  return false;
}

function hasActionableProcessSurface(
  message: FitMeetAssistantMessage,
  steps: FitMeetAssistantStep[],
) {
  if (message.result?.pendingConfirmations.length) return true;
  if (hasResumableRuntime(message.result?.runtime)) return true;
  return steps.some((step) => {
    if (step.status === 'waiting' || step.status === 'error') return true;
    const processType =
      typeof step.metadata?.processType === 'string'
        ? step.metadata.processType
        : step.processType;
    return (
      processType === 'approval' ||
      step.metadata?.pendingApproval === true ||
      step.metadata?.checkpointAction === 'retry'
    );
  });
}

function hasActionableProcessSteps(steps: FitMeetAssistantStep[]) {
  return steps.some((step) => step.status === 'waiting' || step.status === 'error');
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
  const visible = dedupeAssistantProcessHistorySteps(
    steps.filter((step) => step.status !== 'pending'),
  );
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

function dedupeAssistantProcessHistorySteps(steps: FitMeetAssistantStep[]) {
  const byKey = new Map<string, FitMeetAssistantStep>();
  for (const step of steps) {
    byKey.set(processStepKey(step), step);
  }
  return Array.from(byKey.values());
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
      title: summary?.state === 'waiting' ? summary.title : '需要你确认后继续',
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
      title: '刚才连接不稳',
      detail:
        summary?.detail ??
        summary?.title ??
        '我保留了这段需求，可以继续处理，不会重复执行已确认的高风险动作。',
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
    return title || detail || '需要你确认后继续';
  }
  if (state === 'failed') {
    return title || detail || '刚才连接不稳，可以继续';
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

function processStepsFromRuntime(
  runtime: UserFacingAgentResponse['runtime'] | undefined | null,
  assistantText: string,
): FitMeetAssistantStep[] {
  if (!hasResumableRuntime(runtime) || !isRecord(runtime)) return [];
  const resumeCursor = isRecord(runtime.resumeCursor) ? runtime.resumeCursor : null;
  const checkpointAction =
    stringFromUnknown(runtime.checkpointAction) ?? stringFromUnknown(resumeCursor?.action);
  const stepId = stringFromUnknown(resumeCursor?.stepId) ?? 'checkpoint';
  const retryable = checkpointAction === 'retry';
  const label = retryable ? '刚才连接不稳' : '可以继续处理';
  const detail =
    retryable
      ? '我保留了这段需求，可以从当前进度继续。'
      : '可以重新整理这一段，或换一种方案继续。';
  return [
    {
      id: stepId,
      label,
      detail: assistantText.trim() ? detail : undefined,
      status: retryable ? 'error' : 'success',
      kind: 'tool',
      processType: 'checkpoint',
      metadata: {
        checkpointAction: checkpointAction ?? (runtime.canFork ? 'replay' : 'retry'),
        processType: 'checkpoint',
        displayMode: 'covering_status',
        updateModel: 'latest_state',
        historyVisibility: 'collapsed',
        defaultVisibleCount: 1,
      },
    },
  ];
}

function processStepsFromResult(
  result: UserFacingAgentResponse | undefined | null,
): FitMeetAssistantStep[] {
  if (!result) return [];
  if (result.pendingConfirmations.length > 0 || result.safeStatus.blocked) {
    return [
      {
        id: 'approval',
        label: '需要你确认后继续',
        detail: '确认前不会执行真实动作。',
        status: 'waiting',
        kind: 'status',
        processType: 'approval',
        metadata: {
          processType: 'approval',
          displayMode: 'covering_status',
          updateModel: 'latest_state',
          historyVisibility: 'collapsed',
          pendingApproval: true,
          defaultVisibleCount: 1,
        },
      },
    ];
  }
  if (result.cards.some(isAssistantVisibleResultCard)) {
    return [
      {
        id: 'result-ready',
        label: '已整理合适机会',
        detail: '你可以先看结论，细节已放在卡片里。',
        status: 'success',
        kind: 'status',
        processType: 'run_summary',
        metadata: {
          processType: 'run_summary',
          displayMode: 'covering_status',
          updateModel: 'latest_state',
          historyVisibility: 'collapsed',
          defaultVisibleCount: 1,
          hasOpportunityCard: result.cards.some((card) => card.type === 'activity_plan'),
          candidateCount: result.cards.filter((card) => card.type === 'candidate_card').length,
        },
      },
    ];
  }
  return [];
}

function isAssistantVisibleResultCard(card: FitMeetAlphaCard) {
  return (
    card.type === 'candidate_card' ||
    card.type === 'activity_plan' ||
    card.type === 'activity_status' ||
    card.type === 'checkin_card' ||
    card.type === 'review_card' ||
    card.schemaType === 'social_match.candidate' ||
    card.schemaType === 'social_match.activity' ||
    card.schemaType === 'meet_loop.timeline' ||
    card.schemaType === 'life_graph.diff' ||
    card.schemaType === 'safety.approval'
  );
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

type PendingConfirmation = UserFacingAgentResponse['pendingConfirmations'][number];

// eslint-disable-next-line react-refresh/only-export-components
export function attachPendingConfirmationsToAssistantCards(
  cards: Record<string, unknown>[],
  confirmations: PendingConfirmation[],
) {
  const userVisibleConfirmations = dedupePendingCardConfirmations(
    confirmations.filter((confirmation) => !isLowRiskCardConfirmation(confirmation)),
  );
  if (cards.length === 0 || userVisibleConfirmations.length === 0) {
    return { cards, standaloneConfirmations: userVisibleConfirmations };
  }

  const used = new Set<number>();
  const cardsWithInlineApprovals = cards.map((card) => {
    const matches = userVisibleConfirmations
      .map((confirmation, index) => ({ confirmation, index }))
      .filter(
        ({ confirmation, index }) =>
          !used.has(index) &&
          confirmationCanLiveInsideCard(card, confirmation, cards),
      );
    if (matches.length === 0) return card;

    matches.forEach(({ index }) => used.add(index));
    const data = isRecord(card.data) ? card.data : {};
    const inlineApprovalConfirmations = matches.reduce<Record<string, unknown>>(
      (out, { confirmation }) => {
        const actionKey = inlineApprovalActionKeyForCard(card, confirmation);
        out[actionKey] = chooseInlineCardConfirmation(out[actionKey], {
          ...confirmation,
          actionKey,
        });
        return out;
      },
      isRecord(data.inlineApprovalConfirmations)
        ? { ...data.inlineApprovalConfirmations }
        : {},
    );
    const firstInlineApproval = Object.values(inlineApprovalConfirmations)[0];
    return {
      ...card,
      data: {
        ...data,
        inlineApprovalConfirmation: firstInlineApproval,
        inlineApprovalConfirmations,
      },
    };
  });

  const standaloneConfirmations = userVisibleConfirmations.filter((_, index) => {
    if (used.has(index)) return false;
    return true;
  });

  return { cards: cardsWithInlineApprovals, standaloneConfirmations };
}

function chooseInlineCardConfirmation(
  current: unknown,
  next: Record<string, unknown>,
): Record<string, unknown> {
  if (!isRecord(current)) return next;
  const currentId = primitiveStringFromUnknown(current.id);
  const nextId = primitiveStringFromUnknown(next.id);
  if (!currentId && nextId) return next;
  if (currentId && !nextId) return current;
  const currentRisk = riskPriority(current.riskLevel);
  const nextRisk = riskPriority(next.riskLevel);
  return nextRisk >= currentRisk ? next : current;
}

function riskPriority(value: unknown) {
  const risk = primitiveStringFromUnknown(value)?.toLowerCase();
  if (risk === 'critical') return 4;
  if (risk === 'high') return 3;
  if (risk === 'medium') return 2;
  if (risk === 'low') return 1;
  return 0;
}

function dedupePendingCardConfirmations(confirmations: PendingConfirmation[]) {
  const seen = new Set<string>();
  const result: PendingConfirmation[] = [];
  for (const confirmation of confirmations) {
    const key = pendingCardConfirmationKey(confirmation);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(confirmation);
  }
  return result;
}

function pendingCardConfirmationKey(confirmation: PendingConfirmation) {
  const id = primitiveStringFromUnknown(confirmation.id);
  if (id) return `approval:${id}`;
  const actionType =
    primitiveStringFromUnknown(confirmation.actionType) ??
    primitiveStringFromUnknown(confirmation.type) ??
    inlineApprovalActionKeyFromConfirmation(confirmation);
  const targetKey = pendingCardConfirmationTargetKey(confirmation);
  if (actionType || targetKey) {
    return ['pending', actionType, targetKey].filter(Boolean).join(':');
  }
  const summary = stringFromUnknown(confirmation.summary)
    ?.normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .slice(0, 120);
  return summary ? `summary:${summary}` : null;
}

function pendingCardConfirmationTargetKey(confirmation: PendingConfirmation) {
  const record = confirmation as unknown as Record<string, unknown>;
  const payload = isRecord(record.payload) ? record.payload : {};
  const candidateId = firstPrimitiveString(
    record.candidateRecordId,
    record.socialRequestCandidateId,
    record.targetUserId,
    record.candidateUserId,
    record.userId,
    payload.candidateRecordId,
    payload.socialRequestCandidateId,
    payload.targetUserId,
    payload.candidateUserId,
    payload.userId,
  );
  if (candidateId) return `candidate:${candidateId}`;
  const opportunityId = firstPrimitiveString(
    record.opportunityId,
    record.activityId,
    record.publicIntentId,
    record.socialRequestId,
    payload.opportunityId,
    payload.activityId,
    payload.publicIntentId,
    payload.socialRequestId,
  );
  if (opportunityId) {
    const taskId = firstPrimitiveString(record.taskId, payload.taskId);
    return taskId ? `opportunity:${taskId}:${opportunityId}` : `opportunity:${opportunityId}`;
  }
  const taskId = firstPrimitiveString(record.taskId, payload.taskId);
  return taskId ? `task:${taskId}` : null;
}

function inlineApprovalActionKeyFromConfirmation(confirmation: PendingConfirmation) {
  const actionType = stringFromUnknown(confirmation.actionType)?.toLowerCase() ?? '';
  if (/connect|friend|candidate/.test(actionType)) return 'candidate.connect';
  if (/send|message|invite|opener/.test(actionType)) return 'opener.confirm_send';
  if (/publish|social_request|activity|meet/.test(actionType)) return 'activity.confirm_create';
  const text = confirmationSearchText(confirmation);
  if (/opener|send|message|invite|发送|邀请/.test(text)) return 'opener.confirm_send';
  if (/connect|friend|candidate|好友|连接|候选/.test(text)) return 'candidate.connect';
  if (/publish|social_request|发现|发布|约练|活动/.test(text)) return 'activity.confirm_create';
  return null;
}

function confirmationCanLiveInsideCard(
  card: Record<string, unknown>,
  confirmation: PendingConfirmation,
  allCards: Record<string, unknown>[],
) {
  const schemaType = schemaTypeFromToolCard(card);
  const text = confirmationSearchText(confirmation);
  if (!isHighRiskCardConfirmation(confirmation)) return false;
  if (schemaType === 'social_match.candidate') {
    if (
      !/candidate|connect|friend|invite|message|send|contact|候选|好友|邀请|发送|私信|联系/.test(
        text,
      )
    ) {
      return false;
    }
    if (cardSharesConfirmationIdentity(card, confirmation)) return true;
    if (cardTextHints(card).some((hint) => text.includes(hint))) return true;
    return allCards.filter((item) => schemaTypeFromToolCard(item) === 'social_match.candidate')
      .length === 1;
  }
  if (schemaType === 'social_match.activity') {
    if (
      !/publish|social_request|activity|meet|create|location|发现|发布|约练|活动|位置/.test(
        text,
      )
    ) {
      return false;
    }
    if (cardSharesConfirmationIdentity(card, confirmation)) return true;
    if (cardTextHints(card).some((hint) => text.includes(hint))) return true;
    return allCards.filter((item) => schemaTypeFromToolCard(item) === 'social_match.activity')
      .length === 1;
  }
  if (schemaType === 'meet_loop.timeline') {
    return /invite|message|connect|activity|meet|邀请|发送|连接|约练|改期/.test(
      text,
    );
  }
  if (schemaType === 'safety.approval') return true;
  return false;
}

function cardSharesConfirmationIdentity(
  card: Record<string, unknown>,
  confirmation: PendingConfirmation,
) {
  const cardKeys = new Set(agentCardIdentityHints(card as unknown as FitMeetAlphaCard));
  if (cardKeys.size === 0) return false;
  return confirmationIdentityHints(confirmation).some((key) => cardKeys.has(key));
}

function confirmationIdentityHints(confirmation: PendingConfirmation): string[] {
  const record = confirmation as unknown as Record<string, unknown>;
  const payload = isRecord(record.payload) ? record.payload : {};
  const values = [
    record.candidateRecordId,
    record.socialRequestCandidateId,
    record.targetUserId,
    record.candidateUserId,
    record.userId,
    record.opportunityId,
    record.activityId,
    record.publicIntentId,
    record.socialRequestId,
    payload.candidateRecordId,
    payload.socialRequestCandidateId,
    payload.targetUserId,
    payload.candidateUserId,
    payload.userId,
    payload.opportunityId,
    payload.activityId,
    payload.publicIntentId,
    payload.socialRequestId,
  ];
  return Array.from(
    new Set(
      values
        .map((value) => primitiveStringFromUnknown(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function cardTextHints(card: Record<string, unknown>): string[] {
  const data = isRecord(card.data) ? card.data : {};
  const opportunity = isRecord(data.opportunity) ? data.opportunity : {};
  const candidate = isRecord(data.candidate) ? data.candidate : {};
  const values = [
    card.title,
    data.displayName,
    data.name,
    data.nickname,
    opportunity.title,
    opportunity.name,
    opportunity.displayName,
    opportunity.nickname,
    candidate.title,
    candidate.name,
    candidate.displayName,
    candidate.nickname,
  ];
  return Array.from(
    new Set(
      values
        .map((value) => stringFromUnknown(value)?.toLowerCase())
        .filter((value): value is string => Boolean(value && value.length >= 2)),
    ),
  );
}

function inlineApprovalActionKeyForCard(
  card: Record<string, unknown>,
  confirmation: PendingConfirmation,
) {
  const schemaType = schemaTypeFromToolCard(card);
  const actionType = stringFromUnknown(confirmation.actionType)?.toLowerCase() ?? '';
  if (/connect|friend|candidate/.test(actionType)) return 'candidate.connect';
  if (/send|message|invite|opener/.test(actionType)) return 'opener.confirm_send';
  if (/publish|social_request|activity|meet/.test(actionType)) return 'activity.confirm_create';
  const text = confirmationSearchText(confirmation);
  if (schemaType === 'social_match.activity') return 'activity.confirm_create';
  if (/opener|send|message|invite|发送|邀请/.test(text)) return 'opener.confirm_send';
  if (/connect|friend|candidate|好友|连接|候选/.test(text)) return 'candidate.connect';
  if (/publish|social_request|发现|发布/.test(text)) return 'activity.confirm_create';
  return 'candidate.connect';
}

function schemaTypeFromToolCard(card: Record<string, unknown>) {
  const data = isRecord(card.data) ? card.data : {};
  return stringFromUnknown(card.schemaType) ?? stringFromUnknown(data.schemaType);
}

function isLowRiskCardConfirmation(confirmation: PendingConfirmation) {
  const text = confirmationSearchText(confirmation);
  if (isHighRiskCardConfirmation(confirmation)) return false;
  if (/save|like|favorite|collect|bookmark|收藏|喜欢|保存/.test(text)) return true;
  return (
    /generate_opener|draft|草稿/.test(text) ||
    (/opener|开场白/.test(text) &&
      !/confirm|send|message|invite|connect|publish|contact|location|确认|发送|私信|邀请|连接|好友|发布|联系|位置/.test(
        text,
      ))
  );
}

function isHighRiskCardConfirmation(confirmation: PendingConfirmation) {
  const actionType = stringFromUnknown(confirmation.actionType)?.trim().toLowerCase();
  if (
    actionType &&
    /^(candidate\.like|candidate\.generate_opener|candidate\.view_detail|candidate\.skip|candidate\.more_like_this|save_candidate|generate_opener|draft_opener)$/i.test(
      actionType,
    )
  ) {
    return false;
  }
  const text = confirmationSearchText(confirmation);
  return /publish|social_request|connect_candidate|candidate\.connect|friend|send_invite|opener\.confirm_send|send|message|invite|contact|location|precise|exchange|create|公开|发布|加好友|好友|连接|发送|私信|邀请|联系方式|精确位置|创建/.test(
    text,
  );
}

function confirmationSearchText(confirmation: PendingConfirmation) {
  const record = confirmation as unknown as Record<string, unknown>;
  const payload = isRecord(record.payload) ? record.payload : {};
  return [
    stringFromUnknown(record.title),
    stringFromUnknown(record.label),
    stringFromUnknown(record.goal),
    stringFromUnknown(confirmation.type),
    stringFromUnknown(confirmation.actionType),
    stringFromUnknown(confirmation.summary),
    stringFromUnknown(confirmation.riskLevel),
    stringFromUnknown(payload.title),
    stringFromUnknown(payload.label),
    stringFromUnknown(payload.name),
    stringFromUnknown(payload.displayName),
    stringFromUnknown(payload.nickname),
    stringFromUnknown(payload.candidateName),
    stringFromUnknown(payload.candidateDisplayName),
    stringFromUnknown(payload.targetName),
    stringFromUnknown(payload.targetDisplayName),
    stringFromUnknown(payload.summary),
    stringFromUnknown(payload.actionType),
    stringFromUnknown(payload.action),
  ]
    .join(' ')
    .toLowerCase();
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

function primitiveStringFromUnknown(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function firstPrimitiveString(...values: unknown[]) {
  return values.map((value) => primitiveStringFromUnknown(value)).find(Boolean) ?? null;
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
