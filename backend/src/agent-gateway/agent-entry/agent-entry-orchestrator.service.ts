import { Injectable, Logger, Optional } from '@nestjs/common';

import { LegacyAgentAdapterService } from '../legacy-agent/legacy-agent-adapter.service';
import { FitMeetLoopRouterService } from '../loop-router/fitmeet-loop-router.service';
import { FriendLoopService } from '../friend-loop/friend-loop.service';
import { ProfileLoopService } from '../profile-loop/profile-loop.service';
import { WorkoutEntryArbitrationService } from '../workout-loop/workout-entry-arbitration.service';
import { WorkoutLoopService } from '../workout-loop/workout-loop.service';
import {
  readWorkoutLoopStage,
  workoutLoopOwnsTask,
} from '../workout-loop/workout-loop-owner';
import type { AgentEntryInput, AgentEntryResult } from './agent-entry.types';

@Injectable()
export class AgentEntryOrchestratorService {
  private readonly logger = new Logger(AgentEntryOrchestratorService.name);

  constructor(
    private readonly loopRouter: FitMeetLoopRouterService,
    private readonly workoutLoop: WorkoutLoopService,
    private readonly legacy: LegacyAgentAdapterService,
    @Optional()
    private readonly profileLoop?: ProfileLoopService,
    @Optional()
    private readonly workoutArbitration?: WorkoutEntryArbitrationService,
    @Optional()
    private readonly friendLoop?: FriendLoopService,
  ) {}

  async handle(input: AgentEntryInput): Promise<AgentEntryResult> {
    const workoutStage = readWorkoutLoopStage(input.task);
    if (workoutLoopOwnsTask(input.task, input.message)) {
      const workout = await this.workoutLoop.continueEntrance({
        ownerUserId: input.ownerUserId,
        task: input.task,
        message: input.message,
      });
      this.logRoute(input, {
        source: 'workout_loop_owner',
        loopIntent: 'workout',
        workoutStage,
        cards: this.cardSchemaTypes(workout.result.cards),
        legacyBlocked: true,
      });
      return {
        source: 'workout_loop_owner',
        task: workout.task,
        result: workout.result,
      };
    }

    const loopIntent = this.loopRouter.classify(input.message);

    if (
      loopIntent.disposition === 'accept_loop' &&
      loopIntent.intent === 'workout'
    ) {
      const workout = await this.workoutLoop.tryHandleEntrance({
        ownerUserId: input.ownerUserId,
        task: input.task,
        message: input.message,
      });
      if (workout) {
        this.logRoute(input, {
          source: 'workout_loop_intent',
          loopIntent: loopIntent.intent,
          workoutStage: readWorkoutLoopStage(workout.task),
          cards: this.cardSchemaTypes(workout.result.cards),
          legacyBlocked: true,
        });
        return {
          source: 'workout_loop_intent',
          task: workout.task,
          result: workout.result,
        };
      }
    }

    if (
      loopIntent.disposition === 'accept_loop' &&
      loopIntent.intent === 'friend' &&
      this.friendLoop
    ) {
      const friend = await this.friendLoop.tryHandleEntrance({
        ownerUserId: input.ownerUserId,
        task: input.task,
        message: input.message,
      });
      this.logRoute(input, {
        source: 'friend_loop_intent',
        loopIntent: loopIntent.intent,
        workoutStage,
        cards: this.cardSchemaTypes(friend.result.cards),
        legacyBlocked: true,
      });
      return {
        source: 'friend_loop_intent',
        task: friend.task,
        result: friend.result,
      };
    }

    if (
      loopIntent.disposition === 'needs_arbitration' &&
      loopIntent.candidateIntent === 'workout' &&
      this.workoutArbitration
    ) {
      const arbitration = await this.workoutArbitration.arbitrate({
        task: input.task,
        message: input.message,
        loopIntent,
        signal: input.signal ?? null,
      });
      if (arbitration.verdict === 'accept_workout_loop') {
        const workout = await this.workoutLoop.tryHandleEntrance({
          ownerUserId: input.ownerUserId,
          task: input.task,
          message: input.message,
          bypassRouter: true,
          prefilledSlots: arbitration.slots,
          understanding: arbitration.understanding,
        });
        if (workout) {
          this.logRoute(input, {
            source: 'workout_loop_intent',
            loopIntent: 'workout',
            workoutStage: readWorkoutLoopStage(workout.task),
            cards: this.cardSchemaTypes(workout.result.cards),
            legacyBlocked: true,
          });
          return {
            source: 'workout_loop_intent',
            task: workout.task,
            result: workout.result,
          };
        }
      }
      if (arbitration.verdict === 'ask_clarification') {
        const workout = await this.workoutLoop.confirmArbitratedWorkout({
          ownerUserId: input.ownerUserId,
          task: input.task,
          message: input.message,
          slots: arbitration.slots,
          understanding: arbitration.understanding,
        });
        this.logRoute(input, {
          source: 'workout_loop_intent',
          loopIntent: 'workout',
          workoutStage: readWorkoutLoopStage(workout.task),
          cards: this.cardSchemaTypes(workout.result.cards),
          legacyBlocked: true,
        });
        return {
          source: 'workout_loop_intent',
          task: workout.task,
          result: workout.result,
        };
      }
    }

    if (loopIntent.intent === 'profile' && this.profileLoop) {
      const profile = await this.profileLoop.tryHandleEntrance({
        ownerUserId: input.ownerUserId,
        task: input.task,
        message: input.message,
      });
      if (profile) {
        this.logRoute(input, {
          source: 'profile_loop_intent',
          loopIntent: loopIntent.intent,
          workoutStage,
          cards: this.cardSchemaTypes(profile.result.cards),
          legacyBlocked: false,
        });
        return {
          source: 'profile_loop_intent',
          task: profile.task,
          result: profile.result,
        };
      }
    }

    const fallback = await this.legacy.handleFallback({
      ownerUserId: input.ownerUserId,
      task: input.task,
      message: input.message,
      body: input.body,
      startedAt: input.startedAt,
      signal: input.signal,
      fallbackReason: loopIntent.reason,
    });

    this.logRoute(input, {
      source: 'legacy_fallback',
      loopIntent: loopIntent.intent,
      workoutStage,
      cards: this.cardSchemaTypes(fallback.result?.cards),
      legacyBlocked: false,
    });
    return {
      source: 'legacy_fallback',
      task: fallback.task,
      result: fallback.result,
    };
  }

  private logRoute(
    input: AgentEntryInput,
    route: {
      source: AgentEntryResult['source'];
      loopIntent: string;
      workoutStage: string | null;
      cards: string[];
      legacyBlocked: boolean;
    },
  ): void {
    this.logger.log(
      JSON.stringify({
        event: 'agent_entry.route',
        taskId: input.task.id,
        source: route.source,
        loopIntent: route.loopIntent,
        legacyBlocked: route.legacyBlocked,
        workoutStage: route.workoutStage,
        cards: route.cards,
      }),
    );
  }

  private cardSchemaTypes(
    cards: Array<{ schemaType?: string }> | undefined,
  ): string[] {
    return (cards ?? [])
      .map((card) => card.schemaType)
      .filter((schemaType): schemaType is string => Boolean(schemaType));
  }
}
