import { Injectable, Optional } from '@nestjs/common';

import { cleanDisplayText } from '../common/display-text.util';
import { REDACTED_VALUE, redactSensitiveValue } from '../common/privacy-redaction.util';
import { readSocialAgentConversationHistory } from './social-agent-chat-memory.presenter';
import type { AgentTask } from './entities/agent-task.entity';
import { SocialAgentLongTermMemoryService } from './social-agent-long-term-memory.service';
import {
  readSocialAgentTaskMemory,
  type SocialAgentTaskMemory,
} from './social-agent-memory.util';
import { SocialAgentTaskLifecycleService } from './social-agent-task-lifecycle.service';
import { SocialAgentTaskMemoryStateMachineService } from './social-agent-task-memory-state-machine.service';
import { parseSocialAgentThreadTaskId } from './social-agent-thread-id.util';
import { SocialCodexLifeGraphGovernanceService } from './social-codex-life-graph-governance.service';

type SocialAgentHydratedContext = {
  userId: number;
  threadId: string | number | null;
  taskId: number | null;
  recentMessages: Array<Record<string, unknown>>;
  taskMemory: SocialAgentTaskMemory | null;
  taskSlots: ReturnType<SocialAgentTaskMemoryStateMachineService['readSlots']>;
  lifeGraphFactProposals: ReturnType<
    SocialCodexLifeGraphGovernanceService['proposeStableFactsFromSlots']
  >;
  lifeGraphFactDisplaySummaries: ReturnType<
    SocialCodexLifeGraphGovernanceService['toUserVisibleFactSummaries']
  >;
  lifeGraphGovernanceSummary: ReturnType<
    SocialCodexLifeGraphGovernanceService['summarizeFactProposals']
  >;
  lifeGraphSummary: Record<string, unknown> | null;
  pendingApprovals: SocialAgentTaskMemory['pendingActions'];
  candidateActions: SocialAgentTaskMemory['candidateState'] | null;
};

@Injectable()
export class SocialAgentContextHydratorService {
  constructor(
    private readonly taskLifecycle: SocialAgentTaskLifecycleService,
    private readonly slots: SocialAgentTaskMemoryStateMachineService,
    @Optional()
    private readonly longTerm?: SocialAgentLongTermMemoryService,
    @Optional()
    private readonly lifeGraphGovernance?: SocialCodexLifeGraphGovernanceService,
  ) {}

  async hydrateContext(input: {
    userId: number;
    threadId?: string | number | null;
    taskId?: number | null;
  }): Promise<SocialAgentHydratedContext> {
    const task = await this.resolveTask(input);
    const longTerm = await this.longTerm
      ?.readSnapshot(input.userId)
      .catch(() => null);
    const taskMemory = task ? readSocialAgentTaskMemory(task) : null;
    const taskSlots = task ? this.slots.readSlots(task) : {};
    const lifeGraphFactProposals =
      this.lifeGraphGovernance?.proposeStableFactsFromSlots(taskSlots) ?? [];
    const lifeGraphGovernanceSummary =
      this.lifeGraphGovernance?.summarizeFactProposals(
        lifeGraphFactProposals,
      ) ?? {
        total: lifeGraphFactProposals.length,
        autoSaveCount: 0,
        confirmationRequiredCount: 0,
        blockedCount: 0,
        sensitiveCount: 0,
        expiringFactKeys: [],
      };
    const lifeGraphFactDisplaySummaries =
      this.lifeGraphGovernance?.toUserVisibleFactSummaries(
        lifeGraphFactProposals,
      ) ?? [];
    return {
      userId: input.userId,
      threadId: input.threadId ?? task?.id ?? null,
      taskId: task?.id ?? null,
      recentMessages: task
        ? this.sanitizeRecentMessages(readSocialAgentConversationHistory(task, 40))
        : [],
      taskMemory: taskMemory ? this.sanitizeTaskMemory(taskMemory) : null,
      taskSlots: this.sanitizeContextValue(taskSlots) as typeof taskSlots,
      lifeGraphFactProposals: this.sanitizeContextValue(
        lifeGraphFactProposals,
      ) as typeof lifeGraphFactProposals,
      lifeGraphFactDisplaySummaries: this.sanitizeContextValue(
        lifeGraphFactDisplaySummaries,
      ) as typeof lifeGraphFactDisplaySummaries,
      lifeGraphGovernanceSummary,
      lifeGraphSummary: longTerm
        ? this.sanitizeContextValue({
            profileFacts: longTerm.profileFacts,
            preferences: longTerm.preferences,
            boundaries: longTerm.boundaries,
            availability: longTerm.availability,
            activityPreferences: longTerm.activityPreferences,
          }) as Record<string, unknown>
        : null,
      pendingApprovals: taskMemory
        ? (this.sanitizeContextValue(
            taskMemory.pendingActions,
          ) as SocialAgentTaskMemory['pendingActions'])
        : [],
      candidateActions: taskMemory
        ? (this.sanitizeContextValue(
            taskMemory.candidateState,
          ) as SocialAgentTaskMemory['candidateState'])
        : null,
    };
  }

  private async resolveTask(input: {
    userId: number;
    threadId?: string | number | null;
    taskId?: number | null;
  }): Promise<AgentTask | null> {
    const taskId = this.positiveNumber(input.taskId ?? input.threadId);
    if (!taskId) return null;
    return this.taskLifecycle.assertTaskOwner(taskId, input.userId);
  }

  private positiveNumber(value: unknown): number | null {
    return parseSocialAgentThreadTaskId(value);
  }

  private sanitizeRecentMessages(
    turns: Array<Record<string, unknown>>,
  ): Array<Record<string, unknown>> {
    return turns
      .map((turn) => this.sanitizeContextValue(turn))
      .filter((turn): turn is Record<string, unknown> => this.isRecord(turn));
  }

  private sanitizeTaskMemory(
    memory: SocialAgentTaskMemory,
  ): SocialAgentTaskMemory {
    return this.sanitizeContextValue({
      currentGoal: memory.currentGoal,
      activeEntities: memory.activeEntities,
      preferences: memory.preferences,
      boundaries: memory.boundaries,
      candidateState: memory.candidateState,
      activityState: memory.activityState,
      pendingActions: memory.pendingActions,
      lastUserMessages: memory.lastUserMessages,
      currentTask: memory.currentTask,
      stableProfileFacts: memory.stableProfileFacts,
      updatedAt: memory.updatedAt,
    }) as SocialAgentTaskMemory;
  }

  private sanitizeContextValue(
    value: unknown,
    keyHint = '',
    depth = 0,
  ): unknown {
    const redacted = redactSensitiveValue(value, keyHint);
    if (redacted == null) return redacted;
    if (typeof redacted === 'string') {
      if (redacted === REDACTED_VALUE) return redacted;
      const clean = cleanDisplayText(redacted, '').trim();
      return clean ? clean.slice(0, 500) : REDACTED_VALUE;
    }
    if (
      typeof redacted === 'number' ||
      typeof redacted === 'boolean'
    ) {
      return redacted;
    }
    if (Array.isArray(redacted)) {
      if (depth >= 4) return [];
      return redacted
        .slice(0, 40)
        .map((item) => this.sanitizeContextValue(item, keyHint, depth + 1))
        .filter((item) => item !== undefined);
    }
    if (typeof redacted === 'object') {
      if (depth >= 4) return '[Object]';
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(
        redacted as Record<string, unknown>,
      ).slice(0, 40)) {
        const next = this.sanitizeContextValue(item, key, depth + 1);
        if (next !== undefined) out[key] = next;
      }
      return out;
    }
    return redacted;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
