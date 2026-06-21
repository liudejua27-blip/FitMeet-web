import { useCallback, type FormEvent, type MutableRefObject } from 'react';
import type { NavigateFunction } from 'react-router-dom';

import type {
  SocialAgentPermissionMode,
  UserFacingAgentResponse,
} from '../../api/socialAgentApi';
import type {
  FitMeetAssistantAttachment,
  FitMeetAssistantRecovery,
} from './FitMeetAssistantUI.types';
import {
  type AgentError,
  type AgentAdapter,
  type AgentStreamEvent,
  mapAgentError,
} from './api';
import {
  cancelsOpportunityClarification,
  continuesOpportunityClarification,
  createAgentRecoveryFromError,
  createInlineAuthRecovery,
  intentForPrompt,
  isAbortError,
  threadIdFromResponse,
} from './agentWorkspaceRuntime';
import type {
  AgentConversationIntent,
  AgentThreadMessage,
  Step,
} from './socialAgentThreadStore';
import {
  socialCodexThreadIdForTask,
} from './socialCodexThreadId';

type SetState<T> = (value: T | ((current: T) => T)) => void;

const LOCAL_COVERING_STATUS_ID = 'local-covering-status';
const LOCAL_COVERING_STATUS_SOURCE = 'local.covering_status';
const SOFT_COVERING_STATUS_DELAY_MS = 1000;
const SLOW_COVERING_STATUS_DELAY_MS = 8000;
export const NON_BRANCH_RELOAD_PREFIX = 'non-branch-reload:';

type UseAgentSubmitRuntimeInput = {
  isRunning: boolean;
  isRealAgent: boolean;
  isLoggedIn: boolean;
  activeTaskId: number | null;
  canonicalActiveThreadId: string | null;
  mode: SocialAgentPermissionMode;
  shellView: string;
  agentAdapter: AgentAdapter;
  branchReloadUserIdRef: MutableRefObject<string | null>;
  createBranchForNextAssistantRef: MutableRefObject<boolean>;
  pendingOpportunityClarificationRef: MutableRefObject<boolean>;
  runConversationIntentRef: MutableRefObject<AgentConversationIntent>;
  observedRunThreadIdRef: MutableRefObject<string | null>;
  finishedRef: MutableRefObject<boolean>;
  stopRequestedRef: MutableRefObject<boolean>;
  skipNextRestoreRef: MutableRefObject<boolean>;
  setMessages: SetState<AgentThreadMessage[]>;
  setUserResult: SetState<UserFacingAgentResponse | null>;
  setRecovery: SetState<FitMeetAssistantRecovery | null>;
  setIsRunning: SetState<boolean>;
  setSteps: SetState<Step[]>;
  setActiveTaskId: SetState<number | null>;
  setActiveThreadId: SetState<string | null>;
  appendStreamingAssistant: (taskId: number | null, intent: AgentConversationIntent) => void;
  beginAbortableRun: (controller: AbortController, threadId?: string | null) => void;
  finishAbortableRun: () => void;
  finishUserFacing: (response: UserFacingAgentResponse) => void;
  handleAgentStreamEvent: (event: AgentStreamEvent) => void;
  settleStreamingAssistantAfterInterruption: (status?: 'done' | 'error') => void;
  refreshThreads: () => Promise<void> | void;
  navigate: NavigateFunction;
  nextId: (prefix: string) => string;
};

export function useAgentSubmitRuntime({
  isRunning,
  isRealAgent,
  isLoggedIn,
  activeTaskId,
  canonicalActiveThreadId,
  mode,
  shellView,
  agentAdapter,
  branchReloadUserIdRef,
  createBranchForNextAssistantRef,
  pendingOpportunityClarificationRef,
  runConversationIntentRef,
  observedRunThreadIdRef,
  finishedRef,
  stopRequestedRef,
  skipNextRestoreRef,
  setMessages,
  setUserResult,
  setRecovery,
  setIsRunning,
  setSteps,
  setActiveTaskId,
  setActiveThreadId,
  appendStreamingAssistant,
  beginAbortableRun,
  finishAbortableRun,
  finishUserFacing,
  handleAgentStreamEvent,
  settleStreamingAssistantAfterInterruption,
  refreshThreads,
  navigate,
  nextId,
}: UseAgentSubmitRuntimeInput) {
  const submit = useCallback(
    async (
      event?: FormEvent,
      prompt?: string,
      attachments: FitMeetAssistantAttachment[] = [],
    ) => {
      event?.preventDefault();
      const goal = (prompt ?? '').trim();
      if (!goal) {
        setRecovery(createAgentRecoveryFromError(mapAgentError(new Error('MISSING_INFO')), ''));
        return;
      }
      if (isRunning) return;
      const shouldContinueOpportunityClarification =
        pendingOpportunityClarificationRef.current &&
        continuesOpportunityClarification(goal);
      if (pendingOpportunityClarificationRef.current && cancelsOpportunityClarification(goal)) {
        pendingOpportunityClarificationRef.current = false;
      }
      const conversationIntent = shouldContinueOpportunityClarification
        ? 'social'
        : intentForPrompt(goal);
      runConversationIntentRef.current = conversationIntent;
      if (isRealAgent && !isLoggedIn) {
        setMessages((current) => [
          ...current,
          {
            id: nextId('user'),
            role: 'user',
            content: goal,
            attachments,
            taskId: activeTaskId,
            conversationIntent,
          },
        ]);
        setRecovery(createInlineAuthRecovery(goal));
        return;
      }

      const reloadUserId = branchReloadUserIdRef.current;
      const shouldCreateBranch =
        Boolean(reloadUserId) && !reloadUserId?.startsWith(NON_BRANCH_RELOAD_PREFIX);
      const branchUserId = reloadUserId?.startsWith(NON_BRANCH_RELOAD_PREFIX)
        ? reloadUserId.slice(NON_BRANCH_RELOAD_PREFIX.length)
        : reloadUserId;
      createBranchForNextAssistantRef.current = shouldCreateBranch;
      setMessages((current) =>
        branchUserId
          ? current
          : [
              ...current,
              {
                id: nextId('user'),
                role: 'user',
                content: goal,
                attachments,
                taskId: activeTaskId,
                conversationIntent,
              },
            ],
      );
      branchReloadUserIdRef.current = null;
      setUserResult(null);
      setRecovery(null);
      setIsRunning(true);
      appendStreamingAssistant(activeTaskId, conversationIntent);
      setSteps(createInitialCoveringStatus(conversationIntent));

      const controller = new AbortController();
      beginAbortableRun(controller, canonicalActiveThreadId);
      let sawVisibleStreamEvent = false;
      const removeLocalCoveringStatus = () => {
        setSteps(removeLocalCoveringStatusSteps);
      };
      const handleStreamingEvent = (streamEvent: AgentStreamEvent) => {
        if (!sawVisibleStreamEvent && streamEventReplacesLocalCoveringStatus(streamEvent)) {
          sawVisibleStreamEvent = true;
          removeLocalCoveringStatus();
        }
        handleAgentStreamEvent(streamEvent);
      };
      const softStatusTimer = window.setTimeout(() => {
        if (sawVisibleStreamEvent || finishedRef.current || controller.signal.aborted) return;
        setSteps((current) =>
          applyLocalCoveringStatus(current, conversationIntent, 'soft'),
        );
      }, SOFT_COVERING_STATUS_DELAY_MS);
      const slowStatusTimer = window.setTimeout(() => {
        if (sawVisibleStreamEvent || finishedRef.current || controller.signal.aborted) return;
        setSteps((current) =>
          applyLocalCoveringStatus(current, conversationIntent, 'slow'),
        );
      }, SLOW_COVERING_STATUS_DELAY_MS);
      try {
        const finalResult = await agentAdapter.run(
          {
            goal,
            permissionMode: mode,
            conversationIntent,
            taskId: activeTaskId,
            idempotencyKey: `agent-run-${Date.now()}`,
            clientContext: {
              source: 'web',
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              locale: navigator.language,
              threadId: canonicalActiveThreadId,
            },
          },
          {
            onEvent: handleStreamingEvent,
            signal: controller.signal,
          },
        );
        setActiveTaskId(finalResult.taskId ?? activeTaskId);
        const nextThreadId =
          threadIdFromResponse(finalResult.response) ??
          observedRunThreadIdRef.current ??
          socialCodexThreadIdForTask(finalResult.taskId);
        if (nextThreadId) {
          setActiveThreadId(nextThreadId);
          void refreshThreads();
        }
        if (!sawVisibleStreamEvent) removeLocalCoveringStatus();
        if (!finishedRef.current) finishUserFacing(finalResult.response);
        if (shellView !== 'chat') {
          skipNextRestoreRef.current = true;
          navigate('/agent/chat', { replace: false });
        }
      } catch (error) {
        if (finishedRef.current) {
          settleStreamingAssistantAfterInterruption();
          return;
        }
        const stopped = stopRequestedRef.current || isAbortError(error);
        const agentError = stopped
          ? mapAgentError(new DOMException('Aborted', 'AbortError'))
          : mapAgentError(error);
        const nextRecovery = createAgentRecoveryFromError(agentError as AgentError, goal);
        setRecovery(nextRecovery);
        if (stopped) {
          settleStreamingAssistantAfterInterruption();
        } else {
          settleStreamingAssistantAfterInterruption('error');
        }
        setSteps((current) =>
          current.map((step) =>
            step.status === 'running' ? { ...step, status: stopped ? 'pending' : 'error' } : step,
          ),
        );
      } finally {
        window.clearTimeout(softStatusTimer);
        window.clearTimeout(slowStatusTimer);
        setIsRunning(false);
        finishAbortableRun();
        if (!finishedRef.current) createBranchForNextAssistantRef.current = false;
      }
    },
    [
      activeTaskId,
      agentAdapter,
      appendStreamingAssistant,
      beginAbortableRun,
      branchReloadUserIdRef,
      canonicalActiveThreadId,
      createBranchForNextAssistantRef,
      finishAbortableRun,
      finishUserFacing,
      finishedRef,
      handleAgentStreamEvent,
      isLoggedIn,
      isRealAgent,
      isRunning,
      mode,
      navigate,
      nextId,
      observedRunThreadIdRef,
      pendingOpportunityClarificationRef,
      refreshThreads,
      runConversationIntentRef,
      setActiveTaskId,
      setActiveThreadId,
      setIsRunning,
      setMessages,
      setRecovery,
      setSteps,
      setUserResult,
      settleStreamingAssistantAfterInterruption,
      shellView,
      skipNextRestoreRef,
      stopRequestedRef,
    ],
  );

  return { submit };
}

export function applyLocalCoveringStatus(
  steps: Step[],
  intent: AgentConversationIntent,
  phase: 'soft' | 'slow',
): Step[] {
  const nextStep = localCoveringStatusStep(intent, phase);
  return [
    ...removeLocalCoveringStatusSteps(steps),
    nextStep,
  ];
}

export function createInitialCoveringStatus(intent: AgentConversationIntent): Step[] {
  return [localCoveringStatusStep(intent, 'soft')];
}

export function removeLocalCoveringStatusSteps(steps: Step[]) {
  return steps.filter((step) => !isLocalCoveringStatusStep(step));
}

export function streamEventReplacesLocalCoveringStatus(event: AgentStreamEvent): boolean {
  if (event.type === 'lifecycle') return false;
  if (event.type === 'assistant_done') return false;
  if (event.type === 'assistant_delta') {
    return event.source !== 'fallback' && event.delta.trim().length > 0;
  }
  if (event.type === 'progress') return true;
  if (event.type === 'status') return true;
  if (event.type === 'approval_required') return true;
  if (event.type === 'result') return true;
  if (event.type === 'error') return true;
  if (event.type === 'agent_loop_step') return false;
  if (event.type === 'tool_call') return false;
  if (event.type === 'tool_result') return false;
  if ('eventId' in event && typeof event.eventId === 'string') {
    if (event.visibility !== 'user_visible') return false;
    return event.type !== 'run.started';
  }
  return false;
}

function isLocalCoveringStatusStep(step: Step) {
  return (
    step.id === LOCAL_COVERING_STATUS_ID ||
    step.metadata?.source === LOCAL_COVERING_STATUS_SOURCE
  );
}

function localCoveringStatusStep(
  intent: AgentConversationIntent,
  phase: 'soft' | 'slow',
): Step {
  const social = intent === 'social' || intent === 'approval';
  const title =
    phase === 'slow'
      ? social
        ? '还在整理你的约练需求…'
        : '还在思考…'
      : social
        ? '正在整理你的约练需求…'
        : '正在思考…';
  const detail =
    phase === 'slow'
      ? '可以继续等待，也可以随时停止后重试。'
      : social
        ? '我会按你已经说的信息继续处理。'
        : '我会直接回复，不触发社交工具。';

  return {
    id: LOCAL_COVERING_STATUS_ID,
    label: title,
    status: 'running',
    kind: 'status',
    processType: 'run_summary',
    detail,
    metadata: {
      processType: 'run_summary',
      source: LOCAL_COVERING_STATUS_SOURCE,
      currentStage: social ? 'slot_filling' : 'detect_social_intent',
      expandable: false,
      localFallback: true,
      displayMode: 'covering_status',
      updateModel: 'latest_state',
      defaultVisibleCount: 1,
      historyVisibility: 'collapsed',
    },
  };
}
