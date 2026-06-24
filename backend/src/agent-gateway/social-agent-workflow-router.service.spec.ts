import { SocialAgentWorkflowRouterService } from './social-agent-workflow-router.service';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';

function route(
  overrides: Partial<SocialAgentIntentRouterResult> = {},
): SocialAgentIntentRouterResult {
  return {
    intent: 'social_search',
    confidence: 0.92,
    entities: {
      city: '青岛',
      activityType: '散步',
      targetGender: '',
      timePreference: '今天晚上',
      locationPreference: '青岛大学附近',
    },
    shouldSearch: true,
    shouldReplan: false,
    shouldUpdateProfile: false,
    shouldExecuteAction: false,
    replyStrategy: 'search_candidates',
    source: 'rules',
    ...overrides,
  };
}

describe('SocialAgentWorkflowRouterService', () => {
  it('routes explicit social workflow turns without requiring LLM routing', () => {
    const intentRouter = {
      routeByRules: jest.fn(() => route()),
    };
    const service = new SocialAgentWorkflowRouterService(intentRouter as never);

    const decision = service.route({
      message: '帮我找今晚青岛大学附近散步搭子',
      taskContext: {},
      profile: {},
      conversationHistory: [],
      conversationIntent: 'social',
    });

    expect(decision).toMatchObject({
      reason: 'explicit_social_workflow',
      skipBrain: true,
      route: {
        intent: 'social_search',
        shouldSearch: true,
        replyStrategy: 'search_candidates',
      },
    });
    expect(intentRouter.routeByRules).toHaveBeenCalledTimes(1);
  });

  it('routes candidate refinements only when a search context exists', () => {
    const intentRouter = {
      routeByRules: jest.fn(() =>
        route({ intent: 'candidate_followup', shouldReplan: true }),
      ),
    };
    const service = new SocialAgentWorkflowRouterService(intentRouter as never);

    expect(
      service.route({
        message: '有没有女生，最好喜欢编程',
        taskContext: { hasCandidates: true },
        profile: {},
        conversationHistory: [],
        conversationIntent: 'social',
      }),
    ).toMatchObject({
      reason: 'candidate_refinement_workflow',
      route: { intent: 'candidate_followup' },
    });
  });

  it('routes short continuation turns when task slots already define a social workflow', () => {
    const intentRouter = {
      routeByRules: jest.fn(() =>
        route({
          intent: 'casual_chat',
          shouldSearch: false,
          replyStrategy: 'conversational_answer',
        }),
      ),
    };
    const service = new SocialAgentWorkflowRouterService(intentRouter as never);

    const decision = service.route({
      message: '可以，继续',
      taskContext: {
        taskSlots: {
          activity: { value: '散步', state: 'completed' },
          time_window: { value: '今天晚上', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
        },
      },
      profile: {},
      conversationHistory: [],
      conversationIntent: 'conversation',
    });

    expect(decision).toMatchObject({
      reason: 'social_continuation_workflow',
      skipBrain: true,
      route: {
        intent: 'social_search',
        shouldSearch: true,
        replyStrategy: 'search_candidates',
      },
    });
    expect(intentRouter.routeByRules).toHaveBeenCalledTimes(1);
  });

  it('routes empty-candidate recovery turns through the social workflow without Brain routing', () => {
    const intentRouter = {
      routeByRules: jest.fn(() =>
        route({
          intent: 'casual_chat',
          shouldSearch: false,
          replyStrategy: 'conversational_answer',
        }),
      ),
    };
    const service = new SocialAgentWorkflowRouterService(intentRouter as never);

    const decision = service.route({
      message: '那扩大到 10 公里，放宽舞蹈相关偏好',
      taskContext: {
        lastSearchEmptyReason: 'no_real_candidates',
        taskSlots: {
          activity: { value: '散步', state: 'completed' },
          time_window: { value: '今天晚上', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
        },
      },
      profile: {},
      conversationHistory: [],
      conversationIntent: 'conversation',
    });

    expect(decision).toMatchObject({
      reason: 'empty_candidate_recovery_workflow',
      skipBrain: true,
      route: {
        intent: 'social_search',
        shouldSearch: true,
        replyStrategy: 'search_candidates',
      },
    });
    expect(intentRouter.routeByRules).toHaveBeenCalledTimes(1);
  });

  it('routes publish requests with completed slots through the action workflow', () => {
    const intentRouter = {
      routeByRules: jest.fn(() =>
        route({
          intent: 'action_request',
          shouldSearch: false,
          shouldExecuteAction: true,
          replyStrategy: 'execute_action',
        }),
      ),
    };
    const service = new SocialAgentWorkflowRouterService(intentRouter as never);

    const decision = service.route({
      message: '那你帮我发布到发现',
      taskContext: {
        taskSlots: {
          activity: { value: '散步', state: 'completed' },
          time_window: { value: '今天晚上', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
        },
      },
      profile: {},
      conversationHistory: [],
      conversationIntent: 'social',
    });

    expect(decision).toMatchObject({
      reason: 'social_action_workflow',
      skipBrain: true,
      route: {
        intent: 'action_request',
        shouldExecuteAction: true,
        replyStrategy: 'execute_action',
      },
    });
    expect(intentRouter.routeByRules).toHaveBeenCalledTimes(1);
  });

  it('does not route empty-candidate recovery copy without an empty-candidate context', () => {
    const intentRouter = {
      routeByRules: jest.fn(() => route()),
    };
    const service = new SocialAgentWorkflowRouterService(intentRouter as never);

    expect(
      service.route({
        message: '扩大到 10 公里',
        taskContext: {
          taskSlots: {
            activity: { value: '散步', state: 'completed' },
          },
        },
        profile: {},
        conversationHistory: [],
        conversationIntent: 'conversation',
      }),
    ).toBeNull();
    expect(intentRouter.routeByRules).not.toHaveBeenCalled();
  });

  it('does not route short continuation turns without social workflow context', () => {
    const intentRouter = {
      routeByRules: jest.fn(() => route()),
    };
    const service = new SocialAgentWorkflowRouterService(intentRouter as never);

    expect(
      service.route({
        message: '可以，继续',
        taskContext: {},
        profile: {},
        conversationHistory: [],
        conversationIntent: 'conversation',
      }),
    ).toBeNull();
    expect(intentRouter.routeByRules).not.toHaveBeenCalled();
  });

  it('routes candidate message confirmations through the action workflow when pending actions exist', () => {
    const intentRouter = {
      routeByRules: jest.fn(() =>
        route({
          intent: 'casual_chat',
          shouldSearch: false,
          shouldExecuteAction: false,
          replyStrategy: 'conversational_answer',
        }),
      ),
    };
    const service = new SocialAgentWorkflowRouterService(intentRouter as never);

    const decision = service.route({
      message: '发送吧',
      taskContext: {
        pendingActions: [{ actionType: 'send_invite' }],
      },
      profile: {},
      conversationHistory: [],
      conversationIntent: 'conversation',
    });

    expect(decision).toMatchObject({
      reason: 'social_action_workflow',
      skipBrain: true,
      route: {
        intent: 'action_request',
        shouldSearch: false,
        shouldExecuteAction: true,
        replyStrategy: 'execute_action',
      },
    });
    expect(intentRouter.routeByRules).toHaveBeenCalledTimes(1);
  });

  it('does not route ordinary product or chat questions', () => {
    const intentRouter = {
      routeByRules: jest.fn(() =>
        route({
          intent: 'product_help',
          shouldSearch: false,
          replyStrategy: 'conversational_answer',
        }),
      ),
    };
    const service = new SocialAgentWorkflowRouterService(intentRouter as never);

    expect(
      service.route({
        message: '你都可以干什么',
        taskContext: {},
        profile: {},
        conversationHistory: [],
        conversationIntent: 'conversation',
      }),
    ).toBeNull();
    expect(intentRouter.routeByRules).not.toHaveBeenCalled();
  });
});
