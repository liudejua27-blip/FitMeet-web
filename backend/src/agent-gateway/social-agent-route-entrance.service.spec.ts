import { BadRequestException } from '@nestjs/common';

import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import type { SocialAgentIntentRouteResult } from './social-agent-chat.types';
import { SocialAgentRouteEntranceService } from './social-agent-route-entrance.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    goal: '找跑步搭子',
    memory: {},
    result: {},
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Confirm,
    ...overrides,
  } as AgentTask;
}

function makeEarlyResult(
  overrides: Partial<SocialAgentIntentRouteResult> = {},
): SocialAgentIntentRouteResult {
  return {
    intent: 'unknown',
    confidence: 0.86,
    entities: {
      city: '',
      activityType: '',
      targetGender: '',
      timePreference: '',
      locationPreference: '',
    },
    shouldSearch: false,
    shouldReplan: false,
    shouldUpdateProfile: false,
    shouldExecuteAction: false,
    replyStrategy: 'ask_clarifying_question',
    source: 'rules',
    action: 'clarify',
    taskId: 101,
    assistantMessage: '你更想今晚附近走走，还是周末下午？',
    savedContext: true,
    profileUpdated: false,
    shouldQueueRun: false,
    runMode: null,
    queuedRun: null,
    pendingApproval: null,
    activityResults: [],
    profileUpdateProposal: null,
    permissionMode: AgentTaskPermissionMode.Confirm,
    ...overrides,
  };
}

function makeHarness(
  options: { earlyResult?: SocialAgentIntentRouteResult } = {},
) {
  const task = makeTask();
  const messageLog = {
    recordUserMessage: jest.fn().mockResolvedValue(undefined),
  };
  const taskLifecycle = {
    ensureConversationTask: jest.fn().mockResolvedValue(task),
  };
  const mainAgentTurn = {
    handleRouteTurn: jest.fn().mockResolvedValue({
      task,
      result: options.earlyResult ?? null,
    }),
  };
  const service = new SocialAgentRouteEntranceService(
    messageLog as never,
    taskLifecycle as never,
    mainAgentTurn as never,
  );
  return { mainAgentTurn, messageLog, service, task, taskLifecycle };
}

describe('SocialAgentRouteEntranceService', () => {
  it('rejects empty route messages before creating a task', async () => {
    const { mainAgentTurn, messageLog, service, taskLifecycle } = makeHarness();

    await expect(
      service.enter({
        ownerUserId: 7,
        body: { message: '   ' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(taskLifecycle.ensureConversationTask).not.toHaveBeenCalled();
    expect(messageLog.recordUserMessage).not.toHaveBeenCalled();
    expect(mainAgentTurn.handleRouteTurn).not.toHaveBeenCalled();
  });

  it('normalizes input, ensures the conversation task, records the user message, and enters Main Agent routing', async () => {
    const { mainAgentTurn, messageLog, service, task, taskLifecycle } =
      makeHarness();

    const result = await service.enter({
      ownerUserId: 7,
      body: {
        taskId: 101,
        message: '  帮我找青岛周末跑步搭子  ',
        hasCandidates: true,
      },
    });

    expect(result).toMatchObject({
      message: '帮我找青岛周末跑步搭子',
      task,
      earlyResult: null,
    });
    expect(result.startedAt).toEqual(expect.any(Number));
    expect(taskLifecycle.ensureConversationTask).toHaveBeenCalledWith(
      7,
      101,
      '帮我找青岛周末跑步搭子',
      null,
    );
    expect(messageLog.recordUserMessage).toHaveBeenCalledWith(
      task,
      '帮我找青岛周末跑步搭子',
    );
    expect(mainAgentTurn.handleRouteTurn).toHaveBeenCalledWith({
      ownerUserId: 7,
      task,
      message: '帮我找青岛周末跑步搭子',
      hasCandidates: true,
      startedAt: result.startedAt,
    });
  });

  it('returns Main Agent early results so downstream route handlers are skipped', async () => {
    const earlyResult = makeEarlyResult();
    const { service, task } = makeHarness({ earlyResult });

    await expect(
      service.enter({
        ownerUserId: 7,
        body: { message: '想找轻松一点的人', hasCandidates: false },
      }),
    ).resolves.toMatchObject({
      message: '想找轻松一点的人',
      task,
      earlyResult,
    });
  });
});
