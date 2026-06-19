import { z } from 'zod';

import {
  FITMEET_ALPHA_NEXT_AGENT_VALUES,
  type FitMeetAlphaNextAgent,
} from './fitmeet-alpha-agent-topology';

export const FitMeetAlphaStructuredIntentSchema = z.object({
  intent: z
    .enum([
      'complete_life_graph',
      'find_nearby_partner',
      'analyze_life_rhythm',
      'recommend_weekly_activity',
      'view_profile_changes',
      'fitness_math',
      'general_social_need',
      'blocked',
    ])
    .default('general_social_need'),
  activityType: z.string().default(''),
  locationText: z.string().default(''),
  timePreference: z.string().default(''),
  relationshipGoal: z.string().default(''),
  targetPeople: z.string().default(''),
  requiredConstraints: z.array(z.string()).default([]),
  optionalPreferences: z.array(z.string()).default([]),
  agentPlan: z.array(z.string()).default([]),
  betaScore: z.number().min(0).max(100).default(72),
  missingInformation: z.array(z.string()).default([]),
  safetyNotes: z.array(z.string()).default([]),
  needState: z
    .enum([
      'explicit_search',
      'ambiguous_companionship',
      'low_pressure_social',
      'profile_work',
      'activity_recommendation',
      'fitness_math',
      'safety_blocked',
    ])
    .default('explicit_search'),
  socialPressureLevel: z.enum(['low', 'medium', 'high']).default('medium'),
  readiness: z
    .enum(['clarify', 'search', 'answer', 'block', 'confirm'])
    .default('search'),
  clarifyingQuestion: z.string().default(''),
  requiresSearch: z.boolean().default(true),
  requiresSafetyBoundary: z.boolean().default(true),
  nextAgent: z.enum(FITMEET_ALPHA_NEXT_AGENT_VALUES).default('social_match'),
  requiresConfirmation: z.boolean().default(true),
});

export type FitMeetAlphaStructuredIntent = z.infer<
  typeof FitMeetAlphaStructuredIntentSchema
>;

export function normalizeFitMeetAlphaStructuredIntentOutput(input: {
  output: unknown;
  fallbackMessage: string;
  fallbackIntent: (message: string) => Record<string, unknown>;
}): Record<string, unknown> {
  const parsed = parseFitMeetAlphaStructuredIntent(input.output);
  if (parsed) return enforceFitMeetAlphaStructuredIntentHandoff(parsed);

  if (typeof input.output === 'string') {
    return {
      ...enforceFitMeetAlphaStructuredIntentHandoff(
        input.fallbackIntent(input.fallbackMessage),
      ),
      modelOutput: input.output.slice(0, 1000),
    };
  }
  return enforceFitMeetAlphaStructuredIntentHandoff(
    input.fallbackIntent(input.fallbackMessage),
  );
}

export function enforceFitMeetAlphaStructuredIntentHandoff(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const parsed = FitMeetAlphaStructuredIntentSchema.safeParse(value);
  const intent = parsed.success
    ? parsed.data
    : FitMeetAlphaStructuredIntentSchema.parse({});
  const nextAgent = nextAgentForStructuredIntent(intent);
  return {
    ...intent,
    nextAgent,
    ...sideEffectFlagsForStructuredIntent(intent),
  };
}

function parseFitMeetAlphaStructuredIntent(
  output: unknown,
): Record<string, unknown> | null {
  const parsed = FitMeetAlphaStructuredIntentSchema.safeParse(output);
  if (parsed.success) return parsed.data;
  if (typeof output !== 'string') return null;
  try {
    const json: unknown = JSON.parse(output);
    const jsonParsed = FitMeetAlphaStructuredIntentSchema.safeParse(json);
    return jsonParsed.success ? jsonParsed.data : null;
  } catch {
    return null;
  }
}

function nextAgentForStructuredIntent(
  intent: FitMeetAlphaStructuredIntent,
): FitMeetAlphaNextAgent {
  if (intent.intent === 'fitness_math') return 'math';
  if (intent.intent === 'blocked') return 'answer';
  if (
    intent.intent === 'complete_life_graph' ||
    intent.intent === 'analyze_life_rhythm' ||
    intent.intent === 'view_profile_changes'
  ) {
    return 'life_graph';
  }
  if (
    intent.intent === 'general_social_need' &&
    intent.requiresSearch === false &&
    intent.readiness === 'clarify'
  ) {
    return 'answer';
  }
  return 'social_match';
}

function sideEffectFlagsForStructuredIntent(
  intent: FitMeetAlphaStructuredIntent,
): Partial<FitMeetAlphaStructuredIntent> {
  if (intent.intent === 'fitness_math') {
    return {
      needState: 'fitness_math',
      readiness: 'answer',
      requiresSearch: false,
      requiresSafetyBoundary: false,
      requiresConfirmation: false,
    };
  }
  if (intent.intent === 'blocked') {
    return {
      needState: 'safety_blocked',
      readiness: 'block',
      requiresSearch: false,
      requiresSafetyBoundary: true,
      requiresConfirmation: true,
    };
  }
  if (
    intent.intent === 'complete_life_graph' ||
    intent.intent === 'analyze_life_rhythm' ||
    intent.intent === 'view_profile_changes'
  ) {
    return { requiresSearch: false };
  }
  return {};
}
