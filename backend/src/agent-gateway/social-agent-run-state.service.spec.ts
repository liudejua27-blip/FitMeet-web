import { NotFoundException } from '@nestjs/common';

import {
  AgentTask,
  AgentTaskEventType,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentRunStateService } from './social-agent-run-state.service';
import { withSocialAgentStoredRun } from './social-agent-chat-run.presenter';
import type { SocialAgentAsyncRunSnapshot } from './social-agent-chat.types';

function makeRun(
  overrides: Partial<SocialAgentAsyncRunSnapshot> = {},
): SocialAgentAsyncRunSnapshot {
  return {
    taskId: 101,
    runId: 'sar_test_1',
    status: 'queued',
    phase: 'queued',
    message: 'queued',
    visibleSteps: [],
    queuedAt: '2026-06-05T00:00:00.000Z',
    startedAt: null,
    updatedAt: '2026-06-05T00:00:00.000Z',
    completedAt: null,
    failedAt: null,
    pollAfterMs: 1500,
    error: null,
    replan: null,
    result: null,
    ...overrides,
  };
}

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  const task = {
    id: 101,
    ownerUserId: 7,
    agentConnectionId: 11,
    result: {},
    status: AgentTaskStatus.Pending,
    statusReason: null,
    error: null,
    ...overrides,
  } as AgentTask;
  task.result = withSocialAgentStoredRun(task.result, makeRun());
  return task;
}

function makeHarness(task = makeTask()) {
  const savedEvents: Array<Record<string, unknown>> = [];
  const taskRepo = {
    findOne: jest.fn().mockResolvedValue(task),
    save: jest.fn((input: AgentTask) => Promise.resolve(input)),
  };
  const eventRepo = {
    create: jest.fn((input: Record<string, unknown>) => input),
    save: jest.fn((input: Record<string, unknown>) => {
      savedEvents.push(input);
      return Promise.resolve(input);
    }),
  };
  const messages = {
    createAgentInboxEvent: jest.fn().mockResolvedValue(undefined),
  };
  const service = new SocialAgentRunStateService(
    taskRepo as never,
    eventRepo as never,
    messages as never,
  );
  return { eventRepo, messages, savedEvents, service, task, taskRepo };
}

describe('SocialAgentRunStateService', () => {
  it('updates run snapshots and mirrors running status onto the task', async () => {
    const { service, task, taskRepo } = makeHarness();

    const saved = await service.updateRunSnapshot(
      7,
      101,
      'sar_test_1',
      {
        status: 'running',
        phase: 'search',
        message: '正在找人',
        visibleSteps: [{ id: 'search', label: '搜索', status: 'done' }],
      },
      (id, label) => `${id}:${label}`,
    );

    const run = service.readStoredRun(task, 'sar_test_1', (_, label) => label);
    expect(saved.status).toBe(AgentTaskStatus.Planning);
    expect(saved.statusReason).toBe('follow_up_replan_search');
    expect(run).toMatchObject({
      status: 'running',
      phase: 'search',
      message: '正在找人',
      visibleSteps: [{ id: 'search', label: '搜索', status: 'done' }],
    });
    expect(run?.startedAt).toEqual(expect.any(String));
    expect(taskRepo.save).toHaveBeenCalledWith(task);
  });

  it('marks failed runs, writes a system event, and notifies the agent inbox', async () => {
    const { messages, savedEvents, service, task, taskRepo } = makeHarness();

    await service.markRunFailed(
      7,
      101,
      'sar_test_1',
      { code: 'planner_failed', message: 'planner unavailable' },
      (_, label) => label,
      { statusReason: 'chat_run_failed' },
    );

    const run = service.readStoredRun(task, 'sar_test_1', (_, label) => label);
    expect(run).toMatchObject({
      status: 'failed',
      phase: 'failed',
      error: { code: 'planner_failed', message: 'planner unavailable' },
    });
    expect(task.status).toBe(AgentTaskStatus.AwaitingFeedback);
    expect(task.statusReason).toBe('chat_run_failed');
    expect(task.error).toEqual({
      code: 'planner_failed',
      message: 'planner unavailable',
    });
    expect(savedEvents).toEqual([
      expect.objectContaining({
        eventType: AgentTaskEventType.SocialAgentReplanFailed,
        taskId: 101,
      }),
    ]);
    expect(messages.createAgentInboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentConnectionId: 11,
        eventType: 'social_agent.replan.failed',
        ownerUserId: 7,
      }),
    );
    expect(taskRepo.save).toHaveBeenCalledTimes(2);
  });

  it('throws when the requested run does not exist', async () => {
    const { service } = makeHarness();

    await expect(
      service.updateRunSnapshot(
        7,
        101,
        'missing',
        { status: 'running' },
        (_, label) => label,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
