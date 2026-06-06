import { Injectable, Logger, Optional } from '@nestjs/common';

import { sanitizeCity } from '../common/city.util';
import { SocialProfileService } from '../users/social-profile.service';
import { AgentTask } from './entities/agent-task.entity';
import {
  SocialAgentBrainService,
  type SocialAgentBrainTurnDecision,
} from './social-agent-brain.service';
import { rememberSocialAgentConversationBrainDecision } from './social-agent-chat-brain-memory.presenter';
import { readSocialAgentConversationHistory } from './social-agent-chat-memory.presenter';
import type { SocialAgentRouteMessageBody } from './social-agent-chat.types';
import { applySocialAgentTaskMemoryForIntent } from './social-agent-intent-memory.presenter';
import {
  SocialAgentIntentRouterService,
  type SocialAgentIntentRouterResult,
} from './social-agent-intent-router.service';
import type { LongTermMemorySnapshot } from './social-agent-long-term-memory.service';
import { SocialAgentLongTermMemoryService } from './social-agent-long-term-memory.service';
import { appendSocialAgentUserMemo } from './social-agent-memory.util';
import type { SocialAgentMemoryContext } from './social-agent-memory-context.service';
import { SocialAgentMessageLogService } from './social-agent-message-log.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import { SocialAgentProfileEnrichmentService } from './social-agent-profile-enrichment.service';
import { SocialAgentRouteContextService } from './social-agent-route-context.service';
import { SocialAgentTaskLifecycleService } from './social-agent-task-lifecycle.service';

type PrepareRouteDecisionInput = {
  ownerUserId: number;
  task: AgentTask;
  body: SocialAgentRouteMessageBody;
  message: string;
};

type PrepareRouteDecisionResult = {
  task: AgentTask;
  profile: Record<string, unknown> | null;
  longTermSnapshot: LongTermMemorySnapshot | null;
  route: SocialAgentIntentRouterResult;
  brainDecision?: SocialAgentBrainTurnDecision;
  brainToolResults: Array<Record<string, unknown>>;
};

@Injectable()
export class SocialAgentRouteDecisionService {
  private readonly logger = new Logger(SocialAgentRouteDecisionService.name);

  constructor(
    private readonly intentRouter: SocialAgentIntentRouterService,
    private readonly socialProfiles: SocialProfileService,
    private readonly metrics: SocialAgentMetricsService,
    private readonly longTermMemory: SocialAgentLongTermMemoryService,
    private readonly profileEnrichment: SocialAgentProfileEnrichmentService,
    private readonly messageLog: SocialAgentMessageLogService,
    private readonly taskLifecycle: SocialAgentTaskLifecycleService,
    private readonly routeContext: SocialAgentRouteContextService,
    @Optional() private readonly brain?: SocialAgentBrainService,
  ) {}

  async prepare(
    input: PrepareRouteDecisionInput,
  ): Promise<PrepareRouteDecisionResult> {
    const { ownerUserId, body, message } = input;
    const [profile, freshTask, longTermSnapshot] = await Promise.all([
      this.readProfileSummary(ownerUserId),
      this.taskLifecycle.assertTaskOwner(input.task.id, ownerUserId),
      this.readLongTermSnapshot(ownerUserId),
    ]);
    const task = freshTask;
    const memoryContext = this.routeContext.buildMemoryContext(
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
    const brainDecision = await this.planBrainTurn({
      message,
      route,
      profile,
      task,
      body,
      longTermSnapshot,
      memoryContext,
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
    await this.recordRouteAndMemory({
      ownerUserId,
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
    return {
      task,
      profile,
      longTermSnapshot,
      route,
      brainDecision,
      brainToolResults,
    };
  }

  private async planBrainTurn(input: {
    message: string;
    route: SocialAgentIntentRouterResult;
    profile: Record<string, unknown> | null;
    task: AgentTask;
    body: SocialAgentRouteMessageBody;
    longTermSnapshot: LongTermMemorySnapshot | null;
    memoryContext: SocialAgentMemoryContext | null;
  }): Promise<SocialAgentBrainTurnDecision | undefined> {
    return this.brain?.planTurn({
      message: input.message,
      route: input.route,
      profile: input.profile ?? {},
      taskContext: this.routeContext.buildTaskContext({
        task: input.task,
        body: input.body,
        longTermSnapshot: input.longTermSnapshot,
        memoryContext: input.memoryContext,
      }),
      conversationHistory: readSocialAgentConversationHistory(input.task),
      memoryContext: input.memoryContext ?? undefined,
    });
  }

  private async recordRouteAndMemory(input: {
    ownerUserId: number;
    task: AgentTask;
    route: SocialAgentIntentRouterResult;
    message: string;
    longTermSnapshot: LongTermMemorySnapshot | null;
  }): Promise<void> {
    await this.messageLog
      .recordIntentRoute(input.task, input.route)
      .catch((error) => {
        this.metrics.recordError('intent_route_event_failed');
        this.logger.warn(
          JSON.stringify({
            event: 'social_agent.intent_route.event_failed',
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      });
    this.metrics.recordIntent(input.route.intent, input.route.source);
    appendSocialAgentUserMemo(input.task, input.message, input.route.intent);
    applySocialAgentTaskMemoryForIntent(input.task, input.message, input.route);
    await this.routeContext.applyRagContext({
      task: input.task,
      route: input.route,
      message: input.message,
      longTermSnapshot: input.longTermSnapshot,
    });
  }

  private async readLongTermSnapshot(
    ownerUserId: number,
  ): Promise<LongTermMemorySnapshot | null> {
    return this.longTermMemory.readSnapshot(ownerUserId).catch((error) => {
      this.metrics.recordError('long_term_memory_read_failed');
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.long_term_memory.read_failed',
          ownerUserId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return null;
    });
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
}
