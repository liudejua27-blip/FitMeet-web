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
import { FitMeetAgentSchemaAction } from './fitmeet-alpha-agent.types';
import type { SocialAgentCardActionBody } from './social-agent-action.types';
import { buildSocialAgentCardActionRouteResult } from './social-agent-card-action.presenter';
import { appendSocialAgentConversationTurn } from './social-agent-chat-memory.presenter';
import type { SocialAgentIntentRouteResult } from './social-agent-chat.types';
import {
  appendSocialAgentShortTermTurn,
  recordSocialAgentShortTermAction,
  transitionSocialAgentState,
} from './social-agent-memory.util';

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
  ) {}

  async performUpdateAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    if (!this.lifeGraph) {
      throw new BadRequestException('Life Graph service is not available');
    }
    if (!this.isLifeGraphAction(body.action)) {
      throw new BadRequestException('Unsupported Life Graph action');
    }

    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const payload = body.payload ?? {};
    const proposalId = this.readProposalId(payload);
    if (!proposalId) {
      throw new BadRequestException('Missing Life Graph proposalId');
    }

    const fieldIds = this.readFieldIds(payload);
    const proposal =
      body.action === 'life_graph.accept_update'
        ? await this.lifeGraph.confirmUpdate(ownerUserId, {
            proposalId,
            ...(fieldIds.length ? { fieldIds } : {}),
          })
        : await this.lifeGraph.rejectUpdate(ownerUserId, {
            proposalId,
            ...(fieldIds.length ? { fieldIds } : {}),
            reason:
              cleanDisplayText(payload.reason, '') ||
              '用户从 Agent 卡片拒绝 Life Graph 提案',
          });

    const accepted = body.action === 'life_graph.accept_update';
    transitionSocialAgentState(
      task,
      accepted ? 'life_graph_updated' : 'profile_detected',
      {
        objective: 'profile_enrichment',
        nextStep: accepted
          ? '继续补齐可约时间、边界要求，或确认现在开始搜索'
          : '继续补充画像信息，或重新告诉我哪些内容可以保存',
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
      },
    };
    await this.taskRepo.save(task);

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
        ? 'User accepted Life Graph proposal'
        : 'User rejected Life Graph proposal',
      {
        action: body.action,
        proposalId: proposal.proposalId,
        proposalStatus: proposal.status,
        selectedFieldIds: fieldIds,
      },
      AgentTaskEventActor.User,
    );
    return result;
  }

  private decisionReply(
    proposal: LifeGraphProposalDto,
    accepted: boolean,
  ): string {
    if (!accepted) {
      return '好的，这次 Life Graph 提案我不会保存。你可以继续补充画像、时间或安全边界；如果想现在开始找人，也直接告诉我。';
    }
    const count = proposal.proposedFields.filter(
      (field) => field.status === 'confirmed',
    ).length;
    const countText = count > 0 ? `${count} 条` : '这些';
    return `已保存 ${countText} Life Graph 信息。接下来你可以继续补充可约时间和边界，或告诉我“现在开始找搭子”。`;
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
    action: FitMeetAgentSchemaAction | null | undefined,
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
}
