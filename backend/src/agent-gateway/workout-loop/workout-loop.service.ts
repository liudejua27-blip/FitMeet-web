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
import { buildClarificationBinaryCard } from '../clarification/clarification-binary-card.presenter';
import { AgentTask, AgentTaskStatus } from '../entities/agent-task.entity';
import type { FitMeetAlphaCard } from '../fitmeet-alpha-agent.types';
import { GeoResolverService } from '../geo/geo-resolver.service';
import { FitMeetLoopRouterService } from '../loop-router/fitmeet-loop-router.service';
import type { SocialAgentCardActionBody } from '../social-agent-action.types';
import { SocialAgentDraftPublicationService } from '../social-agent-draft-publication.service';
import { SocialAgentMessageLogService } from '../social-agent-message-log.service';
import type { SocialAgentIntentRouteResult } from '../social-agent-chat.types';
import type { WorkoutUnderstandingResult } from './workout-understanding.service';
import { WorkoutUnderstandingService } from './workout-understanding.service';
import { classifyWorkoutIntent } from './workout-intent-classifier';
import type { WorkoutLoopStage, WorkoutSlots } from './workout-loop.types';
import {
  defaultWorkoutSafetyBoundary,
  extractWorkoutSlots,
  validateWorkoutSlots,
  validateWorkoutSlotsForDraft,
  validateWorkoutSlotsForPublish,
} from './workout-slot-extractor';
import {
  buildWorkoutDraftCard,
  buildWorkoutIntakeCard,
} from './workout-card.presenter';

type WorkoutDraftForPublish = CreateSocialRequestDto & {
  socialRequestId?: number | null;
  timePreference?: string;
  locationName?: string;
  locationPreference?: string;
  safetyBoundary?: string;
};

@Injectable()
export class WorkoutLoopService {
  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    private readonly loopRouter: FitMeetLoopRouterService,
    private readonly messageLog: SocialAgentMessageLogService,
    @Optional()
    private readonly draftPublication?: SocialAgentDraftPublicationService,
    @Optional()
    private readonly geoResolver?: GeoResolverService,
    @Optional()
    private readonly understanding?: WorkoutUnderstandingService,
  ) {}

  async tryHandleEntrance(input: {
    ownerUserId: number;
    task: AgentTask;
    message: string;
    bypassRouter?: boolean;
    prefilledSlots?: WorkoutSlots;
    understanding?: WorkoutUnderstandingResult | null;
  }): Promise<{
    task: AgentTask;
    result: SocialAgentIntentRouteResult;
  } | null> {
    if (classifyWorkoutIntent(input.message) === 'negative') return null;
    const loopIntent = this.loopRouter.classify(input.message);
    if (
      !input.bypassRouter &&
      (loopIntent.intent !== 'workout' ||
        loopIntent.disposition !== 'accept_loop')
    ) {
      return null;
    }

    const slots = await this.prepareWorkoutSlots({
      task: input.task,
      message: input.message,
      loopIntent,
      prefilledSlots: input.prefilledSlots,
      understanding: input.understanding,
    });

    const result = await this.resultForSlots({
      ownerUserId: input.ownerUserId,
      task: input.task,
      slots,
      assistantMessage: '可以，我先帮你生成约练卡。',
    });
    return { task: input.task, result };
  }

  async confirmArbitratedWorkout(input: {
    ownerUserId: number;
    task: AgentTask;
    message: string;
    slots: WorkoutSlots;
    understanding?: WorkoutUnderstandingResult | null;
  }): Promise<{
    task: AgentTask;
    result: SocialAgentIntentRouteResult;
  }> {
    const slots = this.applyGeoToSlots(input.slots, input.message);
    const result = await this.resultForSlots({
      ownerUserId: input.ownerUserId,
      task: input.task,
      slots,
      assistantMessage: '我先帮你整理本次约练需求。',
    });
    return { task: input.task, result };
  }

  async continueEntrance(input: {
    ownerUserId: number;
    task: AgentTask;
    message: string;
  }): Promise<{
    task: AgentTask;
    result: SocialAgentIntentRouteResult;
  }> {
    const slots = await this.prepareWorkoutSlots({
      task: input.task,
      message: input.message,
    });
    const result = await this.resultForSlots({
      ownerUserId: input.ownerUserId,
      task: input.task,
      slots,
      assistantMessage: '已根据你补充的信息生成约练卡。',
    });
    return { task: input.task, result };
  }

  async startWorkoutIntake(input: {
    ownerUserId: number;
    taskId: number;
    payload?: Record<string, unknown>;
  }): Promise<SocialAgentIntentRouteResult> {
    const task = await this.assertTaskOwner(input.ownerUserId, input.taskId);
    const slots = {
      ...this.readWorkoutSlots(task),
      ...this.slotsFromPayload(input.payload ?? {}),
    };
    const validation = validateWorkoutSlots(slots);
    this.rememberWorkoutSlots(task, slots, 'intake');
    return this.resultWithCards({
      task,
      assistantMessage: '好的，我们先进入约练流程。我会帮你整理成约练卡。',
      cards: [
        buildWorkoutIntakeCard({
          taskId: task.id,
          slots,
          missing: validation.missing,
        }),
      ],
      action: 'clarify',
    });
  }

  async applyConfirmedSlots(input: {
    ownerUserId: number;
    taskId: number;
    payload: Record<string, unknown>;
  }): Promise<SocialAgentIntentRouteResult> {
    const task = await this.assertTaskOwner(input.ownerUserId, input.taskId);
    const slots = this.applyGeoToSlots(
      {
        ...this.readWorkoutSlots(task),
        ...this.slotsFromPayload(input.payload.yesPatch),
        ...this.slotsFromPayload(input.payload),
      },
      this.text(input.payload.locationText ?? input.payload.city),
    );
    const validation = validateWorkoutSlotsForPublish(slots);
    this.rememberWorkoutSlots(
      task,
      slots,
      validation.valid ? 'draft_ready' : 'intake',
    );
    if (!validation.valid) {
      return this.resultWithCards({
        task,
        assistantMessage: '已按你的确认继续，还需要补齐下面的信息。',
        cards: [
          buildWorkoutIntakeCard({
            taskId: task.id,
            slots,
            missing: validation.missing,
          }),
        ],
        action: 'clarify',
      });
    }
    return this.createDraftResult({
      ownerUserId: input.ownerUserId,
      task,
      slots,
      assistantMessage: '已按你的确认继续，我已经生成约练卡。',
    });
  }

  async openIntakeFromFallback(input: {
    ownerUserId: number;
    taskId: number;
    payload: Record<string, unknown>;
  }): Promise<SocialAgentIntentRouteResult> {
    const task = await this.assertTaskOwner(input.ownerUserId, input.taskId);
    const fallback = this.text(input.payload.noFallback);
    if (fallback && fallback !== 'workout_intake') {
      return this.resultWithCards({
        task,
        assistantMessage:
          '好的，这次先不按约练理解。你可以直接告诉我下一步想做什么。',
        cards: [],
        action: 'reply',
        intent: 'casual_chat',
      });
    }
    const slots = this.readWorkoutSlots(task);
    const validation = validateWorkoutSlots(slots);
    this.rememberWorkoutSlots(task, slots, 'intake');
    return this.resultWithCards({
      task,
      assistantMessage: '好的，我会换成填写卡，让你自己选择。',
      cards: [
        buildWorkoutIntakeCard({
          taskId: task.id,
          slots,
          missing: validation.missing,
        }),
      ],
      action: 'clarify',
    });
  }

  async performWorkoutAction(input: {
    ownerUserId: number;
    taskId: number;
    body: SocialAgentCardActionBody;
  }): Promise<SocialAgentIntentRouteResult> {
    const action = this.text(input.body.action);
    if (action === 'workout_intake.submit') {
      return this.submitIntake(input);
    }
    if (action === 'workout_intake.use_defaults') {
      return this.submitIntake(input, { useDefaults: true });
    }
    if (action === 'workout_intake.cancel') {
      const task = await this.assertTaskOwner(input.ownerUserId, input.taskId);
      this.rememberWorkoutSlots(task, this.readWorkoutSlots(task), 'intake');
      return this.resultWithCards({
        task,
        assistantMessage: '已取消这次约练卡，不会发布或匹配。',
        cards: [],
        action: 'reply',
        intent: 'action_request',
      });
    }
    if (action === 'workout_draft.private_match') {
      const task = await this.assertTaskOwner(input.ownerUserId, input.taskId);
      const slots = {
        ...this.readWorkoutSlots(task),
        ...this.slotsFromPayload(input.body.payload),
      };
      this.rememberWorkoutSlots(task, slots, 'draft_ready');
      return this.resultWithCards({
        task,
        assistantMessage:
          '已保存为不公开约练卡。MVP 阶段不会公开展示；后续可继续从这里修改或发布。',
        cards: [],
        action: 'reply',
        intent: 'action_request',
      });
    }
    if (action === 'workout_draft.edit') {
      const task = await this.assertTaskOwner(input.ownerUserId, input.taskId);
      const slots = {
        ...this.readWorkoutSlots(task),
        ...this.slotsFromPayload(input.body.payload),
      };
      const validation = validateWorkoutSlots(slots);
      this.rememberWorkoutSlots(task, slots, 'intake');
      return this.resultWithCards({
        task,
        assistantMessage: '可以，我们继续修改这张约练卡。',
        cards: [
          buildWorkoutIntakeCard({
            taskId: task.id,
            slots,
            missing: validation.missing,
          }),
        ],
        action: 'clarify',
      });
    }
    if (action === 'workout_draft.cancel') {
      return this.cancelDraft(input);
    }
    throw new BadRequestException('Unsupported workout action');
  }

  private async prepareWorkoutSlots(input: {
    task: AgentTask;
    message: string;
    loopIntent?: ReturnType<FitMeetLoopRouterService['classify']>;
    prefilledSlots?: WorkoutSlots;
    understanding?: WorkoutUnderstandingResult | null;
  }): Promise<WorkoutSlots> {
    const ruleSlots = input.prefilledSlots
      ? this.normalizeSlots(input.prefilledSlots)
      : extractWorkoutSlots({
          message: input.message,
          previousSlots: this.readWorkoutSlots(input.task),
        });
    let slots = this.applyGeoToSlots(ruleSlots, input.message);
    let understanding = input.understanding ?? null;
    const loopIntent =
      input.loopIntent ?? this.loopRouter.classify(input.message);
    if (
      !understanding &&
      this.understanding?.shouldCall({ slots, loopIntent })
    ) {
      understanding = await this.understanding.understand({
        task: input.task,
        message: input.message,
        ruleSlots: slots,
        loopIntent,
      });
    }
    const understandingSlots =
      this.understanding?.slotsFromUnderstanding(understanding) ?? {};
    slots = this.applyGeoToSlots(
      this.normalizeSlots({
        ...understandingSlots,
        ...ruleSlots,
        ...this.compactSlots(input.prefilledSlots ?? {}),
      }),
      input.message,
    );
    return slots;
  }

  private async resultForSlots(input: {
    ownerUserId: number;
    task: AgentTask;
    slots: WorkoutSlots;
    assistantMessage: string;
  }): Promise<SocialAgentIntentRouteResult> {
    const draftValidation = validateWorkoutSlotsForDraft(input.slots);
    this.rememberWorkoutSlots(input.task, input.slots, 'intake');

    if (!draftValidation.valid) {
      return this.resultWithCards({
        task: input.task,
        assistantMessage: input.assistantMessage + ' 还需要补充下面这些信息。',
        cards: [
          buildWorkoutIntakeCard({
            taskId: input.task.id,
            slots: input.slots,
            missing: draftValidation.missing,
          }),
        ],
        action: 'clarify',
      });
    }

    if (this.needsGeoConfirmation(input.slots)) {
      return this.geoClarificationResult({
        task: input.task,
        slots: input.slots,
        confidence: input.slots.geoResolution?.confidence,
        question:
          input.slots.geoResolution?.confirmationQuestion ??
          this.workoutConfirmationQuestion(input.slots),
      });
    }

    const publishValidation = validateWorkoutSlotsForPublish(input.slots);
    if (!publishValidation.valid) {
      return this.resultWithCards({
        task: input.task,
        assistantMessage: '发布约练卡前还需要补齐地点城市信息。',
        cards: [
          buildWorkoutIntakeCard({
            taskId: input.task.id,
            slots: input.slots,
            missing: publishValidation.missing,
          }),
        ],
        action: 'clarify',
      });
    }

    return this.createDraftResult({
      ownerUserId: input.ownerUserId,
      task: input.task,
      slots: input.slots,
      assistantMessage: input.assistantMessage,
    });
  }

  private async geoClarificationResult(input: {
    task: AgentTask;
    slots: WorkoutSlots;
    question: string;
    confidence?: number | null;
  }): Promise<SocialAgentIntentRouteResult> {
    this.rememberWorkoutSlots(input.task, input.slots, 'clarifying');
    const yesPatch = this.confirmedGeoSlots(input.slots);
    return this.resultWithCards({
      task: input.task,
      assistantMessage: '我先确认一下你的约练地点和需求。',
      cards: [
        buildClarificationBinaryCard({
          taskId: input.task.id,
          questionKey: 'confirm_workout_geo',
          body: input.question,
          inferredIntent: 'workout',
          inferredSlots: input.slots as Record<string, unknown>,
          yesPatch: yesPatch as Record<string, unknown>,
          noFallback: 'workout_intake',
          confidence: input.confidence ?? input.slots.geoResolution?.confidence,
        }),
      ],
      action: 'clarify',
    });
  }

  private applyGeoToSlots(slots: WorkoutSlots, message: string): WorkoutSlots {
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
    return this.normalizeSlots({
      ...slots,
      locationText: geo.locationText ?? slots.locationText,
      city: geo.city ?? slots.city,
      district: geo.district ?? slots.district,
      poiName: geo.poiName ?? slots.poiName,
      lat: geo.lat ?? slots.lat,
      lng: geo.lng ?? slots.lng,
      geoResolution: geo,
    });
  }

  private needsGeoConfirmation(slots: WorkoutSlots): boolean {
    const geo = slots.geoResolution;
    if (!geo?.needsConfirmation) return false;
    if (!geo.city) return false;
    return geo.source !== 'explicit_city' && geo.source !== 'user_confirmed';
  }

  private confirmedGeoSlots(slots: WorkoutSlots): WorkoutSlots {
    return this.normalizeSlots({
      ...slots,
      geoResolution: {
        ...(slots.geoResolution ?? {
          rawText: slots.locationText ?? slots.city ?? '',
          confidence: 1,
          needsConfirmation: false,
        }),
        source: 'user_confirmed',
        confidence: 1,
        needsConfirmation: false,
      },
    });
  }

  private workoutConfirmationQuestion(slots: WorkoutSlots): string {
    const location = slots.city
      ? `${slots.city}${slots.locationText ?? ''}`
      : (slots.locationText ?? '这个地点');
    return `我理解为：${slots.timePreference ?? '近期'}在${location}找${slots.activityType ?? '运动'}搭子，对吗？`;
  }

  private compactSlots(slots: Partial<WorkoutSlots>): Partial<WorkoutSlots> {
    return Object.fromEntries(
      Object.entries(slots).filter(([, value]) => value !== undefined),
    ) as Partial<WorkoutSlots>;
  }

  private async submitIntake(
    input: {
      ownerUserId: number;
      taskId: number;
      body: SocialAgentCardActionBody;
    },
    options: { useDefaults?: boolean } = {},
  ): Promise<SocialAgentIntentRouteResult> {
    const task = await this.assertTaskOwner(input.ownerUserId, input.taskId);
    const payloadSlots = this.slotsFromPayload(input.body.payload);
    const slots = this.applyGeoToSlots(
      {
        ...this.readWorkoutSlots(task),
        ...payloadSlots,
        ...(options.useDefaults
          ? {
              safetyBoundary:
                payloadSlots.safetyBoundary ?? defaultWorkoutSafetyBoundary(),
              radiusKm: payloadSlots.radiusKm ?? 3,
              visibilityPreference:
                payloadSlots.visibilityPreference ?? 'public',
            }
          : {}),
      },
      [payloadSlots.city, payloadSlots.locationText, payloadSlots.poiName]
        .filter(Boolean)
        .join(' '),
    );
    return this.resultForSlots({
      ownerUserId: input.ownerUserId,
      task,
      slots,
      assistantMessage: options.useDefaults
        ? '已使用默认安全设置继续，我正在生成约练卡。'
        : '已收到约练需求，我正在生成约练卡。',
    });
  }

  private async cancelDraft(input: {
    ownerUserId: number;
    taskId: number;
    body: SocialAgentCardActionBody;
  }): Promise<SocialAgentIntentRouteResult> {
    const task = await this.assertTaskOwner(input.ownerUserId, input.taskId);
    const payload = this.record(input.body.payload);
    await this.draftPublication?.dismissDraft(input.ownerUserId, input.taskId, {
      ...payload,
      action: 'workout_draft.cancel',
      taskId: input.taskId,
    });
    this.rememberWorkoutSlots(task, this.readWorkoutSlots(task), 'intake');
    return this.resultWithCards({
      task,
      assistantMessage: '已取消这次约练卡，不会发布或匹配。',
      cards: [],
      action: 'reply',
      intent: 'action_request',
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

  private async createDraftResult(input: {
    ownerUserId: number;
    task: AgentTask;
    slots: WorkoutSlots;
    assistantMessage?: string;
  }): Promise<SocialAgentIntentRouteResult> {
    if (!this.draftPublication) {
      throw new BadRequestException(
        'Workout draft publication runtime unavailable',
      );
    }
    const draft = this.buildSocialRequestDraft(input.task.id, input.slots);
    const staged = await this.draftPublication.stagePrivateDraftForPublish(
      input.ownerUserId,
      input.task.id,
      draft,
    );
    const stagedDraft = staged.draft as WorkoutDraftForPublish & {
      socialRequestId: number;
    };
    this.rememberWorkoutSlots(staged.task, input.slots, 'draft_ready', {
      socialRequestId: staged.socialRequestId,
      socialRequestDraft: stagedDraft,
    });
    return this.resultWithCards({
      task: staged.task,
      assistantMessage:
        input.assistantMessage ??
        '我已经帮你整理成一张约练卡，确认后再发布，不会自动公开。',
      cards: [
        buildWorkoutDraftCard({
          taskId: staged.task.id,
          slots: input.slots,
          draft: stagedDraft,
        }),
      ],
      action: 'await_confirmation',
    });
  }

  private buildSocialRequestDraft(
    taskId: number,
    slots: WorkoutSlots,
  ): WorkoutDraftForPublish {
    const activityType = slots.activityType ?? '运动';
    const city = sanitizeCity(
      slots.city ?? this.cityFromLocation(slots.locationText),
    );
    if (!city) {
      throw new BadRequestException('Workout city is required before publish');
    }
    const location = slots.locationText ?? city;
    const title = `${slots.timePreference ?? '近期'}${location}${activityType}约练`;
    const description = [
      `${slots.timePreference ?? '近期'}在${location}找${activityType}搭子。`,
      slots.intensity ? `强度：${slots.intensity}。` : '',
      slots.candidatePreference
        ? `匹配偏好：${slots.candidatePreference}。`
        : '',
      slots.safetyBoundary ?? defaultWorkoutSafetyBoundary(),
    ]
      .filter(Boolean)
      .join('');
    return {
      type: this.socialRequestType(activityType),
      title,
      description,
      rawText: description,
      city,
      lat: slots.lat,
      lng: slots.lng,
      radiusKm: slots.radiusKm ?? 3,
      interestTags: [activityType, slots.intensity].filter(
        (item): item is string => Boolean(item),
      ),
      activityType,
      safetyRequirement: SocialRequestSafety.LowRiskOnly,
      visibility: SocialRequestVisibility.Private,
      status: UserSocialRequestStatus.Draft,
      source: SocialRequestSource.FitMeetAgent,
      agentAllowed: true,
      requireUserConfirmation: true,
      timePreference: slots.timePreference,
      locationName: location,
      locationPreference: location,
      safetyBoundary: slots.safetyBoundary ?? defaultWorkoutSafetyBoundary(),
      metadata: {
        agentTaskId: taskId,
        loop: 'workout',
        source: 'workout_loop_mvp',
        workoutLoopStage: 'draft_ready',
        activityType,
        timePreference: slots.timePreference ?? null,
        locationText: slots.locationText ?? null,
        city,
        district: slots.district ?? null,
        poiName: slots.poiName ?? null,
        lat: slots.lat ?? null,
        lng: slots.lng ?? null,
        geoResolution: slots.geoResolution ?? null,
        radiusKm: slots.radiusKm ?? 3,
        intensity: slots.intensity ?? null,
        candidatePreference: slots.candidatePreference ?? null,
        safetyBoundary: slots.safetyBoundary ?? defaultWorkoutSafetyBoundary(),
        visibilityPreference: slots.visibilityPreference ?? 'public',
      },
    };
  }

  private async resultWithCards(input: {
    task: AgentTask;
    assistantMessage: string;
    cards: FitMeetAlphaCard[];
    action: SocialAgentIntentRouteResult['action'];
    intent?: SocialAgentIntentRouteResult['intent'];
    publicLoop?: SocialAgentIntentRouteResult['publicLoop'];
  }): Promise<SocialAgentIntentRouteResult> {
    input.task.status = AgentTaskStatus.AwaitingFeedback;
    input.task.statusReason = `workout_loop_${input.action}`;
    const result: SocialAgentIntentRouteResult = {
      intent: input.intent ?? 'social_search',
      confidence: 1,
      entities: {
        city: this.readWorkoutSlots(input.task).city ?? '',
        activityType: this.readWorkoutSlots(input.task).activityType ?? '',
        targetGender: '',
        timePreference: this.readWorkoutSlots(input.task).timePreference ?? '',
        locationPreference:
          this.readWorkoutSlots(input.task).locationText ?? '',
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
      publicLoop: input.publicLoop,
      permissionMode: input.task.permissionMode,
      structuredIntent: {
        schemaVersion: 'fitmeet.workout-loop.v1',
        mode: 'workout_loop_mvp',
        stage: this.readWorkoutStage(input.task),
        slots: this.readWorkoutSlots(input.task),
      },
    };
    await this.messageLog.recordAssistantMessage(
      input.task,
      input.assistantMessage,
      result,
    );
    return result;
  }

  private rememberWorkoutSlots(
    task: AgentTask,
    slots: WorkoutSlots,
    stage: WorkoutLoopStage,
    extra: Record<string, unknown> = {},
  ): void {
    const memory = this.record(task.memory);
    task.memory = {
      ...memory,
      workoutLoop: {
        ...this.record(memory.workoutLoop),
        slots,
        stage,
        updatedAt: new Date().toISOString(),
        ...extra,
      },
    };
  }

  private readWorkoutSlots(task: AgentTask): WorkoutSlots {
    const memory = this.record(task.memory);
    const workoutLoop = this.record(memory.workoutLoop);
    return this.normalizeSlots(workoutLoop.slots);
  }

  private readWorkoutStage(task: AgentTask): string | null {
    const memory = this.record(task.memory);
    return this.text(this.record(memory.workoutLoop).stage) || null;
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

  private slotsFromPayload(value: unknown): WorkoutSlots {
    const payload = this.record(value);
    const slots = this.record(payload.slots);
    return this.normalizeSlots({
      ...payload,
      ...slots,
    });
  }

  private normalizeSlots(value: unknown): WorkoutSlots {
    const record = this.record(value);
    const visibility = this.text(record.visibilityPreference);
    const geoResolution = this.normalizeGeoResolution(record.geoResolution);
    return {
      activityType: this.text(record.activityType) || undefined,
      timePreference: this.text(record.timePreference) || undefined,
      locationText:
        this.text(record.locationText ?? record.locationPreference) ||
        undefined,
      city: this.text(record.city) || undefined,
      district: this.text(record.district) || undefined,
      poiName: this.text(record.poiName) || undefined,
      lat: this.coordinate(record.lat) ?? undefined,
      lng: this.coordinate(record.lng) ?? undefined,
      geoResolution,
      radiusKm: this.number(record.radiusKm) ?? undefined,
      intensity: this.text(record.intensity) || undefined,
      candidatePreference: this.text(record.candidatePreference) || undefined,
      safetyBoundary:
        this.text(record.safetyBoundary) || defaultWorkoutSafetyBoundary(),
      visibilityPreference:
        visibility === 'private' || visibility === 'public'
          ? visibility
          : 'public',
    };
  }

  private socialRequestType(activityType: string): SocialRequestType {
    if (/跑步|慢跑/.test(activityType)) return SocialRequestType.RunningPartner;
    if (/健身|撸铁|瑜伽|游泳/.test(activityType))
      return SocialRequestType.FitnessPartner;
    if (/散步|徒步|骑行/.test(activityType)) return SocialRequestType.CityWalk;
    return SocialRequestType.Custom;
  }

  private cityFromLocation(value: string | undefined): string | undefined {
    if (!value) return undefined;
    return [
      '北京',
      '上海',
      '广州',
      '深圳',
      '杭州',
      '成都',
      '重庆',
      '南京',
      '苏州',
      '武汉',
      '西安',
      '长沙',
      '郑州',
      '天津',
      '青岛',
      '济南',
      '厦门',
      '宁波',
      '合肥',
    ].find((city) => value.includes(city));
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
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  private coordinate(value: unknown): number | null {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  private normalizeGeoResolution(
    value: unknown,
  ): WorkoutSlots['geoResolution'] | undefined {
    const record = this.record(value);
    const rawText = this.text(record.rawText);
    if (!rawText && Object.keys(record).length === 0) return undefined;
    const source = this.geoSource(record.source);
    return {
      rawText,
      locationText: this.text(record.locationText) || undefined,
      city: this.text(record.city) || undefined,
      district: this.text(record.district) || undefined,
      poiName: this.text(record.poiName) || undefined,
      province: this.text(record.province) || undefined,
      lat: this.coordinate(record.lat) ?? undefined,
      lng: this.coordinate(record.lng) ?? undefined,
      source,
      confidence: this.coordinate(record.confidence) ?? 0,
      needsConfirmation: record.needsConfirmation === true,
      confirmationQuestion: this.text(record.confirmationQuestion) || undefined,
    };
  }

  private geoSource(
    value: unknown,
  ): NonNullable<WorkoutSlots['geoResolution']>['source'] {
    const source = this.text(value);
    if (
      source === 'explicit_city' ||
      source === 'poi_dictionary' ||
      source === 'profile_city' ||
      source === 'client_geo' ||
      source === 'llm_inferred' ||
      source === 'user_confirmed' ||
      source === 'unknown'
    ) {
      return source;
    }
    return 'unknown';
  }
}
