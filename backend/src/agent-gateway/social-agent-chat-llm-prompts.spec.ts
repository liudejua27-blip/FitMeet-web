import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import {
  buildSocialAgentAgentBrainMessages,
  buildSocialAgentDirectReplyMessages,
} from './social-agent-chat-llm-prompts';
import type {
  SocialAgentIntentRouterResult,
  SocialAgentIntentType,
} from './social-agent-intent-router.service';

function makeTask(): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    agentConnectionId: null,
    taskType: 'social_agent_chat',
    title: '周末青岛大学散步搭子',
    goal: '周末下午在青岛大学附近散步',
    input: {},
    plan: [],
    toolCalls: [],
    result: {},
    memory: {
      socialAgentConversation: {
        turns: Array.from({ length: 85 }, (_, index) => ({
          role: index % 2 === 0 ? 'user' : 'assistant',
          text: `turn-${index + 1}`,
        })),
      },
      taskMemory: {
        preferences: ['散步', '低强度'],
        boundaries: ['公共场所优先'],
      },
      taskSlots: {
        activity: {
          value: '散步',
          state: 'completed',
          source: 'user_message',
        },
        time_window: {
          value: '今天晚上',
          state: 'completed',
          source: 'user_message',
        },
        location_text: {
          value: '青岛大学附近',
          state: 'completed',
          source: 'user_message',
        },
        candidate_preference: {
          value: '女生、舞蹈相关公开标签优先',
          state: 'answered',
          source: 'user_message',
        },
      },
      knownTaskSlotConstraints: {
        treatAsHardConstraints: true,
        knownSlots: [
          {
            key: 'activity',
            label: '活动',
            value: '散步',
            confirmation: 'user_confirmed',
          },
          {
            key: 'time_window',
            label: '时间',
            value: '今天晚上',
            confirmation: 'user_confirmed',
          },
          {
            key: 'location_text',
            label: '地点',
            value: '青岛大学附近',
            confirmation: 'user_confirmed',
          },
          {
            key: 'candidate_preference',
            label: '候选偏好',
            value: '女生、舞蹈相关公开标签优先',
            confirmation: 'user_confirmed',
          },
        ],
        doNotAskAgainFor: [
          'activity',
          'time_window',
          'location_text',
          'candidate_preference',
        ],
        candidatePreferencePolicy:
          'candidate_preference 只能用于公开可发现资料、公开标签或用户自愿公开信息，不能推断隐私。',
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
  } as unknown as AgentTask;
}

function route(
  intent: SocialAgentIntentType = 'casual_chat',
): SocialAgentIntentRouterResult {
  return {
    intent,
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
  };
}

function userPayload(messages: Array<{ role: string; content: string }>) {
  return JSON.parse(messages[1].content) as Record<string, unknown>;
}

describe('social-agent-chat-llm-prompts', () => {
  it('uses compact context for direct DeepSeek replies', () => {
    const messages = buildSocialAgentDirectReplyMessages({
      message: '刚才我说的是今天晚上散步，不是周末。',
      route: route('correction_or_clarification'),
      profile: null,
      task: makeTask(),
      longTermSnapshot: null,
      memoryContext: null,
      contextTurnLimit: 8,
    });

    const payload = userPayload(messages);
    expect(payload.conversationHistory).toHaveLength(8);
    expect(payload.conversationHistory).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: 'turn-78' })]),
    );
  });

  it('prefers hydrated recent messages over stale task memory for direct DeepSeek replies', () => {
    const messages = buildSocialAgentDirectReplyMessages({
      message: '可以，帮我找人',
      route: route('social_search'),
      profile: null,
      task: makeTask(),
      longTermSnapshot: null,
      memoryContext: null,
      contextTurnLimit: 8,
      conversationHistory: [
        { role: 'user', content: '今天晚上，青岛大学附近，散步' },
        { role: 'assistant', content: '我已经记住时间、地点和活动。' },
      ],
    });

    const payload = userPayload(messages);
    expect(payload.conversationHistory).toEqual([
      { role: 'user', text: '今天晚上，青岛大学附近，散步' },
      { role: 'assistant', text: '我已经记住时间、地点和活动。' },
    ]);
    expect(payload.conversationHistory).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ text: 'turn-85' })]),
    );
  });

  it('tells direct DeepSeek replies to treat known slots as hard context', () => {
    const messages = buildSocialAgentDirectReplyMessages({
      message: '为什么，你到底懂没懂？',
      route: route('correction_or_clarification'),
      profile: null,
      task: makeTask(),
      longTermSnapshot: null,
      memoryContext: {
        taskSlots: {
          time_window: { value: '今天晚上', state: 'completed' },
        },
      } as never,
      contextTurnLimit: 8,
    });

    expect(messages[0].content).toContain(
      'taskMemory.taskSlots、memoryContext 和 conversationHistory 是当前上下文',
    );
    expect(messages[0].content).toContain('不能重复追问');
    expect(messages[0].content).toContain('taskMemory.candidateActions');
    expect(messages[0].content).toContain('taskMemory.pendingApprovals');
    expect(messages[0].content).toContain('公开可发现资料');
    const payload = userPayload(messages);
    expect(payload.taskMemory).toMatchObject({
      taskSlots: expect.objectContaining({
        activity: expect.objectContaining({ value: '散步' }),
        time_window: expect.objectContaining({ value: '今天晚上' }),
        location_text: expect.objectContaining({ value: '青岛大学附近' }),
        candidate_preference: expect.objectContaining({
          value: '女生、舞蹈相关公开标签优先',
        }),
      }),
      knownTaskSlotConstraints: expect.objectContaining({
        treatAsHardConstraints: true,
        doNotAskAgainFor: expect.arrayContaining([
          'activity',
          'time_window',
          'location_text',
          'candidate_preference',
        ]),
        candidatePreferencePolicy: expect.stringContaining('公开可发现资料'),
      }),
    });
    expect(payload.memoryContext).toMatchObject({
      taskSlots: expect.objectContaining({
        time_window: expect.objectContaining({ value: '今天晚上' }),
      }),
    });
  });

  it('exposes canonical candidate actions and pending approvals to DeepSeek prompts', () => {
    const task = makeTask();
    const memory = task.memory as Record<string, unknown>;
    memory.taskMemory = {
      ...(memory.taskMemory as Record<string, unknown>),
      candidateActions: {
        '42': {
          status: 'saved',
          targetUserId: 42,
          reason: '用户想先保留这位候选人',
        },
      },
      pendingApprovals: [
        {
          id: 88,
          type: 'approval_required',
          actionType: 'send_invite',
          summary: '给候选人发送今晚青岛大学散步邀请',
          riskLevel: 'medium',
          at: new Date(0).toISOString(),
        },
      ],
    };

    const messages = buildSocialAgentDirectReplyMessages({
      message: '继续刚才那个候选人，别重复推荐我跳过的人。',
      route: route('social_search'),
      profile: null,
      task,
      longTermSnapshot: null,
      memoryContext: null,
      contextTurnLimit: 8,
    });

    const payload = userPayload(messages);
    expect(payload.taskMemory).toMatchObject({
      candidateActions: {
        '42': {
          status: 'saved',
          targetUserId: 42,
          reason: '用户想先保留这位候选人',
        },
      },
      pendingApprovals: [
        expect.objectContaining({
          id: 88,
          actionType: 'send_invite',
          summary: '给候选人发送今晚青岛大学散步邀请',
        }),
      ],
      pendingActions: [
        expect.objectContaining({
          id: 88,
          actionType: 'send_invite',
        }),
      ],
    });
  });

  it('prefers explicit hydrated task context for direct DeepSeek reply prompts', () => {
    const taskContext = {
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
        doNotAskAgainFor: [
          'time_window',
          'location_text',
          'activity',
          'candidate_preference',
        ],
      },
      pendingApprovals: [{ approvalId: 'approval-publish-1' }],
      candidateActions: { saved: ['candidate-22'] },
    };
    const messages = buildSocialAgentDirectReplyMessages({
      message: '可以，继续刚才的方向',
      route: route('candidate_followup'),
      profile: null,
      task: makeTask(),
      longTermSnapshot: null,
      memoryContext: null,
      taskContext,
      contextTurnLimit: 8,
    });

    const payload = userPayload(messages);
    expect(payload.taskMemory).toEqual(taskContext);
    expect(payload.taskContext).toEqual(taskContext);
    expect(payload.taskMemory).toMatchObject({
      taskSlots: {
        candidate_preference: {
          value: '公开资料有舞蹈相关标签的人优先',
          state: 'completed',
        },
      },
      pendingApprovals: [{ approvalId: 'approval-publish-1' }],
      candidateActions: { saved: ['candidate-22'] },
    });
  });

  it('uses compact context for Agent Brain replies', () => {
    const messages = buildSocialAgentAgentBrainMessages({
      message: '保存我的画像，后面继续找青岛大学附近的人。',
      task: makeTask(),
      intent: 'profile_enrichment',
      mode: 'profile_updated',
      extractedProfile: { city: '青岛' },
      sourceMessage: '我在青岛大学，喜欢低强度散步。',
      toolOutput: { success: true },
      memoryContext: null,
      contextTurnLimit: 10,
    });

    const payload = userPayload(messages);
    expect(payload.conversationHistory).toHaveLength(10);
    expect(payload.conversationHistory).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: 'turn-76' })]),
    );
  });

  it('passes hydrated memory context into Agent Brain replies as hard slot context', () => {
    const messages = buildSocialAgentAgentBrainMessages({
      message: '不是泛泛找人，是今晚青岛大学附近找公开资料有舞蹈标签的人散步。',
      task: makeTask(),
      intent: 'correction_or_clarification',
      mode: 'profile_correction',
      extractedProfile: { city: '青岛' },
      sourceMessage: '今晚青岛大学附近散步，公开资料有舞蹈标签的人优先。',
      toolOutput: { success: true },
      memoryContext: {
        taskSlots: {
          time_window: { value: '今天晚上', state: 'completed' },
          activity: { value: '散步', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
          candidate_preference: {
            value: '公开资料带舞蹈相关标签的人优先',
            state: 'answered',
          },
        },
        knownTaskSlotConstraints: {
          treatAsHardConstraints: true,
          knownSlots: [
            { key: 'time_window', label: '时间', value: '今天晚上' },
            { key: 'activity', label: '活动', value: '散步' },
            { key: 'location_text', label: '地点', value: '青岛大学附近' },
            {
              key: 'candidate_preference',
              label: '候选偏好',
              value: '公开资料带舞蹈相关标签的人优先',
            },
          ],
          doNotAskAgainFor: ['time_window', 'activity', 'location_text'],
        },
      } as never,
      contextTurnLimit: 10,
    });

    expect(messages[0].content).toContain(
      '已 answered/confirmed/completed 的字段是硬约束',
    );
    expect(messages[0].content).toContain('不能重复追问');
    expect(messages[0].content).toContain('taskMemory.candidateActions');
    expect(messages[0].content).toContain('taskMemory.pendingApprovals');
    expect(messages[0].content).toContain('公开可发现资料');
    const payload = userPayload(messages);
    expect(payload.memoryContext).toMatchObject({
      taskSlots: {
        time_window: { value: '今天晚上', state: 'completed' },
        activity: { value: '散步', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        candidate_preference: {
          value: '公开资料带舞蹈相关标签的人优先',
          state: 'answered',
        },
      },
      knownTaskSlotConstraints: expect.objectContaining({
        treatAsHardConstraints: true,
        doNotAskAgainFor: ['time_window', 'activity', 'location_text'],
      }),
    });
  });

  it('prefers memory recent turns over stale task history for Agent Brain prompts', () => {
    const messages = buildSocialAgentAgentBrainMessages({
      message: '你到底记不记得我刚才说的？',
      task: makeTask(),
      intent: 'correction_or_clarification',
      mode: 'profile_correction',
      extractedProfile: { city: '青岛' },
      sourceMessage: '今晚青岛大学附近散步，公开资料有舞蹈标签的人优先。',
      toolOutput: { success: true },
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
      contextTurnLimit: 8,
    });

    const payload = userPayload(messages);
    expect(payload.conversationHistory).toEqual([
      {
        role: 'user',
        text: '今天晚上青岛大学附近散步，优先舞蹈相关公开标签',
      },
      {
        role: 'assistant',
        text: '我已经记住时间、地点、活动和候选偏好。',
      },
    ]);
    expect(payload.conversationHistory).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ text: 'turn-85' })]),
    );
  });

  it('prefers explicit hydrated task context for Agent Brain prompts', () => {
    const taskContext = {
      taskSlots: {
        time_window: { value: '今天晚上', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        activity: { value: '散步', state: 'completed' },
      },
      knownTaskSlotConstraints: {
        doNotAskAgainFor: ['time_window', 'location_text', 'activity'],
      },
      candidateActions: { skipped: ['candidate-8'] },
    };
    const messages = buildSocialAgentAgentBrainMessages({
      message: '保存后继续找人',
      task: makeTask(),
      intent: 'profile_enrichment',
      mode: 'profile_updated',
      extractedProfile: { city: '青岛' },
      sourceMessage: '今晚青岛大学附近散步',
      toolOutput: { success: true },
      memoryContext: null,
      taskContext,
      contextTurnLimit: 8,
    });

    const payload = userPayload(messages);
    expect(payload.taskMemory).toEqual(taskContext);
    expect(payload.taskContext).toEqual(taskContext);
    expect(payload.taskMemory).toMatchObject({
      taskSlots: {
        time_window: { value: '今天晚上', state: 'completed' },
      },
      candidateActions: { skipped: ['candidate-8'] },
    });
  });
});
