import {
  Injectable,
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
import { appendSocialAgentConversationTurn } from './social-agent-chat-memory.presenter';
import { readSocialAgentStoredCandidateSummaries } from './social-agent-chat-session.presenter';
import type {
  SocialAgentCardActionBody,
  SocialAgentIntentRouteResult,
  SocialAgentPendingApprovalSnapshot,
} from './social-agent-chat.types';
import {
  appendSocialAgentShortTermTurn,
  readSocialAgentTaskMemory,
  recordSocialAgentPendingAction,
  recordSocialAgentShortTermAction,
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
  ) {}

  async createActionApproval(input: {
    ownerUserId: number;
    task: AgentTask;
    message: string;
    route: Pick<SocialAgentIntentRouteResult, 'intent' | 'entities'>;
  }): Promise<SocialAgentPendingApprovalSnapshot | null> {
    const { ownerUserId, task, message, route } = input;
    try {
      const inferred = this.inferApprovalTypeFromMessage(message);
      const candidates = readSocialAgentStoredCandidateSummaries(task);
      const firstCandidate = candidates[0] as
        | Record<string, unknown>
        | undefined;
      const targetUserId =
        this.number(firstCandidate?.candidateUserId) ??
        this.number(firstCandidate?.userId);
      const payload: Record<string, unknown> = {
        source: 'social_agent_chat',
        userMessage: message,
        intent: route.intent,
        entities: route.entities,
        candidateUserId: targetUserId,
        agentTaskId: task.id,
      };
      const approval = await this.approvals.create({
        userId: ownerUserId,
        agentConnectionId: null,
        agentTaskId: task.id,
        type: inferred.type,
        actionType: inferred.actionType,
        skillName: inferred.actionType,
        payload,
        summary: inferred.summary(message, firstCandidate),
        riskLevel: inferred.riskLevel,
        reason: '由 Social Agent 聊天意图路由生成，待用户在前端确认。',
        createdBy: 'agent',
        relatedCandidateId:
          this.number(firstCandidate?.candidateRecordId) ?? null,
      });
      transitionSocialAgentState(task, 'confirmation_required', {
        objective: 'candidate_action',
        nextStep: '等待用户确认候选人动作',
        shouldSearchNow: false,
        awaitingSearchConfirmation: false,
        waitingFor: 'action_confirmation',
        lastCompletedStep: 'approval_created',
      });
      return this.toPendingApprovalSnapshot(approval);
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

    const approval = await this.approvals.create({
      userId: ownerUserId,
      agentConnectionId: null,
      agentTaskId: task.id,
      type: ApprovalType.SendMessage,
      actionType: 'send_candidate_message',
      skillName: 'send_candidate_message',
      payload: {
        source: 'agent_card_action',
        schemaAction: body.action,
        agentTaskId: task.id,
        candidateUserId: targetUserId,
        targetUserId,
        candidate,
        message: draft,
        suggestedOpener: draft,
      },
      summary: targetUserId
        ? `发送开场白给候选人 #${targetUserId}`
        : '发送开场白给候选人',
      riskLevel: ApprovalRiskLevel.Medium,
      reason: 'FitMeet Agent 已生成开场白草稿，等待用户确认后再发送。',
      createdBy: 'agent',
      relatedCandidateId: this.number(candidate.candidateRecordId) ?? null,
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
      cardActionDraft: {
        action: body.action,
        targetUserId,
        candidate,
        message: draft,
        approvalId: approval.id,
      },
    };
    transitionSocialAgentState(task, 'confirmation_required', {
      objective: 'candidate_messaging',
      nextStep: '等待你确认是否发送开场白',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: 'message_confirmation',
      lastCompletedStep: 'opener_draft_created',
    });
    await this.taskRepo.save(task);

    const displayName =
      cleanDisplayText(candidate.displayName ?? candidate.nickname, '') ||
      '对方';
    const card = buildSocialAgentOpenerApprovalCard({
      taskId: task.id,
      targetUserId,
      approvalId: approval.id,
      candidate,
      displayName,
      draft,
      regeneratePayload: payload,
    });

    const assistantMessage =
      '我先帮你写了一条低压力的开场白。你确认前，我不会替你发送。';
    const result = this.cardActionRouteResult(
      task,
      assistantMessage,
      [card],
      pendingApproval,
    );
    await this.writeEvent(
      task,
      AgentTaskEventType.ConfirmationRequested,
      'Agent card action created opener approval',
      { action: body.action, approvalId: approval.id },
      AgentTaskEventActor.Agent,
    );
    await this.recordAssistantMessage(task, assistantMessage, result);
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

    const output = this.isRecord(action.output) ? action.output : {};
    const messageId =
      cleanDisplayText(output.id ?? output.messageId, '') || null;
    const conversationId = cleanDisplayText(output.conversationId, '') || null;
    this.rememberCandidateAction(task, targetUserId, {
      send: 'sent',
      conversationId,
      messageId,
      candidateRecordId,
      socialRequestId,
      toolCallId: action.id,
    });
    transitionSocialAgentState(task, 'message_action', {
      objective: 'candidate_messaging',
      nextStep: '等待候选人回复',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: 'candidate_reply',
      lastCompletedStep: 'message_sent',
    });
    await this.taskRepo.save(task);

    const name = cleanDisplayText(candidate.nickname, `用户 #${targetUserId}`);
    return {
      task,
      assistantMessage: `已确认发送给${name}：${text}`,
    };
  }

  candidateMessageDraft(task: AgentTask): string {
    const draft = this.cardActionDraft(task);
    const draftMessage = cleanDisplayText(
      draft.message ?? draft.suggestedOpener,
      '',
    ).trim();
    if (draftMessage) return draftMessage;
    const candidate = readSocialAgentStoredCandidateSummaries(task)[0];
    const suggested = cleanDisplayText(candidate?.suggestedMessage, '').trim();
    if (suggested) return suggested;
    return '你好，看到你也在附近，想先站内聊聊看看是否方便一起约练。';
  }

  private inferApprovalTypeFromMessage(message: string): {
    type: ApprovalType;
    actionType: string;
    riskLevel: ApprovalRiskLevel;
    summary: (msg: string, candidate?: Record<string, unknown>) => string;
  } {
    if (/(加好友|关注|加微信|加联系方式)/.test(message)) {
      return {
        type: ApprovalType.ContactRequest,
        actionType: 'connect_candidate',
        riskLevel: ApprovalRiskLevel.Medium,
        summary: (_msg, candidate) =>
          `用户请求添加${candidate ? `候选人 #${cleanDisplayText(candidate.userId, '')}` : '候选人'}为好友/关注`,
      };
    }
    if (/(发消息|打招呼|私信|联系)/.test(message)) {
      return {
        type: ApprovalType.SendMessage,
        actionType: 'send_candidate_message',
        riskLevel: ApprovalRiskLevel.Medium,
        summary: (_msg, candidate) =>
          `用户请求向${candidate ? `候选人 #${cleanDisplayText(candidate.userId, '')}` : '候选人'}发送消息`,
      };
    }
    if (/(邀请|约|约练|约局)/.test(message)) {
      return {
        type: ApprovalType.JoinActivity,
        actionType: 'invite_candidate',
        riskLevel: ApprovalRiskLevel.Medium,
        summary: (_msg, candidate) =>
          `用户请求邀请${candidate ? `候选人 #${cleanDisplayText(candidate.userId, '')}` : '候选人'}参加活动`,
      };
    }
    return {
      type: ApprovalType.Custom,
      actionType: 'social_agent_action',
      riskLevel: ApprovalRiskLevel.Low,
      summary: (msg) => `用户请求执行动作：${msg.slice(0, 80)}`,
    };
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
    fallbackMessage: string,
  ): void {
    if (action.status === 'succeeded') return;
    const error = action.error?.message ?? fallbackMessage;
    throw new NotFoundException(error);
  }

  private rememberCandidateAction(
    task: AgentTask,
    candidateUserId: number,
    patch: Record<string, unknown>,
  ): void {
    const result = this.isRecord(task.result) ? task.result : {};
    const candidateActions = this.isRecord(result.candidateActions)
      ? { ...result.candidateActions }
      : {};
    const key = String(candidateUserId);
    candidateActions[key] = {
      ...(this.isRecord(candidateActions[key]) ? candidateActions[key] : {}),
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    task.result = { ...result, candidateActions };
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
    const draft = this.cardActionDraft(task);
    return this.isRecord(draft.candidate) ? draft.candidate : {};
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
