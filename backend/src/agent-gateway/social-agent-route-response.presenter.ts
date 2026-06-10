import { cleanDisplayText } from '../common/display-text.util';
import type { AgentTask } from './entities/agent-task.entity';
import type { FitMeetAlphaTurnDecision } from './fitmeet-alpha-agent.types';
import {
  productHelpFallbackReply,
  workflowHelpReply,
} from './social-agent-chat-replies';
import { socialAgentFitnessMathReply } from './social-agent-fitness-math-reply';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import { hasSocialAgentSearchContext } from './social-agent-candidate-context.presenter';
import type {
  SocialAgentAsyncRunSnapshot,
  SocialAgentIntentAction,
  SocialAgentIntentRouteResult,
} from './social-agent-chat.types';

export function socialAgentRouteAction(
  route: SocialAgentIntentRouterResult,
  queuedRun: SocialAgentAsyncRunSnapshot | null,
  runMode: SocialAgentIntentRouteResult['runMode'],
): SocialAgentIntentAction {
  if (queuedRun) {
    return runMode === 'follow_up' ? 'queue_replan' : 'queue_search';
  }
  if (route.replyStrategy === 'conversational_answer') return 'answer';
  if (route.replyStrategy === 'append_context') return 'save_context';
  if (route.replyStrategy === 'execute_action') return 'await_confirmation';
  if (route.replyStrategy === 'ask_clarifying_question') return 'clarify';
  return 'reply';
}

export function socialAgentAssistantMessageForRoute(input: {
  route: SocialAgentIntentRouterResult;
  task: AgentTask;
  message: string;
}): string {
  const { route, task, message } = input;
  if (route.intent === 'casual_chat') return casualChatReply(message);
  if (route.intent === 'product_help') return productHelpFallbackReply(message);
  if (route.intent === 'workflow_help') return workflowHelpReply();
  if (route.intent === 'fitness_math')
    return socialAgentFitnessMathReply(message);
  if (
    route.intent === 'profile_enrichment' ||
    route.intent === 'profile_enrichment_request' ||
    route.intent === 'correction_or_clarification'
  ) {
    return '我先按你的画像信息来理解，不会直接搜索候选人。';
  }
  if (route.intent === 'profile_update') {
    return '已记住你的偏好，并写入当前上下文。等你明确说要找人、找活动或找搭子时，我再开始匹配。';
  }
  if (route.intent === 'safety_or_boundary') {
    return '已记住这条安全边界。后续推荐会按这个限制处理，也不会自动发送消息、加好友或发布约练。';
  }
  if (route.intent === 'social_search') {
    const city = route.entities.city ? `${route.entities.city} ` : '';
    const activity = route.entities.activityType
      ? `${route.entities.activityType} `
      : '';
    return `明白，你是在找${city}${activity}搭子或候选人。我会在后台搜索，结果好了会直接插入聊天流。`;
  }
  if (route.intent === 'activity_search') {
    return '明白，你是在找活动或约练。我会先按活动/公开意图方向搜索，必要时再补充候选人推荐。';
  }
  if (route.intent === 'candidate_followup') {
    return hasSocialAgentSearchContext(task)
      ? '我会基于现有候选继续处理，不会同步阻塞当前聊天。'
      : '我还没有候选人上下文。你可以先说清楚想找什么样的人，我再帮你匹配。';
  }
  if (route.intent === 'action_request') {
    return hasSocialAgentSearchContext(task)
      ? '可以，但我不会自动执行。请在候选卡片上确认发送、收藏或加好友，我会按你的确认执行并记录审批/动作日志。'
      : '可以，不过现在还没有候选人。你可以先说想找什么样的人，我找到候选后再由你确认发送、收藏或加好友。';
  }
  return '我还不确定你是想继续聊天、补充偏好，还是开始找人/活动。你可以直接说“帮我找青岛拍照搭子”或“记住我不喜欢夜间见面”。';
}

export function shouldUseSocialAgentLlmDirectReply(
  route: SocialAgentIntentRouterResult,
): boolean {
  return (
    route.intent === 'product_help' ||
    route.intent === 'workflow_help' ||
    route.intent === 'casual_chat' ||
    route.intent === 'unknown'
  );
}

export function socialAgentAlphaNeedsClarification(
  alphaTurn?: FitMeetAlphaTurnDecision,
): boolean {
  const intent = isRecord(alphaTurn?.structuredIntent)
    ? alphaTurn?.structuredIntent
    : {};
  return (
    intent.requiresSearch === false &&
    cleanDisplayText(intent.readiness, '') === 'clarify'
  );
}

export function socialAgentAlphaClarifyingMessage(
  alphaTurn?: FitMeetAlphaTurnDecision,
  safeAssistantMessage?: (question: string, fallback: string) => string,
): string {
  const intent = isRecord(alphaTurn?.structuredIntent)
    ? alphaTurn?.structuredIntent
    : {};
  const question = cleanDisplayText(intent.clarifyingQuestion, '');
  const fallback =
    '可以。我先帮你找轻松一点、不需要太强社交压力的人。你更想今晚附近试试，还是周末下午找个时间？';
  return safeAssistantMessage?.(question, fallback) || question || fallback;
}

function casualChatReply(message: string): string {
  if (/(你能做什么|你可以做什么)/i.test(message)) {
    return '我可以先和你正常聊天，也可以记住你的偏好和安全边界。只有当你明确说要找人、找活动或找搭子时，我才会开始匹配；发送消息、加好友、发布约练都需要你确认。';
  }
  if (/(怎么找搭子|该怎么找|建议)/i.test(message)) {
    return '可以先说场景、城市、时间和边界，比如“青岛周末拍照搭子，不要夜间见面”。我会先记住你的偏好，等你明确要搜索时再匹配候选人。';
  }
  return '你好，我在。你可以随便聊，也可以补充偏好；等你明确说要找人、找活动或找搭子时，我再开始搜索。';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
