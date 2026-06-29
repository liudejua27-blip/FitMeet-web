import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { sanitizeCity } from '../../common/city.util';
import { cleanDisplayText } from '../../common/display-text.util';
import type { CreateSocialRequestDto } from '../../social-requests/dto/create-social-request.dto';
import {
  SocialRequestSafety,
  SocialRequestSource,
  SocialRequestType,
  SocialRequestVisibility,
  UserSocialRequestStatus,
} from '../../social-requests/social-request.entity';
import { AgentTask, AgentTaskStatus } from '../entities/agent-task.entity';
import type { MatchingJob } from '../entities/matching-job.entity';
import type { SocialAgentCardActionBody } from '../social-agent-action.types';
import type { SocialAgentIntentRouteResult } from '../social-agent-chat.types';
import { SocialAgentDraftPublicationService } from '../social-agent-draft-publication.service';
import { SocialAgentMessageLogService } from '../social-agent-message-log.service';
import { MatchingJobService } from '../matching-job.service';
import {
  buildFriendDraftCard,
  buildFriendIntakeCard,
} from './friend-card.presenter';
import { FriendAgentBrainService } from './friend-agent-brain.service';
import type { FriendLoopStage, FriendSlots } from './friend-loop.types';
import {
  defaultFriendSafetyBoundary,
  extractFriendSlots,
  normalizeFriendSlots,
  validateFriendSlots,
} from './friend-slot-extractor';

type FriendDraftForPublish = CreateSocialRequestDto & {
  socialRequestId?: number | null;
  timePreference?: string;
  locationName?: string;
  locationPreference?: string;
  safetyBoundary?: string;
};

@Injectable()
export class FriendLoopService {
  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    private readonly messageLog: SocialAgentMessageLogService,
    @Optional()
    private readonly draftPublication?: SocialAgentDraftPublicationService,
    @Optional()
    private readonly matchingJobs?: MatchingJobService,
    @Optional()
    private readonly friendBrain?: FriendAgentBrainService,
  ) {}

  async tryHandleEntrance(input: {
    ownerUserId: number;
    task: AgentTask;
    message: string;
  }): Promise<{ task: AgentTask; result: SocialAgentIntentRouteResult }> {
    const slots = extractFriendSlots({
      message: input.message,
      previousSlots: this.readFriendSlots(input.task),
    });
    const decision = await this.friendBrain?.decideEntrance({
      task: input.task,
      message: input.message,
      slots,
    });
    const result = await this.intakeResultForSlots({
      task: input.task,
      slots: decision?.slots ?? slots,
      assistantMessage:
        '可以，我先帮你整理交友需求。确认下面信息后，我再生成交友卡。',
    });
    return { task: input.task, result };
  }

  async continueEntrance(input: {
    ownerUserId: number;
    task: AgentTask;
    message: string;
  }): Promise<{ task: AgentTask; result: SocialAgentIntentRouteResult }> {
    const slots = extractFriendSlots({
      message: input.message,
      previousSlots: this.readFriendSlots(input.task),
    });
    const decision = await this.friendBrain?.decideEntrance({
      task: input.task,
      message: input.message,
      slots,
    });
    const result = await this.intakeResultForSlots({
      task: input.task,
      slots: decision?.slots ?? slots,
      assistantMessage:
        '已根据你补充的信息更新交友需求。确认下面信息后，我再生成交友卡。',
    });
    return { task: input.task, result };
  }

  async startFriendIntake(input: {
    ownerUserId: number;
    taskId: number;
    payload?: Record<string, unknown>;
  }): Promise<SocialAgentIntentRouteResult> {
    const task = await this.assertTaskOwner(input.ownerUserId, input.taskId);
    const slots = normalizeFriendSlots({
      ...this.readFriendSlots(task),
      ...this.slotsFromPayload(input.payload ?? {}),
    });
    return this.intakeResultForSlots({
      task,
      slots,
      assistantMessage: '好的，我们先进入交友闭环。我会帮你整理成一张交友卡。',
    });
  }

  async performFriendAction(input: {
    ownerUserId: number;
    taskId: number;
    body: SocialAgentCardActionBody;
  }): Promise<SocialAgentIntentRouteResult> {
    const action = this.text(input.body.action);
    if (
      action === 'friend_intake.submit' ||
      action === 'friend_intake.use_defaults'
    ) {
      return this.submitIntake(input);
    }
    if (action === 'friend_intake.cancel') {
      const task = await this.assertTaskOwner(input.ownerUserId, input.taskId);
      this.rememberFriendSlots(task, this.readFriendSlots(task), 'cancelled');
      return this.resultWithCards({
        task,
        assistantMessage: '已取消这次交友卡，不会匹配或联系任何人。',
        cards: [],
        action: 'reply',
      });
    }
    if (action === 'friend_draft.edit') {
      const task = await this.assertTaskOwner(input.ownerUserId, input.taskId);
      return this.intakeResultForSlots({
        task,
        slots: this.readFriendSlots(task),
        assistantMessage: '可以，继续修改这次交友需求。',
      });
    }
    if (action === 'friend_draft.cancel') {
      const task = await this.assertTaskOwner(input.ownerUserId, input.taskId);
      await this.draftPublication?.dismissDraft(
        input.ownerUserId,
        input.taskId,
        {
          ...this.record(input.body.payload),
          action: 'friend_draft.cancel',
          taskId: input.taskId,
        },
      );
      this.rememberFriendSlots(task, this.readFriendSlots(task), 'cancelled');
      return this.resultWithCards({
        task,
        assistantMessage: '已取消这次交友卡，不会匹配或联系任何人。',
        cards: [],
        action: 'reply',
      });
    }
    if (action === 'friend_draft.private_match') {
      const task = await this.assertTaskOwner(input.ownerUserId, input.taskId);
      const slots = normalizeFriendSlots({
        ...this.readFriendSlots(task),
        ...this.slotsFromPayload(input.body.payload),
      });
      return this.privateMatchResult({ task, slots, body: input.body });
    }
    throw new BadRequestException('Unsupported friend loop action');
  }

  private async submitIntake(input: {
    ownerUserId: number;
    taskId: number;
    body: SocialAgentCardActionBody;
  }): Promise<SocialAgentIntentRouteResult> {
    const task = await this.assertTaskOwner(input.ownerUserId, input.taskId);
    const slots = normalizeFriendSlots({
      ...this.readFriendSlots(task),
      ...this.slotsFromPayload(input.body.payload),
    });
    const validation = validateFriendSlots(slots);
    const decision = this.friendBrain?.decideIntakeSubmit({
      slots,
      validation,
    });
    const action =
      decision?.action ?? (validation.valid ? 'CREATE_DRAFT' : 'ASK_INTAKE');
    if (action === 'ASK_INTAKE') {
      return this.intakeResultForSlots({
        task,
        slots: decision?.slots ?? slots,
        assistantMessage: '还需要补齐交友目标和城市，才能生成交友卡。',
      });
    }
    return this.createDraftResult({
      ownerUserId: input.ownerUserId,
      task,
      slots: decision?.slots ?? slots,
      assistantMessage: '已收到交友需求，我正在生成交友卡。',
    });
  }

  private async intakeResultForSlots(input: {
    task: AgentTask;
    slots: FriendSlots;
    assistantMessage: string;
  }): Promise<SocialAgentIntentRouteResult> {
    const validation = validateFriendSlots(input.slots);
    this.rememberFriendSlots(input.task, input.slots, 'intake');
    return this.resultWithCards({
      task: input.task,
      assistantMessage: input.assistantMessage,
      cards: [
        buildFriendIntakeCard({
          taskId: input.task.id,
          slots: input.slots,
          missing: validation.missing,
        }),
      ],
      action: 'clarify',
    });
  }

  private async createDraftResult(input: {
    ownerUserId: number;
    task: AgentTask;
    slots: FriendSlots;
    assistantMessage: string;
  }): Promise<SocialAgentIntentRouteResult> {
    if (!this.draftPublication) {
      throw new BadRequestException(
        'Friend draft publication runtime unavailable',
      );
    }
    const draft = this.buildSocialRequestDraft(input.task.id, input.slots);
    const staged = await this.draftPublication.stagePrivateDraftForPublish(
      input.ownerUserId,
      input.task.id,
      draft,
    );
    const stagedDraft = staged.draft as FriendDraftForPublish & {
      socialRequestId: number;
    };
    this.rememberFriendSlots(staged.task, input.slots, 'draft_ready', {
      socialRequestId: staged.socialRequestId,
      socialRequestDraft: stagedDraft,
    });
    return this.resultWithCards({
      task: staged.task,
      assistantMessage:
        input.assistantMessage ??
        '我已经帮你整理成一张交友卡，确认后进入私密匹配。',
      cards: [
        buildFriendDraftCard({
          taskId: staged.task.id,
          slots: input.slots,
          draft: stagedDraft,
        }),
      ],
      action: 'await_confirmation',
    });
  }

  private async privateMatchResult(input: {
    task: AgentTask;
    slots: FriendSlots;
    body: SocialAgentCardActionBody;
  }): Promise<SocialAgentIntentRouteResult> {
    const payload = this.record(input.body.payload);
    const socialRequestDraft = this.record(payload.socialRequestDraft);
    const socialRequestId = this.number(
      payload.socialRequestId ?? socialRequestDraft.socialRequestId,
    );
    const idempotencyKey =
      input.body.idempotencyKey ??
      this.friendPrivateMatchIdempotencyKey(input.task.id, input.slots);
    const privateMatchingJob = await this.enqueuePrivateMatchingJob({
      task: input.task,
      slots: input.slots,
      socialRequestId,
      idempotencyKey,
    });
    this.rememberFriendSlots(input.task, input.slots, 'matching_queued', {
      privateMatchMode: true,
      publicDiscoverPublishSkipped: true,
      socialRequestId,
      waitingFor: 'matching_job',
      matchingJobId: privateMatchingJob?.id ?? null,
      matchingJobStatus: privateMatchingJob?.status ?? null,
      publicIntentId: privateMatchingJob?.publicIntentId ?? null,
      sourceVersion: privateMatchingJob?.sourceVersion ?? null,
      ...(Object.keys(socialRequestDraft).length > 0
        ? { socialRequestDraft }
        : {}),
    });
    input.task.status = AgentTaskStatus.WaitingResult;
    input.task.statusReason = privateMatchingJob
      ? 'friend_private_matching_queued'
      : 'friend_loop_matching_queued';
    await this.taskRepo.save(input.task);

    const assistantMessage =
      '已保存为不公开交友卡。我会只在当前对话里为你筛选公开可发现的候选人。';
    const result: SocialAgentIntentRouteResult = {
      intent: 'social_search',
      confidence: 1,
      entities: {
        city: input.slots.city ?? '',
        activityType: '交友',
        targetGender: input.slots.genderPreference ?? '',
        timePreference: input.slots.timePreference ?? '',
        locationPreference: input.slots.locationText ?? input.slots.city ?? '',
      },
      shouldSearch: true,
      shouldReplan: false,
      shouldUpdateProfile: false,
      shouldExecuteAction: false,
      replyStrategy: 'search_candidates',
      source: 'rules',
      action: 'queue_search',
      taskId: input.task.id,
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
      publicLoop: {
        stage: 'matching_queued',
        publicIntentId: null,
        discoverHref: null,
        publicIntentHref: null,
        messagesHref: null,
        requiredConfirmation: false,
      },
      permissionMode: input.task.permissionMode,
      structuredIntent: {
        schemaVersion: 'fitmeet.friend-loop.v1',
        mode: 'private_candidate_search',
        stage: 'matching_queued',
        slots: input.slots,
        taskId: input.task.id,
        socialRequestId,
        matchingJobId: privateMatchingJob?.id ?? null,
        matchingJobStatus: privateMatchingJob?.status ?? null,
        publicIntentId: privateMatchingJob?.publicIntentId ?? null,
        sourceVersion: privateMatchingJob?.sourceVersion ?? null,
        privateMatchMode: true,
        publicDiscoverPublishSkipped: true,
        message: this.friendPrivateMatchMessage(input.slots),
        idempotencyKey,
      },
      runtime: {
        threadId: this.text(input.body.clientContext?.threadId) || null,
        idempotencyKey,
      },
    };
    await this.messageLog.recordAssistantMessage(
      input.task,
      assistantMessage,
      result,
    );
    return result;
  }

  private async enqueuePrivateMatchingJob(input: {
    task: AgentTask;
    slots: FriendSlots;
    socialRequestId: number | null;
    idempotencyKey: string;
  }): Promise<MatchingJob | null> {
    if (!this.matchingJobs || !input.socialRequestId) return null;
    const sourceVersion = this.privateMatchSourceVersion(input.slots);
    const publicIntentId = `private-friend:${input.task.id}:${input.socialRequestId}`;
    const { job } = await this.matchingJobs.enqueue({
      ownerUserId: input.task.ownerUserId,
      linkedSocialRequestId: input.socialRequestId,
      publicIntentId,
      sourceVersion,
      idempotencyKey: input.idempotencyKey,
      metadata: {
        taskId: input.task.id,
        socialRequestId: input.socialRequestId,
        source: 'friend_private_match',
        visibility: 'private',
        privateMatchMode: true,
        publicDiscoverPublishSkipped: true,
        friendLoopStage: 'matching_queued',
        slots: input.slots,
      },
    });
    return job;
  }

  private buildSocialRequestDraft(
    taskId: number,
    slots: FriendSlots,
  ): FriendDraftForPublish {
    const city = sanitizeCity(slots.city) ?? '';
    const goal = slots.friendGoal ?? '认识新朋友';
    const tags = slots.topicTags?.length ? slots.topicTags : [goal];
    const location = slots.locationText ?? city;
    const title = `${city || '同城'}${goal}`;
    const description = [
      `想在${location || '同城'}${goal}。`,
      tags.length ? `兴趣话题：${tags.join('、')}。` : '',
      slots.genderPreference ? `性别偏好：${slots.genderPreference}。` : '',
      slots.bodyPreference ? `身材偏好：${slots.bodyPreference}。` : '',
      slots.appearancePreference
        ? `外观偏好：${slots.appearancePreference}。`
        : '',
      slots.scenePreference ? `偏好场景：${slots.scenePreference}。` : '',
      slots.timePreference ? `时间偏好：${slots.timePreference}。` : '',
      slots.candidatePreference
        ? `匹配偏好：${slots.candidatePreference}。`
        : '',
      slots.safetyBoundary ?? defaultFriendSafetyBoundary(),
    ]
      .filter(Boolean)
      .join('');
    return {
      type: tags.includes('咖啡')
        ? SocialRequestType.CoffeeChat
        : SocialRequestType.Custom,
      title,
      description,
      rawText: description,
      city,
      radiusKm: 10,
      interestTags: tags,
      activityType: '交友',
      safetyRequirement: SocialRequestSafety.LowRiskOnly,
      visibility: SocialRequestVisibility.Private,
      status: UserSocialRequestStatus.Draft,
      source: SocialRequestSource.FitMeetAgent,
      agentAllowed: true,
      requireUserConfirmation: true,
      timePreference: slots.timePreference,
      locationName: location,
      locationPreference: location,
      safetyBoundary: slots.safetyBoundary ?? defaultFriendSafetyBoundary(),
      metadata: {
        agentTaskId: taskId,
        loop: 'friend',
        source: 'friend_loop_mvp',
        friendLoopStage: 'draft_ready',
        friendGoal: goal,
        city: city || null,
        locationText: slots.locationText ?? null,
        topicTags: tags,
        genderPreference: slots.genderPreference ?? null,
        bodyPreference: slots.bodyPreference ?? null,
        appearancePreference: slots.appearancePreference ?? null,
        scenePreference: slots.scenePreference ?? null,
        timePreference: slots.timePreference ?? null,
        candidatePreference: slots.candidatePreference ?? null,
        safetyBoundary: slots.safetyBoundary ?? defaultFriendSafetyBoundary(),
        visibilityPreference: 'private',
      },
    };
  }

  private privateMatchSourceVersion(slots: FriendSlots): string {
    const parts = [
      slots.friendGoal,
      slots.city,
      slots.locationText,
      ...(slots.topicTags ?? []),
      slots.genderPreference,
      slots.bodyPreference,
      slots.appearancePreference,
      slots.scenePreference,
      slots.timePreference,
      slots.candidatePreference,
    ]
      .map((value) => this.text(value))
      .filter(Boolean);
    return `friend-private:${parts.join('|') || 'current'}`.slice(0, 128);
  }

  private friendPrivateMatchMessage(slots: FriendSlots): string {
    const details = [
      slots.city,
      slots.locationText,
      slots.friendGoal,
      ...(slots.topicTags ?? []),
      slots.genderPreference,
      slots.bodyPreference,
      slots.appearancePreference,
      slots.scenePreference,
      slots.timePreference,
      slots.candidatePreference,
    ]
      .map((value) => this.text(value))
      .filter(Boolean);
    return [
      '不发布到发现，继续私密匹配公开可发现候选人。',
      details.length ? `沿用当前交友需求：${details.join('，')}。` : '',
      '请搜索并排序真实公开候选，保留安全边界，推荐结果只在当前对话里展示。',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private friendPrivateMatchIdempotencyKey(
    taskId: number,
    slots: FriendSlots,
  ): string {
    const stableTarget =
      [
        slots.friendGoal,
        slots.city,
        slots.locationText,
        ...(slots.topicTags ?? []),
        slots.genderPreference,
        slots.bodyPreference,
        slots.appearancePreference,
      ]
        .map((value) => this.text(value))
        .filter(Boolean)
        .join(':') || 'current-friend';
    return `friend-private-match:${taskId}:${stableTarget
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9:_-]+/g, '-')}`;
  }

  private async resultWithCards(input: {
    task: AgentTask;
    assistantMessage: string;
    cards: SocialAgentIntentRouteResult['cards'];
    action: SocialAgentIntentRouteResult['action'];
  }): Promise<SocialAgentIntentRouteResult> {
    input.task.status = AgentTaskStatus.AwaitingFeedback;
    input.task.statusReason = `friend_loop_${input.action}`;
    const slots = this.readFriendSlots(input.task);
    const result: SocialAgentIntentRouteResult = {
      intent: 'social_search',
      confidence: 1,
      entities: {
        city: slots.city ?? '',
        activityType: '交友',
        targetGender: slots.genderPreference ?? '',
        timePreference: slots.timePreference ?? '',
        locationPreference: slots.locationText ?? slots.city ?? '',
      },
      shouldSearch: false,
      shouldReplan: false,
      shouldUpdateProfile: false,
      shouldExecuteAction: input.action === 'await_confirmation',
      replyStrategy:
        input.action === 'clarify'
          ? 'ask_clarifying_question'
          : input.action === 'await_confirmation'
            ? 'execute_action'
            : 'direct_reply',
      source: 'rules',
      action: input.action,
      taskId: input.task.id,
      assistantMessage: input.assistantMessage,
      assistantMessageSource: 'deterministic_route',
      savedContext: true,
      profileUpdated: false,
      shouldQueueRun: false,
      runMode: null,
      queuedRun: null,
      pendingApproval: null,
      activityResults: [],
      profileUpdateProposal: null,
      cards: input.cards,
      permissionMode: input.task.permissionMode,
      structuredIntent: {
        schemaVersion: 'fitmeet.friend-loop.v1',
        mode: 'friend_loop_mvp',
        stage: this.readFriendStage(input.task),
        slots,
      },
    };
    await this.messageLog.recordAssistantMessage(
      input.task,
      input.assistantMessage,
      result,
    );
    return result;
  }

  private rememberFriendSlots(
    task: AgentTask,
    slots: FriendSlots,
    stage: FriendLoopStage,
    extra: Record<string, unknown> = {},
  ): void {
    const memory = this.record(task.memory);
    task.memory = {
      ...memory,
      friendLoop: {
        ...this.record(memory.friendLoop),
        slots,
        stage,
        updatedAt: new Date().toISOString(),
        ...extra,
      },
    };
  }

  private readFriendSlots(task: AgentTask): FriendSlots {
    const memory = this.record(task.memory);
    const friendLoop = this.record(memory.friendLoop);
    return normalizeFriendSlots(friendLoop.slots as Partial<FriendSlots>);
  }

  private readFriendStage(task: AgentTask): string | null {
    const memory = this.record(task.memory);
    return this.text(this.record(memory.friendLoop).stage) || null;
  }

  private async assertTaskOwner(
    ownerUserId: number,
    taskId: number,
  ): Promise<AgentTask> {
    const task = await this.taskRepo.findOne({
      where: { id: taskId, ownerUserId },
    });
    if (!task) throw new BadRequestException('Agent task not found');
    return task;
  }

  private slotsFromPayload(value: unknown): FriendSlots {
    const payload = this.record(value);
    const slots = this.record(payload.slots);
    return normalizeFriendSlots({
      ...payload,
      ...slots,
      topicTags: this.stringList(payload.topicTags ?? slots.topicTags),
    });
  }

  private record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private text(value: unknown): string {
    return cleanDisplayText(value, '').trim();
  }

  private number(value: unknown): number | null {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  private stringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => this.text(item))
      .filter(Boolean)
      .slice(0, 8);
  }
}
