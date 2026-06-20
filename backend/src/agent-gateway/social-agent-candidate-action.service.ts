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
  buildSocialAgentOpenerApprovalCard,
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
      const approval = await this.approvals.create(
        buildSocialAgentCandidateActionApprovalInput({
          ownerUserId,
          taskId: task.id,
          message,
          route,
          candidate: firstCandidate,
          targetUserId,
          relatedCandidateId:
            this.number(firstCandidate?.candidateRecordId) ?? null,
          runtimeContext: runtimeContext ?? null,
        }),
      );
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

    const approval = await this.approvals.create(
      buildSocialAgentOpenerDraftApprovalInput({
        ownerUserId,
        taskId: task.id,
        action: schemaAction,
        targetUserId,
        candidate,
        draft,
        relatedCandidateId: this.number(candidate.candidateRecordId) ?? null,
        idempotencyKey:
          (body.idempotencyKey ??
            cleanDisplayText(payload.idempotencyKey, '')) ||
          `opener-send:${task.id}:${targetUserId ?? 'candidate'}`,
        safetyBoundary: cleanDisplayText(payload.safetyBoundary, ''),
      }),
    );
    const pendingApproval = this.toPendingApprovalSnapshot(approval);
    const openerDraft = buildSocialAgentOpenerDraftState({
      action: schemaAction,
      targetUserId,
      candidate,
      draft,
      approvalId: approval.id,
      pendingApproval,
      at: new Date().toISOString(),
    });
    recordSocialAgentPendingAction(task, openerDraft.pendingAction);
    task.result = {
      ...(task.result ?? {}),
      cardActionDraft: openerDraft.cardActionDraft,
    };
    transitionSocialAgentState(
      task,
      'confirmation_required',
      openerDraft.transitionPatch,
    );
    await this.taskRepo.save(task);

    const card = buildSocialAgentOpenerApprovalCard({
      taskId: task.id,
      targetUserId,
      approvalId: approval.id,
      candidate,
      displayName: openerDraft.displayName,
      draft,
      regeneratePayload: payload,
    });

    const result = this.cardActionRouteResult(
      task,
      openerDraft.assistantMessage,
      [card],
      pendingApproval,
    );
    await this.writeEvent(
      task,
      AgentTaskEventType.ConfirmationRequested,
      'Agent card action created opener approval',
      { action: schemaAction, approvalId: approval.id },
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
        if (!this.isCandidateInviteApprovalAction(action.actionType)) return false;
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
      throw new BadRequestException('没有找到可恢复的发送确认动作');
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
    await this.persistInviteSentState({
      task,
      targetUserId,
      candidateRecordId,
      socialRequestId,
      conversationId: confirmedMessage.conversationId,
      friendRequestId: null,
      status: 'message_sent',
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
        if (!this.isCandidateInviteApprovalAction(action.actionType)) return false;
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
        if (!this.isCandidateInviteApprovalAction(action.actionType)) return false;
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

    const approval = await this.approvals.create(
      buildSocialAgentOpenerDraftApprovalInput({
        ownerUserId,
        taskId: task.id,
        action: 'opener.regenerate',
        targetUserId,
        candidate,
        draft: regeneratedDraft,
        relatedCandidateId: this.number(candidate.candidateRecordId) ?? null,
        idempotencyKey:
          (body.idempotencyKey ??
            cleanDisplayText(payload.idempotencyKey, '')) ||
          `opener-send:${task.id}:${targetUserId ?? 'candidate'}:regen`,
        safetyBoundary: cleanDisplayText(payload.safetyBoundary, ''),
      }),
    );
    const pendingApproval = this.toPendingApprovalSnapshot(approval);
    const openerDraft = buildSocialAgentOpenerDraftState({
      action: 'opener.regenerate',
      targetUserId,
      candidate,
      draft: regeneratedDraft,
      approvalId: approval.id,
      pendingApproval,
      at: new Date().toISOString(),
    });
    recordSocialAgentPendingAction(task, openerDraft.pendingAction);
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
      'confirmation_required',
      openerDraft.transitionPatch,
    );
    await this.taskRepo.save(task);

    const card = buildSocialAgentOpenerApprovalCard({
      taskId: task.id,
      targetUserId,
      approvalId: approval.id,
      candidate,
      displayName: openerDraft.displayName,
      draft: regeneratedDraft,
      regeneratePayload: {
        ...payload,
        taskId: task.id,
        targetUserId,
        candidate,
        approvalId: approval.id,
        message: regeneratedDraft,
        previousMessage: previousMessage || null,
      },
    });
    const assistantMessage =
      '我重新写了一版更轻、更安全的开场白。你确认前，我仍然不会替你发送。';
    const result = this.cardActionRouteResult(
      task,
      assistantMessage,
      [card],
      pendingApproval,
    );
    await this.writeEvent(
      task,
      AgentTaskEventType.ConfirmationRequested,
      'Agent card action regenerated opener approval',
      {
        action: body.action,
        previousApprovalId:
          pendingMessageAction?.id ?? requestedApprovalId ?? null,
        approvalId: approval.id,
        targetUserId,
      },
      AgentTaskEventActor.Agent,
    );
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
            summary: targetUserId
              ? `发送邀请给候选人 #${targetUserId}`
              : '发送邀请给候选人',
            riskLevel: ApprovalRiskLevel.Medium,
            payload: body.payload ?? {},
            expiresAt: null,
          } satisfies SocialAgentPendingApprovalSnapshot)
        : null;
    const assistantMessage = isPending
      ? '发送邀请前还需要你确认。我已经把这一步放进确认卡片；你确认前不会联系对方。'
      : '已按你的确认发送邀请，并打开后续沟通入口。接下来可以等待对方回复，或继续让我帮你准备更自然的沟通节奏。';
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
    const timelineCard = buildSocialAgentMeetLoopTimelineCard({
      taskId,
      candidateUserId: targetUserId,
      stage: isPending ? 'activity_draft_created' : 'waiting_reply',
      nextAction: isPending
        ? '确认后再发送邀请并建立站内连接，不会自动联系对方。'
        : '等待对方回复；如果时间不合适，可以继续改期或调整邀约。',
      description: isPending
        ? '这一步涉及真实邀请，仍需要你确认。'
        : '邀请发送后，我会把后续回复、改期、确认见面和评价串成连续流程。',
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
      [timelineCard],
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
      .find((action) => this.isCandidateInviteApprovalAction(action.actionType));

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
        summary: `发送消息给候选人 #${targetUserId}`,
        riskLevel: ApprovalRiskLevel.Medium,
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
      summary: `发送邀请给候选人 #${targetUserId}`,
      riskLevel: ApprovalRiskLevel.Medium,
      reason:
        'FitMeet Agent 已准备发送候选人邀请，等待用户确认后再建立站内连接。',
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
      summary: `发送邀请给候选人 #${targetUserId}`,
      riskLevel: ApprovalRiskLevel.Medium,
      at: new Date().toISOString(),
      payload: {
        ...checkpointPayload,
        approvalId: approval.id,
      },
    });
    transitionSocialAgentState(task, 'confirmation_required', {
      objective: 'candidate_messaging',
      nextStep: '等待用户确认发送邀请',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: 'connect_confirmation',
      lastCompletedStep: 'connect_approval_created',
    });
    await this.taskRepo.save(task);

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

  private isCandidateInviteApprovalAction(actionType: string | null | undefined): boolean {
    return actionType === 'send_invite' || actionType === 'send_candidate_message';
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
      actionType: 'send_invite',
      sideEffect: 'send_message_or_connect',
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
      riskLevel: cleanDisplayText(body.riskLevel, '') || 'medium',
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
