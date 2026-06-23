import type {
  SocialAgentIntentRouterInput,
  SocialAgentIntentRouterResult,
} from './social-agent-intent-router.service';

type SocialAgentConversationIntent = 'conversation' | 'social' | 'approval';

const socialSearchNegationPattern =
  /(不想|不用|不要|不是|先不|暂时不|别|无需|不需要).{0,12}(交友|找人|约练|搭子|匹配|推荐人|推荐用户|推荐朋友|推荐候选|活动|认识.{0,6}(新朋友|朋友|人))/i;

const socialSideEffectNegationPattern =
  /(不想|不用|不要|不是|先不|暂时不|别|无需|不需要).{0,12}(加好友|邀请|联系|发消息|发送消息|私信|自动发)/i;

const publishSideEffectNegationPattern =
  /(不想|不用|不要|不是|先不|暂不|暂时不|别|无需|不需要).{0,12}(发布|公开|发到发现|同步到发现|卡片|发现)/i;

const conversationOnlySocialMentionPattern =
  /((只是|只想|就想|先|暂时|现在).{0,16}(聊聊|聊天|普通聊|说说|倾诉|安静聊|问一个普通问题))|((心情不好|压力|焦虑|累|有点累|很累|吵架|难过|烦).{0,24}(聊|说说|倾诉|不需要|不要|先不|先别|只是|只想))|((不需要|不要|先不|先别|别|无需|不用).{0,18}(推荐|搜索|找人|约练|匹配|活动|真实用户|候选|加好友|发消息|邀请|社交))/i;

const safetyBoundaryOnlyPattern =
  /(不要|别|不想|不喜欢|不接受|拒绝|避开|只在|只能|必须|先).{0,18}(夜间|晚上见面|自动发|自动联系|发消息|发送消息|私信|联系|隐私|手机号|微信|住址|地址|公开场所|公共场所|站内聊|确认)/i;

const socialHelpQuestionPattern =
  /(怎么|如何|流程|是什么|为什么|能不能|可以吗|应该).{0,18}(找人|搭子|约练|匹配|推荐|活动|交友|发消息|邀请|加好友|报名|参加|发起|创建|认识.{0,6}(新朋友|朋友|人))/i;

const socialCapabilityQuestionPattern =
  /(有没有|是否有|支持|可以|能不能|能否).{0,18}(找人|搭子|约练|匹配|推荐|活动|交友|发消息|邀请|加好友|报名|参加|发起|创建).{0,12}(功能|入口|页面|流程|规则|说明|介绍|怎么用|如何用|能力)/i;

const socialAdviceQuestionPattern =
  /(我)?(适合|应该|建议|更适合|比较适合|可以).{0,12}(认识|找|交往|接触|推荐).{0,16}(什么样|哪类|哪种|怎样|什么类型|类型).{0,12}(人|朋友|搭子|对象)|((想认识|想找|想交往|推荐).{0,12}(什么样|哪类|哪种|怎样|什么类型|类型).{0,12}(人|朋友|搭子|对象).{0,12}(适合|合适|更好|靠谱))|(推荐|分析|判断).{0,12}(适合我|我的|我适合).{0,18}(人|朋友|搭子|对象|类型|理想型)|(理想型|择友偏好|交友偏好).{0,16}(分析|建议|是什么|怎么判断|什么样)/i;

const nonSocialLookupPattern =
  /(找回|查找|找一下|找找|帮我找|给我找|想找).{0,16}(聊天记录|消息记录|历史消息|历史会话|会话|密码|账号|设置|页面|入口|资料|文件|订单|帮助|说明|客服|教程|规则|隐私政策|协议|账单|发票)/i;

const explicitSocialSearchPattern =
  /(帮我找|给我找|想找|我要找|我想认识|想认识|认识.*(新朋友|朋友|人)|低压力社交|找一个|找个|找人|找.{0,16}(合适|适合|同频|附近|公开)?.{0,10}(人|用户|朋友|搭子|候选)|找.*(女生|男生|女性|男性|搭子|伙伴|朋友)|根据.{0,12}(画像|偏好|资料|兴趣|条件).{0,18}(找|推荐|匹配|筛选).{0,12}(人|用户|朋友|搭子|候选)|推荐.{0,18}(用户|朋友|人|搭子|候选|活动)|搜索.{0,18}(用户|朋友|人|搭子|候选|活动)|匹配.{0,18}(用户|朋友|人|搭子|候选)|附近.{0,8}(用户|朋友|人|搭子|活动)|同城.{0,8}(用户|朋友|人|搭子|活动)|真实用户|约练用户|户外搭子|篮球搭子|约练搭子|一起.{0,12}(咖啡|拍照|跑步|羽毛球|健身|瑜伽|徒步|户外|骑行|city\s*walk|citywalk|篮球|网球|游泳|运动|训练)|周末.{0,12}(咖啡|拍照|跑步|羽毛球|健身|瑜伽|徒步|户外|骑行|city\s*walk|citywalk|篮球|运动|训练))/i;

const explicitActivitySearchPattern =
  /(找|搜索|推荐|参加|发起|创建|有没有|附近|同城).{0,12}(活动|局|约练|跑团|课程|场地|线下见面|户外)/i;

const explicitSocialActionPattern =
  /(发消息|发送.*(给|第一个|第二个|第三个|这个|那个|他|她|候选)|加好友|邀请(第一个|第二个|第三个|这个|那个|他|她|候选)|约他|约她|联系(第一个|第二个|第三个|这个|那个|他|她|候选)|收藏(第一个|第二个|第三个|这个|那个|他|她|候选)|确认发布|帮我发|帮我发布|帮我发到发现|发布到发现|发布约练|发布卡片|公开发布|发到发现|同步到发现|帮我加|帮我邀请)/i;

const explicitNonPublishSocialActionPattern =
  /(发消息|发送.*(给|第一个|第二个|第三个|这个|那个|他|她|候选)|加好友|邀请(第一个|第二个|第三个|这个|那个|他|她|候选)|约他|约她|联系(第一个|第二个|第三个|这个|那个|他|她|候选)|收藏(第一个|第二个|第三个|这个|那个|他|她|候选)|帮我加|帮我邀请)/i;

const explicitPublishActionPattern =
  /(确认发布|帮我.{0,8}(发布|发到发现|同步到发现)|请.{0,8}(发布|发到发现|同步到发现)|(可以|那就|就|直接|现在|马上|确认).{0,6}(发布|发到发现|同步到发现)|(把|将)?这张(约练)?卡.{0,8}(发布|发到发现|同步到发现)|发布吧|发布一下|发布出去|发到发现吧|发布到发现|发布约练|发布卡片|公开发布|发到发现|同步到发现)/i;

const explicitCandidateMessageConfirmationPattern =
  /^(确认发送|确认发出|发送吧|可以发送|发吧|帮我发送|就发这条|确认)[。.!！\s]*$/i;

const explicitCandidateRefinementPattern =
  /((有没有|有无|筛一下|筛选|优先|最好|只要|更想|换成|找找).{0,18}(女生|男生|女性|男性|女的|男的|舞蹈|编程|程序员|科技|摄影|音乐|读书|学生|同校|附近|同城))|^(女生|男生|女性|男性|女的|男的|舞蹈生|喜欢编程|会编程|附近的|同城的)[。.!！\s]*$/i;

const explicitEmptyCandidateRecoveryPattern =
  /((扩大|放宽).{0,18}(范围|半径|公里|要求|偏好|条件))|((改|换|调整).{0,18}(时间|地点|区域|城市|活动|周末|下午|晚上|今晚|明天))|((不限|都可以|降低要求).{0,12}(范围|条件|偏好|距离|活动)?)/i;

const profileEnrichmentRequestPattern =
  /(帮我完善.*画像|请帮我完善.*画像|完善.*ai画像|完善.*AI画像|完善.*人物画像|上面.*画像.*完善|刚才.*画像.*完善|把刚才.*写入画像|保存到.*画像|调用工具.*画像|工具.*完善.*画像|写入.*画像|存到.*画像|人物画像|ai画像|AI画像)/i;

const immediateSocialSearchPattern =
  /((现在|马上|直接|立刻|立即).{0,16}(帮我找|给我找|找人|搜索|推荐|匹配|找.*搭子|找.*女生|找.*男生))|((帮我找|给我找|搜索|推荐|匹配).{0,24}(候选|用户|朋友|人|搭子|女生|男生|活动|局))/i;

export function hasExplicitSocialExecutionIntent(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (!text) return false;
  const socialExecutionText = stripPublishSideEffectOptOut(text);
  if (isProfileEnrichmentDominant(text)) return false;
  if (isConversationOnlySocialMention(text)) return false;
  if (socialHelpQuestionPattern.test(text)) return false;
  if (socialCapabilityQuestionPattern.test(text)) return false;
  if (socialAdviceQuestionPattern.test(text)) return false;
  if (nonSocialLookupPattern.test(text)) return false;
  const hasSearchIntent =
    explicitSocialSearchPattern.test(socialExecutionText) ||
    explicitActivitySearchPattern.test(socialExecutionText);
  if (socialSearchNegationPattern.test(socialExecutionText)) return false;
  if (hasSearchIntent) return true;
  const hasActivity =
    /(散步|跑步|羽毛球|篮球|健身|徒步|爬山|骑行|游泳|瑜伽|飞盘|网球|乒乓|咖啡|吃饭|电影|city\s*walk|citywalk)/i.test(
      text,
    );
  const hasTime =
    /(周末|今天|明天|后天|今晚|上午|下午|晚上|中午|早上|[0-9一二三四五六七八九十]+点)/i.test(
      text,
    );
  const hasPlace =
    /(附近|大学|公园|商场|体育馆|健身房|校区|区|市|青岛|上海|北京|深圳|广州|杭州|成都|武汉|南京)/i.test(
      text,
    );
  if (hasActivity && hasTime && hasPlace) return true;
  if (socialSideEffectNegationPattern.test(text)) return false;
  return (
    explicitSocialActionPattern.test(text) ||
    explicitPublishActionPattern.test(text) ||
    explicitCandidateMessageConfirmationPattern.test(text)
  );
}

export function hasExplicitSocialSideEffectIntent(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (!text) return false;
  if (isProfileEnrichmentDominant(text)) return false;
  if (isConversationOnlySocialMention(text)) return false;
  if (socialSideEffectNegationPattern.test(text)) return false;
  if (socialHelpQuestionPattern.test(text)) return false;
  if (socialCapabilityQuestionPattern.test(text)) return false;
  if (nonSocialLookupPattern.test(text)) return false;
  if (
    publishSideEffectNegationPattern.test(text) &&
    !explicitNonPublishSocialActionPattern.test(text)
  ) {
    return false;
  }
  return (
    explicitSocialActionPattern.test(text) ||
    explicitPublishActionPattern.test(text) ||
    explicitCandidateMessageConfirmationPattern.test(text)
  );
}

export function hasExplicitPublishSideEffectIntent(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (!text) return false;
  if (isProfileEnrichmentDominant(text)) return false;
  if (isConversationOnlySocialMention(text)) return false;
  if (socialSideEffectNegationPattern.test(text)) return false;
  if (publishSideEffectNegationPattern.test(text)) return false;
  if (nonSocialLookupPattern.test(text)) return false;
  return explicitPublishActionPattern.test(text);
}

export function hasExplicitCandidateMessageConfirmationIntent(
  message: string,
): boolean {
  const text = message.trim();
  if (!text) return false;
  if (socialSideEffectNegationPattern.test(text)) return false;
  if (socialHelpQuestionPattern.test(text)) return false;
  if (socialCapabilityQuestionPattern.test(text)) return false;
  if (nonSocialLookupPattern.test(text)) return false;
  return explicitCandidateMessageConfirmationPattern.test(text);
}

export function hasExplicitCandidateRefinementIntent(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (!text) return false;
  if (isProfileEnrichmentDominant(text)) return false;
  if (isConversationOnlySocialMention(text)) return false;
  if (socialHelpQuestionPattern.test(text)) return false;
  if (socialCapabilityQuestionPattern.test(text)) return false;
  if (nonSocialLookupPattern.test(text)) return false;
  return explicitCandidateRefinementPattern.test(text);
}

export function hasExplicitEmptyCandidateRecoveryIntent(
  message: string,
): boolean {
  const text = message.trim().toLowerCase();
  if (!text) return false;
  if (isProfileEnrichmentDominant(text)) return false;
  if (isConversationOnlySocialMention(text)) return false;
  if (socialHelpQuestionPattern.test(text)) return false;
  if (socialCapabilityQuestionPattern.test(text)) return false;
  if (nonSocialLookupPattern.test(text)) return false;
  return explicitEmptyCandidateRecoveryPattern.test(text);
}

export function explicitlyRejectsSocialExecution(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (!text) return false;
  const socialExecutionText = stripPublishSideEffectOptOut(text);
  return (
    socialSearchNegationPattern.test(socialExecutionText) ||
    /(不要|不需要|不用|别|先不|暂时不|无需).{0,20}(推荐|搜索|找人|匹配|候选|真实用户|活动|约练|搭子|邀请|加好友)/i.test(
      socialExecutionText,
    )
  );
}

export function isConversationOnlySocialMention(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (!text) return false;
  const socialExecutionText = stripPublishSideEffectOptOut(text);
  if (
    safetyBoundaryOnlyPattern.test(socialExecutionText) &&
    !/(只是|只想|就想|普通|聊聊|聊天|倾诉|说说|心情|压力|焦虑|难过|烦)/i.test(
      socialExecutionText,
    )
  ) {
    return false;
  }
  if (
    /(帮我找|给我找|现在帮我找|马上帮我找|推荐.{0,8}(真实用户|候选|几个人)|搜索.{0,8}(真实用户|候选)|我想认识|想认识|我想找|想找|我要找)/i.test(
      socialExecutionText,
    ) &&
    !/(不要|不需要|先不|先别|别|无需|不用).{0,18}(推荐|搜索|找人|匹配|真实用户|候选)/i.test(
      socialExecutionText,
    )
  ) {
    return false;
  }
  return conversationOnlySocialMentionPattern.test(socialExecutionText);
}

export function isSocialAdviceQuestion(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (!text) return false;
  return socialAdviceQuestionPattern.test(text);
}

export function hasExistingSocialExecutionContext(
  input: Pick<SocialAgentIntentRouterInput, 'taskContext'>,
): boolean {
  return (
    input.taskContext?.hasSearchContext === true ||
    input.taskContext?.hasCandidates === true
  );
}

export function hasExistingSocialActionContext(
  input: Pick<SocialAgentIntentRouterInput, 'taskContext'>,
): boolean {
  const context = input.taskContext;
  if (!context) return false;
  if (hasExistingSocialExecutionContext(input)) return true;
  if (positiveNumber(context.candidateCount) > 0) return true;
  if (positiveNumber(context.socialRequestId) > 0) return true;
  if (nonEmptyArray(context.pendingApprovals)) return true;
  if (nonEmptyArray(context.pendingActions)) return true;
  if (nonEmptyRecord(context.candidateActions)) return true;
  if (nonEmptyRecord(context.candidateState)) return true;
  if (nonEmptyRecord(context.activityState)) return true;
  return false;
}

export function isSocialExecutionIntent(intent: string): boolean {
  return [
    'social_search',
    'activity_search',
    'candidate_followup',
    'action_request',
  ].includes(intent);
}

export function shouldAllowSocialExecution(input: {
  message: string;
  taskContext?: SocialAgentIntentRouterInput['taskContext'];
  intent?: string;
  conversationIntent?: SocialAgentConversationIntent | null;
}): boolean {
  if (isProfileEnrichmentDominant(input.message)) return false;
  if (explicitlyRejectsSocialExecution(input.message)) return false;
  if (isConversationOnlySocialMention(input.message)) return false;
  if (
    input.conversationIntent === 'conversation' &&
    !hasExplicitSocialExecutionIntent(input.message)
  ) {
    return false;
  }
  if (input.intent === 'action_request') {
    return (
      hasExplicitSocialSideEffectIntent(input.message) &&
      (hasExistingSocialActionContext(input) ||
        hasExistingPublishContext(input.message, input.taskContext))
    );
  }
  if (hasExplicitSocialExecutionIntent(input.message)) return true;
  if (
    hasExplicitCandidateRefinementIntent(input.message) &&
    hasExistingSocialExecutionContext(input)
  ) {
    return true;
  }
  if (
    input.intent &&
    ['social_search', 'activity_search', 'candidate_followup'].includes(
      input.intent,
    ) &&
    hasExistingSocialExecutionContext(input)
  ) {
    return true;
  }
  return false;
}

export function enforceSocialIntentGate(
  input: SocialAgentIntentRouterInput & {
    conversationIntent?: SocialAgentConversationIntent | null;
  },
  result: SocialAgentIntentRouterResult,
): SocialAgentIntentRouterResult {
  if (!isSocialExecutionIntent(result.intent)) return result;
  const profileDominant = profileDominantIntent(input.message);
  if (profileDominant) {
    return {
      ...result,
      intent: profileDominant,
      confidence: Math.max(result.confidence, 0.9),
      shouldSearch: false,
      shouldReplan: false,
      shouldUpdateProfile: true,
      shouldExecuteAction: false,
      replyStrategy: 'conversational_answer',
    };
  }
  if (
    shouldAllowSocialExecution({
      message: input.message,
      taskContext: input.taskContext,
      intent: result.intent,
      conversationIntent: input.conversationIntent,
    })
  ) {
    return normalizeAllowedSocialExecutionRoute(result);
  }
  return {
    ...result,
    intent: 'casual_chat',
    confidence: Math.min(result.confidence, 0.82),
    shouldSearch: false,
    shouldReplan: false,
    shouldExecuteAction: false,
    replyStrategy: 'conversational_answer',
  };
}

export function enforceExplicitSocialExecutionRoute(
  input: SocialAgentIntentRouterInput & {
    conversationIntent?: SocialAgentConversationIntent | null;
  },
  result: SocialAgentIntentRouterResult,
): SocialAgentIntentRouterResult {
  const gated = enforceSocialIntentGate(input, result);
  if (isSocialExecutionIntent(gated.intent)) return gated;
  if (
    hasExplicitCandidateRefinementIntent(input.message) &&
    hasExistingSocialExecutionContext(input)
  ) {
    return normalizeAllowedSocialExecutionRoute({
      ...gated,
      intent: 'candidate_followup',
      confidence: Math.max(gated.confidence, 0.9),
      source: gated.source,
      shouldSearch: true,
      shouldReplan: false,
      shouldExecuteAction: false,
      replyStrategy: 'search_candidates',
    });
  }
  if (!hasExplicitSocialExecutionIntent(input.message)) return gated;
  if (hasExplicitSocialSideEffectIntent(input.message)) {
    if (
      !hasExistingSocialActionContext(input) &&
      !hasExistingPublishContext(input.message, input.taskContext)
    ) {
      return gated;
    }
    return normalizeAllowedSocialExecutionRoute({
      ...gated,
      intent: 'action_request',
      confidence: Math.max(gated.confidence, 0.9),
      source: gated.source,
      shouldSearch: false,
      shouldReplan: false,
      shouldExecuteAction: true,
      replyStrategy: 'execute_action',
    });
  }
  return normalizeAllowedSocialExecutionRoute({
    ...gated,
    intent: 'social_search',
    confidence: Math.max(gated.confidence, 0.9),
    source: gated.source,
    shouldSearch: true,
    shouldReplan: false,
    shouldExecuteAction: false,
    replyStrategy: 'search_candidates',
  });
}

export function hasExistingPublishContext(
  message: string,
  taskContext?: SocialAgentIntentRouterInput['taskContext'],
): boolean {
  if (!hasExplicitPublishSideEffectIntent(message)) return false;
  if (!taskContext) return false;
  if (nonEmptyRecord(taskContext.taskSlots)) return true;
  if (nonEmptyRecord(taskContext.taskSlotSummary)) return true;
  if (nonEmptyRecord(taskContext.shortTerm)) return true;
  if (nonEmptyRecord(taskContext.shortTermMemory)) return true;
  if (nonEmptyRecord(taskContext.activityState)) return true;
  if (nonEmptyText(taskContext.currentGoal)) return true;
  if (nonEmptyText(taskContext.goal)) return true;
  if (nonEmptyText(taskContext.taskGoal)) return true;
  const taskMemory = nonEmptyRecord(taskContext.taskMemory)
    ? (taskContext.taskMemory as Record<string, unknown>)
    : null;
  if (nonEmptyRecord(taskMemory?.taskSlots)) return true;
  if (nonEmptyRecord(taskMemory?.taskSlotSummary)) return true;
  if (nonEmptyRecord(taskMemory?.activeEntities)) return true;
  if (nonEmptyText(taskMemory?.currentGoal)) return true;
  return false;
}

function stripPublishSideEffectOptOut(text: string): string {
  return text.replace(publishSideEffectNegationPattern, '');
}

function positiveNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function nonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function nonEmptyRecord(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return Object.keys(value).length > 0;
}

function nonEmptyText(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim().length > 0;
  }
  return false;
}

function normalizeAllowedSocialExecutionRoute(
  result: SocialAgentIntentRouterResult,
): SocialAgentIntentRouterResult {
  if (result.intent === 'social_search') {
    return {
      ...result,
      shouldSearch: true,
      shouldExecuteAction: false,
      replyStrategy: 'search_candidates',
    };
  }
  if (result.intent === 'activity_search') {
    return {
      ...result,
      shouldSearch: true,
      shouldExecuteAction: false,
      replyStrategy: 'search_activities',
    };
  }
  if (result.intent === 'action_request') {
    return {
      ...result,
      shouldSearch: false,
      shouldExecuteAction: true,
      replyStrategy: 'execute_action',
    };
  }
  return result;
}

function isProfileEnrichmentDominant(message: string): boolean {
  return profileDominantIntent(message) !== null;
}

function profileDominantIntent(
  message: string,
): 'profile_enrichment' | 'profile_enrichment_request' | null {
  const text = message.trim().toLowerCase();
  if (!text) return null;
  if (profileEnrichmentRequestPattern.test(text)) {
    return 'profile_enrichment_request';
  }
  if (
    hasRichProfileFactsForGate(text) &&
    !immediateSocialSearchPattern.test(text)
  ) {
    return 'profile_enrichment';
  }
  return null;
}

function hasRichProfileFactsForGate(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (!text) return false;
  const signals = [
    /我是[^，。,.]{0,14}(男|女)/i,
    /\b\d{1,2}\s*岁?\b/,
    /身高\s*\d{2,3}/i,
    /体重\s*\d{2,3}/i,
    /(白羊|金牛|双子|巨蟹|狮子|处女|天秤|天蝎|射手|摩羯|水瓶|双鱼)/,
    /\b(infp|enfp|intj|entj|intp|entp|isfp|istp|isfj|istj|esfp|estp|esfj|estj|infj|enfj)\b/i,
    /(我在|我常住|常住|住在).{0,24}(青岛|北京|上海|深圳|广州|大学|校区|区)/,
    /(性格|开放|外向|内向|慢热|开朗)/,
    /(喜欢|爱好|平时|一般).{0,24}(跑步|散步|羽毛球|篮球|健身|咖啡|拍照|编程|音乐|读书)/,
    /(周末|下午|晚上|工作日).{0,12}(有空|一般|通常|偏好)/,
    /(想找|想认识|希望认识).{0,24}(同校|女生|男生|搭子|朋友)/,
  ];
  return (
    signals.reduce(
      (count, pattern) => count + (pattern.test(text) ? 1 : 0),
      0,
    ) >= 2
  );
}
