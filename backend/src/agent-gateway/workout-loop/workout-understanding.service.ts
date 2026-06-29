import { Injectable, Optional } from '@nestjs/common';
import { z } from 'zod';

import { cleanDisplayText } from '../../common/display-text.util';
import type { AgentTask } from '../entities/agent-task.entity';
import type { FitMeetLoopRouterResult } from '../loop-router/fitmeet-loop-router.types';
import { SocialAgentToolJsonModelService } from '../social-agent-tool-json-model.service';
import type { WorkoutSlots } from './workout-loop.types';
import { validateWorkoutSlotsForDraft } from './workout-slot-extractor';

const WorkoutLocationMentionSchema = z
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

const WorkoutUnderstandingSchema = z.object({
  intent: z
    .enum(['workout', 'friend', 'travel', 'profile', 'casual', 'uncertain'])
    .catch('uncertain'),
  confidence: z.number().min(0).max(1).catch(0),
  activityType: z.string().optional(),
  timePreference: z.string().optional(),
  locationMention: WorkoutLocationMentionSchema,
  locationText: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  poiName: z.string().optional(),
  radiusKm: z.number().positive().max(200).optional(),
  intensity: z.string().optional(),
  candidatePreference: z.string().optional(),
  missing: z
    .array(
      z.enum([
        'activityType',
        'timePreference',
        'locationText',
        'locationMention',
        'city',
      ]),
    )
    .catch([]),
  assumptions: z.array(z.string()).catch([]),
  needsClarification: z.boolean().catch(false),
  clarificationQuestion: z.string().optional(),
  source: z.string().optional(),
  fallbackReason: z.string().optional(),
});

export type WorkoutUnderstandingResult = z.infer<
  typeof WorkoutUnderstandingSchema
>;

@Injectable()
export class WorkoutUnderstandingService {
  constructor(
    @Optional()
    private readonly toolJson?: SocialAgentToolJsonModelService,
  ) {}

  async understand(input: {
    task: AgentTask;
    message: string;
    ruleSlots: WorkoutSlots;
    loopIntent: FitMeetLoopRouterResult;
    signal?: AbortSignal | null;
  }): Promise<WorkoutUnderstandingResult> {
    const fallback = this.fallback(input.ruleSlots);
    if (!this.toolJson) return fallback;
    const raw = await this.toolJson.callJson({
      purpose: 'workout_understanding',
      taskId: input.task.id,
      signal: input.signal ?? null,
      prompt: this.prompt(input),
      fallback: () => fallback,
    });
    return WorkoutUnderstandingSchema.parse(raw);
  }

  slotsFromUnderstanding(
    understanding: WorkoutUnderstandingResult | null | undefined,
  ): Partial<WorkoutSlots> {
    if (!understanding || understanding.intent !== 'workout') return {};
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
      locationText,
      city,
      district,
      poiName,
    });
    return {
      activityType: this.text(understanding.activityType) || undefined,
      timePreference: this.text(understanding.timePreference) || undefined,
      locationText: locationText || undefined,
      city: city || undefined,
      district: district || undefined,
      poiName: poiName || undefined,
      radiusKm:
        typeof understanding.radiusKm === 'number'
          ? understanding.radiusKm
          : undefined,
      intensity: this.text(understanding.intensity) || undefined,
      candidatePreference:
        this.text(understanding.candidatePreference) || undefined,
      slotMeta,
    };
  }

  shouldCall(input: {
    slots: WorkoutSlots;
    loopIntent: FitMeetLoopRouterResult;
  }): boolean {
    if (input.loopIntent.disposition === 'needs_arbitration') return true;
    if (!validateWorkoutSlotsForDraft(input.slots).valid) return true;
    if (input.slots.geoResolution?.needsConfirmation) return true;
    return Boolean(input.slots.locationText && !input.slots.city);
  }

  private prompt(input: {
    task: AgentTask;
    message: string;
    ruleSlots: WorkoutSlots;
    loopIntent: FitMeetLoopRouterResult;
  }): string {
    return JSON.stringify({
      instruction:
        'Extract workout-loop intent and slots from the user message. Return only JSON. Do not execute actions, do not publish, do not default a city. Put location clues into locationMention; maps/geocoding will decide the true city/POI. If unsure, set needsClarification=true.',
      allowedIntentValues: [
        'workout',
        'friend',
        'travel',
        'profile',
        'casual',
        'uncertain',
      ],
      requiredOutputFields: [
        'intent',
        'confidence',
        'activityType',
        'timePreference',
        'locationMention',
        'radiusKm',
        'intensity',
        'candidatePreference',
        'missing',
        'assumptions',
        'needsClarification',
        'clarificationQuestion',
      ],
      userMessage: cleanDisplayText(input.message, ''),
      locationMentionContract: {
        rawText: 'exact words used by user, e.g. 华师大附近',
        normalizedText: 'clean query for map lookup, e.g. 华师大',
        cityHint: 'only if user explicitly gave or strongly implied a city',
        districtHint:
          'only if user explicitly gave or strongly implied a district',
        poiHint: 'POI/school/mall/landmark clue',
        relation: ['near', 'inside', 'route', 'city_only', 'unknown'],
        needsGeoResolution: true,
      },
      ruleSlots: input.ruleSlots,
      loopIntent: input.loopIntent,
      taskMemory: this.safeTaskMemory(input.task),
    });
  }

  private fallback(ruleSlots: WorkoutSlots): WorkoutUnderstandingResult {
    const validation = validateWorkoutSlotsForDraft(ruleSlots);
    return {
      intent: 'uncertain',
      confidence: 0,
      missing: validation.missing,
      assumptions: [],
      needsClarification: false,
      source: 'fallback',
    };
  }

  private safeTaskMemory(task: AgentTask): Record<string, unknown> {
    const memory =
      typeof task.memory === 'object' &&
      task.memory !== null &&
      !Array.isArray(task.memory)
        ? (task.memory as Record<string, unknown>)
        : {};
    return {
      workoutLoop: memory.workoutLoop ?? null,
      taskSlots: memory.taskSlots ?? null,
    };
  }

  private text(value: unknown): string {
    return cleanDisplayText(value, '').trim();
  }

  private slotMetaFromUnderstanding(input: {
    understanding: WorkoutUnderstandingResult;
    locationText: string;
    city: string;
    district: string;
    poiName: string;
  }): WorkoutSlots['slotMeta'] {
    const confidence = input.understanding.confidence;
    const meta: WorkoutSlots['slotMeta'] = {};
    if (this.text(input.understanding.activityType)) {
      meta.activityType = { source: 'llm', confidence };
    }
    if (this.text(input.understanding.timePreference)) {
      meta.timePreference = { source: 'llm', confidence };
    }
    if (input.locationText) {
      meta.locationText = { source: 'llm', confidence };
    }
    if (input.city) {
      meta.city = { source: 'llm', confidence };
    }
    if (input.district) {
      meta.district = { source: 'llm', confidence };
    }
    if (input.poiName) {
      meta.poiName = { source: 'llm', confidence };
    }
    if (typeof input.understanding.radiusKm === 'number') {
      meta.radiusKm = { source: 'llm', confidence };
    }
    if (this.text(input.understanding.intensity)) {
      meta.intensity = { source: 'llm', confidence };
    }
    if (this.text(input.understanding.candidatePreference)) {
      meta.candidatePreference = { source: 'llm', confidence };
    }
    return meta;
  }
}
