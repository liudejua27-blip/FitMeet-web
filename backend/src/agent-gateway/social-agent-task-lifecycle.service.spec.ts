import { NotFoundException } from '@nestjs/common';

import {
  AgentConnection,
  ConnectionStatus,
} from './entities/agent-connection.entity';
import {
  AgentTask,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentTaskLifecycleService } from './social-agent-task-lifecycle.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    agentConnectionId: null,
    taskType: 'social_agent_chat',
    title: 'FitMeet Social Agent 聊天任务',
    goal: '今晚青岛轻松跑步',
    input: {},
    plan: [],
    toolCalls: [],
    result: {},
    memory: {},
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Confirm,
    riskLevel: 'low' as never,
    idempotencyKey: null,
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

function makeHarness(existingTask: AgentTask | null = null) {
  const activeConnection = {
    id: 31,
    userId: 7,
    status: ConnectionStatus.Active,
    updatedAt: new Date(1),
  } as AgentConnection;
  let latestTask = existingTask;
  const savedEvents: Array<Record<string, unknown>> = [];
  const taskRepo = {
    create: jest.fn((input: Partial<AgentTask>) => input),
    findOne: jest.fn().mockImplementation(({ where }) => {
      if (where?.id && latestTask?.id !== where.id)
        return Promise.resolve(null);
      if (where?.ownerUserId && latestTask?.ownerUserId !== where.ownerUserId) {
        return Promise.resolve(null);
      }
      if (
        where?.idempotencyKey &&
        latestTask?.idempotencyKey !== where.idempotencyKey
      ) {
        return Promise.resolve(null);
      }
      return Promise.resolve(latestTask);
    }),
    save: jest.fn((input: AgentTask) => {
      const saved = { ...input, id: input.id ?? 101 } as AgentTask;
      latestTask = saved;
      return Promise.resolve(saved);
    }),
  };
  const eventRepo = {
    create: jest.fn((input: Record<string, unknown>) => input),
    save: jest.fn((input: Record<string, unknown>) => {
      savedEvents.push(input);
      return Promise.resolve(input);
    }),
  };
  const connectionRepo = {
    findOne: jest.fn().mockResolvedValue(activeConnection),
  };
  const service = new SocialAgentTaskLifecycleService(
    taskRepo as never,
    eventRepo as never,
    connectionRepo as never,
  );
  return {
    activeConnection,
    connectionRepo,
    eventRepo,
    savedEvents,
    service,
    taskRepo,
  };
}

describe('SocialAgentTaskLifecycleService', () => {
  it('reuses an existing idempotent chat task without writing a new event', async () => {
    const existing = makeTask({ idempotencyKey: 'idem-1' });
    const { service, taskRepo, eventRepo } = makeHarness(existing);

    const task = await service.createOrReuseTask({
      ownerUserId: 7,
      goal: '今晚跑步',
      permissionMode: AgentTaskPermissionMode.Confirm,
      idempotencyKey: 'idem-1',
    });

    expect(task).toBe(existing);
    expect(taskRepo.save).not.toHaveBeenCalled();
    expect(eventRepo.save).not.toHaveBeenCalled();
  });

  it('creates a recommendation task with the active agent connection and event', async () => {
    const { activeConnection, savedEvents, service, taskRepo } = makeHarness();

    const task = await service.createOrReuseTask({
      ownerUserId: 7,
      goal: '今晚跑步',
      permissionMode: AgentTaskPermissionMode.Confirm,
      idempotencyKey: 'idem-2',
    });

    expect(taskRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentConnectionId: activeConnection.id,
        taskType: 'social_agent_chat',
        title: '今晚跑步搭子',
        goal: '今晚跑步',
        status: AgentTaskStatus.Pending,
        idempotencyKey: 'idem-2',
      }),
    );
    expect(task.input).toMatchObject({
      source: 'social_agent_chat',
      executionBoundary: 'recommendation_plus_confirmation',
    });
    expect(savedEvents).toEqual([
      expect.objectContaining({
        actor: AgentTaskEventActor.Agent,
        eventType: AgentTaskEventType.TaskCreated,
        summary: '已创建 Social Agent 聊天任务',
        payload: { permissionMode: AgentTaskPermissionMode.Confirm },
      }),
    ]);
  });

  it('creates a conversation task when no task id is supplied', async () => {
    const { savedEvents, service } = makeHarness();

    const task = await service.ensureConversationTask(7, null, '你好');

    expect(task).toMatchObject({
      ownerUserId: 7,
      title: '普通聊天：功能咨询',
      goal: '你好',
      status: AgentTaskStatus.AwaitingFeedback,
      permissionMode: AgentTaskPermissionMode.Confirm,
    });
    expect(task.idempotencyKey).toContain('social-agent-message:7:');
    expect(task.input).toMatchObject({
      source: 'social_agent_chat',
      executionBoundary: 'conversation_then_tools',
      firstMessage: '你好',
    });
    expect(savedEvents[0]).toMatchObject({
      eventType: AgentTaskEventType.TaskCreated,
      summary: '已创建 Social Agent 聊天上下文',
    });
  });

  it('asserts task ownership for existing conversation tasks', async () => {
    const existing = makeTask({ ownerUserId: 7 });
    const { service } = makeHarness(existing);

    await expect(
      service.ensureConversationTask(8, 101, '你好'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
