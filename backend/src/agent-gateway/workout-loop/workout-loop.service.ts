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
import { FitMeetLoopRouterService } from '../loop-router/fitmeet-loop-router.service';
import type { SocialAgentCardActionBody } from '../social-agent-action.types';
import { SocialAgentDraftPublicationService } from '../social-agent-draft-publication.service';
import { SocialAgentMessageLogService } from '../social-agent-message-log.service';
import type { SocialAgentIntentRouteResult } from '../social-agent-chat.types';
import { classifyWorkoutIntent } from './workout-intent-classifier';
import type { WorkoutLoopStage, WorkoutSlots } from './workout-loop.types';
import {
  defaultWorkoutSafetyBoundary,
  extractWorkoutSlots,
  validateWorkoutSlots,
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
  ) {}

  async tryHandleEntrance(input: {
    ownerUserId: number;
    task: AgentTask;
    message: string;
  }): Promise<{
    task: AgentTask;
    result: SocialAgentIntentRouteResult;
  } | null> {
    if (classifyWorkoutIntent(input.message) === 'negative') return null;
    const loopIntent = this.loopRouter.classify(input.message);
    if (loopIntent.intent !== 'workout') return null;

    const slots = extractWorkoutSlots({
      message: input.message,
      previousSlots: this.readWorkoutSlots(input.task),
    });
    this.rememberWorkoutSlots(input.task, slots, 'intake');
    const validation = validateWorkoutSlots(slots);

    if (!validation.valid) {
      const result = await this.resultWithCards({
        task: input.task,
        assistantMessage: '可以，我先帮你生成约练卡。还需要补充下面这些信息。',
        cards: [
          buildWorkoutIntakeCard({
            taskId: input.task.id,
            slots,
            missing: validation.missing,
          }),
        ],
        action: 'clarify',
      });
      return { task: input.task, result };
    }

    if (loopIntent.confidence >= 0.7 && loopIntent.confidence < 0.9) {
      const body = `我理解为：${slots.timePreference}在${slots.locationText ?? slots.city}找${slots.activityType}搭子，对吗？`;
      const result = await this.resultWithCards({
        task: input.task,
        assistantMessage: '我先确认一下你的约练需求。',
        cards: [
          buildClarificationBinaryCard({
            taskId: input.task.id,
            questionKey: 'confirm_workout_intent',
            body,
            inferredIntent: 'workout',
            inferredSlots: slots as Record<string, unknown>,
            yesPatch: slots as Record<string, unknown>,
            noFallback: 'workout_intake',
            confidence: loopIntent.confidence,
          }),
        ],
        action: 'clarify',
      });
      return { task: input.task, result };
    }

    const result = await this.createDraftResult({
      ownerUserId: input.ownerUserId,
      task: input.task,
      slots,
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
    const slots = {
      ...this.readWorkoutSlots(task),
      ...this.slotsFromPayload(input.payload.yesPatch),
      ...this.slotsFromPayload(input.payload),
    };
    const validation = validateWorkoutSlots(slots);
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
    const slots = {
      ...this.readWorkoutSlots(task),
      ...payloadSlots,
      ...(options.useDefaults
        ? {
            safetyBoundary:
              payloadSlots.safetyBoundary ?? defaultWorkoutSafetyBoundary(),
            radiusKm: payloadSlots.radiusKm ?? 3,
            visibilityPreference: payloadSlots.visibilityPreference ?? 'public',
          }
        : {}),
    };
    const validation = validateWorkoutSlots(slots);
    this.rememberWorkoutSlots(
      task,
      slots,
      validation.valid ? 'draft_ready' : 'intake',
    );
    if (!validation.valid) {
      return this.resultWithCards({
        task,
        assistantMessage: '已收到约练需求，还需要补齐下面的信息。',
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
      slots.city ?? this.cityFromLocation(slots.locationText) ?? '青岛',
    );
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
    return {
      activityType: this.text(record.activityType) || undefined,
      timePreference: this.text(record.timePreference) || undefined,
      locationText:
        this.text(record.locationText ?? record.locationPreference) ||
        undefined,
      city: this.text(record.city) || undefined,
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
      '青岛',
      '北京',
      '上海',
      '杭州',
      '深圳',
      '广州',
      '南京',
      '成都',
      '武汉',
      '西安',
      '厦门',
      '苏州',
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
}
