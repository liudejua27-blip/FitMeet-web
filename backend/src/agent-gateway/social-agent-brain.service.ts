import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { cleanDisplayText } from '../common/display-text.util';
import {
  normalizeSocialAgentBrainLlmPlan,
  normalizeSocialAgentBrainPlannedTools,
  type SocialAgentLlmPlan,
} from './social-agent-brain-planner-normalization';
import {
  normalizeSocialAgentContextTurn,
  selectSocialAgentContextWindow,
  socialAgentContextTurnLimit,
} from './social-agent-context-window';
import {
  SocialAgentIntentRouterResult,
  SocialAgentIntentType,
  SocialAgentReplyStrategy,
} from './social-agent-intent-router.service';
import { hasSocialAgentImmediateSearchRequest } from './social-agent-profile-search-boundary';
import {
  hasExistingSocialActionContext,
  hasExistingSocialExecutionContext,
  hasExplicitSocialExecutionIntent,
  isSocialExecutionIntent,
} from './social-agent-social-intent-gate';
import { AgentTaskPermissionMode } from './entities/agent-task.entity';
import { FitMeetAgentToolRegistryService } from './fitmeet-agent-tool-registry.service';
import {
  SOCIAL_AGENT_DEFAULT_REASONING_MODEL,
  SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS,
  selectSocialAgentConfiguredModel,
  SocialAgentModelRouterService,
} from './social-agent-model-router.service';
import {
  isRetryableSocialAgentDeepSeekFailure,
  socialAgentDeepSeekFailureReason,
  socialAgentDeepSeekRetryAttempts,
} from './social-agent-deepseek-resilience';
import { SocialAgentChatDeepSeekClientService } from './social-agent-chat-deepseek-client.service';
import { callDeepSeekChatCompletionWithUsage } from '../common/deepseek.util';
import { SocialAgentLlmOutputCacheService } from './social-agent-llm-output-cache.service';
import {
  buildSocialAgentExactCacheKey,
  buildSocialAgentPromptFingerprint,
  readSocialAgentExactCacheKeyFingerprint,
} from './social-agent-prompt-fingerprint.util';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import { AgentObservabilityService } from './agent-observability.service';

export interface SocialAgentBrainTurnInput {
  message: string;
  route: SocialAgentIntentRouterResult;
  profile?: Record<string, unknown> | null;
  taskContext?: Record<string, unknown>;
  conversationHistory?: Array<Record<string, unknown>>;
  memoryContext?: unknown;
  signal?: AbortSignal | null;
}

export interface SocialAgentBrainTurnDecision {
  route: SocialAgentIntentRouterResult;
  conversationMode:
    | 'answer'
    | 'workflow_help'
    | 'profile_enrichment'
    | 'profile_correction'
    | 'profile_update_tool'
    | 'search'
    | 'action'
    | 'clarify';
  shouldExecuteTool: boolean;
  shouldAskClarifyingQuestion: boolean;
  plannerSource: 'deepseek' | 'rules';
  userIntent: SocialAgentIntentType;
  reason: string;
  responseGoal: string;
  needUserConfirmation: boolean;
  tools: SocialAgentBrainPlannedTool[];
  notes: string[];
}

export interface SocialAgentBrainPlannedTool {
  name: string;
  arguments: Record<string, unknown>;
}

export interface SocialAgentBrainAvailableTool {
  name: string;
  description: string;
  whenToUse: string;
  requiresConfirmation: boolean;
  returns: string[];
}

type SocialAgentDeepSeekMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

@Injectable()
export class SocialAgentBrainService {
  private readonly logger = new Logger(SocialAgentBrainService.name);
  private localBrainPlannerCache?: SocialAgentLlmOutputCacheService;

  constructor(
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly toolRegistry?: FitMeetAgentToolRegistryService,
    @Optional() private readonly modelRouter?: SocialAgentModelRouterService,
    @Optional()
    private readonly deepSeek?: SocialAgentChatDeepSeekClientService,
    @Optional()
    private readonly llmOutputCache?: SocialAgentLlmOutputCacheService,
    @Optional()
    private readonly metrics?: SocialAgentMetricsService,
    @Optional()
    private readonly observability?: AgentObservabilityService,
  ) {}

  async planTurn(
    input: SocialAgentBrainTurnInput,
  ): Promise<SocialAgentBrainTurnDecision> {
    if (input.signal?.aborted) throw new Error('client_aborted');
    const fallback = this.reviewTurn(input);
    if (!this.shouldUseLlmPlanner(input, fallback)) return fallback;

    try {
      const maxAttempts = socialAgentDeepSeekRetryAttempts(this.config, {
        specificKey: 'SOCIAL_AGENT_BRAIN_RETRY_ATTEMPTS',
      });
      let plan: SocialAgentLlmPlan | null = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          plan = await this.callDeepSeekPlanner(input, fallback, maxAttempts);
          break;
        } catch (error) {
          const reason = socialAgentDeepSeekFailureReason(error);
          if (
            attempt < maxAttempts &&
            isRetryableSocialAgentDeepSeekFailure(reason, {
              includeJsonFormatErrors: true,
              includeTimeoutFailures: true,
            })
          ) {
            this.logger.warn(
              JSON.stringify({
                event: 'social_agent.brain_planner.retrying',
                reason,
                attempt,
                maxAttempts,
              }),
            );
            continue;
          }
          throw error;
        }
      }
      if (!plan)
        return this.degradedPlannerDecision(input, fallback, 'empty_plan');
      return this.applyLlmPlan(input, fallback, plan);
    } catch (error) {
      if (error instanceof Error && error.message === 'client_aborted') {
        throw error;
      }
      const reason = socialAgentDeepSeekFailureReason(error);
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.brain_planner.failed',
          message: reason,
        }),
      );
      return this.degradedPlannerDecision(input, fallback, reason);
    }
  }

  reviewTurn(input: SocialAgentBrainTurnInput): SocialAgentBrainTurnDecision {
    const message = cleanDisplayText(input.message, '').trim();
    const route = input.route;
    const notes: string[] = [];

    if (this.isSocialContinuationCorrection(message, input)) {
      notes.push('social_search_repair_detected');
      const intent =
        route.intent === 'candidate_followup' ||
        hasExistingSocialExecutionContext(input)
          ? 'candidate_followup'
          : 'social_search';
      return this.decision(
        this.overrideRoute(route, intent, {
          replyStrategy: 'search_candidates',
          shouldSearch: true,
          shouldReplan: intent === 'candidate_followup',
          shouldUpdateProfile: false,
          shouldExecuteAction: false,
          confidence: Math.max(route.confidence, 0.91),
        }),
        'search',
        notes,
        false,
        true,
      );
    }

    if (this.isCorrectionOrClarification(message)) {
      notes.push('user_repair_detected');
      return this.decision(
        this.overrideRoute(route, 'correction_or_clarification', {
          replyStrategy: 'conversational_answer',
          shouldSearch: false,
          shouldReplan: false,
          shouldUpdateProfile: false,
          shouldExecuteAction: false,
          confidence: Math.max(route.confidence, 0.94),
        }),
        'profile_correction',
        notes,
      );
    }

    if (this.isProfileEnrichmentRequest(message)) {
      notes.push('profile_enrichment_request_detected');
      return this.decision(
        this.overrideRoute(route, 'profile_enrichment_request', {
          replyStrategy: 'conversational_answer',
          shouldSearch: false,
          shouldReplan: false,
          shouldUpdateProfile: true,
          shouldExecuteAction: false,
          confidence: Math.max(route.confidence, 0.92),
        }),
        this.isExplicitProfileSaveRequest(message)
          ? 'profile_update_tool'
          : 'profile_enrichment',
        notes,
      );
    }

    if (this.isWorkflowQuestion(message)) {
      notes.push('workflow_question_detected');
      return this.decision(
        this.overrideRoute(route, 'workflow_help', {
          replyStrategy: 'conversational_answer',
          shouldSearch: false,
          shouldReplan: false,
          shouldUpdateProfile: false,
          shouldExecuteAction: false,
          confidence: Math.max(route.confidence, 0.91),
        }),
        'workflow_help',
        notes,
      );
    }

    if (
      this.hasRichProfileFacts(message) &&
      !hasSocialAgentImmediateSearchRequest(message)
    ) {
      notes.push('rich_profile_facts_detected');
      if (route.intent === 'social_search') {
        notes.push('search_downgraded_until_user_confirms');
      }
      return this.decision(
        this.overrideRoute(route, 'profile_enrichment', {
          replyStrategy: 'conversational_answer',
          shouldSearch: false,
          shouldReplan: false,
          shouldUpdateProfile: true,
          shouldExecuteAction: false,
          confidence: Math.max(route.confidence, 0.9),
        }),
        'profile_enrichment',
        notes,
      );
    }

    if (
      route.intent === 'product_help' ||
      route.intent === 'casual_chat' ||
      route.intent === 'unknown'
    ) {
      return this.decision(
        this.overrideRoute(route, route.intent, {
          replyStrategy: 'conversational_answer',
          shouldSearch: false,
          shouldReplan: false,
          shouldUpdateProfile: false,
          shouldExecuteAction: false,
        }),
        route.intent === 'unknown' ? 'clarify' : 'answer',
        notes,
        route.intent === 'unknown',
      );
    }

    if (
      route.intent === 'social_search' ||
      route.intent === 'activity_search' ||
      route.intent === 'candidate_followup'
    ) {
      return this.decision(route, 'search', notes, false, route.shouldSearch);
    }

    if (route.intent === 'action_request') {
      if (!hasExistingSocialActionContext(input)) {
        return this.decision(
          this.overrideRoute(route, 'action_request', {
            replyStrategy: 'ask_clarifying_question',
            shouldSearch: false,
            shouldReplan: false,
            shouldUpdateProfile: false,
            shouldExecuteAction: false,
            confidence: Math.max(route.confidence, 0.86),
          }),
          'clarify',
          [...notes, 'action_context_missing'],
          true,
          false,
          {
            responseGoal:
              '先确认用户指的是哪个候选人、哪张约练卡或哪个待审批动作；没有明确对象前不得执行副作用。',
          },
        );
      }
      return this.decision(
        route,
        'action',
        notes,
        false,
        route.shouldExecuteAction,
      );
    }

    return this.decision(route, 'answer', notes);
  }

  private decision(
    route: SocialAgentIntentRouterResult,
    conversationMode: SocialAgentBrainTurnDecision['conversationMode'],
    notes: string[],
    shouldAskClarifyingQuestion = false,
    shouldExecuteTool = false,
    extras: Partial<
      Pick<
        SocialAgentBrainTurnDecision,
        | 'plannerSource'
        | 'userIntent'
        | 'reason'
        | 'responseGoal'
        | 'needUserConfirmation'
        | 'tools'
      >
    > = {},
  ): SocialAgentBrainTurnDecision {
    return {
      route,
      conversationMode,
      shouldAskClarifyingQuestion,
      shouldExecuteTool,
      plannerSource: extras.plannerSource ?? 'rules',
      userIntent: extras.userIntent ?? route.intent,
      reason: extras.reason ?? '',
      responseGoal: extras.responseGoal ?? '',
      needUserConfirmation: extras.needUserConfirmation ?? false,
      tools: extras.tools ?? [],
      notes,
    };
  }

  private degradedPlannerDecision(
    input: SocialAgentBrainTurnInput,
    fallback: SocialAgentBrainTurnDecision,
    reason: string,
  ): SocialAgentBrainTurnDecision {
    const degradedNotes = [
      ...new Set([
        ...fallback.notes,
        'llm_planner_degraded',
        `llm_planner_degraded:${reason}`,
      ]),
    ];

    if (
      fallback.conversationMode === 'search' &&
      (fallback.route.shouldSearch || fallback.route.shouldReplan)
    ) {
      return this.decision(
        this.overrideRoute(input.route, fallback.route.intent, {
          replyStrategy: fallback.route.replyStrategy,
          shouldSearch: fallback.route.shouldSearch,
          shouldReplan: fallback.route.shouldReplan,
          shouldUpdateProfile: false,
          shouldExecuteAction: false,
          confidence: Math.max(input.route.confidence, fallback.route.confidence),
        }),
        'search',
        [...degradedNotes, 'rules_fallback_preserved_for_search'],
        false,
        true,
        {
          plannerSource: 'rules',
          userIntent: fallback.route.intent,
          reason:
            'Planner did not return a reliable search plan; preserved the validated social search route and hydrated task context.',
          responseGoal:
            '继续使用已保存的时间、地点、活动和候选偏好推进搜索；不要重复追问已完成字段，并说明当前使用的是安全降级路径。',
          needUserConfirmation: false,
          tools: fallback.tools,
        },
      );
    }

    if (
      fallback.conversationMode === 'action' &&
      fallback.route.shouldExecuteAction &&
      hasExistingSocialActionContext(input)
    ) {
      return this.decision(
        this.overrideRoute(input.route, fallback.route.intent, {
          replyStrategy: fallback.route.replyStrategy,
          shouldSearch: false,
          shouldReplan: false,
          shouldUpdateProfile: false,
          shouldExecuteAction: true,
          confidence: Math.max(input.route.confidence, fallback.route.confidence),
        }),
        'action',
        [...degradedNotes, 'rules_fallback_preserved_for_approval_action'],
        true,
        true,
        {
          plannerSource: 'rules',
          userIntent: fallback.route.intent,
          reason:
            'Planner did not return a reliable action plan; preserved the explicit action route but kept it behind approval.',
          responseGoal:
            '展示将要执行的动作并请求用户确认；确认前不得发送邀请、连接候选人、公开位置或执行任何副作用。',
          needUserConfirmation: true,
          tools: fallback.tools,
        },
      );
    }

    const route = this.overrideRoute(input.route, fallback.route.intent, {
      replyStrategy: 'conversational_answer',
      shouldSearch: false,
      shouldReplan: false,
      shouldUpdateProfile: false,
      shouldExecuteAction: false,
      confidence: Math.max(input.route.confidence, 0.86),
    });

    return this.decision(
      route,
      'answer',
      degradedNotes,
      false,
      false,
      {
        plannerSource: 'rules',
        userIntent: fallback.route.intent,
        reason:
          'Planner did not return a reliable plan; preserved context instead of executing rule-based tools.',
        responseGoal:
          '先承认已保留用户刚才的上下文，说明当前没有继续执行搜索或动作，并邀请用户重试或继续补充。',
        needUserConfirmation: false,
        tools: [],
      },
    );
  }

  private shouldUseLlmPlanner(
    input: SocialAgentBrainTurnInput,
    fallback: SocialAgentBrainTurnDecision,
  ): boolean {
    if (!cleanDisplayText(input.message, '').trim()) return false;
    if (this.brainPlannerRulesOnlyMode()) {
      return false;
    }
    if (this.canUseDeterministicBrainDecision(input, fallback)) {
      return false;
    }
    return Boolean(this.config?.get<string>('DEEPSEEK_API_KEY'));
  }

  private canUseDeterministicBrainDecision(
    input: SocialAgentBrainTurnInput,
    fallback: SocialAgentBrainTurnDecision,
  ): boolean {
    if (!this.brainPlannerWorkflowShortcutsEnabled()) return false;
    if (
      fallback.conversationMode === 'search' &&
      (fallback.route.shouldSearch || fallback.route.shouldReplan) &&
      this.hasHydratedSearchContext(input.taskContext)
    ) {
      return true;
    }

    return false;
  }

  private brainPlannerWorkflowShortcutsEnabled(): boolean {
    const value = `${this.config?.get<string>(
      'SOCIAL_AGENT_BRAIN_WORKFLOW_SHORTCUTS',
    ) ?? ''}`
      .trim()
      .toLowerCase();
    return !['0', 'false', 'off', 'disabled'].includes(value);
  }

  private hasHydratedSearchContext(value: unknown): boolean {
    const taskContext = this.isRecord(value) ? value : {};
    if (hasExistingSocialExecutionContext({ taskContext } as SocialAgentBrainTurnInput)) {
      return true;
    }
    if (this.hasMeaningfulSlots(taskContext.taskSlots)) return true;
    const taskMemory = this.isRecord(taskContext.taskMemory)
      ? taskContext.taskMemory
      : {};
    if (this.hasMeaningfulSlots(taskMemory.taskSlots)) return true;
    const constraints = this.isRecord(taskMemory.knownTaskSlotConstraints)
      ? taskMemory.knownTaskSlotConstraints
      : this.isRecord(taskContext.knownTaskSlotConstraints)
        ? taskContext.knownTaskSlotConstraints
        : {};
    const knownSlots = Array.isArray(constraints.knownSlots)
      ? constraints.knownSlots
      : [];
    return knownSlots.some((slot) => {
      if (!this.isRecord(slot)) return false;
      return Boolean(cleanDisplayText(slot.key, '') && cleanDisplayText(slot.value, ''));
    });
  }

  private hasMeaningfulSlots(value: unknown): boolean {
    const slots = this.isRecord(value) ? value : {};
    return Object.values(slots).some((raw) => {
      if (!this.isRecord(raw)) return Boolean(cleanDisplayText(raw, ''));
      return Boolean(cleanDisplayText(raw.value, ''));
    });
  }

  private brainPlannerRulesOnlyMode(): boolean {
    const mode =
      `${this.config?.get<string>('SOCIAL_AGENT_MODEL_ROUTING_MODE') ?? ''}`
        .trim()
        .toLowerCase();
    const legacyToggle =
      `${this.config?.get<string>('SOCIAL_AGENT_BRAIN_LLM_PLANNER') ?? ''}`
        .trim()
        .toLowerCase();
    if (mode === 'rules_only' || mode === 'rules-only') return true;
    if (legacyToggle === 'rules_only' || legacyToggle === 'rules-only') {
      return true;
    }
    if (legacyToggle === 'false') {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.brain_planner.legacy_disable_ignored',
          message:
            'SOCIAL_AGENT_BRAIN_LLM_PLANNER=false is ignored; use SOCIAL_AGENT_MODEL_ROUTING_MODE=rules_only for an explicit rules-only runtime.',
        }),
      );
    }
    return false;
  }

  private async callDeepSeekPlanner(
    input: SocialAgentBrainTurnInput,
    fallback: SocialAgentBrainTurnDecision,
    retryAttempts: number,
  ): Promise<SocialAgentLlmPlan | null> {
    const apiKey = this.config?.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey) return null;
    const useCase = 'brain' as const;
    const messages = this.deepSeekPlannerMessages(input, fallback);
    const model = this.modelFor(useCase);
    const cacheKey = this.brainPlannerCacheKey({
      messages,
      model,
      useCase,
    });
    const cacheTtlMs = this.brainPlannerCacheTtlMs();
    const cached =
      cacheTtlMs > 0 ? this.llmOutputCacheService().get(cacheKey) : null;
    const cacheFingerprint = readSocialAgentExactCacheKeyFingerprint(cacheKey);
    if (cacheTtlMs > 0) {
      this.metrics?.recordLlmOutputCache?.({
        cacheName: 'brain_planner_exact',
        hit: cached !== null,
        approxChars: cached !== null ? this.approxChars(messages) : null,
        promptPrefixHash: cacheFingerprint?.promptPrefixHash ?? null,
        dynamicContextHash: cacheFingerprint?.dynamicContextHash ?? null,
      });
    }
    if (cached !== null) {
      return normalizeSocialAgentBrainLlmPlan(
        JSON.parse(cached) as Record<string, unknown>,
      );
    }
    if (this.deepSeek) {
      const content = await this.deepSeek.complete({
        useCase,
        taskId: this.taskIdFromTaskContext(input.taskContext),
        intent: fallback.route.intent,
        fallbackTemperature: 0.15,
        responseFormat: { type: 'json_object' },
        retryAttempts,
        messages,
        signal: input.signal,
      });
      if (!content) return null;
      const plan = normalizeSocialAgentBrainLlmPlan(
        JSON.parse(content) as Record<string, unknown>,
      );
      if (cacheTtlMs > 0) {
        this.llmOutputCacheService().set(cacheKey, content, {
          ttlMs: cacheTtlMs,
          approxPromptChars: this.approxChars(messages),
        });
      }
      return plan;
    }
    const startedAt = Date.now();
    let fallbackUsage:
      | Awaited<ReturnType<typeof callDeepSeekChatCompletionWithUsage>>['usage']
      | null = null;
    try {
      const completion = await callDeepSeekChatCompletionWithUsage({
        apiKey,
        baseUrl: this.config?.get<string>('DEEPSEEK_BASE_URL'),
        model,
        temperature: this.modelRouter?.getTemperature(useCase) ?? 0.15,
        responseFormat: { type: 'json_object' },
        retryAttempts: 1,
        messages,
        signal: input.signal ?? null,
        timeoutMs: this.plannerTimeoutMs(useCase),
        timeoutMessage: 'deepseek_timeout',
      });
      fallbackUsage = completion.usage;
      const content = completion.content;
      const plan = normalizeSocialAgentBrainLlmPlan(
        JSON.parse(content) as Record<string, unknown>,
      );
      if (cacheTtlMs > 0) {
        this.llmOutputCacheService().set(cacheKey, content, {
          ttlMs: cacheTtlMs,
          approxPromptChars: this.approxChars(messages),
        });
      }
      this.logModelCall({
        useCase,
        model,
        intent: plan?.userIntent ?? fallback.route.intent,
        latencyMs: Date.now() - startedAt,
        success: true,
      });
      this.observability?.recordLlmCall({
        useCase,
        model,
        taskId: this.taskIdFromTaskContext(input.taskContext),
        latencyMs: Date.now() - startedAt,
        success: true,
        promptTokens: fallbackUsage.promptTokens,
        promptCacheHitTokens: fallbackUsage.promptCacheHitTokens,
        promptCacheMissTokens: fallbackUsage.promptCacheMissTokens,
        completionTokens: fallbackUsage.completionTokens,
        reasoningTokens: fallbackUsage.reasoningTokens,
        approxPromptChars: this.approxChars(messages),
        promptPrefixHash: cacheFingerprint?.promptPrefixHash ?? null,
        dynamicContextHash: cacheFingerprint?.dynamicContextHash ?? null,
      });
      return plan;
    } catch (error) {
      const reason = socialAgentDeepSeekFailureReason(error);
      this.logModelCall({
        useCase,
        model,
        intent: fallback.route.intent,
        latencyMs: Date.now() - startedAt,
        success: false,
        reason,
      });
      this.observability?.recordLlmCall({
        useCase,
        model,
        taskId: this.taskIdFromTaskContext(input.taskContext),
        latencyMs: Date.now() - startedAt,
        success: false,
        promptTokens: fallbackUsage?.promptTokens,
        promptCacheHitTokens: fallbackUsage?.promptCacheHitTokens,
        promptCacheMissTokens: fallbackUsage?.promptCacheMissTokens,
        completionTokens: fallbackUsage?.completionTokens,
        reasoningTokens: fallbackUsage?.reasoningTokens,
        approxPromptChars: this.approxChars(messages),
        promptPrefixHash: cacheFingerprint?.promptPrefixHash ?? null,
        dynamicContextHash: cacheFingerprint?.dynamicContextHash ?? null,
        failureReason: reason,
      });
      throw error;
    }
  }

  private plannerSystemPrompt(): string {
    return [
      '你是 FitMeet Social Agent 的 LLM Planner，只输出 JSON，不输出自然语言。',
      '你的任务是基于用户当前消息、最近上下文和 router 初判，决定下一步做什么。',
      '你会收到 availableTools。只能从 availableTools.name 中选择工具；如果已有上下文足够回答，就不要调用工具。',
      '允许的 userIntent: product_help, workflow_help, casual_chat, profile_enrichment, profile_enrichment_request, correction_or_clarification, social_search, activity_search, candidate_followup, action_request, safety_or_boundary, fitness_math, unknown。',
      '如果用户主要提供个人画像，即使包含“想找同校女生/想认识某类人”，也优先 profile_enrichment；不要立即 social_search，除非用户明确说“现在帮我找/搜索/推荐”。',
      '如果用户说“不是不是/我的意思是/上面是画像”，通常是 correction_or_clarification；但如果已有社交/约练任务，且用户是在补充候选偏好、时间、地点或活动类型，应继续 social_search/candidate_followup。',
      '你会收到 knownTaskSlots 和 plannerConstraints。knownTaskSlots 可能包含用户已确认字段，也可能包含 inferred_context 推断上下文；只有 plannerConstraints.doNotRepeatQuestionsForSlots 里的字段才是用户已回答/已确认/已完成的硬约束，不得重复追问。knownContextSlots 只用于理解上下文，不能替代必要澄清。',
      '你会收到 taskContext.candidateActions/candidateState。它们记录已推荐、保存、跳过、喜欢、已邀请的候选人；不要重复推荐用户已跳过的人，继续尊重已保存/已邀请状态。',
      '你会收到 taskContext.pendingApprovals/pendingActions。它们是等待用户确认的动作；存在待确认发布、连接、发邀请、发消息时，必须先让用户确认、修改或取消，不能绕过审批继续执行副作用。',
      'candidate_preference 只能用于公开可发现资料、用户自愿公开标签或用户明确授权的筛选，不得推断隐私字段。',
      '如果用户说“调用工具/保存/写入/完善 AI 画像”，可以计划 update_profile_from_agent_context。',
      '如果不确定，needUserConfirmation=true，并把 responseGoal 设为追问澄清。',
      '动作型工具例如 send_message_to_candidate、connect_candidate、create_activity 必须 needUserConfirmation=true，不能假装已经执行。',
      '不要编造候选人、消息、会话或已经执行的动作。',
      'JSON schema: {"intent":"profile_enrichment","reason":"...","state":"profile_building","shouldCallTools":false,"toolCalls":[{"name":"update_profile_from_agent_context","arguments":{}}],"needUserConfirmation":false,"responseGoal":"..."}',
      '兼容字段：userIntent 等同 intent；shouldCallTool 等同 shouldCallTools；tools 等同 toolCalls。',
    ].join('\n');
  }

  private brainPlannerCacheKey(input: {
    messages: SocialAgentDeepSeekMessage[];
    model: string;
    useCase: 'brain';
  }): string {
    return buildSocialAgentExactCacheKey({
      cacheName: 'brain_planner_exact',
      fingerprint: buildSocialAgentPromptFingerprint({
        schema: 'social_agent_brain_planner.v1',
        model: input.model,
        useCase: input.useCase,
        messages: input.messages,
      }),
    });
  }

  private llmOutputCacheService(): SocialAgentLlmOutputCacheService {
    if (this.llmOutputCache) return this.llmOutputCache;
    this.localBrainPlannerCache ??= new SocialAgentLlmOutputCacheService();
    return this.localBrainPlannerCache;
  }

  private brainPlannerCacheTtlMs(): number {
    const raw = this.config?.get<string>('SOCIAL_AGENT_BRAIN_PLANNER_CACHE_TTL_MS');
    if (raw === '0') return 0;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
    return 30_000;
  }

  private approxChars(value: unknown): number {
    try {
      return JSON.stringify(value).length;
    } catch {
      return 0;
    }
  }

  private deepSeekPlannerMessages(
    input: SocialAgentBrainTurnInput,
    fallback: SocialAgentBrainTurnDecision,
  ): SocialAgentDeepSeekMessage[] {
    return [
      { role: 'system', content: this.plannerSystemPrompt() },
      {
        role: 'user',
        content: JSON.stringify({
          userMessage: input.message,
          availableTools: this.availableTools(),
          routerRoute: input.route,
          ruleBrainFallback: {
            intent: fallback.route.intent,
            conversationMode: fallback.conversationMode,
            notes: fallback.notes,
          },
          profile: input.profile ?? {},
          taskContext: input.taskContext ?? {},
          knownTaskSlots: this.knownTaskSlots(input.taskContext),
          plannerConstraints: this.plannerConstraintsForTaskContext(
            input.taskContext,
          ),
          memoryContext: input.memoryContext ?? null,
          conversationHistory: selectSocialAgentContextWindow(
            input.conversationHistory,
            socialAgentContextTurnLimit(this.config),
          ).map(normalizeSocialAgentContextTurn),
        }),
      },
    ];
  }

  availableTools(): SocialAgentBrainAvailableTool[] {
    if (this.toolRegistry) {
      return this.toolRegistry
        .listModelTools(AgentTaskPermissionMode.Confirm)
        .map((tool) => ({
          name: tool.name,
          description: tool.description,
          whenToUse: tool.failureFallback ?? tool.dataScope,
          requiresConfirmation:
            tool.requiresConfirmation ?? tool.requiresApproval,
          returns: Object.keys(
            this.isRecord(tool.outputSchema.properties)
              ? tool.outputSchema.properties
              : {},
          ),
        }));
    }
    return [
      {
        name: 'update_profile_from_agent_context',
        description: '保存或补充当前用户的 AI 社交画像和画像记忆。',
        whenToUse: '用户明确提供画像事实，或要求保存/完善/写入 AI 画像。',
        requiresConfirmation: false,
        returns: ['success', 'updatedFields', 'memoryFields', 'missingFields'],
      },
      {
        name: 'search_real_candidates',
        description: '搜索真实候选人或搭子。',
        whenToUse: '用户明确要求现在找人、搜索候选人、推荐搭子。',
        requiresConfirmation: false,
        returns: ['candidates', 'matchReasons', 'emptyReason'],
      },
      {
        name: 'append_profile_memory',
        description: 'Append lightweight profile memory or preference notes.',
        whenToUse:
          'Use when user facts should be remembered but do not map cleanly to structured profile fields.',
        requiresConfirmation: false,
        returns: ['success', 'memoryFields'],
      },
      {
        name: 'search_public_intents',
        description: 'Search public social intent cards from real users.',
        whenToUse:
          'Use when the user asks for public activity cards or open social requests.',
        requiresConfirmation: false,
        returns: ['activityResults', 'emptyReason'],
      },
      {
        name: 'create_social_request',
        description: '发布约练或社交需求。',
        whenToUse: '用户明确要发布需求或创建公开约练卡片。',
        requiresConfirmation: true,
        returns: ['requestId', 'status', 'visibility'],
      },
      {
        name: 'send_message_to_candidate',
        description: '给候选人发送消息。',
        whenToUse: '用户明确要求给某个候选人发消息。',
        requiresConfirmation: true,
        returns: ['success', 'status', 'messageId', 'conversationId'],
      },
      {
        name: 'connect_candidate',
        description: '加好友并进入聊天。',
        whenToUse: '用户明确要求加好友、连接候选人、进入聊天。',
        requiresConfirmation: true,
        returns: ['success', 'status', 'targetUserId', 'conversationId'],
      },
      {
        name: 'create_activity',
        description: '创建线下约练活动。',
        whenToUse: '用户明确要求创建线下活动、约练局、见面安排。',
        requiresConfirmation: true,
        returns: ['activityId', 'status', 'title'],
      },
      {
        name: 'get_user_profile',
        description: '读取当前用户画像摘要。',
        whenToUse: '用户询问当前画像、画像缺失项或需要基于画像回答。',
        requiresConfirmation: false,
        returns: ['profile', 'completion', 'missingFields'],
      },
      {
        name: 'get_conversation_history',
        description: '读取最近对话上下文。',
        whenToUse: '用户提到上面、刚才、之前，或出现纠错/澄清。',
        requiresConfirmation: false,
        returns: ['messages', 'summary'],
      },
      {
        name: 'get_conversation_messages',
        description: 'Read recent messages from the current task conversation.',
        whenToUse:
          'Use when the user references previous messages or asks to continue from recent context.',
        requiresConfirmation: false,
        returns: ['messages', 'summary'],
      },
      {
        name: 'get_candidate_detail',
        description:
          'Read details and match reasons for one selected candidate.',
        whenToUse:
          'Use when the user asks why a candidate was recommended or wants more detail.',
        requiresConfirmation: false,
        returns: ['candidate', 'matchReasons', 'riskWarnings'],
      },
    ];
  }

  private knownTaskSlots(
    taskContext?: Record<string, unknown>,
  ): Record<string, string> {
    const slotRecord = this.taskSlotRecord(taskContext);
    const allowedStates = new Set([
      'answered',
      'confirmed',
      'completed',
      'modified',
      'inferred',
    ]);
    return {
      ...this.knownConstraintSlotValues(taskContext),
      ...this.taskSlotValues(slotRecord, allowedStates),
    };
  }

  private userConfirmedTaskSlotKeys(
    taskContext?: Record<string, unknown>,
  ): string[] {
    const slotRecord = this.taskSlotRecord(taskContext);
    const userConfirmedStates = new Set([
      'answered',
      'confirmed',
      'completed',
      'modified',
    ]);
    return [
      ...new Set([
        ...this.knownConstraintDoNotAskAgainKeys(taskContext),
        ...Object.keys(this.taskSlotValues(slotRecord, userConfirmedStates)),
      ]),
    ];
  }

  private taskSlotRecord(
    taskContext?: Record<string, unknown>,
  ): Record<string, unknown> {
    const context = this.isRecord(taskContext) ? taskContext : {};
    const taskMemory = this.isRecord(context.taskMemory)
      ? context.taskMemory
      : {};
    const slots = this.isRecord(context.taskSlots ?? taskMemory.taskSlots)
      ? (context.taskSlots ?? taskMemory.taskSlots)
      : {};
    return this.isRecord(slots) ? slots : {};
  }

  private knownTaskSlotConstraints(
    taskContext?: Record<string, unknown>,
  ): Record<string, unknown> {
    const context = this.isRecord(taskContext) ? taskContext : {};
    const taskMemory = this.isRecord(context.taskMemory)
      ? context.taskMemory
      : {};
    const constraints = this.isRecord(context.knownTaskSlotConstraints)
      ? context.knownTaskSlotConstraints
      : this.isRecord(taskMemory.knownTaskSlotConstraints)
        ? taskMemory.knownTaskSlotConstraints
        : {};
    return constraints;
  }

  private knownConstraintSlotValues(
    taskContext?: Record<string, unknown>,
  ): Record<string, string> {
    const constraints = this.knownTaskSlotConstraints(taskContext);
    const knownSlots = Array.isArray(constraints.knownSlots)
      ? constraints.knownSlots
      : [];
    const output: Record<string, string> = {};
    for (const rawSlot of knownSlots) {
      if (!this.isRecord(rawSlot)) continue;
      const key = cleanDisplayText(rawSlot.key, '');
      const value = cleanDisplayText(rawSlot.value, '');
      if (!key || !value) continue;
      output[key] = value;
    }
    return output;
  }

  private knownConstraintDoNotAskAgainKeys(
    taskContext?: Record<string, unknown>,
  ): string[] {
    const constraints = this.knownTaskSlotConstraints(taskContext);
    return Array.isArray(constraints.doNotAskAgainFor)
      ? constraints.doNotAskAgainFor
          .map((key) => cleanDisplayText(key, ''))
          .filter(Boolean)
      : [];
  }

  private taskSlotValues(
    slotRecord: Record<string, unknown>,
    allowedStates: Set<string>,
  ): Record<string, string> {
    const output: Record<string, string> = {};
    for (const key of [
      'activity',
      'time_window',
      'location_text',
      'geo_area',
      'intensity',
      'visibility',
      'safety_boundary',
      'invite_tone',
      'candidate_preference',
    ]) {
      const raw = slotRecord[key];
      const slot = this.isRecord(raw) ? raw : {};
      const state = cleanDisplayText(slot.state, '');
      if (state && !allowedStates.has(state)) continue;
      const value = cleanDisplayText(slot.value ?? raw, '');
      if (value) output[key] = value;
    }
    return output;
  }

  private plannerConstraintsForTaskContext(
    taskContext?: Record<string, unknown>,
  ): Record<string, unknown> {
    const knownSlots = this.knownTaskSlots(taskContext);
    const knownSlotKeys = Object.keys(knownSlots);
    const userConfirmedSlotKeys = this.userConfirmedTaskSlotKeys(taskContext);
    return {
      treatKnownTaskSlotsAsAnswered: userConfirmedSlotKeys.length > 0,
      knownContextSlots: knownSlotKeys,
      doNotRepeatQuestionsForSlots: userConfirmedSlotKeys,
      candidatePreferenceScope:
        'public_discoverable_profiles_and_user_consented_public_tags_only',
      inferredSlotsAreContextOnly: true,
      highRiskActionsRequireApproval: [
        'publish_social_request',
        'send_invite',
        'exchange_contact',
        'reveal_precise_location',
        'update_sensitive_profile',
        'connect_candidate',
      ],
    };
  }

  private taskIdFromTaskContext(
    taskContext?: Record<string, unknown>,
  ): number | null {
    const context = this.isRecord(taskContext) ? taskContext : {};
    const value = Number(context.taskId ?? context.id);
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  private applyLlmPlan(
    input: SocialAgentBrainTurnInput,
    fallback: SocialAgentBrainTurnDecision,
    plan: SocialAgentLlmPlan,
  ): SocialAgentBrainTurnDecision {
    const ruleSafety = this.reviewTurn(input);
    const notes = [
      ...new Set([...fallback.notes, ...ruleSafety.notes, 'llm_planner_used']),
    ];
    const userIntent = this.safetyClampIntent(
      plan.userIntent,
      ruleSafety.route.intent,
      input,
    );
    const tools = normalizeSocialAgentBrainPlannedTools({
      tools: plan.tools,
      intent: userIntent,
      availableTools: this.availableTools(),
    });
    const shouldExecuteTool = tools.length > 0 && plan.shouldCallTool;
    const route = this.overrideRoute(input.route, userIntent, {
      confidence: Math.max(input.route.confidence, 0.89),
      replyStrategy: this.replyStrategyForIntent(
        userIntent,
        input.route.replyStrategy,
      ),
      shouldSearch:
        userIntent === 'social_search' ||
        userIntent === 'activity_search' ||
        userIntent === 'candidate_followup',
      shouldUpdateProfile:
        userIntent === 'profile_enrichment' ||
        userIntent === 'profile_enrichment_request' ||
        userIntent === 'profile_update',
      shouldExecuteAction: userIntent === 'action_request',
    });

    return this.decision(
      route,
      this.modeForPlan(userIntent, tools, plan.needUserConfirmation),
      notes,
      plan.needUserConfirmation || userIntent === 'unknown',
      shouldExecuteTool,
      {
        plannerSource: 'deepseek',
        userIntent,
        reason: cleanDisplayText(plan.reason, ''),
        responseGoal:
          cleanDisplayText(plan.responseGoal, '') ||
          cleanDisplayText(plan.state, ''),
        needUserConfirmation: plan.needUserConfirmation,
        tools,
      },
    );
  }

  private safetyClampIntent(
    planned: SocialAgentIntentType,
    ruleIntent: SocialAgentIntentType,
    input: SocialAgentBrainTurnInput,
  ): SocialAgentIntentType {
    const plannedSocialExecution =
      planned === 'social_search' ||
      planned === 'activity_search' ||
      planned === 'candidate_followup';
    if (planned === 'action_request') {
      return hasExistingSocialActionContext(input)
        ? planned
        : ruleIntent === 'action_request'
          ? 'unknown'
          : ruleIntent;
    }
    if (
      plannedSocialExecution &&
      (input.route.shouldSearch === true ||
        hasExplicitSocialExecutionIntent(input.message) ||
        hasExistingSocialExecutionContext(input))
    ) {
      return planned;
    }
    if (plannedSocialExecution) {
      return isSocialExecutionIntent(ruleIntent) ? 'casual_chat' : ruleIntent;
    }
    if (
      ruleIntent === 'correction_or_clarification' ||
      ruleIntent === 'profile_enrichment' ||
      ruleIntent === 'profile_enrichment_request' ||
      ruleIntent === 'workflow_help'
    ) {
      return ruleIntent;
    }
    return planned;
  }

  private modeForPlan(
    intent: SocialAgentIntentType,
    tools: SocialAgentBrainPlannedTool[],
    needUserConfirmation: boolean,
  ): SocialAgentBrainTurnDecision['conversationMode'] {
    if (needUserConfirmation || intent === 'unknown') return 'clarify';
    if (
      tools.some((tool) => tool.name === 'update_profile_from_agent_context')
    ) {
      return 'profile_update_tool';
    }
    if (intent === 'workflow_help') return 'workflow_help';
    if (intent === 'fitness_math') return 'answer';
    if (intent === 'profile_enrichment') return 'profile_enrichment';
    if (intent === 'profile_enrichment_request') return 'profile_enrichment';
    if (intent === 'correction_or_clarification') return 'profile_correction';
    if (
      intent === 'social_search' ||
      intent === 'activity_search' ||
      intent === 'candidate_followup'
    )
      return 'search';
    if (intent === 'action_request') return 'action';
    return 'answer';
  }

  private modelFor(useCase: 'brain'): string {
    if (this.modelRouter) return this.modelRouter.getModel(useCase);
    return (
      this.configuredModel(this.config?.get<string>('AGENT_BRAIN_MODEL')) ||
      this.configuredModel(this.config?.get<string>('AGENT_PLANNER_MODEL')) ||
      this.configuredModel(this.config?.get<string>('DEEPSEEK_CHAT_MODEL')) ||
      SOCIAL_AGENT_DEFAULT_REASONING_MODEL
    );
  }

  private configuredModel(value?: string | null): string | null {
    return selectSocialAgentConfiguredModel(value, {
      allowFast: false,
    });
  }

  private plannerTimeoutMs(useCase?: 'brain'): number {
    if (useCase && this.modelRouter)
      return this.modelRouter.getTimeout(useCase);
    const configured = Number(
      this.config?.get<string>('SOCIAL_AGENT_BRAIN_LLM_TIMEOUT_MS') ??
        this.config?.get<string>('SOCIAL_AGENT_PLANNER_TIMEOUT_MS') ??
        this.config?.get<string>('SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS') ??
        this.config?.get<string>('DEEPSEEK_TIMEOUT_MS') ??
        `${SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS}`,
    );
    if (!Number.isFinite(configured) || configured <= 0) {
      return SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS;
    }
    return Math.min(
      Math.max(configured, SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS),
      60_000,
    );
  }

  private logModelCall(input: {
    useCase: string;
    model: string;
    intent?: unknown;
    latencyMs: number;
    success: boolean;
    reason?: string;
  }): void {
    this.logger.log(
      JSON.stringify({
        event: 'social_agent.model_call',
        useCase: input.useCase,
        model: input.model,
        taskId: null,
        intent: typeof input.intent === 'string' ? input.intent : null,
        latencyMs: input.latencyMs,
        success: input.success,
        ...(input.reason ? { reason: input.reason } : {}),
      }),
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  private overrideRoute(
    route: SocialAgentIntentRouterResult,
    intent: SocialAgentIntentType,
    overrides: Partial<SocialAgentIntentRouterResult> = {},
  ): SocialAgentIntentRouterResult {
    const replyStrategy =
      overrides.replyStrategy ??
      this.replyStrategyForIntent(intent, route.replyStrategy);
    return {
      ...route,
      ...overrides,
      intent,
      replyStrategy,
      shouldSearch:
        intent === 'social_search' ||
        intent === 'activity_search' ||
        intent === 'candidate_followup'
          ? (overrides.shouldSearch ?? route.shouldSearch)
          : false,
      shouldReplan:
        intent === 'social_search' ||
        intent === 'activity_search' ||
        intent === 'candidate_followup'
          ? (overrides.shouldReplan ?? route.shouldReplan)
          : false,
      shouldExecuteAction:
        intent === 'action_request'
          ? (overrides.shouldExecuteAction ?? route.shouldExecuteAction)
          : false,
    };
  }

  private replyStrategyForIntent(
    intent: SocialAgentIntentType,
    fallback: SocialAgentReplyStrategy,
  ): SocialAgentReplyStrategy {
    if (
      intent === 'product_help' ||
      intent === 'workflow_help' ||
      intent === 'fitness_math' ||
      intent === 'profile_enrichment' ||
      intent === 'profile_enrichment_request' ||
      intent === 'correction_or_clarification' ||
      intent === 'casual_chat' ||
      intent === 'unknown'
    ) {
      return 'conversational_answer';
    }
    if (intent === 'social_search') return 'search_candidates';
    if (intent === 'activity_search') return 'search_activities';
    if (intent === 'candidate_followup') return 'search_candidates';
    if (intent === 'action_request') return 'execute_action';
    return fallback;
  }

  private isCorrectionOrClarification(message: string): boolean {
    return /(不是不是|不是这个意思|我的意思是|我说的是|你懂没懂我的意思|没懂我的意思|你理解错了|你理解错|刚才不是.*搜索|上面.*画像|上面.*人物画像|那是我的画像|不是要搜索)/i.test(
      message,
    );
  }

  private isSocialContinuationCorrection(
    message: string,
    input: SocialAgentBrainTurnInput,
  ): boolean {
    const text = cleanDisplayText(message, '').trim().toLowerCase();
    if (!this.isCorrectionOrClarification(text)) return false;
    if (this.isProfileEnrichmentRequest(text)) return false;
    if (
      /(上面|刚才).{0,12}(画像|人物画像|ai画像)|不是.{0,8}搜索|不是.{0,8}找人/i.test(
        text,
      )
    ) {
      return false;
    }
    const hasSocialContext = hasExistingSocialExecutionContext(input);
    const hasSearchIntent = hasExplicitSocialExecutionIntent(text);
    const hasConcreteSocialCriteria =
      /(找|搜索|推荐|匹配|候选|搭子|女生|男生|舞蹈|舞蹈生|同校|青岛大学|大学|散步|跑步|羽毛球|篮球|户外|今晚|今天晚上|明天|周末|附近)/i.test(
        text,
      );
    return hasSearchIntent || (hasSocialContext && hasConcreteSocialCriteria);
  }

  private isProfileEnrichmentRequest(message: string): boolean {
    return /(帮我完善.*画像|完善.*人物画像|完善.*AI画像|完善.*ai画像|调用工具.*画像|写入.*画像|保存.*画像|存到.*画像|把刚才.*画像|把上面.*画像)/i.test(
      message,
    );
  }

  private isExplicitProfileSaveRequest(message: string): boolean {
    return /(调用工具|保存|写入|存到|确认|对[，,]?|可以保存|帮我完善.*ai画像|帮我完善.*AI画像)/i.test(
      message,
    );
  }

  private isWorkflowQuestion(message: string): boolean {
    if (
      /(帮我找|给我找|搜索|推荐.*人|找.*搭子|找.*候选|找.*女生|找.*男生)/i.test(
        message,
      )
    ) {
      return false;
    }
    return /(先.*画像.*约练|先.*完善.*画像|直接发布需求|怎么开始约练|下一步|需要怎么做|怎么做|流程|新用户.*先做什么)/i.test(
      message,
    );
  }

  private hasRichProfileFacts(message: string): boolean {
    const signals = [
      /(?:我是|本人|我)\s*(?:白羊|金牛|双子|巨蟹|狮子|处女|天秤|天蝎|射手|摩羯|水瓶|双鱼)?\s*(?:男|女)/i,
      /\b(?:infp|enfp|intj|entj|intp|entp|isfp|istp|isfj|istj|esfp|estp|esfj|estj|infj|enfj)\b/i,
      /(?:身高|高)\s*\d{2,3}/i,
      /(?:体重|重)\s*\d{2,3}\s*(?:kg|公斤|斤)?/i,
      /(?:\d{1,2})\s*(?:岁|周岁)/i,
      /(?:在|常住|住在).{0,20}(?:青岛|北京|上海|大学|校区|崂山区|市南区|市北区)/i,
      /(?:性格|比较|偏).{1,20}/i,
      /(?:想找|想认识|希望认识).{1,30}/i,
      /(?:喜欢|爱好).{1,30}/i,
      /(?:周末|下午|晚上|工作日|有空)/i,
    ];
    return (
      signals.reduce(
        (count, pattern) => count + (pattern.test(message) ? 1 : 0),
        0,
      ) >= 2
    );
  }
}
