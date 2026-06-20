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
import type { SocialAgentHydratedContext } from './social-agent-context-hydrator.service';
import { selectSocialAgentContextWindow } from './social-agent-context-window';
import { appendSocialAgentConversationTurn } from './social-agent-chat-memory.presenter';
import {
  rememberSocialAgentCurrentTask,
  rememberSocialAgentShortTerm,
} from './social-agent-memory.util';
import { buildSocialAgentProfileSavedNextStepReply } from './social-agent-profile-next-step-reply';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import { SocialAgentProfileEnrichmentService } from './social-agent-profile-enrichment.service';

type HandleRouteProfileTurnInput = {
  ownerUserId: number;
  task: AgentTask;
  message: string;
  route: SocialAgentIntentRouterResult;
  hydratedContext?: SocialAgentHydratedContext | null;
  signal?: AbortSignal | null;
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
    this.assertNotAborted(input.signal);
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
      this.assertNotAborted(input.signal);
      const proposal = await this.lifeGraph.extractFromChat(ownerUserId, {
        message,
        taskId: task.id,
        context: this.buildLifeGraphExtractionContext(
          route.intent,
          input.hydratedContext,
        ),
      });
      this.assertNotAborted(input.signal);
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
      this.assertNotAborted(input.signal);
      await this.rememberRoutedMessage(task, message, route.intent);
      savedContext = true;
      this.assertNotAborted(input.signal);
      const profileKey = profileKeyForSocialAgentIntent(route.intent, message);
      const deferSensitiveProfilePersistence =
        this.shouldDeferSensitiveProfilePersistence(route.intent, profileKey);
      profileUpdated = deferSensitiveProfilePersistence
        ? false
        : await this.saveIntentToProfile(ownerUserId, profileKey, message);
      assistantMessage = buildSocialAgentProfileSavedNextStepReply({
        intent: route.intent,
        message,
        profileUpdated,
      });
      rememberSocialAgentCurrentTask(task, {
        objective: 'profile_enrichment',
        nextStep: deferSensitiveProfilePersistence
          ? '等待用户确认是否保存这条画像/安全边界'
          : '等待用户选择继续补齐画像边界，或确认现在开始搜索',
        shouldSearchNow: false,
        profileSaved: profileUpdated,
        awaitingSearchConfirmation: true,
        waitingFor: deferSensitiveProfilePersistence
          ? 'life_graph_profile_confirmation'
          : 'availability_boundaries_or_search_confirmation',
        lastCompletedStep: profileUpdated
          ? 'profile_saved'
          : deferSensitiveProfilePersistence
            ? 'profile_context_saved_pending_confirmation'
            : 'profile_context_saved',
      });
      await this.taskRepo.save(task);
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

  private assertNotAborted(signal?: AbortSignal | null): void {
    if (signal?.aborted) throw new Error('Subagent worker job cancelled.');
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
    );
  }

  private async saveIntentToProfile(
    ownerUserId: number,
    key: string | null,
    message: string,
  ): Promise<boolean> {
    if (!key) return false;
    try {
      await this.socialProfiles.saveAnswer(ownerUserId, key, message);
      return true;
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.profile_update_failed',
          ownerUserId,
          key,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return false;
    }
  }

  private shouldDeferSensitiveProfilePersistence(
    intent: SocialAgentIntentType,
    key: string | null,
  ): boolean {
    if (intent === 'safety_or_boundary') return true;
    return key === 'privacyBoundary' || key === 'avoidTraits';
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
      this.metrics.recordError('context_append_event_failed');
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

  private buildLifeGraphExtractionContext(
    intent: SocialAgentIntentType,
    hydratedContext?: SocialAgentHydratedContext | null,
  ): Record<string, unknown> {
    if (!hydratedContext) return { intent };
    return {
      intent,
      threadId: this.safeContextText(hydratedContext.threadId, 96),
      taskId: hydratedContext.taskId,
      taskSlots: this.summarizeTaskSlots(hydratedContext.taskSlots),
      lifeGraphSummary: sanitizeForDisplay(
        hydratedContext.lifeGraphSummary ?? {},
      ),
      pendingApprovalCount: hydratedContext.pendingApprovals.length,
      candidateActions: sanitizeForDisplay(
        hydratedContext.candidateActions ?? {},
      ),
      recentMessages: selectSocialAgentContextWindow(
        hydratedContext.recentMessages,
      )
        .map((message) => this.summarizeRecentMessage(message))
        .filter(Boolean),
    };
  }

  private summarizeRecentMessage(
    message: Record<string, unknown>,
  ): Record<string, string> | null {
    const role = cleanDisplayText(message.role, '').slice(0, 32);
    const text = cleanDisplayText(
      message.text ?? message.content ?? message.message,
      '',
    )
      .trim()
      .slice(0, 240);
    if (!role && !text) return null;
    return {
      ...(role ? { role } : {}),
      ...(text ? { text } : {}),
    };
  }

  private summarizeTaskSlots(
    taskSlots: SocialAgentHydratedContext['taskSlots'],
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(taskSlots as Record<string, unknown>).map(
        ([key, value]) => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return [key, this.safeContextText(value, 240)];
          }
          const slot = value as Record<string, unknown>;
          return [
            key,
            {
              ...(slot.state ? { state: this.safeContextText(slot.state, 40) } : {}),
              ...(slot.value
                ? { value: this.safeContextText(slot.value, 240) }
                : {}),
            },
          ];
        },
      ),
    );
  }

  private safeContextText(value: unknown, max: number): string {
    return cleanDisplayText(value, '').trim().slice(0, max);
  }
}
