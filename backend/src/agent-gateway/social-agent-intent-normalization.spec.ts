import {
  SocialAgentIntentRouterResult,
  SocialAgentIntentType,
} from './social-agent-intent-router.service';
import { normalizeDeepSeekIntentRouterResult } from './social-agent-intent-normalization';

function route(
  patch: Partial<SocialAgentIntentRouterResult> = {},
): SocialAgentIntentRouterResult {
  return {
    intent: 'unknown',
    confidence: 0.35,
    entities: {
      city: '青岛',
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

describe('social agent intent normalization', () => {
  it.each<SocialAgentIntentType>([
    'casual_chat',
    'product_help',
    'workflow_help',
    'profile_enrichment_request',
    'correction_or_clarification',
    'fitness_math',
    'unknown',
  ])(
    'clamps non-search intent %s to conversational no-side-effect output',
    (intent) => {
      const result = normalizeDeepSeekIntentRouterResult(
        {
          intent,
          confidence: 1.8,
          shouldSearch: true,
          shouldReplan: true,
          shouldUpdateProfile: true,
          shouldExecuteAction: true,
          replyStrategy: 'search_candidates',
        },
        route(),
      );

      expect(result).toMatchObject({
        intent,
        confidence: 1,
        shouldSearch: false,
        shouldReplan: false,
        shouldUpdateProfile: false,
        shouldExecuteAction: false,
        replyStrategy: 'conversational_answer',
        source: 'deepseek',
      });
    },
  );

  it('allows profile enrichment to update profile context without searching', () => {
    const result = normalizeDeepSeekIntentRouterResult(
      {
        intent: 'profile_enrichment',
        shouldSearch: true,
        shouldUpdateProfile: true,
        shouldExecuteAction: true,
        replyStrategy: 'search_candidates',
      },
      route(),
    );

    expect(result).toMatchObject({
      intent: 'profile_enrichment',
      shouldSearch: false,
      shouldReplan: false,
      shouldUpdateProfile: true,
      shouldExecuteAction: false,
      replyStrategy: 'conversational_answer',
    });
  });

  it('allows social-search flags and sanitizes partial entities', () => {
    const result = normalizeDeepSeekIntentRouterResult(
      {
        intent: 'social_search',
        confidence: '0.83',
        shouldSearch: true,
        shouldReplan: true,
        replyStrategy: 'execute_action',
        entities: {
          city: '青岛市',
          activityType: ' 跑步 ',
          timePreference: '今晚',
        },
      },
      route({
        entities: {
          city: '北京',
          activityType: '咖啡',
          targetGender: '女生',
          timePreference: '周末',
          locationPreference: '附近',
        },
      }),
    );

    expect(result).toMatchObject({
      intent: 'social_search',
      confidence: 0.83,
      shouldSearch: true,
      shouldReplan: true,
      shouldExecuteAction: false,
      replyStrategy: 'search_candidates',
      entities: {
        city: '青岛',
        activityType: '跑步',
        targetGender: '女生',
        timePreference: '今晚',
        locationPreference: '附近',
      },
    });
  });

  it('keeps candidate follow-up as direct reply when the model does not request search', () => {
    const result = normalizeDeepSeekIntentRouterResult(
      {
        intent: 'candidate_followup',
        shouldSearch: false,
        shouldReplan: true,
        replyStrategy: 'search_candidates',
      },
      route({
        intent: 'candidate_followup',
        replyStrategy: 'direct_reply',
      }),
    );

    expect(result).toMatchObject({
      intent: 'candidate_followup',
      shouldSearch: false,
      shouldReplan: false,
      replyStrategy: 'direct_reply',
    });
  });

  it('falls back invalid intent and confidence without trusting model flags', () => {
    const result = normalizeDeepSeekIntentRouterResult(
      {
        intent: 'delete_everything',
        confidence: 'not-a-number',
        shouldExecuteAction: true,
        replyStrategy: 'execute_action',
      },
      route({
        intent: 'product_help',
        confidence: 0.72,
        shouldSearch: false,
        shouldExecuteAction: false,
      }),
    );

    expect(result).toMatchObject({
      intent: 'product_help',
      confidence: 0.72,
      shouldSearch: false,
      shouldExecuteAction: false,
      replyStrategy: 'conversational_answer',
    });
  });
});
