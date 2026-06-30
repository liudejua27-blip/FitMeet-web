import { Injectable, Optional } from '@nestjs/common';
import { z } from 'zod';

import { cleanDisplayText } from '../../common/display-text.util';
import type { AgentTask } from '../entities/agent-task.entity';
import { buildLoopLlmContext } from '../loop-agent/loop-llm-context';
import type {
  LoopSlotMeta,
  LoopSlotSource,
} from '../loop-agent/loop-agent.types';
import { SocialAgentToolJsonModelService } from '../social-agent-tool-json-model.service';
import type { TravelSlots } from './travel-loop.types';
import { validateTravelSlots } from './travel-slot-extractor';

type TravelSlotMetaKey = keyof NonNullable<TravelSlots['slotMeta']>;
type TravelTextSlotKey = Exclude<TravelSlotMetaKey, 'tags'>;

const TravelLocationMentionSchema = z
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

const TravelUnderstandingSchema = z.object({
  intent: z
    .enum(['travel', 'workout', 'friend', 'profile', 'casual', 'uncertain'])
    .catch('uncertain'),
  confidence: z.number().min(0).max(1).catch(0),
  locationMention: TravelLocationMentionSchema,
  destination: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  poiName: z.string().optional(),
  departureTime: z.string().optional(),
  duration: z.string().optional(),
  budgetRange: z.string().optional(),
  transportMode: z.string().optional(),
  tags: z.array(z.string()).catch([]),
  genderPreference: z.string().optional(),
  photoPreference: z.string().optional(),
  accommodationPreference: z.string().optional(),
  foodPreference: z.string().optional(),
  candidatePreference: z.string().optional(),
  missing: z
    .array(
      z.enum(['destination', 'departureTime', 'budgetRange', 'transportMode']),
    )
    .catch([]),
  assumptions: z.array(z.string()).catch([]),
  needsClarification: z.boolean().catch(false),
  clarificationQuestion: z.string().optional(),
  source: z.string().optional(),
  fallbackReason: z.string().optional(),
});

export type TravelUnderstandingResult = z.infer<
  typeof TravelUnderstandingSchema
>;

@Injectable()
export class TravelUnderstandingService {
  constructor(
    @Optional()
    private readonly toolJson?: SocialAgentToolJsonModelService,
  ) {}

  async understand(input: {
    task?: AgentTask | null;
    message: string;
    ruleSlots: TravelSlots;
    signal?: AbortSignal | null;
  }): Promise<TravelUnderstandingResult> {
    const fallback = this.fallback(input.ruleSlots);
    if (!this.toolJson) return fallback;
    const raw = await this.toolJson.callJson({
      purpose: 'travel_understanding',
      taskId: input.task?.id ?? null,
      signal: input.signal ?? null,
      prompt: this.prompt(input),
      fallback: () => fallback,
    });
    return TravelUnderstandingSchema.parse(raw);
  }

  shouldCall(input: { message: string; slots: TravelSlots }): boolean {
    if (!validateTravelSlots(input.slots).valid) return true;
    return /蓉城|魔都|羊城|鹏城|帝都|山城|春城|鹭岛|周边|附近|小众|Citywalk|citywalk/.test(
      input.message,
    );
  }

  slotsFromUnderstanding(
    understanding: TravelUnderstandingResult | null | undefined,
  ): Partial<TravelSlots> {
    if (
      !understanding ||
      understanding.intent !== 'travel' ||
      understanding.confidence < 0.55
    ) {
      return {};
    }
    const locationMention = understanding.locationMention;
    const destination =
      this.text(locationMention?.normalizedText) ||
      this.text(locationMention?.rawText) ||
      this.text(understanding.destination);
    const city =
      this.text(locationMention?.cityHint) || this.text(understanding.city);
    const district =
      this.text(locationMention?.districtHint) ||
      this.text(understanding.district);
    const poiName =
      this.text(locationMention?.poiHint) || this.text(understanding.poiName);
    const tagList = this.stringList(understanding.tags);
    const slotMeta = this.slotMetaFromUnderstanding({
      understanding,
      destination,
      city,
      district,
      poiName,
      departureTime: this.text(understanding.departureTime),
      duration: this.text(understanding.duration),
      budgetRange: this.text(understanding.budgetRange),
      transportMode: this.text(understanding.transportMode),
      tags: tagList,
      genderPreference: this.text(understanding.genderPreference),
      photoPreference: this.text(understanding.photoPreference),
      accommodationPreference: this.text(understanding.accommodationPreference),
      foodPreference: this.text(understanding.foodPreference),
      candidatePreference: this.text(understanding.candidatePreference),
    });
    return {
      destination: destination || undefined,
      city: city || undefined,
      district: district || undefined,
      poiName: poiName || undefined,
      departureTime: this.text(understanding.departureTime) || undefined,
      duration: this.text(understanding.duration) || undefined,
      budgetRange: this.text(understanding.budgetRange) || undefined,
      transportMode: this.text(understanding.transportMode) || undefined,
      tags: tagList,
      genderPreference: this.text(understanding.genderPreference) || undefined,
      photoPreference: this.text(understanding.photoPreference) || undefined,
      accommodationPreference:
        this.text(understanding.accommodationPreference) || undefined,
      foodPreference: this.text(understanding.foodPreference) || undefined,
      candidatePreference:
        this.text(understanding.candidatePreference) || undefined,
      slotMeta,
    };
  }

  mergeSlots(
    ruleSlots: TravelSlots,
    llmSlots: Partial<TravelSlots>,
    message: string,
  ): TravelSlots {
    const tags = [...(ruleSlots.tags ?? []), ...(llmSlots.tags ?? [])]
      .map((item) => this.text(item))
      .filter(Boolean)
      .filter((item, index, array) => array.indexOf(item) === index)
      .slice(0, 8);
    const slotMeta: NonNullable<TravelSlots['slotMeta']> = {};
    const destination = this.destination(
      ruleSlots,
      llmSlots,
      message,
      slotMeta,
    );
    const city = this.pickSlot(ruleSlots, llmSlots, 'city', slotMeta);
    const district = this.pickSlot(ruleSlots, llmSlots, 'district', slotMeta);
    const poiName = this.pickSlot(ruleSlots, llmSlots, 'poiName', slotMeta);
    const departureTime = this.pickSlot(
      ruleSlots,
      llmSlots,
      'departureTime',
      slotMeta,
    );
    const duration = this.pickSlot(ruleSlots, llmSlots, 'duration', slotMeta);
    const budgetRange = this.pickSlot(
      ruleSlots,
      llmSlots,
      'budgetRange',
      slotMeta,
    );
    const transportMode = this.pickSlot(
      ruleSlots,
      llmSlots,
      'transportMode',
      slotMeta,
    );
    const genderPreference = this.pickSlot(
      ruleSlots,
      llmSlots,
      'genderPreference',
      slotMeta,
    );
    const photoPreference = this.pickSlot(
      ruleSlots,
      llmSlots,
      'photoPreference',
      slotMeta,
    );
    const accommodationPreference = this.pickSlot(
      ruleSlots,
      llmSlots,
      'accommodationPreference',
      slotMeta,
    );
    const foodPreference = this.pickSlot(
      ruleSlots,
      llmSlots,
      'foodPreference',
      slotMeta,
    );
    const candidatePreference = this.pickSlot(
      ruleSlots,
      llmSlots,
      'candidatePreference',
      slotMeta,
    );
    if (tags.length > 0) {
      slotMeta.tags = {
        source: llmSlots.tags?.length ? 'llm' : 'rule',
        confidence: llmSlots.tags?.length ? 0.78 : 0.68,
      };
    }
    return {
      ...ruleSlots,
      destination,
      city,
      district,
      poiName,
      departureTime,
      duration,
      budgetRange,
      transportMode,
      tags,
      genderPreference,
      photoPreference,
      accommodationPreference,
      foodPreference,
      candidatePreference,
      slotMeta: Object.keys(slotMeta).length > 0 ? slotMeta : undefined,
    };
  }

  private destination(
    ruleSlots: TravelSlots,
    llmSlots: Partial<TravelSlots>,
    message: string,
    slotMeta?: NonNullable<TravelSlots['slotMeta']>,
  ): string | undefined {
    const ruleDestination = this.text(ruleSlots.destination);
    const llmDestination = this.text(llmSlots.destination);
    if (!ruleDestination) {
      if (llmDestination && slotMeta) {
        slotMeta.destination = this.meta(llmSlots, 'destination', 'llm', 0.78);
      }
      return llmDestination || undefined;
    }
    const ruleMeta = this.meta(ruleSlots, 'destination', 'rule', 0.68);
    const llmMeta = this.meta(llmSlots, 'destination', 'llm', 0.78);
    if (
      llmDestination &&
      llmDestination !== ruleDestination &&
      this.messageContainsDestinationAlias(message, ruleDestination) &&
      this.rank(llmMeta.source) >= this.rank(ruleMeta.source)
    ) {
      if (slotMeta) {
        slotMeta.destination = llmMeta;
      }
      return llmDestination;
    }
    if (slotMeta) {
      slotMeta.destination = ruleMeta;
    }
    return ruleDestination;
  }

  private pickSlot(
    ruleSlots: TravelSlots,
    llmSlots: Partial<TravelSlots>,
    key: TravelTextSlotKey,
    slotMeta: NonNullable<TravelSlots['slotMeta']>,
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
    slots: Partial<TravelSlots>,
    key: TravelSlotMetaKey,
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
    understanding: TravelUnderstandingResult;
    destination: string;
    city: string;
    district: string;
    poiName: string;
    departureTime: string;
    duration: string;
    budgetRange: string;
    transportMode: string;
    tags: string[];
    genderPreference: string;
    photoPreference: string;
    accommodationPreference: string;
    foodPreference: string;
    candidatePreference: string;
  }): TravelSlots['slotMeta'] {
    const confidence = input.understanding.confidence;
    const meta: TravelSlots['slotMeta'] = {};
    for (const key of [
      'destination',
      'city',
      'district',
      'poiName',
      'departureTime',
      'duration',
      'budgetRange',
      'transportMode',
      'genderPreference',
      'photoPreference',
      'accommodationPreference',
      'foodPreference',
      'candidatePreference',
    ] as const) {
      if (input[key]) meta[key] = { source: 'llm', confidence };
    }
    if (input.tags.length > 0) {
      meta.tags = { source: 'llm', confidence };
    }
    return Object.keys(meta).length > 0 ? meta : undefined;
  }

  private messageContainsDestinationAlias(
    message: string,
    ruleDestination: string,
  ): boolean {
    const normalized = this.text(ruleDestination);
    return (
      /蓉城|魔都|羊城|鹏城|帝都|山城|春城|鹭岛/.test(message) ||
      ['蓉城', '魔都', '羊城', '鹏城', '帝都', '山城', '春城', '鹭岛'].includes(
        normalized,
      )
    );
  }

  private prompt(input: {
    task?: AgentTask | null;
    message: string;
    ruleSlots: TravelSlots;
  }): string {
    return JSON.stringify({
      instruction:
        'Extract travel-companion loop intent and slots from the user message. Return only JSON. Do not publish, match, send messages, save profile, or book anything. Put destination/place clues into locationMention; maps/geocoding will decide the true city/POI.',
      allowedIntentValues: [
        'travel',
        'workout',
        'friend',
        'profile',
        'casual',
        'uncertain',
      ],
      requiredOutputFields: [
        'intent',
        'confidence',
        'locationMention',
        'destination',
        'departureTime',
        'duration',
        'budgetRange',
        'transportMode',
        'tags',
        'genderPreference',
        'photoPreference',
        'accommodationPreference',
        'foodPreference',
        'candidatePreference',
        'missing',
        'assumptions',
        'needsClarification',
        'clarificationQuestion',
      ],
      userMessage: cleanDisplayText(input.message, ''),
      conversationContext: buildLoopLlmContext({
        task: input.task ?? null,
        message: input.message,
      }),
      locationMentionContract: {
        rawText: 'exact place words used by user, e.g. 西湖边 or 太古里',
        normalizedText: 'clean query for map lookup, e.g. 西湖 or 太古里',
        cityHint: 'only if user explicitly gave or strongly implied a city',
        districtHint:
          'only if user explicitly gave or strongly implied a district',
        poiHint: 'POI/landmark/scenic area clue',
        relation: ['near', 'inside', 'route', 'city_only', 'unknown'],
        needsGeoResolution: true,
      },
      ruleSlots: input.ruleSlots,
    });
  }

  private fallback(ruleSlots: TravelSlots): TravelUnderstandingResult {
    const validation = validateTravelSlots(ruleSlots);
    return {
      intent: 'uncertain',
      confidence: 0,
      tags: [],
      missing: validation.missing,
      assumptions: [],
      needsClarification: false,
      source: 'fallback',
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
