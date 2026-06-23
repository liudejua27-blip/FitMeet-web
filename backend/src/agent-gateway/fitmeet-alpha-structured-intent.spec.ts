import {
  enforceFitMeetAlphaStructuredIntentHandoff,
  normalizeFitMeetAlphaStructuredIntentOutput,
} from './fitmeet-alpha-structured-intent';

describe('FitMeet Alpha structured intent normalization', () => {
  it('clamps fitness math to Agent Brain with no side effects', () => {
    const intent = enforceFitMeetAlphaStructuredIntentHandoff({
      intent: 'fitness_math',
      nextAgent: 'social_match',
      readiness: 'search',
      requiresSearch: true,
      requiresSafetyBoundary: true,
      requiresConfirmation: true,
    });

    expect(intent).toMatchObject({
      intent: 'fitness_math',
      nextAgent: 'agent_brain',
      needState: 'fitness_math',
      readiness: 'answer',
      requiresSearch: false,
      requiresSafetyBoundary: false,
      requiresConfirmation: false,
    });
  });

  it('routes Life Graph intents only to the Life Graph Agent', () => {
    for (const intentName of [
      'complete_life_graph',
      'analyze_life_rhythm',
      'view_profile_changes',
    ]) {
      expect(
        enforceFitMeetAlphaStructuredIntentHandoff({
          intent: intentName,
          nextAgent: 'social_match',
          requiresSearch: true,
        }),
      ).toMatchObject({
        intent: intentName,
        nextAgent: 'life_graph_agent',
        requiresSearch: false,
      });
    }
  });

  it('keeps vague low-pressure social needs with Main Agent clarification', () => {
    const intent = enforceFitMeetAlphaStructuredIntentHandoff({
      intent: 'general_social_need',
      nextAgent: 'social_match',
      readiness: 'clarify',
      requiresSearch: false,
      clarifyingQuestion: '你更想今晚还是周末？',
    });

    expect(intent).toMatchObject({
      intent: 'general_social_need',
      nextAgent: 'main_agent',
      readiness: 'clarify',
      requiresSearch: false,
    });
  });

  it('normalizes model JSON strings and records unparseable output on fallback', () => {
    const fromJson = normalizeFitMeetAlphaStructuredIntentOutput({
      output: JSON.stringify({
        intent: 'view_profile_changes',
        nextAgent: 'social_match',
      }),
      fallbackMessage: '查看画像变化',
      fallbackIntent: () => ({ intent: 'find_nearby_partner' }),
    });

    expect(fromJson).toMatchObject({
      intent: 'view_profile_changes',
      nextAgent: 'life_graph_agent',
    });

    const fallback = normalizeFitMeetAlphaStructuredIntentOutput({
      output: 'not-json-model-output',
      fallbackMessage: '5公里30分钟配速是多少',
      fallbackIntent: () => ({
        intent: 'fitness_math',
        nextAgent: 'social_match',
      }),
    });

    expect(fallback).toMatchObject({
      intent: 'fitness_math',
      nextAgent: 'agent_brain',
      modelOutput: 'not-json-model-output',
    });
  });

  it('accepts old model nextAgent names but normalizes to the 3-agent topology', () => {
    expect(
      enforceFitMeetAlphaStructuredIntentHandoff({
        intent: 'recommend_weekly_activity',
        nextAgent: 'meet_loop',
      }),
    ).toMatchObject({
      intent: 'recommend_weekly_activity',
      nextAgent: 'match_agent',
    });
  });
});
