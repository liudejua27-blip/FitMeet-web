import {
  socialAgentApi,
  type SocialAgentPermissionMode,
  type UserFacingAgentResponse,
  type UserFacingAgentSessionSnapshot,
  type UserFacingAgentStreamEvent,
} from '../../../api/socialAgentApi';
import type { AgentAdapter } from './agentAdapter.types';
import type { AgentLifecycle, AgentRunResponse, AgentStreamEvent } from './agentApi.types';
import { lifecycleFromLightStatus, lifecycleFromResponse, mapAgentError } from './agentLifecycle';

type SocialAgentApiClient = Pick<
  typeof socialAgentApi,
  'runUserFacingStream' | 'handleMessage' | 'performAction' | 'restoreSession'
> & {
  handleMessageStream?: typeof socialAgentApi.handleMessageStream;
  performActionStream?: typeof socialAgentApi.performActionStream;
};

export function createRealAgentAdapter(
  apiClient: SocialAgentApiClient = socialAgentApi,
): AgentAdapter {
  return {
    async run(request, handlers) {
      let observedTaskId = request.taskId ?? null;
      try {
        const response = await apiClient.runUserFacingStream(
          {
            goal: request.goal,
            permissionMode: request.permissionMode,
            taskId: request.taskId,
            city: request.city,
            idempotencyKey: request.idempotencyKey,
            clientContext: request.clientContext,
          },
          (event) => {
            observedTaskId = taskIdFromStreamEvent(event) ?? observedTaskId;
            handlers.onEvent(withLifecycle(event));
          },
          handlers.signal,
        );
        return toRunResponse(response, observedTaskId);
      } catch (error) {
        if (handlers.signal?.aborted) throw mapAgentError(error);
        const restored = await recoverInterruptedStream(apiClient, observedTaskId);
        if (restored) {
          const response = toRunResponsePreferTask(restored, observedTaskId);
          handlers.onEvent({
            type: 'result',
            lifecycle: response.lifecycle,
            result: response.response,
          });
          return response;
        }
        throw mapAgentError(error);
      }
    },

    async performAction(taskId, request, handlers) {
      if (!request.idempotencyKey)
        throw mapAgentError(new Error('MISSING_INFO: idempotencyKey is required'));
      try {
        const actionInput = {
          taskId,
          action: request.action,
          idempotencyKey: request.idempotencyKey,
          payload: { ...(request.payload ?? {}) },
        };
        const response = apiClient.performActionStream
          ? await apiClient.performActionStream(
              actionInput,
              (event) => handlers?.onEvent(withLifecycle(event)),
              handlers?.signal,
            )
          : await apiClient.performAction(actionInput);
        return toRunResponse(response);
      } catch (error) {
        if (handlers?.signal?.aborted) throw mapAgentError(error);
        const restored = await recoverInterruptedStream(apiClient, taskId);
        if (restored) {
          const response = toRunResponsePreferTask(restored, taskId);
          handlers?.onEvent({
            type: 'result',
            lifecycle: response.lifecycle,
            result: response.response,
          });
          return response;
        }
        throw mapAgentError(error);
      }
    },

    async restoreSession(taskId) {
      try {
        const snapshot = await apiClient.restoreSession(taskId);
        const restored = responseFromSessionSnapshot(snapshot);
        if (restored) {
          const response = toRunResponse(restored);
          return {
            ...response,
            taskId: snapshot.activeTaskId ?? response.taskId ?? null,
          };
        }
      } catch {
        // Keep restore non-blocking. A failed restore should not break a fresh Agent page.
      }
      if (!taskId) return null;
      try {
        const fallback = await apiClient.handleMessage({
          message: '继续当前会话',
          taskId,
        });
        return toRunResponse(fallback);
      } catch {
        return null;
      }
    },
  };
}

async function recoverInterruptedStream(
  apiClient: SocialAgentApiClient,
  taskId: number | null,
): Promise<UserFacingAgentResponse | null> {
  if (!taskId) return null;
  try {
    const snapshot = await apiClient.restoreSession(taskId);
    return responseFromSessionSnapshot(snapshot);
  } catch {
    return null;
  }
}

function withLifecycle(event: UserFacingAgentStreamEvent): AgentStreamEvent {
  const explicitLifecycle = readLifecycle(event);
  if (event.type === 'status') {
    return {
      ...event,
      lifecycle: explicitLifecycle ?? lifecycleFromLightStatus(event.lightStatus),
    };
  }
  if (event.type === 'result') {
    return { ...event, lifecycle: explicitLifecycle ?? lifecycleFromResponse(event.result) };
  }
  if (event.type === 'error') {
    return { ...event, lifecycle: explicitLifecycle ?? 'failed' };
  }
  if (event.type === 'assistant_delta' || event.type === 'assistant_done') {
    return explicitLifecycle
      ? { ...event, lifecycle: explicitLifecycle }
      : { ...event, lifecycle: undefined };
  }
  if (event.type === 'agent_loop_step') {
    return {
      type: 'progress',
      id: `loop-${event.phase}`,
      kind: event.toolName ? 'tool' : 'analysis',
      title: event.title,
      detail: event.detail,
      state: progressStateFromStatus(event.status),
      lifecycle: explicitLifecycle ?? undefined,
      metadata: {
        phase: event.phase,
        agentName: event.agentName,
        toolName: event.toolName,
      },
    };
  }
  if (event.type === 'tool_call' || event.type === 'tool_result') {
    return {
      type: 'progress',
      id: `tool-${event.toolName}`,
      kind: 'tool',
      title: event.title,
      detail: event.detail,
      state: event.type === 'tool_call' ? 'running' : progressStateFromStatus(event.status),
      lifecycle: explicitLifecycle ?? undefined,
      metadata: { toolName: event.toolName },
    };
  }
  if (event.type === 'approval_required') {
    return {
      type: 'progress',
      id: `approval-${event.approvalId ?? event.actionType}`,
      kind: 'status',
      title: '等待你确认',
      detail: event.summary,
      state: 'waiting',
      lifecycle: explicitLifecycle ?? 'waiting_confirmation',
      metadata: {
        approvalId: event.approvalId,
        actionType: event.actionType,
        riskLevel: event.riskLevel,
      },
    };
  }
  const safeEvent = {
    type: event.type,
    id: event.id,
    kind: event.kind,
    title: event.title,
    detail: event.detail,
    state: event.state,
  };
  return explicitLifecycle ? { ...safeEvent, lifecycle: explicitLifecycle } : safeEvent;
}

function taskIdFromStreamEvent(event: UserFacingAgentStreamEvent): number | null {
  if (event.type === 'status') {
    return readPositiveNumber(event.taskId);
  }
  if (event.type === 'result') {
    return findTaskId(event.result);
  }
  return null;
}

function readPositiveNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function progressStateFromStatus(status?: string | null): 'running' | 'done' | 'failed' | 'waiting' {
  if (status === 'done' || status === 'succeeded' || status === 'success') return 'done';
  if (status === 'failed' || status === 'error') return 'failed';
  if (status === 'waiting' || status === 'blocked') return 'waiting';
  return 'running';
}

function toRunResponse(
  response: UserFacingAgentResponse,
  restoredTaskId?: number | null,
): AgentRunResponse {
  return {
    response,
    lifecycle: lifecycleFromResponse(response),
    taskId: findTaskId(response) ?? restoredTaskId ?? null,
  };
}

function toRunResponsePreferTask(
  response: UserFacingAgentResponse,
  taskId: number | null,
): AgentRunResponse {
  return {
    response,
    lifecycle: lifecycleFromResponse(response),
    taskId,
  };
}

function findTaskId(response: UserFacingAgentResponse): number | null {
  for (const card of response.cards) {
    const taskId = Number(card.data.taskId ?? card.data.agentTaskId);
    if (Number.isFinite(taskId) && taskId > 0) return taskId;
    for (const action of card.actions) {
      const actionTaskId = Number(action.payload?.taskId ?? action.payload?.agentTaskId);
      if (Number.isFinite(actionTaskId) && actionTaskId > 0) return actionTaskId;
    }
  }
  return null;
}

function responseFromSessionSnapshot(
  snapshot: UserFacingAgentSessionSnapshot,
): UserFacingAgentResponse | null {
  if (!snapshot.hasSession) return null;
  const raw = snapshot.result;
  if (!isRecord(raw)) return null;
  if (isUserFacingAgentResponse(raw)) return raw;
  const cards = Array.isArray(raw.cards) ? raw.cards : [];
  if (typeof raw.assistantMessage !== 'string' && cards.length === 0) return null;
  const permissionMode =
    readPermissionMode(raw.permissionMode) ??
    readPermissionMode(snapshot.task?.permissionMode) ??
    'limited_auto';
  return {
    assistantMessage:
      typeof raw.assistantMessage === 'string'
        ? raw.assistantMessage
        : '我已经恢复了上一次 Agent 会话。',
    lightStatus: inferLightStatus(raw, cards),
    cards: cards as UserFacingAgentResponse['cards'],
    safeStatus: isSafeStatus(raw.safeStatus)
      ? raw.safeStatus
      : {
          blocked: false,
          level: 'low',
          boundaryNotes: [],
          requiredConfirmations: [],
        },
    pendingConfirmations: Array.isArray(raw.pendingConfirmations)
      ? (raw.pendingConfirmations as UserFacingAgentResponse['pendingConfirmations'])
      : [],
    permissionMode,
  };
}

function readLifecycle(value: unknown): AgentLifecycle | null {
  if (!isRecord(value)) return null;
  const lifecycle = value.lifecycle;
  return isAgentLifecycle(lifecycle) ? lifecycle : null;
}

function isAgentLifecycle(value: unknown): value is AgentLifecycle {
  return (
    value === 'received' ||
    value === 'idle' ||
    value === 'input_focused' ||
    value === 'user_submitted' ||
    value === 'analyzing_intent' ||
    value === 'reading_life_graph' ||
    value === 'searching_candidates' ||
    value === 'ranking_matches' ||
    value === 'checking_safety' ||
    value === 'drafting_opener' ||
    value === 'waiting_confirmation' ||
    value === 'completed' ||
    value === 'failed'
  );
}

function isUserFacingAgentResponse(value: unknown): value is UserFacingAgentResponse {
  if (!isRecord(value)) return false;
  return (
    typeof value.assistantMessage === 'string' &&
    typeof value.lightStatus === 'string' &&
    Array.isArray(value.cards) &&
    isSafeStatus(value.safeStatus) &&
    Array.isArray(value.pendingConfirmations) &&
    readPermissionMode(value.permissionMode) !== null
  );
}

function isSafeStatus(value: unknown): value is UserFacingAgentResponse['safeStatus'] {
  return (
    isRecord(value) &&
    typeof value.blocked === 'boolean' &&
    typeof value.level === 'string' &&
    Array.isArray(value.boundaryNotes) &&
    Array.isArray(value.requiredConfirmations)
  );
}

function readPermissionMode(value: unknown): SocialAgentPermissionMode | null {
  if (
    value === 'assist' ||
    value === 'confirm' ||
    value === 'manual_confirm' ||
    value === 'limited_auto' ||
    value === 'open' ||
    value === 'lab'
  ) {
    return value;
  }
  return null;
}

function inferLightStatus(
  raw: Record<string, unknown>,
  cards: unknown[],
): UserFacingAgentResponse['lightStatus'] {
  if (isSafeStatus(raw.safeStatus) && (raw.safeStatus.blocked || raw.safeStatus.level !== 'low')) {
    return '正在检查安全边界';
  }
  if (cards.some((card) => isRecord(card) && card.status === 'waiting_confirmation')) {
    return '正在等待你确认';
  }
  if (cards.some((card) => isRecord(card) && card.type === 'opener_approval')) {
    return '正在等待你确认';
  }
  if (cards.some((card) => isRecord(card) && card.type === 'candidate_card')) {
    return '正在筛选合适的人';
  }
  return '正在理解你的需求';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
