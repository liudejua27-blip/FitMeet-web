import { useCallback, useRef } from 'react';

import type { FitMeetAlphaCard } from '../../api/socialAgentApi';
import type { AgentConversationIntent } from './socialAgentThreadStore';

export function useAgentStreamingRun(initialIntent: AgentConversationIntent = 'conversation') {
  const abortRef = useRef<AbortController | null>(null);
  const finishedRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const branchReloadUserIdRef = useRef<string | null>(null);
  const runConversationIntentRef = useRef<AgentConversationIntent>(initialIntent);
  const observedRunThreadIdRef = useRef<string | null>(null);
  const pendingOpportunityClarificationRef = useRef(false);
  const pendingApprovalDispatchCardsRef = useRef<FitMeetAlphaCard[]>([]);

  const beginAbortableRun = useCallback((controller: AbortController, threadId?: string | null) => {
    abortRef.current = controller;
    finishedRef.current = false;
    stopRequestedRef.current = false;
    observedRunThreadIdRef.current = threadId ?? null;
  }, []);

  const finishAbortableRun = useCallback(() => {
    abortRef.current = null;
    stopRequestedRef.current = false;
  }, []);

  const requestStop = useCallback(() => {
    stopRequestedRef.current = true;
    abortRef.current?.abort();
  }, []);

  return {
    abortRef,
    finishedRef,
    stopRequestedRef,
    branchReloadUserIdRef,
    runConversationIntentRef,
    observedRunThreadIdRef,
    pendingOpportunityClarificationRef,
    pendingApprovalDispatchCardsRef,
    beginAbortableRun,
    finishAbortableRun,
    requestStop,
  };
}
