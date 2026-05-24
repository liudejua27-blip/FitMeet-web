import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { sanitizeCity } from '../common/city.util';
import { cleanDisplayText } from '../common/display-text.util';
import { resolveDeepSeekModel } from '../common/deepseek.util';
import { SocialAgentMetricsService } from './social-agent-metrics.service';

export type SocialAgentIntentType =
  | 'casual_chat'
  | 'profile_update'
  | 'social_search'
  | 'activity_search'
  | 'candidate_followup'
  | 'action_request'
  | 'safety_or_boundary'
  | 'unknown';

export type SocialAgentReplyStrategy =
  | 'direct_reply'
  | 'ask_clarifying_question'
  | 'append_context'
  | 'search_candidates'
  | 'search_activities'
  | 'execute_action';

export interface SocialAgentIntentEntities {
  city: string;
  activityType: string;
  targetGender: string;
  timePreference: string;
  locationPreference: string;
}

export interface SocialAgentIntentRouterInput {
  message: string;
  taskContext?: Record<string, unknown>;
  profile?: Record<string, unknown>;
  conversationHistory?: Array<Record<string, unknown>>;
}

export interface SocialAgentIntentRouterResult {
  intent: SocialAgentIntentType;
  confidence: number;
  entities: SocialAgentIntentEntities;
  shouldSearch: boolean;
  shouldReplan: boolean;
  shouldUpdateProfile: boolean;
  shouldExecuteAction: boolean;
  replyStrategy: SocialAgentReplyStrategy;
  source: 'rules' | 'deepseek';
}

@Injectable()
export class SocialAgentIntentRouterService {
  private readonly logger = new Logger(SocialAgentIntentRouterService.name);

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly metrics?: SocialAgentMetricsService,
  ) {}

  async route(
    input: SocialAgentIntentRouterInput,
  ): Promise<SocialAgentIntentRouterResult> {
    const message = cleanDisplayText(input.message, '').trim();
    const fallback = this.routeByRules({ ...input, message });
    if (!this.shouldTryDeepSeek(message, fallback)) return fallback;

    const startedAt = Date.now();
    try {
      const enhanced = await this.callDeepSeekRouter(input, fallback);
      this.metrics?.recordLatency(
        'deepseek_intent_route',
        Date.now() - startedAt,
      );
      if (!enhanced) {
        this.metrics?.recordFallback('deepseek_empty');
        return fallback;
      }
      return enhanced;
    } catch (error) {
      this.metrics?.recordLatency(
        'deepseek_intent_route',
        Date.now() - startedAt,
      );
      const reason = error instanceof Error ? error.message : String(error);
      const stage =
        reason === 'deepseek_timeout' ? 'deepseek_timeout' : 'deepseek_error';
      this.metrics?.recordFallback(stage);
      this.metrics?.recordError(stage);
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.intent_router.deepseek_failed',
          reason,
        }),
      );
      return fallback;
    }
  }

  routeByRules(
    input: SocialAgentIntentRouterInput,
  ): SocialAgentIntentRouterResult {
    const message = cleanDisplayText(input.message, '').trim();
    const text = message.toLowerCase();
    const entities = this.extractEntities(message);
    const hasTask = input.taskContext?.hasSearchContext === true;
    const hasCandidates = input.taskContext?.hasCandidates === true;
    const wantsCandidateRefresh =
      /(换一批|换几个|更多|还有|更近|重新找|再找|扩大|放宽)/i.test(text);
    const wantsSocialSearch =
      /(帮我找|给我找|想找|想认识|找一个|找个|找人|找.*搭子|搭子.*有吗|有合适的人吗|合适的人|伙伴|好友|对象|同城朋友|匹配|搜索候选|推荐.*人|附近.*人|同城.*人|真实用户|约练用户|人物画像|画像认证|发布过约练|约练卡片|跑步搭子|拍照搭子|一起.*(咖啡|拍照|跑步|羽毛球|健身|瑜伽|徒步|骑行|city\s*walk|citywalk)|周末.*(咖啡|拍照|跑步|羽毛球|健身|瑜伽|徒步|骑行|city\s*walk|citywalk))/i.test(
        text,
      );
    const wantsActivitySearch =
      /(活动|局|约练活动|羽毛球局|跑团|课程|场地|报名|参加约练|附近有什么|有没有.*局|有什么.*活动)/i.test(
        text,
      );
    const hasCandidateDiscoveryCue = this.hasCandidateDiscoveryCue(
      text,
      wantsSocialSearch,
    );
    const explicitlyAvoidsSending = this.explicitlyAvoidsSending(text);

    if (
      /(你好|hello|hi|嗨|你能做什么|你可以做什么|怎么找搭子|该怎么找|怎么聊天自然|聊天自然|你觉得怎么|建议|聊聊)/i.test(
        text,
      )
    ) {
      return this.result('casual_chat', 0.9, entities, {
        replyStrategy: 'direct_reply',
      });
    }

    if (hasCandidateDiscoveryCue && explicitlyAvoidsSending) {
      return this.result('social_search', 0.93, entities, {
        shouldSearch: true,
        shouldReplan: hasTask,
        replyStrategy: 'search_candidates',
      });
    }

    if (
      !wantsSocialSearch &&
      !wantsActivitySearch &&
      /(不要|别|不想|不喜欢|不接受|拒绝|避开|夜间|晚上见面|自动发|自动联系|隐私|手机号|微信|住址|地址)/i.test(
        text,
      )
    ) {
      return this.result('safety_or_boundary', 0.88, entities, {
        shouldUpdateProfile: true,
        replyStrategy: 'append_context',
      });
    }

    if (
      /(发消息|发送.*(给|第一个|第二个|第三个|这个|那个|他|她|候选)|加好友|邀请(第一个|第二个|第三个|这个|那个|他|她|候选)|约他|约她|联系(第一个|第二个|第三个|这个|那个|他|她|候选)|收藏(第一个|第二个|第三个|这个|那个|他|她|候选)|确认发布|帮我发|帮我加|帮我邀请)/i.test(
        text,
      )
    ) {
      return this.result('action_request', 0.9, entities, {
        shouldExecuteAction: true,
        replyStrategy: 'execute_action',
      });
    }

    if (
      (hasCandidates || hasTask) &&
      /(第一个|第二个|第三个|这个人|那个人|他|她|候选|靠谱吗|安全吗|更近|还有|换一批|换几个|重新排|为什么推荐|推荐理由)/i.test(
        text,
      )
    ) {
      return this.result(
        'candidate_followup',
        wantsCandidateRefresh ? 0.86 : 0.82,
        entities,
        {
          shouldSearch: wantsCandidateRefresh,
          shouldReplan: wantsCandidateRefresh,
          replyStrategy: wantsCandidateRefresh
            ? 'search_candidates'
            : 'direct_reply',
        },
      );
    }

    if (wantsActivitySearch && !wantsSocialSearch) {
      return this.result('activity_search', 0.85, entities, {
        shouldSearch: true,
        shouldReplan: hasTask,
        replyStrategy: 'search_activities',
      });
    }

    if (wantsSocialSearch) {
      return this.result('social_search', 0.88, entities, {
        shouldSearch: true,
        shouldReplan: hasTask,
        replyStrategy: 'search_candidates',
      });
    }

    if (
      /(我喜欢|我比较|我是|我不太|我平时|我的偏好|偏好是|我希望|慢热|外向|内向|拍照|跑步|羽毛球|咖啡|旅行|健身|瑜伽|周末|下午|晚上有空|社交节奏)/i.test(
        text,
      )
    ) {
      return this.result('profile_update', 0.82, entities, {
        shouldUpdateProfile: true,
        replyStrategy: 'append_context',
      });
    }

    return this.result('unknown', 0.35, entities, {
      replyStrategy: 'ask_clarifying_question',
    });
  }

  private hasCandidateDiscoveryCue(
    text: string,
    wantsSocialSearch: boolean,
  ): boolean {
    return (
      wantsSocialSearch ||
      /(找|搜索|搜|候选人|候选|列表|人选|真实用户|搭子)/i.test(text) ||
      /推荐(?!我)/i.test(text)
    );
  }

  private explicitlyAvoidsSending(text: string): boolean {
    return (
      /(?:不要|先不要|暂时不要|别|先别|不用|无需|不需要).{0,16}(?:自动)?(?:发消息|发送消息|发|发送|联系|私信|打招呼)/i.test(
        text,
      ) ||
      /(?:不要|先不要|暂时不要|别|先别|不用|无需|不需要).{0,16}(?:创建|生成).{0,16}(?:待确认|确认动作|approval)/i.test(
        text,
      )
    );
  }

  private result(
    intent: SocialAgentIntentType,
    confidence: number,
    entities: SocialAgentIntentEntities,
    options: Partial<
      Omit<
        SocialAgentIntentRouterResult,
        'intent' | 'confidence' | 'entities' | 'source'
      >
    >,
  ): SocialAgentIntentRouterResult {
    return {
      intent,
      confidence,
      entities,
      shouldSearch: options.shouldSearch ?? false,
      shouldReplan: options.shouldReplan ?? false,
      shouldUpdateProfile: options.shouldUpdateProfile ?? false,
      shouldExecuteAction: options.shouldExecuteAction ?? false,
      replyStrategy: options.replyStrategy ?? 'direct_reply',
      source: 'rules',
    };
  }

  private extractEntities(message: string): SocialAgentIntentEntities {
    const cityMatch = message.match(
      /(青岛|北京|上海|深圳|广州|杭州|南京|成都|武汉|西安|重庆|苏州|厦门|天津|长沙|郑州|济南|宁波|合肥)/,
    );
    const activityMatch = message.match(
      /(拍照|跑步|羽毛球|瑜伽|健身|咖啡|徒步|骑行|篮球|足球|网球|游泳|约练|撸铁|普拉提|飞盘)/,
    );
    const timeMatch = message.match(
      /(今晚|明天|后天|周末|工作日|上午|中午|下午|晚上|夜间|早上|午后)/,
    );
    const locationMatch = message.match(
      /(附近|同城|身边|周边|近一点|更近|市南|市北|崂山|黄岛|西海岸|李沧|城阳)/,
    );
    const targetGender = /(女生|女性|小姐姐)/.test(message)
      ? '女生'
      : /(男生|男性|小哥哥)/.test(message)
        ? '男生'
        : '';
    return {
      city: sanitizeCity(cityMatch?.[1] ?? ''),
      activityType: cleanDisplayText(activityMatch?.[1], ''),
      targetGender,
      timePreference: cleanDisplayText(timeMatch?.[1], ''),
      locationPreference: cleanDisplayText(locationMatch?.[1], ''),
    };
  }

  private shouldTryDeepSeek(
    message: string,
    fallback: SocialAgentIntentRouterResult,
  ): boolean {
    if (!message || fallback.confidence >= 0.9) return false;
    if (this.config.get<string>('SOCIAL_AGENT_INTENT_LLM') === 'false')
      return false;
    return Boolean(this.config.get<string>('DEEPSEEK_API_KEY'));
  }

  private async callDeepSeekRouter(
    input: SocialAgentIntentRouterInput,
    fallback: SocialAgentIntentRouterResult,
  ): Promise<SocialAgentIntentRouterResult | null> {
    const apiKey = this.config.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey) return null;
    const baseUrl =
      this.config.get<string>('DEEPSEEK_BASE_URL') ||
      'https://api.deepseek.com';
    const model = resolveDeepSeekModel(
      this.config.get<string>('DEEPSEEK_MODEL'),
    );
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.deepSeekTimeoutMs(),
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
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: [
                  '你是 FitMeet Social Agent 的意图路由器，只输出 JSON。',
                  'intent 只能是 casual_chat, profile_update, social_search, activity_search, candidate_followup, action_request, safety_or_boundary, unknown。',
                  '只有明确找人/搭子/活动/换一批/更近时 shouldSearch=true。普通聊天、画像补充、安全边界、unknown 必须 shouldSearch=false。',
                  '动作请求只进入确认流程，不直接执行数据库动作。',
                ].join('\n'),
              },
              {
                role: 'user',
                content: JSON.stringify({
                  message: input.message,
                  taskContext: input.taskContext ?? {},
                  profile: input.profile ?? {},
                  conversationHistory: (input.conversationHistory ?? []).slice(
                    -8,
                  ),
                  fallback,
                }),
              },
            ],
          }),
        },
      );
      if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}`);
      const payload = (await response.json()) as Record<string, unknown>;
      const content = this.readDeepSeekContent(payload);
      const parsed = JSON.parse(content) as Record<string, unknown>;
      return this.normalizeDeepSeekResult(parsed, fallback);
    } catch (error) {
      if (this.isAbortError(error)) throw new Error('deepseek_timeout');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeDeepSeekResult(
    parsed: Record<string, unknown>,
    fallback: SocialAgentIntentRouterResult,
  ): SocialAgentIntentRouterResult | null {
    const intent = this.allowedIntent(parsed.intent)
      ? parsed.intent
      : fallback.intent;
    const confidence = this.clampConfidence(
      parsed.confidence,
      fallback.confidence,
    );
    const entities = this.normalizeEntities(parsed.entities, fallback.entities);
    const shouldSearch =
      typeof parsed.shouldSearch === 'boolean'
        ? parsed.shouldSearch
        : fallback.shouldSearch;
    const shouldReplan =
      typeof parsed.shouldReplan === 'boolean'
        ? parsed.shouldReplan
        : fallback.shouldReplan;
    const shouldUpdateProfile =
      typeof parsed.shouldUpdateProfile === 'boolean'
        ? parsed.shouldUpdateProfile
        : fallback.shouldUpdateProfile;
    const shouldExecuteAction =
      typeof parsed.shouldExecuteAction === 'boolean'
        ? parsed.shouldExecuteAction
        : fallback.shouldExecuteAction;
    const replyStrategy = this.allowedReplyStrategy(parsed.replyStrategy)
      ? parsed.replyStrategy
      : fallback.replyStrategy;

    if (!this.isSearchAllowed(intent) && shouldSearch) return fallback;
    return {
      intent,
      confidence,
      entities,
      shouldSearch,
      shouldReplan,
      shouldUpdateProfile,
      shouldExecuteAction,
      replyStrategy,
      source: 'deepseek',
    };
  }

  private normalizeEntities(
    value: unknown,
    fallback: SocialAgentIntentEntities,
  ): SocialAgentIntentEntities {
    const record = this.isRecord(value) ? value : {};
    return {
      city: sanitizeCity(record.city ?? fallback.city),
      activityType: cleanDisplayText(
        record.activityType,
        fallback.activityType,
      ),
      targetGender: cleanDisplayText(
        record.targetGender,
        fallback.targetGender,
      ),
      timePreference: cleanDisplayText(
        record.timePreference,
        fallback.timePreference,
      ),
      locationPreference: cleanDisplayText(
        record.locationPreference,
        fallback.locationPreference,
      ),
    };
  }

  private readDeepSeekContent(payload: Record<string, unknown>): string {
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const first = this.isRecord(choices[0]) ? choices[0] : {};
    const message = this.isRecord(first.message) ? first.message : {};
    return cleanDisplayText(message.content, '').trim();
  }

  private allowedIntent(value: unknown): value is SocialAgentIntentType {
    return [
      'casual_chat',
      'profile_update',
      'social_search',
      'activity_search',
      'candidate_followup',
      'action_request',
      'safety_or_boundary',
      'unknown',
    ].includes(String(value));
  }

  private allowedReplyStrategy(
    value: unknown,
  ): value is SocialAgentReplyStrategy {
    return [
      'direct_reply',
      'ask_clarifying_question',
      'append_context',
      'search_candidates',
      'search_activities',
      'execute_action',
    ].includes(String(value));
  }

  private isSearchAllowed(intent: SocialAgentIntentType): boolean {
    return (
      intent === 'social_search' ||
      intent === 'activity_search' ||
      intent === 'candidate_followup'
    );
  }

  private clampConfidence(value: unknown, fallback: number): number {
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(0, Math.min(1, number));
  }

  private deepSeekTimeoutMs(): number {
    const configured = Number(
      this.config.get<string>('SOCIAL_AGENT_INTENT_TIMEOUT_MS') ?? '2500',
    );
    if (!Number.isFinite(configured) || configured <= 0) return 2500;
    return Math.min(configured, 2500);
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
