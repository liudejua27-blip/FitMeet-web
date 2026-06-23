import { BadRequestException, Injectable, Optional } from '@nestjs/common';

import { AgentLoopService } from './agent-loop.service';
import { SocialAgentCandidateActionService } from './social-agent-candidate-action.service';
import { CreateSocialRequestDto } from '../social-requests/dto/create-social-request.dto';
import {
  SocialRequestSafety,
  SocialRequestType,
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

type HandleMessage = (
  body: SocialAgentRouteMessageBody,
  emit?: StreamEmit,
  options?: SocialAgentStreamOptions,
) => Promise<SocialAgentIntentRouteResult>;

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

    if (this.isPublishAction(action)) {
      return this.publishToDiscoverFromCardAction(
        ownerUserId,
        taskId,
        normalizedBody,
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
      action === 'publish_to_discover' || action === 'publish_social_request'
    );
  }

  private shouldContinuePrivateCandidateSearch(
    action: string,
    body: SocialAgentCardActionBody,
  ): boolean {
    if (action !== 'candidate.more_like_this') return false;
    const payload = body.payload ?? {};
    return (
      payload.privateMatchMode === true ||
      payload.publicDiscoverPublishSkipped === true ||
      this.text(payload.candidateSearchMode).length > 0 ||
      this.text(payload.sourceAction) === 'activity.skip_publish'
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
      'candidate.generate_opener',
      'opener.regenerate',
      'opener.reject',
      'activity.view_detail',
      'activity.modify_time',
      'activity.modify_location',
      'activity.skip_publish',
    ]).has(action);
  }

  private isApprovalCheckpointAction(action: string): boolean {
    if (this.isPublishAction(action)) return true;
    return new Set([
      'opener.confirm_send',
      'candidate.connect',
      'connect_candidate',
      'activity.confirm_create',
      'life_graph.accept_update',
      'life_graph.reject_update',
      'meet_loop.resume',
      'meet_loop.reschedule',
    ]).has(action);
  }

  private normalizeCardAction(
    action: SocialAgentCardActionBody['action'] | string | null | undefined,
  ): SocialAgentCardActionBody['action'] {
    if (!action) return null;
    const normalized = String(action).trim().toLowerCase();
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
      normalized === 'publish_to_discover'
    ) {
      return 'publish_to_discover';
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
    if (normalized === 'skip_publish') {
      return 'activity.skip_publish';
    }
    if (normalized === 'view_activity') {
      return 'activity.view_detail';
    }
    return action as SocialAgentCardActionBody['action'];
  }

  private agentForAction(action: string) {
    if (this.isPublishAction(action)) return 'FitMeet Main Agent' as const;
    if (action.startsWith('life_graph.')) return 'Life Graph Agent' as const;
    if (
      action.startsWith('activity.') ||
      action.startsWith('review.') ||
      action.startsWith('meet_loop.')
    ) {
      return 'Meet Loop Agent' as const;
    }
    if (
      action === 'connect_candidate' ||
      action.startsWith('candidate.') ||
      action.startsWith('opener.')
    ) {
      return 'Social Match Agent' as const;
    }
    return 'FitMeet Main Agent' as const;
  }

  private async publishToDiscoverFromCardAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    const payload = this.record(body.payload);
    const confirmed =
      payload.confirmedPublish === true ||
      payload.approved === true ||
      payload.confirmed === true;
    if (!confirmed) {
      return this.simpleRouteResult({
        taskId,
        assistantMessage:
          '发布到发现前需要你确认。确认后这张约练卡才会公开给附近可发现用户。',
        cards: [
          {
            id: `publish_to_discover:confirm:${taskId}`,
            type: 'safety_boundary',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'safety.approval',
            title: '确认发布到发现',
            body: '确认后，这张约练卡会公开给附近可发现用户。不会公开精确位置或联系方式。',
            status: 'waiting_confirmation',
            data: {
              taskId,
              approvalPolicy: 'confirm_before_public_publish',
              riskLevel: 'medium',
              actionType: 'publish_social_request',
              approval: {
                actionType: 'publish_social_request',
                riskLevel: 'medium',
                summary: '发布约练卡到发现页',
                boundary: '不会公开精确位置、联系方式或私密画像',
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
                action: 'activity.skip_publish',
                schemaAction: 'activity.skip_publish',
                requiresConfirmation: false,
                payload: { taskId },
              },
            ],
          },
        ],
      });
    }
    if (!this.draftPublication) {
      throw new BadRequestException('Discover publish runtime is unavailable');
    }
    const result = await this.draftPublication.publishDraft(
      ownerUserId,
      taskId,
      this.publishDraftFromPayload(payload),
    );
    const publishStatus = this.text(result.status);
    const pendingApproval = this.record(result.pendingApproval);
    const approvalId = this.number(result.approvalId ?? pendingApproval.id);
    if (publishStatus === 'pending_approval' || approvalId) {
      return this.simpleRouteResult({
        taskId,
        assistantMessage:
          '发布到发现前还需要你确认。确认后，这张约练卡才会公开给附近可发现用户。',
        pendingApproval:
          approvalId && Object.keys(pendingApproval).length > 0
            ? ({
                id: approvalId,
                type: pendingApproval.type,
                actionType:
                  this.text(pendingApproval.actionType) ||
                  'publish_social_request',
                summary:
                  this.text(pendingApproval.summary) || '发布约练卡到发现页',
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
            body: '确认后，这张约练卡会公开给附近可发现用户。不会公开精确位置或联系方式。',
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
                label: '同意并发布',
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
                action: 'activity.skip_publish',
                schemaAction: 'activity.skip_publish',
                requiresConfirmation: false,
                payload: { taskId },
              },
            ],
          },
        ],
      });
    }
    const publicIntentId = this.text(result.publicIntentId);
    const socialRequestId = this.number(result.socialRequestId);
    const discoverHref =
      this.text(result.discoverHref) ||
      (publicIntentId
        ? `/public-intent/${encodeURIComponent(publicIntentId)}`
        : socialRequestId
          ? `/social-request/${encodeURIComponent(String(socialRequestId))}`
          : '/discover');
    return this.simpleRouteResult({
      taskId,
      assistantMessage: `已发布到发现页。你可以在发现页查看这张约练卡，也可以打开详情继续查看发起人公开信息和动态。`,
      cards: [
        {
          id: `publish_to_discover:${taskId}:${publicIntentId || 'published'}`,
          type: 'activity_status',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'social_match.activity',
          title: '已发布到发现',
          body: '公开可发现用户现在可以看到这张约练卡。',
          status: 'completed',
          data: {
            taskId,
            publicIntentId,
            socialRequestId,
            discoverHref,
            autoPublished: true,
            publishStatus: 'published',
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
              },
            },
          ],
        },
      ],
    });
  }

  private publishDraftFromPayload(
    payload: Record<string, unknown>,
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
    const activityType =
      this.text(draft.activityType ?? draft.requestType ?? draft.type) ||
      '散步';
    const title =
      this.text(draft.title ?? draft.activityTitle ?? draft.opportunityTitle) ||
      `${this.text(draft.city) || '同城'}${activityType}约练`;
    const description =
      this.text(draft.description ?? draft.summary ?? draft.body) ||
      '公共场所、低压力、先站内沟通的 FitMeet 约练。';
    return {
      ...draft,
      socialRequestId,
      type: this.socialRequestType(
        draft.type ?? draft.requestType ?? activityType,
      ),
      title,
      description,
      rawText: this.text(draft.rawText ?? description) || description,
      city: this.text(draft.city) || '青岛',
      radiusKm: this.number(draft.radiusKm) ?? 5,
      interestTags: this.stringArray(
        draft.interestTags ?? draft.tags ?? [activityType],
      ),
      activityType,
      safetyRequirement: SocialRequestSafety.LowRiskOnly,
      agentAllowed: true,
      requireUserConfirmation: true,
      metadata: {
        ...metadata,
        ...(socialRequestId ? { socialRequestId } : {}),
        publishSource: 'agent_card_action',
      },
    } as CreateSocialRequestDto & { socialRequestId?: number | null };
  }

  private simpleRouteResult(input: {
    taskId: number;
    assistantMessage: string;
    cards?: SocialAgentIntentRouteResult['cards'];
    pendingApproval?: SocialAgentIntentRouteResult['pendingApproval'];
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
