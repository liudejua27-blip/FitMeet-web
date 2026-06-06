import { Injectable, Logger, Optional } from '@nestjs/common';

import { cleanDisplayText } from '../common/display-text.util';
import { AgentTask } from './entities/agent-task.entity';
import { hasSocialAgentSearchContext } from './social-agent-candidate-context.presenter';
import { readSocialAgentStoredCandidateSummaries } from './social-agent-chat-session.presenter';
import type { SocialAgentRouteMessageBody } from './social-agent-chat.types';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import type { LongTermMemorySnapshot } from './social-agent-long-term-memory.service';
import {
  SocialAgentMemoryContext,
  SocialAgentMemoryContextService,
} from './social-agent-memory-context.service';
import { readSocialAgentConversationHistory } from './social-agent-chat-memory.presenter';
import { readSocialAgentTaskMemory } from './social-agent-memory.util';
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
  ) {}

  buildTaskContext(input: {
    task: AgentTask;
    body: SocialAgentRouteMessageBody;
    longTermSnapshot?: LongTermMemorySnapshot | null;
    memoryContext?: SocialAgentMemoryContext | null;
  }): Record<string, unknown> {
    const candidates = readSocialAgentStoredCandidateSummaries(input.task);
    const result = this.isRecord(input.task.result) ? input.task.result : {};
    const chatRun = this.isRecord(result.chatRun) ? result.chatRun : {};
    const hasSearchContext = hasSocialAgentSearchContext(input.task);
    const taskMemory = readSocialAgentTaskMemory(input.task);
    return {
      taskId: input.task.id,
      taskType: input.task.taskType,
      status: input.task.status,
      agentState: taskMemory.currentTask.state,
      currentTask: taskMemory.currentTask,
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
  ): SocialAgentMemoryContext | null {
    return (
      this.memoryContext?.build({
        task,
        conversationHistory: readSocialAgentConversationHistory(task),
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
}
