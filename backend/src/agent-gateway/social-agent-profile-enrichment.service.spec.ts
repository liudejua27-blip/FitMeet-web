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

function makeHarness(
  options: { contextTurnLimit?: number; lifeGraph?: unknown } = {},
) {
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
    generateAgentBrainReplyWithSource: jest
      .fn()
      .mockImplementation(({ fallbackReply }) =>
        Promise.resolve({ text: fallbackReply, source: 'fallback' }),
      ),
  };
  const metrics = {
    recordError: jest.fn(),
    recordDeterministicRouteReply: jest.fn(),
  };
  const service = new SocialAgentProfileEnrichmentService(
    taskRepo as never,
    executor as never,
    chatLlm as never,
    metrics as never,
    options.lifeGraph as never,
    options.contextTurnLimit
      ? ({
          get: jest.fn((key: string) =>
            key === 'SOCIAL_AGENT_CONTEXT_TURN_LIMIT'
              ? String(options.contextTurnLimit)
              : undefined,
          ),
        } as never)
      : undefined,
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

  it('answers profile missing-field questions with controlled completion prompts', async () => {
    const { chatLlm, executor, service, taskRepo } = makeHarness();
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

    expect(result.assistantMessage).toContain('可约时间');
    expect(result.assistantMessage).toContain('安全边界');
    expect(result.assistantMessage).toContain('所有问题都可以跳过');
    expect(result.assistantMessage).toContain('暂不确定');
    expect(result.assistantMessage).toContain('本次使用，不保存');
    expect(result.assistantMessage).toContain('是否开始匹配');
    expect(result.assistantMessage).toContain('不会直接搜索候选人');
    expect(result.profileUpdated).toBe(false);
    expect(taskRepo.save).toHaveBeenCalledWith(task);
    expect(executor.executeToolAction).not.toHaveBeenCalled();
    expect(chatLlm.extractProfileFieldsWithLlm).not.toHaveBeenCalled();
    expect(chatLlm.generateAgentBrainReplyWithSource).not.toHaveBeenCalled();
    expect(task.memory).toMatchObject({
      taskMemory: {
        currentTask: {
          objective: 'profile_completion',
          waitingFor: 'profile_completion_answers',
          awaitingSearchConfirmation: false,
          shouldSearchNow: false,
          lastCompletedStep: 'profile_completion_questions_asked',
          state: 'profile_building',
          stateReason: 'profile_detected',
        },
      },
    });
  });

  it('starts profile completion mode without recommending people or saving fields', async () => {
    const { chatLlm, executor, service } = makeHarness();
    const task = makeTask();

    const result = await service.handleTurn({
      ownerUserId: 7,
      task,
      message: '帮我完善 AI 画像，问我几个问题',
      intent: 'profile_enrichment_request',
      buildMemoryContext: () => null,
    });

    expect(result).toMatchObject({
      savedContext: true,
      profileUpdated: false,
      profileUpdateProposal: null,
      assistantMessageSource: 'deterministic_route',
      assistantStreamed: false,
    });
    expect(result.assistantMessage).toContain('5 项关键画像信息');
    expect(result.assistantMessage).toContain('当前目标');
    expect(result.assistantMessage).toContain('互动形式');
    expect(result.assistantMessage).toContain('时间和地点范围');
    expect(result.assistantMessage).toContain('活动偏好');
    expect(result.assistantMessage).toContain('安全边界');
    expect(result.assistantMessage).toContain('不会推荐具体人物');
    expect(result.assistantMessage).toContain('不会替你执行外部动作');
    expect(result.assistantMessage).not.toMatch(
      /raw JSON|traceId|planner|system tag|prompt|邀请Ta|开场白|city:|interestTags/i,
    );
    expect(executor.executeToolAction).not.toHaveBeenCalled();
    expect(chatLlm.extractProfileFieldsWithLlm).not.toHaveBeenCalled();
    expect(chatLlm.generateAgentBrainReplyWithSource).not.toHaveBeenCalled();
  });

  it('does not block candidate search for optional intensity or safety boundary once core opportunity fields are present', async () => {
    const lifeGraph = {
      getUnifiedMatchSignals: jest.fn().mockResolvedValue({
        identitySignals: {},
        lifestyleSignals: {},
        fitnessSignals: {},
        safetySignals: {},
      }),
    };
    const { service } = makeHarness({ lifeGraph });

    const result = await service.lifeGraphSearchClarification(
      7,
      '今天晚上在青岛大学附近，找个女舞蹈生散步。',
    );

    expect(result).toBeNull();
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
    expect(chatLlm.generateAgentBrainReplyWithSource).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'profile_updated',
        memoryContext: { summary: 'memory' },
      }),
    );
    expect(result.profileUpdated).toBe(true);
    expect(result.assistantMessage).toContain('已帮你把刚才的信息写入 AI 画像');
    expect(result.assistantMessage).toContain('城市');
    expect(result.assistantMessage).toContain('兴趣和活动偏好');
    expect(result.assistantMessage).not.toMatch(/city|interestTags/);
    expect(result.assistantMessageSource).toBe('fallback');
  });

  it('passes hydrated recent turns into Agent Brain replies', async () => {
    const { chatLlm, service } = makeHarness();
    const task = makeTask();
    const taskContext = {
      taskSlots: {
        time_window: { value: '今天晚上', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        activity: { value: '散步', state: 'completed' },
        candidate_preference: {
          value: '公开资料有舞蹈相关标签的人优先',
          state: 'completed',
        },
      },
      knownTaskSlotConstraints: {
        doNotRepeatQuestionsForSlots: [
          'time_window',
          'location_text',
          'activity',
          'candidate_preference',
        ],
      },
    };

    await service.handleTurn({
      ownerUserId: 7,
      task,
      message: '可以保存，我在青岛大学，今晚想散步',
      intent: 'profile_enrichment',
      buildMemoryContext: () =>
        ({
          shortTerm: {
            recentTurns: [
              {
                role: 'user',
                text: '今天晚上青岛大学附近散步，优先舞蹈相关公开标签',
              },
              {
                role: 'assistant',
                text: '我已经记住时间、地点、活动和候选偏好。',
              },
            ],
          },
        }) as never,
      buildTaskContext: (_task, memoryContext) => {
        expect(memoryContext).toMatchObject({
          shortTerm: {
            recentTurns: expect.arrayContaining([
              expect.objectContaining({
                text: '今天晚上青岛大学附近散步，优先舞蹈相关公开标签',
              }),
            ]),
          },
        });
        return taskContext;
      },
    });

    expect(chatLlm.generateAgentBrainReplyWithSource).toHaveBeenCalledWith(
      expect.objectContaining({
        taskContext,
        conversationHistory: [
          {
            role: 'user',
            text: '今天晚上青岛大学附近散步，优先舞蹈相关公开标签',
          },
          {
            role: 'assistant',
            text: '我已经记住时间、地点、活动和候选偏好。',
          },
        ],
      }),
    );
  });

  it('marks streamed profile replies as LLM-sourced and deterministic profile replies as deterministic', async () => {
    const { chatLlm, service } = makeHarness();
    const task = makeTask();
    chatLlm.generateAgentBrainReplyWithSource.mockImplementationOnce(
      async ({ onDelta, fallbackReply }) => {
        await onDelta?.('画像已更新');
        return { text: fallbackReply, source: 'llm' };
      },
    );
    const events: Array<Record<string, unknown>> = [];

    const streamed = await service.handleTurn({
      ownerUserId: 7,
      task,
      message: '可以保存，我在青岛，喜欢咖啡',
      intent: 'profile_enrichment',
      buildMemoryContext: () => null,
      emit: (event) => {
        events.push(event as unknown as Record<string, unknown>);
      },
    });

    expect(streamed.assistantMessageSource).toBe('llm');
    expect(streamed.assistantStreamed).toBe(true);
    expect(events).toEqual([
      expect.objectContaining({ type: 'assistant_delta', source: 'llm' }),
    ]);

    const fallback = await service.handleTurn({
      ownerUserId: 7,
      task: makeTask({ id: 102 }),
      message: '我是青岛大学男生，周末下午喜欢跑步',
      intent: 'profile_enrichment',
      buildMemoryContext: () => null,
    });

    expect(fallback.assistantMessageSource).toBe('deterministic_route');
    expect(fallback.assistantStreamed).toBe(false);
  });

  it('uses the unified context window to recover profile facts mentioned earlier in the thread', async () => {
    const { executor, service } = makeHarness({ contextTurnLimit: 80 });
    const turns = Array.from({ length: 88 }, (_, index) => ({
      id: `turn_${index + 1}`,
      role: 'user',
      text:
        index === 8
          ? '我在青岛大学，周末下午喜欢跑步和咖啡'
          : `普通聊天第 ${index + 1} 轮`,
      at: `2026-06-05T00:${String(index % 60).padStart(2, '0')}:00.000Z`,
    }));
    const task = makeTask({
      memory: {
        socialAgentConversation: { turns },
      },
    });

    const result = await service.handleTurn({
      ownerUserId: 7,
      task,
      message: '可以保存',
      intent: 'correction_or_clarification',
      buildMemoryContext: () => null,
    });

    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.UpdateProfileFromAgentContext,
      expect.objectContaining({
        extractedProfile: expect.objectContaining({
          city: '青岛',
          school: '青岛大学',
          availableTimes: ['周末下午喜欢跑步和咖啡'],
          interestTags: ['跑步', '咖啡'],
        }),
        sourceMessage: '我在青岛大学，周末下午喜欢跑步和咖啡',
      }),
      7,
    );
    expect(result.profileUpdated).toBe(true);
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
    expect(result.assistantMessage).toContain('城市：青岛');
    expect(result.assistantMessage).toContain('性别：男');
    expect(result.assistantMessage).toContain('兴趣和活动偏好：跑步');
    expect(result.assistantMessage).not.toMatch(/city:|gender:|interestTags:/);
  });

  it('skips LLM profile extraction when deterministic profile facts are sufficient', async () => {
    const { chatLlm, metrics, service } = makeHarness();
    const task = makeTask();

    const result = await service.handleTurn({
      ownerUserId: 7,
      task,
      message: '我是青岛大学男生，周末下午喜欢跑步和咖啡，想找同校女生。',
      intent: 'profile_enrichment',
      buildMemoryContext: () => null,
    });

    expect(chatLlm.extractProfileFieldsWithLlm).not.toHaveBeenCalled();
    expect(chatLlm.generateAgentBrainReplyWithSource).not.toHaveBeenCalled();
    expect(metrics.recordDeterministicRouteReply).toHaveBeenCalledWith(
      'profile_extraction.rule_based',
      { estimatedAvoidedLlmCalls: 1 },
    );
    expect(metrics.recordDeterministicRouteReply).toHaveBeenCalledWith(
      'profile_extraction.deterministic_reply',
      { estimatedAvoidedLlmCalls: 1 },
    );
    expect(result.profileUpdated).toBe(false);
    expect(result.assistantMessageSource).toBe('deterministic_route');
    expect(task.memory).toMatchObject({
      pendingProfileEnrichment: {
        extractedProfile: expect.objectContaining({
          city: '青岛',
          school: '青岛大学',
          gender: '男',
          interestTags: ['跑步', '咖啡'],
          availableTimes: ['周末下午喜欢跑步和咖啡'],
          targetPreference: '同校女生',
        }),
      },
    });
  });

  it('extracts public tag preferences and safety boundaries without LLM', async () => {
    const { chatLlm, service } = makeHarness();
    const task = makeTask();

    await service.handleTurn({
      ownerUserId: 7,
      task,
      message:
        '我在青岛大学附近，今天晚上想找女生散步，最好公开资料里有舞蹈或编程标签，第一次见面只在公共场所，先站内聊。',
      intent: 'profile_enrichment',
      buildMemoryContext: () => null,
    });

    expect(chatLlm.extractProfileFieldsWithLlm).not.toHaveBeenCalled();
    expect(task.memory).toMatchObject({
      pendingProfileEnrichment: {
        extractedProfile: expect.objectContaining({
          city: '青岛',
          school: '青岛大学',
          nearbyArea: '青岛大学附近',
          interestTags: expect.arrayContaining(['散步', '编程', '舞蹈']),
          targetPreference: expect.stringContaining('女生'),
          preferredTraits: expect.arrayContaining([
            expect.stringContaining('女生'),
          ]),
          socialBoundary:
            '第一次见面优先公共场所；先站内沟通，不自动交换联系方式',
          privacyBoundary:
            '第一次见面优先公共场所；先站内沟通，不自动交换联系方式',
        }),
      },
    });
  });

  it('keeps LLM profile extraction for sparse profile facts', async () => {
    const { chatLlm, service } = makeHarness();
    chatLlm.extractProfileFieldsWithLlm.mockResolvedValueOnce({
      city: '青岛',
    });
    const task = makeTask();

    await service.handleTurn({
      ownerUserId: 7,
      task,
      message: '我在青岛。',
      intent: 'profile_enrichment',
      buildMemoryContext: () => null,
    });

    expect(chatLlm.extractProfileFieldsWithLlm).toHaveBeenCalledWith(
      task,
      '我在青岛。',
    );
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
      .mockResolvedValueOnce({
        status: 'succeeded',
        output: { messages: [{ role: 'user', text: '刚才说到周末散步' }] },
        error: null,
      })
      .mockRejectedValueOnce(new Error('candidate missing'));

    const results = await service.executeConversationBrainReadTools(7, task, {
      shouldExecuteTool: true,
      tools: [
        { name: 'get_user_profile', arguments: {} },
        { name: 'get_conversation_history', arguments: {} },
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
      SocialAgentToolName.ReadTaskConversationMessages,
      { userId: 7 },
      7,
    );
    expect(executor.executeToolAction).toHaveBeenNthCalledWith(
      3,
      101,
      SocialAgentToolName.ExplainMatches,
      { candidateId: 99, userId: 7 },
      7,
    );
    expect(results).toEqual([
      expect.objectContaining({ status: 'succeeded' }),
      expect.objectContaining({ status: 'succeeded' }),
      expect.objectContaining({ status: 'failed' }),
    ]);
    expect(metrics.recordError).toHaveBeenCalledWith(
      'conversation_brain_read_tool_failed',
    );
  });
});
