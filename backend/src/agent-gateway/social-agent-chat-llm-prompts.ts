import { directReplySystemPrompt } from './social-agent-chat-replies';
import {
  buildSocialAgentLlmConversationHistory,
  summarizeSocialAgentTaskMemoryForLlm,
} from './social-agent-chat-memory.presenter';
import {
  readSocialAgentConversationBrainLastToolResult,
  readSocialAgentConversationBrainPlannedTools,
} from './social-agent-chat-brain-memory.presenter';
import type { AgentTask } from './entities/agent-task.entity';
import type { ExtractedProfileFields } from './social-agent-chat.types';
import type {
  SocialAgentIntentRouterResult,
  SocialAgentIntentType,
} from './social-agent-intent-router.service';
import type { SocialAgentMemoryContext } from './social-agent-memory-context.service';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type LongTermMemoryPromptSnapshot = {
  taskCount?: unknown;
  profileFacts?: unknown;
  preferences?: unknown;
  boundaries?: unknown;
  socialGoals?: unknown;
  availability?: unknown;
  activityPreferences?: unknown;
  matchSignals?: unknown;
};

export function buildSocialAgentDirectReplyMessages(input: {
  message: string;
  route: SocialAgentIntentRouterResult;
  profile: Record<string, unknown> | null;
  task: AgentTask;
  longTermSnapshot: LongTermMemoryPromptSnapshot | null;
  memoryContext: SocialAgentMemoryContext | null;
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content: directReplySystemPrompt(),
    },
    {
      role: 'user',
      content: JSON.stringify({
        userMessage: input.message,
        intent: input.route.intent,
        profileSummary: input.profile ?? {},
        taskMemory: summarizeSocialAgentTaskMemoryForLlm(input.task),
        memoryContext: input.memoryContext,
        longTermMemory: input.longTermSnapshot
          ? {
              taskCount: input.longTermSnapshot.taskCount,
              profileFacts: input.longTermSnapshot.profileFacts,
              preferences: input.longTermSnapshot.preferences,
              boundaries: input.longTermSnapshot.boundaries,
              socialGoals: input.longTermSnapshot.socialGoals,
              availability: input.longTermSnapshot.availability,
              activityPreferences: input.longTermSnapshot.activityPreferences,
              matchSignals: input.longTermSnapshot.matchSignals,
            }
          : null,
        conversationHistory: buildSocialAgentLlmConversationHistory(
          input.task,
          8,
        ),
      }),
    },
  ];
}

export function buildSocialAgentAgentBrainMessages(input: {
  message: string;
  task: AgentTask;
  intent: SocialAgentIntentType;
  mode: 'profile_extraction' | 'profile_correction' | 'profile_updated';
  extractedProfile: ExtractedProfileFields;
  sourceMessage: string;
  toolOutput?: Record<string, unknown>;
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是 FitMeet 的主 Agent 大脑，不是关键词模板机器人。',
        '你要完整理解最近上下文、用户纠正和当前动作状态，再生成自然、具体的中文回复。',
        '如果 mode=profile_extraction：说明已提取画像信息，不要立刻搜索；询问用户是先保存/继续补齐，还是现在开始搜索。',
        '如果 mode=profile_correction：先承认理解修正，说明上一段是画像信息不是搜索需求；展示提取字段；不要重复解释“人物画像是什么”。',
        '如果 mode=profile_updated：说明已经调用工具保存画像；区分已写入画像字段和作为补充记忆记录的字段；继续询问缺少的可约时间、约练类型和边界要求。',
        '如果用户的画像信息里带有“想找某类人”，这只是社交目标；除非用户明确说现在搜索，否则不要声称已经搜索。',
        '不要暴露 DeepSeek、API、模型失败、后端、工具日志等技术细节。',
        '不要编造候选人、会话、消息或已经执行的工具结果。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        userMessage: input.message,
        intent: input.intent,
        mode: input.mode,
        sourceProfileMessage: input.sourceMessage,
        extractedProfile: input.extractedProfile,
        toolOutput: input.toolOutput ?? null,
        toolResult: input.toolOutput ?? null,
        plannedTools: readSocialAgentConversationBrainPlannedTools(input.task),
        lastToolResult: readSocialAgentConversationBrainLastToolResult(
          input.task,
        ),
        availableTools: [
          'update_profile_from_agent_context',
          'search_real_candidates',
          'create_social_request',
          'send_message_to_candidate',
          'connect_candidate',
          'create_activity',
          'get_user_profile',
          'get_conversation_history',
        ],
        taskMemory: summarizeSocialAgentTaskMemoryForLlm(input.task),
        conversationHistory: buildSocialAgentLlmConversationHistory(
          input.task,
          8,
        ),
      }),
    },
  ];
}
