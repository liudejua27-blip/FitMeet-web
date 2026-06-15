import {
  type AppendMessage,
  AssistantRuntimeProvider,
  ExportedMessageRepository,
  WebSpeechDictationAdapter,
  useExternalStoreRuntime,
  type AttachmentAdapter,
  type PendingAttachment,
  type ThreadAssistantMessagePart,
  type ThreadMessageLike,
  type ThreadUserMessagePart,
} from '@assistant-ui/react';
import { type FormEvent, type ReactNode, useMemo } from 'react';

import { uploadImageWithProgress, uploadVideoWithProgress } from '../../api/uploadApi';
import type {
  FitMeetAlphaCard,
  FitMeetAgentThreadSummary,
  SocialAgentProfileGateStatus,
  SocialAgentReminderPreference,
  SocialAgentReminderPreferenceInput,
  UserFacingAgentProgressKind,
  UserFacingAgentResponse,
} from '../../api/socialAgentApi';
import { AssistantShell } from '../assistant-ui/assistant-shell';
import {
  FitMeetToolUIActionsProvider,
  type FitMeetToolActionInput,
} from '../assistant-ui/tool-ui-actions';
import {
  FITMEET_TOOL_UI_SCHEMA_VERSION,
  normalizeAssistantCard,
  type SchemaDrivenAssistantCard,
} from '../assistant-ui/tool-ui-schema';
import { uploadProgressStore } from '../assistant-ui/upload-progress-store';

if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.scrollTo) {
  HTMLElement.prototype.scrollTo = function scrollToPolyfill() {
    return undefined;
  };
}

export type FitMeetAssistantMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: FitMeetAssistantAttachment[];
  status?: 'streaming' | 'done' | 'error';
  result?: UserFacingAgentResponse | null;
  taskId?: number | null;
  runId?: string | null;
  traceId?: string | null;
  feedback?: 'positive' | 'negative' | null;
  feedbackStatus?: 'submitting' | 'submitted' | 'failed' | null;
  feedbackErrorValue?: 'positive' | 'negative' | null;
  showSocialResult?: boolean;
  conversationIntent?: 'conversation' | 'social' | 'approval';
  reminderId?: number | string | null;
  reminderContext?: Record<string, unknown> | null;
  resolvedApproval?: {
    id: number | string | null;
    decision: 'approved' | 'rejected';
    summary?: string | null;
  } | null;
  branch?: {
    groupId: string;
    index: number;
    count: number;
    activeIndex?: number;
    syncStatus?: 'idle' | 'syncing' | 'synced' | 'failed';
  };
};

export type FitMeetAssistantAttachment = {
  id: string;
  type: 'image' | 'file';
  name?: string;
  contentType?: string;
  content?: ThreadUserMessagePart[];
};

export type FitMeetAssistantStep = {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'success' | 'waiting' | 'error';
  kind?: UserFacingAgentProgressKind;
  agentName?: string | null;
  detail?: string;
  snapshot?: {
    schemaVersion: 'fitmeet.step-snapshot.v1';
    observation?: string[];
    critique?: string;
    result?: string;
  };
};

export type FitMeetAssistantRecovery = {
  kind:
    | 'failed'
    | 'stopped'
    | 'action_failed'
    | 'checkpoint_failed'
    | 'checkpoint_available'
    | 'missing_info'
    | 'unauthorized'
    | 'safety';
  title: string;
  message: string;
  prompt: string;
  retryable: boolean;
  checkpoint?: {
    checkpointId: number | string;
    stepId?: string | null;
    action: 'resume' | 'retry' | 'replay' | 'fork';
    steps?: Array<{
      stepId: string;
      label: string;
      status: string | null;
      retryable: boolean;
      replayable: boolean;
      forkable: boolean;
    }>;
  };
};

type FitMeetAssistantUIProps = {
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

const fitMeetAttachmentAdapter: AttachmentAdapter = {
  accept: 'image/*,video/*',
  async add({ file }) {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      throw new Error('当前聊天仅支持图片和视频附件。');
    }
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `fitmeet-upload-${crypto.randomUUID()}`
        : `fitmeet-upload-${Date.now()}`;
    uploadProgressStore.set(id, { status: 'queued', percent: 0 });
    uploadProgressStore.registerRetry(id, () => startFitMeetAttachmentUpload(id, file));
    void startFitMeetAttachmentUpload(id, file);
    return {
      id,
      type: file.type.startsWith('image/') ? 'image' : 'file',
      name: file.name,
      contentType: file.type,
      file,
      status: { type: 'requires-action', reason: 'composer-send' },
    } satisfies PendingAttachment;
  },
  async remove(attachment) {
    forgetFitMeetAttachment(attachment.id);
  },
  async send(attachment) {
    const file = attachment.file;
    if (!file) throw new Error('附件文件不可用，请重新添加。');
    return completeFitMeetAttachment(attachment);
  },
};

const dictationAdapter =
  typeof window !== 'undefined' && WebSpeechDictationAdapter.isSupported()
    ? new WebSpeechDictationAdapter({
        language: 'zh-CN',
        continuous: true,
        interimResults: true,
      })
    : undefined;

const uploadedAttachmentContent = new Map<
  string,
  {
    type: PendingAttachment['type'];
    content: ThreadUserMessagePart[];
  }
>();
const uploadInFlight = new Map<string, Promise<void>>();

function startFitMeetAttachmentUpload(id: string, file: File) {
  const existing = uploadInFlight.get(id);
  if (existing) return existing;
  uploadProgressStore.set(id, { status: 'uploading', percent: 0 });
  const uploadPromise = (async () => {
    try {
      if (file.type.startsWith('image/')) {
        const uploaded = await uploadImageWithProgress(file, {
          onProgress: (progress) =>
            uploadProgressStore.set(id, {
              status: 'uploading',
              percent: progress.percent,
            }),
        });
        uploadedAttachmentContent.set(id, {
          type: 'image',
          content: [
            {
              type: 'image',
              image: uploaded.url,
              filename: file.name,
            },
          ],
        });
        uploadProgressStore.set(id, { status: 'uploaded', percent: 100 });
        return;
      }
      if (file.type.startsWith('video/')) {
        const uploaded = await uploadVideoWithProgress(file, {
          onProgress: (progress) =>
            uploadProgressStore.set(id, {
              status: 'uploading',
              percent: progress.percent,
            }),
        });
        uploadedAttachmentContent.set(id, {
          type: 'file',
          content: [
            {
              type: 'file',
              data: uploaded.url,
              filename: file.name,
              mimeType: file.type,
            },
          ],
        });
        uploadProgressStore.set(id, { status: 'uploaded', percent: 100 });
        return;
      }
      throw new Error('当前聊天仅支持图片和视频附件。');
    } catch (error) {
      uploadedAttachmentContent.delete(id);
      uploadProgressStore.set(id, {
        status: 'failed',
        percent: null,
        error: error instanceof Error ? error.message : '上传失败',
      });
    } finally {
      uploadInFlight.delete(id);
    }
  })();
  uploadInFlight.set(id, uploadPromise);
  return uploadPromise;
}

async function completeFitMeetAttachment(attachment: PendingAttachment) {
  const uploaded = uploadedAttachmentContent.get(attachment.id);
  if (uploaded) {
    return {
      ...attachment,
      type: uploaded.type,
      status: { type: 'complete' as const },
      content: uploaded.content,
    };
  }

  const inFlight = uploadInFlight.get(attachment.id);
  if (inFlight) await inFlight;

  const afterUpload = uploadedAttachmentContent.get(attachment.id);
  if (afterUpload) {
    return {
      ...attachment,
      type: afterUpload.type,
      status: { type: 'complete' as const },
      content: afterUpload.content,
    };
  }

  const snapshot = uploadProgressStore.get(attachment.id);
  throw new Error(snapshot.error ?? '附件还没有上传完成。');
}

function forgetFitMeetAttachment(id: string) {
  uploadedAttachmentContent.delete(id);
  uploadInFlight.delete(id);
  uploadProgressStore.remove(id);
}

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
    if (message.role === 'assistant' && message.branch?.groupId) {
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
      const groupId = message.branch?.groupId ?? currentBranchGroupId;
      const branchParentId = groupId?.startsWith('branch-')
        ? groupId.slice('branch-'.length)
        : currentUserId;
      parentId = message.branch && branchParentId ? branchParentId : previousHeadId;
      const activeIndex =
        message.branch && groupId
          ? branchActiveIndexes.get(groupId) ?? message.branch.count
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
  if (hasVisibleText) {
    content.push({ type: 'text', text: message.content });
  } else if (isStreamingAssistant) {
    content.push({ type: 'text', text: ASSISTANT_STREAMING_PLACEHOLDER });
  }
  if (
    shouldRenderProcessPart(message, index, messages, steps)
  ) {
    content.push({
      type: 'data',
      name: 'fitmeet-process',
      data: {
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'agent.process',
        title: '正在处理',
        runtime: message.result?.runtime ?? null,
        steps: steps
          .filter((step) => step.status !== 'pending')
          .map((step) => ({
            id: step.id,
            label: step.label,
            status: step.status,
            detail: step.detail,
            kind: step.kind,
            agentName: step.agentName ?? undefined,
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
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
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
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
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
  if (message.conversationIntent !== 'conversation') return true;
  return hasResumableRuntime(message.result?.runtime);
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

function toToolUICard(card: FitMeetAlphaCard): SchemaDrivenAssistantCard {
  return normalizeAssistantCard({
    schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
    id: card.id,
    type: card.type,
    schemaType: card.data.schemaType,
    title: card.title,
    body: card.body,
    status: card.status,
    data: card.data,
    actions: card.actions,
  });
}

function assistantCardsForResult(result: UserFacingAgentResponse): SchemaDrivenAssistantCard[] {
  const cards = result.cards.map(toToolUICard);
  const lifeGraphCard = lifeGraphWritebackProposalToCard(result.lifeGraphWritebackProposal);
  return lifeGraphCard ? [...cards, lifeGraphCard] : cards;
}

function lifeGraphWritebackProposalToCard(
  proposal: Record<string, unknown> | undefined,
): SchemaDrivenAssistantCard | null {
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

  return normalizeAssistantCard({
    id: `life-graph-writeback-${proposalId}`,
    type: 'profile_proposal',
    schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
    schemaType: 'life_graph.diff',
    title: '画像更新建议',
    body: stringFromUnknown(summarySignal?.value) ?? '我整理出一条可确认的互动信号。',
    status: 'waiting_confirmation',
    data: {
      schemaName: 'LifeGraphDiffCard',
      schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
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
  });
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
