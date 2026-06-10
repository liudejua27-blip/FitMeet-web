import type {
  FitMeetAlphaCard,
  UserFacingAgentResponse,
} from '../../../api/socialAgentApi';
import { AGENT_FLOW_INTERESTS, getAgentFlowPhaseConfig } from '../agentFlow.constants';
import type { AgentAdapter } from './agentAdapter.types';
import type {
  AgentActionRequest,
  AgentLifecycle,
  AgentRunResponse,
  AgentStreamEvent,
} from './agentApi.types';

const MOCK_TASK_ID = 9001;

function includesSensitiveIntent(goal: string) {
  return /线下|见面|联系方式|微信|手机号|跳过站内聊|直接约|加好友/.test(goal);
}

export function createMockAgentAdapter(): AgentAdapter {
  return {
    async run(request, handlers) {
      assertNotAborted(handlers.signal);
      if (!request.goal.trim()) throw new Error('MISSING_INFO');

      const analyzingDuration = getAgentFlowPhaseConfig('analyzingIntent').recommendedDuration;
      const discoveringDuration = getAgentFlowPhaseConfig('discoveringScenes').recommendedDuration;

      emit(handlers, {
        type: 'status',
        lightStatus: '正在理解你的需求',
        lifecycle: 'analyzing_intent',
      });
      emit(handlers, mockProgress('understand', '分析中', '正在理解你的需求', 'analysis'));
      await delay(analyzingDuration, handlers.signal);

      emit(handlers, {
        type: 'status',
        lightStatus: '正在筛选合适的人',
        lifecycle: 'searching_candidates',
      });
      emit(handlers, mockProgress('search', '正在调用工具', '正在筛选合适的人', 'tool'));

      for (let index = 0; index < AGENT_FLOW_INTERESTS.length; index += 1) {
        await delay(index === 0 ? 100 : 180, handlers.signal);
        emit(handlers, {
          type: 'lifecycle',
          lifecycle: 'searching_candidates',
          metadata: {
            activeInterestIndex: index,
            activeInterest: AGENT_FLOW_INTERESTS[index],
          },
        });
      }

      await delay(Math.max(0, discoveringDuration - 100 - AGENT_FLOW_INTERESTS.length * 180), handlers.signal);
      const sensitive = includesSensitiveIntent(request.goal);
      const response = createMockRecommendationResponse(request.goal, sensitive);
      const lifecycle: AgentLifecycle = sensitive ? 'checking_safety' : 'completed';
      emit(handlers, {
        type: 'result',
        lifecycle,
        result: response,
      });
      return toRunResponse(response, lifecycle);
    },

    async performAction(
      _taskId: number,
      request: AgentActionRequest,
      handlers = { onEvent: () => undefined },
    ) {
      assertNotAborted(handlers.signal);
      if (!request.idempotencyKey) throw new Error('MISSING_INFO: idempotencyKey is required');
      emit(handlers, {
        type: 'status',
        lightStatus:
          request.action === 'candidate.generate_opener'
            ? '正在生成开场白'
            : '正在检查安全边界',
        lifecycle:
          request.action === 'candidate.generate_opener' ? 'drafting_opener' : 'checking_safety',
      });
      if (request.action === 'candidate.generate_opener' || request.action === 'opener.regenerate') {
        await delay(getAgentFlowPhaseConfig('generatingOpener').recommendedDuration, handlers.signal);
        const response = createMockOpenerResponse();
        emitStreamingAnswer(handlers, response.assistantMessage, 'drafting_opener');
        emit(handlers, { type: 'result', lifecycle: 'completed', result: response });
        return toRunResponse(response, 'completed');
      }
      if (request.action === 'opener.confirm_send') {
        const confirmed = request.payload?.confirmed === true;
        const response = confirmed
          ? createMockInviteSuccessResponse()
          : createMockInviteConfirmationResponse();
        emitStreamingAnswer(
          handlers,
          response.assistantMessage,
          confirmed ? 'completed' : 'waiting_confirmation',
        );
        emit(handlers, {
          type: 'result',
          lifecycle: confirmed ? 'completed' : 'waiting_confirmation',
          result: response,
        });
        return toRunResponse(
          response,
          confirmed ? 'completed' : 'waiting_confirmation',
        );
      }
      const response = createMockSafetyReminderResponse();
      emitStreamingAnswer(handlers, response.assistantMessage, 'checking_safety');
      emit(handlers, { type: 'result', lifecycle: 'checking_safety', result: response });
      return toRunResponse(response, 'checking_safety');
    },

    async restoreSession() {
      return null;
    },
  };
}

function emit(
  handlers: { onEvent: (event: AgentStreamEvent) => void; signal?: AbortSignal },
  event: AgentStreamEvent,
) {
  assertNotAborted(handlers.signal);
  handlers.onEvent(event);
}

function mockProgress(
  id: string,
  title: string,
  detail: string,
  kind: 'analysis' | 'tool' | 'status',
): AgentStreamEvent {
  return {
    type: 'progress',
    id,
    title,
    detail,
    kind,
    state: 'running',
  };
}

function emitStreamingAnswer(
  handlers: { onEvent: (event: AgentStreamEvent) => void; signal?: AbortSignal },
  text: string,
  lifecycle: AgentLifecycle,
) {
  for (const delta of text.match(/.{1,10}/g) ?? [text]) {
    emit(handlers, {
      type: 'assistant_delta',
      lifecycle,
      delta,
      source: 'fallback',
    });
  }
  emit(handlers, {
    type: 'assistant_done',
    lifecycle,
    source: 'fallback',
  });
}

function toRunResponse(response: UserFacingAgentResponse, lifecycle: AgentLifecycle): AgentRunResponse {
  return {
    response,
    lifecycle,
    taskId: findTaskId(response),
  };
}

function delay(ms: number, signal?: AbortSignal) {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

function findTaskId(response: UserFacingAgentResponse): number | null {
  for (const card of response.cards) {
    const taskId = Number(card.data.taskId ?? card.data.agentTaskId);
    if (Number.isFinite(taskId) && taskId > 0) return taskId;
  }
  return null;
}

function createMockRecommendationResponse(
  goal: string,
  sensitive: boolean,
): UserFacingAgentResponse {
  return {
    assistantMessage: sensitive
      ? '我先找到几个适合线下认识的场景，但会把安全边界放在最前面。'
      : '我找到了一些更自然、更容易开口的场景，你可以先从轻松的方向开始。',
    lightStatus: sensitive ? '正在检查安全边界' : '正在筛选合适的人',
    permissionMode: 'limited_auto',
    safeStatus: {
      blocked: false,
      level: sensitive ? 'medium' : 'low',
      boundaryNotes: ['建议先站内聊几句，第一次见面优先选择公共场所。'],
      requiredConfirmations: sensitive ? ['发送邀请前需要你确认'] : [],
    },
    pendingConfirmations: [],
    cards: [
      {
        id: 'mock-candidate-coffee',
        type: 'candidate_card',
        title: goal.includes('咖啡') ? '咖啡轻聊搭子' : '轻松社交搭子',
        body: '你们都偏好低压力、可先站内聊的轻社交方式。',
        status: 'ready',
        data: {
          taskId: MOCK_TASK_ID,
          matchScore: '88%',
          area: '同城附近',
          timePreference: '今晚或本周末',
          socialPreference: '先站内聊，公共场所优先',
          recommendationLine: '咖啡、散步和 Citywalk 都比较适合自然破冰。',
          fitReasons: ['都偏好低压力见面', '兴趣话题容易展开', '可以先站内聊', '公共场所选择充足'],
          whyNow: '你当前的需求适合从轻量场景开始。',
          safetyBoundary: '建议先站内聊几句，第一次见面优先选择公共场所。',
          suggestedOpener: '我也想找个轻松一点的咖啡或散步搭子，要不要先聊聊你平时喜欢的地方？',
        },
        actions: [
          {
            id: 'mock-generate-opener',
            label: '生成开场白',
            action: 'generate_opener',
            schemaAction: 'candidate.generate_opener',
            requiresConfirmation: false,
            payload: { taskId: MOCK_TASK_ID },
          },
          {
            id: 'mock-send-invite',
            label: '发送邀请',
            action: 'send_message',
            schemaAction: 'opener.confirm_send',
            requiresConfirmation: true,
            payload: { taskId: MOCK_TASK_ID },
          },
        ],
      },
    ],
  };
}

function createMockOpenerResponse(): UserFacingAgentResponse {
  return {
    assistantMessage: '我先帮你写了一条自然一点的开场白。确认前不会替你发送。',
    lightStatus: '正在生成开场白',
    permissionMode: 'limited_auto',
    safeStatus: {
      blocked: false,
      level: 'low',
      boundaryNotes: ['确认前不会发送。建议先站内沟通。'],
      requiredConfirmations: [],
    },
    pendingConfirmations: [],
    cards: [
      {
        id: 'mock-opener-draft',
        type: 'candidate_card',
        title: '咖啡轻聊搭子',
        body: '你好，我也想找一个轻松一点的咖啡或散步搭子。如果你方便，我们可以先站内聊几句，看看时间和地点是否合适。',
        status: 'ready',
        data: {
          taskId: MOCK_TASK_ID,
          matchScore: '88%',
          area: '同城附近',
          timePreference: '今晚或本周末',
          socialPreference: '先站内聊，公共场所优先',
          nextStep: '发送邀请',
          recommendationLine: '开场白已经准备好，你确认发送前我不会联系对方。',
          fitReasons: ['语气轻松自然', '保留站内沟通边界', '没有交换联系方式或精确位置'],
          whyNow: '你的需求适合先用低压力话题破冰，再确认是否继续聊天。',
          safetyBoundary: '确认前不会发送。建议先站内沟通。',
          suggestedOpener: '你好，我也想找一个轻松一点的咖啡或散步搭子。如果你方便，我们可以先站内聊几句，看看时间和地点是否合适。',
        },
        actions: [
          {
            id: 'mock-send-opener-invite',
            label: '发送邀请',
            action: 'send_message',
            schemaAction: 'opener.confirm_send',
            requiresConfirmation: true,
            payload: { taskId: MOCK_TASK_ID },
          },
          {
            id: 'mock-regenerate',
            label: '再改一下',
            action: 'generate_opener',
            schemaAction: 'opener.regenerate',
            requiresConfirmation: false,
            payload: { taskId: MOCK_TASK_ID },
          },
        ],
      },
    ],
  };
}

function createMockInviteConfirmationResponse(): UserFacingAgentResponse {
  return {
    assistantMessage: '发送邀请属于关键动作，我会先等你确认。',
    lightStatus: '正在等待你确认',
    permissionMode: 'limited_auto',
    safeStatus: {
      blocked: false,
      level: 'medium',
      boundaryNotes: ['建议先站内聊几句，第一次见面优先选择公共场所。'],
      requiredConfirmations: ['发送邀请前需要确认'],
    },
    pendingConfirmations: [],
    cards: [
      {
        id: 'mock-invite-confirm',
        type: 'opener_approval',
        title: '是否确认发送这个邀请？',
        body: '我会保留站内沟通边界，不共享联系方式或精确位置。',
        status: 'waiting_confirmation',
        data: {
          taskId: MOCK_TASK_ID,
          safetyBoundary: '确认前不会发送，不会交换联系方式。',
        },
        actions: [
          {
            id: 'mock-confirm-invite-send',
            label: '确认发送',
            action: 'send_message',
            schemaAction: 'opener.confirm_send',
            requiresConfirmation: true,
            payload: { taskId: MOCK_TASK_ID, confirmed: true },
          },
          {
            id: 'mock-edit-invite',
            label: '再改一下',
            action: 'generate_opener',
            schemaAction: 'opener.regenerate',
            requiresConfirmation: false,
            payload: { taskId: MOCK_TASK_ID },
          },
        ],
      },
    ],
  };
}

function createMockInviteSuccessResponse(): UserFacingAgentResponse {
  return {
    assistantMessage: '完成了。我已经为你准备好下一步建议，你可以继续补充时间或地点。',
    lightStatus: '正在检查安全边界',
    permissionMode: 'limited_auto',
    safeStatus: {
      blocked: false,
      level: 'low',
      boundaryNotes: ['继续保持站内沟通，第一次见面优先选择公共场所。'],
      requiredConfirmations: [],
    },
    pendingConfirmations: [],
    cards: [
      {
        id: 'mock-success-next-step',
        type: 'safety_boundary',
        title: '下一步建议',
        body: '先等对方回复，再确认时间和公共见面地点。',
        status: 'completed',
        data: {},
        actions: [],
      },
    ],
  };
}

function createMockSafetyReminderResponse(): UserFacingAgentResponse {
  const card: FitMeetAlphaCard = {
    id: 'mock-safety-reminder',
    type: 'safety_boundary',
    title: '先保护好边界',
    body: '建议先站内聊几句，第一次见面优先选择公共场所。',
    status: 'blocked',
    data: {},
    actions: [],
  };
  return {
    assistantMessage: '我会先把安全边界放在前面，再继续帮你调整。',
    lightStatus: '正在检查安全边界',
    permissionMode: 'limited_auto',
    safeStatus: {
      blocked: false,
      level: 'medium',
      boundaryNotes: ['建议先站内聊几句，第一次见面优先选择公共场所。'],
      requiredConfirmations: [],
    },
    pendingConfirmations: [],
    cards: [card],
  };
}
