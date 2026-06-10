import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import { ActivitiesService } from '../activities/activities.service';
import type {
  CheckinActivityDto,
  SubmitActivityProofDto,
} from '../activities/dto/activity.dto';
import {
  ActivityProofPrivacyMode,
  ActivityProofType,
} from '../activities/entities/activity-proof.entity';
import { RecordLifeGraphBehaviorEventDto } from '../life-graph/dto/life-graph.dto';
import { LifeGraphBehaviorEventType } from '../life-graph/life-graph.enums';
import { LifeGraphService } from '../life-graph/life-graph.service';
import { AgentApprovalService } from './agent-approval.service';
import {
  ApprovalRiskLevel,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
} from './entities/agent-task.entity';
import { AgentSessionAssemblerService } from './agent-session-assembler.service';
import {
  buildSocialAgentActivityCompletionCard,
  buildSocialAgentActivityDetailCard,
  buildSocialAgentActivityPlanCard,
  buildSocialAgentCardActionRouteResult,
  buildSocialAgentCheckinCard,
  buildSocialAgentLifeGraphUpdateCard,
  buildSocialAgentProofSubmittedCard,
  buildSocialAgentProofUploadPromptCard,
  buildSocialAgentReviewCard,
  createSocialAgentActivityDtoFromPayload,
  mergeSocialAgentActivityPayload,
  readSocialAgentMeetLoopState,
} from './social-agent-card-action.presenter';
import type { SocialAgentCardActionBody } from './social-agent-action.types';
import { appendSocialAgentConversationTurn } from './social-agent-chat-memory.presenter';
import type {
  SocialAgentIntentRouteResult,
  SocialAgentPendingApprovalSnapshot,
} from './social-agent-chat.types';
import {
  appendSocialAgentShortTermTurn,
  recordSocialAgentPendingAction,
  recordSocialAgentShortTermAction,
  transitionSocialAgentState,
} from './social-agent-memory.util';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import { AgentL5RuntimeService } from './agent-l5-runtime.service';

@Injectable()
export class SocialAgentMeetLoopService {
  private readonly logger = new Logger(SocialAgentMeetLoopService.name);
  private readonly fallbackSessionAssembler =
    new AgentSessionAssemblerService();

  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
    private readonly approvals: AgentApprovalService,
    private readonly metrics: SocialAgentMetricsService,
    @Optional()
    private readonly sessionAssembler?: AgentSessionAssemblerService,
    @Optional()
    private readonly lifeGraph?: LifeGraphService,
    @Optional()
    @Inject(forwardRef(() => ActivitiesService))
    private readonly activities?: ActivitiesService,
    @Optional() private readonly l5Runtime?: AgentL5RuntimeService,
  ) {}

  async performActivityAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    if (body.action === 'activity.confirm_create') {
      if (this.number(body.payload?.approvalId)) {
        return this.confirmActivityFromCardAction(ownerUserId, taskId, body);
      }
      return this.createActivityApprovalFromCardAction(
        ownerUserId,
        taskId,
        body,
      );
    }
    if (body.action === 'activity.check_in') {
      return this.checkInActivityFromCardAction(ownerUserId, taskId, body);
    }
    if (body.action === 'activity.complete') {
      return this.completeActivityFromCardAction(ownerUserId, taskId, body);
    }
    if (body.action === 'activity.view_detail') {
      return this.viewActivityDetailFromCardAction(ownerUserId, taskId, body);
    }
    if (body.action === 'activity.upload_proof') {
      return this.uploadProofFromCardAction(ownerUserId, taskId, body);
    }
    if (body.action === 'review.submit') {
      return this.submitReviewFromCardAction(ownerUserId, taskId, body);
    }
    throw new NotFoundException(`Unsupported meet-loop action: ${body.action}`);
  }

  private async createActivityApprovalFromCardAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const payload = body.payload ?? {};
    const approval = await this.approvals.create({
      userId: ownerUserId,
      agentConnectionId: null,
      agentTaskId: task.id,
      type: ApprovalType.CreateActivity,
      actionType: 'create_activity',
      skillName: 'create_activity',
      payload: {
        source: 'agent_card_action',
        schemaAction: body.action,
        agentTaskId: task.id,
        ...payload,
        publicPlaceOnly: true,
        noPreciseLocation: true,
      },
      summary: '创建线下约练计划',
      riskLevel: ApprovalRiskLevel.Medium,
      reason: '线下活动必须由用户确认后才能创建。',
      createdBy: 'agent',
      relatedSocialRequestId: this.number(payload.socialRequestId) ?? null,
      relatedCandidateId: this.number(payload.candidateRecordId) ?? null,
    });
    const pendingApproval = this.toPendingApprovalSnapshot(approval);
    recordSocialAgentPendingAction(task, {
      id: pendingApproval.id,
      type: pendingApproval.type,
      actionType: pendingApproval.actionType,
      summary: pendingApproval.summary,
      riskLevel: pendingApproval.riskLevel,
      at: new Date().toISOString(),
    });
    task.result = {
      ...(task.result ?? {}),
      activityDraft: {
        action: body.action,
        approvalId: approval.id,
        ...payload,
        publicPlaceOnly: true,
        noPreciseLocation: true,
      },
    };
    transitionSocialAgentState(task, 'confirmation_required', {
      objective: 'activity_creation',
      nextStep: '等待你确认是否创建约练计划',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: 'activity_confirmation',
      lastCompletedStep: 'activity_draft_created',
    });
    await this.taskRepo.save(task);
    await this.persistMeetLoopState(task, 'activity_draft_created', {
      waitingFor: 'activity_confirmation',
      payload,
    });

    const card = buildSocialAgentActivityPlanCard({
      taskId: task.id,
      approvalId: approval.id,
      payload,
    });

    const assistantMessage =
      '我整理好了约练计划草稿。你确认前，我不会创建线下活动，也不会共享精确位置。';
    const result = this.cardActionRouteResult(
      task,
      assistantMessage,
      [card],
      pendingApproval,
    );
    await this.writeEvent(
      task,
      AgentTaskEventType.ConfirmationRequested,
      'Agent card action created activity approval',
      { action: body.action, approvalId: approval.id },
      AgentTaskEventActor.Agent,
    );
    await this.recordAssistantMessage(task, assistantMessage, result);
    return result;
  }

  private async confirmActivityFromCardAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const payload = this.mergeActivityPayload(task, body.payload ?? {});
    const activityId = this.number(payload.activityId) ?? null;
    const candidateUserId = this.number(
      payload.candidateUserId ?? payload.targetUserId,
    );
    const realActivity = await this.createOrConfirmRealActivity(
      ownerUserId,
      payload,
      activityId,
      candidateUserId,
    );
    const resolvedActivityId = this.number(realActivity?.id) ?? activityId;
    const resolvedCandidateUserId =
      this.number(realActivity?.invitedUserId) ??
      candidateUserId ??
      this.number(payload.invitedUserId);
    await this.recordLifeGraphBehaviorEvent(ownerUserId, {
      eventType: LifeGraphBehaviorEventType.ActivityCreated,
      taskId: task.id,
      activityId: resolvedActivityId,
      candidateUserId: resolvedCandidateUserId,
      metadata: {
        sourceAction: body.action,
        activityType: cleanDisplayText(payload.activityType, 'running'),
        publicPlaceOnly: true,
        noPreciseLocation: true,
      },
      naturalSummary:
        '你确认创建了一次线下约练计划，后续推荐会更重视真实履约和公共场所边界。',
      weight: 1,
    });

    const now = new Date().toISOString();
    task.result = {
      ...(task.result ?? {}),
      meetLoop: {
        ...readSocialAgentMeetLoopState(task, (value) => this.isRecord(value)),
        ...payload,
        activityId: resolvedActivityId,
        candidateUserId: resolvedCandidateUserId,
        publicPlaceOnly: true,
        noPreciseLocation: true,
        realActivityPersisted: Boolean(realActivity),
        status: 'activity_confirmed',
        loopStage: 'activity_confirmed',
        confirmedAt: now,
      },
    };
    transitionSocialAgentState(task, 'activity_confirmed', {
      objective: 'meet_loop',
      nextStep: '活动开始前等待你签到',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: 'activity_check_in',
      lastCompletedStep: 'activity_confirmed',
    });
    await this.taskRepo.save(task);
    await this.persistMeetLoopState(task, 'activity_confirmed', {
      waitingFor: 'activity_check_in',
      payload: this.meetLoopPayload(task),
    });

    const card = buildSocialAgentCheckinCard({
      taskId: task.id,
      activityId: resolvedActivityId,
      candidateUserId: resolvedCandidateUserId,
      realActivityPersisted: Boolean(realActivity),
    });

    const assistantMessage =
      '约练计划已经创建好了。等你到达公共场所后，再点签到；我不会共享你的精确位置。';
    const result = this.cardActionRouteResult(task, assistantMessage, [card]);
    await this.writeEvent(
      task,
      AgentTaskEventType.Note,
      'Agent meet loop activity confirmed',
      {
        action: body.action,
        activityId: resolvedActivityId,
        candidateUserId: resolvedCandidateUserId,
        realActivityPersisted: Boolean(realActivity),
      },
      AgentTaskEventActor.Agent,
    );
    await this.recordAssistantMessage(task, assistantMessage, result);
    return result;
  }

  private async checkInActivityFromCardAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const payload = this.mergeActivityPayload(task, body.payload ?? {});
    const activityId = this.number(payload.activityId) ?? null;
    const candidateUserId = this.number(
      payload.candidateUserId ?? payload.targetUserId,
    );
    const checkinResult =
      activityId && this.activities
        ? await this.activities.checkin(activityId, ownerUserId, {
            locationApprox: cleanDisplayText(
              payload.locationApprox ?? payload.locationName,
              '公共场所',
            ),
          } satisfies CheckinActivityDto)
        : null;
    const resolvedActivityId =
      this.number(checkinResult?.activity?.id) ?? activityId;
    const now = new Date().toISOString();
    task.result = {
      ...(task.result ?? {}),
      meetLoop: {
        ...readSocialAgentMeetLoopState(task, (value) => this.isRecord(value)),
        ...payload,
        activityId: resolvedActivityId,
        candidateUserId,
        realActivityPersisted: Boolean(checkinResult),
        status: 'activity_checked_in',
        loopStage: 'activity_checked_in',
        checkedInAt: now,
      },
    };
    transitionSocialAgentState(task, 'activity_checked_in', {
      objective: 'meet_loop',
      nextStep: '活动结束后确认是否完成',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: 'activity_completion',
      lastCompletedStep: 'activity_checked_in',
    });
    await this.taskRepo.save(task);
    await this.persistMeetLoopState(task, 'activity_checked_in', {
      waitingFor: 'activity_completion',
      payload: this.meetLoopPayload(task),
    });

    const card = buildSocialAgentActivityCompletionCard({
      taskId: task.id,
      activityId: resolvedActivityId,
      candidateUserId,
      realActivityPersisted: Boolean(checkinResult),
      checkedInAt: now,
    });

    const assistantMessage =
      '签到已记录。活动结束后你确认完成，我再帮你生成评价卡，并说明 Life Graph 会更新什么。';
    const result = this.cardActionRouteResult(task, assistantMessage, [card]);
    await this.writeEvent(
      task,
      AgentTaskEventType.Note,
      'Agent meet loop activity checked in',
      {
        action: body.action,
        activityId: resolvedActivityId,
        candidateUserId,
        realActivityPersisted: Boolean(checkinResult),
      },
      AgentTaskEventActor.Agent,
    );
    await this.recordAssistantMessage(task, assistantMessage, result);
    return result;
  }

  private async completeActivityFromCardAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const payload = this.mergeActivityPayload(task, body.payload ?? {});
    const activityId = this.number(payload.activityId) ?? null;
    const candidateUserId = this.number(
      payload.candidateUserId ?? payload.targetUserId,
    );
    const completedActivity =
      activityId && this.activities
        ? await this.activities.complete(activityId, ownerUserId)
        : null;
    const resolvedActivityId = this.number(completedActivity?.id) ?? activityId;
    if (!completedActivity) {
      await this.recordLifeGraphBehaviorEvent(ownerUserId, {
        eventType: LifeGraphBehaviorEventType.ActivityCompleted,
        taskId: task.id,
        activityId: resolvedActivityId,
        candidateUserId,
        metadata: {
          sourceAction: body.action,
          activityType: cleanDisplayText(payload.activityType, 'running'),
          publicPlaceOnly: true,
        },
        naturalSummary:
          '你完成了一次线下约练，我会把这次履约记录用于后续推荐。',
        weight: 1.5,
      });
    }

    const now = new Date().toISOString();
    task.result = {
      ...(task.result ?? {}),
      meetLoop: {
        ...readSocialAgentMeetLoopState(task, (value) => this.isRecord(value)),
        ...payload,
        activityId: resolvedActivityId,
        candidateUserId,
        realActivityPersisted: Boolean(completedActivity),
        status: 'activity_completed',
        loopStage: 'activity_completed',
        completedAt: now,
      },
    };
    transitionSocialAgentState(task, 'activity_completed', {
      objective: 'meet_loop',
      nextStep: '等待你提交活动评价',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: 'review',
      lastCompletedStep: 'activity_completed',
    });
    await this.taskRepo.save(task);
    await this.persistMeetLoopState(task, 'activity_completed', {
      waitingFor: 'review',
      payload: this.meetLoopPayload(task),
    });

    const card = buildSocialAgentReviewCard({
      taskId: task.id,
      activityId: resolvedActivityId,
      candidateUserId,
      realActivityPersisted: Boolean(completedActivity),
    });

    const assistantMessage =
      '太好了，这次约练我先标记为完成。你可以提交一个简短评价，我再把 Life Graph 和 trust score 更新说明给你看。';
    const result = this.cardActionRouteResult(task, assistantMessage, [card]);
    await this.writeEvent(
      task,
      AgentTaskEventType.Note,
      'Agent meet loop activity completed',
      {
        action: body.action,
        activityId: resolvedActivityId,
        candidateUserId,
        realActivityPersisted: Boolean(completedActivity),
      },
      AgentTaskEventActor.Agent,
    );
    await this.recordAssistantMessage(task, assistantMessage, result);
    return result;
  }

  private async submitReviewFromCardAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const payload = this.mergeActivityPayload(task, body.payload ?? {});
    const activityId = this.number(payload.activityId) ?? null;
    const candidateUserId = this.number(
      payload.candidateUserId ?? payload.targetUserId,
    );
    const rating = Math.max(1, Math.min(5, this.number(payload.rating) ?? 5));
    const positive = rating >= 4;
    const comment = cleanDisplayText(
      payload.comment,
      positive ? '这次约练体验不错。' : '这次约练有些地方不太合适。',
    );
    const reviewResult =
      activityId && this.activities
        ? await this.activities.review(activityId, ownerUserId, rating, comment)
        : null;
    if (!reviewResult) {
      await this.recordLifeGraphBehaviorEvent(ownerUserId, {
        eventType: positive
          ? LifeGraphBehaviorEventType.ActivityReviewedPositive
          : LifeGraphBehaviorEventType.ActivityReviewedNegative,
        taskId: task.id,
        activityId,
        candidateUserId,
        metadata: {
          sourceAction: body.action,
          rating,
          comment,
          activityType: cleanDisplayText(payload.activityType, 'running'),
        },
        naturalSummary: positive
          ? '你对这次约练给出了正向评价，后续会提高相似推荐的权重。'
          : '你对这次约练反馈一般，后续会降低相似推荐的权重。',
        weight: positive ? 1.2 : 1,
      });
    }

    const trustScoreDelta = positive ? 2 : 1;
    const now = new Date().toISOString();
    task.result = {
      ...(task.result ?? {}),
      meetLoop: {
        ...readSocialAgentMeetLoopState(task, (value) => this.isRecord(value)),
        ...payload,
        activityId,
        candidateUserId,
        status: 'review_submitted',
        loopStage: 'trust_score_updated',
        review: { rating, comment, submittedAt: now },
        lifeGraphUpdated: true,
        realActivityPersisted: Boolean(reviewResult),
        trustScoreDelta,
      },
    };
    transitionSocialAgentState(task, 'life_graph_updated', {
      objective: 'meet_loop',
      nextStep: '本次约练闭环已完成',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: '',
      lastCompletedStep: 'trust_score_updated',
    });
    await this.taskRepo.save(task);
    await this.persistMeetLoopState(task, 'review_submitted', {
      waitingFor: 'trust_score_update',
      payload: this.meetLoopPayload(task),
      review: { rating, comment, submittedAt: now },
    });
    await this.persistMeetLoopState(task, 'trust_score_updated', {
      waitingFor: '',
      payload: this.meetLoopPayload(task),
      review: { rating, comment, submittedAt: now },
    });

    const card = buildSocialAgentLifeGraphUpdateCard({
      taskId: task.id,
      activityId,
      candidateUserId,
      realActivityPersisted: Boolean(reviewResult),
      rating,
      comment,
      positive,
      trustScoreDelta,
    });

    const assistantMessage =
      '评价已提交。这次完成记录已经用于更新你的 Life Graph，并生成了 trust score 更新说明；你之后仍然可以查看、纠正或撤回这次画像影响。';
    const result = this.cardActionRouteResult(task, assistantMessage, [card]);
    await this.writeEvent(
      task,
      AgentTaskEventType.Note,
      'Agent meet loop review submitted and life graph updated',
      {
        action: body.action,
        activityId,
        candidateUserId,
        rating,
        trustScoreDelta,
      },
      AgentTaskEventActor.Agent,
    );
    await this.recordAssistantMessage(task, assistantMessage, result);
    return result;
  }

  private async uploadProofFromCardAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const payload = this.mergeActivityPayload(task, body.payload ?? {});
    const activityId = this.number(payload.activityId) ?? null;
    if (!activityId || !this.hasProofPayload(payload) || !this.activities) {
      const card = buildSocialAgentProofUploadPromptCard({
        taskId: task.id,
        activityId,
      });
      transitionSocialAgentState(task, 'activity_completed', {
        objective: 'meet_loop',
        nextStep: '等待你在活动详情里上传完成证明',
        shouldSearchNow: false,
        awaitingSearchConfirmation: false,
        waitingFor: 'activity_proof_upload',
        lastCompletedStep: 'activity_proof_requested',
      });
      await this.taskRepo.save(task);
      await this.persistMeetLoopState(task, 'activity_completed', {
        waitingFor: 'activity_proof_upload',
        payload: this.meetLoopPayload(task, payload),
      });
      const assistantMessage =
        '我已经定位到活动证明这一步。请打开活动详情上传场景照、签到或文字说明；我不会要求露脸，也不会公开精确位置。';
      const result = this.cardActionRouteResult(task, assistantMessage, [card]);
      await this.writeEvent(
        task,
        AgentTaskEventType.Note,
        'Agent meet loop requested activity proof upload',
        { action: body.action, activityId },
        AgentTaskEventActor.Agent,
      );
      await this.recordAssistantMessage(task, assistantMessage, result);
      return result;
    }

    const dto = this.proofDtoFromPayload(payload);
    const proof = await this.activities.submitProof(
      activityId,
      ownerUserId,
      dto,
    );
    const proofRecord = proof as unknown as Record<string, unknown>;
    const proofId = this.number(proofRecord.id);
    task.result = {
      ...(task.result ?? {}),
      meetLoop: {
        ...readSocialAgentMeetLoopState(task, (value) => this.isRecord(value)),
        ...payload,
        activityId,
        proofId,
        proofType: dto.proofType,
        proofStatus: 'pending',
        status: 'proof_submitted',
        loopStage: 'activity_completed',
        proofSubmittedAt: new Date().toISOString(),
      },
    };
    transitionSocialAgentState(task, 'activity_completed', {
      objective: 'meet_loop',
      nextStep: '等待对方确认活动证明',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: 'activity_proof_review',
      lastCompletedStep: 'activity_proof_submitted',
    });
    await this.taskRepo.save(task);
    await this.persistMeetLoopState(task, 'proof_submitted', {
      waitingFor: 'activity_proof_review',
      payload: this.meetLoopPayload(task),
    });

    const card = buildSocialAgentProofSubmittedCard({
      taskId: task.id,
      activityId,
      proofId,
      proofType: dto.proofType,
    });
    const assistantMessage =
      '活动证明已提交，当前等待对方确认。确认完成后，我会继续更新活动履约状态和 Life Graph。';
    const result = this.cardActionRouteResult(task, assistantMessage, [card]);
    await this.writeEvent(
      task,
      AgentTaskEventType.Note,
      'Agent meet loop submitted activity proof',
      { action: body.action, activityId, proofId, proofType: dto.proofType },
      AgentTaskEventActor.Agent,
    );
    await this.recordAssistantMessage(task, assistantMessage, result);
    return result;
  }

  private async viewActivityDetailFromCardAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const payload = this.mergeActivityPayload(task, body.payload ?? {});
    const activityId = this.number(payload.activityId) ?? null;
    if (!activityId || !this.activities) {
      const card = buildSocialAgentActivityDetailCard({
        taskId: task.id,
        activityId,
        unavailableReason: !activityId
          ? '缺少活动 ID，暂时无法打开详情。'
          : '当前后端未接入活动详情服务，请稍后从活动页面查看。',
      });
      const assistantMessage =
        '我暂时无法直接读取这次活动详情。你可以从活动页查看，或者继续告诉我需要调整时间、地点或证明。';
      const result = this.cardActionRouteResult(task, assistantMessage, [card]);
      await this.recordAssistantMessage(task, assistantMessage, result);
      return result;
    }
    if (!this.isTaskRelatedActivity(task, activityId)) {
      throw new NotFoundException(
        `Activity ${activityId} is not linked to social agent task ${task.id}`,
      );
    }

    const activity = (await this.activities.findOne(
      activityId,
    )) as unknown as Record<string, unknown>;
    const proofs = (await this.activities.listProofs(activityId)) as unknown[];
    const proofRecords = proofs.filter(
      (proof): proof is Record<string, unknown> => this.isRecord(proof),
    );
    const card = buildSocialAgentActivityDetailCard({
      taskId: task.id,
      activityId,
      activity,
      proofs: proofRecords,
    });
    transitionSocialAgentState(task, 'activity_completed', {
      objective: 'meet_loop',
      nextStep: '查看活动详情、上传证明或等待对方确认',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: 'activity_detail_or_proof',
      lastCompletedStep: 'activity_detail_viewed',
    });
    task.result = {
      ...(task.result ?? {}),
      meetLoop: {
        ...readSocialAgentMeetLoopState(task, (value) => this.isRecord(value)),
        activityId,
        status: cleanDisplayText(activity.status, '') || 'detail_viewed',
        proofCount: proofRecords.length,
        loopStage: 'activity_completed',
        detailViewedAt: new Date().toISOString(),
      },
    };
    await this.taskRepo.save(task);
    const assistantMessage =
      proofRecords.length > 0
        ? '这是当前活动详情和证明状态。你可以继续补充证明，或等待对方确认。'
        : '这是当前活动详情。还没有证明记录，如果活动已完成，可以继续上传证明。';
    const result = this.cardActionRouteResult(task, assistantMessage, [card]);
    await this.writeEvent(
      task,
      AgentTaskEventType.Note,
      'Agent meet loop viewed activity detail',
      { action: body.action, activityId, proofCount: proofRecords.length },
      AgentTaskEventActor.Agent,
    );
    await this.recordAssistantMessage(task, assistantMessage, result);
    return result;
  }

  private cardActionRouteResult(
    task: AgentTask,
    assistantMessage: string,
    cards: SocialAgentIntentRouteResult['cards'],
    pendingApproval: SocialAgentPendingApprovalSnapshot | null = null,
  ): SocialAgentIntentRouteResult {
    return buildSocialAgentCardActionRouteResult({
      task,
      assistantMessage,
      cards: cards ?? [],
      emptyIntentEntities: this.emptyIntentEntities(),
      pendingApproval,
    });
  }

  private async createOrConfirmRealActivity(
    ownerUserId: number,
    payload: Record<string, unknown>,
    activityId: number | null,
    candidateUserId?: number | null,
  ): Promise<Record<string, unknown> | null> {
    if (!this.activities) return null;
    if (activityId) {
      return (await this.activities.confirm(
        activityId,
        ownerUserId,
      )) as unknown as Record<string, unknown>;
    }

    const dto = createSocialAgentActivityDtoFromPayload({
      payload,
      candidateUserId,
      number: (value) => this.number(value),
    });
    const created = await this.activities.create(ownerUserId, dto);
    let confirmed = created;
    try {
      confirmed = await this.activities.confirm(created.id, ownerUserId);
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.meet_loop.activity_owner_confirm_failed',
          ownerUserId,
          activityId: created.id,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
    return {
      ...(confirmed as unknown as Record<string, unknown>),
      invitedUserId: dto.invitedUserId ?? null,
    };
  }

  private async persistMeetLoopState(
    task: AgentTask,
    stage:
      | 'activity_draft_created'
      | 'activity_confirmed'
      | 'activity_checked_in'
      | 'activity_completed'
      | 'proof_submitted'
      | 'review_submitted'
      | 'trust_score_updated',
    input: {
      waitingFor: string;
      payload?: Record<string, unknown> | null;
      review?: Record<string, unknown> | null;
    },
  ): Promise<void> {
    const payload = this.isRecord(input.payload) ? input.payload : {};
    await this.l5Runtime?.transitionMeetLoop({
      ownerUserId: task.ownerUserId,
      agentTaskId: task.id,
      activityId: this.number(payload.activityId),
      candidateUserId: this.number(
        payload.candidateUserId ?? payload.targetUserId,
      ),
      stage,
      waitingFor: input.waitingFor,
      state: payload,
      review: input.review ?? null,
    });
  }

  private meetLoopPayload(
    task: AgentTask,
    fallback: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const result = this.isRecord(task.result) ? task.result : {};
    return this.isRecord(result.meetLoop) ? result.meetLoop : fallback;
  }

  private mergeActivityPayload(
    task: AgentTask,
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    return mergeSocialAgentActivityPayload({
      task,
      payload,
      isRecord: (value) => this.isRecord(value),
    });
  }

  private async recordLifeGraphBehaviorEvent(
    ownerUserId: number,
    input: RecordLifeGraphBehaviorEventDto,
  ): Promise<void> {
    if (!this.lifeGraph) return;
    try {
      await this.lifeGraph.recordBehaviorEvent(ownerUserId, input);
    } catch (error) {
      this.metrics.recordError('life_graph_behavior_event_failed');
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.meet_loop.life_graph_event_failed',
          ownerUserId,
          eventType: input.eventType,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private async recordAssistantMessage(
    task: AgentTask,
    message: string,
    route: SocialAgentIntentRouteResult,
  ): Promise<void> {
    const now = new Date().toISOString();
    appendSocialAgentConversationTurn(task, {
      role: 'assistant',
      text: message,
      intent: route.intent,
      at: now,
      ...(route.pendingApproval
        ? {
            kind: 'approval',
            pendingApproval: sanitizeForDisplay(route.pendingApproval),
          }
        : {}),
    });
    appendSocialAgentShortTermTurn(task, {
      role: 'assistant',
      text: message,
      intent: route.intent,
      action: route.action,
      at: now,
    });
    recordSocialAgentShortTermAction(task, {
      action: route.action,
      intent: route.intent,
      status: route.shouldQueueRun ? 'queued' : 'completed',
      at: now,
    });
    task.result = {
      ...(task.result ?? {}),
      latestMessageRoute: {
        intent: route.intent,
        confidence: route.confidence,
        action: route.action,
        replyStrategy: route.replyStrategy,
        shouldQueueRun: route.shouldQueueRun,
        runId: route.queuedRun?.runId ?? null,
        at: now,
      },
    };
    await this.taskRepo.save(task);
    await this.writeEvent(
      task,
      AgentTaskEventType.SocialAgentMessageAssistant,
      'Social Agent 回复消息',
      {
        message,
        intent: route.intent,
        action: route.action,
        pendingApproval: route.pendingApproval ?? null,
        createdAt: now,
      },
      AgentTaskEventActor.Agent,
    );
  }

  private async writeEvent(
    task: AgentTask,
    eventType: AgentTaskEventType,
    summary: string,
    payload: Record<string, unknown> = {},
    actor: AgentTaskEventActor = AgentTaskEventActor.Agent,
  ): Promise<void> {
    try {
      await this.eventRepo.save(
        this.eventRepo.create({
          taskId: task.id,
          ownerUserId: task.ownerUserId,
          eventType,
          actor,
          summary: this.safeVarchar(summary, 500),
          payload: sanitizeForDisplay(payload) as Record<string, unknown>,
        }),
      );
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.meet_loop.task_event_write_failed',
          taskId: task.id,
          eventType,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private toPendingApprovalSnapshot(
    approval: Parameters<
      AgentSessionAssemblerService['toPendingApprovalSnapshot']
    >[0],
  ): SocialAgentPendingApprovalSnapshot {
    return (
      this.sessionAssembler ?? this.fallbackSessionAssembler
    ).toPendingApprovalSnapshot(approval);
  }

  private async assertTaskOwner(
    taskId: number,
    ownerUserId: number,
  ): Promise<AgentTask> {
    const task = await this.taskRepo.findOne({
      where: { id: taskId, ownerUserId },
    });
    if (!task)
      throw new NotFoundException(`Social agent task ${taskId} not found`);
    return task;
  }

  private emptyIntentEntities(): SocialAgentIntentRouteResult['entities'] {
    return {
      city: '',
      activityType: '',
      targetGender: '',
      timePreference: '',
      locationPreference: '',
    };
  }

  private safeVarchar(value: unknown, max = 80): string {
    const text = cleanDisplayText(value, '');
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 1))}…`;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private hasProofPayload(payload: Record<string, unknown>): boolean {
    return Boolean(
      cleanDisplayText(payload.photoUrl, '') ||
      cleanDisplayText(payload.note, '') ||
      cleanDisplayText(payload.locationApprox, '') ||
      cleanDisplayText(payload.proofType, ''),
    );
  }

  private proofDtoFromPayload(
    payload: Record<string, unknown>,
  ): SubmitActivityProofDto {
    return {
      proofType: this.proofType(payload.proofType),
      ...(cleanDisplayText(payload.photoUrl, '')
        ? { photoUrl: cleanDisplayText(payload.photoUrl, '') }
        : {}),
      ...(cleanDisplayText(payload.note, '')
        ? { note: cleanDisplayText(payload.note, '') }
        : {}),
      ...(cleanDisplayText(payload.locationApprox, '')
        ? { locationApprox: cleanDisplayText(payload.locationApprox, '') }
        : {}),
      privacyMode: this.proofPrivacyMode(payload.privacyMode),
    };
  }

  private proofType(value: unknown): ActivityProofType {
    return typeof value === 'string' &&
      Object.values(ActivityProofType).includes(value as ActivityProofType)
      ? (value as ActivityProofType)
      : ActivityProofType.ScenePhoto;
  }

  private proofPrivacyMode(value: unknown): ActivityProofPrivacyMode {
    return typeof value === 'string' &&
      Object.values(ActivityProofPrivacyMode).includes(
        value as ActivityProofPrivacyMode,
      )
      ? (value as ActivityProofPrivacyMode)
      : ActivityProofPrivacyMode.SceneOnly;
  }

  private isTaskRelatedActivity(task: AgentTask, activityId: number): boolean {
    const result = this.isRecord(task.result) ? task.result : {};
    const meetLoop = this.isRecord(result.meetLoop) ? result.meetLoop : {};
    const draft = this.isRecord(result.activityDraft)
      ? result.activityDraft
      : {};
    return (
      this.number(meetLoop.activityId) === activityId ||
      this.number(draft.activityId) === activityId
    );
  }

  private number(value: unknown): number | null {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }
}
