import { describe, expect, it, vi } from 'vitest';
import type { UserFacingAgentResponse } from '../api/socialAgentApi';
import {
  createMockAgentAdapter,
  createRealAgentAdapter,
  isRealAgentMode,
  mapAgentError,
  mapLifecycleToFlow,
  resolveAgentAdapterMode,
  type AgentStreamEvent,
} from '../components/agent-workspace/api';

describe('Agent adapter layer', () => {
  it('defaults to the mock adapter unless real is explicitly requested', () => {
    expect(resolveAgentAdapterMode({} as ImportMetaEnv)).toBe('mock');
    expect(resolveAgentAdapterMode({ PROD: true } as unknown as ImportMetaEnv)).toBe('real');
    expect(
      resolveAgentAdapterMode({
        PROD: true,
        VITE_AGENT_MOCK_FLOW: 'true',
      } as unknown as ImportMetaEnv),
    ).toBe('mock');
    expect(
      resolveAgentAdapterMode({ VITE_AGENT_ADAPTER: 'mock' } as unknown as ImportMetaEnv),
    ).toBe('mock');
    expect(
      resolveAgentAdapterMode({ VITE_AGENT_ADAPTER: 'real' } as unknown as ImportMetaEnv),
    ).toBe('real');
    expect(isRealAgentMode({ PROD: true } as unknown as ImportMetaEnv)).toBe(true);
    expect(isRealAgentMode({ VITE_AGENT_MOCK_FLOW: 'true' } as unknown as ImportMetaEnv)).toBe(
      false,
    );
  });

  it('emits the mock run lifecycle in SSE-like order', async () => {
    vi.useFakeTimers();
    const adapter = createMockAgentAdapter();
    const events: AgentStreamEvent[] = [];
    const run = adapter.run(
      {
        goal: '今晚想找人一起喝咖啡，不想太尴尬',
        permissionMode: 'limited_auto',
        idempotencyKey: 'run-1',
      },
      { onEvent: (event) => events.push(event) },
    );

    await vi.runAllTimersAsync();
    const response = await run;

    expect(response.response.cards[0]?.title).toBe('咖啡轻聊搭子');
    expect(events.map((event) => event.type)).toContain('status');
    expect(events.map((event) => event.type)).toContain('progress');
    expect(events.map((event) => ('lifecycle' in event ? event.lifecycle : null))).toContain(
      'searching_candidates',
    );
    expect(events.at(-1)?.type).toBe('result');
  });

  it('maps lifecycle values to AntGuide state and target', () => {
    expect(mapLifecycleToFlow('analyzing_intent')).toMatchObject({
      antState: 'thinking',
      antTarget: 'input',
    });
    expect(mapLifecycleToFlow('received')).toMatchObject({
      antState: 'thinking',
      antTarget: 'input',
    });
    expect(mapLifecycleToFlow('searching_candidates')).toMatchObject({
      antState: 'discovering',
      antTarget: 'recommendation',
    });
    expect(mapLifecycleToFlow('checking_safety')).toMatchObject({
      antState: 'reminding',
      antTarget: 'safetyCard',
    });
    expect(mapLifecycleToFlow('waiting_confirmation')).toMatchObject({
      antState: 'confirming',
      antTarget: 'confirmButton',
    });
  });

  it('maps AgentError codes to user-facing copy', () => {
    expect(mapAgentError(new Error('401 unauthorized'))).toMatchObject({
      code: 'UNAUTHORIZED',
      message: '登录后我才能读取你的偏好、会话和安全设置。',
    });
    expect(mapAgentError(new Error('429 rate limited'))).toMatchObject({
      code: 'RATE_LIMITED',
      retryable: true,
    });
    expect(mapAgentError(new Error('safety blocked'))).toMatchObject({
      code: 'SAFETY_BLOCKED',
      lifecycle: 'checking_safety',
    });
  });

  it('requires idempotencyKey for actions', async () => {
    const adapter = createMockAgentAdapter();
    await expect(
      adapter.performAction(9001, {
        action: 'candidate.generate_opener',
        idempotencyKey: '',
      }),
    ).rejects.toThrow(/idempotencyKey/);
  });

  it('sends real card action idempotencyKey as a top-level API field', async () => {
    const streamed = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockResolvedValue(streamed),
      handleMessage: vi.fn().mockResolvedValue(streamed),
      performAction: vi.fn().mockResolvedValue(streamed),
      performActionStream: vi.fn().mockResolvedValue(streamed),
      restoreSession: vi.fn().mockResolvedValue(null),
    };
    const adapter = createRealAgentAdapter(apiClient);

    await adapter.performAction(7, {
      action: 'candidate.generate_opener',
      idempotencyKey: 'action-key-1',
      payload: { cardId: 'candidate' },
    });

    expect(apiClient.performActionStream).toHaveBeenCalledWith(
      {
        taskId: 7,
        action: 'candidate.generate_opener',
        idempotencyKey: 'action-key-1',
        payload: { cardId: 'candidate' },
      },
      expect.any(Function),
      undefined,
    );
    expect(apiClient.performAction).not.toHaveBeenCalled();
  });

  it('does not fall back to non-streaming messages when real SSE fails', async () => {
    const apiClient = {
      runUserFacingStream: vi.fn().mockRejectedValue(new Error('network down')),
      handleMessage: vi.fn().mockResolvedValue(mockResponse()),
      performAction: vi.fn().mockResolvedValue(mockResponse()),
      restoreSession: vi.fn().mockResolvedValue(null),
    };
    const adapter = createRealAgentAdapter(apiClient);

    await expect(
      adapter.run(
        {
          goal: '今晚想找人一起喝咖啡',
          permissionMode: 'limited_auto',
          idempotencyKey: 'run-real-1',
        },
        { onEvent: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });

    expect(apiClient.runUserFacingStream).toHaveBeenCalled();
    expect(apiClient.handleMessage).not.toHaveBeenCalled();
  });

  it('recovers an interrupted real stream from the session endpoint when a task exists', async () => {
    const restored = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockRejectedValue(new Error('network down')),
      handleMessage: vi.fn().mockResolvedValue(mockResponse()),
      performAction: vi.fn().mockResolvedValue(mockResponse()),
      restoreSession: vi.fn().mockResolvedValue({
        hasSession: true,
        activeTaskId: 77,
        task: { id: 77, permissionMode: 'limited_auto' },
        messages: [],
        result: restored,
      }),
    };
    const adapter = createRealAgentAdapter(apiClient);
    const events: AgentStreamEvent[] = [];

    const response = await adapter.run(
      {
        goal: '继续找跑步搭子',
        permissionMode: 'limited_auto',
        taskId: 77,
        idempotencyKey: 'run-real-recover',
      },
      { onEvent: (event) => events.push(event) },
    );

    expect(apiClient.restoreSession).toHaveBeenCalledWith(77);
    expect(apiClient.handleMessage).not.toHaveBeenCalled();
    expect(response).toMatchObject({ taskId: 77, response: restored });
    expect(events.at(-1)).toMatchObject({ type: 'result', result: restored });
  });

  it('preserves explicit SSE lifecycle values from the real adapter', async () => {
    const streamed = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockImplementation(async (_request, onEvent) => {
        onEvent({
          type: 'status',
          lightStatus: '正在理解你的需求',
          lifecycle: 'reading_life_graph',
        });
        return streamed;
      }),
      handleMessage: vi.fn().mockResolvedValue(streamed),
      performAction: vi.fn().mockResolvedValue(streamed),
      restoreSession: vi.fn().mockResolvedValue(null),
    };
    const adapter = createRealAgentAdapter(apiClient);
    const events: AgentStreamEvent[] = [];

    await adapter.run(
      {
        goal: '帮我更新人物画像',
        permissionMode: 'limited_auto',
        idempotencyKey: 'run-real-lifecycle',
      },
      { onEvent: (event) => events.push(event) },
    );

    expect(events[0]).toMatchObject({
      type: 'status',
      lifecycle: 'reading_life_graph',
    });
  });

  it('preserves assistant delta events from the real adapter', async () => {
    const streamed = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockImplementation(async (_request, onEvent) => {
        onEvent({
          type: 'assistant_delta',
          lifecycle: 'analyzing_intent',
          messageId: 'm1',
          delta: '我正在看你的偏好。',
        });
        onEvent({
          type: 'assistant_done',
          lifecycle: 'completed',
          messageId: 'm1',
        });
        return streamed;
      }),
      handleMessage: vi.fn().mockResolvedValue(streamed),
      performAction: vi.fn().mockResolvedValue(streamed),
      restoreSession: vi.fn().mockResolvedValue(null),
    };
    const adapter = createRealAgentAdapter(apiClient);
    const events: AgentStreamEvent[] = [];

    await adapter.run(
      {
        goal: '今晚想找人一起喝咖啡',
        permissionMode: 'limited_auto',
        idempotencyKey: 'run-real-delta',
      },
      { onEvent: (event) => events.push(event) },
    );

    expect(events[0]).toMatchObject({
      type: 'assistant_delta',
      lifecycle: 'analyzing_intent',
      delta: '我正在看你的偏好。',
    });
    expect(events[1]).toMatchObject({
      type: 'assistant_done',
      lifecycle: 'completed',
    });
  });

  it('restores a real Agent session from the session endpoint', async () => {
    const restored = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockResolvedValue(restored),
      handleMessage: vi.fn().mockResolvedValue(restored),
      performAction: vi.fn().mockResolvedValue(restored),
      restoreSession: vi.fn().mockResolvedValue({
        hasSession: true,
        activeTaskId: 42,
        task: { id: 42, permissionMode: 'limited_auto' },
        messages: [],
        result: restored,
      }),
    };
    const adapter = createRealAgentAdapter(apiClient);

    const response = await adapter.restoreSession(42);

    expect(apiClient.restoreSession).toHaveBeenCalledWith(42);
    expect(apiClient.handleMessage).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      lifecycle: 'completed',
      taskId: 42,
      response: restored,
    });
  });
});

function mockResponse(): UserFacingAgentResponse {
  return {
    assistantMessage: '我找到了一些建议。',
    lightStatus: '正在筛选合适的人',
    permissionMode: 'limited_auto',
    safeStatus: {
      blocked: false,
      level: 'low',
      boundaryNotes: [],
      requiredConfirmations: [],
    },
    pendingConfirmations: [],
    cards: [
      {
        id: 'candidate',
        type: 'candidate_card',
        title: '咖啡轻聊搭子',
        body: '适合低压力破冰。',
        status: 'ready',
        data: { taskId: 7 },
        actions: [],
      },
    ],
  };
}
