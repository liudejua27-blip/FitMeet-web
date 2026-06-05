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
    } as AgentTask;
    const candidateReply = socialAgentAssistantMessageForRoute({
      route: route({ intent: 'candidate_followup' }),
      task,
      message: '为什么推荐第一个',
    });
    expect(candidateReply).toContain('基于现有候选');

    const actionReply = socialAgentAssistantMessageForRoute({
      route: route({ intent: 'action_request' }),
      task: { id: 102, memory: {} } as AgentTask,
      message: '帮我发消息',
    });
    expect(actionReply).toContain('现在还没有候选人');
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
  });

  it('detects Alpha clarification turns and applies tone policy copy', () => {
    const alphaTurn = {
      structuredIntent: {
        requiresSearch: false,
        readiness: 'clarify',
        clarifyingQuestion: '你更想今晚还是周末？',
      },
    } as FitMeetAlphaTurnDecision;

    expect(socialAgentAlphaNeedsClarification(alphaTurn)).toBe(true);
    expect(
      socialAgentAlphaClarifyingMessage(
        alphaTurn,
        (question) => `安全版：${question}`,
      ),
    ).toBe('安全版：你更想今晚还是周末？');
  });
});
