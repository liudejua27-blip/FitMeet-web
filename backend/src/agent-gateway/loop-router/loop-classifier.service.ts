import { Injectable, Optional } from '@nestjs/common';
import { z } from 'zod';

import { cleanDisplayText } from '../../common/display-text.util';
import type { AgentTask } from '../entities/agent-task.entity';
import type { FriendSlots } from '../friend-loop/friend-loop.types';
import { buildLoopLlmContext } from '../loop-agent/loop-llm-context';
import type { TravelSlots } from '../travel-loop/travel-loop.types';
import type { WorkoutSlots } from '../workout-loop/workout-loop.types';
import { SocialAgentToolJsonModelService } from '../social-agent-tool-json-model.service';

const LoopDecisionIntentSchema = z.enum([
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

const ProfileHintsSchema = z
  .object({
    goal: z.string().optional(),
    interactionStyle: z.string().optional(),
    timePlace: z.string().optional(),
    activityPreference: z.string().optional(),
    safetyBoundary: z.string().optional(),
    gender: z.string().optional(),
    height: z.string().optional(),
    interests: z.array(z.string()).optional(),
  })
  .optional();

const LoopDecisionSchema = z.object({
  intent: LoopDecisionIntentSchema,
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
  shouldEnterLoop: z.boolean().optional(),
  workoutHints: WorkoutHintsSchema,
  friendHints: FriendHintsSchema,
  travelHints: TravelHintsSchema,
  profileHints: ProfileHintsSchema,
  missing: z.array(z.string()).optional(),
  needsClarification: z.boolean().optional(),
  clarificationQuestion: z.string().optional(),
  nextQuestion: z.string().optional(),
});

export type LoopDecisionIntent = z.infer<typeof LoopDecisionIntentSchema>;
export type LoopDecisionResult = z.infer<typeof LoopDecisionSchema>;
export type WorkoutClassifierHints = NonNullable<
  LoopDecisionResult['workoutHints']
>;
export type FriendClassifierHints = NonNullable<
  LoopDecisionResult['friendHints']
>;
export type TravelClassifierHints = NonNullable<
  LoopDecisionResult['travelHints']
>;
export type ProfileDecisionHints = NonNullable<
  LoopDecisionResult['profileHints']
>;

export type LoopClassifierIntent = LoopDecisionIntent;
export type LoopClassifierResult = LoopDecisionResult;

const UNCERTAIN_RESULT: LoopDecisionResult = {
  intent: 'uncertain',
  confidence: 0,
  reason: 'loop_decision_unavailable',
  shouldEnterLoop: false,
};

@Injectable()
export class LoopDecisionService {
  constructor(
    @Optional()
    private readonly toolJson?: SocialAgentToolJsonModelService,
  ) {}

  async decide(input: {
    task: AgentTask;
    message: string;
    ruleReason?: string | null;
    signal?: AbortSignal | null;
  }): Promise<LoopDecisionResult> {
    if (!this.toolJson) return UNCERTAIN_RESULT;
    const raw = await this.toolJson.callJson({
      purpose: 'loop_decision',
      taskId: input.task.id,
      signal: input.signal ?? null,
      prompt: this.prompt(input),
      fallback: () => UNCERTAIN_RESULT,
    });
    const parsed = LoopDecisionSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ...UNCERTAIN_RESULT,
        reason: 'loop_decision_schema_invalid',
      };
    }
    return this.normalizeResult(parsed.data);
  }

  async classify(input: {
    task: AgentTask;
    message: string;
    ruleReason?: string | null;
    signal?: AbortSignal | null;
  }): Promise<LoopDecisionResult> {
    return this.decide(input);
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
        'You are FitMeet multi-turn LoopDecision brain. Return only JSON. Use the full task context and recent conversation to decide whether the user is ready to enter profile completion, workout, friend, travel, casual chat, or remain uncertain. Do not execute actions, publish, match, send messages, add friends, save profile, or create cards. Extract only structured textual slots for the selected loop. Do not invent latitude, longitude, exact dates, or final city truth.',
      outputSchema: {
        intent: 'workout | friend | travel | profile | casual | uncertain',
        confidence: 'number 0..1',
        reason: 'short string',
        shouldEnterLoop:
          'boolean: true only when enough context exists to open a product loop card',
        workoutHints:
          'optional: activityType, timeText, locationText, venueType, candidatePreference',
        friendHints:
          'optional: friendGoal, genderPreference, locationText, topicTags, bodyPreference, appearancePreference',
        travelHints:
          'optional: destination, departureTime, duration, budgetRange, transportMode, tags',
        profileHints:
          'optional: goal, interactionStyle, timePlace, activityPreference, safetyBoundary, gender, height, interests',
        missing: 'optional array of missing slot names',
        needsClarification: 'optional boolean',
        clarificationQuestion: 'optional string',
        nextQuestion: 'optional user-facing short follow-up question',
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
        'If the user answered a prior question with a fragment, combine it with recent conversation and task goal.',
        'Low confidence or unrelated input should return casual or uncertain with shouldEnterLoop=false.',
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

  private normalizeResult(result: LoopDecisionResult): LoopDecisionResult {
    const confidence = this.safeConfidence(result.confidence);
    const shouldEnterLoop =
      result.shouldEnterLoop ??
      (confidence >= 0.75 &&
        (result.intent === 'workout' ||
          result.intent === 'friend' ||
          result.intent === 'travel' ||
          result.intent === 'profile'));
    return {
      ...result,
      confidence,
      shouldEnterLoop,
      reason: cleanDisplayText(result.reason, '') || 'loop_decision',
      clarificationQuestion:
        cleanDisplayText(result.clarificationQuestion, '') || undefined,
      nextQuestion: cleanDisplayText(result.nextQuestion, '') || undefined,
      workoutHints: this.cleanRecord(result.workoutHints),
      friendHints: this.cleanRecord(result.friendHints),
      travelHints: this.cleanRecord(result.travelHints),
      profileHints: this.cleanRecord(result.profileHints),
      missing: this.cleanList(result.missing),
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

export { LoopDecisionService as LoopClassifierService };
