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
    const messageLog = {
      recordUserMessage: jest.fn().mockResolvedValue(undefined),
      recordAssistantRunMessage: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SocialAgentRunOrchestratorService(
      taskLifecycle as never,
      mainAgentTurn as never,
      { run: jest.fn() } as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      messageLog as never,
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
    expect(messageLog.recordUserMessage).toHaveBeenCalledWith(
      task,
      '周末下午继续找青岛大学附近散步搭子',
    );
    expect(messageLog.recordAssistantRunMessage).toHaveBeenCalledWith(
      task,
      '我会在这个对话里继续。',
      result,
    );
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

  it('records the final stream-user assistant result into task memory', async () => {
    const task = makeTask(303);
    const taskLifecycle = {
      ensureConversationTask: jest.fn().mockResolvedValue(task),
      createOrReuseTask: jest.fn(),
    };
    const finalResult = {
      taskId: 303,
      status: AgentTaskStatus.AwaitingFeedback,
      visibleSteps: [],
      assistantMessage: '我已按你的时间和地点整理了 3 个公开可发现候选。',
      socialRequestDraft: null,
      candidates: [
        {
          userId: 22,
          nickname: '青岛散步搭子',
          city: '青岛',
          score: 88,
          reasons: ['周末下午也方便', '偏好低强度散步'],
        },
      ],
      approvalRequiredActions: [],
      events: [],
      cards: [],
    };
    const mainAgentTurn = {
      handleRunTurn: jest.fn().mockResolvedValue({
        task,
        result: null,
        alphaTurn: null,
      }),
    };
    const runRecommendations = {
      run: jest.fn().mockResolvedValue({
        task,
        result: finalResult,
      }),
    };
    const messageLog = {
      recordUserMessage: jest.fn().mockResolvedValue(undefined),
      recordAssistantRunMessage: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SocialAgentRunOrchestratorService(
      taskLifecycle as never,
      mainAgentTurn as never,
      runRecommendations as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      messageLog as never,
    );

    await expect(
      service.run(7, {
        goal: '可以，帮我找人',
        taskId: 303,
        clientContext: { threadId: 'agent-task:303' },
      }),
    ).resolves.toBe(finalResult);

    expect(runRecommendations.run).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        task,
        goal: '可以，帮我找人',
      }),
    );
    expect(messageLog.recordAssistantRunMessage).toHaveBeenCalledWith(
      task,
      '我已按你的时间和地点整理了 3 个公开可发现候选。',
      finalResult,
    );
  });
});
