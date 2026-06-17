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
  it('keeps production on the real adapter even when mock env flags are misconfigured', () => {
    expect(resolveAgentAdapterMode({} as ImportMetaEnv)).toBe('mock');
    expect(resolveAgentAdapterMode({ PROD: true } as unknown as ImportMetaEnv)).toBe('real');
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
    expect(events.map((event) => event.type)).toContain('status');
    expect(events.map((event) => event.type)).toContain('progress');
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

  it('preserves step-level tool identities from real stream events', async () => {
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
        goal: '帮我找一个周末跑步搭子',
        permissionMode: 'limited_auto',
        idempotencyKey: 'run-real-step-id',
      },
      { onEvent: (event) => events.push(event) },
    );

    const progressEvents = events.filter((event) => event.type === 'progress');
    expect(progressEvents).toHaveLength(3);
    expect(progressEvents.map((event) => event.id)).toEqual([
      'rank.candidates:2',
      'rank.candidates:2',
      'rank.candidates:2',
    ]);
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

  it('maps SocialAgentEventV2 visible process events to public progress rows', async () => {
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
    expect(progressEvents).toEqual([
      expect.objectContaining({
        title: '正在读取你的偏好',
        lifecycle: 'reading_life_graph',
        state: 'running',
        metadata: expect.objectContaining({
          eventId: 'run-1:1',
          seq: 1,
          taskId: 202,
          processType: 'visible_process',
          stageLabel: '读取上下文',
          displayState: 'running',
        }),
      }),
      expect.objectContaining({
        title: '已记录你的关键信息',
        lifecycle: 'analyzing_intent',
        state: 'done',
        detail: '周末下午、散步、青岛大学附近',
        metadata: expect.objectContaining({
          processType: 'slot_memory',
          stageLabel: '补齐信息',
        }),
      }),
      expect.objectContaining({
        title: '正在筛选公开可发现的人',
        detail: undefined,
        lifecycle: 'searching_candidates',
        state: 'running',
        metadata: expect.objectContaining({
          processType: 'tool_progress',
          stageLabel: '查找候选',
        }),
      }),
      expect.objectContaining({
        title: '找到合适机会',
        detail: '找到 3 个公开可发现的人或活动。',
        lifecycle: 'searching_candidates',
        state: 'done',
        metadata: expect.objectContaining({
          candidateCount: 3,
          processType: 'candidate_search',
        }),
      }),
    ]);
    expect(JSON.stringify(progressEvents)).not.toMatch(/tool_call_started/);
    expect(JSON.stringify(progressEvents)).not.toMatch(/"runId"|"payload"|hydrate_context|planner/);
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
          processType: 'visible_process',
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
        detail: undefined,
      }),
    );
    expect(progressEvents[1]).toEqual(
      expect.objectContaining({
        title: '已记录你的关键信息',
        detail: '已确认：周末下午、散步、公共场所优先',
        metadata: expect.objectContaining({
          slotSummary: '周末下午、散步、公共场所优先',
        }),
      }),
    );
    expect(JSON.stringify(progressEvents)).not.toMatch(/amap|36\.062123|120\.389456|坐标|地图链接/);
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
      (event) => event.type === 'progress' && event.metadata?.processType === 'memory',
    );
    expect(memory).toEqual(
      expect.objectContaining({
        detail: '已整理：常见活动偏好：散步；首次见面安全边界：公共场所优先',
        metadata: expect.objectContaining({
          lifeGraphFactCount: 2,
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
          executionBoundary: '需要预览、确认和审计后继续',
          resumePolicy: '同意后从保存点继续',
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
            detail: '我不会执行刚才的高风险动作，会继续保留当前对话。',
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
        detail: '我不会执行刚才的高风险动作，会继续保留当前对话。',
        metadata: expect.objectContaining({
          processType: 'approval',
          stageLabel: '等待确认',
          taskId: 202,
        }),
      }),
    );
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
