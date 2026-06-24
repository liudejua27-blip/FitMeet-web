import { Logger } from '@nestjs/common';

import {
  AgentTask,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import { SocialAgentRouteProfileTurnService } from './social-agent-route-profile-turn.service';

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

function makeRoute(
  overrides: Partial<SocialAgentIntentRouterResult> = {},
): SocialAgentIntentRouterResult {
  return {
    intent: 'profile_update',
    confidence: 0.9,
    entities: {
      city: '',
      activityType: '',
      targetGender: '',
      timePreference: '',
      locationPreference: '',
    },
    shouldSearch: false,
    shouldReplan: false,
    shouldUpdateProfile: true,
    shouldExecuteAction: false,
    replyStrategy: 'append_context',
    source: 'rules',
    ...overrides,
  };
}

function makeHarness(options: { lifeGraph?: unknown } = {}) {
  const taskRepo = {
    save: jest.fn((task: AgentTask) => Promise.resolve(task)),
  };
  const eventRepo = {
    create: jest.fn((input: Record<string, unknown>) => input),
    save: jest.fn((input: Record<string, unknown>) => Promise.resolve(input)),
  };
  const socialProfiles = {
    saveAnswer: jest.fn().mockResolvedValue(undefined),
    generateAiDraft: jest.fn().mockResolvedValue({
      mode: 'fallback',
      draft: {
        basic: { city: '', nickname: '' },
        tags: { fitnessGoals: [], interestTags: [] },
      },
      completion: { percent: 40, missingFields: ['availableTimes'] },
    }),
  };
  const metrics = {
    recordError: jest.fn(),
  };
  const profileEnrichment = {
    lifeGraphProposalReply: jest
      .fn()
      .mockReturnValue('我识别到这些 Life Graph 更新，确认后保存。'),
  };
  const service = new SocialAgentRouteProfileTurnService(
    taskRepo as never,
    eventRepo as never,
    socialProfiles as never,
    metrics as never,
    profileEnrichment as never,
    options.lifeGraph as never,
  );
  return {
    eventRepo,
    metrics,
    profileEnrichment,
    service,
    socialProfiles,
    taskRepo,
  };
}

describe('SocialAgentRouteProfileTurnService', () => {
  it('returns a Life Graph proposal without writing directly to social profile', async () => {
    const lifeGraph = {
      extractFromChat: jest.fn().mockResolvedValue({
        proposedFields: [
          { fieldKey: 'availableTimes', fieldValue: '周末下午' },
        ],
      }),
    };
    const { profileEnrichment, service, socialProfiles, taskRepo } =
      makeHarness({ lifeGraph });
    const task = makeTask();

    const result = await service.handle({
      ownerUserId: 7,
      task,
      message: '我周末下午有空',
      route: makeRoute(),
    });

    expect(result).toMatchObject({
      handled: true,
      savedContext: true,
      profileUpdated: false,
      profileUpdateProposal: {
        proposedFields: [
          { fieldKey: 'availableTimes', fieldValue: '周末下午' },
        ],
      },
      assistantMessage: '我识别到这些 Life Graph 更新，确认后保存。',
    });
    expect(profileEnrichment.lifeGraphProposalReply).toHaveBeenCalledWith(
      result.profileUpdateProposal,
    );
    expect(task.memory).toMatchObject({
      taskMemory: {
        currentTask: {
          waitingFor: 'life_graph_profile_confirmation',
          lastCompletedStep: 'life_graph_profile_proposed',
        },
      },
    });
    expect(taskRepo.save).toHaveBeenCalledWith(task);
    expect(socialProfiles.saveAnswer).not.toHaveBeenCalled();
  });

  it('passes sanitized worker context into Life Graph extraction', async () => {
    const lifeGraph = {
      extractFromChat: jest.fn().mockResolvedValue({
        proposedFields: [
          { fieldKey: 'availableTimes', fieldValue: '周末下午' },
        ],
      }),
    };
    const { service } = makeHarness({ lifeGraph });
    const task = makeTask();
    const hydratedContext = {
      userId: 7,
      threadId: 'agent-task:101',
      taskId: 101,
      recentMessages: [
        { role: 'user', content: '今晚青岛大学附近散步' },
        { role: 'assistant', text: '已记住时间、地点和活动。' },
      ],
      taskMemory: null,
      taskSlots: {
        time_window: { value: '今晚', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        activity: { value: '散步', state: 'completed' },
      },
      lifeGraphFactProposals: [],
      lifeGraphFactDisplaySummaries: [],
      lifeGraphGovernanceSummary: {
        total: 0,
        autoSaveCount: 0,
        confirmationRequiredCount: 0,
        blockedCount: 0,
        sensitiveCount: 0,
        expiringFactKeys: [],
      },
      lifeGraphSummary: {
        preferences: { firstMeet: '公共场所优先' },
      },
      pendingApprovals: [{ approvalId: 'approval-1' }],
      candidateActions: { saved: ['candidate-1'] },
    } as never;

    await service.handle({
      ownerUserId: 7,
      task,
      message: '我周末下午有空',
      route: makeRoute(),
      hydratedContext,
    });

    expect(lifeGraph.extractFromChat).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        message: '我周末下午有空',
        taskId: task.id,
        context: expect.objectContaining({
          intent: 'profile_update',
          threadId: 'agent-task:101',
          taskId: 101,
          taskSlots: expect.objectContaining({
            time_window: expect.objectContaining({ value: '今晚' }),
          }),
          lifeGraphSummary: expect.objectContaining({
            preferences: { firstMeet: '公共场所优先' },
          }),
          pendingApprovalCount: 1,
          candidateActions: { saved: ['candidate-1'] },
          recentMessages: [
            { role: 'user', text: '今晚青岛大学附近散步' },
            { role: 'assistant', text: '已记住时间、地点和活动。' },
          ],
        }),
      }),
    );
  });

  it('keeps enough recent messages for Life Graph extraction instead of a tiny profile-only window', async () => {
    const lifeGraph = {
      extractFromChat: jest.fn().mockResolvedValue({
        proposedFields: [
          { fieldKey: 'availableTimes', fieldValue: '周末下午' },
        ],
      }),
    };
    const { service } = makeHarness({ lifeGraph });
    const task = makeTask();
    const recentMessages = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content:
        index === 0
          ? '我第一次见面只接受公共场所'
          : `画像上下文第 ${index + 1} 轮`,
    }));

    await service.handle({
      ownerUserId: 7,
      task,
      message: '我周末下午有空',
      route: makeRoute(),
      hydratedContext: {
        userId: 7,
        threadId: 'agent-task:101',
        taskId: 101,
        recentMessages,
        taskMemory: null,
        taskSlots: {},
        lifeGraphFactProposals: [],
        lifeGraphFactDisplaySummaries: [],
        lifeGraphGovernanceSummary: {
          total: 0,
          autoSaveCount: 0,
          confirmationRequiredCount: 0,
          blockedCount: 0,
          sensitiveCount: 0,
          expiringFactKeys: [],
        },
        lifeGraphSummary: {},
        pendingApprovals: [],
        candidateActions: {},
      } as never,
    });

    const [, call] = lifeGraph.extractFromChat.mock.calls[0];
    expect(call.context.recentMessages).toHaveLength(12);
    expect(call.context.recentMessages[0]).toMatchObject({
      role: 'user',
      text: '我第一次见面只接受公共场所',
    });
  });

  it('creates a profile update preview when no Life Graph proposal is available', async () => {
    const { eventRepo, service, socialProfiles, taskRepo } = makeHarness();
    const task = makeTask();

    const result = await service.handle({
      ownerUserId: 7,
      task,
      message: '我周末下午比较有空',
      route: makeRoute(),
    });

    expect(result).toMatchObject({
      handled: true,
      task,
      assistantMessage: expect.stringContaining('更新预览'),
      savedContext: true,
      profileUpdated: false,
      profileUpdateProposal: null,
    });
    expect(socialProfiles.generateAiDraft).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        answers: [{ key: 'availableTimes', answer: '我周末下午比较有空' }],
        rawText: '我周末下午比较有空',
        source: 'social_agent_profile_turn',
      }),
    );
    expect(socialProfiles.saveAnswer).not.toHaveBeenCalled();
    expect(task.status).toBe(AgentTaskStatus.AwaitingFeedback);
    expect(task.statusReason).toBe(
      'profile_update_preview_pending_confirmation',
    );
    expect(task.result).toMatchObject({
      latestIntent: {
        intent: 'profile_update',
        message: '我周末下午比较有空',
      },
      profileUpdatePreview: {
        status: 'pending_confirmation',
        confirmationRequired: true,
      },
    });
    expect(task.memory).toMatchObject({
      taskMemory: {
        currentTask: {
          awaitingSearchConfirmation: true,
          waitingFor: 'profile_update_preview_confirmation',
          lastCompletedStep: 'profile_update_preview_created',
        },
      },
    });
    expect(taskRepo.save).toHaveBeenCalledWith(task);
    expect(eventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AgentTaskEventType.SocialAgentContextAppended,
        actor: AgentTaskEventActor.User,
      }),
    );
  });

  it('records event-write failures without directly persisting sensitive safety boundaries', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const { eventRepo, metrics, service, socialProfiles } = makeHarness();
    const task = makeTask();
    eventRepo.save.mockRejectedValue(new Error('enum missing'));

    try {
      const result = await service.handle({
        ownerUserId: 7,
        task,
        message: '不要夜间见面',
        route: makeRoute({ intent: 'safety_or_boundary' }),
      });

      expect(result).toMatchObject({
        handled: true,
        assistantMessage:
          expect.stringContaining('不会自动发送消息、加好友或创建活动'),
        savedContext: true,
        profileUpdated: false,
      });
      expect(socialProfiles.saveAnswer).not.toHaveBeenCalled();
      expect(task.memory).toMatchObject({
        taskMemory: {
          currentTask: {
            waitingFor: 'profile_update_preview_confirmation',
            lastCompletedStep: 'profile_context_saved_pending_confirmation',
          },
        },
      });
      expect(metrics.recordError).toHaveBeenCalledWith(
        'context_append_event_failed',
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'social_agent.route_profile_turn.event_write_failed',
        ),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('ignores intents that do not write profile or boundary context', async () => {
    const { service, socialProfiles, taskRepo } = makeHarness();
    const task = makeTask();

    await expect(
      service.handle({
        ownerUserId: 7,
        task,
        message: '帮我找跑步搭子',
        route: makeRoute({
          intent: 'social_search',
          shouldSearch: true,
          shouldUpdateProfile: false,
          replyStrategy: 'search_candidates',
        }),
      }),
    ).resolves.toMatchObject({
      handled: false,
      task,
      savedContext: false,
      profileUpdated: false,
      profileUpdateProposal: null,
    });

    expect(taskRepo.save).not.toHaveBeenCalled();
    expect(socialProfiles.saveAnswer).not.toHaveBeenCalled();
  });
});
