import type {
  SocialAgentIntentRouterInput,
  SocialAgentIntentRouterResult,
} from './social-agent-intent-router.service';

const socialSearchNegationPattern =
  /(不想|不用|不要|不是|先不|暂时不|别|无需|不需要).{0,12}(交友|找人|约练|搭子|匹配|推荐人|推荐用户|推荐朋友|推荐候选|活动|认识.{0,6}(新朋友|朋友|人))/i;

const socialSideEffectNegationPattern =
  /(不想|不用|不要|不是|先不|暂时不|别|无需|不需要).{0,12}(加好友|邀请|联系|发消息|发送消息|私信|自动发)/i;

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
  /(帮我找|给我找|想找|我要找|我想认识|想认识|认识.*(新朋友|朋友|人)|低压力社交|找一个|找个|找人|找.*(搭子|伙伴|朋友)|推荐.{0,8}(用户|朋友|人|搭子|候选|活动)|搜索.{0,8}(用户|朋友|人|搭子|候选|活动)|匹配.{0,8}(用户|朋友|人|搭子|候选)|附近.{0,8}(用户|朋友|人|搭子|活动)|同城.{0,8}(用户|朋友|人|搭子|活动)|真实用户|约练用户|户外搭子|篮球搭子|约练搭子|一起.{0,12}(咖啡|拍照|跑步|羽毛球|健身|瑜伽|徒步|户外|骑行|city\s*walk|citywalk|篮球|网球|游泳|运动|训练)|周末.{0,12}(咖啡|拍照|跑步|羽毛球|健身|瑜伽|徒步|户外|骑行|city\s*walk|citywalk|篮球|运动|训练))/i;

const explicitActivitySearchPattern =
  /(找|搜索|推荐|参加|发起|创建|有没有|附近|同城).{0,12}(活动|局|约练|跑团|课程|场地|线下见面|户外)/i;

const explicitSocialActionPattern =
  /(发消息|发送.*(给|第一个|第二个|第三个|这个|那个|他|她|候选)|加好友|邀请(第一个|第二个|第三个|这个|那个|他|她|候选)|约他|约她|联系(第一个|第二个|第三个|这个|那个|他|她|候选)|收藏(第一个|第二个|第三个|这个|那个|他|她|候选)|确认发布|帮我发|帮我加|帮我邀请)/i;

export function hasExplicitSocialExecutionIntent(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (!text) return false;
  if (isConversationOnlySocialMention(text)) return false;
  if (socialHelpQuestionPattern.test(text)) return false;
  if (socialCapabilityQuestionPattern.test(text)) return false;
  if (socialAdviceQuestionPattern.test(text)) return false;
  if (nonSocialLookupPattern.test(text)) return false;
  const hasSearchIntent =
    explicitSocialSearchPattern.test(text) ||
    explicitActivitySearchPattern.test(text);
  if (socialSearchNegationPattern.test(text)) return false;
  if (hasSearchIntent) return true;
  if (socialSideEffectNegationPattern.test(text)) return false;
  return explicitSocialActionPattern.test(text);
}

export function isConversationOnlySocialMention(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (!text) return false;
  if (
    safetyBoundaryOnlyPattern.test(text) &&
    !/(只是|只想|就想|普通|聊聊|聊天|倾诉|说说|心情|压力|焦虑|难过|烦)/i.test(
      text,
    )
  ) {
    return false;
  }
  if (
    /(帮我找|给我找|现在帮我找|马上帮我找|推荐.{0,8}(真实用户|候选|几个人)|搜索.{0,8}(真实用户|候选)|我想认识|想认识|我想找|想找|我要找)/i.test(
      text,
    ) &&
    !/(不要|不需要|先不|先别|别|无需|不用).{0,18}(推荐|搜索|找人|匹配|真实用户|候选)/i.test(
      text,
    )
  ) {
    return false;
  }
  return conversationOnlySocialMentionPattern.test(text);
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
}): boolean {
  if (hasExplicitSocialExecutionIntent(input.message)) return true;
  if (
    input.intent === 'candidate_followup' &&
    hasExistingSocialExecutionContext(input)
  ) {
    return true;
  }
  return false;
}

export function enforceSocialIntentGate(
  input: SocialAgentIntentRouterInput,
  result: SocialAgentIntentRouterResult,
): SocialAgentIntentRouterResult {
  if (!isSocialExecutionIntent(result.intent)) return result;
  if (
    shouldAllowSocialExecution({
      message: input.message,
      taskContext: input.taskContext,
      intent: result.intent,
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
