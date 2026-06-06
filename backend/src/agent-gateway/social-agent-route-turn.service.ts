import { Injectable } from '@nestjs/common';

import { LifeGraphProposalDto } from '../life-graph/dto/life-graph.dto';
import { AgentTask } from './entities/agent-task.entity';
import type {
  SocialAgentActivityResult,
  SocialAgentAsyncRunSnapshot,
  SocialAgentChatReplanRunBody,
  SocialAgentIntentRouteResult,
  SocialAgentRouteMessageBody,
} from './social-agent-chat.types';
import { SocialAgentRouteContextService } from './social-agent-route-context.service';
import { socialAgentAssistantMessageForRoute } from './social-agent-route-response.presenter';
import { SocialAgentTaskLifecycleService } from './social-agent-task-lifecycle.service';
import { SocialAgentRouteCandidateConfirmationService } from './social-agent-route-candidate-confirmation.service';
import { SocialAgentRouteCompletionService } from './social-agent-route-completion.service';
import { SocialAgentRouteConversationTurnService } from './social-agent-route-conversation-turn.service';
import { SocialAgentRouteEntranceService } from './social-agent-route-entrance.service';
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
    private readonly taskLifecycle: SocialAgentTaskLifecycleService,
    private readonly routeContext: SocialAgentRouteContextService,
    private readonly candidateConfirmations: SocialAgentRouteCandidateConfirmationService,
    private readonly completions: SocialAgentRouteCompletionService,
    private readonly conversationTurns: SocialAgentRouteConversationTurnService,
    private readonly entrance: SocialAgentRouteEntranceService,
    private readonly profileTurns: SocialAgentRouteProfileTurnService,
    private readonly searchTurns: SocialAgentRouteSearchTurnService,
    private readonly actionTurns: SocialAgentRouteActionTurnService,
    private readonly routeDecisions: SocialAgentRouteDecisionService,
  ) {}

  async handleMessage(input: {
    ownerUserId: number;
    body: SocialAgentRouteMessageBody;
    replanAndRefresh: ReplanAndRefresh;
    queueInitialSearchForTask: QueueInitialSearchForTask;
  }): Promise<SocialAgentIntentRouteResult> {
    const { ownerUserId, body } = input;
    const entered = await this.entrance.enter({
      ownerUserId,
      body,
    });
    if (entered.earlyResult) return entered.earlyResult;

    const { message, startedAt } = entered;
    let task = entered.task;

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

    const conversationTurn = await this.conversationTurns.handle({
      ownerUserId,
      task,
      message,
      route,
      profile,
      longTermSnapshot,
      brainToolResults,
    });
    if (conversationTurn.handled) {
      task = conversationTurn.task;
      assistantMessage = conversationTurn.assistantMessage ?? assistantMessage;
      savedContext = conversationTurn.savedContext;
      profileUpdated = conversationTurn.profileUpdated;
      profileUpdateProposal = conversationTurn.profileUpdateProposal;
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

    return this.completions.complete({
      task,
      route,
      assistantMessage,
      savedContext,
      profileUpdated,
      queuedRun,
      runMode,
      pendingApproval: actionTurn.pendingApproval,
      activityResults,
      profileUpdateProposal,
      startedAt,
    });
  }
}
