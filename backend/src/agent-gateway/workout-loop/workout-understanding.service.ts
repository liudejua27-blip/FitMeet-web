import { Injectable, Optional } from '@nestjs/common';
import { z } from 'zod';

import { cleanDisplayText } from '../../common/display-text.util';
import type { AgentTask } from '../entities/agent-task.entity';
import type { FitMeetLoopRouterResult } from '../loop-router/fitmeet-loop-router.types';
import { SocialAgentToolJsonModelService } from '../social-agent-tool-json-model.service';
import type { WorkoutSlots } from './workout-loop.types';
import { validateWorkoutSlotsForPublish } from './workout-slot-extractor';

const WorkoutUnderstandingSchema = z.object({
  intent: z
    .enum(['workout', 'friend', 'travel', 'profile', 'casual', 'uncertain'])
    .catch('uncertain'),
  confidence: z.number().min(0).max(1).catch(0),
  activityType: z.string().optional(),
  timePreference: z.string().optional(),
  locationText: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  poiName: z.string().optional(),
  radiusKm: z.number().positive().max(200).optional(),
  intensity: z.string().optional(),
  candidatePreference: z.string().optional(),
  missing: z
    .array(z.enum(['activityType', 'timePreference', 'locationText', 'city']))
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
    return {
      activityType: this.text(understanding.activityType) || undefined,
      timePreference: this.text(understanding.timePreference) || undefined,
      locationText: this.text(understanding.locationText) || undefined,
      city: this.text(understanding.city) || undefined,
      district: this.text(understanding.district) || undefined,
      poiName: this.text(understanding.poiName) || undefined,
      radiusKm:
        typeof understanding.radiusKm === 'number'
          ? understanding.radiusKm
          : undefined,
      intensity: this.text(understanding.intensity) || undefined,
      candidatePreference:
        this.text(understanding.candidatePreference) || undefined,
    };
  }

  shouldCall(input: {
    slots: WorkoutSlots;
    loopIntent: FitMeetLoopRouterResult;
  }): boolean {
    if (input.loopIntent.disposition === 'needs_arbitration') return true;
    return !validateWorkoutSlotsForPublish(input.slots).valid;
  }

  private prompt(input: {
    task: AgentTask;
    message: string;
    ruleSlots: WorkoutSlots;
    loopIntent: FitMeetLoopRouterResult;
  }): string {
    return JSON.stringify({
      instruction:
        'Extract workout-loop intent and slots from the user message. Return only JSON. Do not execute actions, do not publish, do not default a city. If unsure, set needsClarification=true.',
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
        'locationText',
        'city',
        'district',
        'poiName',
        'radiusKm',
        'intensity',
        'candidatePreference',
        'missing',
        'assumptions',
        'needsClarification',
        'clarificationQuestion',
      ],
      userMessage: cleanDisplayText(input.message, ''),
      ruleSlots: input.ruleSlots,
      loopIntent: input.loopIntent,
      taskMemory: this.safeTaskMemory(input.task),
    });
  }

  private fallback(ruleSlots: WorkoutSlots): WorkoutUnderstandingResult {
    const validation = validateWorkoutSlotsForPublish(ruleSlots);
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
}
