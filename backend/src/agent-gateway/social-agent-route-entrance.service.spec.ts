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
  options: {
    earlyResult?: SocialAgentIntentRouteResult;
    workoutResult?: {
      task: AgentTask;
      result: SocialAgentIntentRouteResult;
    } | null;
    task?: AgentTask;
  } = {},
) {
  const task = options.task ?? makeTask();
  const messageLog = {
    recordUserMessage: jest.fn().mockResolvedValue(undefined),
  };
  const taskLifecycle = {
    ensureConversationTask: jest.fn().mockResolvedValue(task),
  };
  const agentEntry = {
    handle: jest.fn().mockResolvedValue(
      options.workoutResult ?? {
        source: 'legacy_fallback',
        task,
        result: options.earlyResult ?? null,
      },
    ),
  };
  const service = new SocialAgentRouteEntranceService(
    messageLog as never,
    taskLifecycle as never,
    agentEntry as never,
  );
  return {
    agentEntry,
    messageLog,
    service,
    task,
    taskLifecycle,
  };
}

describe('SocialAgentRouteEntranceService', () => {
  it('rejects empty route messages before creating a task', async () => {
    const { agentEntry, messageLog, service, taskLifecycle } = makeHarness();

    await expect(
      service.enter({
        ownerUserId: 7,
        body: { message: '   ' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(taskLifecycle.ensureConversationTask).not.toHaveBeenCalled();
    expect(messageLog.recordUserMessage).not.toHaveBeenCalled();
    expect(agentEntry.handle).not.toHaveBeenCalled();
  });

  it('normalizes input, ensures the conversation task, records the user message, and enters the agent orchestrator', async () => {
    const { agentEntry, messageLog, service, task, taskLifecycle } =
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
      null,
    );
    expect(messageLog.recordUserMessage).toHaveBeenCalledWith(
      task,
      '帮我找青岛周末跑步搭子',
    );
    expect(agentEntry.handle).toHaveBeenCalledWith({
      ownerUserId: 7,
      task,
      body: {
        taskId: 101,
        message: '  帮我找青岛周末跑步搭子  ',
        hasCandidates: true,
      },
      message: '帮我找青岛周末跑步搭子',
      startedAt: result.startedAt,
      signal: undefined,
    });
  });

  it('passes client thread id through so follow-up messages append to the active thread', async () => {
    const { service, taskLifecycle } = makeHarness();

    await service.enter({
      ownerUserId: 7,
      body: {
        message: '可以，继续刚才的约练',
        clientContext: { threadId: 'agent-task:101' },
        idempotencyKey: 'follow-up-1',
      },
    });

    expect(taskLifecycle.ensureConversationTask).toHaveBeenCalledWith(
      7,
      null,
      '可以，继续刚才的约练',
      'follow-up-1',
      'agent-task:101',
    );
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

  it('returns WorkoutLoop fast path results after recording the user message without entering Main Agent routing', async () => {
    const task = makeTask();
    const workoutResult = {
      task,
      result: makeEarlyResult({
        action: 'await_confirmation',
        assistantMessage: '我已经帮你整理成一张约练卡。',
        cards: [
          {
            id: 'workout_draft:101:501',
            type: 'workout_draft',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'workout.draft',
            title: '今晚跑步约练',
            data: { socialRequestId: 501 },
            actions: [],
          },
        ],
      }),
    };
    const { agentEntry, messageLog, service } = makeHarness({
      task,
      workoutResult,
    });

    await expect(
      service.enter({
        ownerUserId: 7,
        body: { message: '今晚青岛大学附近跑步' },
      }),
    ).resolves.toMatchObject({
      message: '今晚青岛大学附近跑步',
      task,
      earlyResult: workoutResult.result,
    });

    expect(messageLog.recordUserMessage).toHaveBeenCalledWith(
      task,
      '今晚青岛大学附近跑步',
    );
    expect(agentEntry.handle).toHaveBeenCalledWith({
      ownerUserId: 7,
      task,
      body: { message: '今晚青岛大学附近跑步' },
      message: '今晚青岛大学附近跑步',
      startedAt: expect.any(Number),
      signal: undefined,
    });
  });
});
