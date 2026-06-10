import {
  AgentTask,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { LifeGraphProposalStatus } from '../life-graph/life-graph.enums';
import { SocialAgentLifeGraphCardActionService } from './social-agent-life-graph-card-action.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    taskType: 'social_agent_chat',
    title: 'FitMeet Social Agent 聊天任务',
    goal: '完善画像',
    result: {},
    memory: {},
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Confirm,
    ...overrides,
  } as AgentTask;
}

function makeProposal(status: LifeGraphProposalStatus) {
  return {
    proposalId: 77,
    userId: 7,
    taskId: 101,
    messageId: null,
    proposedFields: [
      {
        proposalFieldId: 'lifestyle:availableTimes:1',
        category: 'lifestyle',
        fieldKey: 'availableTimes',
        fieldValue: ['周末下午'],
        source: 'ai_inferred',
        confidence: 0.9,
        reason: '用户提到周末下午一般有空',
        requiresUserConfirmation: true,
        status:
          status === LifeGraphProposalStatus.Rejected
            ? 'rejected'
            : 'confirmed',
        conflict: false,
        oldValue: null,
      },
    ],
    status,
    aiSummary: '识别到周末下午偏好。',
    missingFields: [],
    confirmationRequired: true,
    createdAt: new Date(0).toISOString(),
    confirmedAt:
      status === LifeGraphProposalStatus.Confirmed
        ? new Date(0).toISOString()
        : null,
    rejectedAt:
      status === LifeGraphProposalStatus.Rejected
        ? new Date(0).toISOString()
        : null,
  };
}

function makeHarness() {
  const savedEvents: Array<Record<string, unknown>> = [];
  let task = makeTask();
  const taskRepo = {
    findOne: jest.fn().mockImplementation(() => Promise.resolve(task)),
    save: jest.fn().mockImplementation((input: AgentTask) => {
      task = input;
      return Promise.resolve(input);
    }),
  };
  const eventRepo = {
    create: jest.fn((input: Record<string, unknown>) => input),
    save: jest.fn((input: Record<string, unknown>) => {
      savedEvents.push(input);
      return Promise.resolve(input);
    }),
  };
  const lifeGraph = {
    confirmUpdate: jest
      .fn()
      .mockResolvedValue(makeProposal(LifeGraphProposalStatus.Confirmed)),
    rejectUpdate: jest
      .fn()
      .mockResolvedValue(makeProposal(LifeGraphProposalStatus.Rejected)),
  };
  const service = new SocialAgentLifeGraphCardActionService(
    taskRepo as never,
    eventRepo as never,
    lifeGraph as never,
  );
  return {
    eventRepo,
    lifeGraph,
    savedEvents,
    service,
    taskRepo,
    get task() {
      return task;
    },
  };
}

describe('SocialAgentLifeGraphCardActionService', () => {
  it('confirms a Life Graph proposal from a profile proposal card action', async () => {
    const harness = makeHarness();

    const result = await harness.service.performUpdateAction(7, 101, {
      action: 'life_graph.accept_update',
      payload: {
        taskId: 101,
        cardData: { proposalId: 77 },
      },
    });

    expect(harness.lifeGraph.confirmUpdate).toHaveBeenCalledWith(7, {
      proposalId: 77,
    });
    expect(result).toMatchObject({
      action: 'reply',
      profileUpdated: true,
      cards: [],
      assistantMessage: expect.stringContaining('已保存 1 条 Life Graph 信息'),
    });
    expect(harness.task.memory).toMatchObject({
      taskMemory: {
        currentTask: expect.objectContaining({
          state: 'profile_saved',
          profileSaved: true,
          waitingFor: 'availability_boundaries_or_search_confirmation',
          lastCompletedStep: 'life_graph_profile_confirmed',
        }),
      },
    });
    expect(harness.task.result).toMatchObject({
      lifeGraphDecision: {
        proposalId: 77,
        status: LifeGraphProposalStatus.Confirmed,
        accepted: true,
      },
    });
    expect(harness.eventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AgentTaskEventType.ConfirmationReceived,
        actor: AgentTaskEventActor.User,
      }),
    );
  });

  it('rejects a Life Graph proposal and keeps the task in profile refinement', async () => {
    const harness = makeHarness();

    const result = await harness.service.performUpdateAction(7, 101, {
      action: 'life_graph.reject_update',
      payload: {
        proposalId: 77,
        fieldIds: ['lifestyle:availableTimes:1'],
        reason: '先不保存',
      },
    });

    expect(harness.lifeGraph.rejectUpdate).toHaveBeenCalledWith(7, {
      proposalId: 77,
      fieldIds: ['lifestyle:availableTimes:1'],
      reason: '先不保存',
    });
    expect(result.assistantMessage).toContain('不会保存');
    expect(harness.task.memory).toMatchObject({
      taskMemory: {
        currentTask: expect.objectContaining({
          state: 'profile_building',
          profileSaved: false,
          awaitingSearchConfirmation: false,
          lastCompletedStep: 'life_graph_profile_rejected',
        }),
      },
    });
  });
});
