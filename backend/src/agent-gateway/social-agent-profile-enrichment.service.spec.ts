import { AgentTask, AgentTaskStatus } from './entities/agent-task.entity';
import { rememberSocialAgentConversationBrainToolResult } from './social-agent-chat-brain-memory.presenter';
import { SocialAgentToolName } from './social-agent-tool-executor.service';
import { SocialAgentProfileEnrichmentService } from './social-agent-profile-enrichment.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    goal: '完善画像',
    memory: {},
    result: {},
    status: AgentTaskStatus.Pending,
    ...overrides,
  } as AgentTask;
}

function makeHarness(options: { lifeGraph?: unknown } = {}) {
  const taskRepo = {
    save: jest.fn((task: AgentTask) => Promise.resolve(task)),
  };
  const executor = {
    executeToolAction: jest.fn().mockResolvedValue({
      status: 'succeeded',
      output: { updatedFields: ['city', 'interestTags'] },
      error: null,
    }),
  };
  const chatLlm = {
    extractProfileFieldsWithLlm: jest.fn().mockResolvedValue({}),
    profileFieldsFromRecord: jest.fn().mockReturnValue({}),
    generateAgentBrainReply: jest
      .fn()
      .mockImplementation(({ fallbackReply }) =>
        Promise.resolve(fallbackReply),
      ),
  };
  const metrics = {
    recordError: jest.fn(),
  };
  const service = new SocialAgentProfileEnrichmentService(
    taskRepo as never,
    executor as never,
    chatLlm as never,
    metrics as never,
    options.lifeGraph as never,
  );
  return { chatLlm, executor, metrics, service, taskRepo };
}

describe('SocialAgentProfileEnrichmentService', () => {
  it('returns a Life Graph proposal when extracted profile fields are proposed', async () => {
    const lifeGraph = {
      extractFromChat: jest.fn().mockResolvedValue({
        proposedFields: [
          { fieldKey: 'city', fieldValue: '青岛' },
          { fieldKey: 'availableTimes', fieldValue: ['周末下午'] },
        ],
      }),
    };
    const { service, taskRepo } = makeHarness({ lifeGraph });
    const task = makeTask();

    const result = await service.handleTurn({
      ownerUserId: 7,
      task,
      message: '我是青岛大学男生，周末下午喜欢跑步',
      intent: 'profile_enrichment',
      buildMemoryContext: () => null,
    });

    expect(result).toMatchObject({
      savedContext: true,
      profileUpdated: false,
      profileUpdateProposal: {
        proposedFields: [
          { fieldKey: 'city', fieldValue: '青岛' },
          { fieldKey: 'availableTimes', fieldValue: ['周末下午'] },
        ],
      },
    });
    expect(result.assistantMessage).toContain('城市：青岛');
    expect(result.assistantMessage).toContain('可约时间：周末下午');
    expect(task.memory).toMatchObject({
      pendingProfileEnrichment: {
        extractedProfile: expect.objectContaining({
          city: '青岛',
          gender: '男',
          interestTags: ['跑步'],
        }),
      },
    });
    expect(taskRepo.save).toHaveBeenCalledWith(task);
  });

  it('answers profile missing-field questions from the latest brain tool result', async () => {
    const { service } = makeHarness();
    const task = makeTask();
    rememberSocialAgentConversationBrainToolResult(task, {
      name: SocialAgentToolName.GetMyProfile,
      status: 'succeeded',
      output: { missingFields: ['可约时间', '边界要求'] },
    });

    const result = await service.handleTurn({
      ownerUserId: 7,
      task,
      message: '我的画像还缺什么',
      intent: 'profile_enrichment_request',
      buildMemoryContext: () => null,
    });

    expect(result.assistantMessage).toContain('可约时间、边界要求');
    expect(result.profileUpdated).toBe(false);
  });

  it('saves profile fields through the profile update tool when the user confirms', async () => {
    const { chatLlm, executor, service } = makeHarness();
    const task = makeTask();

    const result = await service.handleTurn({
      ownerUserId: 7,
      task,
      message: '可以保存，我在青岛，喜欢跑步和咖啡',
      intent: 'profile_enrichment',
      buildMemoryContext: () => ({ summary: 'memory' }) as never,
    });

    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.UpdateProfileFromAgentContext,
      expect.objectContaining({
        extractedProfile: expect.objectContaining({
          city: '青岛',
          interestTags: ['跑步', '咖啡'],
        }),
        taskId: 101,
      }),
      7,
    );
    expect(chatLlm.generateAgentBrainReply).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'profile_updated',
        memoryContext: { summary: 'memory' },
      }),
    );
    expect(result.profileUpdated).toBe(true);
    expect(result.assistantMessage).toContain('已帮你把刚才的信息写入 AI 画像');
  });

  it('persists extracted profile state before asking the user to save it', async () => {
    const { service, taskRepo } = makeHarness();
    const savedSnapshots: AgentTask[] = [];
    taskRepo.save.mockImplementation((task: AgentTask) => {
      savedSnapshots.push(JSON.parse(JSON.stringify(task)) as AgentTask);
      return Promise.resolve(task);
    });
    const task = makeTask();

    const result = await service.handleTurn({
      ownerUserId: 7,
      task,
      message: '我是青岛大学男生，周末下午喜欢跑步',
      intent: 'profile_enrichment',
      buildMemoryContext: () => null,
    });

    expect(result).toMatchObject({
      savedContext: true,
      profileUpdated: false,
      profileUpdateProposal: null,
    });
    expect(taskRepo.save).toHaveBeenCalledTimes(2);
    expect(savedSnapshots[1].memory).toMatchObject({
      pendingProfileEnrichment: {
        extractedProfile: expect.objectContaining({
          city: '青岛',
          gender: '男',
          interestTags: ['跑步'],
        }),
      },
      taskMemory: {
        currentTask: {
          objective: 'profile_enrichment',
          waitingFor: 'profile_save_or_more_profile_facts',
          awaitingSearchConfirmation: true,
          lastCompletedStep: 'profile_extracted',
          state: 'profile_building',
          stateReason: 'profile_detected',
        },
      },
    });
    expect(result.assistantMessage).toContain('先不直接搜索候选人');
  });

  it('executes conversation brain read tools and records failures without throwing', async () => {
    const { executor, metrics, service } = makeHarness();
    const task = makeTask();
    executor.executeToolAction
      .mockResolvedValueOnce({
        status: 'succeeded',
        output: { profile: { city: '青岛' } },
        error: null,
      })
      .mockRejectedValueOnce(new Error('candidate missing'));

    const results = await service.executeConversationBrainReadTools(7, task, {
      shouldExecuteTool: true,
      tools: [
        { name: 'get_user_profile', arguments: {} },
        { name: 'get_candidate_detail', arguments: { candidateId: 99 } },
        { name: 'send_message', arguments: {} },
      ],
    } as never);

    expect(executor.executeToolAction).toHaveBeenNthCalledWith(
      1,
      101,
      SocialAgentToolName.GetMyProfile,
      { userId: 7 },
      7,
    );
    expect(executor.executeToolAction).toHaveBeenNthCalledWith(
      2,
      101,
      SocialAgentToolName.ExplainMatches,
      { candidateId: 99, userId: 7 },
      7,
    );
    expect(results).toEqual([
      expect.objectContaining({ status: 'succeeded' }),
      expect.objectContaining({ status: 'failed' }),
    ]);
    expect(metrics.recordError).toHaveBeenCalledWith(
      'conversation_brain_read_tool_failed',
    );
  });
});
