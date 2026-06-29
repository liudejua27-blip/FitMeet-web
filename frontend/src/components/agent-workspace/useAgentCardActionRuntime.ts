import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';

import {
  submitAgentFeedbackEvent,
  type AgentFeedbackReasonCode,
} from '../../api/agentFeedbackApi';
import type {
  FitMeetAgentCardExecutableAction,
  FitMeetAgentSchemaAction,
  UserFacingAgentResponse,
} from '../../api/socialAgentApi';
import type { ToolUISchemaAction } from '../assistant-ui/tool-ui-schema';
import { toolUISchemaActionFromUnknown } from '../assistant-ui/tool-ui-schema';
import type { FitMeetAssistantRecovery } from './FitMeetAssistantUI.types';
import { type AgentAdapter, type AgentError, type AgentStreamEvent, mapAgentError } from './api';
import type { AgentConversationIntent, Step } from './socialAgentThreadStore';

type SetState<T> = (value: T | ((current: T) => T)) => void;

type CardActionInput = {
  taskId?: number | string | null;
  action?: string | null;
  schemaAction?: string | null;
  payload?: Record<string, unknown>;
};

type UseAgentCardActionRuntimeInput = {
  isRunning: boolean;
  activeTaskId: number | null;
  currentGoal: string;
  agentAdapter: AgentAdapter;
  actionSteps: Step[];
  finishedRef: MutableRefObject<boolean>;
  stopRequestedRef: MutableRefObject<boolean>;
  runConversationIntentRef: MutableRefObject<AgentConversationIntent>;
  setRecovery: SetState<FitMeetAssistantRecovery | null>;
  setIsRunning: SetState<boolean>;
  setSteps: SetState<Step[]>;
  setActiveTaskId: SetState<number | null>;
  beginAbortableRun: (controller: AbortController) => void;
  finishAbortableRun: () => void;
  appendStreamingAssistant: (taskId: number | null, intent: AgentConversationIntent) => void;
  handleAgentStreamEvent: (event: AgentStreamEvent) => void;
  finishUserFacing: (response: UserFacingAgentResponse) => void;
  settleStreamingAssistantAfterInterruption: () => void;
  refreshThreads: () => Promise<void> | void;
  isAbortError: (error: unknown) => boolean;
  createRecoveryFromError: (error: AgentError, prompt: string) => FitMeetAssistantRecovery;
};

export function useAgentCardActionRuntime({
  isRunning,
  activeTaskId,
  currentGoal,
  agentAdapter,
  actionSteps,
  finishedRef,
  stopRequestedRef,
  runConversationIntentRef,
  setRecovery,
  setIsRunning,
  setSteps,
  setActiveTaskId,
  beginAbortableRun,
  finishAbortableRun,
  appendStreamingAssistant,
  handleAgentStreamEvent,
  finishUserFacing,
  settleStreamingAssistantAfterInterruption,
  refreshThreads,
  isAbortError,
  createRecoveryFromError,
}: UseAgentCardActionRuntimeInput) {
  const isRunningRef = useRef(isRunning);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  const runSlotCompletionMessageAction = useCallback(
    async ({
      action,
      input,
      taskId,
    }: {
      action: FitMeetAgentCardExecutableAction;
      input?: CardActionInput;
      taskId: number;
    }) => {
      const message = slotCompletionMessageForAction(action, input?.payload);
      if (!message) throw new Error('当前补充动作缺少可发送内容。');
      isRunningRef.current = true;
      runConversationIntentRef.current = 'social';
      setRecovery(null);
      setIsRunning(true);
      setSteps(
        actionSteps.map((step, index) => ({
          ...step,
          status: index === 0 ? 'running' : 'pending',
        })),
      );
      appendStreamingAssistant(taskId, 'social');
      const controller = new AbortController();
      beginAbortableRun(controller);
      try {
        const finalResult = await agentAdapter.run(
          {
            goal: message,
            permissionMode: 'confirm',
            conversationIntent: 'social',
            taskId,
            idempotencyKey: idempotencyKeyForCardAction(
              taskId,
              action,
              input?.payload,
            ),
          },
          {
            onEvent: handleAgentStreamEvent,
            signal: controller.signal,
          },
        );
        setActiveTaskId(finalResult.taskId ?? taskId);
        if (!finishedRef.current) finishUserFacing(finalResult.response);
        void refreshThreads();
        return finalResult.response;
      } catch (error) {
        const stopped = stopRequestedRef.current || isAbortError(error);
        if (stopped) {
          settleStreamingAssistantAfterInterruption();
        } else {
          setRecovery(createRecoveryFromError(mapAgentError(error), currentGoal));
        }
        setSteps((current) =>
          current.map((step) =>
            step.status === 'running'
              ? { ...step, status: stopped ? 'pending' : 'error' }
              : step,
          ),
        );
        if (!stopped) throw error;
      } finally {
        isRunningRef.current = false;
        setIsRunning(false);
        finishAbortableRun();
      }
    },
    [
      actionSteps,
      agentAdapter,
      appendStreamingAssistant,
      beginAbortableRun,
      createRecoveryFromError,
      currentGoal,
      finishAbortableRun,
      finishUserFacing,
      finishedRef,
      handleAgentStreamEvent,
      isAbortError,
      refreshThreads,
      runConversationIntentRef,
      setActiveTaskId,
      setIsRunning,
      setRecovery,
      setSteps,
      settleStreamingAssistantAfterInterruption,
      stopRequestedRef,
    ],
  );

  const runCardActionStream = useCallback(
    async (input?: CardActionInput) => {
      if (isRunningRef.current) throw new Error('上一轮还在生成，请先停止或等待它完成。');
      const taskId =
        numberFromUnknown(input?.taskId) ??
        numberFromUnknown(input?.payload?.taskId) ??
        activeTaskId;
      if (!taskId) throw new Error('当前卡片缺少任务上下文，不能继续执行。');
      const action = schemaActionFromToolInput(input?.schemaAction);
      if (!action) throw new Error('当前卡片动作暂时不可执行。');

      if (isSlotCompletionMessageAction(action)) {
        return runSlotCompletionMessageAction({
          action,
          input,
          taskId,
        });
      }

      if (isCandidateFeedbackAction(action)) {
        await submitAgentFeedbackEvent({
          taskId,
          publicIntentId: stringFromUnknown(input?.payload?.publicIntentId) || null,
          matchingJobId: numberFromUnknown(input?.payload?.matchingJobId),
          candidateId:
            numberFromUnknown(input?.payload?.targetUserId) ??
            numberFromUnknown(input?.payload?.candidateUserId) ??
            numberFromUnknown(input?.payload?.candidateId),
          candidateRecordId:
            numberFromUnknown(input?.payload?.candidateRecordId) ??
            numberFromUnknown(input?.payload?.socialRequestCandidateId),
          feedbackType: 'candidate_quality',
          reasonCode: candidateFeedbackReasonCode(action),
          source: 'agent_candidate_card',
          metadata: {
            cardId: input?.payload?.cardId ?? input?.payload?.id ?? null,
            candidate: input?.payload?.candidate ?? null,
            action,
          },
        });
        return candidateFeedbackResponse(taskId, action);
      }

      isRunningRef.current = true;
      runConversationIntentRef.current =
        action === 'candidate.connect' ||
        action === 'opener.confirm_send' ||
        action === 'publish_to_discover' ||
        action === 'workout_draft.publish' ||
        action === 'activity.confirm_create' ||
        action === 'public_intent_application.accept'
          ? 'approval'
          : 'social';
      setRecovery(null);
      setIsRunning(true);
      setSteps(
        actionSteps.map((step, index) => ({
          ...step,
          status: index === 0 ? 'running' : 'pending',
        })),
      );

      const inlineActionResult = shouldRenderCardActionResultInline(action, input?.payload);
      let appendedActionResultMessage =
        !inlineActionResult && shouldAppendActionResultMessage(action, input?.payload);
      if (appendedActionResultMessage) {
        appendStreamingAssistant(taskId, runConversationIntentRef.current);
      }

      const controller = new AbortController();
      beginAbortableRun(controller);
      try {
        const finalResult = await agentAdapter.performAction(
          taskId,
          {
            action,
            payload: input?.payload ?? {},
            idempotencyKey: idempotencyKeyForCardAction(taskId, action, input?.payload),
          },
          {
            onEvent: (event) => {
              if (inlineActionResult) return;
              if (event.type === 'result') {
                const shouldAppendResult = shouldAppendCardActionResultMessage(
                  action,
                  event.result,
                  input?.payload,
                );
                if (!shouldAppendResult || inlineActionResult) return;
                if (!appendedActionResultMessage) {
                  appendStreamingAssistant(taskId, runConversationIntentRef.current);
                  appendedActionResultMessage = true;
                }
              }
              handleAgentStreamEvent(cardActionStreamEvent(action, event));
            },
            signal: controller.signal,
          },
        );
        setActiveTaskId(finalResult.taskId ?? taskId);
        if (!finishedRef.current) {
          if (
            !inlineActionResult &&
            shouldAppendCardActionResultMessage(action, finalResult.response, input?.payload)
          ) {
            if (!appendedActionResultMessage) {
              appendStreamingAssistant(taskId, runConversationIntentRef.current);
            }
            finishUserFacing({
              ...finalResult.response,
              assistantMessage: assistantMessageForCardAction(action, finalResult.response),
            });
          } else {
            finishedRef.current = true;
            setSteps((current) =>
              current.map((step) =>
                step.status === 'running' || step.status === 'pending'
                  ? { ...step, status: 'success' }
                  : step,
              ),
            );
          }
        }
        void refreshThreads();
        return finalResult.response;
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
        if (!stopped) throw error;
      } finally {
        isRunningRef.current = false;
        setIsRunning(false);
        finishAbortableRun();
      }
    },
    [
      actionSteps,
      activeTaskId,
      agentAdapter,
      appendStreamingAssistant,
      beginAbortableRun,
      createRecoveryFromError,
      currentGoal,
      finishAbortableRun,
      finishUserFacing,
      finishedRef,
      handleAgentStreamEvent,
      isAbortError,
      refreshThreads,
      runSlotCompletionMessageAction,
      runConversationIntentRef,
      setActiveTaskId,
      setIsRunning,
      setRecovery,
      setSteps,
      settleStreamingAssistantAfterInterruption,
      stopRequestedRef,
    ],
  );

  return { runCardActionStream };
}

function schemaActionFromToolInput(
  value: string | null | undefined,
): FitMeetAgentCardExecutableAction | null {
  const normalized = toolUISchemaActionFromUnknown(value);
  if (!normalized) return null;
  if (isExecutableToolUISchemaAction(normalized)) return normalized;
  return null;
}

function isExecutableToolUISchemaAction(
  value: ToolUISchemaAction,
): value is Extract<FitMeetAgentSchemaAction, ToolUISchemaAction> {
  return (
    value === 'candidate.like' ||
    value === 'candidate.skip' ||
    value === 'candidate.feedback.good_fit' ||
    value === 'candidate.feedback.bad_fit' ||
    value === 'candidate.feedback.too_far' ||
    value === 'candidate.feedback.time_mismatch' ||
    value === 'candidate.feedback.style_mismatch' ||
    value === 'candidate.more_like_this' ||
    value === 'candidate.view_detail' ||
    value === 'candidate.connect' ||
    value === 'candidate.generate_opener' ||
    value === 'opener.confirm_send' ||
    value === 'opener.regenerate' ||
    value === 'opener.reject' ||
    value === 'publish_to_discover' ||
    value === 'social_intent.decline_publish' ||
    value === 'social_intent.dismiss' ||
    value === 'social_intent.retry_publish' ||
    value === 'activity.confirm_create' ||
    value === 'activity.skip_publish' ||
    value === 'activity.modify_time' ||
    value === 'activity.modify_location' ||
    value === 'activity.check_in' ||
    value === 'activity.complete' ||
    value === 'activity.upload_proof' ||
    value === 'activity.view_detail' ||
    value === 'review.submit' ||
    value === 'life_graph.accept_update' ||
    value === 'life_graph.reject_update' ||
    value === 'meet_loop.resume' ||
    value === 'meet_loop.reschedule' ||
    value === 'slot_completion.use_default_safety' ||
    value === 'slot_completion.custom_safety' ||
    value === 'slot_completion.cancel' ||
    value === 'loop_choice.workout' ||
    value === 'loop_choice.friend' ||
    value === 'loop_choice.travel' ||
    value === 'clarification.yes' ||
    value === 'clarification.no' ||
    value === 'workout_intake.submit' ||
    value === 'workout_intake.use_defaults' ||
    value === 'workout_intake.cancel' ||
    value === 'workout_draft.publish' ||
    value === 'workout_draft.private_match' ||
    value === 'workout_draft.edit' ||
    value === 'workout_draft.cancel' ||
    value === 'public_intent_application.accept' ||
    value === 'public_intent_application.reject' ||
    value === 'public_intent_application.view_profile' ||
    value === 'public_intent_application.open_conversation'
  );
}

function isSlotCompletionMessageAction(action: FitMeetAgentCardExecutableAction) {
  return (
    action === 'slot_completion.use_default_safety' ||
    action === 'slot_completion.custom_safety' ||
    action === 'slot_completion.cancel'
  );
}

function isCandidateFeedbackAction(action: FitMeetAgentCardExecutableAction) {
  return (
    action === 'candidate.feedback.good_fit' ||
    action === 'candidate.feedback.bad_fit' ||
    action === 'candidate.feedback.too_far' ||
    action === 'candidate.feedback.time_mismatch' ||
    action === 'candidate.feedback.style_mismatch'
  );
}

function candidateFeedbackReasonCode(
  action: FitMeetAgentCardExecutableAction,
): AgentFeedbackReasonCode {
  if (action === 'candidate.feedback.good_fit') return 'good_fit';
  if (action === 'candidate.feedback.too_far') return 'too_far';
  if (action === 'candidate.feedback.time_mismatch') return 'time_mismatch';
  if (action === 'candidate.feedback.style_mismatch') return 'style_mismatch';
  return 'bad_fit';
}

function candidateFeedbackResponse(
  taskId: number,
  action: FitMeetAgentCardExecutableAction,
): UserFacingAgentResponse {
  return {
    taskId,
    assistantMessage: candidateFeedbackMessage(action),
    assistantMessageSource: 'deterministic_action',
    lightStatus: '已整理回复',
    cards: [],
    safeStatus: {
      blocked: false,
      level: 'low',
      boundaryNotes: [],
      requiredConfirmations: [],
    },
    pendingConfirmations: [],
    permissionMode: 'confirm',
  };
}

function candidateFeedbackMessage(action: FitMeetAgentCardExecutableAction) {
  if (action === 'candidate.feedback.good_fit') {
    return '已记录“合适”，后续候选质量会参考这个信号。';
  }
  if (action === 'candidate.feedback.too_far') {
    return '已记录“太远”，后续会优先收紧地点范围。';
  }
  if (action === 'candidate.feedback.time_mismatch') {
    return '已记录“时间不对”，后续会更重视时间匹配。';
  }
  if (action === 'candidate.feedback.style_mismatch') {
    return '已记录“风格不对”，后续会调整互动风格偏好。';
  }
  return '已记录“不合适”，后续会减少类似候选。';
}

function slotCompletionMessageForAction(
  action: FitMeetAgentCardExecutableAction,
  payload: Record<string, unknown> | undefined,
) {
  const payloadMessage = stringFromUnknown(payload?.message);
  if (payloadMessage) return payloadMessage;
  if (action === 'slot_completion.use_default_safety') {
    return '按默认安全设置处理';
  }
  if (action === 'slot_completion.custom_safety') {
    return '我想自定义安全边界';
  }
  if (action === 'slot_completion.cancel') {
    return '取消这次约练卡发布';
  }
  return '';
}

const WORKOUT_ACTIONS_APPEND_FEEDBACK = new Set<FitMeetAgentCardExecutableAction>([
  'loop_choice.workout',
  'loop_choice.friend',
  'loop_choice.travel',
  'clarification.yes',
  'clarification.no',
  'workout_intake.submit',
  'workout_intake.use_defaults',
  'workout_intake.cancel',
  'workout_draft.publish',
  'workout_draft.private_match',
  'workout_draft.edit',
  'workout_draft.cancel',
]);

function shouldAppendActionResultMessage(
  action: FitMeetAgentCardExecutableAction,
  payload: Record<string, unknown> | undefined,
) {
  const confirmsExistingApproval = hasApprovalId(payload) || isSafetyApprovalCardPayload(payload);
  if (WORKOUT_ACTIONS_APPEND_FEEDBACK.has(action)) return true;
  if (action === 'candidate.more_like_this' && isPrivateCandidateContinuationPayload(payload)) {
    return true;
  }
  return (
    action === 'opener.reject' ||
    (action === 'candidate.connect' && confirmsExistingApproval) ||
    (action === 'opener.confirm_send' && confirmsExistingApproval) ||
    (action === 'publish_to_discover' && confirmsExistingApproval) ||
    (action === 'activity.confirm_create' && confirmsExistingApproval) ||
    action === 'public_intent_application.accept'
  );
}

function shouldRenderCardActionResultInline(
  action: FitMeetAgentCardExecutableAction,
  payload: Record<string, unknown> | undefined,
) {
  if (hasApprovalId(payload) || isSafetyApprovalCardPayload(payload)) return false;
  if (action === 'candidate.more_like_this' && isPrivateCandidateContinuationPayload(payload)) {
    return false;
  }
  return (
    action === 'candidate.view_detail' ||
    action === 'candidate.like' ||
    action === 'candidate.skip' ||
    action === 'candidate.more_like_this' ||
    action === 'candidate.generate_opener' ||
    action === 'activity.view_detail' ||
    action === 'activity.modify_time' ||
    action === 'activity.modify_location' ||
    action === 'activity.skip_publish' ||
    action === 'social_intent.decline_publish' ||
    action === 'social_intent.dismiss' ||
    action === 'candidate.connect' ||
    action === 'opener.confirm_send' ||
    action === 'opener.regenerate' ||
    action === 'publish_to_discover' ||
    action === 'workout_draft.publish' ||
    action === 'workout_draft.private_match' ||
    action === 'workout_draft.edit' ||
    action === 'workout_draft.cancel' ||
    action === 'activity.confirm_create' ||
    action === 'public_intent_application.reject' ||
    action === 'public_intent_application.view_profile' ||
    action === 'public_intent_application.open_conversation'
  );
}

function shouldAppendCardActionResultMessage(
  action: FitMeetAgentCardExecutableAction,
  response: UserFacingAgentResponse,
  payload?: Record<string, unknown>,
) {
  if (shouldAppendActionResultMessage(action, payload)) return true;
  if (action === 'candidate.view_detail' || action === 'activity.view_detail') {
    return response.cards.length > 0 || Boolean(response.assistantMessage.trim());
  }
  return false;
}

function isPrivateCandidateContinuationPayload(payload: Record<string, unknown> | undefined) {
  if (
    payload?.publicDiscoverPublishSkipped === true ||
    stringFromUnknown(payload?.sourceAction) === 'activity.skip_publish' ||
    stringFromUnknown(payload?.sourceAction) === 'social_intent.decline_publish'
  ) {
    return false;
  }
  return (
    payload?.privateMatchMode === true || Boolean(stringFromUnknown(payload?.candidateSearchMode))
  );
}

function hasApprovalId(payload: Record<string, unknown> | undefined) {
  return Boolean(numberFromUnknown(payload?.approvalId) ?? stringFromUnknown(payload?.approvalId));
}

function isSafetyApprovalCardPayload(payload: Record<string, unknown> | undefined) {
  return stringFromUnknown(payload?.schemaType) === 'safety.approval';
}

function idempotencyKeyForCardAction(
  taskId: number,
  action: FitMeetAgentCardExecutableAction,
  payload: Record<string, unknown> | undefined,
) {
  const explicit = stringFromUnknown(payload?.idempotencyKey);
  if (explicit) return explicit;
  const stableTarget =
    stringFromUnknown(payload?.approvalId) ||
    stringFromUnknown(payload?.candidateId) ||
    stringFromUnknown(payload?.candidateRecordId) ||
    stringFromUnknown(payload?.targetUserId) ||
    stringFromUnknown(payload?.applicationId) ||
    stringFromUnknown(payload?.publicIntentApplicationId) ||
    stringFromUnknown(payload?.socialRequestId) ||
    stringFromUnknown(payload?.questionKey) ||
    stringFromUnknown(payload?.publicIntentId) ||
    stringFromUnknown(payload?.activityId) ||
    stringFromUnknown(payload?.cardId) ||
    stringFromUnknown(payload?.message).slice(0, 48) ||
    'card';
  return `agent-card-action:${taskId}:${action}:${stableIdempotencyFragment(stableTarget)}`;
}

function stableIdempotencyFragment(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9:_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || 'card';
}

const CARD_ACTION_ASSISTANT_MESSAGES: Partial<Record<FitMeetAgentCardExecutableAction, string>> = {
  'candidate.connect': '已准备邀请请求，真正触达前仍会经过确认。',
  'opener.confirm_send': '已进入发送确认流程，发送结果会继续回到这段对话。',
  'opener.reject': '已取消这次发送，未联系对方。',
  publish_to_discover: '已发布到发现页，你可以从发现页查看这张约练卡。',
  'activity.confirm_create': '已准备活动发起流程，发布前仍会保留确认边界。',
  'activity.skip_publish': '已取消发布，不会出现在发现页，也不会继续匹配。',
  'social_intent.decline_publish': '已取消发布，不会出现在发现页，也不会继续匹配。',
  'social_intent.dismiss': '已隐藏这张约练卡，不会出现在发现页，也不会继续匹配。',
  'activity.modify_time': '已准备时间调整方案，真正改动前仍会等你确认。',
  'activity.modify_location': '已准备地点调整方案，真正改动前仍会等你确认。',
  'activity.check_in': '已记录到达状态，后续会继续跟进活动完成情况。',
  'activity.complete': '已记录活动完成，下一步可以留下简短评价。',
  'activity.upload_proof': '已进入证明上传流程，上传内容会按隐私规则处理。',
  'review.submit': '已提交这次评价，后续会用于改进推荐和约练闭环。',
  'meet_loop.resume': '已从约练进展继续推进，新的状态会回到消息流。',
  'meet_loop.reschedule': '已准备改期流程，改动前会继续征得确认。',
  'public_intent_application.accept': '已接受报名，正在准备会话和约练进展。',
  'public_intent_application.reject': '已暂不接受这次报名。',
  'public_intent_application.view_profile': '已打开申请人的公开资料。',
  'public_intent_application.open_conversation': '已进入消息页继续沟通。',
  'loop_choice.workout': '已进入约练闭环，我会帮你整理本次约练卡。',
  'loop_choice.friend': '交友闭环即将支持。当前可以先使用约练闭环。',
  'loop_choice.travel': '旅游闭环即将支持。当前可以先使用约练闭环。',
  'clarification.yes': '已按这个理解继续生成约练卡。',
  'clarification.no': '已切换为填写卡，你可以自己补充本次约练需求。',
  'workout_intake.submit': '已根据本次填写生成约练卡，确认前不会公开。',
  'workout_intake.use_defaults': '已使用默认安全设置继续生成约练卡。',
  'workout_intake.cancel': '已取消本次约练卡，不会发布或匹配。',
  'workout_draft.publish': '已发布到发现页，并进入约练匹配队列。',
  'workout_draft.private_match': '已保存为不公开约练卡，不会出现在发现页。',
  'workout_draft.edit': '可以继续修改本次约练需求。',
  'workout_draft.cancel': '已取消这次约练卡，不会发布或匹配。',
};

function assistantMessageForCardAction(
  action: FitMeetAgentCardExecutableAction,
  response: UserFacingAgentResponse,
) {
  return CARD_ACTION_ASSISTANT_MESSAGES[action] ?? response.assistantMessage;
}

function cardActionStreamEvent(
  action: FitMeetAgentCardExecutableAction,
  event: AgentStreamEvent,
): AgentStreamEvent {
  if (event.type !== 'result') return event;
  return {
    ...event,
    result: {
      ...event.result,
      assistantMessage: assistantMessageForCardAction(action, event.result),
    },
  };
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

export const agentCardActionRuntimeTestUtils = {
  schemaActionFromToolInput,
  shouldAppendActionResultMessage,
  shouldRenderCardActionResultInline,
  idempotencyKeyForCardAction,
};
