import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import {
  buildSocialAgentAgentBrainFinalResponseInput,
  buildSocialAgentDirectReplyFinalResponseInput,
} from './social-agent-chat-final-response.presenter';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    agentConnectionId: null,
    taskType: 'social_agent_chat',
    title: 'FitMeet Social Agent 聊天任务',
    goal: '今晚青岛轻松跑步',
    input: {},
    plan: [],
    toolCalls: [],
    result: {},
    memory: {
      agentState: 'profile_saved',
      socialAgentConversation: {
        turns: [
          { role: 'user', text: '我在青岛大学，想找同校跑步搭子' },
          { role: 'assistant', text: '我先帮你整理画像。' },
        ],
      },
      taskMemory: {
        preferences: ['跑步'],
        boundaries: ['先线上确认'],
      },
      conversationBrain: {
        intent: 'product_help',
        responseGoal: 'Answer with profile context.',
        lastToolResult: {
          name: 'get_user_profile',
          success: true,
        },
      },
    },
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Confirm,
    riskLevel: 'low' as never,
    idempotencyKey: null,
    statusReason: null,
    error: null,
    startedAt: null,
    awaitingConfirmationAt: null,
    completedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  } as AgentTask;
}

function makeRoute(
  overrides: Partial<SocialAgentIntentRouterResult> = {},
): SocialAgentIntentRouterResult {
  return {
    intent: 'product_help',
    confidence: 0.92,
    entities: {
      city: '',
      activityType: '',
      targetGender: '',
      timePreference: '',
      locationPreference: '',
    },
    shouldSearch: false,
    shouldReplan: false,
    shouldUpdateProfile: false,
    shouldExecuteAction: false,
    replyStrategy: 'conversational_answer',
    source: 'rules',
    ...overrides,
  };
}

describe('social-agent-chat-final-response.presenter', () => {
  it('builds direct reply input from task state and last tool result', () => {
    const input = buildSocialAgentDirectReplyFinalResponseInput({
      message: '我的画像现在缺什么？',
      route: makeRoute(),
      task: makeTask(),
      memoryContext: null,
      fallbackReply: '我可以先看你的画像。',
    });

    expect(input).toMatchObject({
      userMessage: '我的画像现在缺什么？',
      intent: 'product_help',
      agentState: 'profile_saved',
      memoryContext: {},
      taskContext: {
        goal: '今晚青岛轻松跑步',
        preferences: ['跑步'],
        boundaries: ['先线上确认'],
      },
      plannerDecision: {
        intent: 'product_help',
        responseGoal: 'Answer with profile context.',
      },
      responseGoal: '直接回答用户问题，并根据当前状态自然推进下一步。',
      fallbackReply: '我可以先看你的画像。',
    });
    expect(input.conversationHistory).toEqual([
      { role: 'user', text: '我在青岛大学，想找同校跑步搭子' },
      { role: 'assistant', text: '我先帮你整理画像。' },
    ]);
    expect(input.toolResults).toEqual([
      expect.objectContaining({ name: 'get_user_profile', success: true }),
    ]);
    expect(input.safetyRules).toEqual(
      expect.arrayContaining([
        expect.stringContaining('不得编造候选人'),
        expect.stringContaining('不要暴露 DeepSeek'),
      ]),
    );
  });

  it('prefers explicit tool results over stored last tool result', () => {
    const input = buildSocialAgentDirectReplyFinalResponseInput({
      message: '帮我解释一下',
      route: makeRoute(),
      task: makeTask(),
      memoryContext: {
        longTerm: {
          profileFacts: { city: '青岛' },
          preferences: {},
          boundaries: {},
          activityPreferences: {},
          socialGoals: [],
          availability: [],
          matchSignals: {},
          taskCount: 0,
          updatedAt: null,
        },
      } as never,
      toolResults: [{ name: 'get_conversation_history', success: true }],
      fallbackReply: '可以。',
    });

    expect(input.memoryContext).toMatchObject({
      longTerm: { profileFacts: { city: '青岛' } },
    });
    expect(input.toolResults).toEqual([
      { name: 'get_conversation_history', success: true },
    ]);
  });

  it('builds profile-updated Agent Brain input with tool output context', () => {
    const input = buildSocialAgentAgentBrainFinalResponseInput({
      message: '保存这个画像',
      task: makeTask(),
      intent: 'profile_enrichment',
      mode: 'profile_updated',
      extractedProfile: { city: '青岛' },
      sourceMessage: '我在青岛大学',
      toolOutput: {
        tool: 'update_profile_from_agent_context',
        updatedFields: ['city'],
      },
      fallbackReply: '画像已保存。',
      memoryContext: null,
    });

    expect(input).toMatchObject({
      userMessage: '保存这个画像',
      intent: 'profile_enrichment',
      agentState: 'profile_saved',
      responseGoal:
        '告诉用户画像已保存，说明已更新字段、补充记忆和缺失信息，并询问下一步。',
      fallbackReply: '画像已保存。',
    });
    expect(input.toolResults).toEqual([
      {
        tool: 'update_profile_from_agent_context',
        updatedFields: ['city'],
      },
    ]);
  });
});
