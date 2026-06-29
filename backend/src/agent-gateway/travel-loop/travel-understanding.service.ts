import { Injectable, Optional } from '@nestjs/common';
import { z } from 'zod';

import { cleanDisplayText } from '../../common/display-text.util';
import type { AgentTask } from '../entities/agent-task.entity';
import { SocialAgentToolJsonModelService } from '../social-agent-tool-json-model.service';
import type { TravelSlots } from './travel-loop.types';
import { validateTravelSlots } from './travel-slot-extractor';

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
    return {
      destination: destination || undefined,
      city: city || undefined,
      district: district || undefined,
      poiName: poiName || undefined,
      departureTime: this.text(understanding.departureTime) || undefined,
      duration: this.text(understanding.duration) || undefined,
      budgetRange: this.text(understanding.budgetRange) || undefined,
      transportMode: this.text(understanding.transportMode) || undefined,
      tags: this.stringList(understanding.tags),
      genderPreference: this.text(understanding.genderPreference) || undefined,
      photoPreference: this.text(understanding.photoPreference) || undefined,
      accommodationPreference:
        this.text(understanding.accommodationPreference) || undefined,
      foodPreference: this.text(understanding.foodPreference) || undefined,
      candidatePreference:
        this.text(understanding.candidatePreference) || undefined,
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
    return {
      ...ruleSlots,
      destination: this.destination(ruleSlots, llmSlots, message),
      city: llmSlots.city || ruleSlots.city,
      district: llmSlots.district || ruleSlots.district,
      poiName: llmSlots.poiName || ruleSlots.poiName,
      departureTime: ruleSlots.departureTime || llmSlots.departureTime,
      duration: ruleSlots.duration || llmSlots.duration,
      budgetRange: ruleSlots.budgetRange || llmSlots.budgetRange,
      transportMode: ruleSlots.transportMode || llmSlots.transportMode,
      tags,
      genderPreference:
        llmSlots.genderPreference || ruleSlots.genderPreference || undefined,
      photoPreference:
        llmSlots.photoPreference || ruleSlots.photoPreference || undefined,
      accommodationPreference:
        llmSlots.accommodationPreference ||
        ruleSlots.accommodationPreference ||
        undefined,
      foodPreference:
        llmSlots.foodPreference || ruleSlots.foodPreference || undefined,
      candidatePreference:
        llmSlots.candidatePreference ||
        ruleSlots.candidatePreference ||
        undefined,
    };
  }

  private destination(
    ruleSlots: TravelSlots,
    llmSlots: Partial<TravelSlots>,
    message: string,
  ): string | undefined {
    const ruleDestination = this.text(ruleSlots.destination);
    const llmDestination = this.text(llmSlots.destination);
    if (!ruleDestination) return llmDestination || undefined;
    if (
      llmDestination &&
      llmDestination !== ruleDestination &&
      this.messageContainsDestinationAlias(message, ruleDestination)
    ) {
      return llmDestination;
    }
    return ruleDestination;
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
      taskMemory: this.safeTaskMemory(input.task ?? null),
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

  private safeTaskMemory(task: AgentTask | null): Record<string, unknown> {
    const memory =
      typeof task?.memory === 'object' &&
      task.memory !== null &&
      !Array.isArray(task.memory)
        ? (task.memory as Record<string, unknown>)
        : {};
    return {
      travelLoop: memory.travelLoop ?? null,
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
