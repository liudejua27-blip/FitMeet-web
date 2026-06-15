import { Injectable } from '@nestjs/common';

import type { AgentTask } from './entities/agent-task.entity';
import {
  hasSocialAgentSearchContext,
  socialAgentCandidateFollowupReply,
} from './social-agent-candidate-context.presenter';
import type {
  SocialAgentActivityResult,
  SocialAgentAsyncRunSnapshot,
  SocialAgentChatReplanRunBody,
  SocialAgentIntentRouteResult,
} from './social-agent-chat.types';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import { SocialAgentActivitySearchService } from './social-agent-activity-search.service';
import { evaluateSocialOpportunityClarification } from './social-agent-opportunity-clarification';
import { SocialAgentProfileGateService } from './social-agent-profile-gate.service';
import { SocialAgentProfileEnrichmentService } from './social-agent-profile-enrichment.service';

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

type HandleRouteSearchTurnInput = {
  ownerUserId: number;
  task: AgentTask;
  route: SocialAgentIntentRouterResult;
  message: string;
  replanAndRefresh: ReplanAndRefresh;
  queueInitialSearchForTask: QueueInitialSearchForTask;
  buildMemoryContext: (task: AgentTask) => unknown;
};

type HandleRouteSearchTurnResult = {
  handled: boolean;
  assistantMessage?: string;
  savedContext: boolean;
  activityResults: SocialAgentActivityResult[];
  queuedRun: SocialAgentAsyncRunSnapshot | null;
  runMode: SocialAgentIntentRouteResult['runMode'];
};

@Injectable()
export class SocialAgentRouteSearchTurnService {
  constructor(
    private readonly profileEnrichment: SocialAgentProfileEnrichmentService,
    private readonly activitySearch: SocialAgentActivitySearchService,
    private readonly profileGate: SocialAgentProfileGateService,
  ) {}

  async handle(
    input: HandleRouteSearchTurnInput,
  ): Promise<HandleRouteSearchTurnResult> {
    if (input.route.intent === 'activity_search') {
      const clarification = evaluateSocialOpportunityClarification({
        task: input.task,
        route: input.route,
        message: input.message,
      });
      if (!clarification.complete) {
        return {
          ...this.emptyResult(true),
          assistantMessage: clarification.assistantMessage,
          savedContext: true,
        };
      }
      const gate = await this.profileGate.evaluateForSocialExecution({
        ownerUserId: input.ownerUserId,
        task: input.task,
        route: input.route,
        message: clarification.searchGoal,
      });
      if (!gate.passed) {
        return {
          ...this.emptyResult(true),
          assistantMessage: gate.assistantMessage,
          savedContext: true,
        };
      }
      const handled = await this.activitySearch.handleActivitySearch({
        ownerUserId: input.ownerUserId,
        task: input.task,
        route: input.route,
        message: clarification.searchGoal,
        buildMemoryContext: input.buildMemoryContext,
      });
      return {
        handled: true,
        assistantMessage: handled.assistantMessage,
        savedContext: false,
        activityResults: handled.activityResults,
        queuedRun: null,
        runMode: null,
      };
    }

    if (input.route.intent === 'social_search') {
      return this.handleSocialSearch(input);
    }

    if (input.route.intent === 'candidate_followup') {
      return this.handleCandidateFollowup(input);
    }

    return this.emptyResult(false);
  }

  private async handleSocialSearch(
    input: HandleRouteSearchTurnInput,
  ): Promise<HandleRouteSearchTurnResult> {
    const clarification = evaluateSocialOpportunityClarification({
      task: input.task,
      route: input.route,
      message: input.message,
    });
    if (!clarification.complete) {
      return {
        ...this.emptyResult(true),
        assistantMessage: clarification.assistantMessage,
        savedContext: true,
      };
    }
    const gate = await this.profileGate.evaluateForSocialExecution({
      ownerUserId: input.ownerUserId,
      task: input.task,
      route: input.route,
      message: clarification.searchGoal,
    });
    if (!gate.passed) {
      return {
        ...this.emptyResult(true),
        assistantMessage: gate.assistantMessage,
        savedContext: true,
      };
    }
    const lifeGraphClarification =
      await this.profileEnrichment.lifeGraphSearchClarification(
        input.ownerUserId,
        input.message,
      );
    if (lifeGraphClarification) {
      return {
        ...this.emptyResult(true),
        assistantMessage: lifeGraphClarification,
        savedContext: true,
      };
    }
    return this.queueSearch(input, clarification.searchGoal);
  }

  private async handleCandidateFollowup(
    input: HandleRouteSearchTurnInput,
  ): Promise<HandleRouteSearchTurnResult> {
    if (input.route.shouldSearch || input.route.shouldReplan) {
      return this.queueSearch(input);
    }
    return {
      ...this.emptyResult(true),
      assistantMessage: socialAgentCandidateFollowupReply(
        input.task,
        input.message,
      ),
    };
  }

  private async queueSearch(
    input: HandleRouteSearchTurnInput,
    searchGoal = input.message,
  ): Promise<HandleRouteSearchTurnResult> {
    if (
      input.route.intent === 'candidate_followup' &&
      !input.route.shouldSearch &&
      !input.route.shouldReplan
    ) {
      return this.emptyResult(true);
    }
    if (
      (input.route.intent === 'social_search' && input.route.shouldReplan) ||
      input.route.intent === 'candidate_followup'
    ) {
      if (hasSocialAgentSearchContext(input.task)) {
        const queuedRun = await input.replanAndRefresh(
          input.ownerUserId,
          input.task.id,
          {
            userMessage: searchGoal,
            reason: 'user_follow_up',
          },
        );
        return {
          ...this.emptyResult(true),
          queuedRun,
          runMode: 'follow_up',
        };
      }
    }
    const queuedRun = await input.queueInitialSearchForTask(
      input.ownerUserId,
      input.task,
      searchGoal,
    );
    return {
      ...this.emptyResult(true),
      queuedRun,
      runMode: 'initial',
    };
  }

  private emptyResult(handled: boolean): HandleRouteSearchTurnResult {
    return {
      handled,
      savedContext: false,
      activityResults: [],
      queuedRun: null,
      runMode: null,
    };
  }
}
