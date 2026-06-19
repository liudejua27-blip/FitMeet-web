import {
  AgentTaskPermissionMode,
  AgentTaskRiskLevel,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentRunOrchestratorService } from './social-agent-run-orchestrator.service';

function makeTask(id = 202) {
  return {
    id,
    ownerUserId: 7,
    taskType: 'social_agent_chat',
    title: '周末青岛大学散步搭子',
    goal: '周末青岛大学散步搭子',
    input: {},
    plan: [],
    toolCalls: [],
    result: {},
    memory: {},
    status: AgentTaskStatus.AwaitingFeedback,
    permissionMode: AgentTaskPermissionMode.Confirm,
    riskLevel: AgentTaskRiskLevel.Low,
    idempotencyKey: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as never;
}

describe('SocialAgentRunOrchestratorService thread/session binding', () => {
  it('resolves stream-user runs through the active conversation task instead of creating a new thread', async () => {
    const task = makeTask();
    const taskLifecycle = {
      ensureConversationTask: jest.fn().mockResolvedValue(task),
      createOrReuseTask: jest.fn(),
    };
    const result = {
      taskId: 202,
      status: AgentTaskStatus.AwaitingFeedback,
      visibleSteps: [],
      assistantMessage: '我会在这个对话里继续。',
      socialRequestDraft: null,
      candidates: [],
      approvalRequiredActions: [],
      events: [],
      cards: [],
    };
    const mainAgentTurn = {
      handleRunTurn: jest.fn().mockResolvedValue({
        task,
        result,
      }),
    };
    const service = new SocialAgentRunOrchestratorService(
      taskLifecycle as never,
      mainAgentTurn as never,
      { run: jest.fn() } as never,
    );
    const emit = jest.fn();

    await expect(
      service.run(
        7,
        {
          goal: '周末下午继续找青岛大学附近散步搭子',
          clientContext: { threadId: 'agent-task:202' },
          idempotencyKey: 'message-1',
        },
        emit,
      ),
    ).resolves.toBe(result);

    expect(taskLifecycle.ensureConversationTask).toHaveBeenCalledWith(
      7,
      202,
      '周末下午继续找青岛大学附近散步搭子',
      'message-1',
      'agent-task:202',
    );
    expect(taskLifecycle.createOrReuseTask).not.toHaveBeenCalled();
    expect(mainAgentTurn.handleRunTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        task,
        message: '周末下午继续找青岛大学附近散步搭子',
      }),
    );
    expect(emit).toHaveBeenCalledWith({
      type: 'task',
      taskId: 202,
      status: AgentTaskStatus.AwaitingFeedback,
    });
  });
});
