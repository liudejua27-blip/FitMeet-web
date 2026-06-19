import type { AgentTask } from './entities/agent-task.entity';
import type { FitMeetAlphaTurnDecision } from './fitmeet-alpha-agent.types';
import {
  shouldUseSocialAgentLlmDirectReply,
  socialAgentAlphaClarifyingMessage,
  socialAgentAlphaNeedsClarification,
  socialAgentAssistantMessageForRoute,
  socialAgentRouteAction,
} from './social-agent-route-response.presenter';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';

function route(
  patch: Partial<SocialAgentIntentRouterResult>,
): SocialAgentIntentRouterResult {
  return {
    intent: 'unknown',
    confidence: 0.8,
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
    replyStrategy: 'conversational_answer',
    source: 'rules',
    ...patch,
  };
}

describe('social-agent-route-response.presenter', () => {
  it('maps queued and reply-strategy routes to user-visible actions', () => {
    expect(
      socialAgentRouteAction(route({}), { runId: 'run-1' } as never, 'initial'),
    ).toBe('queue_search');
    expect(
      socialAgentRouteAction(
        route({}),
        { runId: 'run-2' } as never,
        'follow_up',
      ),
    ).toBe('queue_replan');
    expect(
      socialAgentRouteAction(
        route({ replyStrategy: 'ask_clarifying_question' }),
        null,
        null,
      ),
    ).toBe('clarify');
    expect(
      socialAgentRouteAction(
        route({ replyStrategy: 'execute_action' }),
        null,
        null,
      ),
    ).toBe('await_confirmation');
  });

  it('builds route fallback replies with or without search context', () => {
    const task = {
      id: 101,
      memory: {
        shortTerm: {
          candidates: [{ nickname: '小周', userId: 7 }],
        },
      },
    } as unknown as AgentTask;
    const candidateReply = socialAgentAssistantMessageForRoute({
      route: route({ intent: 'candidate_followup' }),
      task,
      message: '为什么推荐第一个',
    });
    expect(candidateReply).toContain('基于现有候选');

    const actionReply = socialAgentAssistantMessageForRoute({
      route: route({ intent: 'action_request' }),
      task: { id: 102, memory: {} } as unknown as AgentTask,
      message: '帮我发消息',
    });
    expect(actionReply).toContain('现在还没有候选人');
  });

  it('answers fitness math routes without triggering tools or memory writes', () => {
    const paceReply = socialAgentAssistantMessageForRoute({
      route: route({ intent: 'fitness_math' }),
      task: { id: 103, memory: {} } as unknown as AgentTask,
      message: '5公里30分钟配速是多少？',
    });

    expect(paceReply).toContain('平均配速约 6');
    expect(paceReply).toContain('不会写入你的画像');

    const calorieReply = socialAgentAssistantMessageForRoute({
      route: route({ intent: 'fitness_math' }),
      task: { id: 104, memory: {} } as unknown as AgentTask,
      message: '70kg 跑步 30分钟大概消耗多少热量',
    });

    expect(calorieReply).toContain('消耗约 291 千卡');
    expect(calorieReply).toContain('非医疗参考');
  });

  it('answers extended Math Agent calculations deterministically', () => {
    const bmiReply = socialAgentAssistantMessageForRoute({
      route: route({ intent: 'fitness_math' }),
      task: { id: 105, memory: {} } as unknown as AgentTask,
      message: '身高175cm，体重70kg，体重指数多少？',
    });

    expect(bmiReply).toContain('BMI 约 22.9');
    expect(bmiReply).toContain('正常区间');
    expect(bmiReply).toContain('不会写入你的画像');

    const heartRateReply = socialAgentAssistantMessageForRoute({
      route: route({ intent: 'fitness_math' }),
      task: { id: 106, memory: {} } as unknown as AgentTask,
      message: '30岁跑步心率区间怎么估算？',
    });

    expect(heartRateReply).toContain('最大心率约 190 次/分');
    expect(heartRateReply).toContain('有氧基础区约 114-133 次/分');
    expect(heartRateReply).toContain('非医疗参考');

    const trainingLoadReply = socialAgentAssistantMessageForRoute({
      route: route({ intent: 'fitness_math' }),
      task: { id: 107, memory: {} } as unknown as AgentTask,
      message: '每周跑3次，每次5公里，训练量是多少？',
    });

    expect(trainingLoadReply).toContain('每周总距离约 15 公里');
    expect(trainingLoadReply).toContain('不会创建活动或写入画像');
  });

  it('keeps direct LLM replies limited to conversational/help intents', () => {
    expect(
      shouldUseSocialAgentLlmDirectReply(route({ intent: 'casual_chat' })),
    ).toBe(true);
    expect(
      shouldUseSocialAgentLlmDirectReply(route({ intent: 'product_help' })),
    ).toBe(true);
    expect(
      shouldUseSocialAgentLlmDirectReply(route({ intent: 'social_search' })),
    ).toBe(false);
    expect(
      shouldUseSocialAgentLlmDirectReply(route({ intent: 'fitness_math' })),
    ).toBe(false);
  });

  it('detects Alpha clarification turns and applies tone policy copy', () => {
    const alphaTurn = {
      structuredIntent: {
        requiresSearch: false,
        readiness: 'clarify',
        clarifyingQuestion: '你更想今晚还是周末？',
      },
    } as unknown as FitMeetAlphaTurnDecision;

    expect(socialAgentAlphaNeedsClarification(alphaTurn)).toBe(true);
    expect(
      socialAgentAlphaClarifyingMessage(
        alphaTurn,
        (question) => `安全版：${question}`,
      ),
    ).toBe('安全版：你更想今晚还是周末？');
  });
});
