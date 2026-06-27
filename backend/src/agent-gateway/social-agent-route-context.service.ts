import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { cleanDisplayText } from '../common/display-text.util';
import { AgentTask } from './entities/agent-task.entity';
import { socialAgentLlmContextTurnLimit } from './social-agent-context-window';
import { hasSocialAgentSearchContext } from './social-agent-candidate-context.presenter';
import { readSocialAgentStoredCandidateSummaries } from './social-agent-chat-session.presenter';
import type { SocialAgentRouteMessageBody } from './social-agent-chat.types';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import type { LongTermMemorySnapshot } from './social-agent-long-term-memory.service';
import {
  SocialAgentMemoryContext,
  SocialAgentMemoryContextService,
} from './social-agent-memory-context.service';
import {
  readSocialAgentConversationHistory,
  summarizeSocialAgentTaskMemoryForLlm,
} from './social-agent-chat-memory.presenter';
import type { SocialAgentHydratedContext } from './social-agent-context-hydrator.service';
import { buildSocialAgentKnownTaskSlotConstraints } from './social-agent-task-slot-constraints.presenter';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import { SocialAgentRagService } from './social-agent-rag.service';

@Injectable()
export class SocialAgentRouteContextService {
  private readonly logger = new Logger(SocialAgentRouteContextService.name);

  constructor(
    private readonly metrics: SocialAgentMetricsService,
    private readonly rag: SocialAgentRagService,
    @Optional()
    private readonly memoryContext?: SocialAgentMemoryContextService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  buildTaskContext(input: {
    task: AgentTask;
    body: SocialAgentRouteMessageBody;
    longTermSnapshot?: LongTermMemorySnapshot | null;
    memoryContext?: SocialAgentMemoryContext | null;
    hydratedContext?: SocialAgentHydratedContext | null;
  }): Record<string, unknown> {
    const hydrated = input.hydratedContext ?? null;
    const candidates = readSocialAgentStoredCandidateSummaries(input.task);
    const result = this.isRecord(input.task.result) ? input.task.result : {};
    const chatRun = this.isRecord(result.chatRun) ? result.chatRun : {};
    const hasSearchContext = hasSocialAgentSearchContext(input.task);
    const taskMemory = summarizeSocialAgentTaskMemoryForLlm(input.task);
    const taskSlots =
      this.nonEmptyRecord(hydrated?.taskSlots) ??
      this.nonEmptyRecord(taskMemory.taskSlots) ??
      hydrated?.taskSlots ??
      taskMemory.taskSlots;
    const knownTaskSlotConstraints =
      this.nonEmptyKnownTaskSlotConstraints(
        hydrated?.knownTaskSlotConstraints,
      ) ??
      this.nonEmptyKnownTaskSlotConstraints(
        taskMemory.knownTaskSlotConstraints,
      ) ??
      buildSocialAgentKnownTaskSlotConstraints(
        this.isRecord(taskSlots) ? taskSlots : null,
      );
    const recentMessages =
      this.nonEmptyRecordArray(hydrated?.recentMessages) ??
      readSocialAgentConversationHistory(
        input.task,
        socialAgentLlmContextTurnLimit(this.config, 'router'),
      );
    const taskSlotSummary =
      this.nonEmptyRecord(hydrated?.taskSlotSummary) ??
      this.nonEmptyRecord(taskMemory.taskSlotSummary) ??
      hydrated?.taskSlotSummary ??
      taskMemory.taskSlotSummary;
    const pendingApprovals =
      this.nonEmptyArray(hydrated?.pendingApprovals) ??
      this.nonEmptyArray(taskMemory.pendingApprovals) ??
      this.nonEmptyArray(taskMemory.pendingActions) ??
      hydrated?.pendingApprovals ??
      taskMemory.pendingApprovals ??
      taskMemory.pendingActions;
    const candidateActions =
      this.nonEmptyRecord(hydrated?.candidateActions) ??
      this.nonEmptyRecord(taskMemory.candidateActions) ??
      this.nonEmptyRecord(taskMemory.candidateState) ??
      hydrated?.candidateActions ??
      taskMemory.candidateActions ??
      taskMemory.candidateState;
    return {
      taskId: input.task.id,
      taskType: input.task.taskType,
      status: input.task.status,
      agentState: this.stringValue(
        this.isRecord(taskMemory.currentTask)
          ? taskMemory.currentTask.state
          : null,
      ),
      currentGoal: taskMemory.currentGoal,
      currentTask: taskMemory.currentTask,
      taskMemory,
      taskSlots,
      taskSlotSummary,
      knownTaskSlotConstraints,
      preferences: taskMemory.preferences,
      boundaries: taskMemory.boundaries,
      activeEntities: taskMemory.activeEntities,
      recentMessages,
      conversationHistory: recentMessages,
      threadId: hydrated?.threadId ?? null,
      hydratedTaskId: hydrated?.taskId ?? input.task.id,
      lifeGraphSummary:
        this.nonEmptyRecord(hydrated?.lifeGraphSummary) ??
        this.nonEmptyRecord(taskMemory.lifeGraphSummary) ??
        hydrated?.lifeGraphSummary ??
        null,
      lifeGraphGovernanceSummary: hydrated?.lifeGraphGovernanceSummary ?? null,
      lifeGraphFactDisplaySummaries:
        hydrated?.lifeGraphFactDisplaySummaries ?? [],
      pendingApprovals,
      candidateActions,
      candidateState: taskMemory.candidateState,
      activityState: taskMemory.activityState,
      pendingOpportunityDraft: taskMemory.pendingOpportunityDraft,
      pendingActions: taskMemory.pendingActions,
      stableProfileFacts: taskMemory.stableProfileFacts,
      lastUserMessages: taskMemory.lastUserMessages,
      lastSearch: taskMemory.lastSearch,
      goal: input.task.goal,
      hasSearchContext,
      hasCandidates: input.body.hasCandidates === true || candidates.length > 0,
      candidateCount:
        candidates.length || this.number(chatRun.candidateCount) || 0,
      socialRequestId: this.number(chatRun.socialRequestId) ?? null,
      longTermSignals: input.longTermSnapshot
        ? {
            taskCount: input.longTermSnapshot.taskCount,
            profileFacts: input.longTermSnapshot.profileFacts,
            preferences: input.longTermSnapshot.preferences,
            boundaries: input.longTermSnapshot.boundaries,
            socialGoals: input.longTermSnapshot.socialGoals,
            availability: input.longTermSnapshot.availability,
            activityPreferences: input.longTermSnapshot.activityPreferences,
            matchSignals: input.longTermSnapshot.matchSignals,
          }
        : null,
      memoryContext: input.memoryContext ?? null,
    };
  }

  buildMemoryContext(
    task: AgentTask,
    longTermSnapshot: LongTermMemorySnapshot | null,
    hydratedContext?: SocialAgentHydratedContext | null,
  ): SocialAgentMemoryContext | null {
    const conversationHistory =
      this.nonEmptyRecordArray(hydratedContext?.recentMessages) ??
      readSocialAgentConversationHistory(
        task,
        socialAgentLlmContextTurnLimit(this.config, 'ordinary_chat'),
      );
    return (
      this.memoryContext?.build({
        task,
        conversationHistory,
        longTermSnapshot,
      }) ?? null
    );
  }

  async applyRagContext(input: {
    task: AgentTask;
    route: SocialAgentIntentRouterResult;
    message: string;
    longTermSnapshot: LongTermMemorySnapshot | null;
  }): Promise<void> {
    const startedAt = Date.now();
    try {
      const context = await this.rag.retrieve({
        intent: input.route.intent,
        ownerUserId: input.task.ownerUserId,
        message: input.message,
        activityType: input.route.entities?.activityType,
        longTermSnapshot: input.longTermSnapshot,
      });
      this.metrics.recordLatency('rag_retrieve', Date.now() - startedAt);
      if (context.retrievedKinds.length === 0) return;
      const root = this.isRecord(input.task.memory) ? input.task.memory : {};
      input.task.memory = {
        ...root,
        lastRagContext: {
          intent: context.intent,
          retrievedKinds: context.retrievedKinds,
          safetySop: context.safetySop,
          openingTemplates: context.openingTemplates,
          activitySop: context.activitySop,
          successfulMatchCases: context.successfulMatchCases,
          userMemorySummary: context.userMemorySummary,
          retrievedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.metrics.recordError('rag_retrieve_failed');
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.rag.retrieve_failed',
          intent: input.route.intent,
          ownerUserId: input.task.ownerUserId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private number(value: unknown): number | null {
    const text = cleanDisplayText(value, '');
    const num = Number(text || value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }

  private stringValue(value: unknown): string {
    return cleanDisplayText(value, '');
  }

  private nonEmptyKnownTaskSlotConstraints(
    value: unknown,
  ): Record<string, unknown> | null {
    if (!this.isRecord(value)) return null;
    const knownSlots = Array.isArray(value.knownSlots) ? value.knownSlots : [];
    const doNotAskAgainFor = Array.isArray(value.doNotAskAgainFor)
      ? value.doNotAskAgainFor
      : [];
    const userVisibleSummary = cleanDisplayText(value.userVisibleSummary, '');
    return knownSlots.length || doNotAskAgainFor.length || userVisibleSummary
      ? value
      : null;
  }

  private nonEmptyRecord(value: unknown): Record<string, unknown> | null {
    if (!this.isRecord(value)) return null;
    return this.hasSubstantiveValue(value) ? value : null;
  }

  private nonEmptyArray<T = unknown>(value: unknown): T[] | null {
    return Array.isArray(value) && value.length > 0 ? (value as T[]) : null;
  }

  private nonEmptyRecordArray(
    value: unknown,
  ): Array<Record<string, unknown>> | null {
    if (!Array.isArray(value)) return null;
    const records = value.filter((item): item is Record<string, unknown> =>
      this.isRecord(item),
    );
    return records.length > 0 ? records : null;
  }

  private hasSubstantiveValue(value: unknown): boolean {
    if (Array.isArray(value)) return value.length > 0;
    if (this.isRecord(value)) {
      return Object.keys(value).some((key) =>
        this.hasSubstantiveValue(value[key]),
      );
    }
    return cleanDisplayText(value, '') !== '';
  }
}
