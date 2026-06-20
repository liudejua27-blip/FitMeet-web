import { useCallback } from 'react';

import {
  type AgentApprovalDispatchResult,
  agentApprovalsApi,
} from '../../api/agentApprovalsApi';
import type {
  AgentThreadMessage,
  Step,
} from './socialAgentThreadStore';
import type { FitMeetAssistantRecovery } from './FitMeetAssistantUI.types';

type SetState<T> = (value: T | ((current: T) => T)) => void;

type UseAgentApprovalRuntimeInput = {
  isRunning: boolean;
  activeTaskId: number | null;
  currentGoal: string;
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
  reloadLastUserMessage: () => void;
  appendApprovalDispatchResultMessage: (input: {
    approvalId: number;
    dispatchResult?: AgentApprovalDispatchResult;
    taskId?: number | null;
  }) => void;
  publicText: (value: unknown, fallback: string) => string;
  nextId: (prefix: string) => string;
};

export function useAgentApprovalRuntime({
  isRunning,
  activeTaskId,
  currentGoal,
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
    async (approvalId: number) => {
      if (isRunning) return;
      const approvalStepId = findApprovalDecisionStepId(steps, approvalId);
      const result = await agentApprovalsApi.approve(approvalId);
      setMessages((current) =>
        current.map((message) =>
          message.role === 'assistant' && message.result?.pendingConfirmations.length
            ? {
                ...message,
                result: {
                  ...message.result,
                  pendingConfirmations: message.result.pendingConfirmations.filter(
                    (confirmation) => String(confirmation.id) !== String(approvalId),
                  ),
                },
                resolvedApproval: {
                  id: approvalId,
                  decision: 'approved',
                  summary:
                    message.result.pendingConfirmations.find(
                      (confirmation) => String(confirmation.id) === String(approvalId),
                    )?.summary ?? null,
                },
              }
            : message,
        ),
      );
      setSteps((current) => resolveApprovalDecisionSteps(current, approvalId));
      appendApprovalDispatchResultMessage({
        approvalId,
        dispatchResult: result.result,
        taskId: result.resume?.taskId ?? activeTaskId,
      });
      if (result?.dispatched === false && result.dispatchError) {
        setRecovery({
          kind: 'action_failed',
          title: '确认已记录，但执行没有完成',
          message: publicText(result.dispatchError, '确认已记录，但后续动作没有完成。'),
          prompt: currentGoal,
          retryable: Boolean(currentGoal),
        });
        return;
      }
      if (result.checkpointError) {
        setRecovery({
          kind: 'checkpoint_failed',
          title: '确认已执行，但恢复状态没有保存完整',
          message: publicText(
            result.checkpointError,
            '确认已执行，但恢复状态没有保存完整。为了避免重复执行，我不会自动重跑这一步。你可以继续发送新的要求，我会从当前结果往后处理。',
          ),
          prompt: '',
          retryable: false,
        });
        return;
      }
      if (result.resume?.checkpointId) {
        await runCheckpointStream(
          result.resume.checkpointId,
          'resume',
          'approved',
          approvalStepId,
        );
        return;
      }
      reloadLastUserMessage();
    },
    [
      activeTaskId,
      appendApprovalDispatchResultMessage,
      currentGoal,
      isRunning,
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
    async (approvalId: number) => {
      if (isRunning) return;
      const approvalStepId = findApprovalDecisionStepId(steps, approvalId);
      const result = await agentApprovalsApi.reject(approvalId);
      setMessages((current) =>
        current.map((message) =>
          message.role === 'assistant' && message.result?.pendingConfirmations.length
            ? {
                ...message,
                result: {
                  ...message.result,
                  pendingConfirmations: message.result.pendingConfirmations.filter(
                    (confirmation) => String(confirmation.id) !== String(approvalId),
                  ),
                },
                resolvedApproval: {
                  id: approvalId,
                  decision: 'rejected',
                  summary:
                    message.result.pendingConfirmations.find(
                      (confirmation) => String(confirmation.id) === String(approvalId),
                    )?.summary ?? null,
                },
              }
            : message,
        ),
      );
      setSteps((current) => resolveApprovalDecisionSteps(current, approvalId));
      if (result.checkpointError) {
        setRecovery({
          kind: 'checkpoint_failed',
          title: '已按你的拒绝处理，但恢复状态没有保存完整',
          message: publicText(
            result.checkpointError,
            '我已经按你的选择停止这一步，但恢复状态没有保存完整。为了避免重复处理，我不会自动重跑这一步。你可以继续发送新的要求，我会从当前结果往后处理。',
          ),
          prompt: '',
          retryable: false,
        });
        return;
      }
      if (result.resume?.checkpointId) {
        await runCheckpointStream(
          result.resume.checkpointId,
          'resume',
          'rejected',
          approvalStepId,
        );
        return;
      }
      setMessages((current) => [
        ...current,
        {
          id: nextId('assistant'),
          role: 'assistant',
          content: '好的，我不会执行这一步。你可以继续补充要求，或者让我换一种更稳妥的方式处理。',
          status: 'done',
          taskId: activeTaskId,
          conversationIntent: 'conversation',
        },
      ]);
    },
    [
      activeTaskId,
      isRunning,
      publicText,
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
    /^approval(?:$|[-:_])/.test(step.id)
  );
}

function publicString(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
