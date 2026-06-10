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

  it('persists routed profile updates when no Life Graph proposal is available', async () => {
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
      assistantMessage: expect.stringContaining('现在开始搜索'),
      savedContext: true,
      profileUpdated: true,
      profileUpdateProposal: null,
    });
    expect(socialProfiles.saveAnswer).toHaveBeenCalledWith(
      7,
      'availableTimes',
      '我周末下午比较有空',
    );
    expect(task.status).toBe(AgentTaskStatus.AwaitingFeedback);
    expect(task.statusReason).toBe('intent_profile_update_saved');
    expect(task.result).toMatchObject({
      latestIntent: {
        intent: 'profile_update',
        message: '我周末下午比较有空',
      },
    });
    expect(task.memory).toMatchObject({
      taskMemory: {
        currentTask: {
          awaitingSearchConfirmation: true,
          waitingFor: 'availability_boundaries_or_search_confirmation',
          lastCompletedStep: 'profile_saved',
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

  it('records event-write failures without failing the profile turn', async () => {
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
        profileUpdated: true,
      });
      expect(socialProfiles.saveAnswer).toHaveBeenCalledWith(
        7,
        'avoidTraits',
        '不要夜间见面',
      );
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
