import { ConfigService } from '@nestjs/config';

import {
  AgentPermissionService,
  SocialAgentAction,
} from './agent-permission.service';
import {
  AgentTask,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskPermissionMode,
} from './entities/agent-task.entity';
import { FitMeetAgentToolRegistryService } from './fitmeet-agent-tool-registry.service';
import { SocialAgentPlannerService } from './social-agent-planner.service';

const taskRepo = () => ({
  findOne: jest.fn(),
  save: jest.fn().mockResolvedValue({}),
});

const eventRepo = () => ({
  create: jest.fn((input) => input),
  save: jest.fn().mockResolvedValue({}),
});

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 10,
    ownerUserId: 1,
    agentConnectionId: 2,
    taskType: 'social_goal',
    title: 'Find a running buddy',
    goal: '帮我找一个周末跑步搭子',
    input: {},
    plan: [],
    toolCalls: [],
    result: {},
    memory: {},
    permissionMode: AgentTaskPermissionMode.Confirm,
    statusReason: null,
    error: null,
    startedAt: null,
    awaitingConfirmationAt: null,
    completedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  } as AgentTask;
}

function serviceWith(config: ConfigService) {
  const tasks = taskRepo();
  const events = eventRepo();
  const service = new SocialAgentPlannerService(
    tasks as never,
    events as never,
    config,
    new AgentPermissionService(),
    new FitMeetAgentToolRegistryService(),
  );
  return { service, tasks, events };
}

describe('SocialAgentPlannerService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('calls DeepSeek, keeps social actions for risk gating, writes task plan and event', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                steps: [
                  { id: 'blocked', action: 'payment', title: 'Pay' },
                  {
                    id: 'allowed',
                    action: 'send_message',
                    title: 'Say hello',
                    input: { text: 'hi' },
                  },
                ],
              }),
            },
          },
        ],
      }),
    } as never);

    const { service, tasks, events } = serviceWith(
      makeConfig({ DEEPSEEK_API_KEY: 'key' }),
    );
    tasks.findOne.mockResolvedValue(
      makeTask({ permissionMode: AgentTaskPermissionMode.Assist }),
    );

    const result = await service.planTask(10);

    expect(result.source).toBe('deepseek');
    expect(
      JSON.parse(((global.fetch as jest.Mock).mock.calls[0]?.[1] as { body?: string }).body ?? '{}')
        .model,
    ).toBe('deepseek-v4-flash');
    expect(result.plan).toHaveLength(2);
    expect(result.plan[0]).toMatchObject({
      id: 'blocked',
      action: SocialAgentAction.Payment,
      status: 'planned',
      requiresUserConfirmation: true,
    });
    expect(result.plan[1]).toMatchObject({
      id: 'allowed',
      action: SocialAgentAction.SendMessage,
      status: 'planned',
      requiresUserConfirmation: true,
    });
    expect(tasks.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 10, plan: result.plan }),
    );
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 10,
        ownerUserId: 1,
        eventType: AgentTaskEventType.PlanGenerated,
        actor: AgentTaskEventActor.Agent,
        payload: expect.objectContaining({
          source: 'deepseek',
          permissionMode: AgentTaskPermissionMode.Assist,
          stepCount: 2,
        }),
      }),
    );
    expect(events.save).toHaveBeenCalledTimes(1);
  });

  it('uses fallback plan when DeepSeek JSON parse fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'not-json' } }],
      }),
    } as never);

    const { service, tasks } = serviceWith(
      makeConfig({ DEEPSEEK_API_KEY: 'key' }),
    );
    tasks.findOne.mockResolvedValue(
      makeTask({ permissionMode: AgentTaskPermissionMode.Confirm }),
    );

    const result = await service.planTask(10);

    expect(result.source).toBe('fallback');
    expect(result.fallbackReason).toBe('deepseek_json_parse_failed');
    expect(result.plan.map((step) => step.action)).toEqual([
      SocialAgentAction.SearchProfiles,
      SocialAgentAction.GenerateContent,
      SocialAgentAction.DraftMessage,
      SocialAgentAction.SendMessage,
      SocialAgentAction.SendInvite,
    ]);
    expect(
      result.plan.every((step) => result.allowedActions.includes(step.action)),
    ).toBe(true);
  });

  it('falls back and writes a timeout event when DeepSeek planning aborts', async () => {
    const abortError = Object.assign(new Error('aborted'), {
      name: 'AbortError',
    });
    global.fetch = jest.fn().mockRejectedValue(abortError);

    const { service, tasks, events } = serviceWith(
      makeConfig({
        DEEPSEEK_API_KEY: 'key',
        SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS: '20000',
      }),
    );
    tasks.findOne.mockResolvedValue(
      makeTask({ permissionMode: AgentTaskPermissionMode.Confirm }),
    );

    const result = await service.replanTask(10, {
      reason: 'user_follow_up',
      userMessage: '那青岛拍照搭子有吗',
    });

    expect(result.source).toBe('fallback');
    expect(result.fallbackReason).toBe('deepseek_timeout');
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AgentTaskEventType.SocialAgentLlmTimeout,
        payload: expect.objectContaining({
          timeoutMs: 15000,
          fallbackMessage: '已收到补充信息，当前先基于规则匹配继续搜索。',
        }),
      }),
    );
  });

  it('uses current task permission mode for fallback compatibility', async () => {
    const { service, tasks } = serviceWith(makeConfig({}));
    tasks.findOne.mockResolvedValue(
      makeTask({
        permissionMode: AgentTaskPermissionMode.LimitedAuto,
        goal: '帮我安排线下约练并支付场地费',
      }),
    );

    const result = await service.planTask(10);

    expect(result.source).toBe('fallback');
    expect(result.plan.map((step) => step.action)).toContain(
      SocialAgentAction.OfflineMeet,
    );
    expect(result.plan.map((step) => step.action)).toContain(
      SocialAgentAction.Payment,
    );
    expect(result.plan.every((step) => step.requiresUserConfirmation)).toBe(
      false,
    );
    expect(
      result.plan.every((step) => result.allowedActions.includes(step.action)),
    ).toBe(true);
  });

  it('replans with short-term brain memory after a failed tool call', async () => {
    const { service, tasks, events } = serviceWith(makeConfig({}));
    tasks.findOne.mockResolvedValue(
      makeTask({
        permissionMode: AgentTaskPermissionMode.Confirm,
        plan: [
          {
            id: 'old_send',
            action: SocialAgentAction.SendMessage,
            status: 'planned',
            toolName: 'send_message',
          },
        ],
        toolCalls: [
          {
            id: 'old_send:send_message:1',
            stepId: 'old_send',
            toolName: 'send_message',
            action: SocialAgentAction.SendMessage,
            status: 'failed',
            error: { code: 'message_send_failed', message: 'network timeout' },
          },
        ],
        result: {
          lastToolCall: {
            stepId: 'old_send',
            toolName: 'send_message',
            action: SocialAgentAction.SendMessage,
            status: 'failed',
            error: {
              code: 'message_send_failed',
              message: 'network timeout',
            },
          },
        },
      }),
    );

    const result = await service.replanTask(10, {
      userMessage: '先生成草稿，不要直接发送。',
    });

    expect(result.reason).toBe('failure_recovery');
    expect(result.replanAttempt).toBe(1);
    expect(result.plan.every((step) => step.status === 'replanned')).toBe(true);
    expect(result.plan.map((step) => step.action)).not.toContain(
      SocialAgentAction.SendMessage,
    );
    expect(tasks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        memory: expect.objectContaining({
          brain: expect.objectContaining({
            replanAttempt: 1,
            lastFailure: expect.objectContaining({
              toolName: 'send_message',
              status: 'failed',
            }),
          }),
        }),
      }),
    );
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AgentTaskEventType.PlanGenerated,
        payload: expect.objectContaining({
          reason: 'failure_recovery',
          replanAttempt: 1,
        }),
      }),
    );
  });
});
