import { z } from 'zod';

const ShortText = z.string().trim().max(280);
const MediumText = z.string().trim().max(900);
const ShortList = z.array(ShortText).max(12);

export const SocialIntentOutputSchema = z
  .object({
    activityType: ShortText,
    tags: ShortList.max(8),
    summary: MediumText,
  })
  .strict();

export const SocialRequestOutputSchema = z
  .object({
    goal: MediumText,
    interestTags: ShortList.max(8),
    locationPreference: ShortText,
    personalityPreference: ShortText,
    suggestedTitle: ShortText,
  })
  .strict();

export const SocialRequestCardOutputSchema = z
  .object({
    title: ShortText.max(64),
    description: MediumText,
    interestTags: ShortList.min(1).max(8),
    locationPreference: ShortText,
    timePreference: ShortText,
    socialGoal: MediumText,
    personalityPreference: ShortList.max(8),
    riskNotes: ShortList.min(1).max(6),
    privacyNotes: ShortList.min(1).max(6),
  })
  .strict();

export const ProfileBuilderCardOutputSchema = z
  .object({
    basic: z
      .object({
        nickname: ShortText,
        city: ShortText,
        ageRange: ShortText,
        gender: ShortText,
        zodiac: ShortText,
      })
      .strict(),
    personality: z
      .object({
        mbti: ShortText,
        traits: ShortList,
        socialStyle: ShortText,
        communicationStyle: ShortText,
      })
      .strict(),
    interests: z
      .object({
        sports: ShortList,
        lifestyle: ShortList,
        socialScenes: ShortList,
      })
      .strict(),
    preferences: z
      .object({
        wantToMeet: ShortList,
        preferredTraits: ShortList,
        avoid: ShortList,
      })
      .strict(),
    relationshipIntent: z
      .object({
        goals: ShortList,
        openness: z.enum(['low', 'medium', 'high']).or(ShortText),
      })
      .strict(),
    availability: z
      .object({
        weekdays: ShortText,
        weekends: ShortText,
      })
      .strict(),
    visibility: z
      .object({
        profileDiscoverable: z.boolean(),
        agentCanRecommendMe: z.boolean(),
        agentCanStartChatAfterApproval: z.boolean(),
      })
      .strict(),
    matchSignals: z
      .object({
        publicTags: ShortList,
        privatePreferenceTags: ShortList,
        sensitivePrivateTags: ShortList,
        matchKeywords: z.array(ShortText).max(30),
        confidence: z.number().min(0).max(1),
        source: ShortText,
      })
      .strict(),
    summary: MediumText,
  })
  .strict();

export const CandidateMatchContentOutputSchema = z
  .object({
    recommendationReasons: ShortList.min(1).max(4),
    icebreakerMessage: ShortText.max(120),
    riskWarnings: ShortList.min(1).max(4),
  })
  .strict();

export type AiOutputGuardResult<T> = {
  raw: unknown;
  parsed: T | null;
  schemaValid: boolean;
  invariantFailure: string | null;
};

export function parseModelJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    return null;
  }
}

export function validateModelJson<T>(
  raw: string | null | undefined,
  schema: z.ZodType<T>,
): AiOutputGuardResult<T> {
  const json = parseModelJson(raw);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      raw: json,
      parsed: null,
      schemaValid: false,
      invariantFailure: null,
    };
  }
  const invariantFailure = aiBusinessInvariantFailure(parsed.data);
  return {
    raw: json,
    parsed: parsed.data,
    schemaValid: true,
    invariantFailure,
  };
}

export function aiBusinessInvariantFailure(value: unknown): string | null {
  const text = JSON.stringify(value ?? '');
  if (/1[3-9]\d{9}/.test(text)) return 'phone_number_leaked';
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) {
    return 'email_leaked';
  }
  if (/(微信|wechat|wx)[:：\s]*[a-zA-Z][\w-]{5,}/i.test(text)) {
    return 'wechat_id_leaked';
  }
  if (/QQ[:：\s]*\d{5,}/i.test(text)) return 'qq_id_leaked';
  if (/\d{1,4}\s*(号楼|栋|单元|室|门牌)/.test(text)) {
    return 'precise_address_leaked';
  }
  if (
    /(已发布|发布成功|已经发布|已匹配|匹配成功|已经匹配|消息已发送|已加好友|加好友成功)/.test(
      text,
    )
  ) {
    return 'state_fact_claimed_by_model';
  }
  return null;
}
