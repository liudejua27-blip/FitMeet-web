import {
  buildSocialAgentLlmConversationHistory,
  summarizeSocialAgentTaskMemoryForLlm,
} from './social-agent-chat-memory.presenter';
import {
  readSocialAgentConversationBrainDecision,
  readSocialAgentConversationBrainLastToolResult,
  readSocialAgentCurrentAgentState,
  socialAgentFinalResponseSafetyRules,
} from './social-agent-chat-brain-memory.presenter';
import type { SocialAgentFinalResponseInput } from './social-agent-final-response.service';
import type { AgentTask } from './entities/agent-task.entity';
import type { ExtractedProfileFields } from './social-agent-chat.types';
import type {
  SocialAgentIntentRouterResult,
  SocialAgentIntentType,
} from './social-agent-intent-router.service';
import type { SocialAgentMemoryContext } from './social-agent-memory-context.service';

type SocialAgentChatProfileUpdateMode =
  | 'profile_extraction'
  | 'profile_correction'
  | 'profile_updated';

export function buildSocialAgentDirectReplyFinalResponseInput(input: {
  message: string;
  route: SocialAgentIntentRouterResult;
  task: AgentTask;
  memoryContext: SocialAgentMemoryContext | null;
  toolResults?: Array<Record<string, unknown>>;
  fallbackReply: string;
}): SocialAgentFinalResponseInput {
  return {
    userMessage: input.message,
    intent: input.route.intent,
    route: input.route as unknown as Record<string, unknown>,
    agentState: readSocialAgentCurrentAgentState(input.task),
    conversationHistory: buildSocialAgentLlmConversationHistory(input.task),
    memoryContext: memoryContextRecord(input.memoryContext),
    taskContext: summarizeSocialAgentTaskMemoryForLlm(input.task),
    plannerDecision: readSocialAgentConversationBrainDecision(input.task),
    toolResults:
      input.toolResults && input.toolResults.length > 0
        ? input.toolResults
        : [readSocialAgentConversationBrainLastToolResult(input.task)].filter(
            Boolean,
          ),
    safetyRules: socialAgentFinalResponseSafetyRules(),
    responseGoal: '直接回答用户问题，并根据当前状态自然推进下一步。',
    fallbackReply: input.fallbackReply,
  };
}

export function buildSocialAgentAgentBrainFinalResponseInput(input: {
  message: string;
  task: AgentTask;
  intent: SocialAgentIntentType;
  mode: SocialAgentChatProfileUpdateMode;
  extractedProfile: ExtractedProfileFields;
  sourceMessage: string;
  toolOutput?: Record<string, unknown>;
  fallbackReply: string;
  memoryContext: SocialAgentMemoryContext | null;
}): SocialAgentFinalResponseInput {
  return {
    userMessage: input.message,
    intent: input.intent,
    agentState: readSocialAgentCurrentAgentState(input.task),
    conversationHistory: buildSocialAgentLlmConversationHistory(input.task),
    memoryContext: memoryContextRecord(input.memoryContext),
    taskContext: summarizeSocialAgentTaskMemoryForLlm(input.task),
    plannerDecision: readSocialAgentConversationBrainDecision(input.task),
    toolResults: input.toolOutput ? [input.toolOutput] : [],
    safetyRules: socialAgentFinalResponseSafetyRules(),
    responseGoal:
      input.mode === 'profile_updated'
        ? '告诉用户画像已保存，说明已更新字段、补充记忆和缺失信息，并询问下一步。'
        : '告诉用户已提取画像信息，说明暂未自动搜索，并询问是否保存、补充或开始搜索。',
    fallbackReply: input.fallbackReply,
  };
}

function memoryContextRecord(
  memoryContext: SocialAgentMemoryContext | null,
): Record<string, unknown> {
  return (memoryContext ?? {}) as unknown as Record<string, unknown>;
}
