import { Injectable } from '@nestjs/common';

import { cleanDisplayText } from '../common/display-text.util';
import { AgentTask } from './entities/agent-task.entity';
import type { LongTermMemorySnapshot } from './social-agent-long-term-memory.service';
import { readSocialAgentTaskMemory } from './social-agent-memory.util';

export interface SocialAgentMemoryContext {
  shortTerm: {
    recentTurns: Array<Record<string, unknown>>;
    lastAgentActions: Array<Record<string, unknown>>;
    lastUserMessages: Array<Record<string, unknown>>;
    lastToolResult: Record<string, unknown> | null;
    correctionActive: boolean;
    misunderstandingDetected: boolean;
    hasSearched: boolean;
    lastSearch: Record<string, unknown> | null;
    candidateCount: number;
    displayedCandidates: Array<Record<string, unknown>>;
  };
  taskMemory: {
    currentGoal: string;
    state: string;
    currentTask: {
      objective: string;
      nextStep: string;
      shouldSearchNow: boolean;
    };
    activeEntities: Record<string, unknown>;
    preferences: Record<string, unknown>;
    boundaries: Record<string, unknown>;
    stableProfileFacts: Record<string, unknown>;
    pendingActions: Array<Record<string, unknown>>;
  };
  longTerm: {
    preferences: Record<string, unknown>;
    boundaries: Record<string, unknown>;
    activityPreferences: Record<string, unknown>;
    profileFacts: Record<string, unknown>;
    socialGoals: string[];
    availability: string[];
    matchSignals: Record<string, unknown>;
    taskCount: number;
    updatedAt: string | null;
  } | null;
  retrievalHints: {
    shouldRecallProfile: boolean;
    shouldRecallConversation: boolean;
    shouldAvoidImmediateSearch: boolean;
    missingProfileFields: string[];
  };
}

@Injectable()
export class SocialAgentMemoryContextService {
  build(input: {
    task: AgentTask;
    conversationHistory: Array<Record<string, unknown>>;
    longTermSnapshot: LongTermMemorySnapshot | null;
  }): SocialAgentMemoryContext {
    const taskMemory = readSocialAgentTaskMemory(input.task);
    const shortTerm = this.isRecord(input.task.memory?.shortTerm)
      ? input.task.memory.shortTerm
      : {};
    const brain = this.isRecord(input.task.memory?.conversationBrain)
      ? input.task.memory.conversationBrain
      : {};
    const recentTurns = input.conversationHistory.slice(-20).map((turn) => ({
      role: cleanDisplayText(turn.role, ''),
      text: cleanDisplayText(turn.text ?? turn.content, ''),
      intent: cleanDisplayText(turn.intent, ''),
      at: cleanDisplayText(turn.at, ''),
    }));
    const lastToolResult = this.isRecord(brain.lastToolResult)
      ? brain.lastToolResult
      : null;
    const candidateList = Array.isArray(shortTerm.candidates)
      ? shortTerm.candidates
      : [];
    const displayedCandidates = Array.isArray(shortTerm.displayedCandidates)
      ? shortTerm.displayedCandidates.filter((item): item is Record<string, unknown> =>
          this.isRecord(item),
        )
      : candidateList.filter((item): item is Record<string, unknown> =>
          this.isRecord(item),
        );
    const correctionActive =
      cleanDisplayText(brain.conversationMode, '') === 'profile_correction' ||
      (Array.isArray(brain.notes) &&
        brain.notes.some((note) =>
          cleanDisplayText(note, '').includes('repair'),
        ));

    return {
      shortTerm: {
        recentTurns: this.shortTermTurns(shortTerm, recentTurns),
        lastAgentActions: this.recordList(shortTerm.lastAgentActions),
        lastUserMessages: taskMemory.lastUserMessages,
        lastToolResult,
        correctionActive,
        misunderstandingDetected:
          shortTerm.misunderstandingDetected === true || correctionActive,
        hasSearched: shortTerm.hasSearched === true,
        lastSearch:
          shortTerm.hasSearched === true
            ? {
                intent: cleanDisplayText(shortTerm.lastSearchIntent, ''),
                at: cleanDisplayText(shortTerm.lastSearchAt, ''),
                candidateCount:
                  typeof shortTerm.lastSearchCandidateCount === 'number'
                    ? shortTerm.lastSearchCandidateCount
                    : displayedCandidates.length,
              }
            : null,
        candidateCount: candidateList.length || displayedCandidates.length,
        displayedCandidates,
      },
      taskMemory: {
        currentGoal: taskMemory.currentGoal,
        state: taskMemory.currentTask.state,
        currentTask: taskMemory.currentTask,
        activeEntities: taskMemory.activeEntities,
        preferences: taskMemory.preferences,
        boundaries: taskMemory.boundaries,
        stableProfileFacts: taskMemory.stableProfileFacts,
        pendingActions: taskMemory.pendingActions,
      },
      longTerm: input.longTermSnapshot
        ? {
            preferences: input.longTermSnapshot.preferences,
            boundaries: input.longTermSnapshot.boundaries,
            activityPreferences: input.longTermSnapshot.activityPreferences,
            profileFacts: input.longTermSnapshot.profileFacts,
            socialGoals: input.longTermSnapshot.socialGoals,
            availability: input.longTermSnapshot.availability,
            matchSignals: input.longTermSnapshot.matchSignals,
            taskCount: input.longTermSnapshot.taskCount,
            updatedAt: input.longTermSnapshot.updatedAt,
          }
        : null,
      retrievalHints: {
        shouldRecallProfile: this.shouldRecallProfile(recentTurns),
        shouldRecallConversation: this.shouldRecallConversation(recentTurns),
        shouldAvoidImmediateSearch:
          taskMemory.currentTask.shouldSearchNow === false &&
          taskMemory.currentTask.objective === 'profile_enrichment',
        missingProfileFields: this.missingProfileFields(
          taskMemory.stableProfileFacts,
        ),
      },
    };
  }

  private shouldRecallProfile(turns: Array<Record<string, unknown>>): boolean {
    const latest = cleanDisplayText(turns.at(-1)?.text, '');
    return /(画像|偏好|我是什么|我之前|刚才|上面|完善)/i.test(latest);
  }

  private shortTermTurns(
    shortTerm: Record<string, unknown>,
    fallback: Array<Record<string, unknown>>,
  ): Array<Record<string, unknown>> {
    const stored = this.recordList(shortTerm.recentTurns);
    return stored.length > 0 ? stored.slice(-20) : fallback;
  }

  private recordList(value: unknown): Array<Record<string, unknown>> {
    return Array.isArray(value)
      ? value.filter((item): item is Record<string, unknown> =>
          this.isRecord(item),
        )
      : [];
  }

  private shouldRecallConversation(turns: Array<Record<string, unknown>>): boolean {
    const latest = cleanDisplayText(turns.at(-1)?.text, '');
    return /(刚才|上面|之前|不是不是|我的意思|你理解错)/i.test(latest);
  }

  private missingProfileFields(
    facts: Record<string, string | string[]>,
  ): string[] {
    const required = [
      'city',
      'nearbyArea',
      'interestTags',
      'availableTimes',
      'targetPreference',
      'privacyBoundary',
    ];
    return required.filter((key) => {
      const value = facts[key];
      return Array.isArray(value) ? value.length === 0 : !value;
    });
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }
}
