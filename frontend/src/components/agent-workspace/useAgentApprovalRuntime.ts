import { useCallback } from 'react';

import { type AgentApprovalDispatchResult, agentApprovalsApi } from '../../api/agentApprovalsApi';
import type { AgentThreadMessage, Step } from './socialAgentThreadStore';
import type { FitMeetAssistantRecovery } from './FitMeetAssistantUI.types';

type SetState<T> = (value: T | ((current: T) => T)) => void;

type UseAgentApprovalRuntimeInput = {
  isRunning: boolean;
  activeTaskId: number | null;
  currentGoal: string;
  messages: AgentThreadMessage[];
  steps: Step[];
  setMessages: SetState<AgentThreadMessage[]>;
  setSteps: SetState<Step[]>;
  setRecovery: SetState<FitMeetAssistantRecovery | null>;
  runCheckpointStream: (
    checkpointId: number | string | null | undefined,
    action: 'resume' | 'retry' | 'replay' | 'fork',
    decision?: 'approved' | 'rejected' | null,
    stepId?: string | null,
  ) => Promise<void>;
  reloadLastUserMessage: (options?: { createBranch?: boolean }) => void;
  appendApprovalDispatchResultMessage: (input: {
    approvalId: number;
    actionType?: string | null;
    dispatchResult?: AgentApprovalDispatchResult;
    taskId?: number | null;
    targetMessageId?: string | null;
    targetCardId?: string | null;
    suppressStandalone?: boolean;
  }) => void;
  publicText: (value: unknown, fallback: string) => string;
  nextId: (prefix: string) => string;
};

export function useAgentApprovalRuntime({
  isRunning,
  activeTaskId,
  currentGoal,
  messages,
  steps,
  setMessages,
  setSteps,
  setRecovery,
  runCheckpointStream,
  reloadLastUserMessage,
  appendApprovalDispatchResultMessage,
  publicText,
  nextId,
}: UseAgentApprovalRuntimeInput) {
  const approveInlineApproval = useCallback(
    async (
      approvalId: number,
      context?: {
        messageId?: string | null;
        cardId?: string | null;
        inline?: boolean;
      },
    ) => {
      if (isRunning) return;
      const approvalStepId = findApprovalDecisionStepId(steps, approvalId);
      const approvalActionType = approvalActionTypeForMessages(messages, approvalId);
      const result = await agentApprovalsApi.approve(approvalId);
      setMessages((current) =>
        current.map((message) =>
          message.role === 'assistant' &&
          message.result &&
          messageHasApprovalId(message, approvalId)
            ? {
                ...message,
                result: {
                  ...message.result,
                  pendingConfirmations: (message.result?.pendingConfirmations ?? []).filter(
                    (confirmation) => String(confirmation.id) !== String(approvalId),
                  ),
                },
                resolvedApproval: {
                  id: approvalId,
                  decision: 'approved',
                  summary: approvalSummaryForMessage(message, approvalId),
                },
              }
            : message,
        ),
      );
      setSteps((current) => resolveApprovalDecisionSteps(current, approvalId));
      const hasDispatchResult = Boolean(result.result);
      const dispatchResponse = appendApprovalDispatchResultMessage({
        approvalId,
        actionType: approvalActionType,
        dispatchResult: result.result,
        taskId: result.resume?.taskId ?? activeTaskId,
        targetMessageId: context?.messageId ?? null,
        targetCardId: context?.cardId ?? null,
        suppressStandalone: context?.inline === true,
      });
      if (result?.dispatched === false && result.dispatchError) {
        setRecovery({
          kind: 'action_failed',
          title: '确认已记录，后续动作待继续',
          message: publicText(
            result.dispatchError,
            '你的确认已经保存。后续动作还没继续，我会避免重复触达对方；你可以继续发送新的要求。',
          ),
          prompt: currentGoal,
          retryable: Boolean(currentGoal),
        });
        return dispatchResponse;
      }
      if (result.checkpointError) {
        setRecovery({
          kind: 'checkpoint_failed',
          title: '确认已记录，后续可以继续',
          message:
            '你的确认已经保存。为了避免重复触达对方，我不会自动重跑这个动作；你可以继续发送新的要求，我会从当前结果往后处理。',
          prompt: '',
          retryable: false,
        });
        return dispatchResponse;
      }
      if (result.resume?.checkpointId) {
        await runCheckpointStream(result.resume.checkpointId, 'resume', 'approved', approvalStepId);
        return dispatchResponse;
      }
      if (hasDispatchResult) return dispatchResponse;
      reloadLastUserMessage({ createBranch: false });
      return dispatchResponse;
    },
    [
      activeTaskId,
      appendApprovalDispatchResultMessage,
      currentGoal,
      isRunning,
      messages,
      publicText,
      reloadLastUserMessage,
      runCheckpointStream,
      setMessages,
      setRecovery,
      setSteps,
      steps,
    ],
  );

  const rejectInlineApproval = useCallback(
    async (
      approvalId: number,
      context?: {
        inline?: boolean;
      },
    ) => {
      if (isRunning) return;
      const approvalStepId = findApprovalDecisionStepId(steps, approvalId);
      const result = await agentApprovalsApi.reject(approvalId);
      setMessages((current) =>
        current.map((message) =>
          message.role === 'assistant' &&
          message.result &&
          messageHasApprovalId(message, approvalId)
            ? {
                ...message,
                result: {
                  ...message.result,
                  pendingConfirmations: (message.result?.pendingConfirmations ?? []).filter(
                    (confirmation) => String(confirmation.id) !== String(approvalId),
                  ),
                },
                resolvedApproval: {
                  id: approvalId,
                  decision: 'rejected',
                  summary: approvalSummaryForMessage(message, approvalId),
                },
              }
            : message,
        ),
      );
      setSteps((current) => resolveApprovalDecisionSteps(current, approvalId));
      if (result.checkpointError) {
        setRecovery({
          kind: 'checkpoint_failed',
          title: '已取消这个动作',
          message:
            '我已经按你的选择停止，不会继续触达对方。你可以继续补充要求，或让我换一种更稳妥的方式处理。',
          prompt: '',
          retryable: false,
        });
        return;
      }
      if (result.resume?.checkpointId) {
        await runCheckpointStream(result.resume.checkpointId, 'resume', 'rejected', approvalStepId);
        return;
      }
      if (context?.inline === true) return;
      setMessages((current) => [
        ...current,
        {
          id: nextId('assistant'),
          role: 'assistant',
          content: '好的，我不会执行这个动作。你可以继续补充要求，或者让我换一种更稳妥的方式处理。',
          status: 'done',
          taskId: activeTaskId,
          conversationIntent: 'conversation',
        },
      ]);
    },
    [
      activeTaskId,
      isRunning,
      nextId,
      runCheckpointStream,
      setMessages,
      setRecovery,
      setSteps,
      steps,
    ],
  );

  return {
    approveInlineApproval,
    rejectInlineApproval,
  };
}

export function resolveApprovalDecisionSteps(steps: Step[], approvalId: number | string): Step[] {
  return steps.map((step) =>
    step.status === 'waiting' && isMatchingApprovalStep(step, approvalId)
      ? { ...step, status: 'success' as const }
      : step,
  );
}

export function findApprovalDecisionStepId(
  steps: Step[],
  approvalId: number | string,
): string | null {
  return steps.find((step) => isMatchingApprovalStep(step, approvalId))?.id ?? null;
}

function isMatchingApprovalStep(step: Step, approvalId: number | string) {
  const explicitApprovalId = approvalIdFromStep(step);
  if (explicitApprovalId !== null) return explicitApprovalId === String(approvalId);

  return isApprovalStep(step);
}

function approvalIdFromStep(step: Step) {
  const fromMetadata = publicString(step.metadata?.approvalId);
  if (fromMetadata) return fromMetadata;
  const confirmationId = publicString(step.metadata?.confirmationId);
  if (confirmationId) return confirmationId;
  const approval = isRecord(step.metadata?.approval) ? step.metadata.approval : null;
  const nestedId = publicString(approval?.id);
  return nestedId || null;
}

function isApprovalStep(step: Step) {
  return (
    step.processType === 'approval' ||
    step.metadata?.processType === 'approval' ||
    step.metadata?.kind === 'approval_required' ||
    step.id === 'approval' ||
    step.id.startsWith('approval-') ||
    step.id.startsWith('approval_') ||
    step.id.startsWith('approval:')
  );
}

function messageHasApprovalId(message: AgentThreadMessage, approvalId: number | string) {
  if (!message.result) return false;
  const expected = String(approvalId);
  if (
    message.result.pendingConfirmations.some((confirmation) => String(confirmation.id) === expected)
  ) {
    return true;
  }
  return message.result.cards.some((card) => cardApprovalId(card.data) === expected);
}

function approvalSummaryForMessage(message: AgentThreadMessage, approvalId: number | string) {
  const expected = String(approvalId);
  const pendingSummary =
    message.result?.pendingConfirmations.find(
      (confirmation) => String(confirmation.id) === expected,
    )?.summary ?? null;
  if (pendingSummary) return pendingSummary;
  const card = message.result?.cards.find((item) => cardApprovalId(item.data) === expected);
  const inlineApproval = isRecord(card?.data.inlineApprovalConfirmation)
    ? card?.data.inlineApprovalConfirmation
    : null;
  return publicString(inlineApproval?.summary);
}

function approvalActionTypeForMessages(
  messages: AgentThreadMessage[],
  approvalId: number | string,
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message.result) continue;
    const actionType = approvalActionTypeForMessage(message, approvalId);
    if (actionType) return actionType;
  }
  return null;
}

function approvalActionTypeForMessage(
  message: AgentThreadMessage,
  approvalId: number | string,
): string | null {
  const expected = String(approvalId);
  const pending = message.result?.pendingConfirmations.find(
    (confirmation) => String(confirmation.id) === expected,
  );
  const pendingActionType = publicString(pending?.actionType) ?? publicString(pending?.type);
  if (pendingActionType) return pendingActionType;

  const card = message.result?.cards.find((item) => cardApprovalId(item.data) === expected);
  if (!card) return null;
  const inlineApproval = isRecord(card.data.inlineApprovalConfirmation)
    ? card.data.inlineApprovalConfirmation
    : null;
  const approval = isRecord(card.data.approval) ? card.data.approval : null;
  return (
    publicString(card.data.actionType) ??
    publicString(card.data.action) ??
    publicString(inlineApproval?.actionType) ??
    publicString(inlineApproval?.action) ??
    publicString(approval?.actionType) ??
    publicString(approval?.action) ??
    firstCardActionType(card)
  );
}

function cardApprovalId(data: Record<string, unknown>) {
  const explicit = publicString(data.approvalId);
  if (explicit) return explicit;
  const inlineApproval = isRecord(data.inlineApprovalConfirmation)
    ? data.inlineApprovalConfirmation
    : null;
  return publicString(inlineApproval?.id);
}

function firstCardActionType(card: {
  actions?: Array<{ schemaAction?: string; action?: string }>;
}) {
  const action = card.actions?.find((item) => item.schemaAction || item.action);
  return publicString(action?.schemaAction) ?? publicString(action?.action);
}

function publicString(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
