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
        candidateActions: {
          'candidate-42': {
            status: 'skipped',
            targetUserId: 42,
          },
          'candidate-43': {
            status: 'saved',
            targetUserId: 43,
          },
        },
        pendingApprovals: [
          {
            approvalId: 'approval-send-43',
            actionType: 'send_invite',
            targetUserId: 43,
          },
        ],
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
        preferences: expect.objectContaining({
          interests: [],
        }),
        legacyPreferences: ['跑步'],
        boundaries: expect.objectContaining({
          publicPlaceOnly: false,
        }),
        legacyBoundaries: ['先线上确认'],
        candidateActions: {
          'candidate-42': {
            status: 'skipped',
            targetUserId: 42,
          },
          'candidate-43': {
            status: 'saved',
            targetUserId: 43,
          },
        },
        pendingApprovals: [
          {
            approvalId: 'approval-send-43',
            actionType: 'send_invite',
            targetUserId: 43,
          },
        ],
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

  it('prefers hydrated recent messages over stale task conversation history', () => {
    const input = buildSocialAgentDirectReplyFinalResponseInput({
      message: '可以，帮我找人',
      route: makeRoute({ intent: 'social_search' }),
      task: makeTask(),
      memoryContext: null,
      conversationHistory: [
        { role: 'user', content: '今天晚上，青岛大学附近，散步' },
        { role: 'assistant', content: '我已经记住这些条件。' },
      ],
      fallbackReply: '我会继续处理。',
    });

    expect(input.conversationHistory).toEqual([
      { role: 'user', text: '今天晚上，青岛大学附近，散步' },
      { role: 'assistant', text: '我已经记住这些条件。' },
    ]);
    expect(input.conversationHistory).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '我在青岛大学，想找同校跑步搭子' }),
      ]),
    );
  });

  it('prefers explicit hydrated task context over stale task summary', () => {
    const hydratedTaskContext = {
      taskSlots: {
        time_window: { value: '今天晚上', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        activity: { value: '散步', state: 'completed' },
        candidate_preference: {
          value: '公开资料有舞蹈相关标签的人优先',
          state: 'completed',
        },
      },
      knownTaskSlotConstraints: {
        completedSlotKeys: [
          'time_window',
          'location_text',
          'activity',
          'candidate_preference',
        ],
        doNotRepeatQuestionsForSlots: [
          'time_window',
          'location_text',
          'activity',
          'candidate_preference',
        ],
      },
      pendingApprovals: [{ approvalId: 'approval-publish-1' }],
      candidateActions: { skipped: ['candidate-7'] },
    };

    const input = buildSocialAgentDirectReplyFinalResponseInput({
      message: '可以，帮我继续找人',
      route: makeRoute({ intent: 'social_search' }),
      task: makeTask(),
      memoryContext: null,
      taskContext: hydratedTaskContext,
      fallbackReply: '我会继续处理。',
    });

    expect(input.taskContext).toBe(hydratedTaskContext);
    expect(input.taskContext).toMatchObject({
      taskSlots: {
        candidate_preference: {
          value: '公开资料有舞蹈相关标签的人优先',
          state: 'completed',
        },
      },
      knownTaskSlotConstraints: {
        doNotRepeatQuestionsForSlots: expect.arrayContaining([
          'time_window',
          'location_text',
          'activity',
          'candidate_preference',
        ]),
      },
      pendingApprovals: [{ approvalId: 'approval-publish-1' }],
      candidateActions: { skipped: ['candidate-7'] },
    });
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

  it('prefers hydrated memory recent turns for Agent Brain final responses', () => {
    const input = buildSocialAgentAgentBrainFinalResponseInput({
      message: '你到底记不记得我刚才说的？',
      task: makeTask(),
      intent: 'correction_or_clarification',
      mode: 'profile_correction',
      extractedProfile: { city: '青岛' },
      sourceMessage: '今晚青岛大学附近散步，公开资料有舞蹈标签的人优先。',
      fallbackReply: '我会继续。',
      memoryContext: {
        shortTerm: {
          recentTurns: [
            {
              role: 'user',
              text: '今天晚上青岛大学附近散步，优先舞蹈相关公开标签',
            },
            {
              role: 'assistant',
              text: '我已经记住时间、地点、活动和候选偏好。',
            },
          ],
        },
      } as never,
    });

    expect(input.conversationHistory).toEqual([
      {
        role: 'user',
        text: '今天晚上青岛大学附近散步，优先舞蹈相关公开标签',
      },
      {
        role: 'assistant',
        text: '我已经记住时间、地点、活动和候选偏好。',
      },
    ]);
    expect(input.conversationHistory).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '我在青岛大学，想找同校跑步搭子' }),
      ]),
    );
  });

  it('prefers explicit hydrated task context for Agent Brain final responses', () => {
    const hydratedTaskContext = {
      taskSlots: {
        time_window: { value: '今天晚上', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        activity: { value: '散步', state: 'completed' },
      },
      pendingApprovals: [{ approvalId: 'approval-send-1' }],
    };
    const input = buildSocialAgentAgentBrainFinalResponseInput({
      message: '保存后继续安排',
      task: makeTask(),
      intent: 'profile_enrichment',
      mode: 'profile_updated',
      extractedProfile: { city: '青岛' },
      sourceMessage: '今晚青岛大学附近散步',
      fallbackReply: '画像已保存。',
      memoryContext: null,
      taskContext: hydratedTaskContext,
    });

    expect(input.taskContext).toBe(hydratedTaskContext);
    expect(input.taskContext).toMatchObject({
      taskSlots: {
        time_window: { value: '今天晚上', state: 'completed' },
      },
      pendingApprovals: [{ approvalId: 'approval-send-1' }],
    });
  });
});
