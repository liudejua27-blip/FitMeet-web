import {
  BadRequestException,
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
import { LifeGraphProposalDto } from '../life-graph/dto/life-graph.dto';
import { LifeGraphService } from '../life-graph/life-graph.service';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
} from './entities/agent-task.entity';
import type { SocialAgentCardActionBody } from './social-agent-action.types';
import { buildSocialAgentCardActionRouteResult } from './social-agent-card-action.presenter';
import { appendSocialAgentConversationTurn } from './social-agent-chat-memory.presenter';
import type { SocialAgentIntentRouteResult } from './social-agent-chat.types';
import {
  appendSocialAgentShortTermTurn,
  recordSocialAgentShortTermAction,
  transitionSocialAgentState,
} from './social-agent-memory.util';
import { SocialAgentLoopStateTransitionEventService } from './social-agent-loop-state-transition-event.service';

@Injectable()
export class SocialAgentLifeGraphCardActionService {
  private readonly logger = new Logger(
    SocialAgentLifeGraphCardActionService.name,
  );

  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
    @Optional()
    private readonly lifeGraph?: LifeGraphService,
    @Optional()
    private readonly loopStateEvents?: SocialAgentLoopStateTransitionEventService,
  ) {}

  async performUpdateAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    if (!this.isLifeGraphAction(body.action)) {
      throw new BadRequestException('Unsupported profile update action');
    }

    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const payload = body.payload ?? {};
    const proposalId = this.readProposalId(payload);
    if (!proposalId && this.isMeetLoopLifeGraphInfluence(task, payload)) {
      return this.performMeetLoopLifeGraphInfluenceDecision(
        task,
        body.action,
        payload,
      );
    }
    if (!this.lifeGraph) {
      throw new BadRequestException('Profile update service is not available');
    }
    if (!proposalId) {
      throw new BadRequestException('Missing profile proposalId');
    }

    const fieldIds = this.readFieldIds(payload);
    const allowConflicts = this.bool(payload.allowConflicts);
    const proposal =
      body.action === 'life_graph.accept_update'
        ? await this.lifeGraph.confirmUpdate(ownerUserId, {
            proposalId,
            ...(fieldIds.length ? { fieldIds } : {}),
            ...(allowConflicts ? { allowConflicts: true } : {}),
          })
        : await this.lifeGraph.rejectUpdate(ownerUserId, {
            proposalId,
            ...(fieldIds.length ? { fieldIds } : {}),
            reason:
              cleanDisplayText(payload.reason, '') ||
              '用户从 Agent 卡片拒绝画像更新建议',
          });

    const accepted = body.action === 'life_graph.accept_update';
    transitionSocialAgentState(
      task,
      accepted ? 'life_graph_updated' : 'profile_detected',
      {
        objective: 'profile_enrichment',
        nextStep: accepted
          ? '继续补齐可约时间、边界要求，或确认现在开始搜索'
          : '继续补充个人信息，或重新告诉我哪些内容可以保存',
        shouldSearchNow: false,
        profileSaved: accepted,
        awaitingSearchConfirmation: accepted,
        waitingFor: accepted
          ? 'availability_boundaries_or_search_confirmation'
          : 'profile_save_or_more_profile_facts',
        lastCompletedStep: accepted
          ? 'life_graph_profile_confirmed'
          : 'life_graph_profile_rejected',
      },
    );
    task.result = {
      ...(task.result ?? {}),
      lifeGraphDecision: {
        proposalId: proposal.proposalId,
        status: proposal.status,
        accepted,
        decidedAt: new Date().toISOString(),
        source: 'user_confirmed_agent_card',
        selectedFieldIds: fieldIds,
        allowConflicts,
        fieldSnapshots: this.lifeGraphFieldSnapshots(proposal),
      },
    };
    await this.taskRepo.save(task);
    await this.loopStateEvents?.writeCurrentTaskTransition({
      task,
      publicLoopStage: accepted
        ? 'contact_confirmation_required'
        : 'profile_completion',
      workflowState: accepted ? 'PROFILE_SAVED' : 'PROFILE_COMPLETION',
    });

    const assistantMessage = this.decisionReply(proposal, accepted);
    const result = buildSocialAgentCardActionRouteResult({
      task,
      assistantMessage,
      cards: [],
      emptyIntentEntities: {
        city: '',
        activityType: '',
        targetGender: '',
        timePreference: '',
        locationPreference: '',
      },
    });
    result.profileUpdated = accepted;
    await this.recordAssistantMessage(task, assistantMessage, result);
    await this.writeEvent(
      task,
      AgentTaskEventType.ConfirmationReceived,
      accepted
        ? 'User accepted profile proposal'
        : 'User rejected profile proposal',
      {
        action: body.action,
        proposalId: proposal.proposalId,
        proposalStatus: proposal.status,
        selectedFieldIds: fieldIds,
        allowConflicts,
        confirmationSource: 'agent_card_action',
        fieldSnapshots: this.lifeGraphFieldSnapshots(proposal),
      },
      AgentTaskEventActor.User,
    );
    return result;
  }

  private async performMeetLoopLifeGraphInfluenceDecision(
    task: AgentTask,
    action: 'life_graph.accept_update' | 'life_graph.reject_update',
    payload: Record<string, unknown>,
  ): Promise<SocialAgentIntentRouteResult> {
    const accepted = action === 'life_graph.accept_update';
    const activityId = this.number(payload.activityId);
    const candidateUserId = this.number(
      payload.candidateUserId ?? payload.targetUserId,
    );
    const decidedAt = new Date().toISOString();

    task.result = {
      ...(task.result ?? {}),
      meetLoop: {
        ...this.readRecord(task.result?.['meetLoop']),
        lifeGraphInfluenceDecision: {
          accepted,
          activityId,
          candidateUserId,
          decidedAt,
          source: this.lifeGraphInfluenceSource(payload),
          conversationId: cleanDisplayText(payload.conversationId, '') || null,
          messageId: cleanDisplayText(payload.messageId, '') || null,
        },
      },
      lifeGraphDecision: {
        proposalId: null,
        status: accepted
          ? 'accepted_task_influence'
          : 'rejected_task_influence',
        accepted,
        activityId,
        candidateUserId,
        source: this.lifeGraphInfluenceSource(payload),
        conversationId: cleanDisplayText(payload.conversationId, '') || null,
        messageId: cleanDisplayText(payload.messageId, '') || null,
        decidedAt,
      },
    };
    transitionSocialAgentState(
      task,
      accepted ? 'life_graph_updated' : 'activity_completed',
      {
        objective: 'meet_loop',
        nextStep: accepted
          ? '本次约练影响已保留，后续推荐会参考它'
          : '本次约练影响已撤回，后续推荐不会继续参考它',
        shouldSearchNow: false,
        profileSaved: accepted,
        awaitingSearchConfirmation: false,
        waitingFor: '',
        lastCompletedStep: accepted
          ? 'meet_loop_life_graph_influence_kept'
          : 'meet_loop_life_graph_influence_revoked',
      },
    );
    await this.taskRepo.save(task);
    await this.loopStateEvents?.writeCurrentTaskTransition({
      task,
      publicLoopStage: accepted ? 'messages_handoff' : 'discover_visible',
      workflowState: accepted ? 'LIFE_GRAPH_UPDATED' : 'REVIEW_REQUESTED',
    });

    const assistantMessage = accepted
      ? this.lifeGraphInfluenceAcceptedReply(payload)
      : this.lifeGraphInfluenceRejectedReply(payload);
    const result = buildSocialAgentCardActionRouteResult({
      task,
      assistantMessage,
      cards: [],
      emptyIntentEntities: {
        city: '',
        activityType: '',
        targetGender: '',
        timePreference: '',
        locationPreference: '',
      },
    });
    result.profileUpdated = accepted;
    await this.recordAssistantMessage(task, assistantMessage, result);
    await this.writeEvent(
      task,
      AgentTaskEventType.ConfirmationReceived,
      accepted
        ? 'User kept meet loop profile influence'
        : 'User revoked meet loop profile influence',
      {
        action,
        activityId,
        candidateUserId,
        source: this.lifeGraphInfluenceSource(payload),
        conversationId: cleanDisplayText(payload.conversationId, '') || null,
        messageId: cleanDisplayText(payload.messageId, '') || null,
      },
      AgentTaskEventActor.User,
    );
    return result;
  }

  private lifeGraphInfluenceSource(payload: Record<string, unknown>): string {
    const source = cleanDisplayText(payload.source, '');
    return source || 'meet_loop_review';
  }

  private lifeGraphInfluenceAcceptedReply(
    payload: Record<string, unknown>,
  ): string {
    if (this.lifeGraphInfluenceSource(payload) === 'counterpart_reply') {
      return '已保留这次回复的脱敏互动信号，后续推荐会参考它。你之后仍然可以在个人信息里查看、纠正或撤回。';
    }
    return '已保留这次约练对后续推荐的影响。你之后仍然可以在个人信息里查看、纠正或撤回。';
  }

  private lifeGraphInfluenceRejectedReply(
    payload: Record<string, unknown>,
  ): string {
    if (this.lifeGraphInfluenceSource(payload) === 'counterpart_reply') {
      return '好的，这次回复不会作为长期偏好信号。我会保留会话上下文，但后续推荐不会继续参考这条互动信号。';
    }
    return '好的，这次约练评价不会继续用于后续推荐。我已经保留聊天记录本身，但不会把它作为画像偏好信号。';
  }

  private decisionReply(
    proposal: LifeGraphProposalDto,
    accepted: boolean,
  ): string {
    if (!accepted) {
      return '好的，这次个人信息更新建议我不会保存。你可以继续补充资料、时间或安全边界；如果想现在开始找人，也直接告诉我。';
    }
    const count = proposal.proposedFields.filter(
      (field) => field.status === 'confirmed',
    ).length;
    const countText = count > 0 ? `${count} 条` : '这些';
    return `已保存 ${countText} 个人信息。接下来你可以继续补充可约时间和边界，或告诉我“现在开始找搭子”。`;
  }

  private lifeGraphFieldSnapshots(proposal: LifeGraphProposalDto) {
    return proposal.proposedFields.map((field) => ({
      proposalFieldId: cleanDisplayText(field.proposalFieldId, '') || null,
      category: cleanDisplayText(field.category, '') || null,
      fieldKey: cleanDisplayText(field.fieldKey, '') || null,
      fieldValue: sanitizeForDisplay(field.fieldValue),
      oldValue: sanitizeForDisplay(field.oldValue),
      source: cleanDisplayText(field.source, '') || null,
      confidence:
        typeof field.confidence === 'number' &&
        Number.isFinite(field.confidence)
          ? field.confidence
          : null,
      status: cleanDisplayText(field.status, '') || null,
      conflict: field.conflict === true,
      requiresUserConfirmation: field.requiresUserConfirmation !== false,
      reason: cleanDisplayText(field.reason, '') || null,
    }));
  }

  private readProposalId(payload: Record<string, unknown>): number | null {
    const cardData = this.readRecord(payload.cardData);
    return (
      this.number(payload.proposalId) ??
      this.number(cardData?.proposalId) ??
      this.number(cardData?.id) ??
      this.number(this.readRecord(cardData?.proposal)?.proposalId)
    );
  }

  private readFieldIds(payload: Record<string, unknown>): string[] {
    const raw = payload.fieldIds ?? payload.selectedFieldIds;
    return Array.isArray(raw)
      ? raw
          .map((item) => cleanDisplayText(item, ''))
          .filter((item) => item.length > 0)
      : [];
  }

  private isMeetLoopLifeGraphInfluence(
    task: AgentTask,
    payload: Record<string, unknown>,
  ): boolean {
    const meetLoop = this.readRecord(task.result?.['meetLoop']);
    const payloadStage = cleanDisplayText(payload.loopStage, '');
    const resultStage = cleanDisplayText(meetLoop?.loopStage, '');
    return (
      payloadStage === 'trust_score_updated' ||
      resultStage === 'trust_score_updated' ||
      cleanDisplayText(payload.source, '') === 'counterpart_reply' ||
      payload.canRevoke === true ||
      payload.canCorrect === true
    );
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
      status: 'completed',
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
        runId: null,
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
          summary,
          payload: sanitizeForDisplay(payload) as Record<string, unknown>,
        }),
      );
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.life_graph_card_action.task_event_write_failed',
          taskId: task.id,
          eventType,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
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

  private isLifeGraphAction(
    action: unknown,
  ): action is 'life_graph.accept_update' | 'life_graph.reject_update' {
    return (
      action === 'life_graph.accept_update' ||
      action === 'life_graph.reject_update'
    );
  }

  private readRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private number(value: unknown): number | null {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }

  private bool(value: unknown): boolean {
    return value === true || value === 'true';
  }
}
