import { BadRequestException, Injectable, Optional } from '@nestjs/common';

import { AgentLoopService } from './agent-loop.service';
import { SocialAgentCandidateActionService } from './social-agent-candidate-action.service';
import { CreateSocialRequestDto } from '../social-requests/dto/create-social-request.dto';
import {
  SocialRequestSafety,
  SocialRequestType,
  SocialRequestVisibility,
  UserSocialRequestStatus,
} from '../social-requests/social-request.entity';
import type { SocialAgentCardActionBody } from './social-agent-action.types';
import type {
  SocialAgentIntentRouteResult,
  SocialAgentRouteMessageBody,
  SocialAgentStreamOptions,
  StreamEmit,
} from './social-agent-chat.types';
import { SocialAgentLifeGraphCardActionService } from './social-agent-life-graph-card-action.service';
import { SocialAgentMeetLoopService } from './social-agent-meet-loop.service';
import { SocialAgentDraftPublicationService } from './social-agent-draft-publication.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import { PublicIntentPrivacyGuardService } from './public-intent-privacy-guard.service';
import { SocialIntentRateLimitService } from './social-intent-rate-limit.service';
import { SocialAgentMatchRelaxationActionService } from './social-agent-match-relaxation-action.service';
import { SocialAgentApplicationActionService } from './social-agent-application-action.service';
import { ClarificationCardActionService } from './clarification/clarification-card-action.service';
import { buildFriendIntakeCard } from './friend-loop/friend-card.presenter';
import { FriendLoopService } from './friend-loop/friend-loop.service';
import type { FriendSlots } from './friend-loop/friend-loop.types';
import {
  extractFriendSlots,
  normalizeFriendSlots,
  validateFriendSlots,
} from './friend-loop/friend-slot-extractor';
import { buildTravelIntakeCard } from './travel-loop/travel-card.presenter';
import { TravelLoopService } from './travel-loop/travel-loop.service';
import type { TravelSlots } from './travel-loop/travel-loop.types';
import {
  extractTravelSlots,
  normalizeTravelSlots,
  validateTravelSlots,
} from './travel-loop/travel-slot-extractor';
import { buildWorkoutIntakeCard } from './workout-loop/workout-card.presenter';
import { WorkoutLoopService } from './workout-loop/workout-loop.service';
import type { WorkoutSlots } from './workout-loop/workout-loop.types';
import {
  extractWorkoutSlots,
  validateWorkoutSlotsForPublish,
} from './workout-loop/workout-slot-extractor';
import { extractKnownCity } from '../common/city.util';

type HandleMessage = (
  body: SocialAgentRouteMessageBody,
  emit?: StreamEmit,
  options?: SocialAgentStreamOptions,
) => Promise<SocialAgentIntentRouteResult>;

type LoopDraftPublishKind = 'workout' | 'friend' | 'travel';

@Injectable()
export class SocialAgentCardActionRouterService {
  constructor(
    private readonly candidateActions: SocialAgentCandidateActionService,
    private readonly meetLoop: SocialAgentMeetLoopService,
    private readonly lifeGraphActions: SocialAgentLifeGraphCardActionService,
    @Optional() private readonly agentLoop?: AgentLoopService,
    @Optional()
    private readonly draftPublication?: SocialAgentDraftPublicationService,
    @Optional()
    private readonly metrics?: SocialAgentMetricsService,
    @Optional()
    private readonly privacyGuard?: PublicIntentPrivacyGuardService,
    @Optional()
    private readonly rateLimit?: SocialIntentRateLimitService,
    @Optional()
    private readonly matchingRelaxation?: SocialAgentMatchRelaxationActionService,
    @Optional()
    private readonly applicationActions?: SocialAgentApplicationActionService,
    @Optional()
    private readonly workoutLoop?: WorkoutLoopService,
    @Optional()
    private readonly clarificationActions?: ClarificationCardActionService,
    @Optional()
    private readonly friendLoop?: FriendLoopService,
    @Optional()
    private readonly travelLoop?: TravelLoopService,
  ) {}

  async perform(input: {
    ownerUserId: number;
    taskId: number;
    body: SocialAgentCardActionBody;
    handleMessage: HandleMessage;
    emit?: StreamEmit;
    options?: SocialAgentStreamOptions;
  }): Promise<SocialAgentIntentRouteResult> {
    const action = this.normalizeCardAction(input.body.action);
    if (!action) throw new BadRequestException('Missing agent action');
    const body =
      action === input.body.action ? input.body : { ...input.body, action };
    let result: SocialAgentIntentRouteResult | null = null;
    const loopService = this.agentLoop ?? new AgentLoopService();
    const execution = await loopService.execute({
      taskId: input.taskId,
      goal: `card_action:${action}`,
      agent: 'FitMeet Main Agent',
      plan: {
        reason: 'Card actions dispatch only through AgentLoop.',
        tools: [
          {
            agent: this.agentForAction(action),
            toolName: 'card_action_dispatch',
            input: {
              action,
              taskId: input.taskId,
              idempotencyKey: input.body.idempotencyKey ?? null,
            },
          },
        ],
      },
      maxToolCalls: 1,
      maxRetries: 0,
      signal: input.options?.signal,
      runner: async () => {
        result = await this.performActionTool({ ...input, body });
        return {
          handled: true,
          action,
          pendingApproval: result.pendingApproval ?? null,
          assistantStreamed: result.assistantStreamed === true,
        };
      },
    });
    const finalResult = result as SocialAgentIntentRouteResult | null;
    if (!finalResult) {
      throw new Error('Card action AgentLoop completed without result.');
    }
    if (this.isDeterministicCardActionResult(action, finalResult)) {
      this.metrics?.recordDeterministicAction(action, {
        estimatedAvoidedLlmCalls: 1,
      });
    }
    finalResult.agentLoop = finalResult.agentLoop ?? execution.loop;
    return finalResult;
  }

  private async performActionTool(input: {
    ownerUserId: number;
    taskId: number;
    body: SocialAgentCardActionBody;
    handleMessage: HandleMessage;
    emit?: StreamEmit;
    options?: SocialAgentStreamOptions;
  }): Promise<SocialAgentIntentRouteResult> {
    const { ownerUserId, taskId, body, options } = input;
    const action = this.normalizeCardAction(body.action);
    if (!action) throw new BadRequestException('Missing agent action');
    const normalizedBody = action === body.action ? body : { ...body, action };

    if (action === 'opener.confirm_send') {
      return this.candidateActions.confirmOpenerSendFromCardAction(
        ownerUserId,
        taskId,
        normalizedBody,
        { signal: options?.signal ?? null },
      );
    }

    if (action === 'opener.reject') {
      return this.candidateActions.rejectOpenerSendFromCardAction(
        ownerUserId,
        taskId,
        normalizedBody,
      );
    }

    if (action === 'opener.regenerate') {
      return this.candidateActions.regenerateOpenerDraftFromCardAction(
        ownerUserId,
        taskId,
        normalizedBody,
      );
    }

    if (this.isMatchingRelaxationAction(action)) {
      if (!this.matchingRelaxation) {
        throw new BadRequestException(
          'Matching relaxation runtime is unavailable',
        );
      }
      const applied = await this.matchingRelaxation.applyRelaxation({
        ownerUserId,
        taskId,
        payload: this.record(normalizedBody.payload),
      });
      return this.simpleRouteResult({
        taskId,
        assistantMessage:
          applied.reused === true
            ? '已经按这个方向重新开始匹配，我会继续等待结果。'
            : '好的，我已经按你选择的方向放宽条件，并重新开始匹配。',
        cards: [],
        publicLoop: {
          stage: 'matching_queued',
          publicIntentId: applied.publicIntentId,
          discoverHref: `/discover?publicIntentId=${encodeURIComponent(applied.publicIntentId)}`,
          publicIntentHref: `/public-intent/${encodeURIComponent(applied.publicIntentId)}`,
          messagesHref: null,
          requiredConfirmation: false,
        },
      });
    }

    if (this.isPublicIntentApplicationAction(action)) {
      if (!this.applicationActions) {
        throw new BadRequestException(
          'Public intent application runtime is unavailable',
        );
      }
      return this.applicationActions.performApplicationAction({
        ownerUserId,
        taskId,
        action,
        body: normalizedBody,
      });
    }

    if (this.isLoopChoiceAction(action)) {
      return this.performLoopChoiceAction(
        ownerUserId,
        taskId,
        action,
        normalizedBody,
      );
    }

    if (this.isClarificationAction(action)) {
      if (!this.clarificationActions) {
        throw new BadRequestException('Clarification runtime is unavailable');
      }
      return this.clarificationActions.perform({
        ownerUserId,
        taskId,
        body: normalizedBody,
      });
    }

    if (this.isLoopDraftPublishAction(action)) {
      const publishResult = await this.publishToDiscoverFromCardAction(
        ownerUserId,
        taskId,
        {
          ...normalizedBody,
          action: 'publish_to_discover',
          payload: {
            ...this.record(normalizedBody.payload),
            loopDraftPublishAction: action,
          },
        },
        input.handleMessage,
        input.emit,
        input.options,
      );
      if (publishResult.publicLoop?.stage !== 'discover_visible') {
        return publishResult;
      }
      const publishKind = this.loopDraftPublishKind(action) ?? 'workout';
      return {
        ...publishResult,
        assistantMessage: this.loopPublishQueuedMessage(publishKind),
        publicLoop: {
          ...publishResult.publicLoop,
          stage: 'matching_queued',
        },
      };
    }

    if (this.isWorkoutAction(action)) {
      if (!this.workoutLoop) {
        throw new BadRequestException('Workout loop runtime is unavailable');
      }
      return this.workoutLoop.performWorkoutAction({
        ownerUserId,
        taskId,
        body: normalizedBody,
      });
    }

    if (this.isFriendAction(action)) {
      if (!this.friendLoop) {
        throw new BadRequestException('Friend loop runtime is unavailable');
      }
      return this.friendLoop.performFriendAction({
        ownerUserId,
        taskId,
        body: normalizedBody,
      });
    }

    if (this.isTravelAction(action)) {
      if (!this.travelLoop) {
        throw new BadRequestException('Travel loop runtime is unavailable');
      }
      return this.travelLoop.performTravelAction({
        ownerUserId,
        taskId,
        body: normalizedBody,
      });
    }

    if (
      action === 'candidate.view_detail' ||
      action === 'candidate.more_like_this' ||
      action === 'candidate.skip' ||
      action === 'candidate.like'
    ) {
      const candidatePreferenceResult =
        await this.candidateActions.performCandidatePreferenceAction(
          ownerUserId,
          taskId,
          normalizedBody,
        );
      if (this.shouldContinuePrivateCandidateSearch(action, normalizedBody)) {
        return this.privateCandidateSearchRouteResult(taskId, normalizedBody);
      }
      return candidatePreferenceResult;
    }

    if (action === 'candidate.generate_opener') {
      return this.candidateActions.createOpenerDraftFromCardAction(
        ownerUserId,
        taskId,
        normalizedBody,
      );
    }

    if (action === 'connect_candidate' || action === 'candidate.connect') {
      return this.candidateActions.connectCandidateFromCardAction(
        ownerUserId,
        taskId,
        normalizedBody,
      );
    }

    if (this.isPublishDismissAction(action)) {
      return this.dismissPublishDraftFromCardAction(
        ownerUserId,
        taskId,
        normalizedBody,
      );
    }

    if (this.isPublishAction(action)) {
      return this.publishToDiscoverFromCardAction(
        ownerUserId,
        taskId,
        normalizedBody,
        input.handleMessage,
        input.emit,
        input.options,
      );
    }

    if (this.isActivityAction(action)) {
      return this.meetLoop.performActivityAction(
        ownerUserId,
        taskId,
        normalizedBody,
      );
    }

    if (this.isLifeGraphAction(action)) {
      return this.lifeGraphActions.performUpdateAction(
        ownerUserId,
        taskId,
        normalizedBody,
      );
    }

    this.metrics?.recordDeterministicAction('unsupported_card_action', {
      estimatedAvoidedLlmCalls: 1,
    });
    return this.simpleRouteResult({
      taskId,
      assistantMessage:
        '这个操作来自旧卡片或暂时不可用。我没有重新调用模型；你可以使用最新回复里的按钮，或直接告诉我下一步想做什么。',
    });
  }

  private isActivityAction(action: string) {
    return (
      action === 'activity.confirm_create' ||
      action === 'activity.skip_publish' ||
      action === 'activity.modify_time' ||
      action === 'activity.modify_location' ||
      action === 'activity.check_in' ||
      action === 'activity.complete' ||
      action === 'activity.view_detail' ||
      action === 'activity.upload_proof' ||
      action === 'review.submit' ||
      action === 'meet_loop.resume' ||
      action === 'meet_loop.reschedule'
    );
  }

  private isPublishAction(action: string) {
    return (
      action === 'publish_to_discover' ||
      action === 'publish_social_request' ||
      this.isLoopDraftPublishAction(action)
    );
  }

  private isLoopDraftPublishAction(
    action: string,
  ): action is `${LoopDraftPublishKind}_draft.publish` {
    return (
      action === 'workout_draft.publish' ||
      action === 'friend_draft.publish' ||
      action === 'travel_draft.publish'
    );
  }

  private loopDraftPublishKind(action: string): LoopDraftPublishKind | null {
    if (action === 'workout_draft.publish') return 'workout';
    if (action === 'friend_draft.publish') return 'friend';
    if (action === 'travel_draft.publish') return 'travel';
    return null;
  }

  private isPublishDismissAction(action: string) {
    return (
      action === 'social_intent.decline_publish' ||
      action === 'social_intent.dismiss'
    );
  }

  private isMatchingRelaxationAction(action: string) {
    return (
      action === 'matching.relax_distance' ||
      action === 'matching.relax_time' ||
      action === 'matching.relax_tags'
    );
  }

  private isPublicIntentApplicationAction(action: string) {
    return (
      action === 'public_intent_application.accept' ||
      action === 'public_intent_application.reject' ||
      action === 'public_intent_application.view_profile' ||
      action === 'public_intent_application.open_conversation'
    );
  }

  private isLoopChoiceAction(action: string) {
    return (
      action === 'loop_choice.workout' ||
      action === 'loop_choice.friend' ||
      action === 'loop_choice.travel'
    );
  }

  private isClarificationAction(action: string) {
    return (
      action === 'clarification.yes' ||
      action === 'clarification.no' ||
      action === 'clarification.select'
    );
  }

  private isWorkoutAction(action: string) {
    return (
      action === 'workout_intake.submit' ||
      action === 'workout_intake.use_defaults' ||
      action === 'workout_intake.cancel' ||
      action === 'workout_draft.private_match' ||
      action === 'workout_draft.edit' ||
      action === 'workout_draft.cancel'
    );
  }

  private isFriendAction(action: string) {
    return (
      action === 'friend_intake.submit' ||
      action === 'friend_intake.use_defaults' ||
      action === 'friend_intake.cancel' ||
      action === 'friend_draft.private_match' ||
      action === 'friend_draft.edit' ||
      action === 'friend_draft.cancel'
    );
  }

  private isTravelAction(action: string) {
    return (
      action === 'travel_intake.submit' ||
      action === 'travel_intake.use_defaults' ||
      action === 'travel_intake.cancel' ||
      action === 'travel_draft.private_match' ||
      action === 'travel_draft.edit' ||
      action === 'travel_draft.cancel'
    );
  }

  private shouldContinuePrivateCandidateSearch(
    action: string,
    body: SocialAgentCardActionBody,
  ): boolean {
    if (action !== 'candidate.more_like_this') return false;
    const payload = body.payload ?? {};
    if (
      payload.publicDiscoverPublishSkipped === true ||
      this.text(payload.sourceAction) === 'activity.skip_publish' ||
      this.text(payload.sourceAction) === 'social_intent.decline_publish'
    ) {
      return false;
    }
    return (
      payload.privateMatchMode === true ||
      this.text(payload.candidateSearchMode).length > 0
    );
  }

  private privateCandidateSearchMessage(
    body: SocialAgentCardActionBody,
  ): string {
    const payload = body.payload ?? {};
    const title = this.text(payload.title);
    const activityType = this.text(payload.activityType ?? payload.activity);
    const time = this.text(
      payload.timePreference ?? payload.timeWindow ?? payload.time,
    );
    const location = this.text(
      payload.locationPreference ?? payload.locationText ?? payload.location,
    );
    const details = [title, time, location, activityType]
      .map((value) => value.trim())
      .filter(Boolean);
    return [
      '不发布到发现，继续私密匹配公开可发现候选人。',
      details.length ? `沿用当前需求：${details.join('，')}。` : '',
      '请搜索并排序 3 个真实公开候选，保留安全边界，推荐结果只在当前对话里展示。',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private privateCandidateSearchRouteResult(
    taskId: number,
    body: SocialAgentCardActionBody,
  ): SocialAgentIntentRouteResult {
    const payload = body.payload ?? {};
    const idempotencyKey =
      body.idempotencyKey ??
      this.privateCandidateSearchIdempotencyKey(taskId, body);
    const title = this.text(payload.title);
    const activityType = this.text(payload.activityType ?? payload.activity);
    const timePreference = this.text(
      payload.timePreference ?? payload.timeWindow ?? payload.time,
    );
    const locationPreference = this.text(
      payload.locationPreference ?? payload.locationText ?? payload.location,
    );
    const assistantMessage =
      '已记录你不发布到发现的选择。我会继续只筛选公开可发现候选，并把结果留在当前对话里。';
    return {
      intent: 'social_search',
      confidence: 1,
      entities: {
        city: this.text(payload.city),
        activityType,
        targetGender: this.text(payload.targetGender),
        timePreference,
        locationPreference,
      },
      shouldSearch: true,
      shouldReplan: false,
      shouldUpdateProfile: false,
      shouldExecuteAction: false,
      replyStrategy: 'search_candidates',
      source: 'rules',
      action: 'queue_search',
      taskId,
      assistantMessage,
      assistantMessageSource: 'deterministic_action',
      savedContext: true,
      profileUpdated: false,
      shouldQueueRun: true,
      runMode: 'follow_up',
      queuedRun: null,
      pendingApproval: null,
      activityResults: [],
      profileUpdateProposal: null,
      cards: [],
      permissionMode: 'confirm' as never,
      structuredIntent: {
        schemaVersion: 'fitmeet.social-intent.v1',
        source: 'agent_card_action',
        mode: 'private_candidate_search',
        taskId,
        message: this.privateCandidateSearchMessage(body),
        idempotencyKey,
        title,
        activityType,
        timePreference,
        locationPreference,
        publicDiscoverPublishSkipped: true,
      },
      runtime: {
        threadId: this.text(body.clientContext?.threadId) || null,
        idempotencyKey,
      },
    };
  }

  private privateCandidateSearchIdempotencyKey(
    taskId: number,
    body: SocialAgentCardActionBody,
  ): string {
    const payload = body.payload ?? {};
    const stableTarget =
      this.text(payload.candidateRecordId) ||
      this.text(payload.targetUserId) ||
      this.text(payload.cardId) ||
      this.text(payload.activityId) ||
      this.text(payload.title) ||
      'current-task';
    return `private-candidate-search:${taskId}:${
      stableTarget
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9:_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'current-task'
    }`;
  }

  private isLifeGraphAction(action: string) {
    return (
      action === 'life_graph.accept_update' ||
      action === 'life_graph.reject_update'
    );
  }

  private isDeterministicCardActionResult(
    action: string,
    result: SocialAgentIntentRouteResult,
  ): boolean {
    if (
      result.shouldSearch ||
      result.shouldReplan ||
      result.shouldQueueRun ||
      result.runMode
    ) {
      return false;
    }
    if (this.isLowRiskDeterministicAction(action)) return true;
    if (result.pendingApproval) return true;
    return this.isApprovalCheckpointAction(action);
  }

  private isLowRiskDeterministicAction(action: string): boolean {
    return new Set([
      'candidate.view_detail',
      'candidate.more_like_this',
      'candidate.skip',
      'candidate.like',
      'matching.relax_distance',
      'matching.relax_time',
      'matching.relax_tags',
      'public_intent_application.view_profile',
      'public_intent_application.open_conversation',
      'loop_choice.workout',
      'loop_choice.friend',
      'loop_choice.travel',
      'clarification.yes',
      'clarification.no',
      'clarification.select',
      'workout_intake.submit',
      'workout_intake.use_defaults',
      'workout_intake.cancel',
      'workout_draft.private_match',
      'workout_draft.edit',
      'workout_draft.cancel',
      'friend_intake.submit',
      'friend_intake.use_defaults',
      'friend_intake.cancel',
      'friend_draft.private_match',
      'friend_draft.edit',
      'friend_draft.cancel',
      'travel_intake.submit',
      'travel_intake.use_defaults',
      'travel_intake.cancel',
      'travel_draft.private_match',
      'travel_draft.edit',
      'travel_draft.cancel',
      'candidate.generate_opener',
      'opener.regenerate',
      'opener.reject',
      'activity.view_detail',
      'activity.modify_time',
      'activity.modify_location',
      'activity.skip_publish',
      'social_intent.decline_publish',
      'social_intent.dismiss',
    ]).has(action);
  }

  private isApprovalCheckpointAction(action: string): boolean {
    if (this.isPublishAction(action)) return true;
    return new Set([
      'opener.confirm_send',
      'candidate.connect',
      'connect_candidate',
      'activity.confirm_create',
      'public_intent_application.accept',
      'life_graph.accept_update',
      'life_graph.reject_update',
      'meet_loop.resume',
      'meet_loop.reschedule',
      'workout_draft.publish',
    ]).has(action);
  }

  private normalizeCardAction(
    action: unknown,
  ): SocialAgentCardActionBody['action'] {
    if (typeof action !== 'string') return null;
    const normalized = action.trim().toLowerCase();
    if (!normalized) return null;
    if (
      normalized === 'send_invite' ||
      normalized === 'send_message' ||
      normalized === 'send_candidate_message' ||
      normalized === 'send_message_to_candidate'
    ) {
      return 'opener.confirm_send';
    }
    if (normalized === 'add_friend' || normalized === 'connect_candidate') {
      return 'candidate.connect';
    }
    if (
      normalized === 'save_candidate' ||
      normalized === 'favorite_candidate' ||
      normalized === 'bookmark_candidate' ||
      normalized === 'collect_candidate'
    ) {
      return 'candidate.like';
    }
    if (normalized === 'dislike_candidate' || normalized === 'skip_candidate') {
      return 'candidate.skip';
    }
    if (normalized === 'generate_opener' || normalized === 'draft_opener') {
      return 'candidate.generate_opener';
    }
    if (normalized === 'regenerate_opener' || normalized === 'rewrite_opener') {
      return 'opener.regenerate';
    }
    if (normalized === 'reject_opener') {
      return 'opener.reject';
    }
    if (
      normalized === 'matching.relax_distance' ||
      normalized === 'relax_distance'
    ) {
      return 'matching.relax_distance';
    }
    if (normalized === 'matching.relax_time' || normalized === 'relax_time') {
      return 'matching.relax_time';
    }
    if (normalized === 'matching.relax_tags' || normalized === 'relax_tags') {
      return 'matching.relax_tags';
    }
    if (
      normalized === 'public_intent_application.accept' ||
      normalized === 'accept_public_intent_application' ||
      normalized === 'accept_application' ||
      normalized === 'application.accept'
    ) {
      return 'public_intent_application.accept';
    }
    if (
      normalized === 'public_intent_application.reject' ||
      normalized === 'reject_public_intent_application' ||
      normalized === 'reject_application' ||
      normalized === 'application.reject'
    ) {
      return 'public_intent_application.reject';
    }
    if (
      normalized === 'public_intent_application.view_profile' ||
      normalized === 'view_application_profile' ||
      normalized === 'application.view_profile'
    ) {
      return 'public_intent_application.view_profile';
    }
    if (
      normalized === 'public_intent_application.open_conversation' ||
      normalized === 'open_application_conversation' ||
      normalized === 'application.open_conversation'
    ) {
      return 'public_intent_application.open_conversation';
    }
    if (
      normalized === 'see_more' ||
      normalized === 'more_like_this' ||
      normalized === 'expand_radius' ||
      normalized === 'relax_preference' ||
      normalized === 'filter_school' ||
      normalized === 'filter_gender_female' ||
      normalized === 'refine_request'
    ) {
      return 'candidate.more_like_this';
    }
    if (
      normalized === 'view_profile' ||
      normalized === 'view_candidate' ||
      normalized === 'view_user' ||
      normalized === 'open_profile' ||
      normalized === 'view_detail'
    ) {
      return 'candidate.view_detail';
    }
    if (
      normalized === 'publish_social_request' ||
      normalized === 'publish_to_discover' ||
      normalized === 'workout_draft.publish' ||
      normalized === 'friend_draft.publish' ||
      normalized === 'travel_draft.publish'
    ) {
      return this.isLoopDraftPublishAction(normalized)
        ? normalized
        : 'publish_to_discover';
    }
    if (normalized === 'create_activity') {
      return 'activity.confirm_create';
    }
    if (normalized === 'modify_activity' || normalized === 'change_time') {
      return 'activity.modify_time';
    }
    if (normalized === 'change_location') {
      return 'activity.modify_location';
    }
    if (
      normalized === 'skip_publish' ||
      normalized === 'activity.skip_publish' ||
      normalized === 'decline_publish' ||
      normalized === 'dismiss_draft' ||
      normalized === 'social_intent.decline_publish' ||
      normalized === 'social_intent.dismiss'
    ) {
      return 'social_intent.decline_publish';
    }
    if (normalized === 'view_activity') {
      return 'activity.view_detail';
    }
    return normalized as SocialAgentCardActionBody['action'];
  }

  private agentForAction(action: string) {
    if (this.isPublishAction(action)) return 'FitMeet Main Agent' as const;
    if (this.isPublishDismissAction(action))
      return 'FitMeet Main Agent' as const;
    if (
      action.startsWith('loop_choice.') ||
      action.startsWith('clarification.') ||
      action.startsWith('workout_') ||
      action.startsWith('friend_') ||
      action.startsWith('travel_')
    ) {
      return 'FitMeet Main Agent' as const;
    }
    if (action.startsWith('matching.')) return 'FitMeet Main Agent' as const;
    if (action.startsWith('public_intent_application.'))
      return 'Match Agent' as const;
    if (action.startsWith('life_graph.')) return 'Life Graph Agent' as const;
    if (
      action.startsWith('activity.') ||
      action.startsWith('review.') ||
      action.startsWith('meet_loop.')
    ) {
      return 'Match Agent' as const;
    }
    if (
      action === 'connect_candidate' ||
      action.startsWith('candidate.') ||
      action.startsWith('opener.')
    ) {
      return 'Match Agent' as const;
    }
    return 'FitMeet Main Agent' as const;
  }

  private async performLoopChoiceAction(
    ownerUserId: number,
    taskId: number,
    action: string,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    if (action === 'loop_choice.workout') {
      if (!this.workoutLoop) {
        throw new BadRequestException('Workout loop runtime is unavailable');
      }
      return this.workoutLoop.startWorkoutIntake({
        ownerUserId,
        taskId,
        payload: this.record(body.payload),
      });
    }
    if (action === 'loop_choice.friend') {
      if (!this.friendLoop) {
        throw new BadRequestException('Friend loop runtime is unavailable');
      }
      return this.friendLoop.startFriendIntake({
        ownerUserId,
        taskId,
        payload: this.record(body.payload),
      });
    }
    if (action === 'loop_choice.travel') {
      if (!this.travelLoop) {
        throw new BadRequestException('Travel loop runtime is unavailable');
      }
      return this.travelLoop.startTravelIntake({
        ownerUserId,
        taskId,
        payload: this.record(body.payload),
      });
    }
    return this.simpleRouteResult({
      taskId,
      assistantMessage: '该闭环即将支持。你现在可以先使用约练闭环。',
      cards: [],
    });
  }

  private async dismissPublishDraftFromCardAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    if (!this.draftPublication) {
      throw new BadRequestException('Discover publish runtime is unavailable');
    }
    const payload = {
      ...this.record(body.payload),
      action: body.action,
      taskId,
    };
    await this.draftPublication.dismissDraft(ownerUserId, taskId, payload);
    return this.simpleRouteResult({
      taskId,
      assistantMessage:
        '已取消发布，这张约练卡不会出现在发现页，也不会继续匹配。',
      cards: [],
      publicLoop: {
        stage: 'dismissed',
        publicIntentId: null,
        discoverHref: null,
        publicIntentHref: null,
        messagesHref: null,
        requiredConfirmation: false,
      },
    });
  }

  private async publishToDiscoverFromCardAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
    handleMessage: HandleMessage,
    emit?: StreamEmit,
    options?: SocialAgentStreamOptions,
  ): Promise<SocialAgentIntentRouteResult> {
    void handleMessage;
    void emit;
    void options;
    const payload = this.record(body.payload);
    const publishKind = this.loopPublishKindFromPayload(body, payload);
    const publishCopy = this.loopPublishCopy(publishKind);
    if (publishKind === 'workout') {
      const slots = this.workoutSlotsFromPublishPayload(payload);
      const validation = validateWorkoutSlotsForPublish(slots);
      if (!validation.valid) {
        return this.simpleRouteResult({
          taskId,
          assistantMessage:
            '发布到发现前需要补充本次约练的城市和地点，避免生成错误城市的约练卡。',
          cards: [
            buildWorkoutIntakeCard({
              taskId,
              slots,
              missing: validation.missing,
              title: '补充约练地点',
              body: '请补充本次约练发生的城市和地点；不会使用默认城市代替。',
            }),
          ],
          publicLoop: {
            stage: 'publish_confirmation_required',
            publicIntentId: null,
            discoverHref: null,
            publicIntentHref: null,
            messagesHref: null,
            requiredConfirmation: true,
          },
        });
      }
    }
    if (publishKind === 'friend') {
      const slots = this.friendSlotsFromPublishPayload(payload);
      const validation = validateFriendSlots(slots);
      const city = this.text(slots.city);
      const missing = city
        ? validation.missing
        : ([...validation.missing, 'city'] as string[]);
      if (missing.length > 0) {
        return this.simpleRouteResult({
          taskId,
          assistantMessage:
            '发布到发现前需要补充交友目标、地点、爱好偏好和可公开展示的城市，避免生成错误城市的交友卡。',
          cards: [
            buildFriendIntakeCard({
              taskId,
              slots,
              missing,
              title: '补充交友发布信息',
              body: '请补充目标、地点/城市、爱好话题、性别偏好、身材偏好和外观偏好；不会使用默认城市代替。',
            }),
          ],
          publicLoop: {
            stage: 'publish_confirmation_required',
            publicIntentId: null,
            discoverHref: null,
            publicIntentHref: null,
            messagesHref: null,
            requiredConfirmation: true,
          },
        });
      }
    }
    if (publishKind === 'travel') {
      const slots = this.travelSlotsFromPublishPayload(payload);
      const validation = validateTravelSlots(slots);
      const city = this.travelPublishCityFromPayload(payload);
      const missing = city
        ? validation.missing
        : ([...validation.missing, 'city'] as string[]);
      if (missing.length > 0) {
        return this.simpleRouteResult({
          taskId,
          assistantMessage:
            '发布到发现前需要补充可公开展示的目的地城市，避免生成错误城市的旅行寻伴卡。',
          cards: [
            buildTravelIntakeCard({
              taskId,
              slots,
              missing,
              title: '补充旅行发布信息',
              body: '请补充目的地、出发时间、预算、交通方式，以及可公开展示的目的地城市；不会使用默认城市代替。',
            }),
          ],
          publicLoop: {
            stage: 'publish_confirmation_required',
            publicIntentId: null,
            discoverHref: null,
            publicIntentHref: null,
            messagesHref: null,
            requiredConfirmation: true,
          },
        });
      }
    }
    const confirmed =
      payload.confirmedPublish === true ||
      payload.approved === true ||
      payload.confirmed === true;
    if (!confirmed) {
      return this.simpleRouteResult({
        taskId,
        assistantMessage: publishCopy.confirmMessage,
        cards: [
          {
            id: `publish_to_discover:confirm:${taskId}`,
            type: 'safety_boundary',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'safety.approval',
            title: '确认发布到发现',
            body: publishCopy.confirmBody,
            status: 'waiting_confirmation',
            data: {
              taskId,
              approvalPolicy: 'confirm_before_public_publish',
              riskLevel: 'medium',
              actionType: 'publish_social_request',
              approval: {
                actionType: 'publish_social_request',
                riskLevel: 'medium',
                summary: publishCopy.approvalSummary,
                boundary: '不会公开精确位置、联系方式或私密资料',
              },
            },
            actions: [
              {
                id: 'confirm_publish_to_discover',
                label: '确认发布',
                action: 'publish_to_discover',
                schemaAction: 'publish_to_discover',
                requiresConfirmation: true,
                payload: {
                  ...payload,
                  confirmedPublish: true,
                  approved: true,
                  confirmed: true,
                  taskId,
                },
              },
              {
                id: 'skip_publish_to_discover',
                label: '暂不发布',
                action: 'social_intent.decline_publish',
                schemaAction: 'social_intent.decline_publish',
                requiresConfirmation: false,
                payload: {
                  taskId,
                  sourceAction: 'social_intent.decline_publish',
                },
              },
            ],
          },
        ],
        publicLoop: {
          stage: 'publish_confirmation_required',
          publicIntentId: null,
          discoverHref: null,
          publicIntentHref: null,
          messagesHref: null,
          requiredConfirmation: true,
        },
      });
    }
    if (!this.draftPublication) {
      throw new BadRequestException('Discover publish runtime is unavailable');
    }
    const publishDraft = this.publishDraftFromPayload(payload, {
      requireCity: publishKind !== null,
    });
    const privacyResult = this.privacyGuard?.inspect(publishDraft);
    if (privacyResult?.blocked) {
      return this.simpleRouteResult({
        taskId,
        assistantMessage: privacyResult.message,
        cards: [
          this.privacyGuard!.buildBlockedCard({
            taskId,
            result: privacyResult,
            payload,
          }),
        ],
        publicLoop: {
          stage: 'publish_confirmation_required',
          publicIntentId: null,
          discoverHref: null,
          publicIntentHref: null,
          messagesHref: null,
          requiredConfirmation: true,
        },
      });
    }
    const rateLimit = await this.rateLimit?.check(ownerUserId);
    if (rateLimit && !rateLimit.allowed) {
      return this.simpleRouteResult({
        taskId,
        assistantMessage: `公开发布频率已达到每小时 ${rateLimit.limit} 次上限，稍后可以继续。`,
        cards: [
          this.rateLimit!.buildRateLimitedCard({
            taskId,
            result: rateLimit,
          }),
        ],
        publicLoop: {
          stage: 'publish_confirmation_required',
          publicIntentId: null,
          discoverHref: null,
          publicIntentHref: null,
          messagesHref: null,
          requiredConfirmation: true,
        },
      });
    }
    const result = await this.draftPublication.publishDraft(
      ownerUserId,
      taskId,
      publishDraft,
    );
    const publishStatus = this.text(result.status);
    const pendingApproval = this.record(result.pendingApproval);
    const approvalId = this.number(result.approvalId ?? pendingApproval.id);
    if (publishStatus === 'pending_approval' || approvalId) {
      return this.simpleRouteResult({
        taskId,
        assistantMessage: publishCopy.pendingApprovalMessage,
        pendingApproval:
          approvalId && Object.keys(pendingApproval).length > 0
            ? ({
                id: approvalId,
                type: pendingApproval.type,
                actionType:
                  this.text(pendingApproval.actionType) ||
                  'publish_social_request',
                summary:
                  this.text(pendingApproval.summary) ||
                  publishCopy.approvalSummary,
                riskLevel: pendingApproval.riskLevel,
                payload: this.record(pendingApproval.payload),
                expiresAt: this.text(pendingApproval.expiresAt) || null,
              } as never)
            : null,
        cards: [
          {
            id: `publish_to_discover:approval:${taskId}:${approvalId || 'pending'}`,
            type: 'safety_boundary',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'safety.approval',
            title: '确认发布到发现',
            body: publishCopy.confirmBody,
            status: 'waiting_confirmation',
            data: {
              taskId,
              approvalId,
              approval: pendingApproval,
              approvalPolicy: 'confirm_before_public_publish',
              actionType: 'publish_social_request',
              riskLevel: this.text(pendingApproval.riskLevel) || 'medium',
            },
            actions: [
              {
                id: 'confirm_publish_to_discover',
                label: '确认发布',
                action: 'publish_to_discover',
                schemaAction: 'publish_to_discover',
                requiresConfirmation: true,
                payload: {
                  ...payload,
                  approvalId,
                  confirmedPublish: true,
                  approved: true,
                  confirmed: true,
                  taskId,
                },
              },
              {
                id: 'skip_publish_to_discover',
                label: '暂不发布',
                action: 'social_intent.decline_publish',
                schemaAction: 'social_intent.decline_publish',
                requiresConfirmation: false,
                payload: {
                  taskId,
                  sourceAction: 'social_intent.decline_publish',
                },
              },
            ],
          },
        ],
        publicLoop: {
          stage: 'publish_confirmation_required',
          publicIntentId: null,
          discoverHref: null,
          publicIntentHref: null,
          messagesHref: null,
          requiredConfirmation: true,
        },
      });
    }
    const publicIntentId = this.text(result.publicIntentId);
    if (
      publishStatus !== 'published' ||
      result.synced !== true ||
      !publicIntentId
    ) {
      const reason =
        this.text(result.message) ||
        '发布后还没有完成发现页读回校验，我不会开始推荐候选。';
      return this.simpleRouteResult({
        taskId,
        assistantMessage: reason,
        cards: [
          {
            id: `publish_to_discover:pending_verification:${taskId}`,
            type: 'activity_status',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'social_match.activity',
            title: '发布待校验',
            body: reason,
            status: 'waiting_confirmation',
            data: {
              taskId,
              publishStatus: publishStatus || 'pending_verification',
              publicIntentId: publicIntentId || null,
              synced: result.synced === true,
              retryable: true,
            },
            actions: [
              {
                id: 'retry_publish_to_discover',
                label: '重试发布',
                action: 'publish_to_discover',
                schemaAction: 'publish_to_discover',
                requiresConfirmation: true,
                payload: {
                  ...payload,
                  confirmedPublish: true,
                  approved: true,
                  confirmed: true,
                  taskId,
                },
              },
              {
                id: 'skip_publish_to_discover',
                label: '暂不发布',
                action: 'social_intent.decline_publish',
                schemaAction: 'social_intent.decline_publish',
                requiresConfirmation: false,
                payload: {
                  taskId,
                  sourceAction: 'social_intent.decline_publish',
                },
              },
            ],
          },
        ],
        publicLoop: {
          stage: 'publish_confirmation_required',
          publicIntentId: publicIntentId || null,
          discoverHref: null,
          publicIntentHref: null,
          messagesHref: null,
          requiredConfirmation: true,
        },
      });
    }
    if (!publicIntentId) {
      throw new BadRequestException(
        '发布缺少 publicIntentId，无法确认发现页可见',
      );
    }
    const socialRequestId = this.number(result.socialRequestId);
    const publicIntentHref =
      this.text(result.publicIntentHref) ||
      (publicIntentId
        ? `/public-intent/${encodeURIComponent(publicIntentId)}`
        : socialRequestId
          ? `/discover?socialRequestId=${encodeURIComponent(String(socialRequestId))}`
          : null);
    const discoverHref =
      this.text(result.discoverHref) ||
      (publicIntentId
        ? `/discover?publicIntentId=${encodeURIComponent(publicIntentId)}`
        : socialRequestId
          ? `/discover?socialRequestId=${encodeURIComponent(String(socialRequestId))}`
          : '/discover');
    const matchingJob = this.record(result.matchingJob);
    const publishedCard: NonNullable<
      SocialAgentIntentRouteResult['cards']
    >[number] = {
      id: `publish_to_discover:${taskId}:${publicIntentId || 'published'}`,
      type: 'activity_status',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.activity',
      title: '已发布到发现',
      body: publishCopy.publishedCardBody,
      status: 'completed',
      data: {
        taskId,
        publicIntentId,
        socialRequestId,
        discoverHref,
        publicIntentHref,
        messagesHref: null,
        autoPublished: true,
        publishStatus: 'published',
        matchingJobId: this.number(matchingJob.id) || null,
        matchingJobStatus: this.text(matchingJob.status) || null,
        sourceVersion: this.text(result.sourceVersion) || null,
      },
      actions: [
        {
          id: 'view_public_intent',
          label: '查看详情',
          action: 'activity.view_detail',
          schemaAction: 'activity.view_detail',
          requiresConfirmation: false,
          payload: {
            taskId,
            publicIntentId,
            socialRequestId,
            discoverHref,
            publicIntentHref,
          },
        },
      ],
    };
    const publishResult = this.simpleRouteResult({
      taskId,
      assistantMessage: publishCopy.publishedMessage,
      cards: [publishedCard],
      publicLoop: {
        stage: 'discover_visible',
        publicIntentId,
        discoverHref,
        publicIntentHref,
        messagesHref: null,
        requiredConfirmation: false,
      },
    });
    return publishResult;
  }

  private publishDraftFromPayload(
    payload: Record<string, unknown>,
    options: { requireCity?: boolean } = {},
  ): CreateSocialRequestDto & { socialRequestId?: number | null } {
    const draft = {
      ...this.record(payload.socialRequestDraft),
      ...this.record(payload.draft),
      ...this.record(payload.activity),
      ...payload,
    };
    const metadata = {
      ...this.record(draft.metadata),
      ...this.record(payload.metadata),
    };
    const socialRequestId = this.number(
      draft.socialRequestId ?? metadata.socialRequestId,
    );
    const publishKind = this.loopPublishKindFromPayload(
      { action: 'publish_to_discover', payload } as SocialAgentCardActionBody,
      payload,
    );
    const loopFallback = this.loopPublishDraftFallback(payload, publishKind);
    const activityType =
      this.text(draft.activityType ?? draft.requestType ?? draft.type) ||
      this.text(loopFallback.activityType) ||
      '散步';
    const title =
      this.text(draft.title ?? draft.activityTitle ?? draft.opportunityTitle) ||
      `${this.text(draft.city) || '同城'}${activityType}约练`;
    const description =
      this.text(draft.description ?? draft.summary ?? draft.body) ||
      '公共场所、低压力、先站内沟通的 FitMeet 约练。';
    const city = this.text(draft.city) || loopFallback.city;
    if (options.requireCity && !city) {
      throw new BadRequestException('Workout city is required before publish');
    }
    return {
      ...draft,
      socialRequestId,
      type: this.socialRequestType(
        draft.type ?? draft.requestType ?? activityType,
      ),
      title,
      description,
      rawText: this.text(draft.rawText ?? description) || description,
      city: options.requireCity ? city : city || '青岛',
      radiusKm: this.number(draft.radiusKm) ?? 5,
      interestTags: this.stringArray(
        draft.interestTags ?? draft.tags ?? [activityType],
      ),
      activityType,
      safetyRequirement: SocialRequestSafety.LowRiskOnly,
      visibility: SocialRequestVisibility.Public,
      status: UserSocialRequestStatus.Matching,
      agentAllowed: true,
      requireUserConfirmation: true,
      metadata: {
        ...metadata,
        ...(socialRequestId ? { socialRequestId } : {}),
        publishSource: 'agent_card_action',
      },
    } as CreateSocialRequestDto & { socialRequestId?: number | null };
  }

  private loopPublishKindFromPayload(
    body: SocialAgentCardActionBody,
    payload: Record<string, unknown>,
  ): LoopDraftPublishKind | null {
    const directAction =
      this.loopDraftPublishKind(this.text(body.action)) ??
      this.loopDraftPublishKind(this.text(payload.loopDraftPublishAction)) ??
      this.loopDraftPublishKind(this.text(payload.sourceAction));
    if (directAction) return directAction;
    const draft = {
      ...this.record(payload.socialRequestDraft),
      ...this.record(payload.draft),
      ...this.record(payload.activity),
      ...payload,
    };
    const metadata = {
      ...this.record(draft.metadata),
      ...this.record(payload.metadata),
    };
    const loop = this.text(metadata.loop);
    if (loop === 'workout' || loop === 'friend' || loop === 'travel') {
      return loop;
    }
    const source = this.text(metadata.source);
    if (
      source === 'workout_loop_mvp' ||
      this.text(metadata.workoutLoopStage).length > 0
    ) {
      return 'workout';
    }
    if (
      source === 'friend_loop_mvp' ||
      this.text(metadata.friendLoopStage).length > 0
    ) {
      return 'friend';
    }
    if (
      source === 'travel_loop_mvp' ||
      this.text(metadata.travelLoopStage).length > 0
    ) {
      return 'travel';
    }
    return null;
  }

  private workoutSlotsFromPublishPayload(
    payload: Record<string, unknown>,
  ): WorkoutSlots {
    const draft = {
      ...this.record(payload.socialRequestDraft),
      ...this.record(payload.draft),
      ...this.record(payload.activity),
      ...payload,
    };
    const slots = this.record(payload.slots);
    const metadata = {
      ...this.record(draft.metadata),
      ...this.record(payload.metadata),
    };
    const draftText = this.publishDraftText(draft, metadata, [
      metadata.locationText,
      metadata.timePreference,
    ]);
    const inferredSlots = draftText
      ? extractWorkoutSlots({ message: draftText })
      : {};
    return {
      activityType:
        this.text(
          slots.activityType ??
            draft.activityType ??
            draft.requestType ??
            draft.type ??
            metadata.activityType ??
            inferredSlots.activityType,
        ) || undefined,
      timePreference:
        this.text(
          slots.timePreference ??
            draft.timePreference ??
            metadata.timePreference ??
            inferredSlots.timePreference,
        ) || undefined,
      locationText:
        this.text(
          slots.locationText ??
            slots.locationPreference ??
            draft.locationText ??
            draft.locationName ??
            draft.locationPreference ??
            metadata.locationText ??
            inferredSlots.locationText,
        ) || undefined,
      city:
        this.text(
          slots.city ?? draft.city ?? metadata.city ?? inferredSlots.city,
        ) || undefined,
      district:
        this.text(slots.district ?? draft.district ?? metadata.district) ||
        undefined,
      poiName:
        this.text(slots.poiName ?? draft.poiName ?? metadata.poiName) ||
        undefined,
      lat: this.number(slots.lat ?? draft.lat ?? metadata.lat) ?? undefined,
      lng: this.number(slots.lng ?? draft.lng ?? metadata.lng) ?? undefined,
      geoResolution:
        this.record(slots.geoResolution).rawText ||
        this.record(draft.geoResolution).rawText ||
        this.record(metadata.geoResolution).rawText
          ? (this.record(
              slots.geoResolution ??
                draft.geoResolution ??
                metadata.geoResolution,
            ) as WorkoutSlots['geoResolution'])
          : undefined,
      radiusKm:
        this.number(slots.radiusKm ?? draft.radiusKm ?? metadata.radiusKm) ??
        undefined,
      intensity:
        this.text(slots.intensity ?? draft.intensity ?? metadata.intensity) ||
        undefined,
      candidatePreference:
        this.text(
          slots.candidatePreference ??
            draft.candidatePreference ??
            metadata.candidatePreference,
        ) || undefined,
      safetyBoundary:
        this.text(
          slots.safetyBoundary ??
            draft.safetyBoundary ??
            metadata.safetyBoundary,
        ) || undefined,
      visibilityPreference:
        this.text(
          slots.visibilityPreference ??
            draft.visibilityPreference ??
            metadata.visibilityPreference,
        ) === 'private'
          ? 'private'
          : 'public',
    };
  }

  private friendSlotsFromPublishPayload(
    payload: Record<string, unknown>,
  ): FriendSlots {
    const draft = {
      ...this.record(payload.socialRequestDraft),
      ...this.record(payload.draft),
      ...this.record(payload.activity),
      ...payload,
    };
    const slots = this.record(payload.slots);
    const metadata = {
      ...this.record(draft.metadata),
      ...this.record(payload.metadata),
    };
    const draftText = this.publishDraftText(draft, metadata, [
      metadata.friendGoal,
      metadata.city,
      metadata.locationText,
      metadata.scenePreference,
      metadata.timePreference,
      metadata.candidatePreference,
      metadata.genderPreference,
      metadata.bodyPreference,
      metadata.appearancePreference,
    ]);
    const inferredSlots = draftText
      ? extractFriendSlots({ message: draftText })
      : {};
    const explicitTopicTags = this.stringArray(
      slots.topicTags ?? draft.topicTags ?? metadata.topicTags ?? draft.tags,
    );
    return normalizeFriendSlots({
      friendGoal:
        this.text(
          slots.friendGoal ??
            draft.friendGoal ??
            metadata.friendGoal ??
            draft.activityType ??
            metadata.activityType ??
            inferredSlots.friendGoal,
        ) || undefined,
      city:
        this.text(slots.city ?? draft.city ?? metadata.city) ||
        inferredSlots.city ||
        undefined,
      locationText:
        this.text(
          slots.locationText ??
            draft.locationText ??
            draft.locationName ??
            draft.locationPreference ??
            metadata.locationText ??
            inferredSlots.locationText,
        ) || undefined,
      topicTags:
        explicitTopicTags.length > 0
          ? explicitTopicTags
          : (inferredSlots.topicTags ?? []),
      genderPreference:
        this.text(
          slots.genderPreference ??
            draft.genderPreference ??
            metadata.genderPreference ??
            inferredSlots.genderPreference,
        ) || undefined,
      bodyPreference:
        this.text(
          slots.bodyPreference ??
            draft.bodyPreference ??
            metadata.bodyPreference ??
            inferredSlots.bodyPreference,
        ) || undefined,
      appearancePreference:
        this.text(
          slots.appearancePreference ??
            draft.appearancePreference ??
            metadata.appearancePreference ??
            inferredSlots.appearancePreference,
        ) || undefined,
      scenePreference:
        this.text(
          slots.scenePreference ??
            draft.scenePreference ??
            metadata.scenePreference ??
            inferredSlots.scenePreference,
        ) || undefined,
      timePreference:
        this.text(
          slots.timePreference ??
            draft.timePreference ??
            metadata.timePreference ??
            inferredSlots.timePreference,
        ) || undefined,
      candidatePreference:
        this.text(
          slots.candidatePreference ??
            draft.candidatePreference ??
            metadata.candidatePreference ??
            inferredSlots.candidatePreference,
        ) || undefined,
      safetyBoundary:
        this.text(
          slots.safetyBoundary ??
            draft.safetyBoundary ??
            metadata.safetyBoundary,
        ) || undefined,
      visibilityPreference: 'private',
    });
  }

  private travelSlotsFromPublishPayload(
    payload: Record<string, unknown>,
  ): TravelSlots {
    const draft = {
      ...this.record(payload.socialRequestDraft),
      ...this.record(payload.draft),
      ...this.record(payload.activity),
      ...payload,
    };
    const slots = this.record(payload.slots);
    const metadata = {
      ...this.record(draft.metadata),
      ...this.record(payload.metadata),
    };
    const draftText = this.publishDraftText(draft, metadata, [
      metadata.destination,
      metadata.departureTime,
      metadata.duration,
      metadata.budgetRange,
      metadata.transportMode,
      metadata.city,
    ]);
    const inferredSlots = draftText
      ? extractTravelSlots({ message: draftText })
      : {};
    const explicitTags = this.stringArray(
      slots.tags ?? draft.tags ?? metadata.tags,
    );
    return normalizeTravelSlots({
      destination:
        this.text(
          slots.destination ??
            draft.destination ??
            metadata.destination ??
            draft.locationName ??
            draft.locationPreference ??
            inferredSlots.destination,
        ) || undefined,
      departureTime:
        this.text(
          slots.departureTime ??
            draft.departureTime ??
            draft.timePreference ??
            metadata.departureTime ??
            inferredSlots.departureTime,
        ) || undefined,
      duration:
        this.text(
          slots.duration ??
            draft.duration ??
            metadata.duration ??
            inferredSlots.duration,
        ) || undefined,
      budgetRange:
        this.text(
          slots.budgetRange ??
            draft.budgetRange ??
            metadata.budgetRange ??
            inferredSlots.budgetRange,
        ) || undefined,
      transportMode:
        this.text(
          slots.transportMode ??
            draft.transportMode ??
            metadata.transportMode ??
            inferredSlots.transportMode,
        ) || undefined,
      tags: explicitTags.length > 0 ? explicitTags : (inferredSlots.tags ?? []),
      city:
        this.text(slots.city ?? draft.city ?? metadata.city) ||
        inferredSlots.city ||
        undefined,
      geoResolution:
        this.record(slots.geoResolution).rawText ||
        this.record(draft.geoResolution).rawText ||
        this.record(metadata.geoResolution).rawText
          ? (this.record(
              slots.geoResolution ??
                draft.geoResolution ??
                metadata.geoResolution,
            ) as TravelSlots['geoResolution'])
          : inferredSlots.geoResolution,
      genderPreference:
        this.text(
          slots.genderPreference ??
            draft.genderPreference ??
            metadata.genderPreference ??
            inferredSlots.genderPreference,
        ) || undefined,
      photoPreference:
        this.text(
          slots.photoPreference ??
            draft.photoPreference ??
            metadata.photoPreference ??
            inferredSlots.photoPreference,
        ) || undefined,
      accommodationPreference:
        this.text(
          slots.accommodationPreference ??
            draft.accommodationPreference ??
            metadata.accommodationPreference ??
            inferredSlots.accommodationPreference,
        ) || undefined,
      foodPreference:
        this.text(
          slots.foodPreference ??
            draft.foodPreference ??
            metadata.foodPreference ??
            inferredSlots.foodPreference,
        ) || undefined,
      candidatePreference:
        this.text(
          slots.candidatePreference ??
            draft.candidatePreference ??
            metadata.candidatePreference ??
            inferredSlots.candidatePreference,
        ) || undefined,
      safetyBoundary:
        this.text(
          slots.safetyBoundary ??
            draft.safetyBoundary ??
            metadata.safetyBoundary,
        ) || undefined,
      visibilityPreference: 'private',
    });
  }

  private travelPublishCityFromPayload(
    payload: Record<string, unknown>,
  ): string {
    const draft = {
      ...this.record(payload.socialRequestDraft),
      ...this.record(payload.draft),
      ...this.record(payload.activity),
      ...payload,
    };
    const slots = this.record(payload.slots);
    const metadata = {
      ...this.record(draft.metadata),
      ...this.record(payload.metadata),
    };
    const explicitCity = this.text(slots.city ?? draft.city ?? metadata.city);
    if (explicitCity) return explicitCity;
    const inferredSlots = this.travelSlotsFromPublishPayload(payload);
    return (
      this.text(inferredSlots.city) ||
      extractKnownCity(inferredSlots.destination)
    );
  }

  private loopPublishDraftFallback(
    payload: Record<string, unknown>,
    kind: LoopDraftPublishKind | null,
  ): { activityType?: string; city: string } {
    if (kind === 'workout') {
      const slots = this.workoutSlotsFromPublishPayload(payload);
      return {
        activityType: slots.activityType,
        city: this.text(slots.city),
      };
    }
    if (kind === 'friend') {
      const slots = this.friendSlotsFromPublishPayload(payload);
      return {
        activityType: '交友',
        city: this.text(slots.city),
      };
    }
    if (kind === 'travel') {
      return {
        activityType: '结伴旅行',
        city: this.travelPublishCityFromPayload(payload),
      };
    }
    return { city: '' };
  }

  private publishDraftText(
    draft: Record<string, unknown>,
    metadata: Record<string, unknown>,
    extra: unknown[] = [],
  ): string {
    return [
      draft.title,
      draft.description,
      draft.summary,
      draft.body,
      draft.rawText,
      draft.activityType,
      draft.city,
      metadata.city,
      ...extra,
    ]
      .map((value) => this.text(value))
      .filter(Boolean)
      .join(' ');
  }

  private loopPublishQueuedMessage(kind: LoopDraftPublishKind): string {
    if (kind === 'friend') {
      return '已发布到发现页，并进入交友匹配队列。发送邀请、加好友或私信前仍会让你确认。';
    }
    if (kind === 'travel') {
      return '已发布到发现页，并进入旅行寻伴匹配队列。发送邀请、加好友或私信前仍会让你确认。';
    }
    return '已发布到发现页，并进入约练匹配队列。发送邀请、加好友或私信前仍会让你确认。';
  }

  private loopPublishCopy(kind: LoopDraftPublishKind | null): {
    confirmMessage: string;
    confirmBody: string;
    pendingApprovalMessage: string;
    approvalSummary: string;
    publishedCardBody: string;
    publishedMessage: string;
  } {
    const noun =
      kind === 'friend'
        ? '交友卡'
        : kind === 'travel'
          ? '旅行寻伴卡'
          : '约练卡';
    return {
      confirmMessage: `发布到发现前需要你确认。确认后这张${noun}才会公开给附近可发现用户。`,
      confirmBody: `确认后，这张${noun}会公开给附近可发现用户。不会公开精确位置或联系方式。`,
      pendingApprovalMessage: `发布到发现前还需要你确认。确认后，这张${noun}才会公开给附近可发现用户。`,
      approvalSummary: `发布${noun}到发现页`,
      publishedCardBody: `公开可发现用户现在可以看到这张${noun}。`,
      publishedMessage: `已发布到发现页。我会根据这张${noun}继续帮你匹配合适的人；发送邀请、加好友或私信前仍会让你确认。`,
    };
  }

  private simpleRouteResult(input: {
    taskId: number;
    assistantMessage: string;
    cards?: SocialAgentIntentRouteResult['cards'];
    pendingApproval?: SocialAgentIntentRouteResult['pendingApproval'];
    publicLoop?: SocialAgentIntentRouteResult['publicLoop'];
  }): SocialAgentIntentRouteResult {
    return {
      intent: 'action_request',
      confidence: 1,
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
      shouldExecuteAction: true,
      replyStrategy: 'execute_action',
      source: 'rules',
      action: 'reply',
      taskId: input.taskId,
      assistantMessage: input.assistantMessage,
      savedContext: true,
      profileUpdated: false,
      shouldQueueRun: false,
      runMode: null,
      queuedRun: null,
      pendingApproval: input.pendingApproval ?? null,
      activityResults: [],
      profileUpdateProposal: null,
      cards: input.cards ?? [],
      publicLoop: input.publicLoop,
      permissionMode: 'confirm' as never,
    };
  }

  private socialRequestType(value: unknown): SocialRequestType {
    const raw = this.text(value).toLowerCase();
    if (/running|run|跑步|慢跑/.test(raw))
      return SocialRequestType.RunningPartner;
    if (/fitness|gym|健身|训练/.test(raw))
      return SocialRequestType.FitnessPartner;
    if (/dog|遛狗/.test(raw)) return SocialRequestType.DogWalking;
    if (/coffee|咖啡/.test(raw)) return SocialRequestType.CoffeeChat;
    if (/walk|散步|city/.test(raw)) return SocialRequestType.CityWalk;
    if (/study|学习|自习/.test(raw)) return SocialRequestType.StudyPartner;
    return SocialRequestType.Custom;
  }

  private record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private number(value: unknown): number | null {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }

  private stringArray(value: unknown): string[] {
    const values = Array.isArray(value) ? value : [value];
    return values
      .map((item) => this.text(item))
      .filter(Boolean)
      .slice(0, 20);
  }
}
