import { useCallback, type MutableRefObject } from 'react';

import type {
  AgentApprovalDispatchResult,
} from '../../api/agentApprovalsApi';
import type {
  FitMeetAlphaCard,
  UserFacingAgentResponse,
} from '../../api/socialAgentApi';
import type {
  AgentThreadMessage,
} from './socialAgentThreadStore';
import { agentCardApprovalId, mergeUniqueAgentCards } from './agentCardIdentity';

type SetState<T> = (value: T | ((current: T) => T)) => void;

type AppendApprovalDispatchInput = {
  approvalId: number;
  actionType?: string | null;
  dispatchResult?: AgentApprovalDispatchResult;
  taskId?: number | null;
  targetMessageId?: string | null;
  targetCardId?: string | null;
  suppressStandalone?: boolean;
};

type UseAgentApprovalDispatchMessagesInput = {
  activeTaskId: number | null;
  pendingApprovalDispatchCardsRef: MutableRefObject<FitMeetAlphaCard[]>;
  setMessages: SetState<AgentThreadMessage[]>;
  nextId: (prefix: string) => string;
};

export function useAgentApprovalDispatchMessages({
  activeTaskId,
  pendingApprovalDispatchCardsRef,
  setMessages,
  nextId,
}: UseAgentApprovalDispatchMessagesInput) {
  const appendApprovalDispatchResultMessage = useCallback(
    (input: AppendApprovalDispatchInput) => {
      const response = responseFromApprovalDispatchResult(input);
      if (!response) return null;

      pendingApprovalDispatchCardsRef.current = mergeUniqueAgentCards(
        pendingApprovalDispatchCardsRef.current,
        response.cards,
      );
      setMessages((current) =>
        mergeApprovalDispatchResponseIntoMessages({
          activeTaskId,
          current,
          input,
          nextId,
          response,
        }),
      );
      return response;
    },
    [activeTaskId, nextId, pendingApprovalDispatchCardsRef, setMessages],
  );

  return { appendApprovalDispatchResultMessage };
}

export function mergeApprovalDispatchResponseIntoMessages(input: {
  activeTaskId: number | null;
  current: AgentThreadMessage[];
  input: AppendApprovalDispatchInput;
  nextId: (prefix: string) => string;
  response: UserFacingAgentResponse;
}) {
  const hasRenderedCard = (message: AgentThreadMessage) =>
    message.result?.cards.some(
      (card) =>
        agentCardApprovalId(card.data) === String(input.input.approvalId) &&
        card.schemaType === 'meet_loop.timeline',
    ) === true;
  if (input.current.some(hasRenderedCard)) return input.current;

  const explicitTargetIndex = input.current.findIndex(
    (message) =>
      input.input.targetMessageId &&
      (message.id === input.input.targetMessageId ||
        String(message.messageId ?? '') === String(input.input.targetMessageId)),
  );
  const cardTargetIndex = input.current.findIndex(
    (message) =>
      input.input.targetCardId &&
      message.result?.cards.some((card) => card.id === input.input.targetCardId),
  );
  const targetIndex =
    explicitTargetIndex >= 0
      ? explicitTargetIndex
      : cardTargetIndex >= 0
        ? cardTargetIndex
        : input.current.findIndex(
            (message) =>
              message.role === 'assistant' &&
              message.result &&
              (message.resolvedApproval?.id === input.input.approvalId ||
                message.result.pendingConfirmations.some(
                  (confirmation) => String(confirmation.id) === String(input.input.approvalId),
                ) ||
                message.result.cards.some(
                  (card) => agentCardApprovalId(card.data) === String(input.input.approvalId),
                )),
          );
  if (targetIndex >= 0) {
    return input.current.map((message, index) =>
      index === targetIndex && message.result
        ? {
            ...message,
            result: {
              ...message.result,
              cards: mergeUniqueAgentCards(message.result.cards, input.response.cards),
            },
            showSocialResult: true,
            conversationIntent: 'approval' as const,
          }
        : message,
    );
  }

  if (input.input.suppressStandalone) return input.current;

  return [
    ...input.current,
    {
      id: input.nextId('assistant'),
      role: 'assistant' as const,
      content: input.response.assistantMessage,
      status: 'done' as const,
      result: input.response,
      taskId: input.input.taskId ?? input.activeTaskId,
      conversationIntent: 'approval' as const,
      showSocialResult: true,
    },
  ];
}

export function mergeUniqueApprovalDispatchCards(
  existing: FitMeetAlphaCard[],
  incoming: FitMeetAlphaCard[],
) {
  return mergeUniqueAgentCards(existing, incoming);
}

function responseFromApprovalDispatchResult(input: {
  approvalId: number;
  actionType?: string | null;
  dispatchResult?: AgentApprovalDispatchResult;
  taskId?: number | null;
}): UserFacingAgentResponse | null {
  const result = input.dispatchResult;
  if (!result) return null;
  const targetUserId = numberFromUnknown(result.targetUserId);
  const conversationId = stringIdFromUnknown(result.conversationId);
  const friendRequestId = stringIdFromUnknown(result.friendRequestId);
  if (!targetUserId && !conversationId && !friendRequestId) return null;
  const candidateRecordId = numberFromUnknown(result.candidateRecordId);
  const socialRequestId = numberFromUnknown(result.socialRequestId);
  const actionType =
    stringFromUnknown(input.actionType) ??
    stringFromUnknown(result.actionType) ??
    (friendRequestId ? 'connect_candidate' : 'send_invite');
  const openedConversation = result.openedConversation === true || Boolean(conversationId);
  const assistantMessage = openedConversation
    ? '已按你的确认建立站内沟通入口。接下来先等对方回复；如果需要，我也可以继续帮你调整节奏或准备后续话术。'
    : '已按你的确认完成连接请求。接下来先等对方回复，我会把后续进展继续放在这段对话里。';

  return {
    assistantMessage,
    lightStatus: '已整理回复',
    cards: [
      {
        id: `approval-${input.approvalId}-meet-loop`,
        type: 'review_card',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'meet_loop.timeline',
        title: '邀约进展',
        body: openedConversation
          ? '确认已完成，站内沟通入口已经准备好。'
          : '确认已完成，连接请求已经进入后续等待状态。',
        status: 'completed',
        data: {
          schemaName: 'MeetLoopTimelineCard',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'meet_loop.timeline',
          approvalId: input.approvalId,
          actionType,
          taskId: input.taskId ?? null,
          candidateUserId: targetUserId,
          targetUserId,
          candidateRecordId,
          socialRequestId,
          conversationId: conversationId || null,
          friendRequestId: friendRequestId || null,
          loopStage: 'waiting_reply',
          nextAction: '等待对方回复；你也可以让我继续准备更自然的后续沟通。',
          timeline: {
            title: '邀约进展',
            description: openedConversation
              ? '已通过你的确认建立站内沟通入口，后续回复、改期、确认和评价会继续保存在同一条进展里。'
              : '已通过你的确认发起连接请求，后续状态会继续保存在同一条进展里。',
            nextAction: '等待对方回复；如果时间不合适，可以继续改期或换一个机会。',
            stage: 'waiting_reply',
            steps: [
              {
                key: 'draft',
                label: '发起',
                state: 'done',
                description: '邀请动作已由你确认。',
                actionLabel: '已确认',
                checkpointReady: false,
                resumeMode: 'resume',
              },
              {
                key: 'sent',
                label: '等待回复',
                state: 'current',
                description: openedConversation
                  ? '站内沟通入口已准备好，等待对方回应。'
                  : '连接请求已发起，等待对方回应。',
                actionLabel: '等待回复',
                checkpointReady: true,
                resumeMode: 'resume',
              },
            ],
          },
        },
        actions: [],
      },
    ],
    safeStatus: {
      blocked: false,
      level: 'medium',
      boundaryNotes: ['确认前没有执行真实连接动作', '后续沟通仍建议先站内、公共场景、低压力推进'],
      requiredConfirmations: [],
    },
    pendingConfirmations: [],
    permissionMode: 'limited_auto',
  };
}

function stringIdFromUnknown(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return stringFromUnknown(value);
}

function stringFromUnknown(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' ? value.trim() : '';
}

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
