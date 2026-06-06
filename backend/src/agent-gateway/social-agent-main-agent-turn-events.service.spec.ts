import { Logger } from '@nestjs/common';

import {
  AgentTask,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskPermissionMode,
  AgentTaskRiskLevel,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentMainAgentTurnEventsService } from './social-agent-main-agent-turn-events.service';

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
    riskLevel: AgentTaskRiskLevel.Low,
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

describe('SocialAgentMainAgentTurnEventsService', () => {
  it('writes sanitized agent task events', async () => {
    const eventRepo = {
      create: jest.fn((input: Record<string, unknown>) => input),
      save: jest.fn((input: Record<string, unknown>) => Promise.resolve(input)),
    };
    const service = new SocialAgentMainAgentTurnEventsService(
      eventRepo as never,
    );
    const task = makeTask();

    await service.writeEvent(task, AgentTaskEventType.Note, 'Main Agent note', {
      raw: 'mock unsafe payload',
      nested: { safe: '周末下午跑步' },
    });

    expect(eventRepo.create).toHaveBeenCalledWith({
      taskId: 101,
      ownerUserId: 7,
      eventType: AgentTaskEventType.Note,
      actor: AgentTaskEventActor.Agent,
      summary: 'Main Agent note',
      payload: {
        raw: '内容已隐藏',
        nested: { safe: '周末下午跑步' },
      },
    });
    expect(eventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 101,
        ownerUserId: 7,
      }),
    );
  });

  it('keeps event write failures non-blocking', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const eventRepo = {
      create: jest.fn((input: Record<string, unknown>) => input),
      save: jest.fn(() => Promise.reject(new Error('enum missing'))),
    };
    const service = new SocialAgentMainAgentTurnEventsService(
      eventRepo as never,
    );

    await expect(
      service.writeEvent(makeTask(), AgentTaskEventType.TaskFailed, 'Blocked', {
        traceId: 'trace-main-agent',
      }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'social_agent.main_agent_turn.event_write_failed',
      ),
    );

    warn.mockRestore();
  });

  it('reads sanitized task events for run result timelines', async () => {
    const createdAt = new Date('2026-06-06T00:00:00.000Z');
    const eventRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 1,
          taskId: 101,
          ownerUserId: 7,
          eventType: AgentTaskEventType.Note,
          actor: AgentTaskEventActor.Agent,
          summary: 'Main Agent note',
          payload: { text: 'mock draft should not leak' },
          stepId: 'clarify',
          toolCallId: null,
          createdAt,
        },
      ]),
    };
    const service = new SocialAgentMainAgentTurnEventsService(
      eventRepo as never,
    );

    await expect(service.readTaskEvents(makeTask(), 7)).resolves.toEqual([
      {
        id: 1,
        taskId: 101,
        eventType: AgentTaskEventType.Note,
        actor: AgentTaskEventActor.Agent,
        summary: 'Main Agent note',
        payload: { text: '内容已隐藏' },
        stepId: 'clarify',
        toolCallId: null,
        createdAt: {},
      },
    ]);
    expect(eventRepo.find).toHaveBeenCalledWith({
      where: { taskId: 101, ownerUserId: 7 },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: 500,
    });
  });
});
