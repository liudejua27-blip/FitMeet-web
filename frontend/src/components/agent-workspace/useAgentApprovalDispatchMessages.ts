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

type SetState<T> = (value: T | ((current: T) => T)) => void;

type AppendApprovalDispatchInput = {
  approvalId: number;
  dispatchResult?: AgentApprovalDispatchResult;
  taskId?: number | null;
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
      if (!response) return;

      pendingApprovalDispatchCardsRef.current = [
        ...pendingApprovalDispatchCardsRef.current,
        ...response.cards,
      ];
      setMessages((current) => {
        const hasRenderedCard = (message: AgentThreadMessage) =>
          message.result?.cards.some(
            (card) =>
              stringFromUnknown(card.data.approvalId) === String(input.approvalId) &&
              card.schemaType === 'meet_loop.timeline',
          ) === true;
        if (current.some(hasRenderedCard)) return current;

        const targetIndex = current.findIndex(
          (message) =>
            message.role === 'assistant' &&
            message.result &&
            (message.resolvedApproval?.id === input.approvalId ||
              message.result.pendingConfirmations.some(
                (confirmation) => String(confirmation.id) === String(input.approvalId),
              )),
        );
        if (targetIndex >= 0) {
          return current.map((message, index) =>
            index === targetIndex && message.result
              ? {
                  ...message,
                  result: {
                    ...message.result,
                    cards: [...message.result.cards, ...response.cards],
                  },
                  showSocialResult: true,
                  conversationIntent: 'approval',
                }
              : message,
          );
        }

        return [
          ...current,
          {
            id: nextId('assistant'),
            role: 'assistant',
            content: response.assistantMessage,
            status: 'done',
            result: response,
            taskId: input.taskId ?? activeTaskId,
            conversationIntent: 'approval',
            showSocialResult: true,
          },
        ];
      });
    },
    [activeTaskId, nextId, pendingApprovalDispatchCardsRef, setMessages],
  );

  return { appendApprovalDispatchResultMessage };
}

function responseFromApprovalDispatchResult(input: {
  approvalId: number;
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
