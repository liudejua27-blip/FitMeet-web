import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import { FeatureFlagService } from '../common/feature-flag.service';
import { AgentApprovalService } from './agent-approval.service';
import {
  AgentApprovalRequest,
  ApprovalRiskLevel,
  ApprovalStatus,
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
  buildSocialAgentCardActionRouteResult,
  buildSocialAgentCandidateDetailCard,
  buildSocialAgentMeetLoopTimelineCard,
  readSocialAgentCardActionCandidate,
} from './social-agent-card-action.presenter';
import {
  buildSocialAgentCandidateConnectResult,
  type SocialAgentCandidateConnectResult,
} from './social-agent-candidate-connect-result.presenter';
import { buildSocialAgentDirectCandidateMessageResult } from './social-agent-direct-candidate-message-result.presenter';
import {
  buildSocialAgentCandidateActionApprovalInput,
  buildSocialAgentCandidateActionApprovalState,
  type SocialAgentActionApprovalRuntimeContext,
} from './social-agent-candidate-action-approval.presenter';
import {
  buildSocialAgentCandidateMessageDraft,
  readSocialAgentCardActionDraftCandidate,
} from './social-agent-candidate-message-draft.presenter';
import {
  buildSocialAgentOpenerDraftApprovalInput,
  buildSocialAgentOpenerDraftState,
} from './social-agent-opener-draft-action.presenter';
import { buildSocialAgentConfirmedCandidateMessageState } from './social-agent-confirmed-candidate-message.presenter';
import type {
  CandidateTargetBody,
  SocialAgentCardActionBody,
} from './social-agent-action.types';
import { appendSocialAgentConversationTurn } from './social-agent-chat-memory.presenter';
import { readSocialAgentStoredCandidateSummaries } from './social-agent-chat-session.presenter';
import type {
  SocialAgentIntentRouteResult,
  SocialAgentPendingApprovalSnapshot,
} from './social-agent-chat.types';
import { SocialAgentLongTermMemoryService } from './social-agent-long-term-memory.service';
import {
  appendSocialAgentShortTermTurn,
  appendShortTermMemoryItem,
  clearSocialAgentPendingAction,
  readSocialAgentTaskMemory,
  recordSocialAgentPendingAction,
  recordSocialAgentShortTermAction,
  rememberSocialAgentShortTerm,
  transitionSocialAgentState,
  writeSocialAgentTaskMemory,
} from './social-agent-memory.util';
import {
  SocialAgentToolCallRecord,
  SocialAgentToolExecutorService,
  SocialAgentToolName,
} from './social-agent-tool-executor.service';
import { AgentL5RuntimeService } from './agent-l5-runtime.service';
import type { FitMeetAlphaCard } from './fitmeet-alpha-agent.types';
import { SocialAgentUserInterestEventService } from './social-agent-user-interest-event.service';
import { SocialCandidateAuditService } from './social-candidate-audit.service';
import type { SocialCandidateEventType } from './entities/social-candidate-event.entity';
import { SocialAgentLoopStateTransitionEventService } from './social-agent-loop-state-transition-event.service';

type CandidateActionOptions = {
  signal?: AbortSignal | null;
};

@Injectable()
export class SocialAgentCandidateActionService {
  private readonly logger = new Logger(SocialAgentCandidateActionService.name);
  private readonly fallbackSessionAssembler =
    new AgentSessionAssemblerService();

  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
    private readonly approvals: AgentApprovalService,
    private readonly executor: SocialAgentToolExecutorService,
    @Optional()
    private readonly sessionAssembler?: AgentSessionAssemblerService,
    @Optional()
    private readonly longTermMemory?: SocialAgentLongTermMemoryService,
    @Optional()
    private readonly l5Runtime?: AgentL5RuntimeService,
    @Optional()
    private readonly interestEvents?: SocialAgentUserInterestEventService,
    @Optional()
    private readonly candidateAudit?: SocialCandidateAuditService,
    @Optional()
    private readonly featureFlags?: FeatureFlagService,
    @Optional()
    private readonly loopStateEvents?: SocialAgentLoopStateTransitionEventService,
  ) {}

  async createActionApproval(input: {
    ownerUserId: number;
    task: AgentTask;
    message: string;
    route: Pick<SocialAgentIntentRouteResult, 'intent' | 'entities'>;
    runtimeContext?: SocialAgentActionApprovalRuntimeContext | null;
  }): Promise<SocialAgentPendingApprovalSnapshot | null> {
    const { ownerUserId, task, message, route, runtimeContext } = input;
    try {
      const candidates = readSocialAgentStoredCandidateSummaries(task);
      const firstCandidate = candidates[0] as
        | Record<string, unknown>
        | undefined;
      const targetUserId =
        this.number(firstCandidate?.candidateUserId) ??
        this.number(firstCandidate?.userId);
      const approvalInput = buildSocialAgentCandidateActionApprovalInput({
        ownerUserId,
        taskId: task.id,
        message,
        route,
        candidate: firstCandidate,
        targetUserId,
        relatedCandidateId:
          this.number(firstCandidate?.candidateRecordId) ?? null,
        runtimeContext: runtimeContext ?? null,
      });
      if (approvalInput.riskLevel === ApprovalRiskLevel.Low) {
        return null;
      }
      const approval = await this.approvals.create(approvalInput);
      const pendingApproval = this.toPendingApprovalSnapshot(approval);
      const approvalState = buildSocialAgentCandidateActionApprovalState({
        pendingApproval,
        at: new Date().toISOString(),
      });
      transitionSocialAgentState(
        task,
        'confirmation_required',
        approvalState.transitionPatch,
      );
      recordSocialAgentPendingAction(task, approvalState.pendingAction);
      await this.taskRepo.save(task);
      await this.loopStateEvents?.writeCurrentTaskTransition({
        task,
        publicLoopStage: 'contact_confirmation_required',
        workflowState: 'CONTACT_CONFIRMATION_REQUIRED',
      });
      return pendingApproval;
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.candidate_action.create_approval_failed',
          taskId: task.id,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return null;
    }
  }

  async createOpenerDraftFromCardAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const payload = body.payload ?? {};
    const schemaAction =
      cleanDisplayText(body.action, 'candidate.generate_opener') ||
      'candidate.generate_opener';
    const candidate = readSocialAgentCardActionCandidate({
      payload,
      task,
      isRecord: (value) => this.isRecord(value),
    });
    const targetUserId =
      this.number(payload.targetUserId) ??
      this.number(candidate.targetUserId) ??
      this.number(candidate.candidateUserId) ??
      this.number(candidate.userId);
    const draft =
      cleanDisplayText(
        payload.message ??
          payload.suggestedOpener ??
          candidate.suggestedOpener ??
          candidate.suggestedMessage,
        '',
      ).trim() || this.candidateMessageDraft(task);

    const openerDraft = this.buildOpenerDraftPreviewState({
      action: schemaAction,
      targetUserId,
      candidate,
      draft,
      body,
      payload,
    });
    task.result = {
      ...(task.result ?? {}),
      cardActionDraft: openerDraft.cardActionDraft,
    };
    transitionSocialAgentState(
      task,
      'message_action',
      openerDraft.transitionPatch,
    );
    await this.taskRepo.save(task);
    await this.loopStateEvents?.writeCurrentTaskTransition({
      task,
      publicLoopStage: 'contact_confirmation_required',
      workflowState: 'CONTACT_CONFIRMATION_REQUIRED',
    });

    const card = this.buildOpenerDraftCandidateCard({
      taskId: task.id,
      targetUserId,
      candidate,
      displayName: openerDraft.displayName,
      draft,
      regeneratePayload: payload,
    });

    const result = this.cardActionRouteResult(
      task,
      openerDraft.assistantMessage,
      [card],
      null,
    );
    await this.recordCandidateInterestEvent({
      ownerUserId,
      task,
      action: 'candidate.generate_opener',
      targetUserId,
      candidate,
      candidateRecordId: this.number(payload.candidateRecordId),
      socialRequestId: this.number(payload.socialRequestId),
      idempotencyKey: cleanDisplayText(body.idempotencyKey, '') || null,
    });
    await this.recordCandidateAuditEvent({
      ownerUserId,
      task,
      eventType: 'opener_previewed',
      targetUserId,
      candidate,
      candidateRecordId: this.number(payload.candidateRecordId),
      socialRequestId: this.number(payload.socialRequestId),
      idempotencyKey:
        cleanDisplayText(body.idempotencyKey, '') ||
        `opener-preview:${task.id}:${targetUserId ?? 'candidate'}`,
      payload: { action: schemaAction, draft },
    });
    await this.writeEvent(
      task,
      AgentTaskEventType.StepCompleted,
      'Agent card action generated opener draft',
      { action: schemaAction, targetUserId },
      AgentTaskEventActor.Agent,
    );
    await this.recordAssistantMessage(
      task,
      openerDraft.assistantMessage,
      result,
    );
    return result;
  }

  async confirmOpenerSendFromCardAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
    options: CandidateActionOptions = {},
  ): Promise<SocialAgentIntentRouteResult> {
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const payload = body.payload ?? {};
    const draft = this.cardActionDraft(task);
    const candidate =
      readSocialAgentCardActionCandidate({
        payload: { ...draft, ...payload },
        task,
        isRecord: (value) => this.isRecord(value),
      }) || this.cardActionDraftCandidate(task);
    const targetUserId =
      this.number(payload.targetUserId) ??
      this.number(draft.targetUserId) ??
      this.number(candidate.targetUserId) ??
      this.number(candidate.candidateUserId) ??
      this.number(candidate.userId);
    const text =
      cleanDisplayText(
        payload.message ?? payload.suggestedOpener ?? draft.message,
        '',
      ).trim() || this.candidateMessageDraft(task);
    if (!targetUserId || !text) {
      throw new BadRequestException('请选择候选人并填写要发送的消息');
    }

    const requestedApprovalId =
      this.number(payload.approvalId) ?? this.number(draft.approvalId);
    const pendingMessageAction = readSocialAgentTaskMemory(task)
      .pendingActions.slice()
      .reverse()
      .find((action) => {
        if (!this.isCandidateInviteApprovalAction(action.actionType))
          return false;
        return requestedApprovalId ? action.id === requestedApprovalId : true;
      });
    if (!pendingMessageAction) {
      const repeated = this.duplicateConfirmedCandidateMessageResult({
        task,
        targetUserId,
        candidate,
        text,
        candidateRecordId:
          this.number(
            payload.candidateRecordId ??
              draft.candidateRecordId ??
              candidate.candidateRecordId,
          ) ?? null,
        socialRequestId:
          this.number(
            payload.socialRequestId ??
              draft.socialRequestId ??
              candidate.socialRequestId,
          ) ?? null,
      });
      if (repeated) return repeated;
      return this.createOpenerSendApprovalFromDraft({
        ownerUserId,
        task,
        body,
        candidate,
        targetUserId,
        text,
        candidateRecordId:
          this.number(
            payload.candidateRecordId ??
              draft.candidateRecordId ??
              candidate.candidateRecordId,
          ) ?? null,
        socialRequestId:
          this.number(
            payload.socialRequestId ??
              draft.socialRequestId ??
              candidate.socialRequestId,
          ) ?? null,
      });
    }
    await this.approveOpenerApprovalBeforeSend(
      task,
      ownerUserId,
      pendingMessageAction.id,
    );

    const candidateRecordId = this.number(
      payload.candidateRecordId ??
        draft.candidateRecordId ??
        candidate.candidateRecordId,
    );
    const socialRequestId = this.number(
      payload.socialRequestId ??
        draft.socialRequestId ??
        candidate.socialRequestId,
    );
    const action = await this.executor.executeToolAction(
      task.id,
      SocialAgentToolName.SendMessageToCandidate,
      {
        candidateUserId: targetUserId,
        targetUserId,
        message: text,
        text,
        suggestedOpener: text,
        candidateRecordId,
        socialRequestId,
        candidate,
        idempotencyKey:
          (body.idempotencyKey ??
            cleanDisplayText(payload.idempotencyKey, '')) ||
          cleanDisplayText(draft.idempotencyKey, '') ||
          `opener-send:${task.id}:${targetUserId}`,
        metadata: {
          confirmationSource: 'agent_card_action',
          pendingApprovalId: pendingMessageAction.id,
          schemaAction: body.action,
          checkpointRequired: true,
          resumeMode: 'resume_after_approval',
        },
      },
      ownerUserId,
      { signal: options.signal ?? null },
    );
    this.assertToolActionSucceeded(action, '发送消息失败，请稍后再试');

    const confirmedMessage = buildSocialAgentConfirmedCandidateMessageState({
      action,
      targetUserId,
      candidate,
      text,
      candidateRecordId,
      socialRequestId,
    });
    this.rememberCandidateAction(
      task,
      targetUserId,
      confirmedMessage.candidateActionPatch,
    );
    this.rememberCandidateMessaged(task, targetUserId);
    clearSocialAgentPendingAction(task, pendingMessageAction.id);
    transitionSocialAgentState(
      task,
      'message_action',
      confirmedMessage.transitionPatch,
    );
    await this.taskRepo.save(task);
    await this.loopStateEvents?.writeCurrentTaskTransition({
      task,
      publicLoopStage: 'messages_handoff',
      workflowState: 'MESSAGES_HANDOFF',
    });
    await this.persistInviteSentState({
      task,
      targetUserId,
      candidateRecordId,
      socialRequestId,
      conversationId: confirmedMessage.conversationId,
      friendRequestId: null,
      status: 'message_sent',
    });
    await this.recordCandidateAuditEvent({
      ownerUserId,
      task,
      eventType: 'invite_sent',
      targetUserId,
      candidate,
      candidateRecordId,
      socialRequestId,
      idempotencyKey:
        (body.idempotencyKey ?? cleanDisplayText(payload.idempotencyKey, '')) ||
        `opener-send:${task.id}:${targetUserId}`,
      payload: {
        action: body.action,
        pendingApprovalId: pendingMessageAction.id,
        messageActionId: action.id,
        conversationId: confirmedMessage.conversationId,
      },
    });

    const timelineCard = buildSocialAgentMeetLoopTimelineCard({
      taskId: task.id,
      candidateUserId: targetUserId,
      stage: 'message_sent',
      nextAction:
        '已发送邀请，接下来等待对方回复；如果时间不合适，可以再调整。',
      description:
        '邀请已经按你的确认发送。后续回复、改期、确认见面和评价会继续保存在同一条约练进展里。',
      payload: {
        targetUserId,
        candidateRecordId,
        socialRequestId,
        messageActionId: action.id,
        messagePreview: text,
        connectionState: 'waiting_reply',
        waitingFor: 'counterpart_reply',
        nextRecoverableActions: [
          'meet_loop.resume',
          'meet_loop.reschedule',
          'activity.modify_time',
          'activity.modify_location',
        ],
        sideEffectPolicy: 'no_followup_without_user_confirmation',
      },
    });
    const result = this.cardActionRouteResult(
      task,
      confirmedMessage.assistantMessage,
      [timelineCard],
      null,
    );
    await this.writeEvent(
      task,
      AgentTaskEventType.ConfirmationReceived,
      'Agent card action confirmed opener send',
      {
        action: body.action,
        pendingApprovalId: pendingMessageAction.id,
        targetUserId,
        toolCallId: action.id,
      },
      AgentTaskEventActor.User,
    );
    await this.recordAssistantMessage(
      task,
      confirmedMessage.assistantMessage,
      result,
    );
    return result;
  }

  async rejectOpenerSendFromCardAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const payload = body.payload ?? {};
    const draft = this.cardActionDraft(task);
    const requestedApprovalId =
      this.number(payload.approvalId) ?? this.number(draft.approvalId);
    const pendingMessageAction = readSocialAgentTaskMemory(task)
      .pendingActions.slice()
      .reverse()
      .find((action) => {
        if (!this.isCandidateInviteApprovalAction(action.actionType))
          return false;
        return requestedApprovalId ? action.id === requestedApprovalId : true;
      });

    const assistantMessage = pendingMessageAction
      ? '已取消这次发送，未联系对方。你可以让我重新生成更合适的开场白，或者继续看其他人/活动。'
      : '这条发送确认已经不在待处理列表里，我不会发送任何消息。你可以继续让我重写开场白或换一个机会。';

    if (pendingMessageAction) {
      await this.rejectApprovalForOpener(
        task,
        ownerUserId,
        pendingMessageAction.id,
      );
      clearSocialAgentPendingAction(task, pendingMessageAction.id);
      task.result = {
        ...(task.result ?? {}),
        cardActionDraft: {
          ...draft,
          status: 'rejected',
          rejectedAt: new Date().toISOString(),
        },
      };
    }

    transitionSocialAgentState(task, 'user_message', {
      objective: 'candidate_messaging',
      nextStep: '已取消发送，可重新生成开场白或继续筛选机会',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: 'user_next_instruction',
      lastCompletedStep: pendingMessageAction
        ? 'message_send_rejected'
        : 'message_send_reject_noop',
      state: 'showing_candidates',
    });
    this.rememberShortTermStep(
      task,
      'opener.reject',
      '用户取消发送开场白',
      'done',
    );
    await this.taskRepo.save(task);
    await this.recordCandidateAuditEvent({
      ownerUserId,
      task,
      eventType: 'invite_rejected',
      candidate: draft,
      targetUserId: this.number(draft.targetUserId),
      candidateRecordId: this.number(draft.candidateRecordId),
      socialRequestId: this.number(draft.socialRequestId),
      idempotencyKey:
        cleanDisplayText(body.idempotencyKey, '') ||
        `opener-reject:${task.id}:${requestedApprovalId ?? 'latest'}`,
      payload: { action: body.action, requestedApprovalId },
    });

    const result = this.cardActionRouteResult(task, assistantMessage, [], null);
    await this.writeEvent(
      task,
      AgentTaskEventType.ConfirmationReceived,
      pendingMessageAction
        ? 'Agent card action rejected opener send'
        : 'Agent card action opener send rejection noop',
      {
        action: body.action,
        pendingApprovalId:
          pendingMessageAction?.id ?? requestedApprovalId ?? null,
      },
      AgentTaskEventActor.User,
    );
    await this.recordAssistantMessage(task, assistantMessage, result);
    return result;
  }

  async regenerateOpenerDraftFromCardAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const payload = body.payload ?? {};
    const draft = this.cardActionDraft(task);
    const requestedApprovalId =
      this.number(payload.approvalId) ?? this.number(draft.approvalId);
    const pendingMessageAction = readSocialAgentTaskMemory(task)
      .pendingActions.slice()
      .reverse()
      .find((action) => {
        if (!this.isCandidateInviteApprovalAction(action.actionType))
          return false;
        return requestedApprovalId ? action.id === requestedApprovalId : true;
      });
    if (pendingMessageAction) {
      await this.rejectApprovalForOpener(
        task,
        ownerUserId,
        pendingMessageAction.id,
      );
      clearSocialAgentPendingAction(task, pendingMessageAction.id);
    }

    const candidate = readSocialAgentCardActionCandidate({
      payload: { ...draft, ...payload },
      task,
      isRecord: (value) => this.isRecord(value),
    });
    const targetUserId =
      this.number(payload.targetUserId) ??
      this.number(draft.targetUserId) ??
      this.number(candidate.targetUserId) ??
      this.number(candidate.candidateUserId) ??
      this.number(candidate.userId);
    const previousMessage = cleanDisplayText(
      payload.message ?? payload.suggestedOpener ?? draft.message,
      '',
    ).trim();
    const regeneratedDraft = buildSocialAgentCandidateMessageDraft({
      cardActionDraft: {
        ...draft,
        message: '',
        suggestedOpener: '',
      },
      candidates: [candidate, ...readSocialAgentStoredCandidateSummaries(task)],
      regenerate: true,
      previousMessage,
    });

    const openerDraft = this.buildOpenerDraftPreviewState({
      action: 'opener.regenerate',
      targetUserId,
      candidate,
      draft: regeneratedDraft,
      body,
      payload: {
        ...payload,
        targetUserId,
        candidateRecordId: this.number(candidate.candidateRecordId) ?? null,
        socialRequestId: this.number(candidate.socialRequestId) ?? null,
        message: regeneratedDraft,
        previousMessage: previousMessage || null,
      },
    });
    task.result = {
      ...(task.result ?? {}),
      cardActionDraft: {
        ...openerDraft.cardActionDraft,
        previousMessage: previousMessage || null,
        regeneratedFromApprovalId:
          pendingMessageAction?.id ?? requestedApprovalId ?? null,
      },
    };
    transitionSocialAgentState(
      task,
      'message_action',
      openerDraft.transitionPatch,
    );
    await this.taskRepo.save(task);

    const card = this.buildOpenerDraftCandidateCard({
      taskId: task.id,
      targetUserId,
      candidate,
      displayName: openerDraft.displayName,
      draft: regeneratedDraft,
      regeneratePayload: {
        ...payload,
        taskId: task.id,
        targetUserId,
        candidate,
        message: regeneratedDraft,
        previousMessage: previousMessage || null,
      },
    });
    const assistantMessage =
      '我重新写了一版更轻、更安全的开场白。只有你点发送邀请并确认后，我才会触达对方。';
    const result = this.cardActionRouteResult(
      task,
      assistantMessage,
      [card],
      null,
    );
    await this.writeEvent(
      task,
      AgentTaskEventType.StepCompleted,
      'Agent card action regenerated opener draft',
      {
        action: body.action,
        previousApprovalId:
          pendingMessageAction?.id ?? requestedApprovalId ?? null,
        targetUserId,
      },
      AgentTaskEventActor.Agent,
    );
    await this.recordCandidateAuditEvent({
      ownerUserId,
      task,
      eventType: 'opener_regenerated',
      targetUserId,
      candidate,
      candidateRecordId: this.number(candidate.candidateRecordId),
      socialRequestId: this.number(candidate.socialRequestId),
      idempotencyKey:
        cleanDisplayText(body.idempotencyKey, '') ||
        `opener-regenerate:${task.id}:${targetUserId ?? 'candidate'}`,
      payload: {
        action: body.action,
        previousApprovalId:
          pendingMessageAction?.id ?? requestedApprovalId ?? null,
      },
    });
    await this.recordAssistantMessage(task, assistantMessage, result);
    return result;
  }

  async performCandidatePreferenceAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    const action = body.action;
    if (
      action !== 'candidate.view_detail' &&
      action !== 'candidate.more_like_this' &&
      action !== 'candidate.skip' &&
      action !== 'candidate.like'
    ) {
      throw new BadRequestException('Unsupported candidate preference action');
    }

    if (action === 'candidate.like') {
      await this.saveCandidate(ownerUserId, taskId, {
        ...(body.payload ?? {}),
      });
    }

    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const candidate = readSocialAgentCardActionCandidate({
      payload: body.payload ?? {},
      task,
      isRecord: (value) => this.isRecord(value),
    });
    const targetUserId =
      this.number(body.payload?.targetUserId) ??
      this.number(candidate.targetUserId) ??
      this.number(candidate.candidateUserId) ??
      this.number(candidate.userId);
    const now = new Date().toISOString();
    const taskMemory = readSocialAgentTaskMemory(task);
    if (targetUserId && action === 'candidate.like') {
      taskMemory.candidateState.savedIds = this.mergeNumberList(
        taskMemory.candidateState.savedIds,
        targetUserId,
      );
    }
    if (targetUserId && action === 'candidate.skip') {
      taskMemory.candidateState.rejectedIds = this.mergeNumberList(
        taskMemory.candidateState.rejectedIds,
        targetUserId,
      );
    }
    if (action === 'candidate.more_like_this') {
      taskMemory.currentTask = {
        ...taskMemory.currentTask,
        objective: 'candidate_refinement',
        nextStep: '按当前候选人的共同点继续寻找类似机会',
        shouldSearchNow: true,
        awaitingSearchConfirmation: false,
        waitingFor: 'more_candidates',
        lastCompletedStep: 'candidate_preference_recorded',
      };
    }
    writeSocialAgentTaskMemory(task, taskMemory);
    rememberSocialAgentShortTerm(task, {
      lastCandidatePreference: {
        action,
        targetUserId,
        candidate: sanitizeForDisplay(candidate),
        at: now,
      },
    });
    this.rememberShortTermStep(
      task,
      action,
      this.candidatePreferenceStepLabel(action),
      'done',
    );
    await this.taskRepo.save(task);
    await this.recordCandidateInterestEvent({
      ownerUserId,
      task,
      action,
      targetUserId,
      candidate,
      candidateRecordId: this.number(body.payload?.candidateRecordId),
      socialRequestId: this.number(body.payload?.socialRequestId),
      idempotencyKey: cleanDisplayText(body.idempotencyKey, '') || null,
    });
    await this.recordCandidateAuditEvent({
      ownerUserId,
      task,
      eventType: this.auditEventTypeForCandidatePreference(action),
      targetUserId,
      candidate,
      candidateRecordId: this.number(body.payload?.candidateRecordId),
      socialRequestId: this.number(body.payload?.socialRequestId),
      idempotencyKey: cleanDisplayText(body.idempotencyKey, '') || null,
      payload: { action },
    });

    const assistantMessage = this.candidatePreferenceAssistantMessage({
      action,
      candidate,
      targetUserId,
    });
    const detailCards =
      action === 'candidate.view_detail'
        ? [
            buildSocialAgentCandidateDetailCard({
              taskId: task.id,
              candidate,
            }),
          ]
        : [];
    const result = this.cardActionRouteResult(
      task,
      assistantMessage,
      detailCards,
      null,
    );
    await this.writeEvent(
      task,
      AgentTaskEventType.StepCompleted,
      this.candidatePreferenceStepLabel(action),
      {
        action,
        targetUserId,
        candidate: sanitizeForDisplay(candidate),
      },
      AgentTaskEventActor.User,
    );
    await this.recordAssistantMessage(task, assistantMessage, result);
    return result;
  }

  async connectCandidateFromCardAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    const connectResult = await this.connectCandidate(
      ownerUserId,
      taskId,
      body.payload ?? {},
    );
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const isPending = connectResult.status === 'pending_approval';
    const targetUserId = this.number(connectResult.targetUserId);
    const pendingApproval =
      isPending && this.number(connectResult.approvalId)
        ? ({
            id: this.number(connectResult.approvalId) as number,
            type: ApprovalType.ContactRequest,
            actionType: 'connect_candidate',
            summary: targetUserId ? '加好友并聊天：这位用户' : '加好友并聊天',
            riskLevel: ApprovalRiskLevel.High,
            payload: body.payload ?? {},
            expiresAt: null,
          } satisfies SocialAgentPendingApprovalSnapshot)
        : null;
    const assistantMessage = isPending
      ? '加好友并聊天前还需要你确认。我已经把这个动作放在当前候选卡里；你确认前不会联系对方。'
      : '已按你的确认建立站内连接，并打开后续沟通入口。接下来可以等待对方回复，或继续让我帮你准备更自然的沟通节奏。';
    const resolvedFriendRequestId =
      cleanDisplayText(connectResult.friendRequestId, '') || null;
    const resolvedConversationId =
      cleanDisplayText(connectResult.conversationId, '') || null;
    const resolvedConnectionStatus = cleanDisplayText(
      connectResult.status,
      isPending ? 'pending_approval' : 'connected',
    );
    await this.persistInviteSentState({
      task,
      targetUserId,
      candidateRecordId: this.number(body.payload?.candidateRecordId),
      socialRequestId: this.number(body.payload?.socialRequestId),
      conversationId: resolvedConversationId,
      friendRequestId: resolvedFriendRequestId,
      status: resolvedConnectionStatus,
    });
    await this.recordCandidateAuditEvent({
      ownerUserId,
      task,
      eventType: isPending
        ? 'connect_approval_requested'
        : 'connect_established',
      targetUserId,
      candidate: body.payload?.candidate as Record<string, unknown>,
      candidateRecordId: this.number(body.payload?.candidateRecordId),
      socialRequestId: this.number(body.payload?.socialRequestId),
      idempotencyKey:
        cleanDisplayText(body.idempotencyKey, '') ||
        cleanDisplayText(body.payload?.idempotencyKey, '') ||
        `candidate-connect:${taskId}:${targetUserId ?? 'candidate'}`,
      payload: {
        action: body.action,
        status: resolvedConnectionStatus,
        approvalId: isPending ? connectResult.approvalId : null,
        conversationId: resolvedConversationId,
        friendRequestId: resolvedFriendRequestId,
      },
    });
    const candidateForApproval = readSocialAgentCardActionCandidate({
      payload: body.payload ?? {},
      task,
      isRecord: (value) => this.isRecord(value),
    });
    const pendingCandidateCard =
      isPending && targetUserId
        ? buildSocialAgentCandidateDetailCard({
            taskId,
            candidate: {
              ...candidateForApproval,
              targetUserId,
              candidateUserId: targetUserId,
              candidateRecordId: this.number(body.payload?.candidateRecordId),
              socialRequestId: this.number(body.payload?.socialRequestId),
              displayName:
                cleanDisplayText(
                  candidateForApproval.displayName ??
                    candidateForApproval.nickname,
                  '',
                ) || '这位用户',
              safetyBoundary:
                cleanDisplayText(
                  body.payload?.safetyBoundary ??
                    candidateForApproval.safetyBoundary,
                  '',
                ) || '确认前不会联系对方；建议先站内沟通。',
              suggestedOpener:
                cleanDisplayText(
                  body.payload?.suggestedOpener ??
                    candidateForApproval.suggestedOpener,
                  '',
                ) || undefined,
            },
          })
        : null;
    const timelineCard = buildSocialAgentMeetLoopTimelineCard({
      taskId,
      candidateUserId: targetUserId,
      stage: 'waiting_reply',
      nextAction: '等待对方回复；如果时间不合适，可以继续改期或调整邀约。',
      description:
        '邀请发送后，我会把后续回复、改期、确认见面和评价串成连续流程。',
      payload: {
        targetUserId,
        candidateRecordId: this.number(body.payload?.candidateRecordId),
        socialRequestId: this.number(body.payload?.socialRequestId),
        conversationId: resolvedConversationId,
        friendRequestId: resolvedFriendRequestId,
        connectionStatus: resolvedConnectionStatus,
      },
    });
    const result = this.cardActionRouteResult(
      task,
      assistantMessage,
      pendingCandidateCard ? [pendingCandidateCard] : [timelineCard],
      pendingApproval,
    );
    await this.recordAssistantMessage(task, assistantMessage, result);
    return result;
  }

  async confirmPendingCandidateMessageIfRequested(
    ownerUserId: number,
    task: AgentTask,
    message: string,
  ): Promise<{
    task: AgentTask;
    assistantMessage: string;
    cards: SocialAgentIntentRouteResult['cards'];
  } | null> {
    if (!this.looksLikeMessageSendConfirmation(message)) return null;
    const pendingMessageAction = readSocialAgentTaskMemory(task)
      .pendingActions.slice()
      .reverse()
      .find((action) =>
        this.isCandidateInviteApprovalAction(action.actionType),
      );

    const candidate =
      readSocialAgentStoredCandidateSummaries(task)[0] ??
      this.cardActionDraftCandidate(task);
    if (!candidate) return null;
    const targetUserId =
      this.number(candidate.candidateUserId) ?? this.number(candidate.userId);
    const text = this.candidateMessageDraft(task);
    if (!targetUserId || !text) return null;
    const repeated = this.duplicateConfirmedCandidateMessageResult({
      task,
      targetUserId,
      candidate,
      text,
      candidateRecordId: this.number(candidate.candidateRecordId) ?? null,
      socialRequestId: this.number(candidate.socialRequestId) ?? null,
    });
    if (repeated) {
      return {
        task,
        assistantMessage: repeated.assistantMessage,
        cards: repeated.cards,
      };
    }
    if (!pendingMessageAction) return null;

    const candidateRecordId = this.number(candidate.candidateRecordId);
    const socialRequestId = this.number(candidate.socialRequestId);
    await this.approveOpenerApprovalBeforeSend(
      task,
      ownerUserId,
      pendingMessageAction.id,
    );
    const action = await this.executor.executeToolAction(
      task.id,
      SocialAgentToolName.SendMessageToCandidate,
      {
        candidateUserId: targetUserId,
        targetUserId,
        message: text,
        text,
        suggestedOpener: text,
        candidateRecordId,
        socialRequestId,
        candidate,
        idempotencyKey: `opener-send:${task.id}:${targetUserId}`,
        metadata: {
          confirmationSource: 'social_agent_chat',
          pendingApprovalId: pendingMessageAction.id,
          userConfirmationText: message,
          checkpointRequired: true,
          resumeMode: 'resume_after_approval',
        },
      },
      ownerUserId,
    );
    this.assertToolActionSucceeded(action, '发送消息失败，请稍后再试');

    const confirmedMessage = buildSocialAgentConfirmedCandidateMessageState({
      action,
      targetUserId,
      candidate,
      text,
      candidateRecordId,
      socialRequestId,
    });
    this.rememberCandidateAction(
      task,
      targetUserId,
      confirmedMessage.candidateActionPatch,
    );
    this.rememberCandidateMessaged(task, targetUserId);
    clearSocialAgentPendingAction(task, pendingMessageAction.id);
    transitionSocialAgentState(
      task,
      'message_action',
      confirmedMessage.transitionPatch,
    );
    await this.taskRepo.save(task);
    await this.persistInviteSentState({
      task,
      targetUserId,
      candidateRecordId,
      socialRequestId,
      conversationId: confirmedMessage.conversationId,
      friendRequestId: null,
      status: 'message_sent',
    });
    await this.recordCandidateAuditEvent({
      ownerUserId,
      task,
      eventType: 'invite_sent',
      targetUserId,
      candidate,
      candidateRecordId,
      socialRequestId,
      idempotencyKey: `opener-send:${task.id}:${targetUserId}`,
      payload: {
        source: 'chat_confirmation',
        pendingApprovalId: pendingMessageAction.id,
        messageActionId: action.id,
        conversationId: confirmedMessage.conversationId,
      },
    });

    return {
      task,
      assistantMessage: confirmedMessage.assistantMessage,
      cards: [
        buildSocialAgentMeetLoopTimelineCard({
          taskId: task.id,
          candidateUserId: targetUserId,
          stage: 'message_sent',
          nextAction:
            '已发送邀请，接下来等待对方回复；如果时间不合适，可以再调整。',
          description:
            '邀请已经按你的确认发送。后续回复、改期、确认见面和评价会继续保存在同一条约练进展里。',
          payload: {
            targetUserId,
            candidateRecordId,
            socialRequestId,
            messageActionId: action.id,
            messagePreview: text,
            connectionState: 'waiting_reply',
            waitingFor: 'counterpart_reply',
            nextRecoverableActions: [
              'meet_loop.resume',
              'meet_loop.reschedule',
              'activity.modify_time',
              'activity.modify_location',
            ],
            sideEffectPolicy: 'no_followup_without_user_confirmation',
          },
        }),
      ],
    };
  }

  async saveCandidate(
    ownerUserId: number,
    taskId: number,
    body: CandidateTargetBody & {
      candidateRecordId?: number | null;
      socialRequestId?: number | null;
      targetUserId?: number | null;
      candidateUserId?: number | null;
      candidate?: Record<string, unknown>;
    },
  ): Promise<SocialAgentToolCallRecord> {
    let task = await this.assertTaskOwner(taskId, ownerUserId);
    const candidateRecordId = this.number(body.candidateRecordId);
    const socialRequestId = this.number(body.socialRequestId);
    const targetUserId = await this.executor.resolveCandidateTargetUser(
      body as Record<string, unknown>,
      ownerUserId,
    );
    if (!candidateRecordId && (!socialRequestId || !targetUserId)) {
      throw new BadRequestException('候选人缺少可收藏的持久化记录');
    }

    const action = await this.executor.executeToolAction(
      taskId,
      SocialAgentToolName.SaveCandidate,
      {
        candidateRecordId,
        socialRequestId,
        targetUserId,
        candidate: body.candidate ?? {},
        metadata: {
          confirmationSource: 'social_agent_chat',
        },
      },
      ownerUserId,
    );
    if (action.status === 'succeeded') {
      task = await this.assertTaskOwner(taskId, ownerUserId);
      this.rememberCandidateAction(task, targetUserId, {
        save: 'saved',
        candidateRecordId,
        socialRequestId,
        toolCallId: action.id,
      });
      await this.taskRepo.save(task);
      await this.recordCandidateAuditEvent({
        ownerUserId,
        task,
        eventType: 'candidate_saved',
        targetUserId,
        candidate: body.candidate ?? {},
        candidateRecordId,
        socialRequestId,
        idempotencyKey: `candidate-save:${taskId}:${targetUserId}`,
        payload: { toolCallId: action.id },
      });
    }
    return action;
  }

  async sendCandidateMessage(
    ownerUserId: number,
    taskId: number,
    body: CandidateTargetBody & {
      targetUserId?: number;
      candidateUserId?: number;
      message?: string;
      suggestedOpener?: string;
      candidateRecordId?: number | null;
      socialRequestId?: number | null;
      candidate?: Record<string, unknown>;
    },
  ): Promise<Record<string, unknown>> {
    await this.assertTaskOwner(taskId, ownerUserId);
    const targetUserId = await this.executor.resolveCandidateTargetUser(
      body as Record<string, unknown>,
      ownerUserId,
    );
    const text = cleanDisplayText(
      body.message ?? body.suggestedOpener,
      '',
    ).trim();
    if (!targetUserId || !text) {
      throw new BadRequestException('请选择候选人并填写要发送的消息');
    }
    const candidateRecordId = this.number(
      body.candidateRecordId ?? body.candidate?.candidateRecordId,
    );
    const socialRequestId = this.number(
      body.socialRequestId ?? body.candidate?.socialRequestId,
    );

    const messageAction = await this.executor.executeToolAction(
      taskId,
      SocialAgentToolName.SendMessage,
      {
        targetUserId,
        candidateUserId: targetUserId,
        text,
        message: text,
        suggestedOpener: text,
        candidateRecordId,
        socialRequestId,
        candidate: body.candidate ?? {},
        metadata: {
          confirmationSource: 'social_agent_chat',
        },
      },
      ownerUserId,
    );
    this.assertToolActionSucceeded(messageAction, '发送消息失败，请稍后再试');
    const messageResult = buildSocialAgentDirectCandidateMessageResult({
      taskId,
      targetUserId,
      messageAction,
    });
    const requiresApproval = messageResult.status === 'pending_approval';
    const approvalId = this.number(messageResult.approvalId);

    const task = await this.assertTaskOwner(taskId, ownerUserId);
    this.rememberCandidateAction(task, targetUserId, {
      send: requiresApproval ? 'pendingApproval' : 'sent',
      conversationId: messageResult.conversationId,
      messageId: messageResult.messageId,
      candidateRecordId,
      socialRequestId,
      toolCallId: messageAction.id,
    });
    if (requiresApproval && approvalId) {
      recordSocialAgentPendingAction(task, {
        id: approvalId,
        type: ApprovalType.SendMessage,
        actionType: 'send_invite',
        summary: '发送消息给这位用户',
        riskLevel: ApprovalRiskLevel.High,
        at: new Date().toISOString(),
      });
    }
    transitionSocialAgentState(
      task,
      requiresApproval ? 'confirmation_required' : 'message_action',
      {
        objective: 'candidate_messaging',
        nextStep: requiresApproval ? '等待用户确认发送消息' : '等待候选人回复',
        shouldSearchNow: false,
        awaitingSearchConfirmation: false,
        waitingFor: requiresApproval
          ? 'message_confirmation'
          : 'candidate_reply',
        lastCompletedStep: requiresApproval
          ? 'message_approval_created'
          : 'message_sent',
      },
    );
    await this.taskRepo.save(task);
    await this.recordCandidateAuditEvent({
      ownerUserId,
      task,
      eventType: requiresApproval ? 'invite_approval_requested' : 'invite_sent',
      targetUserId,
      candidate: body.candidate ?? {},
      candidateRecordId,
      socialRequestId,
      idempotencyKey: `candidate-message:${taskId}:${targetUserId}`,
      payload: {
        messageActionId: messageAction.id,
        approvalId,
        status: messageResult.status,
        conversationId: messageResult.conversationId,
      },
    });

    return messageResult;
  }

  async connectCandidate(
    ownerUserId: number,
    taskId: number,
    body: CandidateTargetBody & {
      targetUserId?: number | null;
      candidateUserId?: number | null;
      candidateRecordId?: number | null;
      socialRequestId?: number | null;
      candidate?: Record<string, unknown>;
      idempotencyKey?: string | null;
      opportunityId?: string | null;
      approvalRequired?: boolean | null;
      checkpointRequired?: boolean | null;
      resumeMode?: string | null;
      safetyBoundary?: string | null;
      suggestedOpener?: string | null;
      schemaAction?: string | null;
      sourceStepId?: string | null;
      riskLevel?: string | null;
      riskReasons?: unknown;
    },
  ): Promise<Record<string, unknown>> {
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    this.featureFlags?.assertEnabled('connect_candidate', {
      userId: ownerUserId,
    });
    const targetUserId = await this.executor.resolveCandidateTargetUser(
      body as Record<string, unknown>,
      ownerUserId,
    );
    if (!targetUserId) {
      throw new BadRequestException('请选择要发送邀请的候选人');
    }
    const candidateRecordId = this.number(body.candidateRecordId);
    const socialRequestId = this.number(body.socialRequestId);
    const pendingToolCall = this.pendingConnectToolCall({
      taskId,
      targetUserId,
      candidateRecordId,
      socialRequestId,
      body,
    });
    const idempotencyKey =
      cleanDisplayText(body.idempotencyKey, '') ||
      `candidate-connect:${taskId}:${targetUserId}`;
    const existingPendingConnect = this.duplicatePendingConnectCandidateResult({
      task,
      taskId,
      targetUserId,
      candidateRecordId,
      socialRequestId,
      idempotencyKey,
      pendingToolCall,
    });
    if (existingPendingConnect) return existingPendingConnect;
    const checkpointPayload = this.connectCheckpointPayload({
      taskId,
      targetUserId,
      candidateRecordId,
      socialRequestId,
      body: {
        ...body,
        idempotencyKey,
        approvalRequired: true,
        checkpointRequired: true,
        resumeMode:
          cleanDisplayText(body.resumeMode, '') || 'resume_after_approval',
      },
      toolCallId: pendingToolCall.id,
    });
    const approval = await this.approvals.create({
      userId: ownerUserId,
      agentConnectionId: null,
      agentTaskId: taskId,
      type: ApprovalType.ContactRequest,
      actionType: 'connect_candidate',
      skillName: 'connect_candidate',
      payload: checkpointPayload,
      summary: '加好友并聊天：这位用户',
      riskLevel: ApprovalRiskLevel.High,
      reason:
        'FitMeet Agent 已准备建立候选人站内连接，等待用户确认后再联系对方。',
      createdBy: 'agent',
      relatedCandidateId: candidateRecordId,
      relatedSocialRequestId: socialRequestId,
    });
    this.rememberCandidateAction(task, targetUserId, {
      connect: 'pendingApproval',
      candidateRecordId,
      socialRequestId,
      toolCallId: pendingToolCall.id,
      idempotencyKey,
      approvalId: approval.id,
      opportunityId: cleanDisplayText(body.opportunityId, '') || null,
      resumeMode: checkpointPayload.resumeMode,
    });
    recordSocialAgentPendingAction(task, {
      id: approval.id,
      type: ApprovalType.ContactRequest,
      actionType: 'connect_candidate',
      summary: '加好友并聊天：这位用户',
      riskLevel: ApprovalRiskLevel.High,
      at: new Date().toISOString(),
      payload: {
        ...checkpointPayload,
        approvalId: approval.id,
      },
    });
    transitionSocialAgentState(task, 'confirmation_required', {
      objective: 'candidate_messaging',
      nextStep: '等待用户确认加好友并聊天',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: 'connect_confirmation',
      lastCompletedStep: 'connect_approval_created',
    });
    await this.taskRepo.save(task);
    await this.recordCandidateAuditEvent({
      ownerUserId,
      task,
      eventType: 'connect_approval_requested',
      targetUserId,
      candidate: body.candidate ?? {},
      candidateRecordId,
      socialRequestId,
      idempotencyKey,
      payload: {
        action: 'candidate.connect',
        approvalId: approval.id,
        toolCallId: pendingToolCall.id,
        opportunityId: cleanDisplayText(body.opportunityId, '') || null,
      },
    });

    const pendingFriendAction = {
      ...pendingToolCall,
      output: {
        status: 'pending_approval',
        requiresApproval: true,
        approvalId: approval.id,
      },
    };
    return buildSocialAgentCandidateConnectResult({
      taskId,
      targetUserId,
      friendAction: pendingFriendAction,
    });
  }

  private async persistInviteSentState(input: {
    task: AgentTask;
    targetUserId: number | null;
    candidateRecordId: number | null;
    socialRequestId: number | null;
    conversationId: string | null;
    friendRequestId: string | null;
    status: string;
  }): Promise<void> {
    if (!this.l5Runtime) return;
    await this.l5Runtime.transitionMeetLoop({
      ownerUserId: input.task.ownerUserId,
      agentTaskId: input.task.id,
      activityId: null,
      candidateUserId: input.targetUserId,
      stage: 'invite_sent',
      waitingFor:
        input.status === 'pending_approval'
          ? 'invite_confirmation'
          : 'counterpart_reply',
      state: {
        candidateUserId: input.targetUserId,
        targetUserId: input.targetUserId,
        candidateRecordId: input.candidateRecordId,
        socialRequestId: input.socialRequestId,
        conversationId: input.conversationId,
        friendRequestId: input.friendRequestId,
        status: input.status,
        loopStage: 'invite_sent',
        connectionState:
          input.status === 'pending_approval'
            ? 'pending_approval'
            : 'waiting_reply',
        nextRecoverableActions:
          input.status === 'pending_approval'
            ? ['candidate.connect']
            : [
                'meet_loop.resume',
                'meet_loop.reschedule',
                'activity.modify_time',
                'activity.modify_location',
              ],
        sideEffectPolicy: 'no_followup_without_user_confirmation',
        publicPlaceOnly: true,
        noPreciseLocation: true,
      },
      review: null,
    });
  }

  private duplicatePendingConnectCandidateResult(input: {
    task: AgentTask;
    taskId: number;
    targetUserId: number;
    candidateRecordId: number | null;
    socialRequestId: number | null;
    idempotencyKey: string;
    pendingToolCall: SocialAgentToolCallRecord;
  }): SocialAgentCandidateConnectResult | null {
    const actions = (
      this.sessionAssembler ?? this.fallbackSessionAssembler
    ).readCandidateActions(input.task);
    const previous = actions[String(input.targetUserId)];
    if (!previous || previous.connect !== 'pendingApproval') return null;
    const previousKey = cleanDisplayText(previous.idempotencyKey, '');
    if (previousKey && previousKey !== input.idempotencyKey) return null;
    const pendingAction = readSocialAgentTaskMemory(input.task)
      .pendingActions.slice()
      .reverse()
      .find((action) => {
        if (action.actionType !== 'connect_candidate') return false;
        const payload = this.isRecord(action.payload) ? action.payload : {};
        const payloadTargetUserId = this.number(
          payload.targetUserId ?? payload.candidateUserId,
        );
        return payloadTargetUserId === input.targetUserId;
      });
    const approvalId =
      this.number(previous.approvalId) ?? this.number(pendingAction?.id);
    if (!approvalId) return null;
    const pendingFriendAction = {
      ...input.pendingToolCall,
      output: {
        status: 'pending_approval',
        requiresApproval: true,
        approvalId,
        idempotentReuse: true,
      },
    };
    return buildSocialAgentCandidateConnectResult({
      taskId: input.taskId,
      targetUserId: input.targetUserId,
      friendAction: pendingFriendAction,
    });
  }

  private duplicateConfirmedCandidateMessageResult(input: {
    task: AgentTask;
    targetUserId: number;
    candidate: Record<string, unknown>;
    text: string;
    candidateRecordId: number | null;
    socialRequestId: number | null;
  }): SocialAgentIntentRouteResult | null {
    const actions = (
      this.sessionAssembler ?? this.fallbackSessionAssembler
    ).readCandidateActions(input.task);
    const previous = actions[String(input.targetUserId)];
    if (!previous || previous.send !== 'sent') return null;
    const conversationId =
      cleanDisplayText(previous.conversationId, '') || null;
    const messageId = cleanDisplayText(previous.messageId, '') || null;
    const name = cleanDisplayText(
      input.candidate.nickname ?? input.candidate.displayName,
      `用户 #${input.targetUserId}`,
    );
    const assistantMessage = `这条邀请已经发送给${name}，我不会重复发送。接下来可以等对方回复，或让我帮你准备后续改期/约练方案。`;
    const timelineCard = buildSocialAgentMeetLoopTimelineCard({
      taskId: input.task.id,
      candidateUserId: input.targetUserId,
      stage: 'message_sent',
      nextAction: '邀请已经发送过，不会重复触达；接下来等待对方回复。',
      description:
        '这次重复确认被识别为同一步的恢复请求，系统复用了已有发送状态。',
      payload: {
        targetUserId: input.targetUserId,
        candidateRecordId: input.candidateRecordId,
        socialRequestId: input.socialRequestId,
        messageActionId: cleanDisplayText(previous.toolCallId, '') || null,
        messageId,
        conversationId,
        messagePreview: input.text,
        connectionState: 'waiting_reply',
        waitingFor: 'counterpart_reply',
        nextRecoverableActions: [
          'meet_loop.resume',
          'meet_loop.reschedule',
          'activity.modify_time',
          'activity.modify_location',
        ],
        sideEffectPolicy: 'idempotent_no_duplicate_send',
      },
    });
    return this.cardActionRouteResult(
      input.task,
      assistantMessage,
      [timelineCard],
      null,
    );
  }

  candidateMessageDraft(task: AgentTask): string {
    return buildSocialAgentCandidateMessageDraft({
      cardActionDraft: this.cardActionDraft(task),
      candidates: readSocialAgentStoredCandidateSummaries(task),
    });
  }

  private buildOpenerDraftPreviewState(input: {
    action: string;
    targetUserId: number | null;
    candidate: Record<string, unknown>;
    draft: string;
    body: SocialAgentCardActionBody;
    payload: Record<string, unknown>;
  }) {
    const candidateRecordId =
      this.number(input.payload.candidateRecordId) ??
      this.number(input.candidate.candidateRecordId) ??
      null;
    const socialRequestId =
      this.number(input.payload.socialRequestId) ??
      this.number(input.candidate.socialRequestId) ??
      null;
    const idempotencyKey =
      (input.body.idempotencyKey ??
        cleanDisplayText(input.payload.idempotencyKey, '')) ||
      `opener-send:${input.targetUserId ?? 'candidate'}`;
    const displayName =
      cleanDisplayText(
        input.candidate.displayName ?? input.candidate.nickname,
        '',
      ) || '对方';
    const openerDraft = buildSocialAgentOpenerDraftState({
      action: input.action,
      targetUserId: input.targetUserId,
      candidate: input.candidate,
      draft: input.draft,
    });

    return {
      cardActionDraft: {
        ...openerDraft.cardActionDraft,
        candidateRecordId,
        socialRequestId,
        idempotencyKey,
      },
      transitionPatch: openerDraft.transitionPatch,
      displayName,
      assistantMessage: openerDraft.assistantMessage,
    };
  }

  private buildOpenerDraftCandidateCard(input: {
    taskId: number;
    targetUserId: number | null;
    candidate: Record<string, unknown>;
    displayName: string;
    draft: string;
    regeneratePayload: Record<string, unknown>;
  }): FitMeetAlphaCard {
    const candidateRecordId = this.number(input.candidate.candidateRecordId);
    const socialRequestId = this.number(input.candidate.socialRequestId);
    const candidateIdentity =
      input.targetUserId ?? candidateRecordId ?? socialRequestId ?? 'candidate';
    const candidate = {
      ...input.candidate,
      targetUserId: input.targetUserId,
      candidateUserId: input.targetUserId,
      candidateRecordId,
      socialRequestId,
      suggestedOpener: input.draft,
      recommendationLine:
        cleanDisplayText(input.candidate.recommendationLine, '') ||
        `我给 ${input.displayName} 准备了一条低压力开场白。`,
      safetyBoundary:
        cleanDisplayText(input.candidate.safetyBoundary, '') ||
        '确认前不会发送。建议先站内沟通，不急着交换联系方式。',
    };
    const card = buildSocialAgentCandidateDetailCard({
      taskId: input.taskId,
      candidate,
    });
    const basePayload = {
      taskId: input.taskId,
      targetUserId: input.targetUserId,
      candidateUserId: input.targetUserId,
      candidateRecordId,
      socialRequestId,
      candidate,
      message: input.draft,
      suggestedOpener: input.draft,
      safetyBoundary:
        cleanDisplayText(input.candidate.safetyBoundary, '') ||
        '确认前不会发送。建议先站内沟通，不急着交换联系方式。',
    };

    return {
      ...card,
      id: `opener_draft:${input.taskId}:${candidateIdentity}`,
      type: 'candidate_card',
      title: `${input.displayName} 的开场白草稿`,
      body: input.draft,
      status: 'ready',
      data: {
        ...card.data,
        openerDraftReady: true,
        suggestedOpener: input.draft,
        message: input.draft,
        nextAction: '如果这条语气合适，点击发送邀请后我会再让你确认一次。',
      },
      actions: [
        {
          id: `opener_confirm_send:${input.taskId}:${candidateIdentity}`,
          label: '发送邀请',
          action: 'send_message',
          schemaAction: 'opener.confirm_send',
          requiresConfirmation: true,
          payload: {
            ...basePayload,
            approvalRequired: true,
            checkpointRequired: true,
            resumeMode: 'resume_after_approval',
            idempotencyKey: `opener-send:${input.taskId}:${candidateIdentity}`,
          },
        },
        {
          id: `opener_regenerate:${input.taskId}:${candidateIdentity}`,
          label: '重新生成',
          action: 'generate_opener',
          schemaAction: 'opener.regenerate',
          requiresConfirmation: false,
          payload: {
            ...input.regeneratePayload,
            ...basePayload,
          },
        },
        {
          id: `opener_reject_send:${input.taskId}:${candidateIdentity}`,
          label: '暂不发送',
          action: 'reject_opener',
          schemaAction: 'opener.reject',
          requiresConfirmation: false,
          payload: basePayload,
        },
      ],
    };
  }

  private async createOpenerSendApprovalFromDraft(input: {
    ownerUserId: number;
    task: AgentTask;
    body: SocialAgentCardActionBody;
    candidate: Record<string, unknown>;
    targetUserId: number;
    text: string;
    candidateRecordId: number | null;
    socialRequestId: number | null;
  }): Promise<SocialAgentIntentRouteResult> {
    const payload = input.body.payload ?? {};
    const approval = await this.approvals.create(
      buildSocialAgentOpenerDraftApprovalInput({
        ownerUserId: input.ownerUserId,
        taskId: input.task.id,
        action: 'opener.confirm_send',
        targetUserId: input.targetUserId,
        candidate: input.candidate,
        draft: input.text,
        relatedCandidateId: input.candidateRecordId,
        idempotencyKey:
          (input.body.idempotencyKey ??
            cleanDisplayText(payload.idempotencyKey, '')) ||
          `opener-send:${input.task.id}:${input.targetUserId}`,
        safetyBoundary: cleanDisplayText(payload.safetyBoundary, ''),
      }),
    );
    const pendingApproval = this.toPendingApprovalSnapshot(approval);
    const openerDraft = buildSocialAgentOpenerDraftState({
      action: 'opener.confirm_send',
      targetUserId: input.targetUserId,
      candidate: input.candidate,
      draft: input.text,
      approvalId: approval.id,
      pendingApproval,
      at: new Date().toISOString(),
    });
    if (openerDraft.pendingAction) {
      recordSocialAgentPendingAction(input.task, openerDraft.pendingAction);
    }
    input.task.result = {
      ...(input.task.result ?? {}),
      cardActionDraft: {
        ...openerDraft.cardActionDraft,
        candidateRecordId: input.candidateRecordId,
        socialRequestId: input.socialRequestId,
      },
    };
    transitionSocialAgentState(
      input.task,
      'confirmation_required',
      openerDraft.transitionPatch,
    );
    await this.taskRepo.save(input.task);
    await this.recordCandidateAuditEvent({
      ownerUserId: input.ownerUserId,
      task: input.task,
      eventType: 'invite_approval_requested',
      targetUserId: input.targetUserId,
      candidate: input.candidate,
      candidateRecordId: input.candidateRecordId,
      socialRequestId: input.socialRequestId,
      idempotencyKey:
        (input.body.idempotencyKey ??
          cleanDisplayText(payload.idempotencyKey, '')) ||
        `opener-approval:${input.task.id}:${input.targetUserId}`,
      payload: {
        action: 'opener.confirm_send',
        approvalId: approval.id,
        messagePreview: input.text,
      },
    });

    const displayName =
      cleanDisplayText(
        input.candidate.displayName ?? input.candidate.nickname,
        '',
      ) || (input.targetUserId ? '这位用户' : '对方');
    const card = this.buildOpenerDraftCandidateCard({
      taskId: input.task.id,
      targetUserId: input.targetUserId,
      candidate: {
        ...input.candidate,
        targetUserId: input.targetUserId,
        candidateUserId: input.targetUserId,
        candidateRecordId: input.candidateRecordId,
        socialRequestId: input.socialRequestId,
      },
      displayName,
      draft: input.text,
      regeneratePayload: payload,
    });
    const result = this.cardActionRouteResult(
      input.task,
      '发送邀请前需要你确认。确认前不会触达对方。',
      [card],
      pendingApproval,
    );
    await this.writeEvent(
      input.task,
      AgentTaskEventType.ConfirmationRequested,
      'Agent card action created opener send approval',
      { action: 'opener.confirm_send', approvalId: approval.id },
      AgentTaskEventActor.Agent,
    );
    await this.recordAssistantMessage(
      input.task,
      result.assistantMessage,
      result,
    );
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

  private assertToolActionSucceeded(
    action: SocialAgentToolCallRecord,
    fallback: string,
  ): void {
    if (action.status === 'succeeded') return;

    const message = this.toolActionErrorMessage(action, fallback);
    const error = this.isRecord(action.error) ? action.error : {};
    const code = cleanDisplayText(error.code, '') || 'TOOL_EXECUTION_FAILED';
    const statusCode = this.number(error.statusCode);
    if (action.status === 'blocked' || statusCode === 403) {
      throw new ForbiddenException({
        success: false,
        code: code === 'tool_permission_blocked' ? 'TARGET_BLOCKED' : code,
        message,
      });
    }
    if (
      statusCode === 400 ||
      code === 'MISSING_TARGET_USER' ||
      code === 'TARGET_IS_SELF'
    ) {
      throw new BadRequestException({ success: false, code, message });
    }
    throw new InternalServerErrorException({
      success: false,
      code: 'TOOL_EXECUTION_FAILED',
      message,
    });
  }

  private toolActionErrorMessage(
    action: SocialAgentToolCallRecord,
    fallback: string,
  ): string {
    const error = this.isRecord(action.error) ? action.error : {};
    return cleanDisplayText(error.message, '') || fallback;
  }

  private rememberCandidateAction(
    task: AgentTask,
    candidateUserId: number,
    patch: Record<string, unknown>,
  ): void {
    (
      this.sessionAssembler ?? this.fallbackSessionAssembler
    ).rememberCandidateAction(task, candidateUserId, patch);
  }

  private async recordCandidateInterestEvent(input: {
    ownerUserId: number;
    task: AgentTask;
    action: string;
    targetUserId: number | null;
    candidate: Record<string, unknown>;
    candidateRecordId?: number | null;
    socialRequestId?: number | null;
    idempotencyKey?: string | null;
  }): Promise<void> {
    if (!this.interestEvents) return;
    const candidateRecordId =
      input.candidateRecordId ?? this.number(input.candidate.candidateRecordId);
    const socialRequestId =
      input.socialRequestId ?? this.number(input.candidate.socialRequestId);
    const dedupeKey =
      input.idempotencyKey ||
      [
        'candidate-interest',
        input.ownerUserId,
        input.task.id,
        input.action,
        input.targetUserId ?? 'no-target',
        candidateRecordId ?? socialRequestId ?? 'no-record',
      ].join(':');
    const eventInput = this.interestEvents.eventFromCandidateAction({
      action: input.action,
      ownerUserId: input.ownerUserId,
      agentTaskId: input.task.id,
      targetUserId: input.targetUserId,
      candidateRecordId,
      socialRequestId,
      candidate: input.candidate,
      dedupeKey,
    });
    if (!eventInput) return;
    await this.interestEvents.recordEvent(eventInput);
  }

  private async recordCandidateAuditEvent(input: {
    ownerUserId: number;
    task: AgentTask;
    eventType: SocialCandidateEventType;
    targetUserId?: number | null;
    candidate?: Record<string, unknown> | null;
    candidateRecordId?: number | null;
    socialRequestId?: number | null;
    matchingJobId?: number | null;
    publicIntentId?: string | null;
    idempotencyKey?: string | null;
    payload?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    if (!this.candidateAudit) return;
    const candidate = input.candidate ?? {};
    const candidateRecordId =
      input.candidateRecordId ?? this.number(candidate.candidateRecordId);
    const socialRequestId =
      input.socialRequestId ?? this.number(candidate.socialRequestId);
    const targetUserId =
      input.targetUserId ??
      this.number(
        candidate.targetUserId ?? candidate.candidateUserId ?? candidate.userId,
      );
    const taskResult = this.isRecord(input.task.result)
      ? input.task.result
      : {};
    const chatRun = this.isRecord(taskResult.chatRun) ? taskResult.chatRun : {};
    const matchingJobId =
      input.matchingJobId ??
      this.number(chatRun.matchingJobId ?? taskResult.matchingJobId);
    const publicIntentId =
      cleanDisplayText(
        input.publicIntentId ??
          candidate.publicIntentId ??
          chatRun.publicIntentId,
        '',
      ) || null;
    const snapshotId =
      this.number(candidate.candidateSnapshotId) ??
      this.number(chatRun.candidateSnapshotId);
    const dedupeKey =
      input.idempotencyKey ||
      [
        'candidate-event',
        input.ownerUserId,
        input.task.id,
        input.eventType,
        targetUserId ?? 'no-target',
        candidateRecordId ?? socialRequestId ?? snapshotId ?? 'no-record',
      ].join(':');
    try {
      await this.candidateAudit.recordEvent({
        ownerUserId: input.ownerUserId,
        taskId: input.task.id,
        snapshotId,
        socialRequestId,
        publicIntentId,
        matchingJobId,
        candidateUserId: targetUserId,
        candidateRecordId,
        eventType: input.eventType,
        idempotencyKey: dedupeKey,
        source: this.cardActionAuditSource(),
        payload: {
          candidate,
          ...(input.payload ?? {}),
        },
        metadata: input.metadata ?? {},
      });
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.candidate_action.audit_event_failed',
          taskId: input.task.id,
          eventType: input.eventType,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private isCandidateInviteApprovalAction(
    actionType: string | null | undefined,
  ): boolean {
    return (
      actionType === 'send_invite' || actionType === 'send_candidate_message'
    );
  }

  private cardActionAuditSource(): string {
    return 'agent_card_action';
  }

  private connectCheckpointPayload(input: {
    taskId: number;
    targetUserId: number;
    candidateRecordId: number | null;
    socialRequestId: number | null;
    body: Record<string, unknown>;
    toolCallId: string;
    approvalId?: number | null;
  }): Record<string, unknown> {
    const body = input.body;
    const idempotencyKey =
      cleanDisplayText(body.idempotencyKey, '') ||
      `candidate-connect:${input.taskId}:${input.targetUserId}`;
    const candidate = this.isRecord(body.candidate) ? body.candidate : {};
    return {
      source: 'candidate_opportunity_card',
      taskId: input.taskId,
      targetUserId: input.targetUserId,
      candidateUserId: input.targetUserId,
      candidateRecordId: input.candidateRecordId,
      socialRequestId: input.socialRequestId,
      candidate,
      approvalId: input.approvalId ?? null,
      toolCallId: input.toolCallId,
      actionType: 'connect_candidate',
      sideEffect: 'connect_candidate',
      schemaAction:
        cleanDisplayText(body.schemaAction, '') || 'candidate.connect',
      approvalRequired: true,
      checkpointRequired: true,
      checkpointAction: 'resume',
      resumeMode:
        cleanDisplayText(body.resumeMode, '') || 'resume_after_approval',
      resumeIdempotencyKey: idempotencyKey,
      sourceStepId: cleanDisplayText(body.sourceStepId, '') || null,
      idempotencyKey,
      opportunityId: cleanDisplayText(body.opportunityId, '') || null,
      safetyBoundary: cleanDisplayText(body.safetyBoundary, '') || null,
      suggestedOpener: cleanDisplayText(body.suggestedOpener, '') || null,
      riskLevel: cleanDisplayText(body.riskLevel, '') || 'high',
      riskReasons: this.stringList(body.riskReasons),
      auditEvent: 'social_agent.candidate.connect.approval_required',
    };
  }

  private pendingConnectToolCall(input: {
    taskId: number;
    targetUserId: number;
    candidateRecordId: number | null;
    socialRequestId: number | null;
    body: Record<string, unknown>;
  }): SocialAgentToolCallRecord {
    const now = new Date().toISOString();
    const idempotencyKey =
      cleanDisplayText(input.body.idempotencyKey, '') ||
      `candidate-connect:${input.taskId}:${input.targetUserId}`;
    return {
      id: `approval_connect_candidate:${input.taskId}:${input.targetUserId}`,
      stepId: `connect_candidate:${input.taskId}:${input.targetUserId}`,
      toolName: SocialAgentToolName.AddFriend,
      status: 'succeeded',
      input: {
        targetUserId: input.targetUserId,
        candidateRecordId: input.candidateRecordId,
        socialRequestId: input.socialRequestId,
        idempotencyKey,
      },
      output: {
        status: 'pending_approval',
        requiresApproval: true,
      },
      error: null,
      startedAt: now,
      completedAt: now,
      durationMs: 0,
    };
  }

  private rememberCandidateMessaged(task: AgentTask, candidateUserId: number) {
    const taskMemory = readSocialAgentTaskMemory(task);
    taskMemory.candidateState.messagedIds = this.mergeNumberList(
      taskMemory.candidateState.messagedIds,
      candidateUserId,
    );
    writeSocialAgentTaskMemory(task, taskMemory);
  }

  private rememberShortTermStep(
    task: AgentTask,
    id: string,
    label: string,
    status: string,
  ): void {
    const step = {
      id,
      label,
      status,
      updatedAt: new Date().toISOString(),
    };
    rememberSocialAgentShortTerm(task, {
      currentStep: step,
      steps: appendShortTermMemoryItem(task, 'steps', step, 40),
    });
  }

  private candidatePreferenceStepLabel(action: string): string {
    switch (action) {
      case 'candidate.view_detail':
        return '查看候选人详情';
      case 'candidate.like':
        return '收藏候选人';
      case 'candidate.skip':
        return '跳过候选人';
      case 'candidate.more_like_this':
        return '寻找更多类似候选人';
      default:
        return '记录候选人偏好';
    }
  }

  private auditEventTypeForCandidatePreference(
    action: string,
  ): SocialCandidateEventType {
    switch (action) {
      case 'candidate.view_detail':
        return 'candidate_viewed';
      case 'candidate.like':
        return 'candidate_saved';
      case 'candidate.skip':
        return 'candidate_skipped';
      case 'candidate.more_like_this':
        return 'more_like_this_requested';
      default:
        return 'candidate_viewed';
    }
  }

  private candidatePreferenceAssistantMessage(input: {
    action: string;
    candidate: Record<string, unknown>;
    targetUserId: number | null;
  }): string {
    const name =
      cleanDisplayText(
        input.candidate.displayName ?? input.candidate.nickname,
        '',
      ) || (input.targetUserId ? `用户 #${input.targetUserId}` : '这位候选人');
    const reasons = this.stringList(
      input.candidate.matchReasons ??
        input.candidate.reasons ??
        this.record(input.candidate.candidateExplanation).fitReasons,
    );
    const boundary =
      this.stringList(
        input.candidate.riskWarnings ??
          this.record(input.candidate.risk).warnings,
      )[0] || '第一次建议选择公共场所，先站内沟通，不交换敏感联系方式。';
    switch (input.action) {
      case 'candidate.view_detail':
        return [
          `${name} 的匹配点我整理好了。`,
          reasons.length
            ? `主要原因：${reasons.slice(0, 3).join('、')}。`
            : '目前更适合作为低压力候选，建议先轻量开场。',
          `安全边界：${boundary}`,
          '如果你愿意，我可以继续帮你生成一条开场白；确认前不会发送。',
        ].join(' ');
      case 'candidate.like':
        return `已收藏 ${name}。我会把这个偏好用于后续排序，但不会自动发送消息或建立连接。`;
      case 'candidate.skip':
        return `已跳过 ${name}。我会减少类似推荐，并继续优先找更符合你边界的人。`;
      case 'candidate.more_like_this':
        return `好的，我会沿着 ${name} 的匹配特点继续找更多类似机会。下一轮会优先保留相近兴趣、时间和安全边界。`;
      default:
        return '已记录你的偏好。';
    }
  }

  private mergeNumberList(values: number[], value: number): number[] {
    return [...values.filter((item) => item !== value), value].slice(-40);
  }

  private stringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => cleanDisplayText(item, '').trim())
      .filter(Boolean);
  }

  private record(value: unknown): Record<string, unknown> {
    return this.isRecord(value) ? value : {};
  }

  private looksLikeMessageSendConfirmation(message: string): boolean {
    if (
      /^(确认发送|确认发出|发送吧|可以发送|发吧|帮我发送|就发这条|确认)[。.!！\s]*$/i.test(
        message.trim(),
      )
    ) {
      return true;
    }
    return /^(确认发送|确认发出|发送吧|可以发送|发吧|帮我发送|就发这条|确认)$/i.test(
      message.trim(),
    );
  }

  private cardActionDraft(task: AgentTask): Record<string, unknown> {
    const result = this.isRecord(task.result) ? task.result : {};
    return this.isRecord(result.cardActionDraft) ? result.cardActionDraft : {};
  }

  private cardActionDraftCandidate(task: AgentTask): Record<string, unknown> {
    return readSocialAgentCardActionDraftCandidate(this.cardActionDraft(task));
  }

  private toPendingApprovalSnapshot(
    approval: AgentApprovalRequest,
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
          event: 'social_agent.candidate_action.task_event_write_failed',
          taskId: task.id,
          eventType,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private async rejectApprovalForOpener(
    task: AgentTask,
    ownerUserId: number,
    approvalId: number,
  ): Promise<void> {
    try {
      await this.approvals.reject(approvalId, ownerUserId);
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.candidate_action.opener_reject_approval_failed',
          taskId: task.id,
          approvalId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private async approveOpenerApprovalBeforeSend(
    task: AgentTask,
    ownerUserId: number,
    approvalId: number,
  ): Promise<void> {
    try {
      const result = await this.approvals.approve(approvalId, ownerUserId);
      if (
        result?.approval &&
        result.approval.status !== ApprovalStatus.Approved
      ) {
        throw new BadRequestException(
          `Approval already resolved (${result.approval.status})`,
        );
      }
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event:
            'social_agent.candidate_action.opener_approve_before_send_failed',
          taskId: task.id,
          approvalId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      throw error;
    }
  }

  private safeVarchar(value: unknown, max = 80): string {
    const text = cleanDisplayText(value, '');
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 1))}…`;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private number(value: unknown): number | null {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }
}
