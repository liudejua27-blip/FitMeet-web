import { BadRequestException, Injectable } from '@nestjs/common';

import { cleanDisplayText } from '../common/display-text.util';
import { LifeGraphProposalDto } from '../life-graph/dto/life-graph.dto';
import { AgentTask } from './entities/agent-task.entity';
import type {
  SocialAgentActivityResult,
  SocialAgentAsyncRunSnapshot,
  SocialAgentChatReplanRunBody,
  SocialAgentIntentRouteResult,
  SocialAgentRouteMessageBody,
} from './social-agent-chat.types';
import { SocialAgentChatLlmService } from './social-agent-chat-llm.service';
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
import { SocialAgentRouteCandidateConfirmationService } from './social-agent-route-candidate-confirmation.service';
import { SocialAgentRouteProfileTurnService } from './social-agent-route-profile-turn.service';
import { SocialAgentRouteSearchTurnService } from './social-agent-route-search-turn.service';
import { SocialAgentRouteActionTurnService } from './social-agent-route-action-turn.service';
import { SocialAgentRouteDecisionService } from './social-agent-route-decision.service';

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
  constructor(
    private readonly metrics: SocialAgentMetricsService,
    private readonly chatLlm: SocialAgentChatLlmService,
    private readonly profileEnrichment: SocialAgentProfileEnrichmentService,
    private readonly messageLog: SocialAgentMessageLogService,
    private readonly taskLifecycle: SocialAgentTaskLifecycleService,
    private readonly routeContext: SocialAgentRouteContextService,
    private readonly candidateConfirmations: SocialAgentRouteCandidateConfirmationService,
    private readonly profileTurns: SocialAgentRouteProfileTurnService,
    private readonly searchTurns: SocialAgentRouteSearchTurnService,
    private readonly actionTurns: SocialAgentRouteActionTurnService,
    private readonly routeDecisions: SocialAgentRouteDecisionService,
    private readonly mainAgentTurn: SocialAgentMainAgentTurnService,
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

    const decision = await this.routeDecisions.prepare({
      ownerUserId,
      task,
      body,
      message,
    });
    task = decision.task;
    const { profile, longTermSnapshot, route, brainToolResults } = decision;

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

    const candidateConfirmation = await this.candidateConfirmations.handle({
      ownerUserId,
      task,
      message,
      route,
      startedAt,
    });
    if (candidateConfirmation.handled) return candidateConfirmation.result;
    task = candidateConfirmation.task;

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

  private number(value: unknown): number | null {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }
}
