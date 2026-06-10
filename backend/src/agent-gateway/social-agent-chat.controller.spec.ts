import { Response } from 'express';
import { EventEmitter } from 'events';
import { AgentCardAssemblerService } from './response-quality/agent-card-assembler.service';
import { LightStatusMapperService } from './response-quality/light-status-mapper.service';
import { UserFacingResponseSanitizerService } from './response-quality/user-facing-response-sanitizer.service';
import { SocialAgentChatController } from './social-agent-chat.controller';
import { SocialAgentChatService } from './social-agent-chat.service';
import { AgentTaskStatus } from './entities/agent-task.entity';
import { SocialAgentCandidateCommandService } from './social-agent-candidate-command.service';

describe('SocialAgentChatController user-facing stream', () => {
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
    expect(serialized).toContain('"type":"assistant_done"');
    expect(serialized).toContain('"source":"fallback"');
    expect(serialized).toContain('"type":"progress"');
    expect(serialized).toContain('"lifecycle":"analyzing_intent"');
    expect(serialized).toContain('正在调用工具');
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
    expect(serialized).toContain('FitMeet Agent 暂时没有顺利完成');
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
    expect(serialized).toContain('"type":"error"');
    expect(serialized).toContain('这次处理时间有点久');
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
    expect(serialized).toContain('"type":"assistant_delta"');
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

  it('aborts the downstream model/run signal when the SSE client disconnects', async () => {
    let downstreamAborted = false;
    const writes: string[] = [];
    const reqEvents = new EventEmitter();
    const resEvents = new EventEmitter();
    const chat = {
      runStream: jest.fn(async (_userId, _body, emit, options) => {
        downstreamAborted = options.signal.aborted;
        await emit({ type: 'task', taskId: 101 });
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
    await Promise.resolve();

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
