import { useCallback, type MutableRefObject } from 'react';

import {
  socialAgentApi,
  type UserFacingAgentResponse,
} from '../../api/socialAgentApi';
import type { FitMeetAssistantRecovery } from './FitMeetAssistantUI.types';
import {
  type AgentError,
  type AgentStreamEvent,
  mapAgentError,
} from './api';
import type { Step } from './socialAgentThreadStore';

type SetState<T> = (value: T | ((current: T) => T)) => void;

export type AgentCheckpointRuntimeAction = 'resume' | 'retry' | 'replay' | 'fork';

type UseAgentCheckpointRuntimeInput = {
  isRunning: boolean;
  activeTaskId: number | null;
  currentGoal: string;
  fallbackSteps: Step[];
  finishedRef: MutableRefObject<boolean>;
  stopRequestedRef: MutableRefObject<boolean>;
  setRecovery: SetState<FitMeetAssistantRecovery | null>;
  setIsRunning: SetState<boolean>;
  setSteps: SetState<Step[]>;
  setActiveTaskId: SetState<number | null>;
  beginAbortableRun: (controller: AbortController) => void;
  finishAbortableRun: () => void;
  handleAgentStreamEvent: (event: AgentStreamEvent) => void;
  finishUserFacing: (response: UserFacingAgentResponse) => void;
  settleStreamingAssistantAfterInterruption: () => void;
  findTaskId: (result: UserFacingAgentResponse | null) => number | null;
  isAbortError: (error: unknown) => boolean;
  createRecoveryFromError: (error: AgentError, prompt: string) => FitMeetAssistantRecovery;
};

export function useAgentCheckpointRuntime({
  isRunning,
  activeTaskId,
  currentGoal,
  fallbackSteps,
  finishedRef,
  stopRequestedRef,
  setRecovery,
  setIsRunning,
  setSteps,
  setActiveTaskId,
  beginAbortableRun,
  finishAbortableRun,
  handleAgentStreamEvent,
  finishUserFacing,
  settleStreamingAssistantAfterInterruption,
  findTaskId,
  isAbortError,
  createRecoveryFromError,
}: UseAgentCheckpointRuntimeInput) {
  const runCheckpointStream = useCallback(
    async (
      checkpointId: number | string | null | undefined,
      action: AgentCheckpointRuntimeAction,
      decision?: 'approved' | 'rejected' | null,
      stepId?: string | null,
    ) => {
      const resolvedCheckpointId =
        typeof checkpointId === 'number' || typeof checkpointId === 'string'
          ? checkpointId
          : null;
      if (!resolvedCheckpointId) throw new Error('当前步骤没有可恢复的检查点。');
      if (isRunning) throw new Error('上一轮还在生成，请先停止或等待它完成。');

      setRecovery(null);
      setIsRunning(true);
      setSteps((current) =>
        current.length > 0
          ? current.map((step) =>
              shouldPrimeCheckpointStep(step, stepId)
                ? { ...step, status: 'running' }
                : step,
            )
          : fallbackSteps.map((step, index) => ({
              ...step,
              status: index === 0 ? 'running' : 'pending',
            })),
      );

      const controller = new AbortController();
      beginAbortableRun(controller);
      try {
        const finalResult = await socialAgentApi.runCheckpointStream(
          {
            checkpointId: resolvedCheckpointId,
            action,
            stepId,
            decision: decision ?? null,
          },
          (event) => handleAgentStreamEvent(event as AgentStreamEvent),
          controller.signal,
        );
        setActiveTaskId(findTaskId(finalResult) ?? activeTaskId);
        if (!finishedRef.current) finishUserFacing(finalResult);
      } catch (error) {
        const stopped = stopRequestedRef.current || isAbortError(error);
        if (stopped) {
          settleStreamingAssistantAfterInterruption();
        } else {
          setRecovery(createRecoveryFromError(mapAgentError(error), currentGoal));
        }
        setSteps((current) =>
          current.map((step) =>
            step.status === 'running' ? { ...step, status: stopped ? 'pending' : 'error' } : step,
          ),
        );
      } finally {
        setIsRunning(false);
        finishAbortableRun();
      }
    },
    [
      activeTaskId,
      beginAbortableRun,
      createRecoveryFromError,
      currentGoal,
      fallbackSteps,
      findTaskId,
      finishAbortableRun,
      finishUserFacing,
      finishedRef,
      handleAgentStreamEvent,
      isAbortError,
      isRunning,
      setActiveTaskId,
      setIsRunning,
      setRecovery,
      setSteps,
      settleStreamingAssistantAfterInterruption,
      stopRequestedRef,
    ],
  );

  return { runCheckpointStream };
}

function shouldPrimeCheckpointStep(
  step: Step,
  stepId: string | null | undefined,
) {
  if (step.status !== 'waiting' && step.status !== 'error') return false;
  if (!stepId) return true;
  return step.id === stepId;
}
