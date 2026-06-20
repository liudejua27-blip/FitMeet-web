import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { sanitizeCity } from '../common/city.util';
import { cleanDisplayText } from '../common/display-text.util';
import { normalizeDeepSeekIntentRouterResult } from './social-agent-intent-normalization';
import { hasSocialAgentImmediateSearchRequest } from './social-agent-profile-search-boundary';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import {
  SOCIAL_AGENT_DEFAULT_REASONING_MODEL,
  SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS,
  selectSocialAgentConfiguredModel,
  SocialAgentModelRouterService,
} from './social-agent-model-router.service';
import {
  selectSocialAgentContextWindow,
  socialAgentContextTurnLimit,
} from './social-agent-context-window';
import {
  enforceSocialIntentGate,
  explicitlyRejectsSocialExecution,
  hasExistingSocialExecutionContext,
  hasExplicitSocialExecutionIntent,
  isConversationOnlySocialMention,
  isSocialAdviceQuestion,
} from './social-agent-social-intent-gate';
import { isAwaitingSocialOpportunityClarification } from './social-agent-opportunity-clarification';
import {
  isRetryableSocialAgentDeepSeekFailure,
  socialAgentDeepSeekFailureReason,
  socialAgentDeepSeekRetryAttempts,
} from './social-agent-deepseek-resilience';
import { SocialAgentChatDeepSeekClientService } from './social-agent-chat-deepseek-client.service';
import { callDeepSeekChatCompletion } from '../common/deepseek.util';

export type SocialAgentIntentType =
  | 'casual_chat'
  | 'product_help'
  | 'workflow_help'
  | 'profile_enrichment'
  | 'profile_enrichment_request'
  | 'correction_or_clarification'
  | 'profile_update'
  | 'social_search'
  | 'activity_search'
  | 'candidate_followup'
  | 'action_request'
  | 'safety_or_boundary'
  | 'fitness_math'
  | 'unknown';

export type SocialAgentReplyStrategy =
  | 'conversational_answer'
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
  signal?: AbortSignal | null;
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

type SocialAgentDeepSeekMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

@Injectable()
export class SocialAgentIntentRouterService {
  private readonly logger = new Logger(SocialAgentIntentRouterService.name);

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly metrics?: SocialAgentMetricsService,
    @Optional() private readonly modelRouter?: SocialAgentModelRouterService,
    @Optional()
    private readonly deepSeek?: SocialAgentChatDeepSeekClientService,
  ) {}

  async route(
    input: SocialAgentIntentRouterInput,
  ): Promise<SocialAgentIntentRouterResult> {
    if (input.signal?.aborted) throw new Error('client_aborted');
    const message = cleanDisplayText(input.message, '').trim();
    const normalizedInput = { ...input, message };
    const fallback = this.routeByRules(normalizedInput);
    if (!this.shouldTryDeepSeek(message)) return fallback;

    const startedAt = Date.now();
    try {
      const maxAttempts = socialAgentDeepSeekRetryAttempts(this.config, {
        specificKey: 'SOCIAL_AGENT_INTENT_RETRY_ATTEMPTS',
      });
      let enhanced: SocialAgentIntentRouterResult | null = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          enhanced = await this.callDeepSeekRouter(normalizedInput, fallback);
          break;
        } catch (error) {
          const reason = socialAgentDeepSeekFailureReason(error);
          if (
            attempt < maxAttempts &&
            isRetryableSocialAgentDeepSeekFailure(reason, {
              includeTimeoutFailures: true,
              includeJsonFormatErrors: true,
            })
          ) {
            this.logger.warn(
              JSON.stringify({
                event: 'social_agent.intent_router.deepseek_retrying',
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
      this.metrics?.recordLatency(
        'deepseek_intent_route',
        Date.now() - startedAt,
      );
      if (!enhanced) {
        this.metrics?.recordFallback('deepseek_empty');
        return fallback;
      }
      return enforceSocialIntentGate(normalizedInput, enhanced);
    } catch (error) {
      this.metrics?.recordLatency(
        'deepseek_intent_route',
        Date.now() - startedAt,
      );
      const reason = socialAgentDeepSeekFailureReason(error);
      if (reason === 'client_aborted') throw error;
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
    const profileOnlyUpdate =
      this.hasConcreteProfilePreference(message) &&
      !/(帮我找|给我找|想找|想认识|找一个|找个|找人|找.*搭子|搜索|推荐.*人|附近.*人|同城.*人|真实用户|约练用户|跑步搭子|拍照搭子)/i.test(
        text,
      );
    const wantsCandidateRefresh =
      /(换一批|换几个|更多|还有|更近|重新找|再找|扩大|放宽)/i.test(text);
    const wantsCandidateFilterRefinement =
      this.hasCandidateFilterRefinement(message);
    const wantsSocialSearch =
      !profileOnlyUpdate &&
      hasExplicitSocialExecutionIntent(message) &&
      /(帮我找|给我找|想找|想认识|认识.*(新朋友|朋友|人)|低压力社交|找一个|找个|找人|找.*(搭子|伙伴|朋友)|搭子.*有吗|有合适的人吗|合适的人|伙伴|好友|对象|同城朋友|匹配|搜索候选|推荐.*(人|朋友|用户)|附近.*(人|朋友|搭子)|同城.*(人|朋友|搭子)|真实用户|约练用户|发布过约练|约练卡片|跑步搭子|拍照搭子|篮球搭子|户外搭子|约练搭子|一起.*(咖啡|拍照|跑步|羽毛球|健身|瑜伽|徒步|户外|骑行|篮球|网球|游泳|city\s*walk|citywalk)|周末.*(咖啡|拍照|跑步|羽毛球|健身|瑜伽|徒步|户外|骑行|篮球|city\s*walk|citywalk))/i.test(
        text,
      );
    const wantsActivitySearch =
      hasExplicitSocialExecutionIntent(message) &&
      /(活动|局|约练活动|羽毛球局|篮球局|户外活动|跑团|课程|场地|报名|参加约练|参加.*活动|附近有什么|有没有.*局|有什么.*活动)/i.test(
        text,
      );
    const wantsSocialAction =
      hasExplicitSocialExecutionIntent(message) &&
      /(发消息|发送.*(给|第一个|第二个|第三个|这个|那个|他|她|候选)|加好友|邀请(第一个|第二个|第三个|这个|那个|他|她|候选)|约他|约她|联系(第一个|第二个|第三个|这个|那个|他|她|候选)|收藏(第一个|第二个|第三个|这个|那个|他|她|候选)|确认发布|帮我发|帮我加|帮我邀请)/i.test(
        text,
      );
    const wantsImmediateSocialSearch =
      hasSocialAgentImmediateSearchRequest(message);
    const hasCandidateDiscoveryCue = this.hasCandidateDiscoveryCue(
      text,
      wantsSocialSearch,
    );
    const awaitingOpportunityClarification =
      isAwaitingSocialOpportunityClarification(input.taskContext);
    const explicitlyAvoidsSending = this.explicitlyAvoidsSending(text);
    const asksWorkflowHelp = this.isWorkflowHelpQuestion(message);
    const asksProductHelp = this.isProductHelpQuestion(message);
    const asksProfileEnrichmentRequest =
      this.isProfileEnrichmentRequest(message);
    const isCorrection = this.isCorrectionOrClarification(message);
    const asksFitnessMath = this.isFitnessMathQuestion(message);

    if (
      isCorrection &&
      this.isSocialContinuationCorrection(input, {
        wantsSocialSearch,
        wantsCandidateFilterRefinement,
        awaitingOpportunityClarification,
      })
    ) {
      return this.result(
        hasTask || hasCandidates ? 'candidate_followup' : 'social_search',
        0.91,
        entities,
        {
          shouldSearch: true,
          shouldReplan: hasTask || hasCandidates,
          replyStrategy: 'search_candidates',
        },
      );
    }

    if (isCorrection) {
      return this.result('correction_or_clarification', 0.92, entities, {
        replyStrategy: 'conversational_answer',
      });
    }

    if (isConversationOnlySocialMention(message)) {
      return this.result('casual_chat', 0.93, entities, {
        replyStrategy: 'conversational_answer',
      });
    }

    if (explicitlyRejectsSocialExecution(message)) {
      return this.result('casual_chat', 0.93, entities, {
        replyStrategy: 'conversational_answer',
      });
    }

    if (awaitingOpportunityClarification) {
      if (
        /(取消|先不找|不找了|不用找|暂停|算了)/i.test(text) ||
        explicitlyRejectsSocialExecution(message) ||
        isConversationOnlySocialMention(message) ||
        isSocialAdviceQuestion(message)
      ) {
        return this.result('casual_chat', 0.9, entities, {
          replyStrategy: 'conversational_answer',
        });
      }
      if (this.isPendingOpportunityClarificationMetaQuestion(message)) {
        return this.result('workflow_help', 0.9, entities, {
          replyStrategy: 'conversational_answer',
        });
      }
      if (
        !wantsSocialSearch &&
        !wantsActivitySearch &&
        !wantsCandidateFilterRefinement &&
        !this.hasOpportunityClarificationAnswer(message, entities) &&
        !this.isOpportunityClarificationContinueCommand(message)
      ) {
        return this.result('casual_chat', 0.88, entities, {
          replyStrategy: 'conversational_answer',
        });
      }
      return this.result('social_search', 0.9, entities, {
        shouldSearch: true,
        shouldReplan: hasTask,
        replyStrategy: 'search_candidates',
      });
    }

    if (asksFitnessMath) {
      return this.result('fitness_math', 0.9, entities, {
        replyStrategy: 'conversational_answer',
      });
    }

    if (asksWorkflowHelp) {
      return this.result('workflow_help', 0.9, entities, {
        replyStrategy: 'conversational_answer',
      });
    }

    if (asksProfileEnrichmentRequest) {
      return this.result('profile_enrichment_request', 0.9, entities, {
        replyStrategy: 'conversational_answer',
      });
    }

    if (asksProductHelp) {
      return this.result('product_help', 0.92, entities, {
        replyStrategy: 'conversational_answer',
      });
    }

    if (
      /(不想|不用|不要|先不|暂时不).{0,12}(交友|找人|约练|搭子|匹配|推荐人|活动)/i.test(
        text,
      ) &&
      /(只想|就想|只是|普通).{0,12}(问|聊|咨询|问题|聊天)/i.test(text)
    ) {
      return this.result('casual_chat', 0.92, entities, {
        replyStrategy: 'conversational_answer',
      });
    }

    if (
      /(你好|hello|hi|嗨|你能做什么|你可以做什么|怎么找搭子|该怎么找|怎么聊天自然|聊天自然|你觉得怎么|建议|聊聊)/i.test(
        text,
      )
    ) {
      return this.result('casual_chat', 0.9, entities, {
        replyStrategy: 'conversational_answer',
      });
    }

    if (isSocialAdviceQuestion(message)) {
      return this.result('casual_chat', 0.9, entities, {
        replyStrategy: 'conversational_answer',
      });
    }

    if (this.hasRichProfileFacts(message) && !wantsImmediateSocialSearch) {
      return this.result('profile_enrichment', 0.88, entities, {
        shouldUpdateProfile: true,
        replyStrategy: 'conversational_answer',
      });
    }

    if (hasCandidateDiscoveryCue && explicitlyAvoidsSending) {
      return this.result('social_search', 0.93, entities, {
        shouldSearch: true,
        shouldReplan: hasTask,
        replyStrategy: 'search_candidates',
      });
    }

    if ((hasCandidates || hasTask) && wantsCandidateFilterRefinement) {
      return this.result('candidate_followup', 0.9, entities, {
        shouldSearch: true,
        shouldReplan: true,
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

    if (wantsSocialAction && !hasCandidates && !hasTask) {
      return this.result('candidate_followup', 0.86, entities, {
        shouldSearch: false,
        shouldExecuteAction: false,
        replyStrategy: 'direct_reply',
      });
    }

    if (wantsSocialAction) {
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

    if (
      wantsActivitySearch &&
      (!wantsSocialSearch || /(参加|报名|活动|局|课程|场地)/i.test(text))
    ) {
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

    if (this.hasConcreteProfilePreference(message)) {
      return this.result('profile_update', 0.82, entities, {
        shouldUpdateProfile: true,
        replyStrategy: 'append_context',
      });
    }

    return this.result('unknown', 0.35, entities, {
      replyStrategy: 'conversational_answer',
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

  private isPendingOpportunityClarificationMetaQuestion(
    message: string,
  ): boolean {
    const text = cleanDisplayText(message, '').trim().toLowerCase();
    if (!text) return false;
    if (hasExplicitSocialExecutionIntent(text)) return false;
    return /(为什么|为啥|干嘛|一定要|必须要|为什么要问|为什么需要|需要.*(什么|这些|信息)|这些信息.*(干嘛|做什么|有什么用)|你没懂|懂没懂|没懂我的意思|什么意思|解释一下|说清楚)/i.test(
      text,
    );
  }

  private isOpportunityClarificationContinueCommand(message: string): boolean {
    const text = cleanDisplayText(message, '').trim().toLowerCase();
    if (!text) return false;
    if (explicitlyRejectsSocialExecution(text)) return false;
    return /(可以|好的|好|行|继续|就这样|按这个|按刚才|开始|现在).{0,12}(找|搜|匹配|推荐|候选|搭子|人|活动)|^(可以|好的|好|行|继续)$|继续.{0,12}(刚才|上面).{0,12}(找|搜|匹配|推荐)/i.test(
      text,
    );
  }

  private hasOpportunityClarificationAnswer(
    message: string,
    entities: SocialAgentIntentEntities,
  ): boolean {
    const text = cleanDisplayText(message, '').trim().toLowerCase();
    if (!text) return false;
    if (
      entities.city ||
      entities.activityType ||
      entities.targetGender ||
      entities.timePreference ||
      entities.locationPreference
    ) {
      return true;
    }
    return /(公共场所|公开场所|站内聊|先聊天|别自动发|不要自动发|低强度|轻松|强度|慢跑|散步|跑步|羽毛球|篮球|户外|咖啡|今晚|今天晚上|周末|附近|同校|舞蹈|舞蹈生|女生|男生)/i.test(
      text,
    );
  }

  private isProductHelpQuestion(message: string): boolean {
    const text = cleanDisplayText(message, '').trim().toLowerCase();
    if (!text) return false;
    if (
      /(帮我找|给我找|想找|想认识|认识.*(新朋友|朋友|人)|找一个|找个|找人|找.*(搭子|伙伴|朋友)|搜索|推荐.*(人|朋友|用户)|附近.*(人|朋友|搭子)|同城.*(人|朋友|搭子)|真实用户|约练用户|发布过约练|约练卡片|跑步搭子|拍照搭子|篮球搭子|户外搭子|约练搭子)/i.test(
        text,
      )
    ) {
      return false;
    }
    return /(人物画像|ai画像|画像是什么|画像.*是什么|画像.*完善|完善.*画像|怎么.*匹配|匹配逻辑|为什么需要偏好|偏好.*有什么用|权限模式|隐私边界|deepseek|api|不会回答|回答问题|为什么.*回答|产品|fitmeet|社交助理|agent.*能力|你.*能力|你有什么功能|有什么功能|有哪些功能|介绍.*功能|功能.*介绍|能力.*介绍)/i.test(
      text,
    );
  }

  private isFitnessMathQuestion(message: string): boolean {
    const text = cleanDisplayText(message, '').trim().toLowerCase();
    if (!text) return false;
    if (
      /(帮我找|给我找|想找|想认识|找一个|找个|找人|找.*搭子|搜索|推荐.*人|附近.*人|同城.*人|真实用户|约练用户)/i.test(
        text,
      )
    ) {
      return false;
    }
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

  private isWorkflowHelpQuestion(message: string): boolean {
    const text = cleanDisplayText(message, '').trim().toLowerCase();
    if (!text) return false;
    const workflowHelpPattern =
      /(先.*画像.*约练|先.*人物画像|直接发布需求|发布需求.*画像|怎么开始约练|怎么.*(找人|找搭子|约练|参加活动|报名活动|加好友|发邀请|发消息|创建活动|发起活动)|如何.*(找人|找搭子|约练|参加活动|报名活动|加好友|发邀请|发消息|创建活动|发起活动)|活动.*(怎么参加|如何参加|报名流程|参与流程)|创建活动.*(先|需要).*画像|邀请.*流程|加好友.*流程|新用户.*先|下一步干什么|需要怎么做|我需要怎么做|怎么做|流程|先完善.*再|边匹配边补齐)/i;
    if (workflowHelpPattern.test(text)) return true;
    if (
      /(帮我找|给我找|想找|想认识|找一个|找个|找人|找.*搭子|搜索|推荐.*人|附近.*人|同城.*人|真实用户|约练用户)/i.test(
        text,
      )
    ) {
      return false;
    }
    return workflowHelpPattern.test(text);
  }

  private isProfileEnrichmentRequest(message: string): boolean {
    const text = cleanDisplayText(message, '').trim().toLowerCase();
    if (!text) return false;
    if (
      /(\u8fd8\u7f3a\u4ec0\u4e48|\u8fd8\u5dee\u4ec0\u4e48|\u7f3a\u54ea\u4e9b|\u7f3a\u5c11\u54ea\u4e9b|\u753b\u50cf.*\u7f3a|\u8d44\u6599.*\u7f3a|\u8fd8\u9700\u8981\u8865\u5145\u4ec0\u4e48)/i.test(
        text,
      )
    ) {
      return true;
    }
    return /(帮我完善.*画像|完善.*ai画像|完善.*人物画像|上面.*画像.*完善|刚才.*画像.*完善|把刚才.*写入画像|保存到.*画像|调用工具.*画像|工具.*完善.*画像|写入.*画像|存到.*画像)/i.test(
      text,
    );
  }

  private isCorrectionOrClarification(message: string): boolean {
    const text = cleanDisplayText(message, '').trim().toLowerCase();
    if (!text) return false;
    return /(不是不是|不是.*搜索|不是.*找人|上面不是|上面是.*画像|刚才.*画像|我的意思是|我说的是|你懂没懂我的意思|没懂我的意思|你理解错|理解错了|不是这个意思)/i.test(
      text,
    );
  }

  private isSocialContinuationCorrection(
    input: SocialAgentIntentRouterInput,
    options: {
      wantsSocialSearch: boolean;
      wantsCandidateFilterRefinement: boolean;
      awaitingOpportunityClarification: boolean;
    },
  ): boolean {
    const text = cleanDisplayText(input.message, '').trim().toLowerCase();
    if (!text) return false;
    if (this.isProfileEnrichmentRequest(text)) return false;
    if (
      /(上面|刚才).{0,12}(画像|人物画像|ai画像)|不是.{0,8}搜索|不是.{0,8}找人/i.test(
        text,
      )
    ) {
      return false;
    }
    const hasSocialContext =
      hasExistingSocialExecutionContext(input) ||
      options.awaitingOpportunityClarification;
    const hasConcreteSocialCriteria =
      /(找|搜索|推荐|匹配|候选|搭子|女生|男生|舞蹈|舞蹈生|同校|青岛大学|大学|散步|跑步|羽毛球|篮球|户外|今晚|今天晚上|明天|周末|附近)/i.test(
        text,
      );
    return (
      (options.wantsSocialSearch || options.wantsCandidateFilterRefinement) &&
      (hasSocialContext || hasConcreteSocialCriteria)
    );
  }

  private hasRichProfileFacts(message: string): boolean {
    const text = cleanDisplayText(message, '').trim().toLowerCase();
    if (!text || this.isProductHelpQuestion(text)) return false;
    const signals = [
      /我是[^，。,.]{0,12}(男|女)/i,
      /\b\d{1,2}\s*岁?\b/,
      /身高\s*\d{2,3}/i,
      /体重\s*\d{2,3}/i,
      /(白羊|金牛|双子|巨蟹|狮子|处女|天秤|天蝎|射手|摩羯|水瓶|双鱼)/,
      /\b(infp|enfp|intj|entj|intp|entp|isfp|istp|isfj|istj|esfp|estp|esfj|estj|infj|enfj)\b/i,
      /(在|常住|住在).{0,20}(青岛|北京|上海|深圳|广州|大学|区)/,
      /(性格|开放|外向|内向|慢热|开朗)/,
      /(想找|想认识).{0,20}(同校|女生|男生|搭子|朋友)/,
    ];
    return signals.filter((pattern) => pattern.test(text)).length >= 2;
  }

  private hasConcreteProfilePreference(message: string): boolean {
    const text = cleanDisplayText(message, '').trim().toLowerCase();
    if (!text || this.isProductHelpQuestion(text)) return false;
    return /(我在|我住|我常在|我喜欢|我比较|我是|我不太|我平时|我的偏好|偏好是|我希望|我想认识.*的人|我想找.*的人|慢热|外向|内向|不喜欢|不接受|不想|讨厌|避免|周末.*有空|下午.*有空|晚上有空|喜欢.*(拍照|跑步|羽毛球|咖啡|旅行|健身|瑜伽))/i.test(
      text,
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
      replyStrategy: options.replyStrategy ?? 'conversational_answer',
      source: 'rules',
    };
  }

  private extractEntities(message: string): SocialAgentIntentEntities {
    const cityMatch = message.match(
      /(青岛|北京|上海|深圳|广州|杭州|南京|成都|武汉|西安|重庆|苏州|厦门|天津|长沙|郑州|济南|宁波|合肥)/,
    );
    const activityMatch = message.match(
      /(拍照|跑步|慢跑|散步|羽毛球|瑜伽|健身|咖啡|徒步|爬山|骑行|篮球|足球|网球|游泳|约练|撸铁|普拉提|飞盘|户外|训练|低压力社交|认识新朋友|新朋友|city\s*walk|citywalk)/i,
    );
    const timeMatch = message.match(
      /(今天晚上|今天下午|今天上午|今天中午|今晚|明天(?:上午|下午|晚上)?|后天(?:上午|下午|晚上)?|周末(?:上午|中午|下午|晚上)?|周六(?:上午|下午|晚上)?|周日(?:上午|下午|晚上)?|工作日晚上|下班后|上午|中午|下午|晚上|夜间|早上|午后)/,
    );
    const locationMatch = message.match(
      /((?:崂山区|市南区|市北区|李沧区|黄岛区|西海岸|城阳区|青岛大学|五四广场|奥帆中心|大学城)(?:附近|周边)?|附近|同城|身边|周边|近一点|更近|市南|市北|崂山|黄岛|李沧|城阳)/,
    );
    const targetGender = /(女生|女孩|女孩子|女性|小姐姐|女同学|女大学生|女舞蹈生)/.test(
      message,
    )
      ? '女生'
      : /(男生|男孩|男孩子|男性|小哥哥|男同学|男大学生|男舞蹈生)/.test(
            message,
          )
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

  private shouldTryDeepSeek(message: string): boolean {
    if (!message) return false;
    const legacyToggle =
      `${this.config.get<string>('SOCIAL_AGENT_INTENT_LLM') ?? ''}`
        .trim()
        .toLowerCase();
    const mode = this.intentRouterMode();
    if (legacyToggle === 'false' || mode === 'rules_only') return false;
    if (!this.config.get<string>('DEEPSEEK_API_KEY')) return false;
    // Even in legacy "hybrid" mode, DeepSeek remains the primary semantic
    // judge. Rules are a fallback and safety clamp, not a high-confidence
    // shortcut that can strip context from short follow-up turns.
    return true;
  }

  private async callDeepSeekRouter(
    input: SocialAgentIntentRouterInput,
    fallback: SocialAgentIntentRouterResult,
  ): Promise<SocialAgentIntentRouterResult | null> {
    const apiKey = this.config.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey) return null;
    const useCase = 'planner' as const;
    const messages = this.deepSeekRouterMessages(input, fallback);
    if (this.deepSeek) {
      const content = await this.deepSeek.complete({
        useCase,
        taskId: this.taskIdFromTaskContext(input.taskContext),
        intent: fallback.intent,
        fallbackTemperature: 0.15,
        responseFormat: { type: 'json_object' },
        retryAttempts: socialAgentDeepSeekRetryAttempts(this.config, {
          specificKey: 'SOCIAL_AGENT_INTENT_RETRY_ATTEMPTS',
        }),
        messages,
        signal: input.signal,
      });
      if (!content) return null;
      const parsed = JSON.parse(content) as Record<string, unknown>;
      return normalizeDeepSeekIntentRouterResult(parsed, fallback);
    }
    const model = this.modelFor(useCase);
    const startedAt = Date.now();
    try {
      const content = await callDeepSeekChatCompletion({
        apiKey,
        baseUrl: this.config.get<string>('DEEPSEEK_BASE_URL'),
        model,
        temperature: this.modelRouter?.getTemperature(useCase) ?? 0.15,
        responseFormat: { type: 'json_object' },
        retryAttempts: 1,
        messages,
        signal: input.signal ?? null,
        timeoutMs: this.deepSeekTimeoutMs(useCase),
        timeoutMessage: 'deepseek_timeout',
      });
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const result = normalizeDeepSeekIntentRouterResult(parsed, fallback);
      this.logModelCall({
        useCase,
        model,
        intent: result.intent,
        latencyMs: Date.now() - startedAt,
        success: true,
      });
      return result;
    } catch (error) {
      const reason = socialAgentDeepSeekFailureReason(error);
      this.logModelCall({
        useCase,
        model,
        intent: fallback.intent,
        latencyMs: Date.now() - startedAt,
        success: false,
        reason,
      });
      throw error;
    }
  }

  private deepSeekRouterMessages(
    input: SocialAgentIntentRouterInput,
    fallback: SocialAgentIntentRouterResult,
  ): SocialAgentDeepSeekMessage[] {
    return [
      {
        role: 'system',
        content: [
          '你是 FitMeet Social Agent 的意图路由器，只输出 JSON。',
          'intent 只能是 casual_chat, product_help, workflow_help, profile_enrichment, profile_enrichment_request, correction_or_clarification, profile_update, social_search, activity_search, candidate_followup, action_request, safety_or_boundary, fitness_math, unknown。',
          'replyStrategy 只能是 conversational_answer, append_context, search_candidates, search_activities, execute_action, ask_clarifying_question。',
          'product_help 用于解释 FitMeet 产品、人物画像、匹配逻辑、权限模式、隐私边界、Agent 能力和 DeepSeek/API 问题。',
          'profile_update 只有用户明确提供自己的城市、兴趣、可约时间、想认识的人或不接受的行为时使用；“人物画像是什么”“你可以帮我完善人物画像吗”不是 profile_update。',
          'workflow_help 用于回答先完善画像还是直接发布需求、下一步怎么做、怎么开始约练、怎么参加活动、怎么加好友、怎么发邀请等流程问题。',
          '用户问“怎么找人/怎么参加活动/怎么加好友/怎么发邀请/流程是什么”是在咨询流程，不是立即执行搜索或动作。',
          'profile_enrichment 用于用户提供画像事实，即使里面有“想找xxx”，也不要直接搜索；先抽取画像并询问是否开始搜索。',
          'profile_enrichment_request/correction_or_clarification 用于用户要求把刚才信息写入画像或纠正“上面是画像不是搜索”。',
          '如果已有社交/约练任务，用户说“我的意思是/你理解错了”并补充时间、地点、候选偏好或活动类型，这是继续筛选候选，不是普通纠错；应输出 social_search 或 candidate_followup。',
          'knownTaskSlots 可能包含用户已确认字段，也可能包含 inferred_context 推断上下文；只有 routingConstraints.doNotRepeatQuestionsForSlots 里的字段才是用户已回答/已确认/已完成的硬约束，不得重复追问。knownContextSlots 只用于理解上下文，不能替代必要澄清。',
          'candidate_preference 只能用于公开可发现资料、用户自愿公开标签或用户明确授权的筛选，不得推断隐私字段。',
          'product_help、workflow_help、profile_enrichment、profile_enrichment_request、correction_or_clarification、fitness_math、casual_chat、unknown 必须 replyStrategy=conversational_answer，且 shouldSearch=false、shouldExecuteAction=false。',
          '只有明确找人/搭子/活动/换一批/更近时 shouldSearch=true。普通聊天、产品解释、画像问答、安全边界、unknown 必须 shouldSearch=false。',
          '动作请求只进入确认流程，不直接执行数据库动作。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: JSON.stringify({
          message: input.message,
          taskContext: input.taskContext ?? {},
          knownTaskSlots: this.knownTaskSlots(input.taskContext),
          routingConstraints: this.routingConstraintsForTaskContext(
            input.taskContext,
          ),
          profile: input.profile ?? {},
          conversationHistory: selectSocialAgentContextWindow(
            input.conversationHistory,
            socialAgentContextTurnLimit(this.config),
          ),
          fallback,
        }),
      },
    ];
  }

  private knownTaskSlots(
    taskContext?: Record<string, unknown>,
  ): Record<string, string> {
    const slots = this.taskSlotRecord(taskContext);
    const allowedStates = new Set([
      'answered',
      'confirmed',
      'completed',
      'modified',
      'inferred',
    ]);
    return this.taskSlotValues(slots, allowedStates);
  }

  private userConfirmedTaskSlotKeys(
    taskContext?: Record<string, unknown>,
  ): string[] {
    const slots = this.taskSlotRecord(taskContext);
    const userConfirmedStates = new Set([
      'answered',
      'confirmed',
      'completed',
      'modified',
    ]);
    return Object.keys(this.taskSlotValues(slots, userConfirmedStates));
  }

  private taskSlotRecord(
    taskContext?: Record<string, unknown>,
  ): Record<string, unknown> {
    const context = this.isRecord(taskContext) ? taskContext : {};
    const taskMemory = this.isRecord(context.taskMemory)
      ? context.taskMemory
      : {};
    const topLevelSlots = this.isRecord(context.taskSlots)
      ? context.taskSlots
      : null;
    const memorySlots = this.isRecord(taskMemory.taskSlots)
      ? taskMemory.taskSlots
      : null;
    return topLevelSlots ?? memorySlots ?? {};
  }

  private taskSlotValues(
    slots: Record<string, unknown>,
    allowedStates: Set<string>,
  ): Record<string, string> {
    const out: Record<string, string> = {};
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
      const raw = slots[key];
      const slot = this.isRecord(raw) ? raw : {};
      const state = cleanDisplayText(slot.state, '');
      if (state && !allowedStates.has(state)) continue;
      const value = cleanDisplayText(slot.value ?? raw, '');
      if (value) out[key] = value;
    }
    return out;
  }

  private routingConstraintsForTaskContext(
    taskContext?: Record<string, unknown>,
  ): Record<string, unknown> {
    const knownTaskSlots = this.knownTaskSlots(taskContext);
    const knownSlotKeys = Object.keys(knownTaskSlots);
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

  private hasCandidateFilterRefinement(message: string): boolean {
    const text = cleanDisplayText(message, '').toLowerCase();
    return (
      /(只看|优先|换成|改成|不要|别|不想要|不喜欢|不想看|过滤|筛选)/i.test(
        text,
      ) &&
      /(同校|校内|校园|大学|不要晚上|别太晚|白天|周末下午|散步|走走|慢跑|低压力|轻松|不尴尬|慢热|这个类型|这种类型|school|campus|walk|jog|low\s*pressure)/i.test(
        text,
      )
    );
  }

  private modelFor(useCase: 'planner'): string {
    if (this.modelRouter) return this.modelRouter.getModel(useCase);
    return (
      this.configuredModel(this.config.get<string>('AGENT_PLANNER_MODEL')) ||
      this.configuredModel(this.config.get<string>('DEEPSEEK_CHAT_MODEL')) ||
      SOCIAL_AGENT_DEFAULT_REASONING_MODEL
    );
  }

  private configuredModel(value?: string | null): string | null {
    return selectSocialAgentConfiguredModel(value, {
      allowFast: false,
    });
  }

  private deepSeekTimeoutMs(useCase?: 'planner'): number {
    if (useCase && this.modelRouter)
      return this.modelRouter.getTimeout(useCase);
    const configured = Number(
      this.config.get<string>('SOCIAL_AGENT_INTENT_TIMEOUT_MS') ??
        this.config.get<string>('SOCIAL_AGENT_PLANNER_TIMEOUT_MS') ??
        this.config.get<string>('SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS') ??
        this.config.get<string>('DEEPSEEK_TIMEOUT_MS') ??
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

  private intentRouterMode(): 'hybrid' | 'llm_first' | 'rules_only' {
    const value =
      `${this.config.get<string>('SOCIAL_AGENT_INTENT_ROUTER_MODE') ?? ''}`
        .trim()
        .toLowerCase();
    if (!value) return 'llm_first';
    if (value === 'hybrid') return 'hybrid';
    if (value === 'llm_first' || value === 'llm-first') return 'llm_first';
    if (value === 'rules_only' || value === 'rules-only') return 'rules_only';
    return 'llm_first';
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
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
