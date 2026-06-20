import { Injectable, Logger, Optional } from '@nestjs/common';

import { cleanDisplayText } from '../common/display-text.util';
import {
  readSocialAgentConversationBrainDecision,
  readSocialAgentCurrentAgentState,
  socialAgentFinalResponseSafetyRules,
} from './social-agent-chat-brain-memory.presenter';
import {
  buildSocialAgentLlmConversationHistory,
  summarizeSocialAgentTaskMemoryForLlm,
} from './social-agent-chat-memory.presenter';
import type { SocialAgentActivityResult } from './social-agent-chat.types';
import type { AgentTask } from './entities/agent-task.entity';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import { SocialAgentCandidatePoolService } from './social-agent-candidate-pool.service';
import { SocialAgentFinalResponseService } from './social-agent-final-response.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import {
  readSocialAgentTaskMemory,
  recordSocialAgentRecommendedCandidates,
  recordSocialAgentSearchMemory,
  transitionSocialAgentState,
} from './social-agent-memory.util';

@Injectable()
export class SocialAgentActivitySearchService {
  private readonly logger = new Logger(SocialAgentActivitySearchService.name);

  constructor(
    private readonly candidatePool: SocialAgentCandidatePoolService,
    private readonly metrics: SocialAgentMetricsService,
    @Optional()
    private readonly finalResponses?: SocialAgentFinalResponseService,
  ) {}

  async handleActivitySearch(input: {
    ownerUserId: number;
    task: AgentTask;
    route: SocialAgentIntentRouterResult;
    message: string;
    buildMemoryContext: (task: AgentTask) => unknown;
    taskContext?: Record<string, unknown>;
  }): Promise<{
    activityResults: SocialAgentActivityResult[];
    assistantMessage: string;
  }> {
    const activityResults = await this.searchActivityResults(
      input.ownerUserId,
      input.task,
      input.route,
      input.message,
      input.taskContext,
    );
    this.metrics.recordActivitySearch(
      activityResults.length > 0,
      activityResults.length,
    );
    recordSocialAgentSearchMemory(input.task, {
      intent: 'activity_search',
      candidates: activityResults.map((activity) => ({
        id: activity.id,
        title: activity.title,
        city: activity.city,
        requestType: activity.requestType,
        matchScore: activity.matchScore,
      })),
      candidateCount: activityResults.length,
      emptyReason:
        activityResults.length === 0 ? 'no_real_candidates' : null,
      nextStep:
        activityResults.length > 0
          ? '等待用户选择活动或继续筛选'
          : '换城市、时间或活动类型，或确认发布约练卡到发现',
    });
    transitionSocialAgentState(input.task, 'activity_search_returned', {
      objective: 'activity_search',
      nextStep:
        activityResults.length > 0
          ? '等待用户选择活动或继续筛选'
          : '等待用户调整活动条件',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor:
        activityResults.length > 0 ? 'activity_selection' : 'search_refinement',
      lastCompletedStep: 'activity_search_completed',
    });
    if (activityResults.length > 0) {
      this.rememberActivityResultsInTaskMemory(input.task, activityResults);
    }
    const fallbackReply =
      activityResults.length > 0
        ? `已为你找到 ${activityResults.length} 条公开约练/活动意向，先放在下方卡片里。如果都不合适，告诉我"再找几条"或换个时间/活动，我再补搜候选人。`
        : '当前没有找到符合条件的真实活动或公开约练卡片。我不会编造活动；你可以换个城市、时间或活动类型再试，也可以确认发布约练卡到发现，让合适的人主动回应。';
    const assistantMessage = await this.generateActivitySearchAssistantMessage({
      task: input.task,
      message: input.message,
      route: input.route,
      activityResults,
      fallbackReply,
      buildMemoryContext: input.buildMemoryContext,
      taskContext: input.taskContext,
    });
    return { activityResults, assistantMessage };
  }

  private async searchActivityResults(
    ownerUserId: number,
    task: AgentTask,
    route: SocialAgentIntentRouterResult,
    message: string,
    taskContext?: Record<string, unknown>,
  ): Promise<SocialAgentActivityResult[]> {
    try {
      const criteria = resolveActivitySearchCriteria(task, route, taskContext);
      const result = await this.candidatePool.searchActivity({
        ownerUserId,
        taskId: task.id,
        city: criteria.city,
        activityType: criteria.activityType,
        locationPreference: criteria.locationPreference,
        timePreference: criteria.timePreference,
        rawText: message,
        limit: 5,
      });
      return result.activityResults.map((activity) => ({
        id: activity.id,
        source: activity.source === 'activity' ? 'activity' : 'public_intent',
        isRealData: activity.isRealData,
        activityId: activity.activityId,
        publicIntentId: activity.publicIntentId,
        title: activity.title,
        description: activity.description,
        city: activity.city,
        loc: activity.loc,
        requestType: activity.requestType,
        interestTags: activity.interestTags,
        timePreference: activity.timePreference,
        ownerUserId: activity.ownerUserId,
        status: activity.status,
        createdAt: activity.createdAt,
        matchScore: activity.matchScore,
        matchReasons: activity.matchReasons,
      }));
    } catch (error) {
      this.metrics.recordError('activity_search_failed');
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.activity_search.failed',
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return [];
    }
  }

  private async generateActivitySearchAssistantMessage(input: {
    task: AgentTask;
    message: string;
    route: SocialAgentIntentRouterResult;
    activityResults: SocialAgentActivityResult[];
    fallbackReply: string;
    buildMemoryContext: (task: AgentTask) => unknown;
    taskContext?: Record<string, unknown>;
  }): Promise<string> {
    if (!this.finalResponses) return input.fallbackReply;
    return this.finalResponses.generate({
      userMessage: input.message,
      intent: input.route.intent,
      route: input.route as unknown as Record<string, unknown>,
      agentState: readSocialAgentCurrentAgentState(input.task),
      conversationHistory:
        readConversationHistoryFromTaskContext(input.taskContext) ??
        buildSocialAgentLlmConversationHistory(input.task),
      memoryContext: input.buildMemoryContext(input.task) as Record<
        string,
        unknown
      >,
      taskContext:
        input.taskContext ?? summarizeSocialAgentTaskMemoryForLlm(input.task),
      plannerDecision: readSocialAgentConversationBrainDecision(input.task),
      toolResults: [
        {
          tool: 'search_public_intents',
          success: true,
          resultCount: input.activityResults.length,
        },
      ],
      searchResults: {
        activityResults: input.activityResults,
        emptyReason:
          input.activityResults.length === 0 ? 'no_real_candidates' : null,
      },
      safetyRules: socialAgentFinalResponseSafetyRules(),
      responseGoal:
        input.activityResults.length > 0
          ? '自然说明已找到真实活动或公开意向，并引导用户选择或继续筛选。'
          : '自然说明没有找到真实活动或公开意向，并建议调整城市、时间或活动类型。',
      fallbackReply: input.fallbackReply,
    });
  }

  private rememberActivityResultsInTaskMemory(
    task: AgentTask,
    results: SocialAgentActivityResult[],
  ): void {
    const ids = results
      .map((item) => item.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (ids.length === 0) return;
    const memory = readSocialAgentTaskMemory(task);
    const merged: string[] = [];
    for (const value of [...memory.activityState.recommendedIds, ...ids]) {
      if (!merged.includes(value)) merged.push(value);
    }
    memory.activityState.recommendedIds = merged.slice(-40);
    const ownerIds = results
      .map((item) => item.ownerUserId)
      .filter(
        (id): id is number =>
          typeof id === 'number' && Number.isFinite(id) && id > 0,
      );
    const root =
      task.memory &&
      typeof task.memory === 'object' &&
      !Array.isArray(task.memory)
        ? (task.memory as Record<string, unknown>)
        : {};
    task.memory = {
      ...root,
      taskMemory: { ...memory, updatedAt: new Date().toISOString() },
    };
    if (ownerIds.length > 0) {
      recordSocialAgentRecommendedCandidates(task, ownerIds);
    }
  }
}

function resolveActivitySearchCriteria(
  task: AgentTask,
  route: SocialAgentIntentRouterResult,
  taskContext?: Record<string, unknown>,
): {
  city: string;
  activityType: string;
  locationPreference: string;
  timePreference: string;
} {
  const slots = {
    ...readActivitySearchTaskSlotValues(task),
    ...readActivitySearchTaskContextSlotValues(taskContext),
  };
  const locationPreference =
    cleanDisplayText(route.entities.locationPreference, '') ||
    slots.location_text ||
    '';
  return {
    city:
      cleanDisplayText(route.entities.city, '') ||
      inferActivitySearchCity(slots.geo_area || locationPreference),
    activityType:
      cleanDisplayText(route.entities.activityType, '') || slots.activity || '',
    locationPreference,
    timePreference:
      cleanDisplayText(route.entities.timePreference, '') ||
      slots.time_window ||
      '',
  };
}

function readConversationHistoryFromTaskContext(
  taskContext?: Record<string, unknown>,
): Array<Record<string, unknown>> | null {
  const history = taskContext?.conversationHistory ?? taskContext?.recentMessages;
  if (!Array.isArray(history)) return null;
  const records = history.filter((item): item is Record<string, unknown> =>
    isRecord(item),
  );
  return records.length > 0 ? records : null;
}

function readActivitySearchTaskContextSlotValues(
  taskContext?: Record<string, unknown>,
): Record<string, string> {
  const directSlots = readActivitySlotValuesFromRecord(
    isRecord(taskContext?.taskSlots) ? taskContext.taskSlots : {},
  );
  const constraints = isRecord(taskContext?.knownTaskSlotConstraints)
    ? taskContext.knownTaskSlotConstraints
    : {};
  return {
    ...readActivitySlotValuesFromKnownConstraints(constraints),
    ...directSlots,
  };
}

function readActivitySearchTaskSlotValues(task: AgentTask): Record<string, string> {
  const memory = readSocialAgentTaskMemory(task);
  const taskSlots = isRecord(memory.taskSlots) ? memory.taskSlots : {};
  return {
    ...readActivitySlotValuesFromRecord(taskSlots),
    ...readActivitySlotValuesFromKnownConstraints(
      isRecord(memory.knownTaskSlotConstraints)
        ? memory.knownTaskSlotConstraints
        : {},
    ),
  };
}

function readActivitySlotValuesFromRecord(
  taskSlots: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, slot] of Object.entries(taskSlots)) {
    if (!isRecord(slot)) continue;
    if (!isActivitySearchSlotUsable(key, slot)) continue;
    const value = cleanDisplayText(slot.value, '');
    if (value) out[key] = value;
  }
  return out;
}

function readActivitySlotValuesFromKnownConstraints(
  constraints: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  const knownSlots = Array.isArray(constraints['knownSlots'])
    ? constraints['knownSlots']
    : [];
  const doNotAskAgainFor = Array.isArray(constraints['doNotAskAgainFor'])
    ? new Set(
        constraints['doNotAskAgainFor']
          .map((key) => cleanDisplayText(key, ''))
          .filter(Boolean),
      )
    : new Set<string>();
  for (const rawSlot of knownSlots) {
    if (!isRecord(rawSlot)) continue;
    const key = cleanDisplayText(rawSlot.key, '');
    if (!key || out[key]) continue;
    const value = cleanDisplayText(rawSlot.value, '');
    if (!value) continue;
    const state = cleanDisplayText(rawSlot.state, '');
    if (
      !doNotAskAgainFor.has(key) &&
      !['answered', 'confirmed', 'completed', 'modified'].includes(state)
    ) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function isActivitySearchSlotUsable(
  key: string,
  slot: Record<string, unknown>,
): boolean {
  const value = cleanDisplayText(slot.value, '');
  if (!value) return false;
  const state = cleanDisplayText(slot.state, '');
  const source = cleanDisplayText(slot.source, '');
  if (state === 'missing') return false;
  if (key === 'geo_area') return true;
  if (
    (key === 'activity' || key === 'time_window' || key === 'location_text') &&
    (state === 'inferred' || source === 'inferred')
  ) {
    return false;
  }
  return true;
}

function inferActivitySearchCity(value: string): string {
  const text = cleanDisplayText(value, '');
  if (!text) return '';
  if (
    /(青岛|崂山区|市南区|市北区|李沧区|黄岛区|青岛大学|五四广场|奥帆中心|石老人|浮山|麦岛|台东|栈桥)/.test(
      text,
    )
  ) {
    return '青岛';
  }
  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
