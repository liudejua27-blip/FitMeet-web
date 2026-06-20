import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import { LifeGraphService } from '../life-graph/life-graph.service';
import { AgentSelfImproveService } from './agent-self-improve.service';
import { AgentQualityEvaluatorService } from './agent-quality/agent-quality-evaluator.service';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { FitMeetAlphaAgentSdkService } from './fitmeet-alpha-agent-sdk.service';
import type { FitMeetAlphaTurnDecision } from './fitmeet-alpha-agent.types';
import { SocialAgentFinalResponseService } from './social-agent-final-response.service';
import {
  buildApprovalActions,
  buildRecommendationAssistantMessage,
} from './social-agent-chat-result.presenter';
import {
  buildSocialAgentLlmConversationHistory,
  summarizeSocialAgentTaskMemoryForLlm,
} from './social-agent-chat-memory.presenter';
import {
  readSocialAgentConversationBrainDecision,
  readSocialAgentCurrentAgentState,
  socialAgentFinalResponseSafetyRules,
} from './social-agent-chat-brain-memory.presenter';
import type {
  SocialAgentCandidateSearchResult,
  SocialAgentChatCandidate,
  SocialAgentChatRunResult,
  SocialAgentRequestDraft,
  SocialAgentVisibleStep,
  StreamEmit,
} from './social-agent-chat.types';
import {
  appendShortTermMemoryItem,
  recordSocialAgentSearchMemory,
  rememberSocialAgentShortTerm,
  transitionSocialAgentState,
} from './social-agent-memory.util';
import { TonePolicyService } from './response-quality/tone-policy.service';

@Injectable()
export class SocialAgentRecommendationResultService {
  private readonly logger = new Logger(
    SocialAgentRecommendationResultService.name,
  );
  private readonly fallbackAlphaAgent = new FitMeetAlphaAgentSdkService({
    get: () => undefined,
  } as never);

  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
    @Optional()
    private readonly finalResponses?: SocialAgentFinalResponseService,
    @Optional()
    private readonly lifeGraph?: LifeGraphService,
    @Optional()
    private readonly alphaAgent?: FitMeetAlphaAgentSdkService,
    @Optional()
    private readonly tonePolicy?: TonePolicyService,
    @Optional()
    private readonly agentQuality?: AgentQualityEvaluatorService,
    @Optional()
    private readonly selfImprove?: AgentSelfImproveService,
  ) {}

  async completeRecommendationResult(input: {
    ownerUserId: number;
    task: AgentTask;
    visibleSteps: SocialAgentVisibleStep[];
    draft: SocialAgentRequestDraft;
    candidates: SocialAgentChatCandidate[];
    searchResult: SocialAgentCandidateSearchResult;
    statusReason: string;
    emit?: StreamEmit;
    signal?: AbortSignal | null;
    alphaTurn?: FitMeetAlphaTurnDecision;
    buildMemoryContext: (task: AgentTask) => unknown;
    taskContext?: Record<string, unknown>;
    toEventDto: (event: AgentTaskEvent) => Record<string, unknown>;
  }): Promise<SocialAgentChatRunResult> {
    const {
      ownerUserId,
      task,
      visibleSteps,
      draft,
      candidates,
      searchResult,
      statusReason,
      emit,
      alphaTurn,
    } = input;
    task.status = AgentTaskStatus.AwaitingConfirmation;
    task.statusReason = statusReason;
    this.rememberShortTermCandidates(task, draft, candidates, searchResult);
    this.rememberShortTermStep(
      task,
      'awaiting_confirmation',
      '等待用户确认下一步动作',
      'awaiting_confirmation',
    );
    task.result = {
      ...(task.result ?? {}),
      chatRun: {
        socialRequestId: draft.socialRequestId ?? null,
        socialRequestDraft: this.safeDraftForEvent(draft),
        candidateCount: candidates.length,
        topCandidateUserId:
          candidates[0]?.candidateUserId ?? candidates[0]?.userId ?? null,
        emptyReason: searchResult.emptyReason,
        message: searchResult.message,
        debugReasons: searchResult.debugReasons,
        refreshedAt: new Date().toISOString(),
        statusReason,
      },
    };
    task.memory = {
      ...(task.memory ?? {}),
      socialAgentChat: {
        socialRequestId: draft.socialRequestId ?? null,
        socialRequestDraft: this.safeDraftForEvent(draft),
        candidates: candidates.map((candidate) => ({
          userId: candidate.userId,
          candidateUserId: candidate.candidateUserId ?? candidate.userId,
          socialRequestId: candidate.socialRequestId,
          candidateRecordId: candidate.candidateRecordId,
          score: candidate.score,
        })),
      },
    };
    await this.taskRepo.save(task);

    await this.writeEvent(
      task,
      AgentTaskEventType.SocialAgentCandidatesReturned,
      candidates.length > 0
        ? 'Social Agent 返回候选卡片'
        : 'Social Agent 返回空候选结果',
      {
        candidates,
        activityResults: candidates.filter(
          (candidate) =>
            candidate.source === 'public_intent' ||
            candidate.source === 'activity',
        ),
        socialRequestDraft: this.safeDraftForEvent(draft),
        candidateCount: candidates.length,
        emptyReason: searchResult.emptyReason,
        message: searchResult.message,
        createdAt: new Date().toISOString(),
      },
      AgentTaskEventActor.Agent,
    );

    const events = await this.eventRepo.find({
      where: { taskId: task.id, ownerUserId },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: 500,
    });
    const lifeGraphSignals = this.lifeGraph
      ? await this.lifeGraph
          .getUnifiedMatchSignals(ownerUserId)
          .catch(() => null)
      : null;
    const fallbackAssistantMessage =
      this.buildRecommendationFallbackAssistantMessage({
        draft,
        candidates,
        searchResult,
      });
    let assistantStreamed = false;
    const streamAssistantDelta = async (delta: string) => {
      if (!delta) return;
      assistantStreamed = true;
      await emit?.({
        type: 'assistant_delta',
        messageId: `agent-message:${task.id}`,
        delta,
        source: 'llm',
      });
    };
    const assistantMessage =
      this.tonePolicy?.safeAssistantMessage(
        await this.generateRecommendationAssistantMessage({
          task,
          draft,
          candidates,
          searchResult,
          fallbackReply: fallbackAssistantMessage,
          onDelta: emit ? streamAssistantDelta : undefined,
          signal: input.signal,
          buildMemoryContext: input.buildMemoryContext,
          taskContext: input.taskContext,
        }),
        fallbackAssistantMessage,
      ) ?? fallbackAssistantMessage;
    const approvalRequiredActions = buildApprovalActions(
      task.id,
      draft,
      candidates,
    );

    const resultCardInput = {
      taskId: task.id,
      socialRequestDraft: draft as unknown as Record<string, unknown>,
      candidates: candidates as unknown as Array<Record<string, unknown>>,
      approvalRequiredActions,
      safety: alphaTurn?.safety,
      traceId: alphaTurn?.traceId,
      lifeGraphSignals: lifeGraphSignals as Record<string, unknown> | null,
    };
    const result = {
      taskId: task.id,
      status: task.status,
      visibleSteps,
      assistantMessage,
      emptyReason: searchResult.emptyReason,
      message: searchResult.message,
      debugReasons: searchResult.debugReasons,
      socialRequestDraft: draft,
      candidates,
      approvalRequiredActions,
      events: events.map((event) => input.toEventDto(event)),
      cards: (
        this.alphaAgent ?? this.fallbackAlphaAgent
      ).buildResultCards(resultCardInput),
      safety: alphaTurn?.safety,
      traceId: alphaTurn?.traceId,
      agentTrace: alphaTurn?.agentTrace,
      structuredIntent: alphaTurn?.structuredIntent,
    };
    this.evaluateAgentQuality(result);
    if (assistantStreamed) {
      await emit?.({
        type: 'assistant_done',
        messageId: `agent-message:${task.id}`,
        source: 'llm',
      });
    }
    await emit?.({ type: 'result', result, assistantStreamed });
    return result;
  }

  private async generateRecommendationAssistantMessage(input: {
    task: AgentTask;
    draft: SocialAgentRequestDraft;
    candidates: SocialAgentChatCandidate[];
    searchResult: SocialAgentCandidateSearchResult;
    fallbackReply: string;
    onDelta?: (delta: string) => void | Promise<void>;
    signal?: AbortSignal | null;
    buildMemoryContext: (task: AgentTask) => unknown;
    taskContext?: Record<string, unknown>;
  }): Promise<string> {
    if (!this.finalResponses) return input.fallbackReply;
    return this.finalResponses.generate(
      {
        userMessage: cleanDisplayText(input.draft.rawText, input.task.goal),
        intent: 'candidate_search',
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
            tool: 'search_real_candidates',
            success: true,
            candidateCount: input.candidates.length,
            emptyReason: input.searchResult.emptyReason,
            message: input.searchResult.message,
            debugReasons: input.searchResult.debugReasons,
          },
        ],
        searchResults: {
          socialRequestDraft: this.safeDraftForEvent(input.draft),
          candidates: input.candidates.map((candidate) => ({
            userId: candidate.userId,
            candidateUserId: candidate.candidateUserId ?? candidate.userId,
            nickname: candidate.nickname,
            score: candidate.score,
            reasons: candidate.reasons,
            commonTags: candidate.commonTags,
            risk: candidate.risk,
            source: candidate.source,
          })),
          emptyReason: input.searchResult.emptyReason,
        },
        safetyRules: socialAgentFinalResponseSafetyRules(),
        responseGoal:
          input.candidates.length > 0
            ? '自然说明搜索结果，突出最相关候选人，并提醒下一步动作需要用户确认。'
            : '自然说明当前没有找到真实候选人，并给出放宽条件、补充信息或发布需求的下一步。',
        fallbackReply: input.fallbackReply,
      },
      {
        ...(input.onDelta ? { onDelta: input.onDelta } : {}),
        signal: input.signal,
      },
    );
  }

  private buildRecommendationFallbackAssistantMessage(input: {
    draft: SocialAgentRequestDraft;
    candidates: SocialAgentChatCandidate[];
    searchResult: SocialAgentCandidateSearchResult;
  }): string {
    if (input.candidates.length > 0) {
      return (
        input.searchResult.message ??
        buildRecommendationAssistantMessage(input.candidates)
      );
    }
    return this.buildEmptyCandidateFallbackMessage(
      input.draft,
      input.searchResult,
    );
  }

  private buildEmptyCandidateFallbackMessage(
    draft: SocialAgentRequestDraft,
    searchResult: SocialAgentCandidateSearchResult,
  ): string {
    const criteria = this.describeSearchCriteria(draft);
    const criteriaText =
      criteria.length > 0
        ? `我已经按「${criteria.join('、')}」查过一轮，`
        : '我已经按你当前给出的条件查过一轮，';
    const intro =
      searchResult.emptyReason === 'no_real_candidates'
        ? '这次没有找到真实、公开可发现且符合安全边界的候选人。'
        : '这次还没有整理出可以直接推荐的候选人。';
    return `${intro}${criteriaText}不会编造候选。你可以选择放宽候选偏好或范围、换一个时间，或者先把约练卡发布到发现，让合适的人主动回应。发送邀请或公开更具体的位置前，我仍会先让你确认。`;
  }

  private describeSearchCriteria(draft: SocialAgentRequestDraft): string[] {
    const metadata = isRecord(draft.metadata) ? draft.metadata : {};
    const criteria = [
      draft.activityType,
      metadata.timePreference,
      metadata.locationPreference,
      draft.city,
      metadata.candidatePreference,
      metadata.intensity,
      ...(Array.isArray(draft.interestTags) ? draft.interestTags.slice(0, 3) : []),
    ]
      .map((value) => cleanDisplayText(value, ''))
      .filter((value): value is string => value.length > 0);
    return Array.from(new Set(criteria)).slice(0, 6);
  }

  private evaluateAgentQuality(result: SocialAgentChatRunResult): void {
    const report = this.agentQuality?.evaluate({
      assistantMessage: result.assistantMessage,
      cards: result.cards,
      safety: result.safety,
      structuredIntent: result.structuredIntent,
      approvalRequiredActions: result.approvalRequiredActions,
      visibleSteps: result.visibleSteps,
      candidates: result.candidates as unknown as Array<
        Record<string, unknown>
      >,
      socialRequestDraft: result.socialRequestDraft as unknown as Record<
        string,
        unknown
      > | null,
    });
    if (!report || report.passed) return;
    this.logger.warn(
      JSON.stringify({
        event: 'fitmeet_agent.quality.failed',
        taskId: result.taskId,
        score: report.score,
        failedChecks: report.checks
          .filter((check) => check.status === 'fail')
          .map((check) => check.id),
      }),
    );
    void this.selfImprove
      ?.recordQualityFailure({
        taskId: result.taskId,
        qualityReport: report,
        assistantMessage: result.assistantMessage,
        source: 'social_agent_recommendation_result',
        context: {
          emptyReason: result.emptyReason,
          candidateCount: result.candidates.length,
          hasApprovalActions: result.approvalRequiredActions.length > 0,
          blockedBySafety: result.safety?.blocked === true,
          structuredIntentReadiness: result.structuredIntent?.readiness,
        },
      })
      .catch(() => undefined);
  }

  private rememberShortTermCandidates(
    task: AgentTask,
    draft: SocialAgentRequestDraft,
    candidates: SocialAgentChatCandidate[],
    searchResult: SocialAgentCandidateSearchResult,
  ): void {
    rememberSocialAgentShortTerm(task, {
      socialRequestId: draft.socialRequestId ?? null,
      socialRequestDraft: this.safeDraftForEvent(draft),
      candidates: candidates.map((candidate) => ({
        targetUserId: candidate.targetUserId,
        userId: candidate.userId,
        candidateUserId: candidate.candidateUserId ?? candidate.userId,
        nickname: candidate.nickname,
        score: candidate.score,
        socialRequestId: candidate.socialRequestId,
        candidateRecordId: candidate.candidateRecordId,
        commonTags: candidate.commonTags,
        reasons: candidate.reasons,
        suggestedMessage: candidate.suggestedMessage,
        candidateExplanation: candidate.candidateExplanation ?? null,
        emotionalInsight: candidate.emotionalInsight ?? null,
        status: candidate.status ?? null,
      })),
    });
    recordSocialAgentSearchMemory(task, {
      intent: 'social_search',
      candidates: candidates.map((candidate) => ({
        targetUserId: candidate.targetUserId,
        candidateUserId: candidate.candidateUserId ?? candidate.userId,
        nickname: candidate.nickname,
        score: candidate.score,
        reasons: candidate.reasons,
        status: candidate.status ?? null,
      })),
      candidateCount: candidates.length,
      emptyReason: candidates.length === 0 ? searchResult.emptyReason : null,
      nextStep:
        candidates.length > 0
          ? '等待用户选择候选人或确认下一步动作'
          : '放宽条件、换时间范围，或确认发布约练卡到发现',
    });
    transitionSocialAgentState(task, 'candidates_returned', {
      objective: 'search',
      nextStep:
        candidates.length > 0
          ? '等待用户选择候选人或确认下一步动作'
          : '等待用户放宽条件或补充偏好',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor:
        candidates.length > 0 ? 'candidate_selection' : 'search_refinement',
      lastCompletedStep: 'search_completed',
    });
  }

  private rememberShortTermStep(
    task: AgentTask,
    id: string,
    label: string,
    status: string,
  ): void {
    const step = {
      id,
      label,
      status,
      updatedAt: new Date().toISOString(),
    };
    rememberSocialAgentShortTerm(task, {
      currentStep: step,
      steps: appendShortTermMemoryItem(task, 'steps', step, 40),
    });
  }

  private async writeEvent(
    task: AgentTask,
    eventType: AgentTaskEventType,
    summary: string,
    payload: Record<string, unknown> = {},
    actor: AgentTaskEventActor = AgentTaskEventActor.Agent,
  ): Promise<void> {
    try {
      await this.eventRepo.save(
        this.eventRepo.create({
          taskId: task.id,
          ownerUserId: task.ownerUserId,
          eventType,
          actor,
          summary: this.safeVarchar(summary, 500),
          payload: sanitizeForDisplay(payload) as Record<string, unknown>,
        }),
      );
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.recommendation_result.task_event_write_failed',
          taskId: task.id,
          eventType,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private safeDraftForEvent(value: unknown): Record<string, unknown> {
    return sanitizeForDisplay(value) as Record<string, unknown>;
  }

  private safeVarchar(value: unknown, max = 80): string {
    const text = cleanDisplayText(value, '');
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 1))}…`;
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
