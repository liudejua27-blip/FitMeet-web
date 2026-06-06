import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';

import { cleanDisplayText } from '../common/display-text.util';
import { sanitizeCity } from '../common/city.util';
import { LifeGraphProposalDto } from '../life-graph/dto/life-graph.dto';
import { SocialProfileService } from '../users/social-profile.service';
import { AgentTask } from './entities/agent-task.entity';
import { SocialAgentBrainService } from './social-agent-brain.service';
import { rememberSocialAgentConversationBrainDecision } from './social-agent-chat-brain-memory.presenter';
import { readSocialAgentConversationHistory } from './social-agent-chat-memory.presenter';
import type {
  SocialAgentActivityResult,
  SocialAgentAsyncRunSnapshot,
  SocialAgentChatReplanRunBody,
  SocialAgentIntentRouteResult,
  SocialAgentRouteMessageBody,
} from './social-agent-chat.types';
import { appendSocialAgentUserMemo } from './social-agent-memory.util';
import { SocialAgentCandidateActionService } from './social-agent-candidate-action.service';
import { SocialAgentChatLlmService } from './social-agent-chat-llm.service';
import { SocialAgentIntentRouterService } from './social-agent-intent-router.service';
import { SocialAgentLongTermMemoryService } from './social-agent-long-term-memory.service';
import { SocialAgentMainAgentTurnService } from './social-agent-main-agent-turn.service';
import { SocialAgentMessageLogService } from './social-agent-message-log.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import { SocialAgentProfileEnrichmentService } from './social-agent-profile-enrichment.service';
import { SocialAgentRouteContextService } from './social-agent-route-context.service';
import {
  shouldUseSocialAgentLlmDirectReply,
  socialAgentAssistantMessageForRoute,
  socialAgentRouteAction,
} from './social-agent-route-response.presenter';
import { SocialAgentTaskLifecycleService } from './social-agent-task-lifecycle.service';
import { applySocialAgentTaskMemoryForIntent } from './social-agent-intent-memory.presenter';
import { SocialAgentRouteProfileTurnService } from './social-agent-route-profile-turn.service';
import { SocialAgentRouteSearchTurnService } from './social-agent-route-search-turn.service';
import { SocialAgentRouteActionTurnService } from './social-agent-route-action-turn.service';

type QueueInitialSearchForTask = (
  ownerUserId: number,
  task: AgentTask,
  goal: string,
) => Promise<SocialAgentAsyncRunSnapshot>;

type ReplanAndRefresh = (
  ownerUserId: number,
  taskId: number,
  body: SocialAgentChatReplanRunBody,
) => Promise<SocialAgentAsyncRunSnapshot>;

@Injectable()
export class SocialAgentRouteTurnService {
  private readonly logger = new Logger(SocialAgentRouteTurnService.name);

  constructor(
    private readonly intentRouter: SocialAgentIntentRouterService,
    private readonly socialProfiles: SocialProfileService,
    private readonly metrics: SocialAgentMetricsService,
    private readonly longTermMemory: SocialAgentLongTermMemoryService,
    private readonly chatLlm: SocialAgentChatLlmService,
    private readonly profileEnrichment: SocialAgentProfileEnrichmentService,
    private readonly candidateActions: SocialAgentCandidateActionService,
    private readonly messageLog: SocialAgentMessageLogService,
    private readonly taskLifecycle: SocialAgentTaskLifecycleService,
    private readonly routeContext: SocialAgentRouteContextService,
    private readonly profileTurns: SocialAgentRouteProfileTurnService,
    private readonly searchTurns: SocialAgentRouteSearchTurnService,
    private readonly actionTurns: SocialAgentRouteActionTurnService,
    private readonly mainAgentTurn: SocialAgentMainAgentTurnService,
    @Optional() private readonly brain?: SocialAgentBrainService,
  ) {}

  async handleMessage(input: {
    ownerUserId: number;
    body: SocialAgentRouteMessageBody;
    replanAndRefresh: ReplanAndRefresh;
    queueInitialSearchForTask: QueueInitialSearchForTask;
  }): Promise<SocialAgentIntentRouteResult> {
    const { ownerUserId, body } = input;
    const startedAt = Date.now();
    const message = cleanDisplayText(body.message, '').trim();
    if (!message) throw new BadRequestException('请输入消息');
    const taskId = this.number(body.taskId);
    let task = await this.taskLifecycle.ensureConversationTask(
      ownerUserId,
      taskId,
      message,
    );
    await this.messageLog.recordUserMessage(task, message);

    const mainAgentTurn = await this.mainAgentTurn.handleRouteTurn({
      ownerUserId,
      task,
      message,
      hasCandidates: body.hasCandidates === true,
      startedAt,
    });
    task = mainAgentTurn.task;
    if (mainAgentTurn.result) return mainAgentTurn.result;

    const [profile, freshTask, longTermSnapshot] = await Promise.all([
      this.readProfileSummary(ownerUserId),
      this.taskLifecycle.assertTaskOwner(task.id, ownerUserId),
      this.longTermMemory.readSnapshot(ownerUserId).catch((error) => {
        this.metrics.recordError('long_term_memory_read_failed');
        this.logger.warn(
          JSON.stringify({
            event: 'social_agent.long_term_memory.read_failed',
            ownerUserId,
            message: error instanceof Error ? error.message : String(error),
          }),
        );
        return null;
      }),
    ]);
    task = freshTask;
    let memoryContext = this.routeContext.buildMemoryContext(
      task,
      longTermSnapshot,
    );
    let route = await this.intentRouter.route({
      message,
      taskContext: this.routeContext.buildTaskContext({
        task,
        body,
        longTermSnapshot,
        memoryContext,
      }),
      profile: profile ?? {},
      conversationHistory: readSocialAgentConversationHistory(task),
    });
    const brainDecision = await this.brain?.planTurn({
      message,
      route,
      profile: profile ?? {},
      taskContext: this.routeContext.buildTaskContext({
        task,
        body,
        longTermSnapshot,
        memoryContext,
      }),
      conversationHistory: readSocialAgentConversationHistory(task),
      memoryContext: memoryContext ?? undefined,
    });
    if (brainDecision) {
      route = brainDecision.route;
      rememberSocialAgentConversationBrainDecision(task, brainDecision);
      if (brainDecision.conversationMode === 'profile_correction') {
        this.profileEnrichment.recordProfileMisunderstanding(
          task,
          brainDecision.reason || 'user_correction',
        );
      }
    }
    this.profileEnrichment.rememberCurrentTaskFromBrain(task, route);
    memoryContext = this.routeContext.buildMemoryContext(
      task,
      longTermSnapshot,
    );
    await this.messageLog.recordIntentRoute(task, route).catch((error) => {
      this.metrics.recordError('intent_route_event_failed');
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.intent_route.event_failed',
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    });
    this.metrics.recordIntent(route.intent, route.source);
    appendSocialAgentUserMemo(task, message, route.intent);
    applySocialAgentTaskMemoryForIntent(task, message, route);
    await this.routeContext.applyRagContext({
      task,
      route,
      message,
      longTermSnapshot,
    });
    const brainToolResults =
      await this.profileEnrichment.executeConversationBrainReadTools(
        ownerUserId,
        task,
        brainDecision,
      );

    let savedContext = false;
    let profileUpdated = false;
    let queuedRun: SocialAgentAsyncRunSnapshot | null = null;
    let runMode: SocialAgentIntentRouteResult['runMode'] = null;
    let assistantMessage = socialAgentAssistantMessageForRoute({
      route,
      task,
      message,
    });
    let activityResults: SocialAgentActivityResult[] = [];
    let profileUpdateProposal: LifeGraphProposalDto | null = null;

    const confirmedCandidateMessage =
      await this.candidateActions.confirmPendingCandidateMessageIfRequested(
        ownerUserId,
        task,
        message,
      );
    if (confirmedCandidateMessage) {
      task = confirmedCandidateMessage.task;
      assistantMessage = confirmedCandidateMessage.assistantMessage;
      const result: SocialAgentIntentRouteResult = {
        ...route,
        intent: 'action_request',
        action: 'reply',
        taskId: task.id,
        assistantMessage,
        savedContext: false,
        profileUpdated: false,
        shouldExecuteAction: true,
        shouldQueueRun: false,
        runMode: null,
        queuedRun: null,
        pendingApproval: null,
        activityResults: [],
        permissionMode: task.permissionMode,
      };
      this.metrics.recordAction(result.action);
      await this.messageLog.recordAssistantMessage(
        task,
        assistantMessage,
        result,
      );
      this.metrics.observeRouteLatency(Date.now() - startedAt);
      return result;
    }

    if (
      route.intent === 'profile_enrichment' ||
      route.intent === 'profile_enrichment_request' ||
      route.intent === 'correction_or_clarification'
    ) {
      const handled = await this.profileEnrichment.handleTurn({
        ownerUserId,
        task,
        message,
        intent: route.intent,
        buildMemoryContext: (currentTask) =>
          this.routeContext.buildMemoryContext(currentTask, null),
      });
      assistantMessage = handled.assistantMessage;
      savedContext = handled.savedContext;
      profileUpdated = handled.profileUpdated;
      profileUpdateProposal = handled.profileUpdateProposal ?? null;
      task = handled.task;
    } else if (shouldUseSocialAgentLlmDirectReply(route)) {
      assistantMessage = await this.chatLlm.generateConversationalAnswer({
        message,
        route,
        profile,
        task,
        longTermSnapshot,
        memoryContext: this.routeContext.buildMemoryContext(
          task,
          longTermSnapshot,
        ),
        toolResults: brainToolResults,
      });
    }

    const profileTurn = await this.profileTurns.handle({
      ownerUserId,
      task,
      message,
      route,
    });
    if (profileTurn.handled) {
      task = profileTurn.task;
      savedContext = profileTurn.savedContext;
      profileUpdated = profileTurn.profileUpdated;
      profileUpdateProposal = profileTurn.profileUpdateProposal;
      assistantMessage = profileTurn.assistantMessage ?? assistantMessage;
      if (!profileUpdateProposal) {
        task = await this.taskLifecycle.assertTaskOwner(task.id, ownerUserId);
      }
    }

    const searchTurn = await this.searchTurns.handle({
      ownerUserId,
      task,
      route,
      message,
      replanAndRefresh: input.replanAndRefresh,
      queueInitialSearchForTask: input.queueInitialSearchForTask,
      buildMemoryContext: (currentTask) =>
        this.routeContext.buildMemoryContext(currentTask, null),
    });
    if (searchTurn.handled) {
      assistantMessage = searchTurn.assistantMessage ?? assistantMessage;
      savedContext = searchTurn.savedContext || savedContext;
      activityResults = searchTurn.activityResults;
      queuedRun = searchTurn.queuedRun;
      runMode = searchTurn.runMode;
    }

    if (queuedRun) {
      task = await this.taskLifecycle.assertTaskOwner(task.id, ownerUserId);
    }

    const actionTurn = await this.actionTurns.handle({
      ownerUserId,
      task,
      route,
      message,
      assistantMessage,
    });
    assistantMessage = actionTurn.assistantMessage;

    const result: SocialAgentIntentRouteResult = {
      ...route,
      shouldReplan: queuedRun ? runMode === 'follow_up' : route.shouldReplan,
      action: socialAgentRouteAction(route, queuedRun, runMode),
      taskId: task.id,
      assistantMessage,
      savedContext,
      profileUpdated,
      shouldQueueRun: Boolean(queuedRun),
      runMode,
      queuedRun,
      pendingApproval: actionTurn.pendingApproval,
      activityResults,
      profileUpdateProposal,
      permissionMode: task.permissionMode,
    };
    if (queuedRun && runMode) this.metrics.recordQueuedRun(runMode);
    this.metrics.recordAction(result.action);
    await this.messageLog.recordAssistantMessage(
      task,
      assistantMessage,
      result,
    );
    this.metrics.observeRouteLatency(Date.now() - startedAt);
    return result;
  }

  private async readProfileSummary(
    ownerUserId: number,
  ): Promise<Record<string, unknown> | null> {
    try {
      const profile = await this.socialProfiles.get(ownerUserId);
      return {
        city: sanitizeCity(profile.city),
        interestTags: profile.interestTags ?? [],
        availableTimes: profile.availableTimes ?? [],
        profileDiscoverable: profile.profileDiscoverable,
        agentCanRecommendMe: profile.agentCanRecommendMe,
      };
    } catch {
      return null;
    }
  }

  private number(value: unknown): number | null {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }
}
