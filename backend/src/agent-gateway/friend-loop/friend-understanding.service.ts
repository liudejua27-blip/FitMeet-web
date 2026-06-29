import { Injectable, Optional } from '@nestjs/common';
import { z } from 'zod';

import { sanitizeCity } from '../../common/city.util';
import { cleanDisplayText } from '../../common/display-text.util';
import type { AgentTask } from '../entities/agent-task.entity';
import { SocialAgentToolJsonModelService } from '../social-agent-tool-json-model.service';
import type { FriendSlots } from './friend-loop.types';
import { validateFriendSlots } from './friend-slot-extractor';

const FriendLocationMentionSchema = z
  .object({
    rawText: z.string().optional(),
    normalizedText: z.string().optional(),
    cityHint: z.string().optional(),
    districtHint: z.string().optional(),
    poiHint: z.string().optional(),
    relation: z
      .enum(['near', 'inside', 'route', 'city_only', 'unknown'])
      .optional(),
    needsGeoResolution: z.boolean().catch(true),
  })
  .optional();

const FriendUnderstandingSchema = z.object({
  intent: z
    .enum(['friend', 'workout', 'travel', 'profile', 'casual', 'uncertain'])
    .catch('uncertain'),
  confidence: z.number().min(0).max(1).catch(0),
  friendGoal: z.string().optional(),
  locationMention: FriendLocationMentionSchema,
  city: z.string().optional(),
  district: z.string().optional(),
  poiName: z.string().optional(),
  locationText: z.string().optional(),
  topicTags: z.array(z.string()).catch([]),
  genderPreference: z.string().optional(),
  bodyPreference: z.string().optional(),
  appearancePreference: z.string().optional(),
  scenePreference: z.string().optional(),
  timePreference: z.string().optional(),
  candidatePreference: z.string().optional(),
  missing: z
    .array(
      z.enum([
        'friendGoal',
        'locationText',
        'topicTags',
        'genderPreference',
        'bodyPreference',
        'appearancePreference',
      ]),
    )
    .catch([]),
  assumptions: z.array(z.string()).catch([]),
  needsClarification: z.boolean().catch(false),
  clarificationQuestion: z.string().optional(),
  source: z.string().optional(),
  fallbackReason: z.string().optional(),
});

export type FriendUnderstandingResult = z.infer<
  typeof FriendUnderstandingSchema
>;

@Injectable()
export class FriendUnderstandingService {
  constructor(
    @Optional()
    private readonly toolJson?: SocialAgentToolJsonModelService,
  ) {}

  async understand(input: {
    task?: AgentTask | null;
    message: string;
    ruleSlots: FriendSlots;
    signal?: AbortSignal | null;
  }): Promise<FriendUnderstandingResult> {
    const fallback = this.fallback(input.ruleSlots);
    if (!this.toolJson) return fallback;
    const raw = await this.toolJson.callJson({
      purpose: 'friend_understanding',
      taskId: input.task?.id ?? null,
      signal: input.signal ?? null,
      prompt: this.prompt(input),
      fallback: () => fallback,
    });
    return FriendUnderstandingSchema.parse(raw);
  }

  shouldCall(input: { message: string; slots: FriendSlots }): boolean {
    if (!validateFriendSlots(input.slots).valid) return true;
    return /魔都|帝都|羊城|鹏城|山城|蓉城|同城|附近|学校|公司|校友|同行/.test(
      input.message,
    );
  }

  slotsFromUnderstanding(
    understanding: FriendUnderstandingResult | null | undefined,
  ): Partial<FriendSlots> {
    if (
      !understanding ||
      understanding.intent !== 'friend' ||
      understanding.confidence < 0.55
    ) {
      return {};
    }
    const locationMention = understanding.locationMention;
    const locationText =
      this.text(locationMention?.normalizedText) ||
      this.text(locationMention?.rawText) ||
      this.text(understanding.locationText);
    const city =
      this.text(locationMention?.cityHint) || this.text(understanding.city);
    const district =
      this.text(locationMention?.districtHint) ||
      this.text(understanding.district);
    const poiName =
      this.text(locationMention?.poiHint) || this.text(understanding.poiName);
    return {
      friendGoal: this.text(understanding.friendGoal) || undefined,
      city: sanitizeCity(city) ?? undefined,
      district: district || undefined,
      poiName: poiName || undefined,
      locationText: locationText || undefined,
      topicTags: this.stringList(understanding.topicTags),
      genderPreference: this.text(understanding.genderPreference) || undefined,
      bodyPreference: this.text(understanding.bodyPreference) || undefined,
      appearancePreference:
        this.text(understanding.appearancePreference) || undefined,
      scenePreference: this.text(understanding.scenePreference) || undefined,
      timePreference: this.text(understanding.timePreference) || undefined,
      candidatePreference:
        this.text(understanding.candidatePreference) || undefined,
    };
  }

  mergeSlots(
    ruleSlots: FriendSlots,
    llmSlots: Partial<FriendSlots>,
  ): FriendSlots {
    const topicTags = [
      ...(ruleSlots.topicTags ?? []),
      ...(llmSlots.topicTags ?? []),
    ]
      .map((item) => this.text(item))
      .filter(Boolean)
      .filter((item, index, array) => array.indexOf(item) === index)
      .slice(0, 8);
    return {
      ...ruleSlots,
      friendGoal: this.friendGoal(ruleSlots, llmSlots),
      city: llmSlots.city || ruleSlots.city,
      district: llmSlots.district || ruleSlots.district,
      poiName: llmSlots.poiName || ruleSlots.poiName,
      locationText: llmSlots.locationText || ruleSlots.locationText,
      topicTags,
      genderPreference:
        llmSlots.genderPreference || ruleSlots.genderPreference || undefined,
      bodyPreference:
        llmSlots.bodyPreference || ruleSlots.bodyPreference || undefined,
      appearancePreference:
        llmSlots.appearancePreference ||
        ruleSlots.appearancePreference ||
        undefined,
      scenePreference:
        llmSlots.scenePreference || ruleSlots.scenePreference || undefined,
      timePreference:
        ruleSlots.timePreference || llmSlots.timePreference || undefined,
      candidatePreference:
        llmSlots.candidatePreference ||
        ruleSlots.candidatePreference ||
        undefined,
    };
  }

  private friendGoal(
    ruleSlots: FriendSlots,
    llmSlots: Partial<FriendSlots>,
  ): string | undefined {
    const ruleGoal = this.text(ruleSlots.friendGoal);
    const llmGoal = this.text(llmSlots.friendGoal);
    if (!ruleGoal) return llmGoal || undefined;
    if (llmGoal && ruleGoal === '认识新朋友') return llmGoal;
    return ruleGoal;
  }

  private prompt(input: {
    task?: AgentTask | null;
    message: string;
    ruleSlots: FriendSlots;
  }): string {
    return JSON.stringify({
      instruction:
        'Extract friend-loop intent and slots from the user message. Return only JSON. Do not publish, match, send messages, save profile, or make contact decisions. Put location clues into locationMention; maps/geocoding will decide the true city/POI.',
      allowedIntentValues: [
        'friend',
        'workout',
        'travel',
        'profile',
        'casual',
        'uncertain',
      ],
      requiredOutputFields: [
        'intent',
        'confidence',
        'friendGoal',
        'locationMention',
        'topicTags',
        'genderPreference',
        'bodyPreference',
        'appearancePreference',
        'scenePreference',
        'timePreference',
        'candidatePreference',
        'missing',
        'assumptions',
        'needsClarification',
        'clarificationQuestion',
      ],
      userMessage: cleanDisplayText(input.message, ''),
      locationMentionContract: {
        rawText: 'exact location words used by user, e.g. 华师大附近',
        normalizedText: 'clean query for map lookup, e.g. 华师大',
        cityHint: 'only if user explicitly gave or strongly implied a city',
        districtHint:
          'only if user explicitly gave or strongly implied a district',
        poiHint: 'POI/school/mall/landmark clue',
        relation: ['near', 'inside', 'route', 'city_only', 'unknown'],
        needsGeoResolution: true,
      },
      ruleSlots: input.ruleSlots,
      taskMemory: this.safeTaskMemory(input.task ?? null),
    });
  }

  private fallback(ruleSlots: FriendSlots): FriendUnderstandingResult {
    const validation = validateFriendSlots(ruleSlots);
    return {
      intent: 'uncertain',
      confidence: 0,
      topicTags: [],
      missing: validation.missing,
      assumptions: [],
      needsClarification: false,
      source: 'fallback',
    };
  }

  private safeTaskMemory(task: AgentTask | null): Record<string, unknown> {
    const memory =
      typeof task?.memory === 'object' &&
      task.memory !== null &&
      !Array.isArray(task.memory)
        ? (task.memory as Record<string, unknown>)
        : {};
    return {
      friendLoop: memory.friendLoop ?? null,
      taskSlots: memory.taskSlots ?? null,
    };
  }

  private text(value: unknown): string {
    return cleanDisplayText(value, '').trim();
  }

  private stringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => this.text(item))
      .filter(Boolean)
      .slice(0, 8);
  }
}
