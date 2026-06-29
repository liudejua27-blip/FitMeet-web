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
import { MatchingJobService } from '../matching-job.service';
import type { SocialAgentCardActionBody } from '../social-agent-action.types';
import type { SocialAgentIntentRouteResult } from '../social-agent-chat.types';
import { SocialAgentDraftPublicationService } from '../social-agent-draft-publication.service';
import { SocialAgentMessageLogService } from '../social-agent-message-log.service';
import {
  buildTravelDraftCard,
  buildTravelIntakeCard,
} from './travel-card.presenter';
import { TravelAgentBrainService } from './travel-agent-brain.service';
import type { TravelLoopStage, TravelSlots } from './travel-loop.types';
import {
  defaultTravelSafetyBoundary,
  extractTravelSlots,
  normalizeTravelSlots,
  validateTravelSlots,
} from './travel-slot-extractor';

type TravelDraftForPublish = CreateSocialRequestDto & {
  socialRequestId?: number | null;
  timePreference?: string;
  locationName?: string;
  locationPreference?: string;
  safetyBoundary?: string;
};

@Injectable()
export class TravelLoopService {
  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    private readonly messageLog: SocialAgentMessageLogService,
    @Optional()
    private readonly draftPublication?: SocialAgentDraftPublicationService,
    @Optional()
    private readonly matchingJobs?: MatchingJobService,
    @Optional()
    private readonly travelBrain?: TravelAgentBrainService,
  ) {}

  async tryHandleEntrance(input: {
    ownerUserId: number;
    task: AgentTask;
    message: string;
  }): Promise<{ task: AgentTask; result: SocialAgentIntentRouteResult }> {
    const slots = extractTravelSlots({
      message: input.message,
      previousSlots: this.readTravelSlots(input.task),
    });
    const decision = await this.travelBrain?.decideEntrance({
      task: input.task,
      message: input.message,
      slots,
    });
    const result = await this.intakeResultForSlots({
      task: input.task,
      slots: decision?.slots ?? slots,
      assistantMessage:
        '可以，我先帮你整理结伴旅行需求。确认下面信息后，我再生成寻伴旅行卡。',
    });
    return { task: input.task, result };
  }

  async continueEntrance(input: {
    ownerUserId: number;
    task: AgentTask;
    message: string;
  }): Promise<{ task: AgentTask; result: SocialAgentIntentRouteResult }> {
    const slots = extractTravelSlots({
      message: input.message,
      previousSlots: this.readTravelSlots(input.task),
    });
    const decision = await this.travelBrain?.decideEntrance({
      task: input.task,
      message: input.message,
      slots,
    });
    const result = await this.intakeResultForSlots({
      task: input.task,
      slots: decision?.slots ?? slots,
      assistantMessage:
        '已根据你补充的信息更新旅行寻伴需求。确认下面信息后，我再生成旅行寻伴卡。',
    });
    return { task: input.task, result };
  }

  async startTravelIntake(input: {
    ownerUserId: number;
    taskId: number;
    payload?: Record<string, unknown>;
  }): Promise<SocialAgentIntentRouteResult> {
    const task = await this.assertTaskOwner(input.ownerUserId, input.taskId);
    const slots = normalizeTravelSlots({
      ...this.readTravelSlots(task),
      ...this.slotsFromPayload(input.payload ?? {}),
    });
    return this.intakeResultForSlots({
      task,
      slots,
      assistantMessage:
        '好的，我们先进入旅游闭环。我会帮你整理成一张旅行寻伴卡。',
    });
  }

  async performTravelAction(input: {
    ownerUserId: number;
    taskId: number;
    body: SocialAgentCardActionBody;
  }): Promise<SocialAgentIntentRouteResult> {
    const action = this.text(input.body.action);
    if (
      action === 'travel_intake.submit' ||
      action === 'travel_intake.use_defaults'
    ) {
      return this.submitIntake(input);
    }
    if (action === 'travel_intake.cancel') {
      const task = await this.assertTaskOwner(input.ownerUserId, input.taskId);
      this.rememberTravelSlots(task, this.readTravelSlots(task), 'cancelled');
      return this.resultWithCards({
        task,
        assistantMessage: '已取消这次旅行寻伴卡，不会匹配或联系任何人。',
        cards: [],
        action: 'reply',
      });
    }
    if (action === 'travel_draft.edit') {
      const task = await this.assertTaskOwner(input.ownerUserId, input.taskId);
      return this.intakeResultForSlots({
        task,
        slots: this.readTravelSlots(task),
        assistantMessage: '可以，继续修改这次旅行寻伴需求。',
      });
    }
    if (action === 'travel_draft.cancel') {
      const task = await this.assertTaskOwner(input.ownerUserId, input.taskId);
      await this.draftPublication?.dismissDraft(
        input.ownerUserId,
        input.taskId,
        {
          ...this.record(input.body.payload),
          action: 'travel_draft.cancel',
          taskId: input.taskId,
        },
      );
      this.rememberTravelSlots(task, this.readTravelSlots(task), 'cancelled');
      return this.resultWithCards({
        task,
        assistantMessage: '已取消这次旅行寻伴卡，不会匹配或联系任何人。',
        cards: [],
        action: 'reply',
      });
    }
    if (action === 'travel_draft.private_match') {
      const task = await this.assertTaskOwner(input.ownerUserId, input.taskId);
      const slots = normalizeTravelSlots({
        ...this.readTravelSlots(task),
        ...this.slotsFromPayload(input.body.payload),
      });
      return this.privateMatchResult({ task, slots, body: input.body });
    }
    throw new BadRequestException('Unsupported travel loop action');
  }

  private async submitIntake(input: {
    ownerUserId: number;
    taskId: number;
    body: SocialAgentCardActionBody;
  }): Promise<SocialAgentIntentRouteResult> {
    const task = await this.assertTaskOwner(input.ownerUserId, input.taskId);
    const slots = normalizeTravelSlots({
      ...this.readTravelSlots(task),
      ...this.slotsFromPayload(input.body.payload),
    });
    const validation = validateTravelSlots(slots);
    const decision = this.travelBrain?.decideIntakeSubmit({
      slots,
      validation,
    });
    const action =
      decision?.action ?? (validation.valid ? 'CREATE_DRAFT' : 'ASK_INTAKE');
    if (action === 'ASK_INTAKE') {
      return this.intakeResultForSlots({
        task,
        slots: decision?.slots ?? slots,
        assistantMessage:
          '还需要补齐目的地、出发时间、预算和交通方式，才能生成旅行寻伴卡。',
      });
    }
    return this.createDraftResult({
      ownerUserId: input.ownerUserId,
      task,
      slots: decision?.slots ?? slots,
      assistantMessage: '已收到旅行需求，我正在生成寻伴旅行卡。',
    });
  }

  private async intakeResultForSlots(input: {
    task: AgentTask;
    slots: TravelSlots;
    assistantMessage: string;
  }): Promise<SocialAgentIntentRouteResult> {
    const validation = validateTravelSlots(input.slots);
    this.rememberTravelSlots(input.task, input.slots, 'intake');
    return this.resultWithCards({
      task: input.task,
      assistantMessage: input.assistantMessage,
      cards: [
        buildTravelIntakeCard({
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
    slots: TravelSlots;
    assistantMessage: string;
  }): Promise<SocialAgentIntentRouteResult> {
    if (!this.draftPublication) {
      throw new BadRequestException(
        'Travel draft publication runtime unavailable',
      );
    }
    const draft = this.buildSocialRequestDraft(input.task.id, input.slots);
    const staged = await this.draftPublication.stagePrivateDraftForPublish(
      input.ownerUserId,
      input.task.id,
      draft,
    );
    const stagedDraft = staged.draft as TravelDraftForPublish & {
      socialRequestId: number;
    };
    this.rememberTravelSlots(staged.task, input.slots, 'draft_ready', {
      socialRequestId: staged.socialRequestId,
      socialRequestDraft: stagedDraft,
    });
    return this.resultWithCards({
      task: staged.task,
      assistantMessage:
        input.assistantMessage ??
        '我已经帮你整理成一张旅行寻伴卡，确认后进入私密匹配。',
      cards: [
        buildTravelDraftCard({
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
    slots: TravelSlots;
    body: SocialAgentCardActionBody;
  }): Promise<SocialAgentIntentRouteResult> {
    const payload = this.record(input.body.payload);
    const socialRequestDraft = this.record(payload.socialRequestDraft);
    const socialRequestId = this.number(
      payload.socialRequestId ?? socialRequestDraft.socialRequestId,
    );
    const idempotencyKey =
      input.body.idempotencyKey ??
      this.travelPrivateMatchIdempotencyKey(input.task.id, input.slots);
    const privateMatchingJob = await this.enqueuePrivateMatchingJob({
      task: input.task,
      slots: input.slots,
      socialRequestId,
      idempotencyKey,
    });
    this.rememberTravelSlots(input.task, input.slots, 'matching_queued', {
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
      ? 'travel_private_matching_queued'
      : 'travel_loop_matching_queued';
    await this.taskRepo.save(input.task);

    const assistantMessage =
      '已保存为不公开旅行寻伴卡。我会只在当前对话里为你筛选公开可发现的候选人。';
    const result: SocialAgentIntentRouteResult = {
      intent: 'social_search',
      confidence: 1,
      entities: {
        city: this.destinationCity(input.slots) ?? '',
        activityType: '结伴旅行',
        targetGender: input.slots.genderPreference ?? '',
        timePreference: input.slots.departureTime ?? '',
        locationPreference: input.slots.destination ?? '',
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
        schemaVersion: 'fitmeet.travel-loop.v1',
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
        message: this.travelPrivateMatchMessage(input.slots),
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
    slots: TravelSlots;
    socialRequestId: number | null;
    idempotencyKey: string;
  }): Promise<MatchingJob | null> {
    if (!this.matchingJobs || !input.socialRequestId) return null;
    const sourceVersion = this.privateMatchSourceVersion(input.slots);
    const publicIntentId = `private-travel:${input.task.id}:${input.socialRequestId}`;
    const { job } = await this.matchingJobs.enqueue({
      ownerUserId: input.task.ownerUserId,
      linkedSocialRequestId: input.socialRequestId,
      publicIntentId,
      sourceVersion,
      idempotencyKey: input.idempotencyKey,
      metadata: {
        taskId: input.task.id,
        socialRequestId: input.socialRequestId,
        source: 'travel_private_match',
        visibility: 'private',
        privateMatchMode: true,
        publicDiscoverPublishSkipped: true,
        travelLoopStage: 'matching_queued',
        slots: input.slots,
      },
    });
    return job;
  }

  private buildSocialRequestDraft(
    taskId: number,
    slots: TravelSlots,
  ): TravelDraftForPublish {
    const destination = slots.destination ?? '目的地待定';
    const city = this.destinationCity(slots) ?? '';
    const tags = slots.tags?.length ? slots.tags : ['结伴旅行', destination];
    const title = `${destination}旅行寻伴`;
    const description = [
      `想找人一起去${destination}。`,
      slots.departureTime ? `出发时间：${slots.departureTime}。` : '',
      slots.duration ? `行程时长：${slots.duration}。` : '',
      slots.budgetRange ? `预算：${slots.budgetRange}。` : '',
      slots.transportMode ? `交通方式：${slots.transportMode}。` : '',
      tags.length ? `偏好标签：${tags.join('、')}。` : '',
      slots.genderPreference ? `性别偏好：${slots.genderPreference}。` : '',
      slots.photoPreference ? `拍照偏好：${slots.photoPreference}。` : '',
      slots.accommodationPreference
        ? `住宿偏好：${slots.accommodationPreference}。`
        : '',
      slots.foodPreference ? `饮食偏好：${slots.foodPreference}。` : '',
      slots.candidatePreference
        ? `匹配偏好：${slots.candidatePreference}。`
        : '',
      slots.safetyBoundary ?? defaultTravelSafetyBoundary(),
    ]
      .filter(Boolean)
      .join('');
    return {
      type: SocialRequestType.Custom,
      title,
      description,
      rawText: description,
      city,
      radiusKm: 30,
      interestTags: tags,
      activityType: '结伴旅行',
      safetyRequirement: SocialRequestSafety.LowRiskOnly,
      visibility: SocialRequestVisibility.Private,
      status: UserSocialRequestStatus.Draft,
      source: SocialRequestSource.FitMeetAgent,
      agentAllowed: true,
      requireUserConfirmation: true,
      timePreference: slots.departureTime,
      locationName: destination,
      locationPreference: destination,
      safetyBoundary: slots.safetyBoundary ?? defaultTravelSafetyBoundary(),
      metadata: {
        agentTaskId: taskId,
        loop: 'travel',
        source: 'travel_loop_mvp',
        travelLoopStage: 'draft_ready',
        destination,
        departureTime: slots.departureTime ?? null,
        duration: slots.duration ?? null,
        budgetRange: slots.budgetRange ?? null,
        transportMode: slots.transportMode ?? null,
        tags,
        genderPreference: slots.genderPreference ?? null,
        photoPreference: slots.photoPreference ?? null,
        accommodationPreference: slots.accommodationPreference ?? null,
        foodPreference: slots.foodPreference ?? null,
        candidatePreference: slots.candidatePreference ?? null,
        city: slots.city ?? null,
        geoResolution: slots.geoResolution ?? null,
        safetyBoundary: slots.safetyBoundary ?? defaultTravelSafetyBoundary(),
        visibilityPreference: 'private',
      },
    };
  }

  private privateMatchSourceVersion(slots: TravelSlots): string {
    const parts = [
      slots.destination,
      slots.departureTime,
      slots.duration,
      slots.budgetRange,
      slots.transportMode,
      slots.city,
      ...(slots.tags ?? []),
      slots.candidatePreference,
    ]
      .map((value) => this.text(value))
      .filter(Boolean);
    return `travel-private:${parts.join('|') || 'current'}`.slice(0, 128);
  }

  private travelPrivateMatchMessage(slots: TravelSlots): string {
    const details = [
      slots.destination,
      slots.departureTime,
      slots.duration,
      slots.budgetRange,
      slots.transportMode,
      ...(slots.tags ?? []),
      slots.candidatePreference,
    ]
      .map((value) => this.text(value))
      .filter(Boolean);
    return [
      '不发布到发现，继续私密匹配公开可发现旅行候选人。',
      details.length ? `沿用当前旅行寻伴需求：${details.join('，')}。` : '',
      '请搜索并排序真实公开候选，保留安全边界，推荐结果只在当前对话里展示。',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private travelPrivateMatchIdempotencyKey(
    taskId: number,
    slots: TravelSlots,
  ): string {
    const stableTarget =
      [slots.destination, slots.departureTime, slots.budgetRange]
        .map((value) => this.text(value))
        .filter(Boolean)
        .join(':') || 'current-travel';
    return `travel-private-match:${taskId}:${stableTarget
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
    input.task.statusReason = `travel_loop_${input.action}`;
    const slots = this.readTravelSlots(input.task);
    const result: SocialAgentIntentRouteResult = {
      intent: 'social_search',
      confidence: 1,
      entities: {
        city: this.destinationCity(slots) ?? '',
        activityType: '结伴旅行',
        targetGender: slots.genderPreference ?? '',
        timePreference: slots.departureTime ?? '',
        locationPreference: slots.destination ?? '',
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
        schemaVersion: 'fitmeet.travel-loop.v1',
        mode: 'travel_loop_mvp',
        stage: this.readTravelStage(input.task),
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

  private rememberTravelSlots(
    task: AgentTask,
    slots: TravelSlots,
    stage: TravelLoopStage,
    extra: Record<string, unknown> = {},
  ): void {
    const memory = this.record(task.memory);
    task.memory = {
      ...memory,
      travelLoop: {
        ...this.record(memory.travelLoop),
        slots,
        stage,
        updatedAt: new Date().toISOString(),
        ...extra,
      },
    };
  }

  private readTravelSlots(task: AgentTask): TravelSlots {
    const memory = this.record(task.memory);
    const travelLoop = this.record(memory.travelLoop);
    return normalizeTravelSlots(travelLoop.slots as Partial<TravelSlots>);
  }

  private readTravelStage(task: AgentTask): string | null {
    const memory = this.record(task.memory);
    return this.text(this.record(memory.travelLoop).stage) || null;
  }

  private destinationCity(slots: TravelSlots): string | null {
    return sanitizeCity(slots.city) || sanitizeCity(slots.destination) || null;
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

  private slotsFromPayload(value: unknown): TravelSlots {
    const payload = this.record(value);
    const slots = this.record(payload.slots);
    const geoResolution = this.record(
      payload.geoResolution ?? slots.geoResolution,
    );
    return normalizeTravelSlots({
      ...payload,
      ...slots,
      ...(geoResolution.rawText
        ? { geoResolution: geoResolution as TravelSlots['geoResolution'] }
        : {}),
      tags: this.stringList(payload.tags ?? slots.tags),
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
