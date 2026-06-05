import type { SocialAgentIntentType } from './social-agent-intent-router.service';

export function conversationalFallbackReply(
  message: string,
  intent: SocialAgentIntentType,
): string {
  if (/(你能做什么|你可以做什么|能力|fitmeet|产品|社交助理)/i.test(message)) {
    return '我是 FitMeet 的 AI 社交助理，可以正常聊天、解释人物画像和匹配逻辑，也能帮你完善画像、找搭子、推荐候选、发起约练，并生成更自然的开场白。当你明确说要找人、找搭子或找活动时，我再调用搜索工具；发送消息、加好友和邀请见面都需要你确认。';
  }
  if (intent === 'workflow_help' || looksLikeWorkflowQuestion(message)) {
    return workflowHelpReply();
  }
  if (looksLikeProfileDefinitionQuestion(message)) {
    return '人物画像是 FitMeet 用来理解你社交偏好的一组信息，包括城市、常活动区域、兴趣爱好、运动目标、可约时间、想认识什么样的人、隐私边界和不接受的行为。它不是公开简历，而是帮助 Agent 更准确地推荐合适的人、约练卡片和活动。';
  }
  if (looksLikeProfileCompletionQuestion(message)) {
    return '可以。我会边聊边帮你补齐画像。你可以先告诉我：你在哪个城市、常活动区域、兴趣爱好、可约时间、想认识什么样的人，以及不接受哪些行为。比如：我在青岛大学，周末下午有空，喜欢跑步和咖啡，想认识同校运动搭子，不喜欢夜间见面。';
  }
  if (/(deepseek|api|不会回答|为什么.*回答|回答.*问题)/i.test(message)) {
    return '你说得对，普通问题我应该直接回答，而不是只返回模板。作为 FitMeet 的 AI 社交助理，我可以回答产品、人物画像、匹配逻辑和社交偏好问题；当你明确要找人、找活动或发起动作时，我再调用对应工具。';
  }
  return '可以，我是 FitMeet 的 AI 社交助理，先按最短流程帮你梳理。你不用一次性填写完整画像，只要先告诉我：城市、兴趣、可约时间、常活动区域、想约什么、想认识什么样的人，以及有什么边界要求。后面我会边聊边补齐。';
}

export function looksLikeWorkflowQuestion(message: string): boolean {
  return /(先.*画像.*约练|先.*完善.*画像|直接发布需求|怎么开始约练|下一步|需要怎么做|流程)/i.test(
    message,
  );
}

export function looksLikeProfileDefinitionQuestion(message: string): boolean {
  return /(人物画像是什么|AI画像是什么|ai画像是什么|画像是什么|什么是人物画像)/i.test(
    message,
  );
}

export function looksLikeProfileCompletionQuestion(message: string): boolean {
  return /(帮我完善.*画像|完善.*人物画像|完善.*AI画像|怎么填写画像|怎么完善画像)/i.test(
    message,
  );
}

export function directReplySystemPrompt(): string {
  return [
    '你是 FitMeet 的主 Agent 大脑。你要像一个真正的社交助理一样完整理解上下文，而不是只按关键词返回模板。',
    '如果用户问流程，例如“先完善画像再约练，还是直接发布需求”，回答两种路径都可以：直接发布更快，先完善画像更准；建议先补齐城市/区域、兴趣、可约时间、想认识的人和边界。',
    '如果用户纠正你，例如“不是不是”“上面是我的人物画像”，要承认修正并重新理解上一轮，不要重复解释概念。',
    '如果用户只是提问或聊天，直接回答问题；只有用户明确要求找人、找活动、发消息、加好友时，才提到工具动作。',
    '不要暴露 DeepSeek、API、模型失败、后端、工具日志等技术细节。',
    '你是 FitMeet 的 AI 社交助理。',
    '你的职责：回答用户关于人物画像、偏好、匹配、社交边界、约练流程、权限模式和产品能力的问题。',
    '你可以帮助用户完善画像，但不要在用户没提供具体偏好时伪造画像，也不要把提问写成偏好。',
    '当用户明确说要找人、找搭子、找活动时，才说明可以进入搜索；当前这条链路只负责自然语言回答，不能伪装已经搜索。',
    '当用户明确说要发消息、加好友、邀请见面时，必须说明需要用户确认，不能声称已经执行。',
    '不要乱编候选人、消息、会话或工具结果。',
    '回答要具体、自然、像智能助手，不要只说“等你明确说要找人时再搜索”。',
    '如果用户问“人物画像是什么”，解释它是 FitMeet 用来理解城市、兴趣、运动习惯、可约时间、想认识的人、隐私边界和不接受行为的偏好信息，不是完整公开简历。',
    '如果用户问“你可以帮我完善人物画像吗”，先解释可以，并引导用户从城市/区域、兴趣、运动目标、可约时间、想认识的人、不接受行为开始补充。',
  ].join('\n');
}

export function productHelpFallbackReply(message: string): string {
  if (
    /(先.*画像.*约练|直接发布需求|怎么开始约练|下一步|需要怎么做|怎么做|流程)/i.test(
      message,
    )
  ) {
    return workflowHelpReply();
  }
  if (/(人物画像|ai画像|画像是什么|画像.*是什么)/i.test(message)) {
    return '人物画像是 FitMeet 用来理解你社交偏好的一组信息，包括城市、常活动区域、兴趣爱好、运动目标、可约时间、想认识什么样的人、隐私边界和不接受的行为。它不是公开简历，而是帮助 Agent 更准确地推荐合适的人、约练卡片和活动。';
  }
  if (/(完善.*画像|画像.*完善|帮我完善)/i.test(message)) {
    return '可以。我可以通过几个问题帮你补齐画像。你可以先告诉我：你在哪个城市、常活动区域、兴趣爱好、可约时间、想认识什么样的人，以及不接受哪些行为。';
  }
  if (/(deepseek|api|不会回答|回答问题|为什么.*回答)/i.test(message)) {
    return '你说得对，普通问题应该由大模型回答，而不是只返回模板。如果大模型暂时超时，我也应该给你相关解释。你可以继续问 FitMeet、人物画像、匹配逻辑或社交偏好相关问题。';
  }
  if (/(你能做什么|你可以做什么|能力|fitmeet|产品|社交助理)/i.test(message)) {
    return '我是 FitMeet 的 AI 社交助理，可以正常聊天、解释人物画像和匹配逻辑，也能帮你完善画像、找搭子、推荐候选、发起约练，并生成更自然的开场白。当你明确说要找人、找搭子或找活动时，我再调用搜索工具；发送消息、加好友和邀请见面都需要你确认。';
  }
  if (/(你好|hello|hi|嗨)/i.test(message)) {
    return '你好，我是 FitMeet 的 AI 社交助理。你可以问我人物画像、匹配逻辑、偏好怎么补充，也可以直接告诉我城市、兴趣、可约时间和社交边界，我会帮你整理得更清楚。';
  }
  return '我刚才调用大模型失败了，但我仍然可以先帮你梳理。你可以告诉我：城市、兴趣、可约时间、想认识的人和不接受的行为，我会继续完善画像。';
}

export function workflowHelpReply(): string {
  return [
    '两种都可以。',
    '如果你想快，可以直接发布需求，比如“我在青岛大学，想找周末下午一起跑步的同校搭子”，Agent 会边匹配边补齐画像。',
    '如果你想匹配更准，建议先完善画像，至少补齐：城市/区域、兴趣、可约时间、想认识的人、边界要求。',
    '我建议你现在先用 1 分钟补齐基础画像，然后我再帮你发布约练需求。',
    '你可以直接按这个格式发我：我在__，平时喜欢__，一般__有空，想认识__，不接受__。',
  ].join('\n');
}
