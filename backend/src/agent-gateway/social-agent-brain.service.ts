import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { cleanDisplayText } from '../common/display-text.util';
import {
  SocialAgentIntentRouterResult,
  SocialAgentIntentType,
  SocialAgentReplyStrategy,
} from './social-agent-intent-router.service';
import { AgentTaskPermissionMode } from './entities/agent-task.entity';
import { FitMeetAgentToolRegistryService } from './fitmeet-agent-tool-registry.service';
import { SocialAgentModelRouterService } from './social-agent-model-router.service';

export interface SocialAgentBrainTurnInput {
  message: string;
  route: SocialAgentIntentRouterResult;
  profile?: Record<string, unknown> | null;
  taskContext?: Record<string, unknown>;
  conversationHistory?: Array<Record<string, unknown>>;
  memoryContext?: unknown;
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

interface SocialAgentLlmPlan {
  userIntent: SocialAgentIntentType;
  reason: string;
  state: string;
  shouldCallTool: boolean;
  tools: SocialAgentBrainPlannedTool[];
  needUserConfirmation: boolean;
  responseGoal: string;
}

@Injectable()
export class SocialAgentBrainService {
  private readonly logger = new Logger(SocialAgentBrainService.name);

  constructor(
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly toolRegistry?: FitMeetAgentToolRegistryService,
    @Optional() private readonly modelRouter?: SocialAgentModelRouterService,
  ) {}

  async planTurn(
    input: SocialAgentBrainTurnInput,
  ): Promise<SocialAgentBrainTurnDecision> {
    const fallback = this.reviewTurn(input);
    if (!this.shouldUseLlmPlanner(input.message)) return fallback;

    try {
      const plan = await this.callDeepSeekPlanner(input, fallback);
      if (!plan) return fallback;
      return this.applyLlmPlan(input, fallback, plan);
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.brain_planner.failed',
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return fallback;
    }
  }

  reviewTurn(input: SocialAgentBrainTurnInput): SocialAgentBrainTurnDecision {
    const message = cleanDisplayText(input.message, '').trim();
    const route = input.route;
    const notes: string[] = [];

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

    if (this.hasRichProfileFacts(message)) {
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

    if (route.intent === 'social_search' || route.intent === 'activity_search') {
      return this.decision(route, 'search', notes, false, route.shouldSearch);
    }

    if (route.intent === 'action_request') {
      return this.decision(route, 'action', notes, false, route.shouldExecuteAction);
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

  private shouldUseLlmPlanner(message: string): boolean {
    if (!cleanDisplayText(message, '').trim()) return false;
    if (this.config?.get<string>('SOCIAL_AGENT_BRAIN_LLM_PLANNER') === 'false') {
      return false;
    }
    return Boolean(this.config?.get<string>('DEEPSEEK_API_KEY'));
  }

  private async callDeepSeekPlanner(
    input: SocialAgentBrainTurnInput,
    fallback: SocialAgentBrainTurnDecision,
  ): Promise<SocialAgentLlmPlan | null> {
    const apiKey = this.config?.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey) return null;
    const baseUrl =
      this.config?.get<string>('DEEPSEEK_BASE_URL') ||
      'https://api.deepseek.com';
    const useCase = 'planner' as const;
    const model = this.modelFor(useCase);
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.plannerTimeoutMs(useCase),
    );
    try {
      const response = await fetch(
        `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: this.modelRouter?.getTemperature(useCase) ?? 0.15,
            response_format: { type: 'json_object' },
            messages: [
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
                  memoryContext: input.memoryContext ?? null,
                  conversationHistory: (input.conversationHistory ?? [])
                    .slice(-10)
                    .map((turn) => ({
                      role: cleanDisplayText(turn.role, ''),
                      text: cleanDisplayText(turn.text ?? turn.content, ''),
                    })),
                }),
              },
            ],
          }),
        },
      );
      if (!response.ok) {
        this.logModelCall({
          useCase,
          model,
          intent: fallback.route.intent,
          latencyMs: Date.now() - startedAt,
          success: false,
          reason: `DeepSeek HTTP ${response.status}`,
        });
        throw new Error(`DeepSeek HTTP ${response.status}`);
      }
      const payload = (await response.json()) as Record<string, unknown>;
      const content = this.readDeepSeekContent(payload);
      const plan = this.normalizeLlmPlan(
        JSON.parse(content) as Record<string, unknown>,
      );
      this.logModelCall({
        useCase,
        model,
        intent: plan?.userIntent ?? fallback.route.intent,
        latencyMs: Date.now() - startedAt,
        success: true,
      });
      return plan;
    } catch (error) {
      this.logModelCall({
        useCase,
        model,
        intent: fallback.route.intent,
        latencyMs: Date.now() - startedAt,
        success: false,
        reason:
          error instanceof Error && error.name === 'AbortError'
            ? 'deepseek_timeout'
            : error instanceof Error
              ? error.message
              : String(error),
      });
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('deepseek_timeout');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private plannerSystemPrompt(): string {
    return [
      '你是 FitMeet Social Agent 的 LLM Planner，只输出 JSON，不输出自然语言。',
      '你的任务是基于用户当前消息、最近上下文和 router 初判，决定下一步做什么。',
      '你会收到 availableTools。只能从 availableTools.name 中选择工具；如果已有上下文足够回答，就不要调用工具。',
      '允许的 userIntent: product_help, workflow_help, casual_chat, profile_enrichment, profile_enrichment_request, correction_or_clarification, social_search, activity_search, candidate_followup, action_request, safety_or_boundary, unknown。',
      '如果用户主要提供个人画像，即使包含“想找同校女生/想认识某类人”，也优先 profile_enrichment；不要立即 social_search，除非用户明确说“现在帮我找/搜索/推荐”。',
      '如果用户说“不是不是/我的意思是/上面是画像”，必须 correction_or_clarification。',
      '如果用户说“调用工具/保存/写入/完善 AI 画像”，可以计划 update_profile_from_agent_context。',
      '如果不确定，needUserConfirmation=true，并把 responseGoal 设为追问澄清。',
      '动作型工具例如 send_message_to_candidate、connect_candidate、create_activity 必须 needUserConfirmation=true，不能假装已经执行。',
      '不要编造候选人、消息、会话或已经执行的动作。',
      'JSON schema: {"intent":"profile_enrichment","reason":"...","state":"profile_building","shouldCallTools":false,"toolCalls":[{"name":"update_profile_from_agent_context","arguments":{}}],"needUserConfirmation":false,"responseGoal":"..."}',
      '兼容字段：userIntent 等同 intent；shouldCallTool 等同 shouldCallTools；tools 等同 toolCalls。',
    ].join('\n');
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
        description: 'Read details and match reasons for one selected candidate.',
        whenToUse:
          'Use when the user asks why a candidate was recommended or wants more detail.',
        requiresConfirmation: false,
        returns: ['candidate', 'matchReasons', 'riskWarnings'],
      },
    ];
  }

  private applyLlmPlan(
    input: SocialAgentBrainTurnInput,
    fallback: SocialAgentBrainTurnDecision,
    plan: SocialAgentLlmPlan,
  ): SocialAgentBrainTurnDecision {
    const ruleSafety = this.reviewTurn(input);
    const notes = [
      ...new Set([
        ...fallback.notes,
        ...ruleSafety.notes,
        'llm_planner_used',
      ]),
    ];
    const userIntent = this.safetyClampIntent(plan.userIntent, ruleSafety.route.intent);
    const tools = this.normalizePlannedTools(plan.tools, userIntent);
    const shouldExecuteTool = tools.length > 0 && plan.shouldCallTool;
    const route = this.overrideRoute(input.route, userIntent, {
      confidence: Math.max(input.route.confidence, 0.89),
      replyStrategy: this.replyStrategyForIntent(userIntent, input.route.replyStrategy),
      shouldSearch:
        userIntent === 'social_search' || userIntent === 'activity_search',
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
  ): SocialAgentIntentType {
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
    if (tools.some((tool) => tool.name === 'update_profile_from_agent_context')) {
      return 'profile_update_tool';
    }
    if (intent === 'workflow_help') return 'workflow_help';
    if (intent === 'profile_enrichment') return 'profile_enrichment';
    if (intent === 'profile_enrichment_request') return 'profile_enrichment';
    if (intent === 'correction_or_clarification') return 'profile_correction';
    if (intent === 'social_search' || intent === 'activity_search') return 'search';
    if (intent === 'action_request') return 'action';
    return 'answer';
  }

  private normalizeLlmPlan(parsed: Record<string, unknown>): SocialAgentLlmPlan {
    const rawIntent = parsed.intent ?? parsed.userIntent;
    const rawTools = Array.isArray(parsed.toolCalls)
      ? parsed.toolCalls
      : Array.isArray(parsed.tools)
        ? parsed.tools
        : [];
    const userIntent = this.allowedIntent(rawIntent)
      ? rawIntent
      : 'unknown';
    return {
      userIntent,
      reason: cleanDisplayText(parsed.reason, ''),
      state: cleanDisplayText(parsed.state, ''),
      shouldCallTool:
        parsed.shouldCallTools === true || parsed.shouldCallTool === true,
      tools: rawTools.flatMap((tool) => {
        if (!this.isRecord(tool)) return [];
        const name = cleanDisplayText(tool.name, '');
        const args = this.isRecord(tool.arguments) ? tool.arguments : {};
        return [{ name, arguments: args }];
      }),
      needUserConfirmation: parsed.needUserConfirmation === true,
      responseGoal: cleanDisplayText(parsed.responseGoal, ''),
    };
  }

  private normalizePlannedTools(
    tools: SocialAgentBrainPlannedTool[],
    intent: SocialAgentIntentType,
  ): SocialAgentBrainPlannedTool[] {
    const allowed = new Set(this.availableTools().map((tool) => tool.name));
    const executableInChat = new Set([
      'get_user_profile',
      'get_conversation_messages',
      'get_candidate_detail',
      'update_profile_from_agent_context',
      'append_profile_memory',
      'search_real_candidates',
      'search_public_intents',
      'create_social_request',
      'send_message_to_candidate',
      'connect_candidate',
      'create_activity',
    ]);
    return tools
      .map((tool) => ({
        ...tool,
        name: this.canonicalToolName(tool.name),
      }))
      .filter((tool) => allowed.has(tool.name))
      .filter((tool) => executableInChat.has(tool.name))
      .filter((tool) => {
        if (tool.name === 'update_profile_from_agent_context') {
          return (
            intent === 'profile_enrichment' ||
            intent === 'profile_enrichment_request' ||
            intent === 'correction_or_clarification'
          );
        }
        if (tool.name === 'append_profile_memory') {
          return (
            intent === 'profile_enrichment' ||
            intent === 'profile_enrichment_request' ||
            intent === 'correction_or_clarification' ||
            intent === 'profile_update'
          );
        }
        if (
          tool.name === 'get_user_profile' ||
          tool.name === 'get_conversation_messages' ||
          tool.name === 'get_candidate_detail'
        ) {
          return true;
        }
        if (tool.name === 'search_real_candidates') return intent === 'social_search';
        if (tool.name === 'search_public_intents') return intent === 'activity_search';
        if (tool.name === 'create_social_request') return intent === 'social_search';
        if (
          tool.name === 'send_message_to_candidate' ||
          tool.name === 'connect_candidate' ||
          tool.name === 'create_activity'
        ) {
          return intent === 'action_request';
        }
        return false;
      });
  }

  private canonicalToolName(name: string): string {
    const normalized = cleanDisplayText(name, '');
    const aliases: Record<string, string> = {
      search_candidates: 'search_real_candidates',
      search_matches: 'search_real_candidates',
      search_real_users: 'search_real_candidates',
      search_activities: 'create_social_request',
      request_action_confirmation: 'send_message_to_candidate',
      update_social_profile: 'update_profile_from_agent_context',
      update_ai_profile: 'update_profile_from_agent_context',
      save_profile_memory: 'update_profile_from_agent_context',
    };
    return aliases[normalized] ?? normalized;
  }

  private allowedIntent(value: unknown): value is SocialAgentIntentType {
    return (
      typeof value === 'string' &&
      [
        'casual_chat',
        'product_help',
        'workflow_help',
        'profile_enrichment',
        'profile_enrichment_request',
        'correction_or_clarification',
        'profile_update',
        'social_search',
        'activity_search',
        'candidate_followup',
        'action_request',
        'safety_or_boundary',
        'unknown',
      ].includes(value)
    );
  }

  private readDeepSeekContent(payload: Record<string, unknown>): string {
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const first = this.isRecord(choices[0]) ? choices[0] : {};
    const message = this.isRecord(first.message) ? first.message : {};
    return cleanDisplayText(message.content, '').trim();
  }

  private modelFor(useCase: 'planner'): string {
    if (this.modelRouter) return this.modelRouter.getModel(useCase);
    return (
      this.config?.get<string>('AGENT_PLANNER_MODEL') ||
      this.config?.get<string>('DEEPSEEK_FAST_MODEL') ||
      this.config?.get<string>('DEEPSEEK_MODEL') ||
      'deepseek-v4-flash'
    );
  }

  private plannerTimeoutMs(useCase?: 'planner'): number {
    if (useCase && this.modelRouter) return this.modelRouter.getTimeout(useCase);
    const configured = Number(
      this.config?.get<string>('SOCIAL_AGENT_BRAIN_LLM_TIMEOUT_MS') ?? '5000',
    );
    if (!Number.isFinite(configured) || configured <= 0) return 5000;
    return Math.min(configured, 8000);
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
        intent === 'social_search' || intent === 'activity_search'
          ? overrides.shouldSearch ?? route.shouldSearch
          : false,
      shouldReplan:
        intent === 'social_search' || intent === 'activity_search'
          ? overrides.shouldReplan ?? route.shouldReplan
          : false,
      shouldExecuteAction:
        intent === 'action_request'
          ? overrides.shouldExecuteAction ?? route.shouldExecuteAction
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
    if (intent === 'action_request') return 'execute_action';
    return fallback;
  }

  private isCorrectionOrClarification(message: string): boolean {
    return /(不是不是|不是这个意思|我的意思是|你理解错了|刚才不是.*搜索|上面.*画像|上面.*人物画像|那是我的画像|不是要搜索)/i.test(
      message,
    );
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
    if (/(帮我找|给我找|搜索|推荐.*人|找.*搭子|找.*候选|找.*女生|找.*男生)/i.test(message)) {
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
    return signals.reduce((count, pattern) => count + (pattern.test(message) ? 1 : 0), 0) >= 2;
  }
}
