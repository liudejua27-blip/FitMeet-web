import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AGENT_FLOW_INTERESTS, getAgentFlowPhaseConfig } from './agentFlow.constants';
import type { AgentFlowPhase } from './agentFlow.types';
import type { AgentAdapter, AgentError, AgentLifecycle, AgentStreamEvent } from './api';
import type { UserFacingAgentResponse } from '../../api/socialAgentApi';
import {
  lifecycleFromResponse,
  lifecycleFromStreamEvent,
  mapAgentError,
  mapLifecycleToFlow,
} from './api';

export function useAgentFlow(adapter?: AgentAdapter) {
  void adapter;
  const [phase, setPhase] = useState<AgentFlowPhase>('welcome');
  const [activeInterestIndex, setActiveInterestIndex] = useState(-1);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [highlightRecommendations, setHighlightRecommendations] = useState(false);
  const highlightTimerRef = useRef<number | null>(null);

  const clearHighlightTimer = useCallback(() => {
    if (highlightTimerRef.current === null) return;
    window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = null;
  }, []);

  useEffect(() => clearHighlightTimer, [clearHighlightTimer]);

  const setFlowPhase = useCallback((nextPhase: AgentFlowPhase) => {
    setPhase(nextPhase);
  }, []);

  const applyLifecycle = useCallback((lifecycle: AgentLifecycle) => {
    const next = mapLifecycleToFlow(lifecycle).phase;
    setFlowPhase(next);
    setLoadingRecommendations(next === 'discoveringScenes');
    setHighlightRecommendations(next === 'recommendationsReady');
    if (next !== 'discoveringScenes') setActiveInterestIndex(-1);
  }, [setFlowPhase]);

  const reset = useCallback(() => {
    clearHighlightTimer();
    setFlowPhase('welcome');
    setActiveInterestIndex(-1);
    setLoadingRecommendations(false);
    setHighlightRecommendations(false);
  }, [clearHighlightTimer, setFlowPhase]);

  const showEmptyError = useCallback(() => {
    clearHighlightTimer();
    setActiveInterestIndex(-1);
    setLoadingRecommendations(false);
    setHighlightRecommendations(false);
    setFlowPhase('missingInfo');
  }, [clearHighlightTimer, setFlowPhase]);

  const focusInput = useCallback(() => {
    if (phase === 'welcome' || phase === 'missingInfo' || phase === 'failed') {
      setFlowPhase('inputFocused');
    }
  }, [phase, setFlowPhase]);

  const focusRecommendation = useCallback(() => {
    if (phase === 'recommendationsReady' || phase === 'discoveringScenes') {
      setFlowPhase('recommendationsReady');
      setHighlightRecommendations(true);
    }
  }, [phase, setFlowPhase]);

  const focusSafety = useCallback(() => {
    setFlowPhase('safetyReminder');
  }, [setFlowPhase]);

  const focusConfirmButton = useCallback(() => {
    setFlowPhase('awaitingConfirmation');
  }, [setFlowPhase]);

  const beginRun = useCallback(() => {
    clearHighlightTimer();
    setActiveInterestIndex(-1);
    setLoadingRecommendations(false);
    setHighlightRecommendations(false);
    setFlowPhase('analyzingIntent');
  }, [clearHighlightTimer, setFlowPhase]);

  const beginAction = useCallback((lifecycle: AgentLifecycle) => {
    clearHighlightTimer();
    setLoadingRecommendations(false);
    setHighlightRecommendations(false);
    applyLifecycle(lifecycle);
  }, [applyLifecycle, clearHighlightTimer]);

  const handleStreamEvent = useCallback((event: AgentStreamEvent) => {
    const lifecycle = lifecycleFromStreamEvent(event);
    if (lifecycle) applyLifecycle(lifecycle);

    if ('metadata' in event && event.metadata) {
      const activeInterestIndexValue = event.metadata.activeInterestIndex;
      if (typeof activeInterestIndexValue === 'number') {
        setActiveInterestIndex(activeInterestIndexValue);
      }
    }

    if (event.type === 'result') {
      const responseLifecycle = lifecycleFromResponse(event.result);
      if (responseLifecycle === 'completed' && event.result.cards.some((card) => card.type === 'candidate_card')) {
        setFlowPhase('recommendationsReady');
        setHighlightRecommendations(true);
      }
    }
  }, [applyLifecycle, setFlowPhase]);

  const completeResponse = useCallback((response: UserFacingAgentResponse) => {
    setLoadingRecommendations(false);
    setActiveInterestIndex(-1);
    const hasCandidates = response.cards.some((card) => card.type === 'candidate_card');
    const hasWaitingConfirmation =
      response.pendingConfirmations.length > 0 ||
      response.cards.some(
        (card) =>
          card.status === 'waiting_confirmation' ||
          card.actions.some((action) => action.requiresConfirmation),
      );
    const needsSafetyReminder =
      response.safeStatus.blocked ||
      response.safeStatus.level === 'medium' ||
      response.safeStatus.level === 'high' ||
      response.safeStatus.level === 'blocked' ||
      response.safeStatus.requiredConfirmations.length > 0;

    if (hasWaitingConfirmation && response.lightStatus.includes('确认')) {
      setHighlightRecommendations(false);
      setFlowPhase('awaitingConfirmation');
      return;
    }
    if (needsSafetyReminder && response.lightStatus.includes('安全')) {
      setHighlightRecommendations(false);
      setFlowPhase('safetyReminder');
      return;
    }
    if (response.lightStatus.includes('开场白')) {
      setHighlightRecommendations(false);
      setFlowPhase('openerReady');
      return;
    }
    setHighlightRecommendations(hasCandidates);
    setFlowPhase(hasCandidates ? 'recommendationsReady' : 'completed');
  }, [setFlowPhase]);

  const failWithError = useCallback((error: AgentError | unknown) => {
    const agentError = mapAgentError(error);
    if (agentError.lifecycle === 'checking_safety') {
      setFlowPhase('safetyReminder');
    } else if (agentError.lifecycle === 'waiting_confirmation') {
      setFlowPhase('awaitingConfirmation');
    } else if (agentError.code === 'MISSING_INFO') {
      setFlowPhase('missingInfo');
    } else {
      setFlowPhase('failed');
    }
    setLoadingRecommendations(false);
    setHighlightRecommendations(false);
    setActiveInterestIndex(-1);
    return agentError;
  }, [setFlowPhase]);

  const flowConfig = getAgentFlowPhaseConfig(phase);

  return useMemo(
    () => ({
      phase,
      flowConfig,
      guideState: flowConfig.antState,
      guideTarget: flowConfig.antTarget,
      guideCopy: {
        title: flowConfig.title,
        description: flowConfig.description,
      },
      rightPanelState: flowConfig.rightPanelState,
      safetyCardVisible: flowConfig.safetyCardVisible,
      confirmCardVisible: flowConfig.confirmCardVisible,
      nextAllowedActions: flowConfig.nextAllowedActions,
      activeInterest:
        activeInterestIndex >= 0 ? AGENT_FLOW_INTERESTS[activeInterestIndex] : null,
      activeInterestIndex,
      loadingRecommendations,
      highlightRecommendations,
      reset,
      showEmptyError,
      focusInput,
      focusRecommendation,
      focusSafety,
      focusConfirmButton,
      beginRun,
      beginAction,
      handleStreamEvent,
      completeResponse,
      failWithError,
    }),
    [
      activeInterestIndex,
      beginAction,
      beginRun,
      completeResponse,
      failWithError,
      flowConfig,
      focusConfirmButton,
      focusInput,
      focusRecommendation,
      focusSafety,
      handleStreamEvent,
      highlightRecommendations,
      loadingRecommendations,
      phase,
      reset,
      showEmptyError,
    ],
  );
}
