import { describe, expect, it, vi } from 'vitest';
import type { SocialAgentEventV2, UserFacingAgentResponse } from '../api/socialAgentApi';
import {
  createRealAgentAdapter,
  isRealAgentMode,
  mapUserFacingAgentStreamEvent,
  mapAgentError,
  resolveAgentAdapterMode,
  type AgentStreamEvent,
} from '../components/agent-workspace/api';
import { createMockAgentAdapter } from '../dev/agent/mockAgentAdapter';

describe('Agent adapter layer', () => {
  it('keeps production on the real adapter even when mock env flags are misconfigured', () => {
    expect(resolveAgentAdapterMode({} as ImportMetaEnv)).toBe('real');
    expect(resolveAgentAdapterMode({ PROD: true } as unknown as ImportMetaEnv)).toBe('real');
    expect(resolveAgentAdapterMode({ MODE: 'production' } as unknown as ImportMetaEnv)).toBe(
      'real',
    );
    expect(
      resolveAgentAdapterMode({
        PROD: true,
        VITE_AGENT_MOCK_FLOW: 'true',
      } as unknown as ImportMetaEnv),
    ).toBe('real');
    expect(
      resolveAgentAdapterMode({
        PROD: true,
        VITE_AGENT_ADAPTER: 'mock',
      } as unknown as ImportMetaEnv),
    ).toBe('real');
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
        goal: '青岛今晚想找人一起轻松喝咖啡，公共场所先站内聊',
        permissionMode: 'limited_auto',
        idempotencyKey: 'run-1',
      },
      { onEvent: (event) => events.push(event) },
    );

    await vi.runAllTimersAsync();
    const response = await run;

    expect(response.response.cards[0]?.title).toBe('咖啡轻聊搭子');
    expect(events.map((event) => event.type)).toContain('progress');
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'progress',
        id: 'social-codex:summary',
        lifecycle: 'analyzing_intent',
        metadata: expect.objectContaining({
          displayMode: 'covering_status',
          sourceProtocol: 'mock_agent_stream',
        }),
      }),
    );
    expect(events.map((event) => ('lifecycle' in event ? event.lifecycle : null))).toContain(
      'searching_candidates',
    );
    expect(events.at(-1)?.type).toBe('result');
  });

  it('asks clarifying questions before mock social discovery when required context is missing', async () => {
    vi.useFakeTimers();
    const adapter = createMockAgentAdapter();
    const events: AgentStreamEvent[] = [];
    const run = adapter.run(
      {
        goal: '我想找人一起跑步',
        permissionMode: 'limited_auto',
        idempotencyKey: 'run-clarify-1',
      },
      { onEvent: (event) => events.push(event) },
    );

    await vi.runAllTimersAsync();
    const response = await run;

    expect(response.response.cards).toHaveLength(0);
    expect(response.response.assistantMessage).toContain('为了只推荐安全、合适的机会');
    expect(response.response.assistantMessage).toContain('城市/大致区域');
    expect(response.response.assistantMessage).toContain('时间');
    expect(response.response.assistantMessage).toContain('运动强度');
    expect(response.response.assistantMessage).toContain('社交边界');
    expect(events.map((event) => ('lifecycle' in event ? event.lifecycle : null))).not.toContain(
      'searching_candidates',
    );
  });

  it('continues mock social discovery after the user answers the clarification', async () => {
    vi.useFakeTimers();
    const adapter = createMockAgentAdapter();
    const firstEvents: AgentStreamEvent[] = [];
    const firstRun = adapter.run(
      {
        goal: '我想找人一起跑步',
        permissionMode: 'limited_auto',
        idempotencyKey: 'run-clarify-2',
      },
      { onEvent: (event) => firstEvents.push(event) },
    );

    await vi.runAllTimersAsync();
    const firstResponse = await firstRun;
    expect(firstResponse.response.cards).toHaveLength(0);
    expect(firstResponse.response.assistantMessage).toContain('为了只推荐安全、合适的机会');

    const followupEvents: AgentStreamEvent[] = [];
    const followupRun = adapter.run(
      {
        goal: '青岛周末下午，轻松跑步，只在公共场所，先站内聊',
        permissionMode: 'limited_auto',
        idempotencyKey: 'run-clarify-followup-1',
      },
      { onEvent: (event) => followupEvents.push(event) },
    );

    await vi.runAllTimersAsync();
    const followupResponse = await followupRun;

    expect(followupResponse.response.cards[0]?.type).toBe('candidate_card');
    expect(followupResponse.response.cards[0]?.data.recommendationLine).toContain('咖啡');
    expect(
      followupEvents.map((event) => ('lifecycle' in event ? event.lifecycle : null)),
    ).toContain('searching_candidates');
  });

  it('keeps ordinary mock chat out of the social discovery flow', async () => {
    vi.useFakeTimers();
    const adapter = createMockAgentAdapter();
    const events: AgentStreamEvent[] = [];
    const run = adapter.run(
      {
        goal: '帮我解释一下什么是渐进式超负荷',
        permissionMode: 'limited_auto',
        idempotencyKey: 'run-conversation-1',
      },
      { onEvent: (event) => events.push(event) },
    );

    await vi.runAllTimersAsync();
    const response = await run;

    expect(response.response.cards).toHaveLength(0);
    expect(response.response.assistantMessage).toContain('按普通对话');
    expect(events.map((event) => ('lifecycle' in event ? event.lifecycle : null))).not.toContain(
      'searching_candidates',
    );
    expect(
      events.some((event) => 'lightStatus' in event && event.lightStatus === '正在筛选合适的人'),
    ).toBe(false);
    expect(events.some((event) => event.type === 'status')).toBe(false);
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
    expect(
      mapAgentError(
        Object.assign(new Error('模型响应还没返回'), {
          code: 'NETWORK_ERROR',
          statusCode: 504,
        }),
      ),
    ).toMatchObject({
      code: 'NETWORK_ERROR',
      retryable: true,
      statusCode: 504,
    });
  });

  it('keeps structured stream recovery notices when mapping AgentError', () => {
    const error = Object.assign(new Error('FitMeet Agent 暂时没有顺利完成'), {
      recoveryNotice: {
        kind: 'timeout' as const,
        title: '这次处理时间有点久',
        message: '可以继续处理，也可以补充新的要求。',
        retryable: true,
        source: 'stream_error' as const,
      },
    });

    expect(mapAgentError(error)).toMatchObject({
      code: 'SERVER_ERROR',
      title: '这次处理时间有点久',
      message: '可以继续处理，也可以补充新的要求。',
      retryable: true,
      recoveryNotice: {
        kind: 'timeout',
        source: 'stream_error',
      },
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
      performActionStream: vi.fn().mockResolvedValue(mockResponse()),
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

  it('treats direct stream error events as recovery errors instead of UI events', async () => {
    const apiClient = {
      runUserFacingStream: vi.fn().mockImplementation(async (_request, onEvent) => {
        onEvent({
          type: 'error',
          code: 'NETWORK_ERROR',
          message: '流式连接中断',
          retryable: true,
          recoveryNotice: {
            kind: 'interrupted',
            title: '刚才连接中断了',
            message: '我已经保留当前对话，可以继续处理。',
            retryable: true,
            source: 'stream_error',
          },
        });
        return mockResponse();
      }),
      handleMessage: vi.fn().mockResolvedValue(mockResponse()),
      performAction: vi.fn().mockResolvedValue(mockResponse()),
      performActionStream: vi.fn().mockResolvedValue(mockResponse()),
      restoreSession: vi.fn().mockResolvedValue(null),
    };
    const adapter = createRealAgentAdapter(apiClient);
    const events: AgentStreamEvent[] = [];

    await expect(
      adapter.run(
        {
          goal: '今晚青岛大学附近散步',
          permissionMode: 'limited_auto',
          idempotencyKey: 'run-direct-error-event',
        },
        { onEvent: (event) => events.push(event) },
      ),
    ).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      title: '刚才连接中断了',
      recoveryNotice: expect.objectContaining({
        source: 'stream_error',
      }),
    });

    expect(events).toEqual([]);
    expect(apiClient.handleMessage).not.toHaveBeenCalled();
  });

  it('uses the ordinary message stream for conversation turns without an active task', async () => {
    const streamed = { ...mockResponse(), assistantMessage: '这是普通聊天回复。' };
    const apiClient = {
      runUserFacingStream: vi.fn().mockResolvedValue(streamed),
      handleMessageStream: vi.fn().mockImplementation(async (_request, onEvent) => {
        onEvent({
          type: 'assistant_delta',
          messageId: 'normal-message-1',
          delta: '这是普通聊天回复。',
        });
        return streamed;
      }),
      handleMessage: vi.fn().mockResolvedValue(streamed),
      performAction: vi.fn().mockResolvedValue(streamed),
      performActionStream: vi.fn().mockResolvedValue(streamed),
      restoreSession: vi.fn().mockResolvedValue(null),
    };
    const adapter = createRealAgentAdapter(apiClient);
    const events: AgentStreamEvent[] = [];

    await adapter.run(
      {
        goal: '帮我解释一下渐进式超负荷',
        permissionMode: 'limited_auto',
        idempotencyKey: 'run-normal-chat',
        conversationIntent: 'conversation',
        clientContext: { source: 'web', threadId: 'thread-normal' },
      },
      { onEvent: (event) => events.push(event) },
    );

    expect(apiClient.handleMessageStream).toHaveBeenCalledWith(
      {
        message: '帮我解释一下渐进式超负荷',
        taskId: undefined,
        idempotencyKey: 'run-normal-chat',
        conversationIntent: 'conversation',
        clientContext: {
          source: 'web',
          threadId: 'thread-normal',
          conversationIntent: 'conversation',
        },
      },
      expect.any(Function),
      undefined,
    );
    expect(apiClient.runUserFacingStream).not.toHaveBeenCalled();
    expect(events).toEqual([
      expect.objectContaining({
        type: 'assistant_delta',
        messageId: 'normal-message-1',
        delta: '这是普通聊天回复。',
      }),
    ]);
  });

  it('keeps social turns on the user-facing run stream', async () => {
    const streamed = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockResolvedValue(streamed),
      handleMessageStream: vi.fn().mockResolvedValue(streamed),
      handleMessage: vi.fn().mockResolvedValue(streamed),
      performAction: vi.fn().mockResolvedValue(streamed),
      performActionStream: vi.fn().mockResolvedValue(streamed),
      restoreSession: vi.fn().mockResolvedValue(null),
    };
    const adapter = createRealAgentAdapter(apiClient);

    await adapter.run(
      {
        goal: '我想今晚在青岛大学找人散步',
        permissionMode: 'limited_auto',
        idempotencyKey: 'run-social-chat',
        conversationIntent: 'social',
      },
      { onEvent: vi.fn() },
    );

    expect(apiClient.runUserFacingStream).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: '我想今晚在青岛大学找人散步',
        conversationIntent: 'social',
        idempotencyKey: 'run-social-chat',
      }),
      expect.any(Function),
      undefined,
    );
    expect(apiClient.handleMessageStream).not.toHaveBeenCalled();
  });

  it('uses task message stream for ordinary conversation inside an active task', async () => {
    const streamed = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockResolvedValue(streamed),
      handleMessageStream: vi.fn().mockResolvedValue(streamed),
      handleMessage: vi.fn().mockResolvedValue(streamed),
      performAction: vi.fn().mockResolvedValue(streamed),
      performActionStream: vi.fn().mockResolvedValue(streamed),
      restoreSession: vi.fn().mockResolvedValue(null),
    };
    const adapter = createRealAgentAdapter(apiClient);

    await adapter.run(
      {
        goal: '继续刚才的约练任务',
        permissionMode: 'limited_auto',
        taskId: 77,
        idempotencyKey: 'run-task-followup',
        conversationIntent: 'conversation',
      },
      { onEvent: vi.fn() },
    );

    expect(apiClient.handleMessageStream).toHaveBeenCalledWith(
      {
        message: '继续刚才的约练任务',
        taskId: 77,
        idempotencyKey: 'run-task-followup',
        conversationIntent: 'conversation',
        clientContext: undefined,
      },
      expect.any(Function),
      undefined,
    );
    expect(apiClient.runUserFacingStream).not.toHaveBeenCalled();
  });

  it('derives the task id from a canonical thread id before sending a follow-up', async () => {
    const streamed = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockResolvedValue(streamed),
      handleMessageStream: vi.fn().mockResolvedValue(streamed),
      handleMessage: vi.fn().mockResolvedValue(streamed),
      performAction: vi.fn().mockResolvedValue(streamed),
      performActionStream: vi.fn().mockResolvedValue(streamed),
      restoreSession: vi.fn().mockResolvedValue(null),
    };
    const adapter = createRealAgentAdapter(apiClient);

    await adapter.run(
      {
        goal: '继续刚才青岛大学散步的约练任务',
        permissionMode: 'limited_auto',
        taskId: null,
        idempotencyKey: 'run-thread-bound-followup',
        conversationIntent: 'conversation',
        clientContext: { source: 'web', threadId: 'agent-task:77' },
      },
      { onEvent: vi.fn() },
    );

    expect(apiClient.handleMessageStream).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '继续刚才青岛大学散步的约练任务',
        taskId: 77,
        clientContext: expect.objectContaining({
          threadId: 'agent-task:77',
          conversationIntent: 'conversation',
        }),
      }),
      expect.any(Function),
      undefined,
    );
    expect(apiClient.runUserFacingStream).not.toHaveBeenCalled();
  });

  it('keeps active social task execution on the user-facing run stream', async () => {
    const streamed = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockResolvedValue(streamed),
      handleMessageStream: vi.fn().mockResolvedValue(streamed),
      handleMessage: vi.fn().mockResolvedValue(streamed),
      performAction: vi.fn().mockResolvedValue(streamed),
      performActionStream: vi.fn().mockResolvedValue(streamed),
      restoreSession: vi.fn().mockResolvedValue(null),
    };
    const adapter = createRealAgentAdapter(apiClient);

    await adapter.run(
      {
        goal: '可以，继续帮我找人',
        permissionMode: 'limited_auto',
        taskId: 77,
        idempotencyKey: 'run-task-social-followup',
        conversationIntent: 'social',
      },
      { onEvent: vi.fn() },
    );

    expect(apiClient.runUserFacingStream).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: '可以，继续帮我找人',
        taskId: 77,
        conversationIntent: 'social',
        idempotencyKey: 'run-task-social-followup',
      }),
      expect.any(Function),
      undefined,
    );
    expect(apiClient.handleMessageStream).not.toHaveBeenCalled();
  });

  it('recovers an interrupted real stream from the session endpoint when a task exists', async () => {
    const restored = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockRejectedValue(new Error('network down')),
      handleMessage: vi.fn().mockResolvedValue(mockResponse()),
      performAction: vi.fn().mockResolvedValue(mockResponse()),
      performActionStream: vi.fn().mockResolvedValue(mockResponse()),
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

  it('folds legacy status events into the Social Codex covering summary', async () => {
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
      performActionStream: vi.fn().mockResolvedValue(streamed),
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
      type: 'progress',
      id: 'social-codex:summary',
      kind: 'status',
      title: '正在读取你的偏好',
      state: 'running',
      lifecycle: 'reading_life_graph',
      metadata: expect.objectContaining({
        processType: 'run_summary',
        originalProcessType: 'legacy_status',
        sourceProtocol: 'legacy_agent_stream',
        taskId: null,
        threadId: null,
        displayMode: 'covering_status',
        updateModel: 'latest_state',
        defaultVisibleCount: 1,
        historyVisibility: 'collapsed',
      }),
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
      performActionStream: vi.fn().mockResolvedValue(streamed),
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

  it('maps SocialAgentEventV2 assistant deltas to real assistant token deltas', async () => {
    const streamed = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockImplementation(async (_request, onEvent) => {
        onEvent({
          type: 'assistant.delta',
          eventId: 'run-v2-delta:1',
          seq: 1,
          createdAt: '2026-06-17T00:00:00.000Z',
          userId: '7',
          threadId: '202',
          taskId: 202,
          runId: 'run-v2-delta',
          stage: 'detect_social_intent',
          visibility: 'user_visible',
          messageId: 'm-v2',
          payload: {
            delta: '我先记住你的周末下午散步偏好。',
          },
        });
        return streamed;
      }),
      handleMessage: vi.fn().mockResolvedValue(streamed),
      performAction: vi.fn().mockResolvedValue(streamed),
      performActionStream: vi.fn().mockResolvedValue(streamed),
      restoreSession: vi.fn().mockResolvedValue(null),
    };
    const adapter = createRealAgentAdapter(apiClient);
    const events: AgentStreamEvent[] = [];

    const response = await adapter.run(
      {
        goal: '周末下午，散步，崂山区青岛大学',
        permissionMode: 'limited_auto',
        idempotencyKey: 'run-v2-delta',
      },
      { onEvent: (event) => events.push(event) },
    );

    expect(response.taskId).toBe(202);
    expect(events).toEqual([
      expect.objectContaining({
        type: 'assistant_delta',
        lifecycle: 'analyzing_intent',
        messageId: 'm-v2',
        delta: '我先记住你的周末下午散步偏好。',
        source: 'llm',
      }),
    ]);
  });

  it('preserves fallback source on SocialAgentEventV2 assistant deltas', async () => {
    const streamed = {
      ...mockResponse(),
      assistantMessageSource: 'fallback' as const,
    };
    const apiClient = {
      runUserFacingStream: vi.fn().mockImplementation(async (_request, onEvent) => {
        onEvent({
          type: 'assistant.delta',
          eventId: 'run-v2-fallback-delta:1',
          seq: 1,
          createdAt: '2026-06-17T00:00:00.000Z',
          userId: '7',
          threadId: '202',
          taskId: 202,
          runId: 'run-v2-fallback-delta',
          stage: 'detect_social_intent',
          visibility: 'user_visible',
          messageId: 'm-v2-fallback',
          payload: {
            delta: '我已经保留当前对话，可以继续处理。',
            source: 'fallback',
          },
        });
        return streamed;
      }),
      handleMessage: vi.fn().mockResolvedValue(streamed),
      performAction: vi.fn().mockResolvedValue(streamed),
      performActionStream: vi.fn().mockResolvedValue(streamed),
      restoreSession: vi.fn().mockResolvedValue(null),
    };
    const adapter = createRealAgentAdapter(apiClient);
    const events: AgentStreamEvent[] = [];

    await adapter.run(
      {
        goal: '今晚青岛大学附近散步',
        permissionMode: 'limited_auto',
        idempotencyKey: 'run-v2-fallback-delta',
      },
      { onEvent: (event) => events.push(event) },
    );

    expect(events).toEqual([
      expect.objectContaining({
        type: 'assistant_delta',
        messageId: 'm-v2-fallback',
        delta: '我已经保留当前对话，可以继续处理。',
        source: 'fallback',
      }),
    ]);
  });

  it('deduplicates dual-protocol assistant deltas emitted for compatibility', async () => {
    const streamed = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockImplementation(async (_request, onEvent) => {
        onEvent({
          type: 'assistant_delta',
          messageId: 'm-dual',
          delta: '我会先理解你的需求。',
          source: 'llm',
        });
        onEvent({
          type: 'assistant.delta',
          eventId: 'run-v2-dual-delta:1',
          seq: 1,
          createdAt: '2026-06-17T00:00:00.000Z',
          userId: '7',
          threadId: '202',
          taskId: 202,
          runId: 'run-v2-dual-delta',
          stage: 'detect_social_intent',
          visibility: 'user_visible',
          messageId: 'm-dual',
          payload: {
            delta: '我会先理解你的需求。',
            source: 'llm',
          },
        });
        onEvent({
          type: 'assistant_delta',
          messageId: 'm-dual',
          delta: '然后继续处理。',
          source: 'llm',
        });
        onEvent({
          type: 'assistant.delta',
          eventId: 'run-v2-dual-delta:2',
          seq: 2,
          createdAt: '2026-06-17T00:00:00.000Z',
          userId: '7',
          threadId: '202',
          taskId: 202,
          runId: 'run-v2-dual-delta',
          stage: 'detect_social_intent',
          visibility: 'user_visible',
          messageId: 'm-dual',
          payload: {
            delta: '然后继续处理。',
            source: 'llm',
          },
        });
        return streamed;
      }),
      handleMessage: vi.fn().mockResolvedValue(streamed),
      performAction: vi.fn().mockResolvedValue(streamed),
      performActionStream: vi.fn().mockResolvedValue(streamed),
      restoreSession: vi.fn().mockResolvedValue(null),
    };
    const adapter = createRealAgentAdapter(apiClient);
    const events: AgentStreamEvent[] = [];

    await adapter.run(
      {
        goal: '今晚青岛大学附近散步',
        permissionMode: 'limited_auto',
        idempotencyKey: 'run-v2-dual-delta',
      },
      { onEvent: (event) => events.push(event) },
    );

    expect(
      events
        .filter((event): event is Extract<AgentStreamEvent, { type: 'assistant_delta' }> =>
          event.type === 'assistant_delta',
        )
        .map((event) => event.delta),
    ).toEqual(['我会先理解你的需求。', '然后继续处理。']);
  });

  it('uses the V2 assistant delta payload messageId when old events miss the envelope messageId', async () => {
    const streamed = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockImplementation(async (_request, onEvent) => {
        onEvent({
          type: 'assistant.delta',
          eventId: 'run-v2-payload-message:1',
          seq: 1,
          createdAt: '2026-06-17T00:00:00.000Z',
          userId: '7',
          threadId: '202',
          taskId: 202,
          runId: 'run-v2-payload-message',
          stage: 'detect_social_intent',
          visibility: 'user_visible',
          payload: {
            delta: '我会继续沿着这段会话处理。',
            messageId: 'm-v2-payload-only',
            source: 'llm',
          },
        });
        return streamed;
      }),
      handleMessage: vi.fn().mockResolvedValue(streamed),
      performAction: vi.fn().mockResolvedValue(streamed),
      performActionStream: vi.fn().mockResolvedValue(streamed),
      restoreSession: vi.fn().mockResolvedValue(null),
    };
    const adapter = createRealAgentAdapter(apiClient);
    const events: AgentStreamEvent[] = [];

    await adapter.run(
      {
        goal: '继续刚才的约练任务',
        permissionMode: 'limited_auto',
        idempotencyKey: 'run-v2-payload-message',
      },
      { onEvent: (event) => events.push(event) },
    );

    expect(events).toEqual([
      expect.objectContaining({
        type: 'assistant_delta',
        messageId: 'm-v2-payload-only',
        delta: '我会继续沿着这段会话处理。',
        source: 'llm',
      }),
    ]);
  });

  it('maps SocialAgentEventV2 failed fallback to a light reconnect status', () => {
    const mapped = mapUserFacingAgentStreamEvent({
      type: 'run.failed',
      eventId: 'run-v2-failed-fallback:1',
      seq: 1,
      createdAt: '2026-06-21T00:00:00.000Z',
      userId: '7',
      threadId: '202',
      taskId: 202,
      runId: 'run-v2-failed-fallback',
      stage: 'hydrate_context',
      visibility: 'user_visible',
      display: {
        title: 'run failed',
        detail: 'planner traceId payload',
        state: 'failed',
      },
    });

    expect(mapped).toEqual(
      expect.objectContaining({
        type: 'progress',
        title: '这段需求还在',
        detail: '我保留了这段需求，你可以继续处理或重新发送。',
      }),
    );
    expect(JSON.stringify(mapped)).not.toContain('这次没有处理好');
    expect(JSON.stringify(mapped)).not.toMatch(/planner|traceId|payload/i);
  });

  it('sanitizes SocialAgentEventV2 display text before it reaches process UI', async () => {
    const streamed = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockImplementation(async (_request, onEvent) => {
        onEvent({
          type: 'visible_process.delta',
          eventId: 'run-v2-sanitize:1',
          seq: 1,
          createdAt: '2026-06-17T00:00:00.000Z',
          userId: '7',
          threadId: '202',
          taskId: 202,
          runId: 'run-v2-sanitize',
          stage: 'search_candidates',
          visibility: 'user_visible',
          display: {
            title: 'route_search_turn',
            detail: 'hydrate_context',
            state: 'running',
          },
        });
        onEvent({
          type: 'tool.started',
          eventId: 'run-v2-sanitize:2',
          seq: 2,
          createdAt: '2026-06-17T00:00:01.000Z',
          userId: '7',
          threadId: '202',
          taskId: 202,
          runId: 'run-v2-sanitize',
          stage: 'search_candidates',
          visibility: 'user_visible',
          display: {
            title: '正在调用 tool_call_started',
            detail: 'hydrate_context planner payload traceId',
            state: 'running',
          },
        });
        onEvent({
          type: 'candidate_search.started',
          eventId: 'run-v2-sanitize:3',
          seq: 3,
          createdAt: '2026-06-17T00:00:02.000Z',
          userId: '7',
          threadId: '202',
          taskId: 202,
          runId: 'run-v2-sanitize',
          stage: 'search_candidates',
          visibility: 'user_visible',
          display: {
            title: '正在理解你的需求',
            detail: '我们已经理解你的需求，下一步处理',
            state: 'running',
          },
        });
        return streamed;
      }),
      handleMessage: vi.fn().mockResolvedValue(streamed),
      performAction: vi.fn().mockResolvedValue(streamed),
      performActionStream: vi.fn().mockResolvedValue(streamed),
      restoreSession: vi.fn().mockResolvedValue(null),
    };
    const adapter = createRealAgentAdapter(apiClient);
    const events: AgentStreamEvent[] = [];

    await adapter.run(
      {
        goal: '周末下午，散步，崂山区青岛大学',
        permissionMode: 'limited_auto',
        idempotencyKey: 'run-v2-sanitize',
      },
      { onEvent: (event) => events.push(event) },
    );

    const progressEvents = events.filter((event) => event.type === 'progress');
    expect(progressEvents).toEqual([
      expect.objectContaining({
        id: 'social-codex:summary',
        title: '正在筛选公开可发现的人',
        detail: '正在读取你的偏好',
        metadata: expect.objectContaining({
          processType: 'run_summary',
          source: 'social_agent_event_v2',
          displayMode: 'covering_status',
          updateModel: 'latest_state',
          defaultVisibleCount: 1,
          historyVisibility: 'collapsed',
        }),
      }),
      expect.objectContaining({
        id: 'social-codex:summary',
        title: '正在筛选公开可发现的人',
        detail: '只使用公开可发现的信息，联系对方前仍需要你确认。',
        metadata: expect.objectContaining({
          processType: 'run_summary',
          source: 'social_agent_event_v2',
          displayMode: 'covering_status',
          updateModel: 'latest_state',
          defaultVisibleCount: 1,
          historyVisibility: 'collapsed',
        }),
      }),
      expect.objectContaining({
        id: 'social-codex:summary',
        title: '正在筛选公开可发现的人',
        detail: '只使用公开可发现的信息，联系对方前仍需要你确认。',
        metadata: expect.objectContaining({
          processType: 'run_summary',
          originalProcessType: 'candidate_search',
          stageLabel: '查找候选',
          displayMode: 'covering_status',
          updateModel: 'latest_state',
          defaultVisibleCount: 1,
          historyVisibility: 'collapsed',
        }),
      }),
    ]);
    expect(JSON.stringify(progressEvents)).not.toMatch(
      /route_search_turn|hydrate_context|tool_call_started|planner|payload|traceId/i,
    );
  });

  it('collapses legacy tool stream events into one cover-style process row while preserving identities', async () => {
    const streamed = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockImplementation(async (_request, onEvent) => {
        onEvent({
          type: 'agent_loop_step',
          lifecycle: 'searching_candidates',
          stepId: 'rank.candidates:2',
          phase: 'tool',
          agentName: 'Social Match Agent',
          toolName: 'social_match_search_turn',
          status: 'running',
          title: '正在筛选合适的人',
          detail: '正在筛选合适的人',
        });
        onEvent({
          type: 'tool_call',
          lifecycle: 'searching_candidates',
          stepId: 'rank.candidates:2',
          agentName: 'Social Match Agent',
          toolName: 'social_match_search_turn',
          title: '正在处理这一步',
          detail: '正在筛选合适的人',
        });
        onEvent({
          type: 'tool_result',
          lifecycle: 'searching_candidates',
          stepId: 'rank.candidates:2',
          agentName: 'Social Match Agent',
          toolName: 'social_match_search_turn',
          title: '已整理结果',
          detail: '正在筛选合适的人',
          status: 'done',
        });
        onEvent({
          type: 'progress',
          lifecycle: 'searching_candidates',
          id: 'rank.candidates:2',
          kind: 'tool',
          title: '正在处理这一步',
          detail: '正在筛选合适的人',
          state: 'done',
          metadata: {
            stepId: 'rank.candidates:2',
            agentName: 'Social Match Agent',
            toolName: 'social_match_search_turn',
          },
        });
        return streamed;
      }),
      handleMessage: vi.fn().mockResolvedValue(streamed),
      performAction: vi.fn().mockResolvedValue(streamed),
      performActionStream: vi.fn().mockResolvedValue(streamed),
      restoreSession: vi.fn().mockResolvedValue(null),
    };
    const adapter = createRealAgentAdapter(apiClient);
    const events: AgentStreamEvent[] = [];

    await adapter.run(
      {
        goal: '帮我找一个周末跑步搭子',
        permissionMode: 'limited_auto',
        idempotencyKey: 'run-real-step-id',
      },
      { onEvent: (event) => events.push(event) },
    );

    const progressEvents = events.filter((event) => event.type === 'progress');
    expect(progressEvents).toHaveLength(4);
    expect(progressEvents.map((event) => event.id)).toEqual([
      'social-codex:summary',
      'social-codex:summary',
      'social-codex:summary',
      'social-codex:summary',
    ]);
    expect(progressEvents.map((event) => event.title)).toEqual([
      '正在筛选合适的人',
      '正在筛选公开可发现的人',
      '已筛选公开可发现的人',
      '已筛选公开可发现的人',
    ]);
    expect(progressEvents.every((event) => event.kind === 'status')).toBe(true);
    expect(
      progressEvents.every((event) => event.metadata?.processType === 'run_summary'),
    ).toBe(true);
    expect(
      progressEvents.every((event) => event.metadata?.sourceProtocol === 'legacy_agent_stream'),
    ).toBe(true);
    expect(progressEvents.every((event) => event.metadata?.stepId === 'rank.candidates:2')).toBe(
      true,
    );
    expect(
      progressEvents.every((event) => event.metadata?.agentName === 'Social Match Agent'),
    ).toBe(true);
    expect(
      progressEvents.every((event) => event.metadata?.toolName === 'social_match_search_turn'),
    ).toBe(true);
  });

  it('collapses legacy progress events with explicit processType into the cover status row', async () => {
    const streamed = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockImplementation(async (_request, onEvent) => {
        onEvent({
          type: 'progress',
          lifecycle: 'analyzing_intent',
          id: 'slots:time-location',
          kind: 'status',
          title: 'slot_filled',
          detail: '已记录：周末下午、散步、青岛大学附近',
          state: 'done',
          metadata: {
            processType: 'slot_memory',
            stepId: 'slots:time-location',
            agentName: 'Life Graph Agent',
            toolName: 'extract_social_slots',
          },
        });
        onEvent({
          type: 'progress',
          lifecycle: 'searching_candidates',
          id: 'candidate-search',
          kind: 'tool',
          title: 'tool_call_started',
          detail: 'candidate search planner payload',
          state: 'running',
          metadata: {
            processType: 'candidate_search',
            stepId: 'candidate-search',
            agentName: 'Social Match Agent',
            toolName: 'search_public_candidates',
          },
        });
        return streamed;
      }),
      handleMessage: vi.fn().mockResolvedValue(streamed),
      performAction: vi.fn().mockResolvedValue(streamed),
      performActionStream: vi.fn().mockResolvedValue(streamed),
      restoreSession: vi.fn().mockResolvedValue(null),
    };
    const adapter = createRealAgentAdapter(apiClient);
    const events: AgentStreamEvent[] = [];

    await adapter.run(
      {
        goal: '周末下午，散步，青岛大学附近，帮我找人',
        permissionMode: 'limited_auto',
        idempotencyKey: 'run-legacy-explicit-process',
      },
      { onEvent: (event) => events.push(event) },
    );

    const progressEvents = events.filter((event) => event.type === 'progress');
    expect(progressEvents).toHaveLength(2);
    expect(progressEvents.map((event) => event.id)).toEqual([
      'social-codex:summary',
      'social-codex:summary',
    ]);
    expect(
      progressEvents.every((event) => event.metadata?.processType === 'run_summary'),
    ).toBe(true);
    expect(progressEvents.map((event) => event.metadata?.originalProcessType)).toEqual([
      'slot_memory',
      'candidate_search',
    ]);
    expect(progressEvents[0]).toEqual(
      expect.objectContaining({
        title: '已记住你刚补充的信息',
        detail: '已记录：周末下午、散步、青岛大学附近',
        state: 'done',
      }),
    );
    expect(progressEvents[1]).toEqual(
      expect.objectContaining({
        title: '正在推进当前进度',
        detail: undefined,
        state: 'running',
      }),
    );
    expect(JSON.stringify(progressEvents)).not.toMatch(
      /tool_call_started|slot_filled|planner|payload/i,
    );
  });

  it('maps every user-visible SocialAgentEventV2 type into assistant-ui consumable events', () => {
    const eventTypes: SocialAgentEventV2['type'][] = [
      'run.started',
      'visible_process.delta',
      'assistant.delta',
      'tool.started',
      'tool.progress',
      'tool.done',
      'slot.filled',
      'slot.completed',
      'memory.saved',
      'opportunity_card.created',
      'candidate_search.started',
      'candidate_search.done',
      'safety_check.done',
      'approval.required',
      'approval.resolved',
      'run.completed',
      'run.failed',
    ];

    const mapped = eventTypes.map((type, index) => {
      const event: SocialAgentEventV2 = {
        type,
        eventId: `v2-contract-${index + 1}`,
        seq: index + 1,
        createdAt: '2026-06-17T00:00:00.000Z',
        userId: '7',
        threadId: 'agent-thread-1',
        taskId: 202,
        runId: 'run-v2-contract',
        messageId: type === 'assistant.delta' ? 'assistant-v2-contract' : undefined,
        stage:
          type === 'candidate_search.started' || type === 'candidate_search.done'
            ? 'search_candidates'
            : type.startsWith('slot.')
              ? 'slot_filling'
              : type.startsWith('approval.')
                ? 'approval'
                : type === 'opportunity_card.created'
                  ? 'create_opportunity_card'
                  : type === 'safety_check.done'
                    ? 'safety_filter'
                    : 'hydrate_context',
        visibility: 'user_visible',
        display: {
          title: '正在整理当前进展',
          detail: '会用产品语言说明，不展示内部执行细节。',
          state:
            type === 'approval.required'
              ? 'waiting'
              : type === 'run.failed'
                ? 'failed'
                : type.endsWith('.done') ||
                    type === 'slot.completed' ||
                    type === 'memory.saved' ||
                    type === 'opportunity_card.created' ||
                    type === 'safety_check.done' ||
                    type === 'approval.resolved' ||
                    type === 'run.completed'
                  ? 'done'
                  : 'running',
        },
        payload: {
          delta: type === 'assistant.delta' ? '我会继续处理。' : undefined,
          source: type === 'assistant.delta' ? 'llm' : undefined,
          slots:
            type === 'slot.filled' || type === 'slot.completed'
              ? {
                  time_window: '周末下午',
                  activity: '散步',
                }
              : undefined,
          candidateCount: type === 'candidate_search.done' ? 3 : undefined,
          approvalId: type === 'approval.required' ? 'approval-202' : undefined,
          actionType: type === 'approval.required' ? 'send_invite' : undefined,
          factCount: type === 'memory.saved' ? 2 : undefined,
        },
      };
      return mapUserFacingAgentStreamEvent(event);
    });

    expect(mapped).toHaveLength(eventTypes.length);
    expect(mapped.every(Boolean)).toBe(true);
    expect(mapped.find((event) => event?.type === 'assistant_delta')).toEqual(
      expect.objectContaining({
        type: 'assistant_delta',
        delta: '我会继续处理。',
        source: 'llm',
      }),
    );
    expect(
      mapped
        .filter((event): event is Extract<AgentStreamEvent, { type: 'progress' }> =>
          event?.type === 'progress',
        )
        .map((event) => event.metadata?.sourceProtocol),
    ).toEqual(expect.arrayContaining(['social_agent_event_v2']));
    expect(JSON.stringify(mapped)).not.toMatch(
      /tool_call_started|slot_filled|hydrate_context|planner|traceId|raw JSON|payload/i,
    );
    expect(JSON.stringify(mapped)).not.toContain('这次处理没有完成');
    expect(
      mapped.find(
        (event): event is Extract<AgentStreamEvent, { type: 'progress' }> =>
          event?.type === 'progress' && event.metadata?.eventId === 'v2-contract-17',
      ),
    ).toEqual(expect.objectContaining({ title: '这段需求还在' }));
  });

  it('maps SocialAgentEventV2 visible process events to one cover-style public progress row', async () => {
    const streamed = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockImplementation(async (_request, onEvent) => {
        onEvent({
          type: 'visible_process.delta',
          eventId: 'run-1:1',
          seq: 1,
          createdAt: '2026-06-17T00:00:00.000Z',
          userId: '7',
          threadId: '202',
          taskId: 202,
          runId: 'run-1',
          stage: 'hydrate_context',
          visibility: 'user_visible',
          display: {
            title: '正在读取你的偏好',
            detail: '已读取最近 20 轮对话和当前约练任务。',
            state: 'running',
          },
          payload: { internalName: 'hydrate_context' },
        });
        onEvent({
          type: 'slot.completed',
          eventId: 'run-1:2',
          seq: 2,
          createdAt: '2026-06-17T00:00:01.000Z',
          userId: '7',
          threadId: '202',
          taskId: 202,
          runId: 'run-1',
          stage: 'slot_filling',
          visibility: 'user_visible',
          display: {
            title: '已记录你的关键信息',
            detail: '周末下午、散步、青岛大学附近',
            state: 'done',
          },
          payload: {
            slots: {
              time_window: '周末下午',
              activity: '散步',
              location_text: '青岛大学附近',
            },
          },
        });
        onEvent({
          type: 'tool.started',
          eventId: 'run-1:3',
          seq: 3,
          createdAt: '2026-06-17T00:00:02.000Z',
          userId: '7',
          threadId: '202',
          taskId: 202,
          runId: 'run-1',
          stage: 'search_candidates',
          visibility: 'user_visible',
          display: {
            title: '正在调用 tool_call_started',
            detail: '正在读取 hydrate_context planner payload',
            state: 'running',
          },
          payload: {
            toolName: 'search_public_candidates',
          },
        });
        onEvent({
          type: 'candidate_search.done',
          eventId: 'run-1:4',
          seq: 4,
          createdAt: '2026-06-17T00:00:03.000Z',
          userId: '7',
          threadId: '202',
          taskId: 202,
          runId: 'run-1',
          stage: 'search_candidates',
          visibility: 'user_visible',
          display: {
            state: 'done',
          },
          payload: {
            candidateCount: 3,
          },
        });
        return streamed;
      }),
      handleMessage: vi.fn().mockResolvedValue(streamed),
      performAction: vi.fn().mockResolvedValue(streamed),
      performActionStream: vi.fn().mockResolvedValue(streamed),
      restoreSession: vi.fn().mockResolvedValue(null),
    };
    const adapter = createRealAgentAdapter(apiClient);
    const events: AgentStreamEvent[] = [];

    const response = await adapter.run(
      {
        goal: '周末下午，散步，崂山区青岛大学',
        permissionMode: 'limited_auto',
        idempotencyKey: 'run-v2-visible',
      },
      { onEvent: (event) => events.push(event) },
    );

    expect(response.taskId).toBe(202);
    const progressEvents = events.filter((event) => event.type === 'progress');
    expect(progressEvents.map((event) => event.id)).toEqual([
      'social-codex:summary',
      'social-codex:summary',
      'social-codex:summary',
      'social-codex:summary',
    ]);
    expect(progressEvents).toEqual([
      expect.objectContaining({
        id: 'social-codex:summary',
        title: '正在读取你的偏好',
        lifecycle: 'reading_life_graph',
        state: 'running',
        metadata: expect.objectContaining({
          eventId: 'run-1:1',
          seq: 1,
          threadId: '202',
          taskId: 202,
          processType: 'run_summary',
          originalProcessType: 'visible_process',
          sourceProtocol: 'social_agent_event_v2',
          stageLabel: '读取上下文',
          displayState: 'running',
        }),
      }),
      expect.objectContaining({
        id: 'social-codex:summary',
        title: '已确认：周末下午、散步、青岛大学附近',
        lifecycle: 'analyzing_intent',
        state: 'done',
        detail: undefined,
        metadata: expect.objectContaining({
          processType: 'run_summary',
          originalProcessType: 'slot_memory',
          stageLabel: '补齐信息',
        }),
      }),
      expect.objectContaining({
        id: 'social-codex:summary',
        title: '正在筛选公开可发现的人',
        detail: '只使用公开可发现的信息，联系对方前仍需要你确认。',
        lifecycle: 'searching_candidates',
        state: 'running',
        metadata: expect.objectContaining({
          processType: 'run_summary',
          originalProcessType: 'tool_progress',
          stageLabel: '查找候选',
        }),
      }),
      expect.objectContaining({
        id: 'social-codex:summary',
        title: '已筛选公开可发现的人',
        detail: '找到 3 个公开可发现的人或活动。',
        lifecycle: 'searching_candidates',
        state: 'done',
        metadata: expect.objectContaining({
          candidateCount: 3,
          processType: 'run_summary',
          originalProcessType: 'candidate_search',
        }),
      }),
    ]);
    expect(JSON.stringify(progressEvents)).not.toMatch(/tool_call_started/);
    expect(JSON.stringify(progressEvents)).not.toMatch(/"runId"|"payload"|hydrate_context|planner/);
  });

  it('prefers replay.summary payload as the single cover-style process state', async () => {
    const streamed = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockImplementation(async (_request, onEvent) => {
        onEvent({
          type: 'run.completed',
          eventId: 'run-2:9',
          seq: 9,
          createdAt: '2026-06-17T00:00:09.000Z',
          userId: '7',
          threadId: '202',
          taskId: 202,
          runId: 'run-2',
          stage: 'life_graph_writeback',
          visibility: 'user_visible',
          display: {
            title: '这一步处理完成',
            detail: '泛化完成文案不应该覆盖摘要。',
            state: 'done',
          },
          payload: {
            summary: {
              state: 'waiting',
              title: '发送邀请前需要你确认',
              detail: '确认前不会触达对方。',
              displayMode: 'covering_status',
              updateModel: 'latest_state',
              defaultVisibleCount: 1,
              historyVisibility: 'collapsed',
              currentStage: 'approval',
              currentEventId: 'approval-1',
              currentSeq: 8,
              pendingApproval: true,
              candidateCount: 3,
              activityCount: null,
              hasOpportunityCard: true,
              savedMemory: true,
              visibleStepCount: 5,
              expandable: true,
            },
          },
        });
        return streamed;
      }),
      handleMessage: vi.fn().mockResolvedValue(streamed),
      performAction: vi.fn().mockResolvedValue(streamed),
      performActionStream: vi.fn().mockResolvedValue(streamed),
      restoreSession: vi.fn().mockResolvedValue(null),
    };
    const adapter = createRealAgentAdapter(apiClient);
    const events: AgentStreamEvent[] = [];

    await adapter.run(
      {
        goal: '帮我发送邀请',
        permissionMode: 'limited_auto',
        idempotencyKey: 'run-v2-replay-summary',
      },
      { onEvent: (event) => events.push(event) },
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(
      expect.objectContaining({
        type: 'progress',
        id: 'social-codex:summary',
        title: '发送邀请前需要你确认',
        detail: '确认前不会触达对方。',
        state: 'waiting',
        metadata: expect.objectContaining({
          source: 'replay.summary',
          sourceProtocol: 'social_agent_event_v2',
          processType: 'run_summary',
          displayMode: 'covering_status',
          updateModel: 'latest_state',
          defaultVisibleCount: 1,
          historyVisibility: 'collapsed',
          currentStage: 'approval',
          currentEventId: 'approval-1',
          currentSeq: 8,
          visibleStepCount: 5,
          expandable: true,
          pendingApproval: true,
          candidateCount: 3,
          hasOpportunityCard: true,
          savedMemory: true,
        }),
      }),
    );
  });

  it('keeps ordinary SocialAgentEventV2 process summaries from escalating into social intent', async () => {
    const streamed = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockImplementation(async (_request, onEvent) => {
        onEvent({
          type: 'visible_process.delta',
          eventId: 'ordinary-v2:1',
          seq: 1,
          createdAt: '2026-06-17T00:00:00.000Z',
          userId: '7',
          threadId: 'thread-ordinary',
          taskId: null,
          runId: 'ordinary-v2',
          stage: 'detect_social_intent',
          visibility: 'user_visible',
          display: {
            title: '正在整理回复',
            state: 'running',
          },
        });
        onEvent({
          type: 'visible_process.delta',
          eventId: 'ordinary-v2:2',
          seq: 2,
          createdAt: '2026-06-17T00:00:01.000Z',
          userId: '7',
          threadId: 'thread-ordinary',
          taskId: null,
          runId: 'ordinary-v2',
          stage: 'search_candidates',
          visibility: 'user_visible',
          display: {
            title: '正在筛选公开可发现的人',
            state: 'running',
          },
        });
        return streamed;
      }),
      handleMessage: vi.fn().mockResolvedValue(streamed),
      performAction: vi.fn().mockResolvedValue(streamed),
      performActionStream: vi.fn().mockResolvedValue(streamed),
      restoreSession: vi.fn().mockResolvedValue(null),
    };
    const adapter = createRealAgentAdapter(apiClient);
    const events: AgentStreamEvent[] = [];

    await adapter.run(
      {
        goal: '先普通聊一下，然后再找人',
        permissionMode: 'limited_auto',
        idempotencyKey: 'ordinary-v2',
      },
      { onEvent: (event) => events.push(event) },
    );

    const progressEvents = events.filter((event) => event.type === 'progress');
    expect(progressEvents).toHaveLength(2);
    expect(progressEvents[0].metadata).toEqual(
      expect.objectContaining({
        processType: 'run_summary',
        originalProcessType: 'visible_process',
        surfaceIntent: 'conversation',
      }),
    );
    expect(progressEvents[1].metadata).toEqual(
      expect.objectContaining({
        processType: 'run_summary',
        originalProcessType: 'visible_process',
        surfaceIntent: 'social',
      }),
    );
  });

  it('filters debug-only and internal SocialAgentEventV2 events before they reach the UI', async () => {
    const streamed = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockImplementation(async (_request, onEvent) => {
        onEvent({
          type: 'visible_process.delta',
          eventId: 'run-filter:1',
          seq: 1,
          createdAt: '2026-06-17T00:00:00.000Z',
          userId: '7',
          threadId: 'agent-task:42',
          taskId: 42,
          runId: 'run-filter',
          stage: 'hydrate_context',
          visibility: 'debug_only',
          display: {
            title: 'hydrate_context planner payload traceId=debug',
            state: 'running',
          },
          payload: {
            planner: 'debug planner output',
            traceId: 'trace-debug',
          },
        });
        onEvent({
          type: 'assistant.delta',
          eventId: 'run-filter:2',
          seq: 2,
          createdAt: '2026-06-17T00:00:01.000Z',
          userId: '7',
          threadId: 'agent-task:42',
          taskId: 42,
          runId: 'run-filter',
          stage: 'detect_social_intent',
          visibility: 'internal',
          display: {
            title: 'internal assistant draft',
            state: 'running',
          },
          payload: {
            delta: '这段内部草稿不应该进入前端',
          },
        });
        onEvent({
          type: 'visible_process.delta',
          eventId: 'run-filter:3',
          seq: 3,
          createdAt: '2026-06-17T00:00:02.000Z',
          userId: '7',
          threadId: 'agent-task:42',
          taskId: 42,
          runId: 'run-filter',
          stage: 'hydrate_context',
          visibility: 'user_visible',
          display: {
            title: '正在读取你的偏好',
            state: 'running',
          },
        });
        return streamed;
      }),
      handleMessage: vi.fn().mockResolvedValue(streamed),
      performAction: vi.fn().mockResolvedValue(streamed),
      performActionStream: vi.fn().mockResolvedValue(streamed),
      restoreSession: vi.fn().mockResolvedValue(null),
    };
    const adapter = createRealAgentAdapter(apiClient);
    const events: AgentStreamEvent[] = [];

    await adapter.run(
      {
        goal: '周末下午想散步',
        permissionMode: 'limited_auto',
        idempotencyKey: 'run-v2-filter',
      },
      { onEvent: (event) => events.push(event) },
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(
      expect.objectContaining({
        type: 'progress',
        title: '正在读取你的偏好',
        metadata: expect.objectContaining({
          eventId: 'run-filter:3',
          processType: 'run_summary',
          originalProcessType: 'visible_process',
        }),
      }),
    );
    expect(JSON.stringify(events)).not.toMatch(
      /debug|internal|planner|traceId|内部草稿|hydrate_context/,
    );
  });

  it('hides precise location hints from user-visible SocialAgentEventV2 progress', async () => {
    const streamed = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockImplementation(async (_request, onEvent) => {
        onEvent({
          type: 'visible_process.delta',
          eventId: 'run-safe-location:1',
          seq: 1,
          createdAt: '2026-06-17T00:00:00.000Z',
          userId: '7',
          threadId: '202',
          taskId: 202,
          runId: 'run-safe-location',
          stage: 'safety_filter',
          visibility: 'user_visible',
          display: {
            title: '地图链接 amap://poi?name=青岛大学',
            detail: '坐标 36.062123,120.389456 已读取',
            state: 'running',
          },
        });
        onEvent({
          type: 'slot.completed',
          eventId: 'run-safe-location:2',
          seq: 2,
          createdAt: '2026-06-17T00:00:01.000Z',
          userId: '7',
          threadId: '202',
          taskId: 202,
          runId: 'run-safe-location',
          stage: 'slot_filling',
          visibility: 'user_visible',
          display: {
            state: 'done',
          },
          payload: {
            slots: {
              time_window: '周末下午',
              activity: '散步',
              location_text: '青岛大学附近 36.062123,120.389456',
              safety_boundary: '公共场所优先',
            },
          },
        });
        return streamed;
      }),
      handleMessage: vi.fn().mockResolvedValue(streamed),
      performAction: vi.fn().mockResolvedValue(streamed),
      performActionStream: vi.fn().mockResolvedValue(streamed),
      restoreSession: vi.fn().mockResolvedValue(null),
    };
    const adapter = createRealAgentAdapter(apiClient);
    const events: AgentStreamEvent[] = [];

    await adapter.run(
      {
        goal: '周末下午，散步，青岛大学附近',
        permissionMode: 'limited_auto',
        idempotencyKey: 'run-v2-safe-location',
      },
      { onEvent: (event) => events.push(event) },
    );

    const progressEvents = events.filter((event) => event.type === 'progress');
    expect(progressEvents[0]).toEqual(
      expect.objectContaining({
        title: '正在检查安全边界',
        detail: '涉及位置、联系方式和陌生人连接时会继续征得确认。',
      }),
    );
    expect(progressEvents[1]).toEqual(
      expect.objectContaining({
        title: '已确认：周末下午、散步、公共场所优先',
        detail: undefined,
        metadata: expect.objectContaining({
          slotSummary: '周末下午、散步、公共场所优先',
        }),
      }),
    );
    expect(JSON.stringify(progressEvents)).not.toMatch(/amap|36\.062123|120\.389456|坐标|地图链接/);
  });

  it('surfaces known task slot constraints as a lightweight remembered-state summary', async () => {
    const streamed = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockImplementation(async (_request, onEvent) => {
        onEvent({
          type: 'slot.completed',
          eventId: 'run-known-slots:1',
          seq: 1,
          createdAt: '2026-06-17T00:00:00.000Z',
          userId: '7',
          threadId: '202',
          taskId: 202,
          runId: 'run-known-slots',
          stage: 'slot_filling',
          visibility: 'user_visible',
          display: {
            title: '已记录你的关键信息',
            state: 'done',
          },
          payload: {
            knownTaskSlotConstraints: {
              treatAsHardConstraints: true,
              knownSlots: [
                { key: 'time_window', label: '时间', value: '今天晚上' },
                { key: 'activity', label: '活动', value: '散步' },
                { key: 'location_text', label: '地点', value: '青岛大学附近' },
                {
                  key: 'candidate_preference',
                  label: '候选偏好',
                  value: '公开资料带舞蹈相关标签的人优先',
                },
              ],
              doNotAskAgainFor: ['time_window', 'activity', 'location_text'],
              instruction: 'planner internal hard constraint',
            },
          },
        });
        return streamed;
      }),
      handleMessage: vi.fn().mockResolvedValue(streamed),
      performAction: vi.fn().mockResolvedValue(streamed),
      performActionStream: vi.fn().mockResolvedValue(streamed),
      restoreSession: vi.fn().mockResolvedValue(null),
    };
    const adapter = createRealAgentAdapter(apiClient);
    const events: AgentStreamEvent[] = [];

    await adapter.run(
      {
        goal: '今天晚上，青岛大学附近，找公开资料有舞蹈标签的人散步',
        permissionMode: 'limited_auto',
        idempotencyKey: 'run-v2-known-slots',
      },
      { onEvent: (event) => events.push(event) },
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(
      expect.objectContaining({
        type: 'progress',
        id: 'social-codex:summary',
        title: '已确认：今天晚上、散步、青岛大学附近、公开资料带舞蹈相关标签的人优先',
        detail: undefined,
        state: 'done',
        metadata: expect.objectContaining({
          processType: 'run_summary',
          originalProcessType: 'slot_memory',
          slotSummary: '今天晚上、散步、青岛大学附近、公开资料带舞蹈相关标签的人优先',
          displayMode: 'covering_status',
        }),
      }),
    );
    expect(JSON.stringify(events)).not.toMatch(
      /knownTaskSlotConstraints|doNotAskAgainFor|hard constraint|planner internal|instruction/i,
    );
  });

  it('maps sanitized Life Graph fact summaries without requiring raw proposals', async () => {
    const streamed = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockImplementation(async (_request, onEvent) => {
        onEvent({
          type: 'memory.saved',
          eventId: 'memory-1',
          seq: 1,
          createdAt: '2026-06-17T00:00:00.000Z',
          userId: '7',
          threadId: '202',
          taskId: 202,
          runId: 'run-1',
          stage: 'hydrate_context',
          visibility: 'user_visible',
          display: {
            title: '这些信息下次会继续使用',
            state: 'done',
          },
          payload: {
            lifeGraphFacts: [
              {
                key: 'preferred_activity',
                label: '常见活动偏好',
                displayValue: '散步',
                evidenceCount: 1,
              },
              {
                key: 'first_meet_safety_boundary',
                label: '首次见面安全边界',
                displayValue: '公共场所优先',
                evidenceCount: 1,
              },
            ],
          },
        });
        return streamed;
      }),
      handleMessage: vi.fn().mockResolvedValue(streamed),
      performAction: vi.fn().mockResolvedValue(streamed),
      performActionStream: vi.fn().mockResolvedValue(streamed),
      restoreSession: vi.fn().mockResolvedValue(null),
    };
    const adapter = createRealAgentAdapter(apiClient);
    const events: AgentStreamEvent[] = [];

    await adapter.run(
      {
        goal: '我一般喜欢散步',
        permissionMode: 'limited_auto',
        idempotencyKey: 'run-v2-memory',
      },
      { onEvent: (event) => events.push(event) },
    );

    const memory = events.find(
      (event) => event.type === 'progress' && event.metadata?.originalProcessType === 'memory',
    );
    expect(memory).toEqual(
      expect.objectContaining({
        detail: '已整理：常见活动偏好：散步；首次见面安全边界：公共场所优先',
        metadata: expect.objectContaining({
          lifeGraphFactCount: 2,
          processType: 'run_summary',
          originalProcessType: 'memory',
          taskId: 202,
        }),
      }),
    );
    expect(JSON.stringify(events)).not.toContain('lifeGraphFactProposals');
    expect(JSON.stringify(events)).not.toMatch(/evidence|quote|手机号|微信|宿舍|401/);
  });

  it('keeps SocialAgentEventV2 approval resumable without exposing raw payload', async () => {
    const streamed = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockImplementation(async (_request, onEvent) => {
        onEvent({
          type: 'approval.required',
          eventId: 'approval-1',
          seq: 3,
          createdAt: '2026-06-17T00:00:02.000Z',
          userId: '7',
          threadId: '202',
          taskId: 202,
          runId: 'run-hidden',
          stage: 'approval',
          visibility: 'user_visible',
          display: {
            title: '发送邀请前需要你确认',
            detail: '确认后才会把这条邀请发给对方。',
            state: 'waiting',
          },
          payload: {
            approvalId: 'approve-202',
            actionType: 'send_invite',
            riskLevel: 'high',
            dryRunPreview: {
              title: '邀请发送草稿',
              summary: '确认前不会触达对方。',
              sideEffectAllowedBeforeApproval: false,
            },
            auditRequired: true,
            socialCodex: {
              executionContract: 'approval_required_dry_run_audit',
              approvalPolicy: {
                sideEffectsBeforeApproval: 'none',
                resumeAfterDecision: true,
                auditRequired: true,
              },
              sandbox: {
                externalSideEffectAllowed: false,
              },
            },
            planner: 'hidden planner',
            traceId: 'hidden trace',
          },
        });
        return streamed;
      }),
      handleMessage: vi.fn().mockResolvedValue(streamed),
      performAction: vi.fn().mockResolvedValue(streamed),
      performActionStream: vi.fn().mockResolvedValue(streamed),
      restoreSession: vi.fn().mockResolvedValue(null),
    };
    const adapter = createRealAgentAdapter(apiClient);
    const events: AgentStreamEvent[] = [];

    await adapter.run(
      {
        goal: '帮我邀请这个搭子',
        permissionMode: 'limited_auto',
        idempotencyKey: 'run-v2-approval',
      },
      { onEvent: (event) => events.push(event) },
    );

    const approval = events.find(
      (event) => event.type === 'progress' && event.title === '发送邀请前需要你确认',
    );
    expect(approval).toEqual(
      expect.objectContaining({
        type: 'progress',
        state: 'waiting',
        lifecycle: 'waiting_confirmation',
        metadata: expect.objectContaining({
          approvalId: 'approve-202',
          actionType: 'send_invite',
          riskLevel: 'high',
          processType: 'approval',
          stageLabel: '等待确认',
          dryRunAvailable: true,
          dryRunPreviewTitle: '邀请发送草稿',
          dryRunPreviewSummary: '确认前不会触达对方。',
          sideEffectAllowedBeforeApproval: false,
          auditRequired: true,
          executionBoundary: '需要先预览，并由你确认后继续',
          resumePolicy: '同意后接着当前进度继续',
        }),
      }),
    );
    expect(JSON.stringify(approval)).not.toMatch(
      /run-hidden|"payload"|planner|traceId|approval_required_dry_run_audit|externalSideEffectAllowed/,
    );
  });

  it('maps SocialAgentEventV2 approval resolution as a user-visible lifecycle step', async () => {
    const streamed = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockImplementation(async (_request, onEvent) => {
        onEvent({
          type: 'approval.resolved',
          eventId: 'approval-resolved-1',
          seq: 4,
          createdAt: '2026-06-17T00:00:03.000Z',
          userId: '7',
          threadId: 'agent-task:202',
          taskId: 202,
          runId: 'run-hidden',
          stage: 'approval',
          visibility: 'user_visible',
          display: {
            title: '已取消这一步',
            detail: '这一步已取消，不会触达对方，也不会公开位置或联系方式。',
            state: 'done',
          },
          payload: {
            decision: 'rejected',
            checkpointId: 202,
            planner: 'hidden planner',
            traceId: 'hidden trace',
            resumeCursor: { checkpointId: 202, resumeToken: 'hidden-token' },
          },
        });
        return streamed;
      }),
      handleMessage: vi.fn().mockResolvedValue(streamed),
      performAction: vi.fn().mockResolvedValue(streamed),
      performActionStream: vi.fn().mockResolvedValue(streamed),
      restoreSession: vi.fn().mockResolvedValue(null),
    };
    const adapter = createRealAgentAdapter(apiClient);
    const events: AgentStreamEvent[] = [];

    const response = await adapter.run(
      {
        goal: '取消发送邀请',
        permissionMode: 'limited_auto',
        idempotencyKey: 'run-v2-approval-resolved',
      },
      { onEvent: (event) => events.push(event) },
    );

    expect(response.taskId).toBe(202);
    const resolved = events.find(
      (event) => event.type === 'progress' && event.title === '已取消这一步',
    );
    expect(resolved).toEqual(
      expect.objectContaining({
        type: 'progress',
        state: 'done',
        lifecycle: 'waiting_confirmation',
        detail: '确认前不会执行真实发布、邀请或联系动作。',
        metadata: expect.objectContaining({
          processType: 'approval',
          stageLabel: '等待确认',
          taskId: 202,
        }),
      }),
    );
    expect(JSON.stringify(resolved)).not.toContain('保留当前对话');
    expect(JSON.stringify(resolved)).not.toMatch(
      /run-hidden|"payload"|planner|traceId|resumeToken|checkpointId/,
    );
  });

  it('restores a real Agent session from the session endpoint', async () => {
    const restored = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockResolvedValue(restored),
      handleMessage: vi.fn().mockResolvedValue(restored),
      performAction: vi.fn().mockResolvedValue(restored),
      performActionStream: vi.fn().mockResolvedValue(restored),
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

  it('does not invent a generic assistant reply when restoring cards without text', async () => {
    const apiClient = {
      runUserFacingStream: vi.fn().mockResolvedValue(mockResponse()),
      handleMessage: vi.fn().mockResolvedValue(mockResponse()),
      performAction: vi.fn().mockResolvedValue(mockResponse()),
      performActionStream: vi.fn().mockResolvedValue(mockResponse()),
      restoreSession: vi.fn().mockResolvedValue({
        hasSession: true,
        activeTaskId: 73,
        task: { id: 73, permissionMode: 'limited_auto' },
        messages: [],
        result: {
          lightStatus: '等待你确认',
          permissionMode: 'limited_auto',
          cards: [
            {
              id: 'approval-card',
              type: 'approval_card',
              title: '发送邀请前需要确认',
              body: '确认前不会联系对方。',
              status: 'pending',
              data: { taskId: 73 },
              actions: [],
            },
          ],
          safeStatus: {
            blocked: false,
            level: 'medium',
            boundaryNotes: [],
            requiredConfirmations: ['发送邀请'],
          },
          pendingConfirmations: [],
        },
      }),
    };
    const adapter = createRealAgentAdapter(apiClient);

    const response = await adapter.restoreSession(73);

    expect(response).toMatchObject({
      lifecycle: 'checking_safety',
      taskId: 73,
      response: expect.objectContaining({
        assistantMessage: '',
        lightStatus: '正在检查安全边界',
        cards: [
          expect.objectContaining({
            id: 'approval-card',
            title: '发送邀请前需要确认',
          }),
        ],
      }),
    });
    expect(JSON.stringify(response)).not.toContain('我已经恢复了上一次 Agent 会话');
  });

  it('does not resurrect an empty or failed task session with an automatic continuation message', async () => {
    const restored = mockResponse();
    const apiClient = {
      runUserFacingStream: vi.fn().mockResolvedValue(restored),
      handleMessage: vi.fn().mockResolvedValue(restored),
      performAction: vi.fn().mockResolvedValue(restored),
      performActionStream: vi.fn().mockResolvedValue(restored),
      restoreSession: vi.fn().mockResolvedValue({
        hasSession: false,
        activeTaskId: null,
        task: null,
        messages: [],
        result: null,
      }),
    };
    const adapter = createRealAgentAdapter(apiClient);

    await expect(adapter.restoreSession(68)).resolves.toBeNull();

    expect(apiClient.restoreSession).toHaveBeenCalledWith(68);
    expect(apiClient.handleMessage).not.toHaveBeenCalled();
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
