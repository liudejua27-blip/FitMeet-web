import { Injectable, Optional } from '@nestjs/common';

import type { AgentTask } from '../entities/agent-task.entity';
import { GeoResolverService } from '../geo/geo-resolver.service';
import type { GeoCandidate, GeoResolution } from '../geo/geo-resolver.types';
import type { FitMeetLoopRouterResult } from '../loop-router/fitmeet-loop-router.types';
import type {
  SocialAgentMatchingFallback,
  SocialAgentRelaxationStrategyId,
} from '../social-agent-match-relaxation.types';
import type { WorkoutSlots, WorkoutSlotValidation } from './workout-loop.types';
import {
  defaultWorkoutSafetyBoundary,
  extractWorkoutSlots,
  validateWorkoutSlotsForDraft,
} from './workout-slot-extractor';
import { mergeWorkoutSlotsBySource } from './workout-slot-merge';
import {
  WorkoutUnderstandingService,
  type WorkoutUnderstandingResult,
} from './workout-understanding.service';

export type WorkoutAgentDecisionAction =
  | 'ASK_INTAKE'
  | 'ASK_LOCATION_CONFIRMATION'
  | 'CREATE_WORKOUT_DRAFT'
  | 'HANDOFF_LEGACY';

export type WorkoutAgentDecision = {
  action: WorkoutAgentDecisionAction;
  reason: string;
  slots: WorkoutSlots;
  missing: WorkoutSlotValidation['missing'];
  understanding: WorkoutUnderstandingResult | null;
  geoResolution?: GeoResolution | null;
  geoCandidates?: GeoCandidate[];
  clarificationQuestion?: string | null;
  yesPatch?: Record<string, unknown>;
};

export type WorkoutNoCandidatesDecision = {
  action: 'RECOMMEND_MATCH_RELAXATION';
  reason: string;
  recommendedStrategyId: SocialAgentRelaxationStrategyId;
  observedCandidateCounts: Record<SocialAgentRelaxationStrategyId, number>;
};

@Injectable()
export class WorkoutAgentBrainService {
  constructor(
    @Optional()
    private readonly understanding?: WorkoutUnderstandingService,
    @Optional()
    private readonly geoResolver?: GeoResolverService,
  ) {}

  async decideEntrance(input: {
    task: AgentTask;
    message: string;
    loopIntent: FitMeetLoopRouterResult;
    prefilledSlots?: WorkoutSlots;
    understanding?: WorkoutUnderstandingResult | null;
    signal?: AbortSignal | null;
  }): Promise<WorkoutAgentDecision> {
    return this.decideFromMessage({
      ...input,
      allowDraft: false,
      reasonPrefix: 'entrance',
    });
  }

  async decideContinuation(input: {
    task: AgentTask;
    message: string;
    loopIntent: FitMeetLoopRouterResult;
    signal?: AbortSignal | null;
  }): Promise<WorkoutAgentDecision> {
    return this.decideFromMessage({
      ...input,
      allowDraft: false,
      reasonPrefix: 'continuation',
    });
  }

  async decideIntakeSubmit(input: {
    task: AgentTask;
    message: string;
    slots: WorkoutSlots;
  }): Promise<WorkoutAgentDecision> {
    const slots = await this.resolveGeo(input.slots, input.message);
    const validation = validateWorkoutSlotsForDraft(slots);
    if (slots.geoResolution?.needsConfirmation) {
      return this.locationConfirmationDecision({
        slots,
        understanding: null,
        reason: 'intake_geo_confirmation_required',
        validation,
      });
    }
    return {
      action: validation.valid ? 'CREATE_WORKOUT_DRAFT' : 'ASK_INTAKE',
      reason: validation.valid
        ? 'intake_submit_validated'
        : 'intake_submit_missing_slots',
      slots,
      missing: validation.missing,
      understanding: null,
      geoResolution: slots.geoResolution ?? null,
    };
  }

  decideNoCandidatesRecovery(input: {
    fallback: SocialAgentMatchingFallback;
    noCandidatesFinal?: boolean;
  }): WorkoutNoCandidatesDecision {
    const strategies = input.fallback.strategies;
    const [best] = [...strategies].sort((left, right) => {
      if (right.candidateCount !== left.candidateCount) {
        return right.candidateCount - left.candidateCount;
      }
      return (
        this.relaxationPriority(left.id) - this.relaxationPriority(right.id)
      );
    });
    const recommendedStrategyId =
      best?.id ?? input.fallback.recommendedStrategyId;
    return {
      action: 'RECOMMEND_MATCH_RELAXATION',
      reason: input.noCandidatesFinal
        ? 'matching_no_candidates_final_modify_card'
        : `matching_no_candidates_recommend_${recommendedStrategyId}`,
      recommendedStrategyId,
      observedCandidateCounts: Object.fromEntries(
        strategies.map((strategy) => [strategy.id, strategy.candidateCount]),
      ) as Record<SocialAgentRelaxationStrategyId, number>,
    };
  }

  private async decideFromMessage(input: {
    task: AgentTask;
    message: string;
    loopIntent: FitMeetLoopRouterResult;
    prefilledSlots?: WorkoutSlots;
    understanding?: WorkoutUnderstandingResult | null;
    signal?: AbortSignal | null;
    allowDraft: boolean;
    reasonPrefix: string;
  }): Promise<WorkoutAgentDecision> {
    const memorySlots = this.readWorkoutSlots(input.task);
    const ruleSlots = extractWorkoutSlots({
      message: input.message,
      previousSlots: memorySlots,
    });
    const prefilledSlots = input.prefilledSlots
      ? this.normalizeSlots(input.prefilledSlots)
      : undefined;
    let slots = await this.resolveGeo(
      this.mergeSlots({
        memorySlots,
        ruleSlots,
        prefilledSlots,
      }),
      input.message,
    );
    let understanding = input.understanding ?? null;
    if (
      !understanding &&
      this.understanding?.shouldCall({ slots, loopIntent: input.loopIntent })
    ) {
      understanding = await this.understanding.understand({
        task: input.task,
        message: input.message,
        ruleSlots: slots,
        loopIntent: input.loopIntent,
        signal: input.signal ?? null,
      });
    }
    const llmSlots =
      this.understanding?.slotsFromUnderstanding(understanding) ?? {};
    slots = await this.resolveGeo(
      this.mergeSlots({
        memorySlots,
        ruleSlots,
        llmSlots,
        prefilledSlots,
        llmConfidence: understanding?.confidence,
      }),
      input.message,
    );

    const validation = validateWorkoutSlotsForDraft(slots);
    if (understanding?.intent && understanding.intent !== 'workout') {
      return {
        action: 'HANDOFF_LEGACY',
        reason: `${input.reasonPrefix}_understanding_${understanding.intent}`,
        slots,
        missing: validation.missing,
        understanding,
        geoResolution: slots.geoResolution ?? null,
      };
    }
    if (slots.geoResolution?.needsConfirmation) {
      return this.locationConfirmationDecision({
        slots,
        understanding,
        reason: `${input.reasonPrefix}_geo_confirmation_required`,
        validation,
      });
    }
    return {
      action:
        input.allowDraft && validation.valid
          ? 'CREATE_WORKOUT_DRAFT'
          : 'ASK_INTAKE',
      reason:
        input.allowDraft && validation.valid
          ? `${input.reasonPrefix}_draft_ready`
          : `${input.reasonPrefix}_intake`,
      slots,
      missing: validation.missing,
      understanding,
      geoResolution: slots.geoResolution ?? null,
    };
  }

  private locationConfirmationDecision(input: {
    slots: WorkoutSlots;
    understanding: WorkoutUnderstandingResult | null;
    reason: string;
    validation: WorkoutSlotValidation;
  }): WorkoutAgentDecision {
    const geo = input.slots.geoResolution;
    const yesPatch = geo
      ? {
          ...this.compactSlots(input.slots),
          locationText: geo.locationText ?? input.slots.locationText,
          city: geo.city ?? input.slots.city,
          district: geo.district ?? input.slots.district,
          poiName: geo.poiName ?? input.slots.poiName,
          lat: geo.lat ?? input.slots.lat,
          lng: geo.lng ?? input.slots.lng,
          geoResolution: {
            ...geo,
            source: 'user_confirmed',
            confidence: 1,
            needsConfirmation: false,
          },
        }
      : {};
    return {
      action: 'ASK_LOCATION_CONFIRMATION',
      reason: input.reason,
      slots: input.slots,
      missing: input.validation.missing,
      understanding: input.understanding,
      geoResolution: geo ?? null,
      geoCandidates: geo?.candidates ?? [],
      clarificationQuestion:
        geo?.confirmationQuestion ??
        '我需要先确认这次约练的地点，再继续生成约练卡。',
      yesPatch,
    };
  }

  private async resolveGeo(
    slots: WorkoutSlots,
    message: string,
  ): Promise<WorkoutSlots> {
    const normalized = this.normalizeSlots(slots);
    if (!this.geoResolver) return normalized;
    const alreadyResolvedBySystem =
      normalized.geoResolution &&
      normalized.geoResolution.source !== 'explicit_city' &&
      normalized.geoResolution.source !== 'user_confirmed';
    const geo = await this.geoResolver.resolveAsync({
      message,
      locationText: normalized.locationText,
      city: alreadyResolvedBySystem ? undefined : normalized.city,
      district: normalized.district,
      poiName: normalized.poiName,
      userConfirmed: normalized.geoResolution?.source === 'user_confirmed',
    });
    return this.normalizeSlots({
      ...normalized,
      locationText: geo.locationText ?? normalized.locationText,
      city: geo.city ?? normalized.city,
      district: geo.district ?? normalized.district,
      poiName: geo.poiName ?? normalized.poiName,
      lat: geo.lat ?? normalized.lat,
      lng: geo.lng ?? normalized.lng,
      geoResolution: geo,
      slotMeta: {
        ...(normalized.slotMeta ?? {}),
        ...(geo.locationText
          ? {
              locationText: {
                source: 'geo' as const,
                confidence: geo.confidence,
              },
            }
          : {}),
        ...(geo.city
          ? { city: { source: 'geo' as const, confidence: geo.confidence } }
          : {}),
        ...(geo.district
          ? { district: { source: 'geo' as const, confidence: geo.confidence } }
          : {}),
        ...(geo.poiName
          ? { poiName: { source: 'geo' as const, confidence: geo.confidence } }
          : {}),
      },
    });
  }

  private normalizeSlots(slots: WorkoutSlots): WorkoutSlots {
    return {
      ...slots,
      radiusKm: slots.radiusKm ?? 3,
      safetyBoundary: slots.safetyBoundary ?? defaultWorkoutSafetyBoundary(),
      visibilityPreference: slots.visibilityPreference ?? 'public',
    };
  }

  private mergeSlots(input: {
    memorySlots?: WorkoutSlots;
    ruleSlots?: WorkoutSlots;
    llmSlots?: Partial<WorkoutSlots>;
    prefilledSlots?: WorkoutSlots;
    llmConfidence?: number;
  }): WorkoutSlots {
    return this.normalizeSlots(
      mergeWorkoutSlotsBySource([
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
        {
          slots: this.compactSlots(input.prefilledSlots ?? {}),
          fallbackSource: 'llm',
          fallbackConfidence: input.llmConfidence ?? 0.78,
        },
      ]),
    );
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
    return typeof workoutLoop.slots === 'object' &&
      workoutLoop.slots !== null &&
      !Array.isArray(workoutLoop.slots)
      ? (workoutLoop.slots as WorkoutSlots)
      : {};
  }

  private relaxationPriority(
    strategy: SocialAgentRelaxationStrategyId,
  ): number {
    if (strategy === 'expand_distance') return 1;
    if (strategy === 'expand_time') return 2;
    return 3;
  }
}
