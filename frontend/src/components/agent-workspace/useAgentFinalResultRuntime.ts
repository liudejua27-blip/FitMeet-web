import { useCallback, type MutableRefObject } from 'react';

import type {
  FitMeetAlphaCard,
  UserFacingAgentResponse,
} from '../../api/socialAgentApi';
import type { FitMeetAssistantRecovery } from './FitMeetAssistantUI.types';
import { ASSISTANT_STREAMING_PLACEHOLDER } from './useAgentMessageStream';
import {
  assistantMessageForUserFacingResult,
  branchForAssistant,
  findTaskId,
  isGenericRecoveryAssistantText,
  intentForResponse,
  isApprovalProgressStepId,
  isFallbackAssistantResponse,
  isNonAnswerFallbackResponse,
  recoveryFromUserFacingResponse,
  responseAwaitsOpportunityClarification,
  responseRequiresApproval,
  stepIdFromLightStatus,
  traceIdFromResult,
} from './agentWorkspaceRuntime';
import type {
  AgentConversationIntent,
  AgentThreadMessage,
  Step,
} from './socialAgentThreadStore';

type SetState<T> = (value: T | ((current: T) => T)) => void;

type UseAgentFinalResultRuntimeInput = {
  activeTaskId: number | null;
  messages: AgentThreadMessage[];
  finishedRef: MutableRefObject<boolean>;
  runConversationIntentRef: MutableRefObject<AgentConversationIntent>;
  createBranchForNextAssistantRef: MutableRefObject<boolean>;
  pendingOpportunityClarificationRef: MutableRefObject<boolean>;
  pendingApprovalDispatchCardsRef: MutableRefObject<FitMeetAlphaCard[]>;
  setUserResult: SetState<UserFacingAgentResponse | null>;
  setRecovery: SetState<FitMeetAssistantRecovery | null>;
  setMessages: SetState<AgentThreadMessage[]>;
  setSteps: SetState<Step[]>;
  settleStreamingAssistantAfterInterruption: (status?: 'done' | 'error') => void;
  publicText: (value: unknown, fallback: string) => string;
  nextId: (prefix: string) => string;
};

export function useAgentFinalResultRuntime({
  activeTaskId,
  messages,
  finishedRef,
  runConversationIntentRef,
  createBranchForNextAssistantRef,
  pendingOpportunityClarificationRef,
  pendingApprovalDispatchCardsRef,
  setUserResult,
  setRecovery,
  setMessages,
  setSteps,
  settleStreamingAssistantAfterInterruption,
  publicText,
  nextId,
}: UseAgentFinalResultRuntimeInput) {
  const mergePendingApprovalDispatchCards = useCallback(
    (finalResult: UserFacingAgentResponse): UserFacingAgentResponse => {
      const cards = pendingApprovalDispatchCardsRef.current;
      if (cards.length === 0) return finalResult;
      pendingApprovalDispatchCardsRef.current = [];
      const existingApprovalIds = new Set(
        finalResult.cards.map((card) => stringFromUnknown(card.data.approvalId)).filter(Boolean),
      );
      const nextCards = cards.filter((card) => {
        const approvalId = stringFromUnknown(card.data.approvalId);
        return !approvalId || !existingApprovalIds.has(approvalId);
      });
      if (nextCards.length === 0) return finalResult;
      return {
        ...finalResult,
        cards: [...nextCards, ...finalResult.cards],
      };
    },
    [pendingApprovalDispatchCardsRef],
  );

  const finishUserFacing = useCallback(
    (finalResult: UserFacingAgentResponse) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      const displayResult = mergePendingApprovalDispatchCards(finalResult);
      if (isNonAnswerFallbackResponse(displayResult)) {
        const prompt =
          [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
        setUserResult(null);
        setMessages((current) => {
          const last = current.at(-1);
          if (
            last?.role === 'assistant' &&
            (last.assistantMessageSource === 'fallback' ||
              isGenericRecoveryAssistantText(last.content)) &&
            !last.result
          ) {
            return current.slice(0, -1);
          }
          return current;
        });
        setRecovery(recoveryFromUserFacingResponse(displayResult, prompt));
        settleStreamingAssistantAfterInterruption('error');
        setSteps((current) =>
          current.map((step) => (step.status === 'running' ? { ...step, status: 'error' } : step)),
        );
        createBranchForNextAssistantRef.current = false;
        return;
      }
      setUserResult(displayResult);
      setRecovery(null);
      const finalMessage = assistantMessageForUserFacingResult(
        displayResult,
        '我整理好了，可以继续追问或让我接着处理下一步。',
      );
      const fallbackSourced = isFallbackAssistantResponse(displayResult);
      const conversationIntent = intentForResponse(displayResult, runConversationIntentRef.current);
      const showSocialResult = conversationIntent === 'social' || conversationIntent === 'approval';
      pendingOpportunityClarificationRef.current =
        responseAwaitsOpportunityClarification(displayResult);
      setMessages((current) => {
        const last = current.at(-1);
        const assistantMessage = {
          id: nextId('assistant'),
          role: 'assistant',
          content: finalMessage,
          status: 'done',
          result: displayResult,
          taskId: findTaskId(displayResult) ?? activeTaskId,
          traceId: traceIdFromResult(displayResult),
          showSocialResult,
          conversationIntent,
          surfaceKind: 'answer',
          assistantMessageSource: displayResult.assistantMessageSource,
          branchable: !fallbackSourced,
        } satisfies AgentThreadMessage;
        if (last?.role === 'assistant' && last.status === 'streaming') {
          const previousContent =
            last.content === ASSISTANT_STREAMING_PLACEHOLDER ? '' : last.content;
          return [
            ...current.slice(0, -1),
            {
              ...last,
              content: previousContent.trim() ? previousContent : finalMessage,
              status: 'done',
              result: displayResult,
              taskId: findTaskId(displayResult) ?? activeTaskId,
              traceId: traceIdFromResult(displayResult),
              branch: createBranchForNextAssistantRef.current && !fallbackSourced
                ? branchForAssistant(current, last.id)
                : undefined,
              createsBranch: createBranchForNextAssistantRef.current && !fallbackSourced,
              showSocialResult,
              conversationIntent,
              surfaceKind: 'answer',
              assistantMessageSource:
                displayResult.assistantMessageSource ?? last.assistantMessageSource,
              branchable: !fallbackSourced && last.assistantMessageSource !== 'fallback',
            },
          ];
        }
        if (last?.role === 'assistant' && last.status === 'done' && last.content.trim()) {
          if (!last.result) {
            return [
              ...current.slice(0, -1),
              {
                ...last,
                result: displayResult,
                taskId: findTaskId(displayResult) ?? activeTaskId,
                traceId: traceIdFromResult(displayResult),
                showSocialResult,
                conversationIntent,
                surfaceKind: 'answer',
                assistantMessageSource: displayResult.assistantMessageSource,
                branchable: !fallbackSourced,
              },
            ];
          }
          if (last.content.trim() !== finalMessage.trim()) {
            return [...current, assistantMessage];
          }
          return current;
        }
        return [...current, assistantMessage];
      });
      createBranchForNextAssistantRef.current = false;
      const awaitingApproval = responseRequiresApproval(displayResult);
      const lightStatusStepId = stepIdFromLightStatus(displayResult.lightStatus);
      setSteps((current) =>
        current.map((step) => ({
          ...step,
          status:
            awaitingApproval && isApprovalProgressStepId(step.id)
              ? 'waiting'
              : step.id === lightStatusStepId &&
                  !(awaitingApproval && isApprovalProgressStepId(step.id))
                ? 'success'
                : step.status === 'running' ||
                    (step.status === 'pending' && !isApprovalProgressStepId(step.id))
                  ? 'success'
                  : step.status,
        })),
      );
    },
    [
      activeTaskId,
      createBranchForNextAssistantRef,
      finishedRef,
      mergePendingApprovalDispatchCards,
      messages,
      nextId,
      pendingOpportunityClarificationRef,
      publicText,
      runConversationIntentRef,
      setMessages,
      setRecovery,
      setSteps,
      setUserResult,
      settleStreamingAssistantAfterInterruption,
    ],
  );

  return { finishUserFacing };
}

function stringFromUnknown(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
