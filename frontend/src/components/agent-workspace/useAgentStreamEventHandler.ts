import { useCallback, type MutableRefObject } from 'react';

import {
  isApprovalProgressEvent,
  mergeApprovalRequiredStep,
  mergeProgressStep,
  numberFromUnknown,
  resolveIntentFromStreamEvent,
  shouldAttachVisibleProcessToMessage,
  stringFromUnknown,
} from './agentWorkspaceRuntime';
import { lifecycleFromLightStatus, type AgentLifecycle, type AgentStreamEvent } from './api';
import { socialCodexThreadIdOrExisting } from './socialCodexThreadId';
import type { UserFacingAgentAssistantMessageSource } from '../../api/socialAgentApi';
import type {
  AgentConversationIntent,
  Step,
} from './socialAgentThreadStore';

type SetState<T> = (value: T | ((current: T) => T)) => void;

type UseAgentStreamEventHandlerInput = {
  activeTaskId: number | null;
  runConversationIntentRef: MutableRefObject<AgentConversationIntent>;
  observedRunThreadIdRef: MutableRefObject<string | null>;
  setActiveTaskId: SetState<number | null>;
  setActiveThreadId: SetState<string | null>;
  setSteps: SetState<Step[]>;
  appendAssistantDelta: (
    delta: string,
    source?: UserFacingAgentAssistantMessageSource,
    anchor?: { runId?: string | null; messageId?: string | null },
  ) => void;
  appendStreamingAssistant: (
    taskId: number | null,
    intent: AgentConversationIntent,
    anchor?: { runId?: string | null; messageId?: string | null },
  ) => void;
  finishAssistantDelta: (
    source?: UserFacingAgentAssistantMessageSource,
    anchor?: { runId?: string | null; messageId?: string | null },
  ) => void;
  finishUserFacing: (result: Extract<AgentStreamEvent, { type: 'result' }>['result']) => void;
};

export function useAgentStreamEventHandler({
  activeTaskId,
  runConversationIntentRef,
  observedRunThreadIdRef,
  setActiveTaskId,
  setActiveThreadId,
  setSteps,
  appendAssistantDelta,
  appendStreamingAssistant,
  finishAssistantDelta,
  finishUserFacing,
}: UseAgentStreamEventHandlerInput) {
  const handleAgentStreamEvent = useCallback(
    (event: AgentStreamEvent) => {
      const handleProgressEvent = (
        progressEvent: Extract<AgentStreamEvent, { type: 'progress' }>,
      ) => {
        if (isApprovalProgressEvent(progressEvent)) {
          runConversationIntentRef.current = 'approval';
        }
        const eventTaskId = numberFromUnknown(progressEvent.metadata?.taskId);
        if (eventTaskId) {
          setActiveTaskId((current) => current ?? eventTaskId);
          const eventThreadId = socialCodexThreadIdOrExisting(
            stringFromUnknown(progressEvent.metadata?.threadId),
            eventTaskId,
          );
          if (eventThreadId) {
            observedRunThreadIdRef.current = eventThreadId;
            setActiveThreadId((current) => current ?? eventThreadId);
          }
        }
        if (shouldAttachVisibleProcessToMessage(progressEvent)) {
          appendStreamingAssistant(
            eventTaskId ?? activeTaskId,
            runConversationIntentRef.current,
            runMessageAnchorFromEvent(progressEvent),
          );
        }
        setSteps((current) =>
          mergeProgressStep(current, progressEvent, runConversationIntentRef.current),
        );
      };
      const streamIntent = resolveIntentFromStreamEvent(event);
      if (streamIntent) runConversationIntentRef.current = streamIntent;
      if (event.type === 'assistant_delta') {
        appendAssistantDelta(event.delta, event.source, runMessageAnchorFromEvent(event));
        return;
      }
      if (event.type === 'assistant_done') {
        finishAssistantDelta(event.source, runMessageAnchorFromEvent(event));
        return;
      }
      if (event.type === 'progress') {
        handleProgressEvent(event);
        return;
      }
      if (event.type === 'status') {
        // Legacy-only safety net: real/mock adapters now emit covering
        // progress summaries, but this keeps bypassed old streams from
        // reintroducing timeline-style status steps.
        handleProgressEvent(legacyStatusToCoveringProgress(event));
        return;
      }
      if (event.type === 'approval_required') {
        runConversationIntentRef.current = 'approval';
        setSteps((current) => mergeApprovalRequiredStep(current, event));
        return;
      }
      if (event.type === 'result') {
        finishUserFacing(event.result);
      }
    },
    [
      activeTaskId,
      appendAssistantDelta,
      appendStreamingAssistant,
      finishAssistantDelta,
      finishUserFacing,
      observedRunThreadIdRef,
      runConversationIntentRef,
      setActiveTaskId,
      setActiveThreadId,
      setSteps,
    ],
  );

  return { handleAgentStreamEvent };
}

function runMessageAnchorFromEvent(event: AgentStreamEvent): {
  runId?: string | null;
  messageId?: string | null;
} {
  const metadata =
    typeof event === 'object' && event !== null && 'metadata' in event
      ? event.metadata
      : undefined;
  return {
    runId: stringOrNull(metadata?.runId ?? ('runId' in event ? event.runId : null)),
    messageId: stringOrNull('messageId' in event ? event.messageId : metadata?.messageId),
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function legacyStatusToCoveringProgress(
  event: Extract<AgentStreamEvent, { type: 'status' }>,
): Extract<AgentStreamEvent, { type: 'progress' }> {
  const lifecycle = event.lifecycle ?? lifecycleFromLightStatus(event.lightStatus);
  return {
    type: 'progress',
    id: 'social-codex:summary',
    kind: 'status',
    title: legacyStatusTitleForLifecycle(lifecycle),
    state: 'running',
    lifecycle,
    metadata: {
      processType: 'run_summary',
      originalProcessType: 'legacy_status',
      sourceProtocol: 'legacy_agent_stream',
      taskId: event.taskId ?? null,
      threadId: event.threadId ?? null,
      displayMode: 'covering_status',
      updateModel: 'latest_state',
      defaultVisibleCount: 1,
      historyVisibility: 'collapsed',
    },
  };
}

function legacyStatusTitleForLifecycle(lifecycle: AgentLifecycle): string {
  if (lifecycle === 'reading_life_graph') return '正在读取你的偏好';
  if (lifecycle === 'searching_candidates') return '正在筛选公开可发现的人';
  if (lifecycle === 'ranking_matches') return '正在整理合适机会';
  if (lifecycle === 'checking_safety') return '正在检查安全边界';
  if (lifecycle === 'drafting_opener') return '正在生成开场白';
  if (lifecycle === 'waiting_confirmation') return '需要你确认后继续';
  return '正在理解你的需求';
}
