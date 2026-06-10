import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Agent, run, tool } from '@openai/agents';
import { z } from 'zod';

import { cleanDisplayText } from '../common/display-text.util';
import { AgentLoopService } from './agent-loop.service';
import {
  enforceFitMeetAlphaStructuredIntentHandoff,
  FitMeetAlphaStructuredIntentSchema as StructuredIntentSchema,
  normalizeFitMeetAlphaStructuredIntentOutput,
} from './fitmeet-alpha-structured-intent';
import type {
  FitMeetAlphaAgentName,
  FitMeetAgentSafety,
  FitMeetAgentTrace,
  FitMeetAlphaCard,
  FitMeetAlphaTurnDecision,
  FitMeetAlphaTurnInput,
} from './fitmeet-alpha-agent.types';
import {
  FITMEET_ALPHA_AGENT_HANDOFFS,
  FITMEET_ALPHA_AGENT_PATH,
  fitMeetAlphaAgentForNextAgent,
} from './fitmeet-alpha-agent-topology';
import { CardCopywriterService } from './response-quality/card-copywriter.service';
import { SafetyCopyService } from './response-quality/safety-copy.service';
import { TonePolicyService } from './response-quality/tone-policy.service';

type AlphaAgentBundle = {
  mainAgent: Agent<any, any>;
  traceTemplate: Omit<FitMeetAgentTrace, 'traceId' | 'sdkEnabled' | 'model'>;
};

@Injectable()
export class FitMeetAlphaAgentSdkService {
  private readonly logger = new Logger(FitMeetAlphaAgentSdkService.name);
  private bundle: AlphaAgentBundle | null = null;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly agentLoop?: AgentLoopService,
    @Optional() private readonly tone?: TonePolicyService,
    @Optional() private readonly safetyCopy?: SafetyCopyService,
    @Optional() private readonly cardCopywriter?: CardCopywriterService,
  ) {}

  async prepareTurn(
    input: FitMeetAlphaTurnInput,
  ): Promise<FitMeetAlphaTurnDecision> {
    const message = cleanDisplayText(input.message, '').trim();
    const traceId = this.createTraceId(input.ownerUserId, input.taskId);
    const safety = this.evaluateSafety(message);
    const sdkEnabled = this.isSdkEnabled();
    const model = this.modelName();
    const bundle = this.getBundle();
    const agentTrace: FitMeetAgentTrace = {
      traceId,
      sdkEnabled,
      model,
      ...bundle.traceTemplate,
      guardrails: [
        {
          name: 'fitmeet-main-agent-input-safety',
          status: safety.blocked ? 'blocked' : 'passed',
          reasons: safety.reasons,
        },
      ],
    };

    if (safety.blocked) {
      return {
        traceId,
        safety,
        agentTrace,
        cards: [this.safetyCard(traceId, safety)],
        assistantMessage:
          this.safetyCopy?.refusal(safety) ||
          '这个请求涉及安全或合规风险，我不能帮你执行匹配、联系或线下邀约。你可以换成公开、尊重边界的社交需求，例如“周末下午找同城跑步搭子”。',
        structuredIntent: enforceFitMeetAlphaStructuredIntentHandoff({
          intent: 'blocked',
          needState: 'safety_blocked',
          readiness: 'block',
          requiresSearch: false,
          requiresSafetyBoundary: true,
          requiresConfirmation: true,
        }),
      };
    }

    if (!sdkEnabled) {
      return {
        traceId,
        safety,
        agentTrace: {
          ...agentTrace,
          ...this.traceSubagents(
            enforceFitMeetAlphaStructuredIntentHandoff(
              this.ruleStructuredIntent(message),
            ),
            message,
          ),
        },
        cards: [],
        structuredIntent: enforceFitMeetAlphaStructuredIntentHandoff(
          this.ruleStructuredIntent(message),
        ),
      };
    }

    try {
      const result = await run(
        bundle.mainAgent,
        JSON.stringify({
          userMessage: message,
          permissionMode: input.permissionMode ?? 'normal',
          taskId: input.taskId ?? null,
          context: input.context ?? {},
        }),
        {
          context: {
            ownerUserId: input.ownerUserId,
            taskId: input.taskId ?? null,
            traceId,
          },
        },
      );
      const structuredIntent = normalizeFitMeetAlphaStructuredIntentOutput({
        output: result.finalOutput,
        fallbackMessage: message,
        fallbackIntent: (fallbackMessage) =>
          this.ruleStructuredIntent(fallbackMessage),
      });
      return {
        traceId,
        safety,
        agentTrace: {
          ...agentTrace,
          ...this.traceSubagents(structuredIntent, message),
        },
        cards: [],
        structuredIntent,
      };
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'fitmeet.alpha_agents.sdk_failed',
          traceId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return {
        traceId,
        safety,
        agentTrace: {
          ...agentTrace,
          guardrails: [
            ...agentTrace.guardrails,
            { name: 'openai-agents-sdk-run', status: 'skipped' },
          ],
          ...this.traceSubagents(this.ruleStructuredIntent(message), message),
        },
        cards: [],
        structuredIntent: this.ruleStructuredIntent(message),
      };
    }
  }

  buildResultCards(input: {
    taskId: number;
    socialRequestDraft?: Record<string, unknown> | null;
    candidates?: Array<Record<string, unknown>>;
    approvalRequiredActions?: Array<Record<string, unknown>>;
    safety?: FitMeetAgentSafety;
    traceId?: string;
    lifeGraphSignals?: Record<string, unknown> | null;
  }): FitMeetAlphaCard[] {
    const cards: FitMeetAlphaCard[] = [];
    const taskId = input.taskId;
    const draft = input.socialRequestDraft;
    if (draft) {
      cards.push(
        this.cardCopywriter?.activityPlan({
          taskId,
          draft,
          traceId: input.traceId ?? null,
          lifeGraphSignals: input.lifeGraphSignals ?? null,
        }) ?? {
          id: `activity_plan:${taskId}`,
          type: 'activity_plan',
          title: '约练计划待确认',
          body: `${
            this.text(draft.description) ||
            this.text(draft.rawText) ||
            this.text(draft.title) ||
            '我已整理好本次社交需求，确认后才会继续创建。'
          } 我不会共享你的精确位置，第一次建议选择公共场所。活动开始前我会提醒你确认是否到达，结束后会提醒你评价体验。`,
          status: 'waiting_confirmation',
          data: {
            taskId,
            socialRequestId: draft.socialRequestId ?? null,
            city: draft.city ?? '',
            activityType: draft.activityType ?? '',
            interestTags: draft.interestTags ?? [],
            publicPlaceOnly: true,
            noPreciseLocation: true,
            checkinReminder: '活动开始前我会提醒你确认是否到达。',
            reviewPrompt: '活动结束后我会提醒你评价体验。',
            meetLoopStage: 'activity_confirmation',
            safetyBoundary: '优先公共场所，不共享精确位置。',
            lifeGraphUpdatePreview:
              '完成后会更新你的低压力运动社交偏好和同区域搭子权重。',
            trustScoreUpdatePreview:
              '完成与评价会写入 trust score，用来提升后续推荐可信度。',
          },
          actions: [
            {
              id: 'confirm_create_activity',
              label: '确认创建约练',
              action: 'create_activity',
              schemaAction: 'activity.confirm_create',
              loopStage: 'activity_draft_created',
              requiresConfirmation: true,
              payload: { taskId, socialRequestDraft: draft },
            },
          ],
        },
      );
    }

    for (const candidate of (input.candidates ?? []).slice(0, 8)) {
      if (this.cardCopywriter) {
        cards.push(
          this.cardCopywriter.candidate({
            taskId,
            candidate,
            draft: draft ?? null,
            lifeGraphSignals: input.lifeGraphSignals ?? null,
          }),
        );
        continue;
      }
      const targetUserId =
        candidate.targetUserId ?? candidate.candidateUserId ?? candidate.userId;
      const score = Number(candidate.matchScore ?? candidate.score ?? 0);
      const displayName =
        this.text(candidate.displayName) ||
        this.text(candidate.nickname) ||
        '候选人';
      const cardIdentity =
        typeof targetUserId === 'string' || typeof targetUserId === 'number'
          ? String(targetUserId)
          : displayName;
      cards.push({
        id: `candidate_card:${taskId}:${cardIdentity}`,
        type: 'candidate_card',
        title: displayName,
        body: `匹配度 ${Math.round(score)}。推荐前先确认安全边界，首次见面建议选择公共场所。`,
        status: 'waiting_confirmation',
        data: {
          taskId,
          loopStage: 'candidate_recommendation',
          targetUserId,
          candidateRecordId: candidate.candidateRecordId ?? null,
          publicIntentId: candidate.publicIntentId ?? null,
          socialRequestId: candidate.socialRequestId ?? null,
          matchScore: score,
          reasons:
            candidate.matchReasons ??
            candidate.reasons ??
            candidate.candidateExplanation?.['fitReasons'] ??
            [],
          safetyTips:
            candidate.riskWarnings ??
            candidate.risk?.['warnings'] ??
            candidate.candidateExplanation?.['awkwardPoints'] ??
            [],
          suggestedOpener:
            candidate.suggestedOpener ??
            candidate.suggestedMessage ??
            candidate.candidateExplanation?.['suggestedOpener'] ??
            '',
          recommendationLine: `我推荐 ${displayName}，因为你们的需求和边界比较接近。`,
          fitReasons:
            candidate.matchReasons ??
            candidate.reasons ??
            candidate.candidateExplanation?.['fitReasons'] ??
            [],
          whyNow: '现在适合先用低压力方式开场，再根据回复决定下一步。',
          safetyBoundary: '第一次建议选择公共场所，不共享精确位置。',
          nextActions: [
            '生成开场白',
            '看看更多',
            '只看同校',
            '只看女生',
            '创建约练',
            '不喜欢这个推荐',
          ],
          lifeGraphUpdatePreview:
            '完成后会更新你的低压力运动社交偏好和同区域搭子权重。',
        },
        actions: [
          {
            id: 'generate_opener',
            label: '生成开场白',
            action: 'generate_opener',
            schemaAction: 'candidate.generate_opener',
            loopStage: 'candidate_selected',
            requiresConfirmation: false,
            payload: { taskId, targetUserId, candidate },
          },
          {
            id: 'see_more',
            label: '看看更多',
            action: 'see_more',
            schemaAction: 'candidate.more_like_this',
            loopStage: 'candidate_recommendation',
            requiresConfirmation: false,
            payload: { taskId },
          },
          {
            id: 'filter_school',
            label: '只看同校',
            action: 'filter_school',
            schemaAction: 'candidate.more_like_this',
            loopStage: 'candidate_recommendation',
            requiresConfirmation: false,
            payload: { taskId },
          },
          {
            id: 'filter_gender_female',
            label: '只看女生',
            action: 'filter_gender_female',
            schemaAction: 'candidate.more_like_this',
            loopStage: 'candidate_recommendation',
            requiresConfirmation: false,
            payload: { taskId },
          },
          {
            id: 'create_activity',
            label: '创建约练',
            action: 'create_activity',
            schemaAction: 'activity.confirm_create',
            loopStage: 'activity_draft_created',
            requiresConfirmation: true,
            payload: { taskId, targetUserId, candidate },
          },
          {
            id: 'dislike_candidate',
            label: '不喜欢这个推荐',
            action: 'dislike_candidate',
            schemaAction: 'candidate.skip',
            loopStage: 'candidate_recommendation',
            requiresConfirmation: false,
            payload: { taskId, targetUserId, candidate },
          },
        ],
      });
    }

    const safety = input.safety ?? this.defaultSafety();
    cards.push(this.safetyCard(input.traceId ?? `task:${taskId}`, safety));

    if ((input.approvalRequiredActions ?? []).length > 0) {
      cards.push(
        this.cardCopywriter?.auditUpdate({
          taskId,
          approvalRequiredActions: input.approvalRequiredActions ?? [],
        }) ?? {
          id: `audit_update:${taskId}:approval`,
          type: 'audit_update',
          title: '有动作需要你确认',
          body: `当前有 ${(input.approvalRequiredActions ?? []).length} 个动作需要你确认后才会继续。`,
          status: 'waiting_confirmation',
          data: {
            taskId,
            approvalRequiredActions: input.approvalRequiredActions ?? [],
          },
          actions: [],
        },
      );
    }

    return cards;
  }

  private subagentObservations(
    structuredIntent: Record<string, unknown>,
  ): NonNullable<FitMeetAgentTrace['observations']> {
    const nextAgent =
      fitMeetAlphaAgentForNextAgent(structuredIntent.nextAgent) ??
      'FitMeet Main Agent';
    const readiness =
      typeof structuredIntent.readiness === 'string'
        ? structuredIntent.readiness
        : null;
    const intent =
      typeof structuredIntent.intent === 'string'
        ? structuredIntent.intent
        : null;
    const shouldSearch = structuredIntent.requiresSearch === true;
    const requiresConfirmation = structuredIntent.requiresConfirmation === true;
    return [
      {
        agent: nextAgent,
        intent,
        readiness,
        nextAction: shouldSearch
          ? 'plan_tool_search'
          : requiresConfirmation
            ? 'wait_user_confirmation'
            : readiness === 'clarify'
              ? 'ask_clarifying_question'
              : 'answer_directly',
        critique: this.subagentCritique(nextAgent, structuredIntent),
      },
    ];
  }

  private traceSubagents(
    structuredIntent: Record<string, unknown>,
    message: string,
  ): Pick<FitMeetAgentTrace, 'observations' | 'subagentHandoffs'> {
    const observations = this.subagentObservations(structuredIntent);
    const agent = observations[0]?.agent ?? 'FitMeet Main Agent';
    return {
      observations,
      subagentHandoffs: [
        this.agentLoop?.buildHandoff({
          agent,
          input: {
            message,
            structuredIntent,
          },
          toolNames: this.toolNamesForSubagent(agent),
          observation: {
            intent: structuredIntent.intent ?? null,
            readiness: structuredIntent.readiness ?? null,
            requiresSearch: structuredIntent.requiresSearch === true,
            requiresConfirmation:
              structuredIntent.requiresConfirmation === true,
          },
          handoffOutput: {
            nextAgent: structuredIntent.nextAgent ?? null,
            nextAction: observations[0]?.nextAction ?? null,
          },
        }) ?? {
          agent,
          input: { message, structuredIntent },
          toolCalls: [],
          observation: {},
          critique: 'AgentLoopService unavailable; handoff trace only.',
          handoffOutput: {},
        },
      ],
    };
  }

  private toolNamesForSubagent(agent: FitMeetAlphaAgentName): string[] {
    if (agent === 'Life Graph Agent') {
      return ['get_user_profile', 'update_profile_from_agent_context'];
    }
    if (agent === 'Social Match Agent') {
      return ['create_social_request', 'search_real_candidates'];
    }
    if (agent === 'Meet Loop Agent') {
      return ['send_message_to_candidate', 'create_activity'];
    }
    if (agent === 'Math Agent') return ['calculate_fitness_math'];
    return [];
  }

  private subagentCritique(
    agentName: FitMeetAgentTrace['agentPath'][number],
    structuredIntent: Record<string, unknown>,
  ): string {
    if (structuredIntent.readiness === 'clarify') {
      return `${agentName} should ask one low-pressure clarification before calling tools.`;
    }
    if (structuredIntent.requiresSearch === true) {
      return `${agentName} should emit a plan, call owned tools, observe results, then replan only if evidence is insufficient.`;
    }
    if (structuredIntent.requiresConfirmation === true) {
      return `${agentName} should keep the action behind user confirmation and record the decision.`;
    }
    return `${agentName} can answer directly and update memory only after explicit user consent.`;
  }

  private getBundle(): AlphaAgentBundle {
    if (this.bundle) return this.bundle;

    const classifyNeed = tool({
      name: 'classify_fitmeet_social_need',
      description:
        'Parse a FitMeet user message into the Beta social agent intent contract.',
      parameters: z.object({
        userMessage: z.string(),
      }),
      execute: ({ userMessage }) => this.ruleStructuredIntent(userMessage),
    });

    const lifeGraphAgent = new Agent({
      name: 'Life Graph Agent',
      handoffDescription:
        '用户私人画像与生活习惯智能体，判断偏好、边界、时间、地点和画像更新。',
      instructions:
        '你是 FitMeet Life Graph Agent。只分析用户授权画像、生活节奏、运动习惯、社交边界和画像更新建议。你的输出要说明哪些信息来自用户已授权上下文、哪些仍需补问。不要执行联系、邀约、发消息等外部动作。',
      outputType: StructuredIntentSchema,
      tools: [classifyNeed],
    });

    const socialMatchAgent = new Agent({
      name: 'Social Match Agent',
      handoffDescription:
        '社交需求解析与候选匹配智能体，把自然语言需求转为结构化请求并解释候选推荐。',
      instructions:
        '你是 FitMeet Social Match Agent。把用户需求转成结构化社交请求，关注同城社交、约练、找搭子、找朋友和相亲恋爱。输出必须包含活动类型、地点、时间、人群目标、硬约束、可选偏好、缺失信息、推荐原因和安全边界。',
      outputType: StructuredIntentSchema,
      tools: [classifyNeed],
    });

    const meetLoopAgent = new Agent({
      name: 'Meet Loop Agent',
      handoffDescription:
        '约练/线下活动闭环智能体，负责开场白、邀请、活动创建、签到、评价和回写建议。',
      instructions:
        '你是 FitMeet Meet Loop Agent。你负责把候选推进为可确认动作：开场白、邀请、活动创建、签到、评价和 Life Graph 回写建议。任何发消息、加好友、创建线下活动、交换联系方式、签到、评价都必须等待用户确认。',
      outputType: StructuredIntentSchema,
      tools: [classifyNeed],
    });

    const mathAgent = new Agent({
      name: 'Math Agent',
      handoffDescription:
        '轻量运动计算智能体，处理配速、时间、距离和基础热量估算，不读写用户数据。',
      instructions:
        '你是 FitMeet Math Agent。只做无副作用运动计算，例如配速、距离、时间、粗略热量估算和训练节奏解释。不要给医疗建议，不要读取或写入用户画像，不要搜索候选人，不要创建活动。输出必须说明估算前提。',
      outputType: StructuredIntentSchema,
      tools: [classifyNeed],
    });

    const inputGuardrail = {
      name: 'fitmeet-main-agent-input-safety',
      runInParallel: false,
      execute: ({ input }) => {
        const text = typeof input === 'string' ? input : JSON.stringify(input);
        const safety = this.evaluateSafety(text);
        return Promise.resolve({
          tripwireTriggered: safety.blocked,
          outputInfo: safety,
        });
      },
    };

    const mainAgent = new Agent({
      name: 'FitMeet Main Agent',
      handoffDescription: 'FitMeet Agent 总入口、总调度器和安全边界控制器。',
      instructions:
        '你是 FitMeet Main Agent。先做安全过滤，再判断意图，必要时 handoff 给 Life Graph Agent、Social Match Agent、Meet Loop Agent 或 Math Agent。不要直接执行数据库或外部动作；所有发消息、加好友、创建线下活动和敏感画像更新都必须用户确认。输出必须符合结构化 schema，并给出 Beta 阶段可执行的 agentPlan。',
      handoffs: [lifeGraphAgent, socialMatchAgent, meetLoopAgent, mathAgent],
      inputGuardrails: [inputGuardrail],
      outputType: StructuredIntentSchema,
      tools: [classifyNeed],
    });

    const bundle: AlphaAgentBundle = {
      mainAgent,
      traceTemplate: {
        agentPath: [...FITMEET_ALPHA_AGENT_PATH],
        handoffs: FITMEET_ALPHA_AGENT_HANDOFFS.map((handoff) => ({
          ...handoff,
        })),
        guardrails: [],
      },
    };
    this.bundle = bundle;
    return bundle;
  }

  private isSdkEnabled(): boolean {
    const enabled = this.config.get<string>('OPENAI_AGENTS_SDK_ENABLED');
    if (enabled === 'false') return false;
    return Boolean(this.config.get<string>('OPENAI_API_KEY'));
  }

  private modelName(): string {
    return (
      this.config.get<string>('OPENAI_AGENTS_MODEL') ||
      this.config.get<string>('OPENAI_MODEL') ||
      'gpt-5.4-mini'
    );
  }

  private evaluateSafety(message: string): FitMeetAgentSafety {
    const text = cleanDisplayText(message, '').toLowerCase();
    const checks: Array<{ re: RegExp; reason: string }> = [
      {
        re: /(未成年|小学生|初中生|高中生|幼女|幼男|minor|underage)/i,
        reason: '涉及未成年人风险',
      },
      {
        re: /(约炮|色情|裸照|性交易|卖淫|嫖|porn|escort)/i,
        reason: '涉及色情或性交易风险',
      },
      {
        re: /(人肉|跟踪|骚扰|堵门|偷拍|尾随|stalk|harass)/i,
        reason: '涉及骚扰或跟踪风险',
      },
      {
        re: /(诈骗|洗钱|套现|网赌|引流|杀猪盘|骗钱|scam)/i,
        reason: '涉及诈骗或违法引导',
      },
      {
        re: /(打人|威胁|报复|弄死|砍|knife|kill|violence)/i,
        reason: '涉及暴力威胁风险',
      },
      {
        re: /(批量私信|群发骚扰|轰炸|自动加.*好友|spam)/i,
        reason: '涉及批量骚扰或滥用',
      },
      {
        re: /(精确定位|实时位置|跟踪位置|查.*位置|定位.*她|定位.*他|住址|宿舍号)/i,
        reason: '涉及精确位置或隐私风险',
      },
      {
        re: /(深夜|凌晨).*(私密|酒店|宾馆|家里|单独房间|偏僻)/i,
        reason: '涉及深夜私密场所风险',
      },
      {
        re: /(要.*微信|要.*手机号|交换.*联系方式|私下转账)/i,
        reason: '涉及联系方式或站外交易，需要严格确认',
      },
    ];
    const reasons = checks
      .filter((check) => check.re.test(text))
      .map((check) => check.reason);
    const blocked = reasons.some((reason) => !reason.includes('联系方式'));
    return {
      blocked,
      level: blocked ? 'blocked' : reasons.length > 0 ? 'medium' : 'low',
      reasons,
      boundaryNotes: [
        '首次联系、加好友、创建线下活动必须由用户确认。',
        '首次见面建议选择公共场所，不自动交换联系方式或实时位置。',
        'Life Graph 更新需展示给用户确认，可撤回、可纠正。',
      ],
      requiredConfirmations: [
        '发送第一条消息',
        '加好友或建立连接',
        '创建约练/线下活动',
        '交换联系方式或位置',
        '保存敏感画像更新',
      ],
    };
  }

  private ruleStructuredIntent(message: string): Record<string, unknown> {
    const text = cleanDisplayText(message, '').toLowerCase();
    const activityType = this.extractActivityType(text);
    const timePreference = this.extractTimePreference(text);
    const locationText = this.extractLocationText(text);
    const targetPeople = this.extractTargetPeople(text);
    const relationshipGoal = this.extractRelationshipGoal(text);
    const missingInformation = this.missingInformationFor({
      text,
      activityType,
      timePreference,
      locationText,
    });
    const requiredConstraints = this.requiredConstraintsFor({
      activityType,
      timePreference,
      locationText,
      relationshipGoal,
    });
    const optionalPreferences = this.optionalPreferencesFor(text);
    const agentPlan = this.agentPlanFor(missingInformation);
    const ambiguous = this.ambiguousLowPressureIntent({
      text,
      activityType,
      timePreference,
      locationText,
    });

    if (ambiguous) {
      return {
        intent: 'general_social_need',
        nextAgent: 'answer',
        activityType,
        locationText,
        timePreference,
        relationshipGoal: relationshipGoal || '低压力陪伴',
        targetPeople: targetPeople || '合适的人',
        missingInformation: ambiguous.missingInformation,
        requiredConstraints,
        optionalPreferences: ['低压力开场', ...optionalPreferences],
        agentPlan: [
          'Main Agent 先理解用户想要轻松陪伴',
          '先温和补问时间和社交压力偏好',
          '用户补充后再进入 Life Graph 和 Social Match',
        ],
        betaScore: 70,
        needState: 'ambiguous_companionship',
        socialPressureLevel: 'low',
        readiness: 'clarify',
        clarifyingQuestion: ambiguous.question,
        requiresSearch: false,
        requiresSafetyBoundary: true,
        requiresConfirmation: false,
      };
    }

    if (this.isFitnessMathRequest(text)) {
      return {
        intent: 'fitness_math',
        nextAgent: 'math',
        activityType: activityType || '运动',
        locationText,
        timePreference,
        relationshipGoal,
        targetPeople,
        missingInformation: [],
        requiredConstraints,
        optionalPreferences,
        agentPlan: [
          'Math Agent 识别距离、时间、体重或配速信息',
          '只做无副作用估算，不读取或写入用户数据',
          '输出计算结果和估算前提',
        ],
        betaScore: 74,
        needState: 'fitness_math',
        socialPressureLevel: 'low',
        readiness: 'answer',
        clarifyingQuestion: '',
        requiresSearch: false,
        requiresSafetyBoundary: false,
        requiresConfirmation: false,
      };
    }

    if (/变化|记录|更新|审计/.test(text)) {
      return {
        intent: 'view_profile_changes',
        nextAgent: 'life_graph',
        activityType,
        locationText,
        timePreference,
        relationshipGoal,
        targetPeople,
        missingInformation: [],
        requiredConstraints,
        optionalPreferences,
        agentPlan: [
          '展示近期画像变化和触发来源',
          '解释变化如何影响推荐',
          '提供撤回、纠正或保留入口',
        ],
        betaScore: 78,
        needState: 'profile_work',
        socialPressureLevel: 'low',
        readiness: 'answer',
        clarifyingQuestion: '',
        requiresSearch: false,
        requiresSafetyBoundary: false,
        requiresConfirmation: false,
      };
    }
    if (/life graph|画像|完善|补全|资料|边界/.test(text)) {
      return {
        intent: 'complete_life_graph',
        nextAgent: 'life_graph',
        activityType,
        locationText,
        timePreference,
        relationshipGoal,
        targetPeople,
        missingInformation: [
          '常活动区域',
          '可见面时间',
          '社交边界',
          '常见活动类型',
        ],
        requiredConstraints,
        optionalPreferences,
        agentPlan: [
          '读取当前 Life Graph 完整度',
          '只补问影响匹配质量的缺失项',
          '生成画像更新建议并等待用户确认',
          '写入审计记录，允许之后撤回或纠正',
        ],
        betaScore: 84,
        needState: 'profile_work',
        socialPressureLevel: 'low',
        readiness: 'confirm',
        clarifyingQuestion: '',
        requiresSearch: false,
        requiresSafetyBoundary: true,
        requiresConfirmation: true,
      };
    }
    if (/节奏|作息|生活|分析/.test(text)) {
      return {
        intent: 'analyze_life_rhythm',
        nextAgent: 'life_graph',
        activityType,
        locationText,
        timePreference,
        relationshipGoal,
        targetPeople,
        missingInformation: [],
        requiredConstraints,
        optionalPreferences,
        agentPlan: [
          '读取活动、匹配选择和 Life Graph 节奏信号',
          '识别高频空闲时间、运动窗口和社交疲劳点',
          '输出可确认的节奏调整建议',
        ],
        betaScore: 76,
        needState: 'profile_work',
        socialPressureLevel: 'low',
        readiness: 'answer',
        clarifyingQuestion: '',
        requiresSearch: false,
        requiresSafetyBoundary: false,
        requiresConfirmation: false,
      };
    }
    if (/本周|活动|约练|加入|周末/.test(text)) {
      return {
        intent: 'recommend_weekly_activity',
        nextAgent: 'social_match',
        activityType,
        locationText,
        timePreference: timePreference || '本周',
        relationshipGoal,
        targetPeople,
        missingInformation,
        requiredConstraints,
        optionalPreferences,
        agentPlan: [
          '读取本周可用时间和活动半径',
          '搜索可参加活动或可创建的约练机会',
          '按安全边界、距离和履约可信度排序',
          '创建活动或加入活动前等待用户确认',
        ],
        betaScore: 80,
        needState: 'activity_recommendation',
        socialPressureLevel: this.socialPressureLevelFor(text),
        readiness: missingInformation.length > 2 ? 'clarify' : 'search',
        clarifyingQuestion:
          missingInformation.length > 2
            ? '可以。我先帮你找轻松一点、边界清楚的活动。你更想本周哪天，活动范围大概在哪里？'
            : '',
        requiresSearch: missingInformation.length <= 2,
        requiresSafetyBoundary: true,
        requiresConfirmation: true,
      };
    }
    return {
      intent: 'find_nearby_partner',
      nextAgent: 'social_match',
      activityType,
      timePreference,
      locationText,
      relationshipGoal,
      targetPeople,
      missingInformation,
      requiredConstraints,
      optionalPreferences,
      agentPlan,
      betaScore: Math.max(62, 92 - missingInformation.length * 8),
      safetyNotes: [
        '首次联系和线下见面都需要用户确认',
        '不自动交换手机号、微信或实时位置',
        '首次见面建议选择公共场所',
      ],
      needState: 'explicit_search',
      socialPressureLevel: this.socialPressureLevelFor(text),
      readiness: missingInformation.length > 3 ? 'clarify' : 'search',
      clarifyingQuestion:
        missingInformation.length > 3
          ? '可以。我先帮你找轻松一点、不需要太强社交压力的人。你更想今晚附近试试，还是周末下午找个时间？'
          : '',
      requiresSearch: missingInformation.length <= 3,
      requiresSafetyBoundary: true,
      requiresConfirmation: true,
    };
  }

  private safetyCard(id: string, safety: FitMeetAgentSafety): FitMeetAlphaCard {
    if (this.cardCopywriter) return this.cardCopywriter.safetyCard(id, safety);
    return {
      id: `safety_boundary:${id}`,
      type: 'safety_boundary',
      title: safety.blocked ? '我不能继续这个请求' : '本次匹配的安全边界',
      body: safety.blocked
        ? this.safetyCopy?.refusal(safety) ||
          safety.reasons.join('、') ||
          '请求不符合 FitMeet 安全边界。'
        : this.safetyCopy?.boundaryIntro() ||
          '我只负责建议和准备，关键动作由你确认。',
      status: safety.blocked ? 'blocked' : 'ready',
      data: {
        ...(safety as unknown as Record<string, unknown>),
        boundaryNotes:
          this.safetyCopy?.boundaryNotes(safety) ?? safety.boundaryNotes,
      },
      actions: [],
    };
  }

  private defaultSafety(): FitMeetAgentSafety {
    return {
      blocked: false,
      level: 'low',
      reasons: [],
      boundaryNotes: [
        '首次见面建议选择公共场所。',
        '发送消息、加好友和创建活动前需要你确认。',
      ],
      requiredConfirmations: ['发消息', '加好友', '创建活动'],
    };
  }

  private createTraceId(ownerUserId: number, taskId?: number | null): string {
    return `fitmeet-alpha:${ownerUserId}:${taskId ?? 'new'}:${Date.now().toString(36)}`;
  }

  private extractActivityType(text: string): string {
    if (/散步|走走|遛弯|walk/.test(text)) return '散步';
    if (/跑步|夜跑/.test(text)) return '跑步';
    if (/健身|约练|训练/.test(text)) return '健身约练';
    if (/拍照|摄影/.test(text)) return '拍照';
    if (/探店|咖啡|吃饭/.test(text)) return '探店';
    if (/相亲|恋爱/.test(text)) return '相亲恋爱';
    if (/羽毛球|网球|篮球|足球|飞盘/.test(text)) return '球类运动';
    if (/爬山|徒步|露营|户外/.test(text)) return '户外活动';
    return '';
  }

  private isFitnessMathRequest(text: string): boolean {
    return (
      /(配速|热量|卡路里|消耗|公里.*分钟|分钟.*公里|跑.*多久|多久.*跑|bmi|体重指数|心率区间|训练心率|训练量|周跑量|每周.*每次|一周.*每次)/i.test(
        text,
      ) ||
      /(计算|估算).{0,16}(配速|热量|卡路里|消耗|公里|跑步|骑行|游泳|bmi|体重指数|心率|训练量|周跑量)/i.test(
        text,
      ) ||
      /(配速|热量|卡路里|消耗|公里|跑步|骑行|游泳|bmi|体重指数|心率|训练量|周跑量).{0,16}(计算|估算)/i.test(
        text,
      )
    );
  }

  private ambiguousLowPressureIntent(input: {
    text: string;
    activityType: string;
    timePreference: string;
    locationText: string;
  }): { question: string; missingInformation: string[] } | null {
    const wantsCompanion =
      /(无聊|有点闷|走走|散步|陪|找个人|认识人|同频|聊聊|低压力|轻松)/.test(
        input.text,
      ) && /(找|想|帮我|有没有|认识|约|一起)/.test(input.text);
    if (!wantsCompanion) return null;
    const explicitEnough =
      Boolean(input.timePreference) &&
      Boolean(input.locationText) &&
      Boolean(input.activityType);
    if (explicitEnough) return null;
    const missing: string[] = [];
    if (!input.timePreference) missing.push('期望时间');
    if (!input.locationText) missing.push('活动区域');
    if (!/低压力|轻松|随便|安静|热闹|聊天|不聊天|边走边聊/.test(input.text)) {
      missing.push('社交压力偏好');
    }
    return {
      question:
        '可以。我先帮你找轻松一点、不需要太强社交压力的散步搭子。你更想今晚附近走走，还是周末下午找个时间？',
      missingInformation: missing.length ? missing : ['期望时间', '活动区域'],
    };
  }

  private socialPressureLevelFor(text: string): 'low' | 'medium' | 'high' {
    if (/低压力|轻松|随便|走走|散步|慢热|不尴尬|先聊/.test(text)) return 'low';
    if (/相亲|恋爱|认真|长期|高强度|深聊/.test(text)) return 'high';
    return 'medium';
  }

  private extractTimePreference(text: string): string {
    if (/今晚|今天晚上|夜跑/.test(text)) return '今晚';
    if (/明天/.test(text)) return '明天';
    if (/周末|星期六|星期天|周六|周日/.test(text)) return '周末';
    if (/本周|这周/.test(text)) return '本周';
    if (/下班|晚上/.test(text)) return '下班后/晚上';
    if (/上午/.test(text)) return '上午';
    if (/下午/.test(text)) return '下午';
    return '';
  }

  private extractLocationText(text: string): string {
    const knownPlaces = [
      '青岛大学',
      '五四广场',
      '奥帆中心',
      '崂山',
      '市南',
      '市北',
      '黄岛',
      '李沧',
      '同城',
      '附近',
    ];
    const matched = knownPlaces.find((place) => text.includes(place));
    if (matched === '附近' || matched === '同城') return '附近/同城';
    return matched ?? '';
  }

  private extractTargetPeople(text: string): string {
    if (/跑步搭子|夜跑搭子/.test(text)) return '跑步搭子';
    if (/拍照搭子|摄影搭子/.test(text)) return '拍照搭子';
    if (/健身搭子|约练搭子|训练搭子/.test(text)) return '约练搭子';
    if (/相亲|恋爱|对象/.test(text)) return '认真认识的人';
    if (/朋友|新朋友/.test(text)) return '附近朋友';
    if (/搭子/.test(text)) return '同城搭子';
    return '合适的人';
  }

  private extractRelationshipGoal(text: string): string {
    if (/相亲|恋爱|对象/.test(text)) return '相亲恋爱';
    if (/朋友|新朋友/.test(text)) return '找朋友';
    if (/搭子|约练|跑步|拍照|探店|户外/.test(text)) return '找搭子';
    return '真实社交连接';
  }

  private missingInformationFor(input: {
    text: string;
    activityType: string;
    timePreference: string;
    locationText: string;
  }): string[] {
    const missing: string[] = [];
    if (!input.activityType) missing.push('活动类型');
    if (!input.timePreference) missing.push('期望时间');
    if (!input.locationText) missing.push('活动区域');
    if (!/距离|公里|km|附近|同城/.test(input.text)) missing.push('可接受距离');
    if (!/公共|人多|安全|边界|不接受|只接受/.test(input.text))
      missing.push('首次见面边界');
    return missing;
  }

  private requiredConstraintsFor(input: {
    activityType: string;
    timePreference: string;
    locationText: string;
    relationshipGoal: string;
  }): string[] {
    return [
      input.activityType ? `活动类型：${input.activityType}` : '',
      input.timePreference ? `时间：${input.timePreference}` : '',
      input.locationText ? `区域：${input.locationText}` : '',
      input.relationshipGoal ? `目标：${input.relationshipGoal}` : '',
      '首次动作需要用户确认',
      '优先公共场所',
    ].filter(Boolean);
  }

  private optionalPreferencesFor(text: string): string[] {
    const preferences: string[] = [];
    if (/轻松|低压力|随便/.test(text)) preferences.push('低压力开场');
    if (/认真|长期|稳定/.test(text)) preferences.push('更稳定的关系预期');
    if (/同校|校园|大学/.test(text)) preferences.push('同校或校园周边优先');
    if (/女生|男生/.test(text)) preferences.push('按用户授权的人群偏好筛选');
    return preferences;
  }

  private agentPlanFor(missingInformation: string[]): string[] {
    return [
      'Main Agent 完成安全过滤和意图判断',
      'Life Graph Agent 读取授权画像、时间、区域和边界',
      missingInformation.length > 0
        ? `先补问：${missingInformation.slice(0, 3).join('、')}`
        : '信息足够，进入候选搜索',
      'Social Match Agent 生成候选人/活动与推荐解释',
      'Meet Loop Agent 准备开场白、连接或活动创建，等待用户确认后执行',
      '执行结果写入审计，并回写 Life Graph 与 trust score 建议',
    ];
  }

  private includesAny(text: string, words: string[]): boolean {
    return words.some((word) => text.includes(word));
  }

  private text(value: unknown): string {
    return typeof value === 'string' ? cleanDisplayText(value, '').trim() : '';
  }
}
