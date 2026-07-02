import { Injectable, Logger, Optional } from '@nestjs/common';

import { LegacyAgentAdapterService } from '../legacy-agent/legacy-agent-adapter.service';
import {
  LoopDecisionService,
  type LoopDecisionResult,
} from '../loop-router/loop-classifier.service';
import { FitMeetLoopRouterService } from '../loop-router/fitmeet-loop-router.service';
import type {
  FitMeetLoopIntent,
  FitMeetLoopRouterResult,
} from '../loop-router/fitmeet-loop-router.types';
import { AgentTaskPermissionMode } from '../entities/agent-task.entity';
import {
  friendLoopOwnsTask,
  readFriendLoopStage,
} from '../friend-loop/friend-loop-owner';
import { FriendLoopService } from '../friend-loop/friend-loop.service';
import { ProfileLoopService } from '../profile-loop/profile-loop.service';
import {
  readTravelLoopStage,
  travelLoopOwnsTask,
} from '../travel-loop/travel-loop-owner';
import { TravelLoopService } from '../travel-loop/travel-loop.service';
import { WorkoutEntryArbitrationService } from '../workout-loop/workout-entry-arbitration.service';
import { WorkoutLoopService } from '../workout-loop/workout-loop.service';
import {
  readWorkoutLoopStage,
  workoutLoopOwnsTask,
} from '../workout-loop/workout-loop-owner';
import type { AgentEntryInput, AgentEntryResult } from './agent-entry.types';
import type {
  FitMeetAlphaCard,
  FitMeetAlphaCardAction,
} from '../fitmeet-alpha-agent.types';
import type { SocialAgentIntentRouteResult } from '../social-agent-chat.types';

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
    @Optional()
    private readonly travelLoop?: TravelLoopService,
    @Optional()
    private readonly loopDecision?: LoopDecisionService,
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

    if (this.friendLoop && friendLoopOwnsTask(input.task, input.message)) {
      const friend = await this.friendLoop.continueEntrance({
        ownerUserId: input.ownerUserId,
        task: input.task,
        message: input.message,
      });
      this.logRoute(input, {
        source: 'friend_loop_owner',
        loopIntent: 'friend',
        workoutStage,
        cards: this.cardSchemaTypes(friend.result.cards),
        legacyBlocked: true,
      });
      return {
        source: 'friend_loop_owner',
        task: friend.task,
        result: friend.result,
      };
    }

    if (this.travelLoop && travelLoopOwnsTask(input.task, input.message)) {
      const travel = await this.travelLoop.continueEntrance({
        ownerUserId: input.ownerUserId,
        task: input.task,
        message: input.message,
      });
      this.logRoute(input, {
        source: 'travel_loop_owner',
        loopIntent: 'travel',
        workoutStage,
        cards: this.cardSchemaTypes(travel.result.cards),
        legacyBlocked: true,
      });
      return {
        source: 'travel_loop_owner',
        task: travel.task,
        result: travel.result,
      };
    }

    const loopIntent = this.loopRouter.classify(input.message);

    if (this.isRuleFastPath(loopIntent)) {
      const routed = await this.tryRouteAcceptedLoop(input, loopIntent);
      if (routed) return routed;
    }

    const decision = await this.decideLoopWithLlm(input, loopIntent);
    if (decision && this.shouldRouteDecision(decision)) {
      const routed = await this.routeLoopDecision(input, decision);
      if (routed) return routed;
    }

    if (
      decision &&
      decision.confidence >= 0.55 &&
      this.isLoopChoiceIntent(decision.intent)
    ) {
      const result = this.loopChoiceClarificationResult(input, decision);
      const source = this.loopSource(decision.intent);
      this.logRoute(input, {
        source,
        loopIntent: decision.intent,
        workoutStage,
        cards: this.cardSchemaTypes(result.cards),
        legacyBlocked: true,
      });
      return {
        source,
        task: input.task,
        result,
      };
    }

    if (loopIntent.disposition === 'accept_loop') {
      const routed = await this.tryRouteAcceptedLoop(input, loopIntent);
      if (routed) return routed;
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
      const profile = await this.tryRouteProfileLoop(input, workoutStage);
      if (profile) return profile;
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

  private isRuleFastPath(loopIntent: FitMeetLoopRouterResult): boolean {
    if (loopIntent.disposition !== 'accept_loop' || loopIntent.confidence < 0.9)
      return false;
    return (
      loopIntent.reason === 'workout_direct_loop_command' ||
      loopIntent.reason === 'workout_direct_create_phrase' ||
      loopIntent.reason === 'profile_keyword'
    );
  }

  private async decideLoopWithLlm(
    input: AgentEntryInput,
    loopIntent: FitMeetLoopRouterResult,
  ): Promise<LoopDecisionResult | null> {
    if (!this.loopDecision) return null;
    if (loopIntent.reason === 'workout_negative_intent') return null;
    try {
      return await this.loopDecision.decide({
        task: input.task,
        message: input.message,
        ruleReason: loopIntent.reason,
        signal: input.signal ?? null,
      });
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'agent_entry.loop_decision_failed',
          taskId: input.task.id,
          ruleReason: loopIntent.reason,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return null;
    }
  }

  private shouldRouteDecision(decision: LoopDecisionResult): boolean {
    if (!decision.shouldEnterLoop) return false;
    if (decision.confidence < 0.72) return false;
    return (
      decision.intent === 'workout' ||
      decision.intent === 'friend' ||
      decision.intent === 'travel' ||
      decision.intent === 'profile'
    );
  }

  private async routeLoopDecision(
    input: AgentEntryInput,
    decision: LoopDecisionResult,
  ): Promise<AgentEntryResult | null> {
    if (decision.intent === 'workout') {
      const workout = await this.workoutLoop.tryHandleEntrance({
        ownerUserId: input.ownerUserId,
        task: input.task,
        message: input.message,
        bypassRouter: true,
        prefilledSlots: this.loopDecision?.workoutSlotsFromHints(
          decision.workoutHints,
          decision.confidence,
        ),
      });
      if (!workout) return null;
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

    if (decision.intent === 'friend' && this.friendLoop) {
      const friend = await this.friendLoop.tryHandleEntrance({
        ownerUserId: input.ownerUserId,
        task: input.task,
        message: input.message,
        prefilledSlots: this.loopDecision?.friendSlotsFromHints(
          decision.friendHints,
          decision.confidence,
        ),
      });
      this.logRoute(input, {
        source: 'friend_loop_intent',
        loopIntent: 'friend',
        workoutStage: readFriendLoopStage(friend.task),
        cards: this.cardSchemaTypes(friend.result.cards),
        legacyBlocked: true,
      });
      return {
        source: 'friend_loop_intent',
        task: friend.task,
        result: friend.result,
      };
    }

    if (decision.intent === 'travel' && this.travelLoop) {
      const travel = await this.travelLoop.tryHandleEntrance({
        ownerUserId: input.ownerUserId,
        task: input.task,
        message: input.message,
        prefilledSlots: this.loopDecision?.travelSlotsFromHints(
          decision.travelHints,
          decision.confidence,
        ),
      });
      this.logRoute(input, {
        source: 'travel_loop_intent',
        loopIntent: 'travel',
        workoutStage: readTravelLoopStage(travel.task),
        cards: this.cardSchemaTypes(travel.result.cards),
        legacyBlocked: true,
      });
      return {
        source: 'travel_loop_intent',
        task: travel.task,
        result: travel.result,
      };
    }

    if (decision.intent === 'profile' && this.profileLoop) {
      const profile = await this.profileLoop.tryHandleEntrance({
        ownerUserId: input.ownerUserId,
        task: input.task,
        message: input.message,
      });
      if (!profile) return null;
      this.logRoute(input, {
        source: 'profile_loop_intent',
        loopIntent: 'profile',
        workoutStage: readWorkoutLoopStage(profile.task),
        cards: this.cardSchemaTypes(profile.result.cards),
        legacyBlocked: false,
      });
      return {
        source: 'profile_loop_intent',
        task: profile.task,
        result: profile.result,
      };
    }

    return null;
  }

  private async tryRouteProfileLoop(
    input: AgentEntryInput,
    workoutStage: string | null,
  ): Promise<AgentEntryResult | null> {
    if (!this.profileLoop) return null;
    const profile = await this.profileLoop.tryHandleEntrance({
      ownerUserId: input.ownerUserId,
      task: input.task,
      message: input.message,
    });
    if (!profile) return null;
    this.logRoute(input, {
      source: 'profile_loop_intent',
      loopIntent: 'profile',
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

  private async tryRouteAcceptedLoop(
    input: AgentEntryInput,
    loopIntent: FitMeetLoopRouterResult,
  ): Promise<AgentEntryResult | null> {
    if (loopIntent.intent === 'workout') {
      const workout = await this.workoutLoop.tryHandleEntrance({
        ownerUserId: input.ownerUserId,
        task: input.task,
        message: input.message,
      });
      if (!workout) return null;
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

    if (loopIntent.intent === 'friend' && this.friendLoop) {
      const friend = await this.friendLoop.tryHandleEntrance({
        ownerUserId: input.ownerUserId,
        task: input.task,
        message: input.message,
      });
      this.logRoute(input, {
        source: 'friend_loop_intent',
        loopIntent: loopIntent.intent,
        workoutStage: readFriendLoopStage(friend.task),
        cards: this.cardSchemaTypes(friend.result.cards),
        legacyBlocked: true,
      });
      return {
        source: 'friend_loop_intent',
        task: friend.task,
        result: friend.result,
      };
    }

    if (loopIntent.intent === 'travel' && this.travelLoop) {
      const travel = await this.travelLoop.tryHandleEntrance({
        ownerUserId: input.ownerUserId,
        task: input.task,
        message: input.message,
      });
      this.logRoute(input, {
        source: 'travel_loop_intent',
        loopIntent: loopIntent.intent,
        workoutStage: readTravelLoopStage(travel.task),
        cards: this.cardSchemaTypes(travel.result.cards),
        legacyBlocked: true,
      });
      return {
        source: 'travel_loop_intent',
        task: travel.task,
        result: travel.result,
      };
    }

    return null;
  }

  private loopChoiceClarificationResult(
    input: AgentEntryInput,
    classifier: LoopDecisionResult,
  ): SocialAgentIntentRouteResult {
    const body =
      classifier.nextQuestion ||
      classifier.clarificationQuestion ||
      '我理解你可能想进入一个闭环。请选择要继续的方向，我会用卡片帮你整理。';
    const card: FitMeetAlphaCard = {
      id: `loop_choice:classifier:${input.task.id}`,
      type: 'loop_choice',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'loop.choice',
      title: '确认要进入哪个闭环？',
      body,
      status: 'waiting_confirmation',
      data: {
        taskId: input.task.id,
        schemaName: 'LoopChoiceCard',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'loop.choice',
        classifier: {
          intent: classifier.intent,
          confidence: classifier.confidence,
          reason: classifier.reason,
        },
      },
      actions: [
        this.loopChoiceAction(input, 'workout', classifier),
        this.loopChoiceAction(input, 'friend', classifier),
        this.loopChoiceAction(input, 'travel', classifier),
      ],
    };
    return {
      intent: 'social_search',
      confidence: classifier.confidence,
      entities: {
        city: '',
        activityType: '',
        targetGender: '',
        timePreference: '',
        locationPreference: '',
      },
      shouldSearch: false,
      shouldReplan: false,
      shouldUpdateProfile: false,
      shouldExecuteAction: false,
      replyStrategy: 'ask_clarifying_question',
      source: 'rules',
      action: 'clarify',
      taskId: input.task.id,
      assistantMessage: body,
      assistantMessageSource: 'deterministic_route',
      savedContext: true,
      profileUpdated: false,
      shouldQueueRun: false,
      runMode: null,
      queuedRun: null,
      pendingApproval: null,
      activityResults: [],
      profileUpdateProposal: null,
      cards: [card],
      permissionMode:
        input.task.permissionMode ?? AgentTaskPermissionMode.Confirm,
      structuredIntent: {
        schemaVersion: 'fitmeet.loop-decision.v1',
        intent: classifier.intent,
        confidence: classifier.confidence,
        reason: classifier.reason,
      },
    };
  }

  private loopChoiceAction(
    input: AgentEntryInput,
    intent: 'workout' | 'friend' | 'travel',
    classifier: LoopDecisionResult,
  ): FitMeetAlphaCardAction {
    const payload =
      intent === 'workout'
        ? this.loopDecision?.workoutSlotsFromHints(
            classifier.workoutHints,
            classifier.confidence,
          )
        : intent === 'friend'
          ? this.loopDecision?.friendSlotsFromHints(
              classifier.friendHints,
              classifier.confidence,
            )
          : this.loopDecision?.travelSlotsFromHints(
              classifier.travelHints,
              classifier.confidence,
            );
    return {
      id: intent,
      label:
        intent === 'workout' ? '约练' : intent === 'friend' ? '交友' : '旅游',
      action: `loop_choice.${intent}`,
      schemaAction: `loop_choice.${intent}`,
      requiresConfirmation: false,
      payload: {
        taskId: input.task.id,
        ...(payload ?? {}),
      },
    };
  }

  private isLoopChoiceIntent(
    intent: LoopDecisionResult['intent'],
  ): intent is 'workout' | 'friend' | 'travel' {
    return intent === 'workout' || intent === 'friend' || intent === 'travel';
  }

  private loopSource(
    intent: Extract<FitMeetLoopIntent, 'workout' | 'friend' | 'travel'>,
  ): AgentEntryResult['source'] {
    if (intent === 'friend') return 'friend_loop_intent';
    if (intent === 'travel') return 'travel_loop_intent';
    return 'workout_loop_intent';
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
