import { useCallback, type MutableRefObject } from 'react';

import type {
  FitMeetAlphaCard,
  UserFacingAgentResponse,
} from '../../api/socialAgentApi';
import type { FitMeetAssistantRecovery } from './FitMeetAssistantUI.types';
import {
  ASSISTANT_STREAMING_PLACEHOLDER,
  collapseRepeatedAssistantTextBlocks,
  findAssistantRunMessageIndex,
} from './useAgentMessageStream';
import {
  isSameAssistantAnswerSurface,
  normalizeAssistantTextForMerge,
} from './assistantTextDedupe';
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
import { mergeUniqueAgentCards } from './agentCardIdentity';
import {
  reduceSingleRunAssistantMessages,
  type AssistantRunMessageAnchor,
} from './agentAssistantMessageReducer';
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
  nextId,
}: UseAgentFinalResultRuntimeInput) {
  const mergePendingApprovalDispatchCards = useCallback(
    (finalResult: UserFacingAgentResponse): UserFacingAgentResponse => {
      const cards = pendingApprovalDispatchCardsRef.current;
      if (cards.length === 0) {
        return dedupeUserFacingResponseCards(finalResult);
      }
      pendingApprovalDispatchCardsRef.current = [];
      return dedupeUserFacingResponseCards({
        ...finalResult,
        cards: [...cards, ...finalResult.cards],
      });
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
        const reduce = (next: AgentThreadMessage[]) =>
          reduceSingleRunAssistantMessages(next);
        const last = current.at(-1);
        const runAnchor = resultRunMessageAnchor(displayResult);
        const anchoredIndex = findAssistantRunResultMergeIndex(
          current,
          runAnchor,
          finalMessage,
        );
        const assistantMessage = {
          id: nextId('assistant'),
          role: 'assistant',
          content: finalMessage,
          status: 'done',
          result: displayResult,
          taskId: findTaskId(displayResult) ?? activeTaskId,
          runId: runAnchor.runId ?? null,
          messageId: runAnchor.messageId ?? null,
          traceId: traceIdFromResult(displayResult),
          showSocialResult,
          conversationIntent,
          surfaceKind: 'answer',
          assistantMessageSource: displayResult.assistantMessageSource,
          branchable: !fallbackSourced,
        } satisfies AgentThreadMessage;
        if (anchoredIndex >= 0) {
          const anchored = current[anchoredIndex];
          const previousContent =
            anchored.content === ASSISTANT_STREAMING_PLACEHOLDER ? '' : anchored.content;
          return reduce([
            ...current.slice(0, anchoredIndex),
            {
              ...anchored,
              content: mergeAssistantFinalText(previousContent, finalMessage),
              status: 'done',
              result: displayResult,
              taskId: findTaskId(displayResult) ?? activeTaskId,
              runId: runAnchor.runId ?? anchored.runId ?? null,
              messageId: runAnchor.messageId ?? anchored.messageId ?? null,
              traceId: traceIdFromResult(displayResult),
              branch:
                createBranchForNextAssistantRef.current && !fallbackSourced
                  ? branchForAssistant(current, anchored.id)
                  : anchored.branch,
              createsBranch:
                createBranchForNextAssistantRef.current && !fallbackSourced
                  ? true
                  : anchored.createsBranch,
              showSocialResult,
              conversationIntent,
              surfaceKind: 'answer',
              assistantMessageSource:
                displayResult.assistantMessageSource ?? anchored.assistantMessageSource,
              branchable:
                !fallbackSourced && anchored.assistantMessageSource !== 'fallback',
            },
            ...current.slice(anchoredIndex + 1),
          ]);
        }
        if (last?.role === 'assistant' && last.status === 'streaming') {
          const previousContent =
            last.content === ASSISTANT_STREAMING_PLACEHOLDER ? '' : last.content;
          const mergedContent = mergeAssistantFinalText(previousContent, finalMessage);
          return reduce([
            ...current.slice(0, -1),
            {
              ...last,
              content: mergedContent,
              status: 'done',
              result: displayResult,
              taskId: findTaskId(displayResult) ?? activeTaskId,
              runId: runAnchor.runId ?? last.runId ?? null,
              messageId: runAnchor.messageId ?? last.messageId ?? null,
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
          ]);
        }
        if (last?.role === 'assistant' && last.status === 'done' && last.content.trim()) {
          if (!last.result) {
            return reduce([
              ...current.slice(0, -1),
              {
                ...last,
                content: mergeAssistantFinalText(last.content, finalMessage),
                result: displayResult,
                taskId: findTaskId(displayResult) ?? activeTaskId,
                runId: runAnchor.runId ?? last.runId ?? null,
                messageId: runAnchor.messageId ?? last.messageId ?? null,
                traceId: traceIdFromResult(displayResult),
                showSocialResult,
                conversationIntent,
                surfaceKind: 'answer',
                assistantMessageSource: displayResult.assistantMessageSource,
                branchable: !fallbackSourced,
              },
            ]);
          }
          if (last.content.trim() !== finalMessage.trim()) {
            if (isSameAssistantAnswerSurface(last.content, finalMessage)) {
              return reduce([
                ...current.slice(0, -1),
                {
                  ...last,
                  result: displayResult,
                  taskId: findTaskId(displayResult) ?? activeTaskId,
                  runId: runAnchor.runId ?? last.runId ?? null,
                  messageId: runAnchor.messageId ?? last.messageId ?? null,
                  traceId: traceIdFromResult(displayResult),
                  showSocialResult,
                  conversationIntent,
                  surfaceKind: 'answer',
                  assistantMessageSource: displayResult.assistantMessageSource,
                  branchable: !fallbackSourced,
                },
              ]);
            }
            return reduce([...current, assistantMessage]);
          }
          return current;
        }
        return reduce([...current, assistantMessage]);
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
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function dedupeUserFacingResponseCards(
  result: UserFacingAgentResponse,
): UserFacingAgentResponse {
  const cards = mergeUniqueAgentCards([], result.cards);
  if (cards.length === result.cards.length) return result;
  return { ...result, cards };
}

function resultRunMessageAnchor(
  result: UserFacingAgentResponse,
): AssistantRunMessageAnchor {
  return {
    runId: stringFromUnknown(result.runtime?.runId),
    messageId: stringFromUnknown(result.runtime?.messageId),
  };
}

export function mergeAssistantFinalText(previous: string, finalMessage: string): string {
  const previousText = previous === ASSISTANT_STREAMING_PLACEHOLDER ? '' : previous;
  const previousNorm = normalizeAssistantTextForMerge(previousText);
  const finalNorm = normalizeAssistantTextForMerge(finalMessage);
  if (!previousNorm) return collapseRepeatedAssistantTextBlocks(finalMessage);
  if (!finalNorm) return collapseRepeatedAssistantTextBlocks(previousText);
  if (previousNorm === finalNorm) return collapseRepeatedAssistantTextBlocks(previousText);
  if (previousNorm.includes(finalNorm)) return collapseRepeatedAssistantTextBlocks(previousText);
  if (finalNorm.includes(previousNorm)) return collapseRepeatedAssistantTextBlocks(finalMessage);
  if (
    !isTransientAssistantStatusText(previousNorm) &&
    isGenericIdleAssistantText(finalNorm)
  ) {
    return collapseRepeatedAssistantTextBlocks(previousText);
  }
  if (shouldPreferFinalAnswerText(previousText, finalMessage)) {
    return collapseRepeatedAssistantTextBlocks(finalMessage);
  }
  return collapseRepeatedAssistantTextBlocks(previousText);
}

function shouldPreferFinalAnswerText(previous: string, finalMessage: string): boolean {
  const previousNorm = normalizeAssistantTextForMerge(previous);
  const finalNorm = normalizeAssistantTextForMerge(finalMessage);
  if (!previousNorm || !finalNorm) return false;
  if (isTransientAssistantStatusText(previousNorm)) return finalNorm.length >= 8;
  if (previousNorm.length <= 64 && finalNorm.length >= previousNorm.length + 18) {
    return true;
  }
  return false;
}

function isTransientAssistantStatusText(value: string): boolean {
  return /^(正在|已记录|已整理|正在整理|正在理解|正在查找|正在筛选|正在检查|可以继续|当前进度|刚才连接不稳)/.test(
    value,
  ) || /[.。…]$/.test(value) && value.length <= 42 && /正在|继续|整理|查找|筛选|检查/.test(value);
}

function isGenericIdleAssistantText(value: string): boolean {
  return /^(你好[，,]?\s*我在|你可以随便聊|等你明确说要找人|等你明确说要找活动|我主要能帮你做这几件事)/.test(
    value,
  );
}

export function findAssistantRunResultMergeIndex(
  messages: AgentThreadMessage[],
  anchor: AssistantRunMessageAnchor,
  finalMessage: string,
): number {
  const anchoredIndex = findAssistantRunMessageIndex(messages, anchor);
  if (anchoredIndex >= 0) return anchoredIndex;
  const finalNorm = normalizeAssistantTextForMerge(finalMessage);
  for (let index = messages.length - 1; index >= Math.max(0, messages.length - 6); index -= 1) {
    const message = messages[index];
    if (message.role !== 'assistant' || message.surfaceKind === 'recovery') continue;
    if (message.status === 'streaming') return index;
    const content = message.content === ASSISTANT_STREAMING_PLACEHOLDER ? '' : message.content;
    if (!content.trim()) continue;
    if (!message.result && (!finalNorm || isSameAssistantAnswerSurface(content, finalMessage))) {
      return index;
    }
    if (message.result && isSameAssistantAnswerSurface(content, finalMessage)) {
      return index;
    }
  }
  return -1;
}
