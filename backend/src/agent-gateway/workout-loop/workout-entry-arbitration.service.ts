import { Injectable, Optional } from '@nestjs/common';

import type { AgentTask } from '../entities/agent-task.entity';
import { GeoResolverService } from '../geo/geo-resolver.service';
import type { FitMeetLoopRouterResult } from '../loop-router/fitmeet-loop-router.types';
import type { WorkoutSlots } from './workout-loop.types';
import { mergeWorkoutSlotsBySource } from './workout-slot-merge';
import { extractWorkoutSlots } from './workout-slot-extractor';
import {
  WorkoutUnderstandingService,
  type WorkoutUnderstandingResult,
} from './workout-understanding.service';

export type WorkoutEntryArbitrationVerdict =
  | 'accept_workout_loop'
  | 'ask_clarification'
  | 'handoff_legacy';

export type WorkoutEntryArbitrationResult = {
  verdict: WorkoutEntryArbitrationVerdict;
  understanding: WorkoutUnderstandingResult | null;
  slots: WorkoutSlots;
  reason: string;
};

@Injectable()
export class WorkoutEntryArbitrationService {
  constructor(
    @Optional()
    private readonly understanding?: WorkoutUnderstandingService,
    @Optional()
    private readonly geoResolver?: GeoResolverService,
  ) {}

  async arbitrate(input: {
    task: AgentTask;
    message: string;
    loopIntent: FitMeetLoopRouterResult;
    signal?: AbortSignal | null;
  }): Promise<WorkoutEntryArbitrationResult> {
    const memorySlots = this.readWorkoutSlots(input.task);
    const ruleSlots = this.withGeo(
      extractWorkoutSlots({
        message: input.message,
        previousSlots: memorySlots,
      }),
      input.message,
    );
    const understanding = this.understanding
      ? await this.understanding.understand({
          task: input.task,
          message: input.message,
          ruleSlots,
          loopIntent: input.loopIntent,
          signal: input.signal ?? null,
        })
      : null;
    const llmSlots = this.understanding?.slotsFromUnderstanding(understanding);
    const slots = this.withGeo(
      this.mergeSlots({
        memorySlots,
        ruleSlots,
        llmSlots,
        llmConfidence: understanding?.confidence,
      }),
      input.message,
    );

    if (
      understanding?.intent === 'workout' &&
      understanding.confidence >= 0.78 &&
      !understanding.needsClarification
    ) {
      return {
        verdict: 'accept_workout_loop',
        understanding,
        slots,
        reason: 'workout_understanding_high_confidence',
      };
    }

    if (this.shouldAskClarification(slots, understanding)) {
      return {
        verdict: 'ask_clarification',
        understanding,
        slots,
        reason:
          !understanding || understanding.source === 'fallback'
            ? 'workout_rule_geo_clarification'
            : 'workout_understanding_needs_clarification',
      };
    }

    return {
      verdict: 'handoff_legacy',
      understanding,
      slots,
      reason: 'workout_arbitration_not_confident',
    };
  }

  private shouldAskClarification(
    slots: WorkoutSlots,
    understanding: WorkoutUnderstandingResult | null,
  ): boolean {
    if (
      understanding?.intent === 'workout' &&
      understanding.confidence >= 0.55
    ) {
      return true;
    }
    return Boolean(
      slots.activityType &&
      slots.timePreference &&
      slots.locationText &&
      (slots.city || slots.geoResolution?.needsConfirmation),
    );
  }

  private withGeo(slots: WorkoutSlots, message: string): WorkoutSlots {
    if (!this.geoResolver) return slots;
    const alreadyResolvedBySystem =
      slots.geoResolution &&
      slots.geoResolution.source !== 'explicit_city' &&
      slots.geoResolution.source !== 'user_confirmed';
    const geo = this.geoResolver.resolve({
      message,
      locationText: slots.locationText,
      city: alreadyResolvedBySystem ? undefined : slots.city,
      district: slots.district,
      poiName: slots.poiName,
      userConfirmed: slots.geoResolution?.source === 'user_confirmed',
    });
    return mergeWorkoutSlotsBySource([
      {
        slots,
        fallbackSource: 'memory',
        fallbackConfidence: 0.5,
      },
      {
        slots: {
          locationText: geo.locationText,
          city: geo.city,
          district: geo.district,
          poiName: geo.poiName,
          lat: geo.lat,
          lng: geo.lng,
          geoResolution: geo,
        },
        fallbackSource: 'geo',
        fallbackConfidence: geo.confidence,
      },
    ]);
  }

  private mergeSlots(input: {
    memorySlots?: WorkoutSlots;
    ruleSlots?: WorkoutSlots;
    llmSlots?: Partial<WorkoutSlots>;
    llmConfidence?: number;
  }): WorkoutSlots {
    return mergeWorkoutSlotsBySource([
      {
        slots: this.compactSlots(input.memorySlots ?? {}),
        fallbackSource: 'memory',
        fallbackConfidence: 0.5,
      },
      {
        slots: this.compactSlots(input.ruleSlots ?? {}),
        fallbackSource: 'rule',
        fallbackConfidence: 0.68,
      },
      {
        slots: this.compactSlots(input.llmSlots ?? {}),
        fallbackSource: 'llm',
        fallbackConfidence: input.llmConfidence ?? 0.78,
      },
    ]);
  }

  private compactSlots(slots: Partial<WorkoutSlots>): Partial<WorkoutSlots> {
    return Object.fromEntries(
      Object.entries(slots).filter(([, value]) => value !== undefined),
    ) as Partial<WorkoutSlots>;
  }

  private readWorkoutSlots(task: AgentTask): WorkoutSlots {
    const memory =
      typeof task.memory === 'object' &&
      task.memory !== null &&
      !Array.isArray(task.memory)
        ? (task.memory as Record<string, unknown>)
        : {};
    const workoutLoop =
      typeof memory.workoutLoop === 'object' &&
      memory.workoutLoop !== null &&
      !Array.isArray(memory.workoutLoop)
        ? (memory.workoutLoop as Record<string, unknown>)
        : {};
    const slots =
      typeof workoutLoop.slots === 'object' &&
      workoutLoop.slots !== null &&
      !Array.isArray(workoutLoop.slots)
        ? (workoutLoop.slots as WorkoutSlots)
        : {};
    return slots;
  }
}
