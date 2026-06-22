import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { sanitizeCity } from '../common/city.util';
import { SocialProfileService } from '../users/social-profile.service';
import { AgentTask } from './entities/agent-task.entity';
import { socialAgentContextTurnLimit } from './social-agent-context-window';
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
import {
  SocialAgentContextHydratorService,
  type SocialAgentHydratedContext,
} from './social-agent-context-hydrator.service';
import { SocialAgentRouteContextService } from './social-agent-route-context.service';
import { SocialAgentTaskLifecycleService } from './social-agent-task-lifecycle.service';
import { SocialAgentTaskMemoryStateMachineService } from './social-agent-task-memory-state-machine.service';
import { buildSocialAgentKnownTaskSlotConstraints } from './social-agent-task-slot-constraints.presenter';
import {
  enforceExplicitSocialExecutionRoute,
  hasExplicitSocialExecutionIntent,
  isSocialExecutionIntent,
} from './social-agent-social-intent-gate';
import {
  SocialAgentWorkflowRouterService,
  type SocialAgentWorkflowRouterDecision,
} from './social-agent-workflow-router.service';

type PrepareRouteDecisionInput = {
  ownerUserId: number;
  task: AgentTask;
  body: SocialAgentRouteMessageBody;
  message: string;
  signal?: AbortSignal | null;
};

type PrepareRouteDecisionResult = {
  task: AgentTask;
  profile: Record<string, unknown> | null;
  longTermSnapshot: LongTermMemorySnapshot | null;
  taskContext: Record<string, unknown>;
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
    @Optional() private readonly config?: ConfigService,
    @Optional()
    private readonly contextHydrator?: SocialAgentContextHydratorService,
    @Optional()
    private readonly taskSlots?: SocialAgentTaskMemoryStateMachineService,
    @Optional()
    private readonly workflowRouter?: SocialAgentWorkflowRouterService,
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
    if (this.shouldApplyCurrentMessageToTaskSlots(body, message)) {
      this.applyCurrentMessageToTaskSlots(task, message);
    }
    const hydratedContext = this.withLatestTaskSlots(
      await this.hydrateRuntimeContext({
        ownerUserId,
        task,
        body,
      }),
      task,
    );
    const memoryContext = this.routeContext.buildMemoryContext(
      task,
      longTermSnapshot,
      hydratedContext,
    );
    const conversationHistory =
      this.nonEmptyRecordArray(hydratedContext?.recentMessages) ??
      this.conversationHistory(task);
    const taskContext = this.routeContext.buildTaskContext({
      task,
      body,
      longTermSnapshot,
      memoryContext,
      hydratedContext,
    });
    const routeInput = {
      message,
      taskContext,
      profile: profile ?? {},
      conversationHistory,
      signal: input.signal,
      conversationIntent: this.conversationIntent(body),
    };
    const workflowDecision = this.workflowRouter?.route(routeInput) ?? null;
    let route = workflowDecision
      ? workflowDecision.route
      : await this.intentRouter.route(routeInput);
    route = this.enforceRouteBoundary(
      {
        message,
        taskContext,
        profile: profile ?? {},
        conversationHistory,
        conversationIntent: this.conversationIntent(body),
      },
      route,
    );
    const brainDecision = workflowDecision?.skipBrain
      ? undefined
      : await this.planBrainTurn({
          message,
          route,
          profile,
          task,
          body,
          longTermSnapshot,
          memoryContext,
          taskContext,
          conversationHistory,
          signal: input.signal,
        });
    if (brainDecision) {
      route = this.enforceRouteBoundary(
        {
          message,
          taskContext,
          profile: profile ?? {},
          conversationHistory,
          conversationIntent: this.conversationIntent(body),
        },
        brainDecision.route,
      );
      brainDecision.route = route;
      this.sanitizeBrainToolsAfterIntentGate(brainDecision);
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
      workflowDecision,
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
      taskContext,
      route,
      brainDecision,
      brainToolResults,
    };
  }

  private conversationIntent(
    body: SocialAgentRouteMessageBody,
  ): NonNullable<SocialAgentRouteMessageBody['conversationIntent']> | null {
    return body.clientContext?.conversationIntent ?? body.conversationIntent ?? null;
  }

  private enforceRouteBoundary(
    input: Parameters<typeof enforceExplicitSocialExecutionRoute>[0],
    route: SocialAgentIntentRouterResult,
  ): SocialAgentIntentRouterResult {
    return enforceExplicitSocialExecutionRoute(input, route);
  }

  private shouldApplyCurrentMessageToTaskSlots(
    body: SocialAgentRouteMessageBody,
    message: string,
  ): boolean {
    const conversationIntent = this.conversationIntent(body);
    if (
      conversationIntent === 'conversation' &&
      !hasExplicitSocialExecutionIntent(message)
    ) {
      return false;
    }
    return true;
  }

  private async planBrainTurn(input: {
    message: string;
    route: SocialAgentIntentRouterResult;
    profile: Record<string, unknown> | null;
    task: AgentTask;
    body: SocialAgentRouteMessageBody;
    longTermSnapshot: LongTermMemorySnapshot | null;
    memoryContext: SocialAgentMemoryContext | null;
    taskContext: Record<string, unknown>;
    conversationHistory: Array<Record<string, unknown>>;
    signal?: AbortSignal | null;
  }): Promise<SocialAgentBrainTurnDecision | undefined> {
    return this.brain?.planTurn({
      message: input.message,
      route: input.route,
      profile: input.profile ?? {},
      taskContext: input.taskContext,
      conversationHistory: input.conversationHistory,
      memoryContext: input.memoryContext ?? undefined,
      signal: input.signal,
    });
  }

  private sanitizeBrainToolsAfterIntentGate(
    decision: SocialAgentBrainTurnDecision,
  ): void {
    if (isSocialExecutionIntent(decision.route.intent)) return;
    const readOnlyTools = decision.tools.filter((tool) =>
      this.isSafeBrainReadTool(tool.name),
    );
    decision.tools = readOnlyTools;
    decision.shouldExecuteTool = readOnlyTools.length > 0;
    if (
      decision.conversationMode === 'search' ||
      decision.conversationMode === 'action'
    ) {
      decision.conversationMode = 'answer';
    }
  }

  private isSafeBrainReadTool(toolName: string): boolean {
    return [
      'get_user_profile',
      'read_life_graph',
      'get_conversation_history',
      'get_conversation_messages',
      'get_candidate_detail',
    ].includes(toolName);
  }

  private async hydrateRuntimeContext(input: {
    ownerUserId: number;
    task: AgentTask;
    body: SocialAgentRouteMessageBody;
  }): Promise<SocialAgentHydratedContext | null> {
    if (!this.contextHydrator) return null;
    try {
      return await this.contextHydrator.hydrateContext({
        userId: input.ownerUserId,
        taskId: input.task.id,
        threadId: input.body.clientContext?.threadId ?? input.task.id,
      });
    } catch (error) {
      this.metrics.recordError('context_hydration_failed');
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.context_hydration.failed',
          ownerUserId: input.ownerUserId,
          taskId: input.task.id,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return null;
    }
  }

  private applyCurrentMessageToTaskSlots(task: AgentTask, message: string): void {
    const slots =
      this.taskSlots ?? new SocialAgentTaskMemoryStateMachineService();
    try {
      slots.applyUserMessage(task, message);
    } catch (error) {
      this.metrics.recordError('task_slot_memory_apply_failed');
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.task_slots.apply_failed',
          taskId: task.id,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private withLatestTaskSlots(
    hydratedContext: SocialAgentHydratedContext | null,
    task: AgentTask,
  ): SocialAgentHydratedContext | null {
    if (!hydratedContext) return null;
    const slots =
      this.taskSlots ?? new SocialAgentTaskMemoryStateMachineService();
    const taskSlots = slots.readSlots(task);
    const taskSlotSummary = slots.publicSlotSummary(taskSlots);
    const knownTaskSlotConstraints =
      buildSocialAgentKnownTaskSlotConstraints(taskSlots);
    if (Object.keys(taskSlots).length === 0) return hydratedContext;
    return {
      ...hydratedContext,
      taskSlots,
      taskSlotSummary,
      knownTaskSlotConstraints,
      taskMemory: hydratedContext.taskMemory
        ? {
            ...hydratedContext.taskMemory,
            taskSlots,
            taskSlotSummary,
            knownTaskSlotConstraints,
          }
        : hydratedContext.taskMemory,
    };
  }

  private conversationHistory(task: AgentTask): Array<Record<string, unknown>> {
    return readSocialAgentConversationHistory(
      task,
      socialAgentContextTurnLimit(this.config),
    );
  }

  private nonEmptyRecordArray(
    value: unknown,
  ): Array<Record<string, unknown>> | null {
    if (!Array.isArray(value)) return null;
    const records = value.filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === 'object' && !Array.isArray(item)),
    );
    return records.length > 0 ? records : null;
  }

  private async recordRouteAndMemory(input: {
    ownerUserId: number;
    task: AgentTask;
    route: SocialAgentIntentRouterResult;
    message: string;
    longTermSnapshot: LongTermMemorySnapshot | null;
    workflowDecision?: SocialAgentWorkflowRouterDecision | null;
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
    if (input.workflowDecision) {
      this.metrics.recordWorkflowRoute(
        input.route.intent,
        input.workflowDecision.reason,
        { skipBrain: input.workflowDecision.skipBrain },
      );
    }
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
