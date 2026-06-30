import { Injectable, Optional } from '@nestjs/common';
import { z } from 'zod';

import { cleanDisplayText } from '../../common/display-text.util';
import type { AgentTask } from '../entities/agent-task.entity';
import type { FriendSlots } from '../friend-loop/friend-loop.types';
import { buildLoopLlmContext } from '../loop-agent/loop-llm-context';
import type { TravelSlots } from '../travel-loop/travel-loop.types';
import type { WorkoutSlots } from '../workout-loop/workout-loop.types';
import { SocialAgentToolJsonModelService } from '../social-agent-tool-json-model.service';

const LoopClassifierIntentSchema = z.enum([
  'workout',
  'friend',
  'travel',
  'profile',
  'casual',
  'uncertain',
]);

const WorkoutHintsSchema = z
  .object({
    activityType: z.string().optional(),
    timeText: z.string().optional(),
    locationText: z.string().optional(),
    venueType: z
      .enum([
        'gym',
        'court',
        'stadium',
        'campus',
        'park',
        'mall',
        'waterfront',
        'trail',
        'unknown',
      ])
      .optional(),
    candidatePreference: z.string().optional(),
  })
  .optional();

const FriendHintsSchema = z
  .object({
    friendGoal: z.string().optional(),
    genderPreference: z.string().optional(),
    locationText: z.string().optional(),
    topicTags: z.array(z.string()).optional(),
    bodyPreference: z.string().optional(),
    appearancePreference: z.string().optional(),
  })
  .optional();

const TravelHintsSchema = z
  .object({
    destination: z.string().optional(),
    departureTime: z.string().optional(),
    duration: z.string().optional(),
    budgetRange: z.string().optional(),
    transportMode: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .optional();

const LoopClassifierSchema = z.object({
  intent: LoopClassifierIntentSchema,
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
  workoutHints: WorkoutHintsSchema,
  friendHints: FriendHintsSchema,
  travelHints: TravelHintsSchema,
  needsClarification: z.boolean().optional(),
  clarificationQuestion: z.string().optional(),
});

export type LoopClassifierIntent = z.infer<typeof LoopClassifierIntentSchema>;
export type LoopClassifierResult = z.infer<typeof LoopClassifierSchema>;
export type WorkoutClassifierHints = NonNullable<
  LoopClassifierResult['workoutHints']
>;
export type FriendClassifierHints = NonNullable<
  LoopClassifierResult['friendHints']
>;
export type TravelClassifierHints = NonNullable<
  LoopClassifierResult['travelHints']
>;

const UNCERTAIN_RESULT: LoopClassifierResult = {
  intent: 'uncertain',
  confidence: 0,
  reason: 'classifier_unavailable',
};

@Injectable()
export class LoopClassifierService {
  constructor(
    @Optional()
    private readonly toolJson?: SocialAgentToolJsonModelService,
  ) {}

  async classify(input: {
    task: AgentTask;
    message: string;
    ruleReason?: string | null;
    signal?: AbortSignal | null;
  }): Promise<LoopClassifierResult> {
    if (!this.toolJson) return UNCERTAIN_RESULT;
    const raw = await this.toolJson.callJson({
      purpose: 'loop_classifier',
      taskId: input.task.id,
      signal: input.signal ?? null,
      prompt: this.prompt(input),
      fallback: () => UNCERTAIN_RESULT,
    });
    const parsed = LoopClassifierSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ...UNCERTAIN_RESULT,
        reason: 'classifier_schema_invalid',
      };
    }
    return this.normalizeResult(parsed.data);
  }

  workoutSlotsFromHints(
    hints: WorkoutClassifierHints | null | undefined,
    confidence = 0.78,
  ): WorkoutSlots {
    const slotMeta: NonNullable<WorkoutSlots['slotMeta']> = {};
    const slots: WorkoutSlots = {};
    this.assignTextSlot(slots, slotMeta, 'activityType', hints?.activityType, {
      confidence,
    });
    this.assignTextSlot(slots, slotMeta, 'timePreference', hints?.timeText, {
      confidence,
    });
    this.assignTextSlot(slots, slotMeta, 'locationText', hints?.locationText, {
      confidence,
    });
    this.assignTextSlot(
      slots,
      slotMeta,
      'candidatePreference',
      hints?.candidatePreference,
      { confidence },
    );
    if (Object.keys(slotMeta).length > 0) slots.slotMeta = slotMeta;
    return slots;
  }

  friendSlotsFromHints(
    hints: FriendClassifierHints | null | undefined,
    confidence = 0.78,
  ): FriendSlots {
    const slotMeta: NonNullable<FriendSlots['slotMeta']> = {};
    const slots: FriendSlots = {};
    this.assignTextSlot(slots, slotMeta, 'friendGoal', hints?.friendGoal, {
      confidence,
    });
    this.assignTextSlot(slots, slotMeta, 'locationText', hints?.locationText, {
      confidence,
    });
    this.assignTextSlot(
      slots,
      slotMeta,
      'genderPreference',
      hints?.genderPreference,
      { confidence },
    );
    this.assignTextSlot(
      slots,
      slotMeta,
      'bodyPreference',
      hints?.bodyPreference,
      { confidence },
    );
    this.assignTextSlot(
      slots,
      slotMeta,
      'appearancePreference',
      hints?.appearancePreference,
      { confidence },
    );
    const topicTags = this.cleanList(hints?.topicTags).slice(0, 6);
    if (topicTags.length > 0) {
      slots.topicTags = topicTags;
      slotMeta.topicTags = { source: 'llm', confidence };
    }
    if (Object.keys(slotMeta).length > 0) slots.slotMeta = slotMeta;
    return slots;
  }

  travelSlotsFromHints(
    hints: TravelClassifierHints | null | undefined,
    confidence = 0.78,
  ): TravelSlots {
    const slotMeta: NonNullable<TravelSlots['slotMeta']> = {};
    const slots: TravelSlots = {};
    this.assignTextSlot(slots, slotMeta, 'destination', hints?.destination, {
      confidence,
    });
    this.assignTextSlot(
      slots,
      slotMeta,
      'departureTime',
      hints?.departureTime,
      { confidence },
    );
    this.assignTextSlot(slots, slotMeta, 'duration', hints?.duration, {
      confidence,
    });
    this.assignTextSlot(slots, slotMeta, 'budgetRange', hints?.budgetRange, {
      confidence,
    });
    this.assignTextSlot(
      slots,
      slotMeta,
      'transportMode',
      hints?.transportMode,
      { confidence },
    );
    const tags = this.cleanList(hints?.tags).slice(0, 6);
    if (tags.length > 0) {
      slots.tags = tags;
      slotMeta.tags = { source: 'llm', confidence };
    }
    if (Object.keys(slotMeta).length > 0) slots.slotMeta = slotMeta;
    return slots;
  }

  private prompt(input: {
    task: AgentTask;
    message: string;
    ruleReason?: string | null;
  }): string {
    return JSON.stringify({
      instruction:
        'You are FitMeet loop classifier. Return only JSON. Do not execute actions, publish, send messages, add friends, or create cards. Classify the user message into workout, friend, travel, profile, casual, or uncertain and extract only textual clues. Do not invent latitude, longitude, exact dates, or final city truth.',
      outputSchema: {
        intent: 'workout | friend | travel | profile | casual | uncertain',
        confidence: 'number 0..1',
        reason: 'short string',
        workoutHints:
          'optional: activityType, timeText, locationText, venueType, candidatePreference',
        friendHints:
          'optional: friendGoal, genderPreference, locationText, topicTags, bodyPreference, appearancePreference',
        travelHints:
          'optional: destination, departureTime, duration, budgetRange, transportMode, tags',
        needsClarification: 'optional boolean',
        clarificationQuestion: 'optional string',
      },
      routingPolicy: {
        workout:
          'sports, exercise, running, gym, ball games, cycling, hiking, walking, citywalk, active venue companionship',
        friend:
          'friend-making, chat, coffee, exhibitions, same-city low-pressure socializing',
        travel:
          'travel companions, destination, itinerary, budget, route, photo buddy',
        profile: 'explicit profile update or personal information completion',
        casual: 'general chat or unrelated question',
        uncertain: 'insufficient evidence',
      },
      safetyBoundary: [
        'Return location text exactly or normalized as a text clue only.',
        'Maps/geocoding will decide real POI, city, and coordinates.',
        'Return time text as raw user wording only.',
      ],
      taskContext: {
        ...buildLoopLlmContext({
          task: input.task,
          message: input.message,
        }),
        existingLoopMemory: this.loopMemorySnapshot(input.task),
      },
      ruleReason: input.ruleReason ?? null,
      message: input.message,
    });
  }

  private normalizeResult(result: LoopClassifierResult): LoopClassifierResult {
    return {
      ...result,
      reason: cleanDisplayText(result.reason, '') || 'loop_classifier',
      clarificationQuestion:
        cleanDisplayText(result.clarificationQuestion, '') || undefined,
      workoutHints: this.cleanRecord(result.workoutHints),
      friendHints: this.cleanRecord(result.friendHints),
      travelHints: this.cleanRecord(result.travelHints),
    };
  }

  private loopMemorySnapshot(task: AgentTask): Record<string, unknown> {
    const memory = this.record(task.memory);
    return {
      workoutLoop: this.record(memory.workoutLoop),
      friendLoop: this.record(memory.friendLoop),
      travelLoop: this.record(memory.travelLoop),
    };
  }

  private assignTextSlot<
    Slots extends { slotMeta?: Record<string, unknown> },
    Key extends keyof Slots & string,
  >(
    slots: Slots,
    slotMeta: Record<string, unknown>,
    key: Key,
    value: unknown,
    options: { confidence: number },
  ) {
    const text = cleanDisplayText(value, '');
    if (!text) return;
    slots[key] = text as Slots[Key];
    slotMeta[key] = {
      source: 'llm',
      confidence: this.safeConfidence(options.confidence),
    };
  }

  private cleanRecord<T extends Record<string, unknown> | undefined>(
    value: T,
  ): T {
    if (!value) return undefined as T;
    return Object.fromEntries(
      Object.entries(value).filter(([, item]) => {
        if (item === null || item === undefined) return false;
        if (typeof item === 'string') return item.trim().length > 0;
        if (Array.isArray(item)) return item.length > 0;
        return true;
      }),
    ) as T;
  }

  private cleanList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => cleanDisplayText(item, '')).filter(Boolean);
  }

  private record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private safeConfidence(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.min(value, 1)) : 0.78;
  }
}
