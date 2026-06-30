import { Injectable, Optional } from '@nestjs/common';
import { z } from 'zod';

import { sanitizeCity } from '../../common/city.util';
import { cleanDisplayText } from '../../common/display-text.util';
import type { AgentTask } from '../entities/agent-task.entity';
import type {
  LoopSlotMeta,
  LoopSlotSource,
} from '../loop-agent/loop-agent.types';
import { SocialAgentToolJsonModelService } from '../social-agent-tool-json-model.service';
import type { FriendSlots } from './friend-loop.types';
import { validateFriendSlots } from './friend-slot-extractor';

type FriendSlotMetaKey = keyof NonNullable<FriendSlots['slotMeta']>;
type FriendTextSlotKey = Exclude<FriendSlotMetaKey, 'topicTags'>;

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
    const slotMeta = this.slotMetaFromUnderstanding({
      understanding,
      friendGoal: this.text(understanding.friendGoal),
      city,
      district,
      poiName,
      locationText,
      topicTags: this.stringList(understanding.topicTags),
      genderPreference: this.text(understanding.genderPreference),
      bodyPreference: this.text(understanding.bodyPreference),
      appearancePreference: this.text(understanding.appearancePreference),
      scenePreference: this.text(understanding.scenePreference),
      timePreference: this.text(understanding.timePreference),
      candidatePreference: this.text(understanding.candidatePreference),
    });
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
      slotMeta,
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
    const slotMeta: NonNullable<FriendSlots['slotMeta']> = {};
    const friendGoal = this.friendGoal(ruleSlots, llmSlots, slotMeta);
    const city = this.pickSlot(ruleSlots, llmSlots, 'city', slotMeta);
    const district = this.pickSlot(ruleSlots, llmSlots, 'district', slotMeta);
    const poiName = this.pickSlot(ruleSlots, llmSlots, 'poiName', slotMeta);
    const locationText = this.pickSlot(
      ruleSlots,
      llmSlots,
      'locationText',
      slotMeta,
    );
    const genderPreference = this.pickSlot(
      ruleSlots,
      llmSlots,
      'genderPreference',
      slotMeta,
    );
    const bodyPreference = this.pickSlot(
      ruleSlots,
      llmSlots,
      'bodyPreference',
      slotMeta,
    );
    const appearancePreference = this.pickSlot(
      ruleSlots,
      llmSlots,
      'appearancePreference',
      slotMeta,
    );
    const scenePreference = this.pickSlot(
      ruleSlots,
      llmSlots,
      'scenePreference',
      slotMeta,
    );
    const timePreference = this.pickSlot(
      ruleSlots,
      llmSlots,
      'timePreference',
      slotMeta,
    );
    const candidatePreference = this.pickSlot(
      ruleSlots,
      llmSlots,
      'candidatePreference',
      slotMeta,
    );
    if (topicTags.length > 0) {
      slotMeta.topicTags = {
        source: llmSlots.topicTags?.length ? 'llm' : 'rule',
        confidence: llmSlots.topicTags?.length ? 0.78 : 0.68,
      };
    }
    return {
      ...ruleSlots,
      friendGoal,
      city,
      district,
      poiName,
      locationText,
      topicTags,
      genderPreference,
      bodyPreference,
      appearancePreference,
      scenePreference,
      timePreference,
      candidatePreference,
      slotMeta: Object.keys(slotMeta).length > 0 ? slotMeta : undefined,
    };
  }

  private friendGoal(
    ruleSlots: FriendSlots,
    llmSlots: Partial<FriendSlots>,
    slotMeta?: NonNullable<FriendSlots['slotMeta']>,
  ): string | undefined {
    const ruleGoal = this.text(ruleSlots.friendGoal);
    const llmGoal = this.text(llmSlots.friendGoal);
    if (!ruleGoal) {
      if (llmGoal && slotMeta) {
        slotMeta.friendGoal = this.meta(llmSlots, 'friendGoal', 'llm', 0.78);
      }
      return llmGoal || undefined;
    }
    if (llmGoal && ruleGoal === '认识新朋友') {
      if (slotMeta) {
        slotMeta.friendGoal = this.meta(llmSlots, 'friendGoal', 'llm', 0.78);
      }
      return llmGoal;
    }
    if (slotMeta) {
      slotMeta.friendGoal = this.meta(ruleSlots, 'friendGoal', 'rule', 0.68);
    }
    return ruleGoal;
  }

  private pickSlot(
    ruleSlots: FriendSlots,
    llmSlots: Partial<FriendSlots>,
    key: FriendTextSlotKey,
    slotMeta: NonNullable<FriendSlots['slotMeta']>,
  ): string | undefined {
    const ruleValue = this.text((ruleSlots as Record<string, unknown>)[key]);
    const llmValue = this.text((llmSlots as Record<string, unknown>)[key]);
    if (!ruleValue && !llmValue) return undefined;
    const ruleMeta = this.meta(ruleSlots, key, 'rule', 0.68);
    const llmMeta = this.meta(llmSlots, key, 'llm', 0.78);
    const useLlm =
      Boolean(llmValue) &&
      (!ruleValue ||
        this.rank(llmMeta.source) > this.rank(ruleMeta.source) ||
        (this.rank(llmMeta.source) === this.rank(ruleMeta.source) &&
          llmMeta.confidence >= ruleMeta.confidence));
    if (useLlm) {
      slotMeta[key] = llmMeta;
      return llmValue;
    }
    slotMeta[key] = ruleMeta;
    return ruleValue;
  }

  private meta(
    slots: Partial<FriendSlots>,
    key: FriendSlotMetaKey,
    fallbackSource: LoopSlotSource,
    fallbackConfidence: number,
  ): LoopSlotMeta {
    return (
      slots.slotMeta?.[key] ?? {
        source: fallbackSource,
        confidence: fallbackConfidence,
      }
    );
  }

  private rank(source: LoopSlotSource) {
    switch (source) {
      case 'default':
        return 0;
      case 'memory':
        return 10;
      case 'rule':
        return 20;
      case 'llm':
        return 30;
      case 'geo':
        return 40;
      case 'user_confirmed':
        return 50;
      case 'user':
        return 60;
    }
  }

  private slotMetaFromUnderstanding(input: {
    understanding: FriendUnderstandingResult;
    friendGoal: string;
    city: string;
    district: string;
    poiName: string;
    locationText: string;
    topicTags: string[];
    genderPreference: string;
    bodyPreference: string;
    appearancePreference: string;
    scenePreference: string;
    timePreference: string;
    candidatePreference: string;
  }): FriendSlots['slotMeta'] {
    const confidence = input.understanding.confidence;
    const meta: FriendSlots['slotMeta'] = {};
    for (const key of [
      'friendGoal',
      'city',
      'district',
      'poiName',
      'locationText',
      'genderPreference',
      'bodyPreference',
      'appearancePreference',
      'scenePreference',
      'timePreference',
      'candidatePreference',
    ] as const) {
      if (input[key]) meta[key] = { source: 'llm', confidence };
    }
    if (input.topicTags.length > 0) {
      meta.topicTags = { source: 'llm', confidence };
    }
    return Object.keys(meta).length > 0 ? meta : undefined;
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
