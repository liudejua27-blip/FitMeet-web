import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Response } from 'express';
import { EventEmitter } from 'events';
import { AgentCardAssemblerService } from './response-quality/agent-card-assembler.service';
import { LightStatusMapperService } from './response-quality/light-status-mapper.service';
import { UserFacingResponseSanitizerService } from './response-quality/user-facing-response-sanitizer.service';
import { SocialAgentChatController } from './social-agent-chat.controller';
import { SocialAgentChatService } from './social-agent-chat.service';
import { AgentTaskStatus } from './entities/agent-task.entity';
import { SocialAgentCandidateCommandService } from './social-agent-candidate-command.service';
import { SocialAgentTaskMemoryStateMachineService } from './social-agent-task-memory-state-machine.service';

describe('SocialAgentChatController protocol boundaries', () => {
  const controllerSource = () =>
    readFileSync(
      join(process.cwd(), 'src/agent-gateway/social-agent-chat.controller.ts'),
      'utf8',
    );

  const routeBlock = (source: string, route: string) => {
    const start = source.indexOf(`@Post('${route}')`);
    if (start < 0) {
      throw new Error(`Missing route ${route}`);
    }
    const nextDecorators = ['\n  @Post', '\n  @Get', '\n  @Put', '\n  @Patch']
      .map((marker) => source.indexOf(marker, start + route.length))
      .filter((index) => index > start);
    const end = nextDecorators.length
      ? Math.min(...nextDecorators)
      : source.length;
    return source.slice(start, end);
  };

  it('marks legacy JSON chat endpoints as compatibility surfaces and points callers to SocialAgentEventV2 streams', () => {
    const source = controllerSource();
    const legacyRoutes = [
      'route-message',
      'messages',
      'tasks/:id/messages',
      'tasks/:id/actions',
    ];

    for (const route of legacyRoutes) {
      const block = routeBlock(source, route);
      expect(block).toContain(
        "@Header('X-FitMeet-Agent-Compatibility', 'legacy-json')",
      );
      expect(block).toContain(
        "@Header('X-FitMeet-Agent-Preferred-Protocol', 'social-agent-event-v2')",
      );
    }
  });

  it('does not mark streaming endpoints as legacy JSON compatibility paths', () => {
    const source = controllerSource();
    const streamRoutes = [
      'route-message/stream',
      'messages/stream',
      'tasks/:id/messages/stream',
      'tasks/:id/actions/stream',
      'checkpoints/:id/resume/stream',
      'checkpoints/:id/replay/stream',
      'checkpoints/:id/retry/stream',
      'checkpoints/:id/steps/:stepId/retry/stream',
      'checkpoints/:id/steps/:stepId/replay/stream',
      'checkpoints/:id/steps/:stepId/fork/stream',
      'checkpoints/:id/fork/stream',
      'stream',
      'stream-user',
    ];

    for (const route of streamRoutes) {
      const block = routeBlock(source, route);
      expect(block).not.toContain('X-FitMeet-Agent-Compatibility');
      expect(block).not.toContain('legacy-json');
    }
  });

  it('keeps every user-facing streaming endpoint on the SocialAgentEventV2 prelude path', () => {
    const source = controllerSource();
    const routeExpectations: Record<string, string[]> = {
      'route-message/stream': ['return this.streamUserFacingMessage'],
      'messages/stream': ['return this.streamUserFacingMessage'],
      'tasks/:id/messages/stream': ['return this.streamUserFacingMessage'],
      'tasks/:id/actions/stream': ['return this.streamUserFacingAction'],
      'checkpoints/:id/resume/stream': ['return this.streamCheckpointAction'],
      'checkpoints/:id/replay/stream': ['return this.streamCheckpointAction'],
      'checkpoints/:id/retry/stream': ['return this.streamCheckpointAction'],
      'checkpoints/:id/steps/:stepId/retry/stream': [
        'return this.streamCheckpointStepAction',
      ],
      'checkpoints/:id/steps/:stepId/replay/stream': [
        'return this.streamCheckpointStepAction',
      ],
      'checkpoints/:id/steps/:stepId/fork/stream': [
        'return this.streamCheckpointStepAction',
      ],
      'checkpoints/:id/fork/stream': ['return this.streamCheckpointAction'],
      stream: ['writeRunStarted', 'writeHydrateContext'],
      'stream-user': ['writeRunStarted', 'writeHydrateContext'],
    };

    for (const [route, expectedPatterns] of Object.entries(routeExpectations)) {
      const block = routeBlock(source, route);
      for (const expected of expectedPatterns) {
        expect(block).toContain(expected);
      }
    }

    expect(source).toContain('private async streamUserFacingMessage');
    expect(source).toContain('private async streamUserFacingAction');
    expect(source).toContain('private async streamCheckpointAction');
    expect(source).toContain('private async streamCheckpointStepAction');
    expect(source).toContain('await socialCodexEvents.writeRunStarted');
    expect(source).toContain('await socialCodexEvents.writeHydrateContext');
  });
});

describe('SocialAgentChatController user-facing stream', () => {
  it('emits an early visible slot trace before the final result so users do not stare at waiting dots', async () => {
    const writes: string[] = [];
    const chat = {
      runStream: jest.fn(async (_userId, _body, emit) => {
        await emit({
          type: 'result',
          result: {
            taskId: 707,
            status: AgentTaskStatus.Succeeded,
            visibleSteps: [],
            assistantMessage: '我会按这些信息继续。',
            socialRequestDraft: null,
            candidates: [],
            approvalRequiredActions: [],
            events: [],
            cards: [],
            safety: {
              blocked: false,
              level: 'low',
              reasons: [],
              boundaryNotes: [],
              requiredConfirmations: [],
            },
          },
        });
      }),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new SocialAgentTaskMemoryStateMachineService(),
    );
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: jest.fn(),
    } as unknown as Response;

    await controller.streamUserFacingRun(
      { user: { id: 7 } } as Parameters<
        SocialAgentChatController['streamUserFacingRun']
      >[0],
      { goal: '周末下午，散步，崂山区青岛大学' },
      response,
    );

    const serialized = writes.join('');
    expect(response.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    const earlySlotIndex = serialized.indexOf('"type":"slot.filled"');
    const resultIndex = serialized.indexOf('"type":"result"');
    expect(earlySlotIndex).toBeGreaterThan(-1);
    expect(resultIndex).toBeGreaterThan(-1);
    expect(earlySlotIndex).toBeLessThan(resultIndex);
    expect(serialized).toContain('已记录你补充的信息');
    expect(serialized).toContain('周末下午');
    expect(serialized).toContain('散步');
    expect(serialized).toContain('青岛大学');
  });

  it('keeps Social Codex stream events bound to the explicit task even when client context has a stale thread id', async () => {
    const writes: string[] = [];
    const chat = {
      runStream: jest.fn(async (_userId, _body, emit) => {
        await emit({
          type: 'result',
          result: {
            taskId: 202,
            status: AgentTaskStatus.Succeeded,
            visibleSteps: [],
            assistantMessage: '我会继续处理这次约练任务。',
            socialRequestDraft: null,
            candidates: [],
            approvalRequiredActions: [],
            events: [],
            cards: [],
            safety: {
              blocked: false,
              level: 'low',
              reasons: [],
              boundaryNotes: [],
              requiredConfirmations: [],
            },
          },
        });
      }),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new SocialAgentTaskMemoryStateMachineService(),
    );
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: jest.fn(),
    } as unknown as Response;

    await controller.streamUserFacingRun(
      { user: { id: 7 } } as Parameters<
        SocialAgentChatController['streamUserFacingRun']
      >[0],
      {
        goal: '继续刚才的约练任务',
        taskId: 202,
        clientContext: { threadId: 'agent-task:999' },
      },
      response,
    );

    const serialized = writes.join('');
    expect(serialized).toContain('"threadId":"agent-task:202"');
    expect(serialized).toContain('"taskId":202');
    expect(serialized).not.toContain('agent-task:999');
  });

  it('writes an immediate Social Codex status before a slow downstream run resolves', async () => {
    const writes: string[] = [];
    let releaseRun!: () => void;
    let downstreamStarted = false;
    const downstreamGate = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });
    const chat = {
      runStream: jest.fn(async (_userId, _body, emit) => {
        downstreamStarted = true;
        await emit({
          type: 'task',
          taskId: 708,
          status: AgentTaskStatus.Executing,
        });
        await downstreamGate;
        await emit({
          type: 'result',
          result: {
            taskId: 708,
            status: AgentTaskStatus.Succeeded,
            visibleSteps: [],
            assistantMessage: '我已经按这些条件继续处理。',
            socialRequestDraft: null,
            candidates: [],
            approvalRequiredActions: [],
            events: [],
            cards: [],
            safety: {
              blocked: false,
              level: 'low',
              reasons: [],
              boundaryNotes: [],
              requiredConfirmations: [],
            },
          },
        });
      }),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new SocialAgentTaskMemoryStateMachineService(),
    );
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      flush: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: jest.fn(),
    } as unknown as Response;

    const stream = controller.streamUserFacingRun(
      { user: { id: 7 } } as Parameters<
        SocialAgentChatController['streamUserFacingRun']
      >[0],
      { goal: '今天晚上，散步，青岛大学附近' },
      response,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const early = writes.join('');
    expect(downstreamStarted).toBe(true);
    expect(response.flushHeaders).toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    expect(response.flush).toHaveBeenCalled();
    expect(early).toContain('"type":"run.started"');
    expect(early).toContain('"type":"visible_process.delta"');
    expect(early).toContain('"taskId":708');
    expect(early).toContain('"threadId":"agent-task:708"');
    expect(early).toMatch(
      /"type":"run\.started"[\s\S]*?"threadId":"agent-task:708"[\s\S]*?"taskId":708/,
    );
    expect(early).toMatch(
      /"type":"visible_process\.delta"[\s\S]*?"threadId":"agent-task:708"[\s\S]*?"taskId":708/,
    );
    expect(early).toContain('正在理解你的需求');
    expect(early).toContain('正在读取你的偏好');
    expect(early).not.toContain('"type":"result"');

    releaseRun();
    await stream;
    expect(writes.join('')).toContain('"type":"result"');
  });

  it('uses neutral thinking copy for ordinary conversation streams', async () => {
    const writes: string[] = [];
    let releaseRun!: () => void;
    const downstreamGate = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });
    const chat = {
      handleMessageStream: jest.fn(async (_userId, _body, emit) => {
        await downstreamGate;
        await emit({
          type: 'assistant_delta',
          messageId: 'ordinary-chat',
          delta: '当然可以，我先直接回答你的问题。',
          source: 'llm',
        });
        await emit({
          type: 'assistant_done',
          messageId: 'ordinary-chat',
          source: 'llm',
        });
        return {
          taskId: null,
          status: AgentTaskStatus.Succeeded,
          intent: 'answer',
          confidence: 0.9,
          entities: {},
          shouldSearch: false,
          shouldReplan: false,
          shouldUpdateProfile: false,
          shouldExecuteAction: false,
          replyStrategy: 'conversation',
          source: 'llm',
          action: 'answer',
          savedContext: false,
          profileUpdated: false,
          shouldQueueRun: false,
          runMode: null,
          assistantMessage: '当然可以，我先直接回答你的问题。',
          cards: [],
          permissionMode: 'limited_auto',
          safety: {
            blocked: false,
            level: 'low',
            reasons: [],
            boundaryNotes: [],
            requiredConfirmations: [],
          },
        };
      }),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new SocialAgentTaskMemoryStateMachineService(),
    );
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      flush: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: jest.fn(),
    } as unknown as Response;

    const stream = controller.handleMessageStream(
      { user: { id: 7 } } as Parameters<
        SocialAgentChatController['handleMessageStream']
      >[0],
      {
        message: '你有什么功能？',
        conversationIntent: 'conversation',
        clientContext: {
          source: 'web',
          threadId: 'thread-ordinary',
          conversationIntent: 'conversation',
        },
      },
      response,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const early = writes.join('');
    expect(early).toContain('"type":"run.started"');
    expect(early).toContain('正在思考');
    expect(early).toContain('会直接回复，不触发社交工具');
    expect(early).not.toContain('正在理解你的需求');
    expect(early).not.toContain('"type":"assistant_delta"');

    releaseRun();
    await stream;
    expect(writes.join('')).toContain('"type":"assistant_delta"');
  });

  it('writes an immediate Social Codex status before a slow message stream resolves', async () => {
    const writes: string[] = [];
    let releaseRun!: () => void;
    let downstreamStarted = false;
    const downstreamGate = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });
    const chat = {
      handleMessageStream: jest.fn(async (_userId, _body, emit) => {
        downstreamStarted = true;
        await downstreamGate;
        await emit({
          type: 'assistant_delta',
          messageId: 'message-early-status',
          delta: '我会基于你刚才补充的信息继续。',
          source: 'llm',
        });
        await emit({
          type: 'assistant_done',
          messageId: 'message-early-status',
          source: 'llm',
        });
        return {
          taskId: 709,
          status: AgentTaskStatus.Succeeded,
          intent: 'social_search',
          confidence: 0.9,
          entities: {},
          shouldSearch: false,
          shouldReplan: false,
          shouldUpdateProfile: false,
          shouldExecuteAction: false,
          replyStrategy: 'conversation',
          source: 'rules',
          action: 'continue',
          savedContext: true,
          profileUpdated: false,
          shouldQueueRun: false,
          runMode: null,
          assistantMessage: '我会基于你刚才补充的信息继续。',
          cards: [],
          permissionMode: 'limited_auto',
          safety: {
            blocked: false,
            level: 'low',
            reasons: [],
            boundaryNotes: [],
            requiredConfirmations: [],
          },
        };
      }),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new SocialAgentTaskMemoryStateMachineService(),
    );
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      flush: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: jest.fn(),
    } as unknown as Response;

    const stream = controller.handleMessageStream(
      { user: { id: 7 } } as Parameters<
        SocialAgentChatController['handleMessageStream']
      >[0],
      { message: '可以，帮我找人', taskId: 709 },
      response,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const early = writes.join('');
    expect(downstreamStarted).toBe(true);
    expect(response.flushHeaders).toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    expect(response.flush).toHaveBeenCalled();
    expect(early).toContain('"type":"run.started"');
    expect(early).toContain('"type":"visible_process.delta"');
    expect(early).toContain('正在理解你的需求');
    expect(early).toContain('正在读取你的偏好');
    expect(early).not.toContain('"type":"assistant_delta"');
    expect(early).not.toContain('"type":"result"');

    releaseRun();
    await stream;
    const serialized = writes.join('');
    expect(serialized).toContain('"type":"assistant_delta"');
    expect(serialized).toContain('"type":"assistant.delta"');
    expect(serialized).toContain('"type":"result"');
  });

  it('binds message stream initial trace to the result task when downstream emits no task event', async () => {
    const writes: string[] = [];
    const chat = {
      handleMessageStream: jest.fn(async () => ({
        taskId: 710,
        status: AgentTaskStatus.Succeeded,
        intent: 'social_search',
        confidence: 0.9,
        entities: {},
        shouldSearch: false,
        shouldReplan: false,
        shouldUpdateProfile: false,
        shouldExecuteAction: false,
        replyStrategy: 'conversation',
        source: 'rules',
        action: 'continue',
        savedContext: true,
        profileUpdated: false,
        shouldQueueRun: false,
        runMode: null,
        assistantMessage: '我已经记住你想今晚在青岛大学附近散步。',
        cards: [],
        permissionMode: 'limited_auto',
        safety: {
          blocked: false,
          level: 'low',
          reasons: [],
          boundaryNotes: [],
          requiredConfirmations: [],
        },
      })),
    };
    const finalResponses = {
      generate: jest.fn(async (_input, options) => {
        options?.onDelta?.(
          '我会沿用今晚、青岛大学附近、散步和舞蹈相关公开标签继续。',
        );
        return '我会沿用今晚、青岛大学附近、散步和舞蹈相关公开标签继续。';
      }),
    };
    const contextHydrator = {
      hydrateContext: jest.fn().mockResolvedValue({
        userId: 7,
        threadId: 'agent-task:710',
        taskId: 710,
        recentMessages: [
          {
            role: 'user',
            text: '今晚青岛大学附近散步，最好找舞蹈相关公开标签的人。',
          },
        ],
        taskMemory: {
          currentGoal: '今晚青岛大学附近散步',
          candidatePreference: '舞蹈相关公开标签优先',
        },
        taskSlots: {
          activity: { value: '散步', state: 'completed' },
          time_window: { value: '今天晚上', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
          candidate_preference: {
            value: '舞蹈相关公开标签优先',
            state: 'answered',
          },
        },
        lifeGraphSummary: {
          boundaries: { firstMeet: '公共场所优先' },
        },
        lifeGraphGovernanceSummary: { total: 0 },
        lifeGraphFactDisplaySummaries: [],
        pendingApprovals: [
          {
            approvalId: 'approval-publish-710',
            actionType: 'publish_social_request',
          },
        ],
        candidateActions: {
          skippedIds: [29],
          savedIds: [22],
        },
      }),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
      undefined,
      undefined,
      finalResponses as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      contextHydrator as never,
      undefined,
      new SocialAgentTaskMemoryStateMachineService(),
    );
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      flush: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: jest.fn(),
    } as unknown as Response;

    await controller.handleMessageStream(
      { user: { id: 7 } } as Parameters<
        SocialAgentChatController['handleMessageStream']
      >[0],
      { message: '今天晚上，散步，青岛大学附近' },
      response,
    );

    const serialized = writes.join('');
    expect(serialized).toMatch(
      /"type":"run\.started"[\s\S]*?"threadId":"agent-task:710"[\s\S]*?"taskId":710/,
    );
    expect(serialized).toMatch(
      /"type":"visible_process\.delta"[\s\S]*?"threadId":"agent-task:710"[\s\S]*?"taskId":710/,
    );
    expect(serialized).toContain('"type":"slot.filled"');
    expect(serialized).toContain('今天晚上');
    expect(serialized).toContain('青岛大学');
    expect(contextHydrator.hydrateContext).toHaveBeenCalledWith({
      userId: 7,
      taskId: 710,
      threadId: 'agent-task:710',
    });
    expect(finalResponses.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: '今天晚上，散步，青岛大学附近',
        conversationHistory: expect.arrayContaining([
          expect.objectContaining({
            text: '今晚青岛大学附近散步，最好找舞蹈相关公开标签的人。',
          }),
        ]),
        memoryContext: expect.objectContaining({
          candidateActions: expect.objectContaining({
            skippedIds: [29],
            savedIds: [22],
          }),
          pendingApprovals: expect.arrayContaining([
            expect.objectContaining({
              actionType: 'publish_social_request',
            }),
          ]),
        }),
        taskContext: expect.objectContaining({
          taskId: 710,
          threadId: 'agent-task:710',
          taskSlots: expect.objectContaining({
            candidate_preference: expect.objectContaining({
              value: '舞蹈相关公开标签优先',
            }),
          }),
          candidateActions: expect.objectContaining({
            skippedIds: [29],
            savedIds: [22],
          }),
          pendingApprovals: expect.arrayContaining([
            expect.objectContaining({
              actionType: 'publish_social_request',
            }),
          ]),
        }),
      }),
      expect.objectContaining({
        onDelta: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(serialized).toContain('"assistantMessageSource":"llm"');
    expect(serialized).toContain('"type":"result"');
  });

  it('hydrates final LLM reply generation with recent messages, task slots, and Life Graph context', async () => {
    const writes: string[] = [];
    const chat = {
      runStream: jest.fn(async (_userId, _body, emit) => {
        await emit({
          type: 'result',
          result: {
            taskId: 909,
            status: AgentTaskStatus.Succeeded,
            visibleSteps: [],
            assistantMessage: '我会继续处理。',
            socialRequestDraft: null,
            candidates: [],
            approvalRequiredActions: [],
            events: [],
            cards: [],
            safety: {
              blocked: false,
              level: 'low',
              reasons: [],
              boundaryNotes: [],
              requiredConfirmations: [],
            },
          },
        });
      }),
    };
    const finalResponses = {
      generate: jest.fn(async (_input, options) => {
        options?.onDelta?.('我记得你要今晚在青岛大学附近散步。');
        return '我记得你要今晚在青岛大学附近散步。';
      }),
    };
    const contextHydrator = {
      hydrateContext: jest.fn().mockResolvedValue({
        userId: 7,
        threadId: 909,
        taskId: 909,
        recentMessages: [
          {
            role: 'user',
            text: '我想今晚在青岛大学附近散步，最好找舞蹈相关的人。',
          },
          {
            role: 'assistant',
            text: '我会先记录你的时间、地点和偏好。',
          },
        ],
        taskMemory: {
          currentGoal: '今晚青岛大学附近散步',
          preferences: { candidatePreference: '舞蹈相关公开标签优先' },
        },
        taskSlots: {
          activity: { value: '散步', state: 'completed' },
          time_window: { value: '今天晚上', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
        },
        lifeGraphSummary: {
          preferences: { intensity: '低强度' },
          boundaries: { firstMeet: '公共场所优先' },
        },
        lifeGraphGovernanceSummary: { total: 0 },
        lifeGraphFactDisplaySummaries: [],
        pendingApprovals: [],
        candidateActions: {
          liked: ['candidate-1'],
          skipped: [],
        },
      }),
    };
    const task = { id: 909, ownerUserId: 7 };
    const messageLog = {
      recordAssistantRunMessage: jest.fn().mockResolvedValue(undefined),
    };
    const taskLifecycle = {
      assertTaskOwner: jest.fn().mockResolvedValue(task),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
      undefined,
      undefined,
      finalResponses as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      contextHydrator as never,
      undefined,
      new SocialAgentTaskMemoryStateMachineService(),
      undefined,
      messageLog as never,
      taskLifecycle as never,
    );
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: jest.fn(),
    } as unknown as Response;

    await controller.streamUserFacingRun(
      { user: { id: 7 } } as Parameters<
        SocialAgentChatController['streamUserFacingRun']
      >[0],
      { goal: '可以，帮我找人' },
      response,
    );

    expect(contextHydrator.hydrateContext).toHaveBeenCalledWith({
      userId: 7,
      taskId: 909,
      threadId: 'agent-task:909',
    });
    expect(finalResponses.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationHistory: expect.arrayContaining([
          expect.objectContaining({
            text: '我想今晚在青岛大学附近散步，最好找舞蹈相关的人。',
          }),
        ]),
        memoryContext: expect.objectContaining({
          taskSlots: expect.objectContaining({
            activity: expect.objectContaining({ value: '散步' }),
            time_window: expect.objectContaining({ value: '今天晚上' }),
            location_text: expect.objectContaining({ value: '青岛大学附近' }),
          }),
          lifeGraphSummary: expect.objectContaining({
            boundaries: expect.objectContaining({
              firstMeet: '公共场所优先',
            }),
          }),
          candidateActions: expect.objectContaining({
            liked: ['candidate-1'],
          }),
        }),
        taskContext: expect.objectContaining({
          taskId: 909,
          threadId: 909,
          taskSlots: expect.objectContaining({
            time_window: expect.objectContaining({ value: '今天晚上' }),
          }),
        }),
      }),
      expect.objectContaining({
        onDelta: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(writes.join('')).toContain('"type":"assistant.delta"');
    expect(writes.join('')).toContain('"assistantMessageSource":"llm"');
    expect(writes.join('')).toContain('我记得你要今晚在青岛大学附近散步。');
    expect(chat.runStream).toHaveBeenCalledWith(
      7,
      { goal: '可以，帮我找人' },
      expect.any(Function),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        deferAssistantMessageLog: true,
      }),
    );
    expect(taskLifecycle.assertTaskOwner).toHaveBeenCalledWith(909, 7);
    expect(messageLog.recordAssistantRunMessage).toHaveBeenCalledWith(
      task,
      '我记得你要今晚在青岛大学附近散步。',
      expect.objectContaining({
        taskId: 909,
        assistantMessage: '我记得你要今晚在青岛大学附近散步。',
        assistantStreamed: true,
        assistantMessageSource: 'llm',
      }),
    );
  });

  it('hydrates task message streams through the explicit task context instead of a stale client thread', async () => {
    const writes: string[] = [];
    const chat = {
      handleMessageStream: jest.fn(async () => ({
        taskId: 515,
        status: AgentTaskStatus.Succeeded,
        intent: 'social_search',
        confidence: 0.92,
        entities: {},
        shouldSearch: true,
        shouldReplan: false,
        shouldUpdateProfile: false,
        shouldExecuteAction: false,
        replyStrategy: 'conversation',
        source: 'llm',
        action: 'continue',
        savedContext: true,
        profileUpdated: false,
        shouldQueueRun: false,
        runMode: null,
        assistantMessage: '我会基于已确认的约练需求继续筛选。',
        cards: [],
        permissionMode: 'limited_auto',
        safety: {
          blocked: false,
          level: 'low',
          reasons: [],
          boundaryNotes: [],
          requiredConfirmations: [],
        },
      })),
    };
    const finalResponses = {
      generate: jest.fn(async (_input, options) => {
        options?.onDelta?.(
          '明白，我会沿用今晚、青岛大学附近、散步和舞蹈相关偏好继续找人。',
        );
        return '明白，我会沿用今晚、青岛大学附近、散步和舞蹈相关偏好继续找人。';
      }),
    };
    const contextHydrator = {
      hydrateContext: jest.fn().mockResolvedValue({
        userId: 7,
        threadId: 'agent-task:515',
        taskId: 515,
        recentMessages: [
          {
            role: 'user',
            text: '我想今晚在青岛大学附近散步，最好找舞蹈相关的人。',
          },
          {
            role: 'assistant',
            text: '我已记录活动、时间、地点和候选偏好。',
          },
        ],
        taskMemory: {
          currentGoal: '今晚青岛大学附近散步',
          preferences: { candidatePreference: '舞蹈相关公开标签优先' },
        },
        taskSlots: {
          activity: { value: '散步', state: 'completed' },
          time_window: { value: '今天晚上', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
          candidate_preference: {
            value: '公开资料里有舞蹈相关标签的人',
            state: 'answered',
          },
        },
        lifeGraphSummary: {
          preferences: { intensity: '低强度' },
          boundaries: { firstMeet: '公共场所优先' },
        },
        lifeGraphGovernanceSummary: { total: 0 },
        lifeGraphFactDisplaySummaries: [],
        pendingApprovals: [],
        candidateActions: {
          savedIds: [22],
          skippedIds: [29],
        },
      }),
    };
    const messageLog = {
      recordAssistantMessage: jest.fn().mockResolvedValue(undefined),
    };
    const taskLifecycle = {
      assertTaskOwner: jest
        .fn()
        .mockResolvedValue({ id: 515, ownerUserId: 7 }),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
      undefined,
      undefined,
      finalResponses as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      contextHydrator as never,
      undefined,
      new SocialAgentTaskMemoryStateMachineService(),
      undefined,
      messageLog as never,
      taskLifecycle as never,
    );
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: jest.fn(),
    } as unknown as Response;

    await controller.handleTaskMessageStream(
      { user: { id: 7 } } as Parameters<
        SocialAgentChatController['handleTaskMessageStream']
      >[0],
      515,
      {
        message: '可以，帮我找人',
        clientContext: { threadId: 'agent-task:999' },
      },
      response,
    );

    expect(chat.handleMessageStream).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        message: '可以，帮我找人',
        taskId: 515,
        clientContext: { threadId: 'agent-task:999' },
      }),
      expect.any(Function),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        deferAssistantMessageLog: true,
      }),
    );
    expect(contextHydrator.hydrateContext).toHaveBeenCalledWith({
      userId: 7,
      taskId: 515,
      threadId: 'agent-task:515',
    });
    expect(finalResponses.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: '可以，帮我找人',
        conversationHistory: expect.arrayContaining([
          expect.objectContaining({
            text: '我想今晚在青岛大学附近散步，最好找舞蹈相关的人。',
          }),
        ]),
        memoryContext: expect.objectContaining({
          taskSlots: expect.objectContaining({
            time_window: expect.objectContaining({ value: '今天晚上' }),
            location_text: expect.objectContaining({ value: '青岛大学附近' }),
            candidate_preference: expect.objectContaining({
              value: '公开资料里有舞蹈相关标签的人',
            }),
          }),
          lifeGraphSummary: expect.objectContaining({
            boundaries: expect.objectContaining({
              firstMeet: '公共场所优先',
            }),
          }),
          candidateActions: expect.objectContaining({
            savedIds: [22],
            skippedIds: [29],
          }),
        }),
        taskContext: expect.objectContaining({
          taskId: 515,
          threadId: 'agent-task:515',
          taskSlots: expect.objectContaining({
            activity: expect.objectContaining({ value: '散步' }),
          }),
        }),
      }),
      expect.objectContaining({
        onDelta: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
    const serialized = writes.join('');
    expect(serialized).toContain('"threadId":"agent-task:515"');
    expect(serialized).not.toContain('agent-task:999');
    expect(serialized).toContain('舞蹈相关偏好继续找人');
    expect(taskLifecycle.assertTaskOwner).toHaveBeenCalledWith(515, 7);
    expect(messageLog.recordAssistantMessage).toHaveBeenCalledWith(
      { id: 515, ownerUserId: 7 },
      '明白，我会沿用今晚、青岛大学附近、散步和舞蹈相关偏好继续找人。',
      expect.objectContaining({
        taskId: 515,
        assistantMessage:
          '明白，我会沿用今晚、青岛大学附近、散步和舞蹈相关偏好继续找人。',
        assistantStreamed: true,
        assistantMessageSource: 'llm',
      }),
      {},
    );
  });

  it('does not pass recovery checkpoint copy as final assistant fallback text', async () => {
    const writes: string[] = [];
    const chat = {
      runStream: jest.fn(async (_userId, _body, emit) => {
        await emit({
          type: 'result',
          result: {
            taskId: 910,
            status: AgentTaskStatus.WaitingReply,
            visibleSteps: [],
            assistantMessage:
              '从已保存的步骤继续：正在等待你确认。原始目标：你有什么功能',
            socialRequestDraft: null,
            candidates: [],
            approvalRequiredActions: [],
            events: [],
            cards: [],
            safety: {
              blocked: false,
              level: 'low',
              reasons: [],
              boundaryNotes: [],
              requiredConfirmations: [],
            },
          },
        });
      }),
    };
    const finalResponses = {
      generate: jest.fn(async () => ''),
    };
    const contextHydrator = {
      hydrateContext: jest.fn().mockResolvedValue({
        userId: 7,
        threadId: 910,
        taskId: 910,
        recentMessages: [],
        taskMemory: {},
        taskSlots: {},
        lifeGraphSummary: {},
        lifeGraphGovernanceSummary: { total: 0 },
        lifeGraphFactDisplaySummaries: [],
        pendingApprovals: [],
        candidateActions: { liked: [], skipped: [] },
      }),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
      undefined,
      undefined,
      finalResponses as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      contextHydrator as never,
      undefined,
      new SocialAgentTaskMemoryStateMachineService(),
    );
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: jest.fn(),
    } as unknown as Response;

    await controller.streamUserFacingRun(
      { user: { id: 7 } } as Parameters<
        SocialAgentChatController['streamUserFacingRun']
      >[0],
      { goal: '继续刚才的话题' },
      response,
    );

    expect(finalResponses.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackReply: '',
      }),
      expect.objectContaining({
        onDelta: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
    const serialized = writes.join('');
    expect(serialized).not.toContain('从已保存的步骤继续');
    expect(serialized).not.toContain('原始目标');
    expect(serialized).not.toContain('"type":"assistant_delta"');
    expect(serialized).not.toContain('"type":"assistant_done"');
    expect(serialized).toContain('"assistantMessageSource":"fallback"');
  });

  it('streams fallback deltas, light status, and sanitized user-facing result when the run only emits a result', async () => {
    const writes: string[] = [];
    const chat = {
      runStream: jest.fn(async (_userId, _body, emit) => {
        await emit({
          type: 'step',
          step: {
            id: 'planner.internal',
            label: 'planner tool call with traceId',
            status: 'running',
          },
        });
        await emit({
          type: 'result',
          result: {
            taskId: 101,
            status: AgentTaskStatus.Succeeded,
            visibleSteps: [],
            assistantMessage: '我会先结合你的 Life Graph，再筛选合适的人。',
            socialRequestDraft: null,
            candidates: [],
            approvalRequiredActions: [],
            events: [{ traceId: 'hidden-event' }],
            cards: [
              {
                id: 'candidate-1',
                type: 'candidate_card',
                title: '小林',
                body: '你们的时间和边界比较一致。',
                data: {
                  recommendationLine: '适合从一次轻松慢跑开始。',
                  traceId: 'hidden-trace',
                  structuredIntent: { planner: 'hidden-planner' },
                  nested: { toolCalls: [{ name: 'search' }] },
                },
                actions: [],
              },
            ],
            safety: {
              blocked: false,
              level: 'low',
              reasons: ['internal guardrail reason'],
              boundaryNotes: ['第一次建议选择公共场所。'],
              requiredConfirmations: ['发送消息'],
            },
            traceId: 'hidden-trace',
            agentTrace: {
              traceId: 'hidden-trace',
              sdkEnabled: true,
              model: 'hidden-model',
              agentPath: ['Main Agent'],
              handoffs: [],
              guardrails: [],
            },
            structuredIntent: { planner: 'hidden-planner' },
          },
        });
      }),
    };
    const candidateCommands = {};
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      candidateCommands as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
    );
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: jest.fn(),
    } as unknown as Response;

    await controller.streamUserFacingRun(
      { user: { id: 7 } } as Parameters<
        SocialAgentChatController['streamUserFacingRun']
      >[0],
      { goal: '今晚想找青岛大学附近跑步搭子' },
      response,
    );

    const serialized = writes.join('');
    expect(serialized).toContain('"type":"assistant_delta"');
    expect(serialized).not.toContain('"type":"assistant.delta"');
    expect(serialized).toContain('"type":"assistant_done"');
    expect(serialized).toContain('"source":"fallback"');
    expect(serialized).toContain('"assistantMessageSource":"fallback"');
    expect(serialized).toContain('"type":"progress"');
    expect(serialized).toContain('"lifecycle":"analyzing_intent"');
    expect(serialized).toContain('正在推进当前进度');
    expect(serialized).toContain('正在理解你的需求');
    expect(serialized).toContain('assistantMessage');
    expect(serialized).toContain('"lifecycle":"checking_safety"');
    expect(serialized).toContain('cards');
    expect(serialized).not.toContain('traceId');
    expect(serialized).not.toContain('agentTrace');
    expect(serialized).not.toContain('structuredIntent');
    expect(serialized).not.toContain('planner');
    expect(serialized).not.toContain('toolCalls');
    expect(serialized).not.toContain('hidden-model');
    expect(chat.runStream).toHaveBeenCalledWith(
      7,
      { goal: '今晚想找青岛大学附近跑步搭子' },
      expect.any(Function),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('emits Social Codex V2 visible process events for profile gate, candidate search, opportunity card, and approval', async () => {
    const writes: string[] = [];
    const chat = {
      runStream: jest.fn(async (_userId, _body, emit) => {
        await emit({
          type: 'result',
          result: {
            taskId: 202,
            status: AgentTaskStatus.Succeeded,
            visibleSteps: [],
            assistantMessage:
              '我已经整理好周末青岛大学附近散步的约练卡，发布前需要你确认。',
            socialRequestDraft: null,
            candidates: [],
            approvalRequiredActions: [
              {
                id: 'approval-publish-202',
                actionType: 'publish_social_request',
                summary: '发布周末青岛大学附近散步约练卡到发现',
                riskLevel: 'medium',
                payload: {
                  checkpointId: 909,
                  dryRunPreview: {
                    title: '发布到发现前预览',
                    summary: '发布周末青岛大学附近散步约练卡到发现',
                  },
                  socialCodex: {
                    approvalPolicy: {
                      required: true,
                      lifecycleNode: 'approval',
                    },
                  },
                },
              },
            ],
            events: [],
            cards: [
              {
                id: 'candidate-22',
                type: 'candidate_card',
                schemaVersion: 'fitmeet.tool-ui.v1',
                schemaType: 'social_match.candidate',
                title: '公开可发现用户',
                body: '你们都偏好周末下午低强度散步。',
                data: {
                  schemaName: 'CandidateCards',
                  schemaVersion: 'fitmeet.tool-ui.v1',
                  schemaType: 'social_match.candidate',
                },
                actions: [],
              },
              {
                id: 'opportunity-202',
                type: 'activity_plan',
                schemaVersion: 'fitmeet.tool-ui.v1',
                schemaType: 'social_match.activity',
                title: '周末青岛大学散步搭子',
                body: '低强度、公共场所优先。',
                data: {
                  schemaName: 'OpportunityCard',
                  schemaVersion: 'fitmeet.tool-ui.v1',
                  schemaType: 'social_match.activity',
                  opportunityCard: true,
                  opportunity: {
                    title: '周末青岛大学散步搭子',
                  },
                },
                actions: [],
              },
            ],
            safety: {
              blocked: false,
              level: 'medium',
              reasons: [],
              boundaryNotes: ['发布前会确认公开内容，不公开精确位置。'],
              requiredConfirmations: ['发布约练卡'],
            },
          },
        });
      }),
    };
    const profileGate = {
      getMinimumProfileStatus: jest.fn().mockResolvedValue({
        passed: false,
        missing: ['city', 'availability'],
        assistantMessage: '',
        profileCompleteness: 45,
        readinessLevel: 'basic',
        canEnterMatchPool: false,
        nextActions: ['补充城市/区域', '补充可约时间'],
      }),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      profileGate as never,
    );
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: jest.fn(),
    } as unknown as Response;

    await controller.streamUserFacingRun(
      { user: { id: 7 } } as Parameters<
        SocialAgentChatController['streamUserFacingRun']
      >[0],
      { goal: '周末下午，散步，崂山区青岛大学' },
      response,
    );

    const serialized = writes.join('');
    expect(profileGate.getMinimumProfileStatus).toHaveBeenCalledWith(7);
    expect(serialized).toContain('"type":"run.started"');
    expect(serialized).toContain('"type":"visible_process.delta"');
    expect(serialized).toContain('"stage":"hydrate_context"');
    expect(serialized).toContain('"stage":"profile_gate"');
    expect(serialized).toContain('"threadId":"agent-task:202","taskId":202');
    expect(serialized).toContain('匹配前还差一点人物画像');
    expect(serialized).toContain('正在筛选公开可发现的人');
    expect(serialized).toContain('"type":"candidate_search.started"');
    expect(serialized).toContain('"type":"candidate_search.done"');
    expect(serialized).toContain('找到 1 个公开可发现的人');
    expect(serialized).toContain('"type":"opportunity_card.created"');
    expect(serialized).toContain('这张约练卡可以发布到发现');
    expect(serialized).toContain('"type":"safety_check.done"');
    expect(serialized).toContain('已检查安全边界');
    expect(serialized).toContain('"type":"approval.required"');
    expect(serialized).toContain('发送邀请前需要你确认');
    expect(serialized).toContain('"checkpointId":909');
    expect(serialized).toContain('发布到发现前预览');
    expect(serialized).toContain('"lifecycleNode":"approval"');
    expect(serialized).toContain('"type":"run.completed"');
    expect(
      serialized.indexOf('"type":"candidate_search.started"'),
    ).toBeLessThan(serialized.indexOf('"type":"candidate_search.done"'));
    expect(serialized).not.toContain('planner');
    expect(serialized).not.toContain('traceId');
    expect(serialized).not.toContain('tool_call_started');
  });

  it('keeps the legacy stream endpoint on the same V2 visible process path', async () => {
    const writes: string[] = [];
    const chat = {
      runStream: jest.fn(async (_userId, _body, emit) => {
        await emit({
          type: 'result',
          result: {
            taskId: 606,
            status: AgentTaskStatus.Succeeded,
            visibleSteps: [],
            assistantMessage:
              '我已经记录你的周末下午青岛大学散步需求，并准备继续筛选公开可发现的人。',
            socialRequestDraft: null,
            candidates: [],
            approvalRequiredActions: [],
            events: [],
            cards: [
              {
                id: 'opportunity-606',
                type: 'activity_plan',
                schemaVersion: 'fitmeet.tool-ui.v1',
                schemaType: 'social_match.activity',
                title: '周末青岛大学散步搭子',
                body: '低强度、公共场所优先。',
                data: {
                  schemaName: 'OpportunityCard',
                  schemaVersion: 'fitmeet.tool-ui.v1',
                  schemaType: 'social_match.activity',
                  opportunityCard: true,
                  opportunity: {
                    title: '周末青岛大学散步搭子',
                  },
                },
                actions: [],
              },
            ],
            safety: {
              blocked: false,
              level: 'low',
              reasons: [],
              boundaryNotes: ['第一次见面建议选择公共场所。'],
              requiredConfirmations: [],
            },
          },
        });
      }),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new SocialAgentTaskMemoryStateMachineService(),
    );
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: jest.fn(),
    } as unknown as Response;

    await controller.streamRun(
      { user: { id: 7 } } as Parameters<
        SocialAgentChatController['streamRun']
      >[0],
      {
        goal: '周末下午，散步，崂山区青岛大学',
        clientContext: { threadId: 'agent-task:606' },
      },
      response,
    );

    const serialized = writes.join('');
    expect(serialized).toContain('"type":"run.started"');
    expect(serialized).toContain('"type":"visible_process.delta"');
    expect(serialized).toContain('"type":"slot.filled"');
    expect(serialized).toContain('周末下午');
    expect(serialized).toContain('散步');
    expect(serialized).toContain('青岛大学');
    expect(serialized).toContain('"type":"opportunity_card.created"');
    expect(serialized).toContain('这张约练卡可以发布到发现');
    expect(serialized).toContain('"type":"run.completed"');
    expect(serialized).toContain('"type":"result"');
    expect(chat.runStream).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        goal: '周末下午，散步，崂山区青岛大学',
        clientContext: { threadId: 'agent-task:606' },
      }),
      expect.any(Function),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('does not emit the profile gate for ordinary chat or feature questions', async () => {
    const writes: string[] = [];
    const chat = {
      runStream: jest.fn(async (_userId, _body, emit) => {
        await emit({
          type: 'result',
          result: {
            taskId: 204,
            status: AgentTaskStatus.Succeeded,
            visibleSteps: [],
            assistantMessage:
              '我可以陪你聊天，也可以在你明确想找人或约练时帮你整理需求。',
            socialRequestDraft: null,
            candidates: [],
            approvalRequiredActions: [],
            events: [],
            cards: [],
            safety: {
              blocked: false,
              level: 'low',
              reasons: [],
              boundaryNotes: [],
              requiredConfirmations: [],
            },
          },
        });
      }),
    };
    const profileGate = {
      getMinimumProfileStatus: jest.fn().mockResolvedValue({
        passed: false,
        missing: ['city', 'availability'],
        assistantMessage: '',
        profileCompleteness: 25,
        readinessLevel: 'basic',
        canEnterMatchPool: false,
        nextActions: ['补充城市/区域', '补充可约时间'],
      }),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      profileGate as never,
    );
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: jest.fn(),
    } as unknown as Response;

    await controller.streamUserFacingRun(
      { user: { id: 7 } } as Parameters<
        SocialAgentChatController['streamUserFacingRun']
      >[0],
      { goal: '你有什么功能' },
      response,
    );

    const serialized = writes.join('');
    expect(profileGate.getMinimumProfileStatus).not.toHaveBeenCalled();
    expect(serialized).toContain('"type":"run.started"');
    expect(serialized).toContain('"stage":"hydrate_context"');
    expect(serialized).not.toContain('"stage":"profile_gate"');
    expect(serialized).not.toContain('匹配前还差一点人物画像');
    expect(serialized).not.toContain('还需要补充');
    expect(serialized).toContain('我可以陪你聊天');
  });

  it('does not repeat completed slot trace events that were already persisted for the task', async () => {
    const writes: string[] = [];
    const chat = {
      runStream: jest.fn(async (_userId, _body, emit) => {
        await emit({
          type: 'result',
          result: {
            taskId: 303,
            status: AgentTaskStatus.Succeeded,
            visibleSteps: [],
            assistantMessage: '我会基于你已经补充的信息继续找人。',
            socialRequestDraft: null,
            candidates: [],
            approvalRequiredActions: [],
            events: [],
            cards: [],
            safety: {
              blocked: false,
              level: 'low',
              reasons: [],
              boundaryNotes: [],
              requiredConfirmations: [],
            },
          },
        });
      }),
    };
    const contextHydrator = {
      hydrateContext: jest.fn().mockResolvedValue({
        recentMessages: [],
        taskMemory: {},
        taskSlots: {
          activity: {
            key: 'activity',
            value: '散步',
            state: 'completed',
            source: 'user_message',
            updatedAt: '2026-06-17T00:00:00.000Z',
            completedAt: '2026-06-17T00:00:00.000Z',
          },
          time_window: {
            key: 'time_window',
            value: '周末下午',
            state: 'completed',
            source: 'user_message',
            updatedAt: '2026-06-17T00:00:00.000Z',
            completedAt: '2026-06-17T00:00:00.000Z',
          },
        },
        lifeGraphFactProposals: [],
      }),
    };
    const eventStore = {
      appendEventByTaskId: jest.fn().mockResolvedValue(undefined),
      listSocialCodexEventsByTask: jest.fn().mockResolvedValue([
        {
          type: 'slot.completed',
          payload: {
            slots: {
              activity: { value: '散步' },
              time_window: { value: '周末下午' },
            },
          },
        },
      ]),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      contextHydrator as never,
      eventStore as never,
    );
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: jest.fn(),
    } as unknown as Response;

    await controller.streamUserFacingRun(
      { user: { id: 7 } } as Parameters<
        SocialAgentChatController['streamUserFacingRun']
      >[0],
      { goal: '可以，帮我找人' },
      response,
    );

    const serialized = writes.join('');
    expect(contextHydrator.hydrateContext).toHaveBeenCalledWith({
      userId: 7,
      taskId: 303,
      threadId: 'agent-task:303',
    });
    expect(eventStore.listSocialCodexEventsByTask).toHaveBeenCalledWith(
      303,
      7,
      { take: 2000 },
    );
    expect(serialized).not.toContain('"type":"slot.completed"');
    expect(serialized).not.toContain('"type":"memory.saved"');
    expect(serialized).not.toContain('这些信息下次会继续使用');
    expect(serialized).toContain('"threadId":"agent-task:303","taskId":303');
  });

  it('emits and persists new slot trace events so session replay can restore memory state', async () => {
    const writes: string[] = [];
    const chat = {
      runStream: jest.fn(async (_userId, _body, emit) => {
        await emit({
          type: 'result',
          result: {
            taskId: 505,
            status: AgentTaskStatus.Succeeded,
            visibleSteps: [],
            assistantMessage: '已记下你的约练关键信息。',
            socialRequestDraft: null,
            candidates: [],
            approvalRequiredActions: [],
            events: [],
            cards: [],
            safety: {
              blocked: false,
              level: 'low',
              reasons: [],
              boundaryNotes: [],
              requiredConfirmations: [],
            },
          },
        });
      }),
    };
    const contextHydrator = {
      hydrateContext: jest.fn().mockResolvedValue({
        recentMessages: [],
        taskMemory: {},
        taskSlots: {
          activity: {
            key: 'activity',
            value: '散步',
            state: 'completed',
            source: 'user_message',
            updatedAt: '2026-06-17T00:00:00.000Z',
            completedAt: '2026-06-17T00:00:00.000Z',
          },
          time_window: {
            key: 'time_window',
            value: '周末下午',
            state: 'completed',
            source: 'user_message',
            updatedAt: '2026-06-17T00:00:00.000Z',
            completedAt: '2026-06-17T00:00:00.000Z',
          },
          location_text: {
            key: 'location_text',
            value: '青岛大学附近',
            state: 'completed',
            source: 'user_message',
            updatedAt: '2026-06-17T00:00:00.000Z',
            completedAt: '2026-06-17T00:00:00.000Z',
          },
        },
        lifeGraphFactProposals: [],
      }),
    };
    const eventStore = {
      appendEventByTaskId: jest.fn().mockResolvedValue(undefined),
      listSocialCodexEventsByTask: jest.fn().mockResolvedValue([]),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      contextHydrator as never,
      eventStore as never,
    );
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: jest.fn(),
    } as unknown as Response;

    await controller.streamUserFacingRun(
      { user: { id: 7 } } as Parameters<
        SocialAgentChatController['streamUserFacingRun']
      >[0],
      { goal: '周末下午，散步，青岛大学附近' },
      response,
    );

    const serialized = writes.join('');
    expect(serialized).toContain('"type":"slot.completed"');
    expect(serialized).toContain('已记录你的关键信息');
    expect(serialized).toContain('周末下午');
    expect(serialized).toContain('散步');
    expect(serialized).toContain('青岛大学附近');
    expect(eventStore.appendEventByTaskId).toHaveBeenCalledWith(
      7,
      505,
      expect.objectContaining({
        type: 'slot.completed',
        taskId: 505,
        payload: expect.objectContaining({
          slots: expect.objectContaining({
            activity: expect.objectContaining({ value: '散步' }),
            time_window: expect.objectContaining({ value: '周末下午' }),
            location_text: expect.objectContaining({ value: '青岛大学附近' }),
          }),
        }),
      }),
    );
  });

  it('emits only sanitized Life Graph memory summaries in user-visible events', async () => {
    const writes: string[] = [];
    const chat = {
      runStream: jest.fn(async (_userId, _body, emit) => {
        await emit({
          type: 'result',
          result: {
            taskId: 404,
            status: AgentTaskStatus.Succeeded,
            visibleSteps: [],
            assistantMessage: '我会按你的安全边界继续。',
            socialRequestDraft: null,
            candidates: [],
            approvalRequiredActions: [],
            events: [],
            cards: [],
            safety: {
              blocked: false,
              level: 'low',
              reasons: [],
              boundaryNotes: [],
              requiredConfirmations: [],
            },
          },
        });
      }),
    };
    const contextHydrator = {
      hydrateContext: jest.fn().mockResolvedValue({
        recentMessages: [],
        taskMemory: {},
        taskSlots: {
          safety_boundary: {
            key: 'safety_boundary',
            value: '第一次见面只接受公共场所',
            state: 'completed',
            source: 'user_message',
          },
        },
        lifeGraphFactProposals: [
          {
            key: 'preferred_geo_area',
            value:
              '青岛大学 3 号宿舍 401，手机号 13812345678，微信 fitmeet-test',
            label: '常用活动区域',
            evidence: [
              {
                source: 'user_explicit',
                quote:
                  '青岛大学 3 号宿舍 401，手机号 13812345678，微信 fitmeet-test',
              },
            ],
            sensitivity: 'sensitive',
            writePolicy: 'do_not_write',
          },
        ],
        lifeGraphFactDisplaySummaries: [
          {
            key: 'first_meet_safety_boundary',
            label: '首次见面安全边界',
            displayValue: '第一次见面只接受公共场所',
            sensitivity: 'private',
            writePolicy: 'low_risk_auto_save',
            evidenceCount: 1,
          },
        ],
        lifeGraphGovernanceSummary: {
          total: 1,
          autoSaveCount: 1,
          confirmationRequiredCount: 0,
          blockedCount: 0,
          sensitiveCount: 0,
          expiringFactKeys: [],
        },
      }),
    };
    const eventStore = {
      appendEventByTaskId: jest.fn().mockResolvedValue(undefined),
      listSocialCodexEventsByTask: jest.fn().mockResolvedValue([]),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      contextHydrator as never,
      eventStore as never,
    );
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: jest.fn(),
    } as unknown as Response;

    await controller.streamUserFacingRun(
      { user: { id: 7 } } as Parameters<
        SocialAgentChatController['streamUserFacingRun']
      >[0],
      { goal: '按公共场所优先继续' },
      response,
    );

    const serialized = writes.join('');
    expect(serialized).toContain('"type":"memory.saved"');
    expect(serialized).toContain('第一次见面只接受公共场所');
    expect(serialized).not.toContain('13812345678');
    expect(serialized).not.toContain('fitmeet-test');
    expect(serialized).not.toContain('3 号宿舍 401');
    expect(serialized).not.toContain('lifeGraphFactProposals');
    expect(serialized).toContain('lifeGraphFacts');
  });

  it('sanitizes user-facing stream error events emitted by the Agent run', async () => {
    const writes: string[] = [];
    const chat = {
      runStream: jest.fn((_userId, _body, emit) => {
        emit({
          type: 'error',
          message:
            'planner tool call failed with traceId=abc DeepSeek stack trace',
        });
        return Promise.resolve();
      }),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
    );
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: jest.fn(),
    } as unknown as Response;

    await controller.streamUserFacingRun(
      { user: { id: 7 } } as Parameters<
        SocialAgentChatController['streamUserFacingRun']
      >[0],
      { goal: '今晚想找青岛大学附近跑步搭子' },
      response,
    );

    const serialized = writes.join('');
    expect(serialized).toContain('"type":"error"');
    expect(serialized).toContain('"lifecycle":"failed"');
    expect(serialized).toContain('"code":"AGENT_STREAM_FAILED"');
    expect(serialized).toContain('"retryable":true');
    expect(serialized).toContain('"recoveryNotice"');
    expect(serialized).toContain('"kind":"failed"');
    expect(serialized).toContain('"source":"stream_error"');
    expect(serialized).toContain('连接中断了，可以继续');
    expect(serialized).not.toContain('traceId');
    expect(serialized).not.toContain('planner');
    expect(serialized).not.toContain('tool call');
    expect(serialized).not.toContain('DeepSeek');
    expect(serialized).not.toContain('stack');
  });

  it('sanitizes thrown stream failures before writing user-facing SSE errors', async () => {
    const writes: string[] = [];
    const chat = {
      runStream: jest
        .fn()
        .mockRejectedValue(
          new Error(
            'QueryFailedError: database timeout stack trace traceId=abc',
          ),
        ),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
    );
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: jest.fn(),
    } as unknown as Response;

    await controller.streamUserFacingRun(
      { user: { id: 7 } } as Parameters<
        SocialAgentChatController['streamUserFacingRun']
      >[0],
      { goal: '今晚想找青岛大学附近跑步搭子' },
      response,
    );

    const serialized = writes.join('');
    expect(serialized).toContain('"type":"run.started"');
    expect(serialized).toContain('"type":"run.failed"');
    expect(serialized).toContain('"stage":"detect_social_intent"');
    expect(serialized).toContain('连接中断了，可以继续');
    expect(serialized).toContain('"type":"error"');
    expect(serialized).toContain('这段需求还在');
    expect(serialized).not.toContain('这次处理时间有点久');
    expect(serialized).not.toContain('QueryFailedError');
    expect(serialized).not.toContain('database');
    expect(serialized).not.toContain('traceId');
    expect(serialized).not.toContain('stack');
    expect((response.end as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });

  it('streams card actions with the same user-facing SSE protocol', async () => {
    const writes: string[] = [];
    const chat = {
      performCardActionStream: jest.fn((_userId, _taskId, _body, emit) => {
        emit({
          type: 'assistant_delta',
          messageId: 'action-1',
          delta: '确认前我不会替你发送。',
          source: 'llm',
        });
        emit({ type: 'assistant_done', messageId: 'action-1', source: 'llm' });
        return Promise.resolve({
          taskId: 101,
          status: AgentTaskStatus.Succeeded,
          intent: 'candidate_followup',
          confidence: 0.9,
          entities: {},
          shouldSearch: false,
          shouldReplan: false,
          shouldUpdateProfile: false,
          shouldExecuteAction: true,
          replyStrategy: 'action',
          source: 'rules',
          action: 'await_confirmation',
          savedContext: false,
          profileUpdated: false,
          shouldQueueRun: false,
          runMode: null,
          assistantMessage: '确认前我不会替你发送。',
          cards: [],
          permissionMode: 'confirm',
          safety: {
            blocked: false,
            level: 'low',
            reasons: [],
            boundaryNotes: ['确认前不会发送。'],
            requiredConfirmations: ['发送消息'],
          },
        });
      }),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
    );
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: jest.fn(),
    } as unknown as Response;

    await controller.performTaskActionStream(
      { user: { id: 7 } } as Parameters<
        SocialAgentChatController['performTaskActionStream']
      >[0],
      101,
      { action: 'opener.confirm_send', idempotencyKey: 'action-1' },
      response,
    );

    const serialized = writes.join('');
    expect(serialized).toContain('"type":"run.started"');
    expect(serialized).toContain('正在处理你的选择');
    expect(serialized).toContain('"type":"visible_process.delta"');
    expect(serialized).toContain('"stage":"hydrate_context"');
    expect(serialized).toContain('正在读取你的偏好');
    expect(serialized).not.toContain('"lightStatus":"正在理解你的需求"');
    expect(serialized).toContain('"type":"assistant_delta"');
    expect(serialized).toContain('"type":"assistant.delta"');
    expect(serialized).toContain('"source":"llm"');
    expect(serialized).toContain('"type":"assistant_done"');
    expect(serialized).toContain('"type":"result"');
    expect(chat.performCardActionStream).toHaveBeenCalledWith(
      7,
      101,
      { action: 'opener.confirm_send', idempotencyKey: 'action-1' },
      expect.any(Function),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('persists final LLM card action text by replacing the prior action summary', async () => {
    const writes: string[] = [];
    const task = { id: 101, ownerUserId: 7 };
    const chat = {
      performCardActionStream: jest.fn(async () => ({
        taskId: 101,
        status: AgentTaskStatus.Succeeded,
        intent: 'candidate_followup',
        confidence: 0.9,
        entities: {},
        shouldSearch: false,
        shouldReplan: false,
        shouldUpdateProfile: false,
        shouldExecuteAction: true,
        replyStrategy: 'action',
        source: 'rules',
        action: 'await_confirmation',
        savedContext: false,
        profileUpdated: false,
        shouldQueueRun: false,
        runMode: null,
        assistantMessage: '旧的工具摘要。',
        cards: [],
        permissionMode: 'confirm',
        safety: {
          blocked: false,
          level: 'low',
          reasons: [],
          boundaryNotes: ['确认前不会发送。'],
          requiredConfirmations: ['发送消息'],
        },
      })),
    };
    const finalResponses = {
      generate: jest.fn(async (_input, options) => {
        options?.onDelta?.('我已经整理好邀请内容，发送前会再次让你确认。');
        return '我已经整理好邀请内容，发送前会再次让你确认。';
      }),
    };
    const messageLog = {
      recordAssistantMessage: jest.fn().mockResolvedValue(undefined),
    };
    const taskLifecycle = {
      assertTaskOwner: jest.fn().mockResolvedValue(task),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
      undefined,
      undefined,
      finalResponses as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      messageLog as never,
      taskLifecycle as never,
    );
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: jest.fn(),
    } as unknown as Response;

    await controller.performTaskActionStream(
      { user: { id: 7 } } as Parameters<
        SocialAgentChatController['performTaskActionStream']
      >[0],
      101,
      { action: 'opener.confirm_send', idempotencyKey: 'action-1' },
      response,
    );

    expect(taskLifecycle.assertTaskOwner).toHaveBeenCalledWith(101, 7);
    expect(messageLog.recordAssistantMessage).toHaveBeenCalledWith(
      task,
      '我已经整理好邀请内容，发送前会再次让你确认。',
      expect.objectContaining({
        taskId: 101,
        assistantMessage: '我已经整理好邀请内容，发送前会再次让你确认。',
        assistantStreamed: true,
        assistantMessageSource: 'llm',
      }),
      { replaceLastAssistantTurn: true },
    );
    expect(writes.join('')).toContain('我已经整理好邀请内容');
  });

  it('writes an immediate Social Codex status before a slow card action resolves', async () => {
    const writes: string[] = [];
    let releaseAction!: () => void;
    let downstreamStarted = false;
    const downstreamGate = new Promise<void>((resolve) => {
      releaseAction = resolve;
    });
    const chat = {
      performCardActionStream: jest.fn(async (_userId, _taskId, _body, emit) => {
        downstreamStarted = true;
        await downstreamGate;
        await emit({
          type: 'assistant_delta',
          messageId: 'slow-action-1',
          delta: '我会先确认安全边界，再继续。',
          source: 'llm',
        });
        await emit({
          type: 'assistant_done',
          messageId: 'slow-action-1',
          source: 'llm',
        });
        return {
          taskId: 101,
          status: AgentTaskStatus.Succeeded,
          intent: 'candidate_followup',
          confidence: 0.9,
          entities: {},
          shouldSearch: false,
          shouldReplan: false,
          shouldUpdateProfile: false,
          shouldExecuteAction: true,
          replyStrategy: 'action',
          source: 'rules',
          action: 'await_confirmation',
          savedContext: false,
          profileUpdated: false,
          shouldQueueRun: false,
          runMode: null,
          assistantMessage: '我会先确认安全边界，再继续。',
          cards: [],
          permissionMode: 'confirm',
          safety: {
            blocked: false,
            level: 'low',
            reasons: [],
            boundaryNotes: ['确认前不会发送。'],
            requiredConfirmations: ['发送消息'],
          },
        };
      }),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
    );
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      flush: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: jest.fn(),
    } as unknown as Response;

    const stream = controller.performTaskActionStream(
      { user: { id: 7 } } as Parameters<
        SocialAgentChatController['performTaskActionStream']
      >[0],
      101,
      { action: 'opener.confirm_send', idempotencyKey: 'slow-action-1' },
      response,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const early = writes.join('');
    expect(downstreamStarted).toBe(true);
    expect(response.flushHeaders).toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    expect(response.flush).toHaveBeenCalled();
    expect(early).toContain('"type":"run.started"');
    expect(early).toContain('"title":"正在处理你的选择"');
    expect(early).toContain('"type":"visible_process.delta"');
    expect(early).toContain('"title":"正在读取你的偏好"');
    expect(early).not.toContain('"type":"assistant_delta"');
    expect(early).not.toContain('"type":"result"');

    releaseAction();
    await stream;
    const serialized = writes.join('');
    expect(serialized).toContain('"type":"assistant_delta"');
    expect(serialized).toContain('"type":"assistant.delta"');
    expect(serialized).toContain('"type":"result"');
  });

  it('routes every message stream endpoint through the same user-facing message stream', async () => {
    const chat = {
      handleMessageStream: jest.fn((_userId, _body, emit) => {
        emit({
          type: 'assistant_delta',
          messageId: 'message-stream',
          delta: '我会先问清楚你的城市、时间和边界。',
          source: 'llm',
        });
        emit({
          type: 'assistant_done',
          messageId: 'message-stream',
          source: 'llm',
        });
        return Promise.resolve({
          taskId: 101,
          status: AgentTaskStatus.Succeeded,
          intent: 'social_search',
          confidence: 0.9,
          entities: {},
          shouldSearch: false,
          shouldReplan: false,
          shouldUpdateProfile: false,
          shouldExecuteAction: false,
          replyStrategy: 'clarify',
          source: 'rules',
          action: 'clarify',
          savedContext: true,
          profileUpdated: false,
          shouldQueueRun: false,
          runMode: null,
          assistantMessage: '我会先问清楚你的城市、时间和边界。',
          cards: [],
          permissionMode: 'limited_auto',
          safety: {
            blocked: false,
            level: 'low',
            reasons: [],
            boundaryNotes: ['确认清楚后再推荐。'],
            requiredConfirmations: [],
          },
        });
      }),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
    );
    const makeResponse = () => {
      const writes: string[] = [];
      const response = {
        status: jest.fn(),
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn((chunk: string) => {
          writes.push(chunk);
        }),
        end: jest.fn(),
      } as unknown as Response;
      return { response, writes };
    };
    const req = { user: { id: 7 } } as Parameters<
      SocialAgentChatController['routeMessageStream']
    >[0];

    const route = makeResponse();
    await controller.routeMessageStream(
      req,
      { message: '我想找人一起跑步' },
      route.response,
    );

    const message = makeResponse();
    await controller.handleMessageStream(
      req,
      { message: '我想找人一起跑步' },
      message.response,
    );

    const task = makeResponse();
    await controller.handleTaskMessageStream(
      req,
      303,
      { message: '青岛周末下午，轻松跑步，只在公共场所，先站内聊' },
      task.response,
    );

    expect(chat.handleMessageStream).toHaveBeenCalledTimes(3);
    expect(chat.handleMessageStream).toHaveBeenNthCalledWith(
      1,
      7,
      { message: '我想找人一起跑步' },
      expect.any(Function),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(chat.handleMessageStream).toHaveBeenNthCalledWith(
      2,
      7,
      { message: '我想找人一起跑步' },
      expect.any(Function),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(chat.handleMessageStream).toHaveBeenNthCalledWith(
      3,
      7,
      {
        message: '青岛周末下午，轻松跑步，只在公共场所，先站内聊',
        taskId: 303,
      },
      expect.any(Function),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    for (const writes of [route.writes, message.writes, task.writes]) {
      const serialized = writes.join('');
      const runStartedIndex = serialized.indexOf('"type":"run.started"');
      const visibleProcessIndex = serialized.indexOf(
        '"type":"visible_process.delta"',
      );
      const assistantDeltaIndex = serialized.indexOf(
        '"type":"assistant_delta"',
      );
      const resultIndex = serialized.indexOf('"type":"result"');
      expect(runStartedIndex).toBeGreaterThanOrEqual(0);
      expect(visibleProcessIndex).toBeGreaterThan(runStartedIndex);
      expect(assistantDeltaIndex).toBeGreaterThan(visibleProcessIndex);
      expect(resultIndex).toBeGreaterThan(assistantDeltaIndex);
      expect(serialized).toContain('"stage":"detect_social_intent"');
      expect(serialized).toContain('"stage":"hydrate_context"');
      expect(serialized).toContain('"visibility":"user_visible"');
      expect(serialized).toContain('"title":"正在理解你的需求"');
      expect(serialized).toContain('"title":"正在读取你的偏好"');
      expect(serialized).toContain('"type":"assistant_delta"');
      expect(serialized).toContain('"type":"assistant.delta"');
      expect(serialized).toContain('"type":"assistant_done"');
      expect(serialized).toContain('"type":"result"');
      expect(serialized).toContain('我会先问清楚你的城市、时间和边界。');
      expect(serialized).not.toContain('traceId');
      expect(serialized).not.toContain('planner');
      expect(serialized).not.toContain('toolCalls');
    }
  });

  it('streams step-level checkpoint retry/replay/fork through the saved run cursor', async () => {
    const planFor = (action: 'retry' | 'replay' | 'fork') => ({
      checkpointId: 202,
      parentCheckpointId: 101,
      taskId: 303,
      action,
      resumePrompt:
        action === 'fork'
          ? '从已保存的工具步骤分叉继续：search'
          : action === 'replay'
            ? '从已保存的工具步骤回放：search'
            : '只重试已保存的工具步骤：search',
      threadId: 'agent-task:303',
      resumeCursor: {
        threadId: 'agent-task:303',
        checkpointId: 202,
        parentCheckpointId: 101,
        action,
        stepId: 'search',
      },
      idempotencyKey: `agent-checkpoint:${action}:agent-task:303:checkpoint:202:step:search`,
      interrupt: null,
      traceId: 'trace-checkpoint',
      runId: 'run-checkpoint',
    });
    const chat = {
      handleMessageStream: jest.fn((_userId, _body, emit) => {
        emit({
          type: 'assistant_delta',
          messageId: 'checkpoint-retry',
          delta: '我会从这一步重新尝试。',
          source: 'llm',
        });
        emit({
          type: 'assistant_done',
          messageId: 'checkpoint-retry',
          source: 'llm',
        });
        return Promise.resolve({
          taskId: 303,
          status: AgentTaskStatus.Succeeded,
          intent: 'checkpoint_retry',
          confidence: 1,
          entities: {},
          shouldSearch: false,
          shouldReplan: false,
          shouldUpdateProfile: false,
          shouldExecuteAction: false,
          replyStrategy: 'conversation',
          source: 'checkpoint',
          action: 'checkpoint_retry',
          savedContext: false,
          profileUpdated: false,
          shouldQueueRun: false,
          runMode: null,
          assistantMessage: '我会从这一步重新尝试。',
          cards: [],
          permissionMode: 'confirm',
          safety: {
            blocked: false,
            level: 'low',
            reasons: [],
            boundaryNotes: [],
            requiredConfirmations: [],
          },
        });
      }),
    };
    const checkpoints = {
      prepareStepAction: jest.fn(({ action }) =>
        Promise.resolve(planFor(action)),
      ),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      checkpoints as never,
    );
    for (const action of ['retry', 'replay', 'fork'] as const) {
      const writes: string[] = [];
      const response = {
        status: jest.fn(),
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn((chunk: string) => {
          writes.push(chunk);
        }),
        end: jest.fn(),
      } as unknown as Response;

      if (action === 'retry') {
        await controller.retryCheckpointStepStream(
          { user: { id: 7 } } as Parameters<
            SocialAgentChatController['retryCheckpointStepStream']
          >[0],
          101,
          'search',
          {},
          response,
        );
      }
      if (action === 'replay') {
        await controller.replayCheckpointStepStream(
          { user: { id: 7 } } as Parameters<
            SocialAgentChatController['replayCheckpointStepStream']
          >[0],
          101,
          'search',
          {},
          response,
        );
      }
      if (action === 'fork') {
        await controller.forkCheckpointStepStream(
          { user: { id: 7 } } as Parameters<
            SocialAgentChatController['forkCheckpointStepStream']
          >[0],
          101,
          'search',
          {},
          response,
        );
      }

      const checkpointPlan = planFor(action);
      expect(checkpoints.prepareStepAction).toHaveBeenLastCalledWith({
        ownerUserId: 7,
        checkpointId: 101,
        stepId: 'search',
        action,
      });
      expect(chat.handleMessageStream).toHaveBeenLastCalledWith(
        7,
        expect.objectContaining({
          message: checkpointPlan.resumePrompt,
          taskId: 303,
          idempotencyKey: checkpointPlan.idempotencyKey,
          clientContext: expect.objectContaining({
            source: 'web',
            threadId: 'agent-task:303',
            checkpointId: 202,
            parentCheckpointId: 101,
            resumeCursor: checkpointPlan.resumeCursor,
            sourceCheckpointId: 101,
            sourceStepId: 'search',
            resumeMode: action,
            resumeIdempotencyKey: checkpointPlan.idempotencyKey,
            stepId: 'search',
            checkpointAction: action,
          }),
        }),
        expect.any(Function),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      const serialized = writes.join('');
      expect(serialized).toContain('"type":"run.started"');
      expect(serialized).toContain('"type":"visible_process.delta"');
      expect(serialized).toContain('正在接着刚才的进度');
      expect(serialized).toContain('"type":"assistant_delta"');
      expect(serialized).toContain('"type":"assistant_done"');
      expect(serialized).toContain('"type":"result"');
    }
  });

  it('streams checkpoint-level retry through the saved run cursor', async () => {
    const writes: string[] = [];
    const checkpointPlan = {
      checkpointId: 202,
      parentCheckpointId: 101,
      taskId: 303,
      action: 'retry' as const,
      resumePrompt: '只重试刚才失败的 Agent 步骤。',
      threadId: 'agent-task:303',
      resumeCursor: {
        threadId: 'agent-task:303',
        checkpointId: 202,
        parentCheckpointId: 101,
        action: 'retry' as const,
        stepId: 'search',
      },
      idempotencyKey:
        'agent-checkpoint:retry:agent-task:303:checkpoint:202:step:search',
      interrupt: null,
      traceId: 'trace-checkpoint',
      runId: 'run-checkpoint',
    };
    const chat = {
      handleMessageStream: jest.fn((_userId, _body, emit) => {
        emit({
          type: 'assistant_delta',
          messageId: 'checkpoint-retry',
          delta: '我会接着刚才这一步重新尝试。',
          source: 'llm',
        });
        emit({
          type: 'assistant_done',
          messageId: 'checkpoint-retry',
          source: 'llm',
        });
        return Promise.resolve({
          taskId: 303,
          status: AgentTaskStatus.Succeeded,
          intent: 'checkpoint_retry',
          confidence: 1,
          entities: {},
          shouldSearch: false,
          shouldReplan: false,
          shouldUpdateProfile: false,
          shouldExecuteAction: false,
          replyStrategy: 'conversation',
          source: 'checkpoint',
          action: 'checkpoint_retry',
          savedContext: false,
          profileUpdated: false,
          shouldQueueRun: false,
          runMode: null,
          assistantMessage: '我会接着刚才这一步重新尝试。',
          cards: [],
          permissionMode: 'confirm',
          safety: {
            blocked: false,
            level: 'low',
            reasons: [],
            boundaryNotes: [],
            requiredConfirmations: [],
          },
        });
      }),
    };
    const checkpoints = {
      prepareAction: jest.fn(() => Promise.resolve(checkpointPlan)),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      checkpoints as never,
    );
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: jest.fn(),
    } as unknown as Response;

    await controller.retryCheckpointStream(
      { user: { id: 7 } } as Parameters<
        SocialAgentChatController['retryCheckpointStream']
      >[0],
      101,
      {},
      response,
    );

    expect(checkpoints.prepareAction).toHaveBeenCalledWith({
      ownerUserId: 7,
      checkpointId: 101,
      action: 'retry',
    });
    expect(chat.handleMessageStream).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        message: checkpointPlan.resumePrompt,
        taskId: 303,
        idempotencyKey: checkpointPlan.idempotencyKey,
        clientContext: expect.objectContaining({
          source: 'web',
          threadId: 'agent-task:303',
          checkpointId: 202,
          parentCheckpointId: 101,
          resumeCursor: checkpointPlan.resumeCursor,
          sourceCheckpointId: 101,
          sourceStepId: 'search',
          resumeMode: 'retry',
          resumeIdempotencyKey: checkpointPlan.idempotencyKey,
          checkpointAction: 'retry',
        }),
      }),
      expect.any(Function),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const serialized = writes.join('');
    expect(serialized).toContain('"type":"run.started"');
    expect(serialized).toContain('"type":"visible_process.delta"');
    expect(serialized).toContain('正在接着刚才的进度');
    expect(serialized).toContain('"type":"assistant_delta"');
    expect(serialized).toContain('"type":"assistant_done"');
    expect(serialized).toContain('"type":"result"');
  });

  it('writes a checkpoint prelude before slow checkpoint preparation resolves', async () => {
    const writes: string[] = [];
    let releasePrepare!: () => void;
    const prepareGate = new Promise<void>((resolve) => {
      releasePrepare = resolve;
    });
    const checkpointPlan = {
      checkpointId: 202,
      parentCheckpointId: 101,
      taskId: 303,
      action: 'replay' as const,
      resumePrompt: '从已保存的工具步骤回放：search',
      threadId: 'agent-task:303',
      resumeCursor: {
        threadId: 'agent-task:303',
        checkpointId: 202,
        parentCheckpointId: 101,
        action: 'replay' as const,
        stepId: 'search',
      },
      idempotencyKey:
        'agent-checkpoint:replay:agent-task:303:checkpoint:202:step:search',
      interrupt: null,
      traceId: 'trace-checkpoint',
      runId: 'run-checkpoint',
    };
    const chat = {
      handleMessageStream: jest.fn((_userId, _body, emit) => {
        emit({
          type: 'assistant_delta',
          messageId: 'checkpoint-replay',
          delta: '我会从这一步重新运行。',
          source: 'llm',
        });
        return Promise.resolve({
          taskId: 303,
          status: AgentTaskStatus.Succeeded,
          intent: 'checkpoint_replay',
          confidence: 1,
          entities: {},
          shouldSearch: false,
          shouldReplan: false,
          shouldUpdateProfile: false,
          shouldExecuteAction: false,
          replyStrategy: 'conversation',
          source: 'checkpoint',
          action: 'checkpoint_replay',
          savedContext: false,
          profileUpdated: false,
          shouldQueueRun: false,
          runMode: null,
          assistantMessage: '我会从这一步重新运行。',
          cards: [],
          permissionMode: 'confirm',
          safety: {
            blocked: false,
            level: 'low',
            reasons: [],
            boundaryNotes: [],
            requiredConfirmations: [],
          },
        });
      }),
    };
    const checkpoints = {
      prepareAction: jest.fn(async () => {
        await prepareGate;
        return checkpointPlan;
      }),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      checkpoints as never,
    );
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      flush: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: jest.fn(),
    } as unknown as Response;

    const stream = controller.replayCheckpointStream(
      { user: { id: 7 } } as Parameters<
        SocialAgentChatController['replayCheckpointStream']
      >[0],
      101,
      {},
      response,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const early = writes.join('');
    expect(response.flushHeaders).toHaveBeenCalled();
    expect(response.flush).toHaveBeenCalled();
    expect(checkpoints.prepareAction).toHaveBeenCalledWith({
      ownerUserId: 7,
      checkpointId: 101,
      action: 'replay',
    });
    expect(chat.handleMessageStream).not.toHaveBeenCalled();
    expect(early).toContain('"type":"run.started"');
    expect(early).toContain('"title":"正在重新整理"');
    expect(early).toContain('会接着刚才的进度继续处理，不会重复执行已经完成的动作。');
    expect(early).toContain('"type":"visible_process.delta"');
    expect(early).toContain('"title":"正在接着刚才的进度"');
    expect(early).toContain('不会重复执行已经完成的内容');
    expect(early).not.toContain('"type":"assistant_delta"');
    expect(early).not.toContain('"type":"result"');

    releasePrepare();
    await stream;
    const serialized = writes.join('');
    expect(chat.handleMessageStream).toHaveBeenCalled();
    expect(serialized).toContain('"type":"assistant_delta"');
    expect(serialized).toContain('"type":"result"');
  });

  it('streams rejected approval resume through the saved checkpoint cursor without executing the action', async () => {
    const writes: string[] = [];
    const checkpointPlan = {
      checkpointId: 202,
      parentCheckpointId: null,
      taskId: 303,
      action: 'resume' as const,
      resumePrompt:
        '用户已经拒绝刚才中断的高风险步骤。请不要发送消息、连接候选人或创建活动。',
      threadId: 'agent-task:303',
      resumeCursor: {
        threadId: 'agent-task:303',
        checkpointId: 202,
        parentCheckpointId: null,
        action: 'resume' as const,
        stepId: 'approval-88',
      },
      idempotencyKey:
        'agent-checkpoint:resume:agent-task:303:checkpoint:202:step:approval-88:approval:88',
      interrupt: {
        protocol: 'fitmeet.agent.interrupt.v1',
        kind: 'approval_required',
        checkpointId: 202,
        taskId: 303,
        payload: {
          approvalRequestId: 88,
        },
      },
      traceId: 'trace-checkpoint',
      runId: 'run-checkpoint',
    };
    const chat = {
      handleMessageStream: jest.fn((_userId, body, emit) => {
        expect(body.clientContext).toMatchObject({
          checkpointAction: 'resume',
          decision: 'rejected',
          checkpointId: 202,
          resumeCursor: checkpointPlan.resumeCursor,
          sourceCheckpointId: 202,
          sourceStepId: 'approval-88',
          resumeMode: 'resume_after_rejection',
          resumeIdempotencyKey: checkpointPlan.idempotencyKey,
        });
        emit({
          type: 'assistant_delta',
          messageId: 'checkpoint-reject',
          delta: '已取消这一步，我没有联系对方。',
          source: 'llm',
        });
        emit({
          type: 'assistant_done',
          messageId: 'checkpoint-reject',
          source: 'llm',
        });
        return Promise.resolve({
          taskId: 303,
          status: AgentTaskStatus.Succeeded,
          intent: 'checkpoint_resume_rejected',
          confidence: 1,
          entities: {},
          shouldSearch: false,
          shouldReplan: false,
          shouldUpdateProfile: false,
          shouldExecuteAction: false,
          replyStrategy: 'conversation',
          source: 'checkpoint',
          action: 'checkpoint_resume',
          savedContext: false,
          profileUpdated: false,
          shouldQueueRun: false,
          runMode: null,
          assistantMessage: '已取消这一步，我没有联系对方。',
          cards: [],
          approvalRequiredActions: [],
          permissionMode: 'confirm',
          safety: {
            blocked: false,
            level: 'low',
            reasons: [],
            boundaryNotes: ['用户已拒绝高风险动作，未执行副作用。'],
            requiredConfirmations: [],
          },
        });
      }),
    };
    const checkpoints = {
      prepareAction: jest.fn(() => Promise.resolve(checkpointPlan)),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      checkpoints as never,
    );
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: jest.fn(),
    } as unknown as Response;

    await controller.resumeCheckpointStream(
      { user: { id: 7 } } as Parameters<
        SocialAgentChatController['resumeCheckpointStream']
      >[0],
      202,
      { decision: 'rejected' },
      response,
    );

    expect(checkpoints.prepareAction).toHaveBeenCalledWith({
      ownerUserId: 7,
      checkpointId: 202,
      action: 'resume',
    });
    expect(chat.handleMessageStream).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        message: checkpointPlan.resumePrompt,
        taskId: 303,
        idempotencyKey: checkpointPlan.idempotencyKey,
        clientContext: expect.objectContaining({
          source: 'web',
          threadId: 'agent-task:303',
          checkpointId: 202,
          parentCheckpointId: null,
          resumeCursor: checkpointPlan.resumeCursor,
          sourceCheckpointId: 202,
          sourceStepId: 'approval-88',
          resumeMode: 'resume_after_rejection',
          resumeIdempotencyKey: checkpointPlan.idempotencyKey,
          checkpointAction: 'resume',
          decision: 'rejected',
        }),
      }),
      expect.any(Function),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const serialized = writes.join('');
    expect(serialized).toContain('"type":"run.started"');
    expect(serialized).toContain('"type":"visible_process.delta"');
    expect(serialized).toContain('正在接着刚才的进度');
    expect(serialized).toContain('"type":"approval.resolved"');
    expect(serialized).toContain('已取消这一步');
    expect(serialized).toContain('"approvalId":88');
    expect(serialized).toContain('"decision":"rejected"');
    expect(serialized).toContain('"checkpointId":202');
    expect(serialized).toContain('"type":"assistant_delta"');
    expect(serialized).toContain('已取消这一步');
    expect(serialized).toContain('"type":"result"');
    expect(serialized).not.toContain('trace-checkpoint');
    expect(serialized).not.toContain('run-checkpoint');
  });

  it('aborts the downstream model/run signal when the SSE client disconnects', async () => {
    let downstreamAborted = false;
    const writes: string[] = [];
    const reqEvents = new EventEmitter();
    const resEvents = new EventEmitter();
    let downstreamStarted!: () => void;
    const downstreamStartedPromise = new Promise<void>((resolve) => {
      downstreamStarted = resolve;
    });
    const chat = {
      runStream: jest.fn(async (_userId, _body, emit, options) => {
        downstreamAborted = options.signal.aborted;
        await emit({ type: 'task', taskId: 101 });
        downstreamStarted();
        return new Promise<void>((resolve) => {
          options.signal.addEventListener(
            'abort',
            () => {
              downstreamAborted = options.signal.aborted;
              resolve();
            },
            {
              once: true,
            },
          );
        });
      }),
    };
    const observability = {
      recordSse: jest.fn(),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
      undefined,
      observability as never,
    );
    let writableEnded = false;
    const end = jest.fn(() => {
      writableEnded = true;
    });
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      get writableEnded() {
        return writableEnded;
      },
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end,
      on: resEvents.on.bind(resEvents),
    } as unknown as Response;
    const request = {
      user: { id: 7 },
      on: reqEvents.on.bind(reqEvents),
    } as Parameters<SocialAgentChatController['streamUserFacingRun']>[0];

    const stream = controller.streamUserFacingRun(
      request,
      { goal: '请详细说明 FitMeet 如何帮我认识跑步搭子' },
      response,
    );
    await downstreamStartedPromise;

    expect(downstreamAborted).toBe(false);
    resEvents.emit('close');
    await stream;

    expect(downstreamAborted).toBe(true);
    expect(observability.recordSse).toHaveBeenCalledWith(
      expect.objectContaining({
        streamName: 'user_run_stream',
        status: 'interrupted',
        failureReason: 'client_disconnected',
      }),
    );
    expect(writes.join('')).toContain('"type":"status"');
    expect(end).toHaveBeenCalled();
  });
});

describe('SocialAgentChatController thread API', () => {
  it('accepts Social Codex task thread ids without creating a separate sidebar thread identity', async () => {
    const threads = {
      get: jest.fn().mockResolvedValue({ thread: { id: 'agent-task:88' } }),
      update: jest.fn().mockResolvedValue({ thread: { id: 'agent-task:88' } }),
      delete: jest.fn().mockResolvedValue({ ok: true }),
    };
    const controller = new SocialAgentChatController(
      {} as unknown as SocialAgentChatService,
      {} as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
      undefined,
      undefined,
      undefined,
      undefined,
      threads as never,
    );
    const req = { user: { id: 7 } } as Parameters<
      SocialAgentChatController['getThread']
    >[0];

    await expect(controller.getThread(req, 'agent-task:88')).resolves.toEqual({
      thread: { id: 'agent-task:88' },
    });
    await expect(
      controller.updateThread(req, 'agent-task:88', {
        title: '周末青岛大学散步搭子',
      }),
    ).resolves.toEqual({ thread: { id: 'agent-task:88' } });
    await expect(
      controller.deleteThread(req, 'agent-task:88'),
    ).resolves.toEqual({ ok: true });

    expect(threads.get).toHaveBeenCalledWith(7, 88);
    expect(threads.update).toHaveBeenCalledWith(
      7,
      88,
      '周末青岛大学散步搭子',
      undefined,
      undefined,
    );
    expect(threads.delete).toHaveBeenCalledWith(7, 88);
    expect(() => controller.getThread(req, 'not-a-thread')).toThrow(
      'Invalid social agent thread id',
    );
  });
});

describe('SocialAgentChatController candidate commands', () => {
  it('routes candidate command endpoints to the candidate command service', async () => {
    const chat = {};
    const candidateCommands = {
      publishDraft: jest.fn().mockResolvedValue({ taskId: 101 }),
      saveCandidate: jest.fn().mockResolvedValue({ toolCallId: 'save-1' }),
      sendCandidateMessage: jest
        .fn()
        .mockResolvedValue({ messageId: 'msg-22' }),
      connectCandidate: jest
        .fn()
        .mockResolvedValue({ conversationId: 'conv-22' }),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      candidateCommands as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
    );
    const req = { user: { id: 7 } } as Parameters<
      SocialAgentChatController['saveCandidate']
    >[0];

    await expect(
      controller.publishSocialRequest(req, 101, {
        title: '今晚跑步',
        rawText: '今晚跑步',
      } as never),
    ).resolves.toEqual({ taskId: 101 });
    await expect(
      controller.saveCandidate(req, 101, { targetUserId: 22 }),
    ).resolves.toEqual({ toolCallId: 'save-1' });
    await expect(
      controller.sendMessage(req, 101, { targetUserId: 22, message: 'hello' }),
    ).resolves.toEqual({ messageId: 'msg-22' });
    await expect(
      controller.connectCandidate(req, 101, { targetUserId: 22 }),
    ).resolves.toEqual({ conversationId: 'conv-22' });

    expect(candidateCommands.publishDraft).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({ title: '今晚跑步' }),
    );
    expect(candidateCommands.saveCandidate).toHaveBeenCalledWith(7, 101, {
      targetUserId: 22,
    });
    expect(candidateCommands.sendCandidateMessage).toHaveBeenCalledWith(
      7,
      101,
      { targetUserId: 22, message: 'hello' },
    );
    expect(candidateCommands.connectCandidate).toHaveBeenCalledWith(7, 101, {
      targetUserId: 22,
    });
  });
});
