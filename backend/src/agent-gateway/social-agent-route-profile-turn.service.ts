import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import { LifeGraphProposalDto } from '../life-graph/dto/life-graph.dto';
import { LifeGraphService } from '../life-graph/life-graph.service';
import { SocialProfileService } from '../users/social-profile.service';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { profileKeyForSocialAgentIntent } from './social-agent-intent-memory.presenter';
import type {
  SocialAgentIntentRouterResult,
  SocialAgentIntentType,
} from './social-agent-intent-router.service';
import { appendSocialAgentConversationTurn } from './social-agent-chat-memory.presenter';
import {
  rememberSocialAgentCurrentTask,
  rememberSocialAgentShortTerm,
} from './social-agent-memory.util';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import { SocialAgentProfileEnrichmentService } from './social-agent-profile-enrichment.service';

type HandleRouteProfileTurnInput = {
  ownerUserId: number;
  task: AgentTask;
  message: string;
  route: SocialAgentIntentRouterResult;
};

type HandleRouteProfileTurnResult = {
  handled: boolean;
  task: AgentTask;
  assistantMessage?: string;
  savedContext: boolean;
  profileUpdated: boolean;
  profileUpdateProposal: LifeGraphProposalDto | null;
};

@Injectable()
export class SocialAgentRouteProfileTurnService {
  private readonly logger = new Logger(SocialAgentRouteProfileTurnService.name);

  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
    private readonly socialProfiles: SocialProfileService,
    private readonly metrics: SocialAgentMetricsService,
    private readonly profileEnrichment: SocialAgentProfileEnrichmentService,
    @Optional()
    private readonly lifeGraph?: LifeGraphService,
  ) {}

  async handle(
    input: HandleRouteProfileTurnInput,
  ): Promise<HandleRouteProfileTurnResult> {
    const { ownerUserId, message, route } = input;
    const { task } = input;
    if (
      route.intent !== 'profile_update' &&
      route.intent !== 'safety_or_boundary'
    ) {
      return {
        handled: false,
        task,
        savedContext: false,
        profileUpdated: false,
        profileUpdateProposal: null,
      };
    }

    let savedContext = false;
    let profileUpdated = false;
    let profileUpdateProposal: LifeGraphProposalDto | null = null;
    let assistantMessage: string | undefined;

    if (this.lifeGraph) {
      const proposal = await this.lifeGraph.extractFromChat(ownerUserId, {
        message,
        taskId: task.id,
        context: { intent: route.intent },
      });
      if (proposal.proposedFields.length > 0) {
        profileUpdateProposal = proposal;
        assistantMessage =
          this.profileEnrichment.lifeGraphProposalReply(proposal);
        savedContext = true;
        rememberSocialAgentCurrentTask(task, {
          objective: 'profile_enrichment',
          nextStep: '等待用户确认是否保存 Life Graph 画像提案',
          shouldSearchNow: false,
          profileSaved: false,
          waitingFor: 'life_graph_profile_confirmation',
          lastCompletedStep: 'life_graph_profile_proposed',
        });
        await this.taskRepo.save(task);
      }
    }

    if (!profileUpdateProposal) {
      await this.rememberRoutedMessage(task, message, route.intent);
      savedContext = true;
      profileUpdated = await this.saveIntentToProfile(
        ownerUserId,
        route.intent,
        message,
      );
    }

    return {
      handled: true,
      task,
      assistantMessage,
      savedContext,
      profileUpdated,
      profileUpdateProposal,
    };
  }

  private async rememberRoutedMessage(
    task: AgentTask,
    message: string,
    intent: SocialAgentIntentType,
  ): Promise<void> {
    const now = new Date().toISOString();
    appendSocialAgentConversationTurn(task, {
      role: 'user',
      text: message,
      intent,
      at: now,
    });
    task.result = {
      ...(task.result ?? {}),
      latestIntent: {
        intent,
        message,
        at: now,
      },
    };
    task.status = AgentTaskStatus.AwaitingFeedback;
    task.statusReason = `intent_${intent}_saved`;
    rememberSocialAgentShortTerm(task, {
      latestUserFollowUp: message,
      currentStep: {
        id: `intent.${intent}`,
        label: '已写入当前对话上下文',
        status: 'done',
        updatedAt: now,
      },
    });
    await this.taskRepo.save(task);
    await this.writeEvent(
      task,
      AgentTaskEventType.SocialAgentContextAppended,
      '已写入 Social Agent 对话上下文',
      { intent, message, at: now },
      AgentTaskEventActor.User,
    ).catch((error) => {
      this.metrics.recordError('context_append_event_failed');
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.context_append.event_failed',
          taskId: task.id,
          ownerUserId: task.ownerUserId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    });
  }

  private async saveIntentToProfile(
    ownerUserId: number,
    intent: SocialAgentIntentType,
    message: string,
  ): Promise<boolean> {
    const key = profileKeyForSocialAgentIntent(intent, message);
    if (!key) return false;
    try {
      await this.socialProfiles.saveAnswer(ownerUserId, key, message);
      return true;
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.profile_update_failed',
          ownerUserId,
          intent,
          key,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return false;
    }
  }

  private async writeEvent(
    task: AgentTask,
    eventType: AgentTaskEventType,
    summary: string,
    payload: Record<string, unknown> = {},
    actor: AgentTaskEventActor = AgentTaskEventActor.Agent,
  ) {
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
          event: 'social_agent.route_profile_turn.event_write_failed',
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
}
