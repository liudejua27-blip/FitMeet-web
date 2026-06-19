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
    expect(serialized).toContain('正在处理这一步');
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
                title: '公开可发现用户',
                body: '你们都偏好周末下午低强度散步。',
                data: { schemaType: 'social_match.candidate' },
                actions: [],
              },
              {
                id: 'opportunity-202',
                type: 'opportunity_card',
                title: '周末青岛大学散步搭子',
                body: '低强度、公共场所优先。',
                data: {
                  schemaType: 'opportunity.card',
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
    expect(serialized).toContain('"threadId":"202","taskId":202');
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
    expect(serialized.indexOf('"type":"candidate_search.started"')).toBeLessThan(
      serialized.indexOf('"type":"candidate_search.done"'),
    );
    expect(serialized).not.toContain('planner');
    expect(serialized).not.toContain('traceId');
    expect(serialized).not.toContain('tool_call_started');
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
      threadId: 303,
    });
    expect(eventStore.listSocialCodexEventsByTask).toHaveBeenCalledWith(
      303,
      7,
      { take: 2000 },
    );
    expect(serialized).not.toContain('"type":"slot.completed"');
    expect(serialized).not.toContain('"type":"memory.saved"');
    expect(serialized).not.toContain('这些信息下次会继续使用');
    expect(serialized).toContain('"threadId":"303","taskId":303');
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
            value: '青岛大学 3 号宿舍 401，手机号 13812345678，微信 fitmeet-test',
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
    expect(serialized).toContain('"type":"run.started"');
    expect(serialized).toContain('"type":"run.failed"');
    expect(serialized).toContain('"stage":"detect_social_intent"');
    expect(serialized).toContain('这次处理没有完成');
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
      expect(serialized).toContain('"type":"assistant_delta"');
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
          delta: '我会从保存点重新尝试。',
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
          assistantMessage: '我会从保存点重新尝试。',
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
    expect(serialized).toContain('"type":"assistant_delta"');
    expect(serialized).toContain('"type":"assistant_done"');
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
    expect(serialized).toContain('"type":"approval.resolved"');
    expect(serialized).toContain('已取消这一步');
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
