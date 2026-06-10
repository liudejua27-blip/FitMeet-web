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
  buildSocialAgentOpenerApprovalCard,
  readSocialAgentCardActionCandidate,
} from './social-agent-card-action.presenter';
import { buildSocialAgentCandidateConnectResult } from './social-agent-candidate-connect-result.presenter';
import { buildSocialAgentDirectCandidateMessageResult } from './social-agent-direct-candidate-message-result.presenter';
import {
  buildSocialAgentCandidateActionApprovalInput,
  buildSocialAgentCandidateActionApprovalState,
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
} from './social-agent-memory.util';
import {
  SocialAgentToolCallRecord,
  SocialAgentToolExecutorService,
  SocialAgentToolName,
} from './social-agent-tool-executor.service';

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
  ) {}

  async createActionApproval(input: {
    ownerUserId: number;
    task: AgentTask;
    message: string;
    route: Pick<SocialAgentIntentRouteResult, 'intent' | 'entities'>;
  }): Promise<SocialAgentPendingApprovalSnapshot | null> {
    const { ownerUserId, task, message, route } = input;
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

  async confirmPendingCandidateMessageIfRequested(
    ownerUserId: number,
    task: AgentTask,
    message: string,
  ): Promise<{ task: AgentTask; assistantMessage: string } | null> {
    if (!this.looksLikeMessageSendConfirmation(message)) return null;
    const pendingMessageAction = readSocialAgentTaskMemory(task)
      .pendingActions.slice()
      .reverse()
      .find((action) => action.actionType === 'send_candidate_message');
    if (!pendingMessageAction) return null;

    const candidate =
      readSocialAgentStoredCandidateSummaries(task)[0] ??
      this.cardActionDraftCandidate(task);
    if (!candidate) return null;
    const targetUserId =
      this.number(candidate.candidateUserId) ?? this.number(candidate.userId);
    const text = this.candidateMessageDraft(task);
    if (!targetUserId || !text) return null;

    const candidateRecordId = this.number(candidate.candidateRecordId);
    const socialRequestId = this.number(candidate.socialRequestId);
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
        metadata: {
          confirmationSource: 'social_agent_chat',
          pendingApprovalId: pendingMessageAction.id,
          userConfirmationText: message,
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
    clearSocialAgentPendingAction(task, pendingMessageAction.id);
    transitionSocialAgentState(
      task,
      'message_action',
      confirmedMessage.transitionPatch,
    );
    await this.taskRepo.save(task);

    return {
      task,
      assistantMessage: confirmedMessage.assistantMessage,
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
        actionType: 'send_candidate_message',
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
    },
  ): Promise<Record<string, unknown>> {
    let task = await this.assertTaskOwner(taskId, ownerUserId);
    const targetUserId = await this.executor.resolveCandidateTargetUser(
      body as Record<string, unknown>,
      ownerUserId,
    );
    const candidateRecordId = this.number(body.candidateRecordId);
    const socialRequestId = this.number(body.socialRequestId);

    const friendAction = await this.executor.executeToolAction(
      taskId,
      SocialAgentToolName.AddFriend,
      {
        targetUserId,
        candidateRecordId,
        socialRequestId,
        openConversation: true,
        candidate: body.candidate ?? {},
        metadata: {
          confirmationSource: 'social_agent_chat',
        },
      },
      ownerUserId,
    );
    this.assertToolActionSucceeded(friendAction, '加好友失败，请稍后再试');

    const connectResult = buildSocialAgentCandidateConnectResult({
      taskId,
      targetUserId,
      friendAction,
    });
    const requiresApproval = connectResult.status === 'pending_approval';
    const approvalId = this.number(connectResult.approvalId);
    if (requiresApproval) {
      task = await this.assertTaskOwner(taskId, ownerUserId);
      this.rememberCandidateAction(task, targetUserId, {
        connect: 'pendingApproval',
        candidateRecordId,
        socialRequestId,
        toolCallId: friendAction.id,
      });
      if (approvalId) {
        recordSocialAgentPendingAction(task, {
          id: approvalId,
          type: ApprovalType.ContactRequest,
          actionType: 'connect_candidate',
          summary: `加好友/连接候选人 #${targetUserId}`,
          riskLevel: ApprovalRiskLevel.Medium,
          at: new Date().toISOString(),
        });
      }
      transitionSocialAgentState(task, 'confirmation_required', {
        objective: 'candidate_messaging',
        nextStep: '等待用户确认加好友/连接候选人',
        shouldSearchNow: false,
        awaitingSearchConfirmation: false,
        waitingFor: 'connect_confirmation',
        lastCompletedStep: 'connect_approval_created',
      });
      await this.taskRepo.save(task);
      return connectResult;
    }
    task = await this.assertTaskOwner(taskId, ownerUserId);
    const conversationId = connectResult.conversationId;
    const friendRequestId = connectResult.friendRequestId;

    await this.writeEvent(
      task,
      AgentTaskEventType.ConfirmationReceived,
      '用户确认加好友并进入聊天',
      {
        targetUserId,
        conversationId,
        friendActionId: friendAction.id,
      },
    );
    this.rememberShortTermStep(
      task,
      'connect_candidate',
      '用户确认加好友并进入聊天',
      'done',
    );
    rememberSocialAgentShortTerm(task, {
      conversationId,
      targetUserId,
      connectedCandidate: {
        targetUserId,
        candidateRecordId,
        socialRequestId,
      },
    });
    this.rememberCandidateAction(task, targetUserId, {
      connect: 'connected',
      conversationId,
      friendRequestId,
      candidateRecordId,
      socialRequestId,
      toolCallId: friendAction.id,
    });
    transitionSocialAgentState(task, 'message_action', {
      objective: 'candidate_messaging',
      nextStep: '进入候选人会话，等待继续沟通',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: 'candidate_conversation',
      lastCompletedStep: 'candidate_connected',
    });
    await this.taskRepo.save(task);
    void this.longTermMemory?.summarizeTask(task).catch(() => undefined);

    return connectResult;
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
