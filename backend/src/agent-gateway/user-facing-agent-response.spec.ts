import { AgentTaskPermissionMode } from './entities/agent-task.entity';
import { toUserFacingAgentResponse } from './user-facing-agent-response';

describe('toUserFacingAgentResponse', () => {
  it('returns only the user-facing contract and strips debug fields from cards', () => {
    const response = toUserFacingAgentResponse(
      {
        intent: 'social_search',
        confidence: 0.9,
        entities: {
          city: '青岛',
          activityType: 'running',
          targetGender: '',
          timePreference: '今晚',
          locationPreference: '青岛大学附近',
        },
        shouldSearch: true,
        shouldReplan: false,
        shouldUpdateProfile: false,
        shouldExecuteAction: false,
        replyStrategy: 'search_candidates',
        source: 'rules',
        action: 'queue_search',
        taskId: 101,
        assistantMessage: '我会先结合你的 Life Graph，再筛选合适的人。',
        savedContext: true,
        profileUpdated: false,
        shouldQueueRun: true,
        runMode: 'initial',
        queuedRun: null,
        pendingApproval: null,
        activityResults: [],
        profileUpdateProposal: null,
        cards: [
          {
            id: 'candidate-1',
            type: 'candidate_card',
            title: '小林',
            body: '你们的时间和活动区域比较一致。',
            data: {
              recommendationLine: '适合从一次轻松慢跑开始。',
              traceId: 'trace-1',
              structuredIntent: { planner: 'hidden' },
              nested: { toolCalls: [{ name: 'search' }] },
            },
            actions: [],
          },
        ],
        safety: {
          blocked: false,
          level: 'low',
          reasons: ['internal keyword match'],
          boundaryNotes: ['第一次见面建议选择公共场所'],
          requiredConfirmations: ['发送消息'],
        },
        permissionMode: AgentTaskPermissionMode.Confirm,
        traceId: 'trace-1',
        agentTrace: {
          traceId: 'trace-1',
          sdkEnabled: true,
          model: 'hidden-model',
          agentPath: ['FitMeet Main Agent'],
          handoffs: [],
          guardrails: [],
        },
        structuredIntent: { planner: 'hidden' },
      },
      AgentTaskPermissionMode.Confirm,
    );

    expect(Object.keys(response).sort()).toEqual([
      'assistantMessage',
      'cards',
      'lightStatus',
      'pendingConfirmations',
      'permissionMode',
      'safeStatus',
    ]);
    expect(response).toMatchObject({
      assistantMessage: '我会先结合你的 Life Graph，再筛选合适的人。',
      lightStatus: '正在筛选合适的人',
      pendingConfirmations: [],
      permissionMode: AgentTaskPermissionMode.Confirm,
      safeStatus: {
        blocked: false,
        level: 'low',
        boundaryNotes: ['第一次见面建议选择公共场所'],
        requiredConfirmations: ['发送消息'],
      },
    });

    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain('traceId');
    expect(serialized).not.toContain('agentTrace');
    expect(serialized).not.toContain('structuredIntent');
    expect(serialized).not.toContain('planner');
    expect(serialized).not.toContain('toolCalls');
    expect(serialized).not.toContain('hidden-model');
    expect(serialized).not.toContain('internal keyword match');
  });

  it('maps pending approvals to natural pending confirmations', () => {
    const response = toUserFacingAgentResponse(
      {
        intent: 'action_request',
        confidence: 1,
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
        replyStrategy: 'execute_action',
        source: 'rules',
        action: 'await_confirmation',
        taskId: 101,
        assistantMessage: '这条消息会发送给小林。你确认后我再发。',
        savedContext: true,
        profileUpdated: false,
        shouldQueueRun: false,
        runMode: null,
        queuedRun: null,
        pendingApproval: {
          id: 9,
          type: 'send_message',
          actionType: 'send_message',
          summary: '发送开场白给小林',
          riskLevel: 'medium',
          payload: { message: 'hello', traceId: 'trace-2' },
          expiresAt: null,
        },
        activityResults: [],
        profileUpdateProposal: null,
        permissionMode: AgentTaskPermissionMode.Confirm,
      },
      AgentTaskPermissionMode.Confirm,
    );

    expect(response.lightStatus).toBe('正在等待你确认');
    expect(response.pendingConfirmations).toEqual([
      {
        id: 9,
        type: 'send_message',
        actionType: 'send_message',
        summary: '发送开场白给小林',
        riskLevel: 'medium',
        expiresAt: null,
      },
    ]);
    expect(JSON.stringify(response)).not.toContain('payload');
    expect(JSON.stringify(response)).not.toContain('trace-2');
  });

  it('normalizes legacy card actions into the user-facing agent action schema', () => {
    const response = toUserFacingAgentResponse(
      {
        intent: 'social_search',
        confidence: 1,
        entities: {
          city: 'Qingdao',
          activityType: 'running',
          targetGender: '',
          timePreference: 'tonight',
          locationPreference: 'Qingdao University',
        },
        shouldSearch: true,
        shouldReplan: false,
        shouldUpdateProfile: false,
        shouldExecuteAction: false,
        replyStrategy: 'search_candidates',
        source: 'rules',
        action: 'reply',
        taskId: 101,
        assistantMessage: 'I found one candidate.',
        savedContext: true,
        profileUpdated: false,
        shouldQueueRun: false,
        runMode: null,
        queuedRun: null,
        pendingApproval: null,
        activityResults: [],
        profileUpdateProposal: null,
        permissionMode: AgentTaskPermissionMode.Confirm,
        cards: [
          {
            id: 'candidate-1',
            type: 'candidate_card',
            title: 'Xiao Lin',
            body: 'Good fit.',
            status: 'ready',
            data: { taskId: 101 },
            actions: [
              {
                id: 'generate-opener',
                label: '生成开场白',
                action: 'generate_opener',
                requiresConfirmation: false,
              },
              {
                id: 'create-activity',
                label: '创建约练',
                action: 'create_activity',
                requiresConfirmation: true,
              },
            ],
          },
        ],
      },
      AgentTaskPermissionMode.Confirm,
    );

    expect(response.cards[0].data.loopStage).toBe('candidate_recommendation');
    expect(response.cards[0].actions).toEqual([
      expect.objectContaining({
        action: 'generate_opener',
        schemaAction: 'candidate.generate_opener',
        loopStage: 'candidate_selected',
      }),
      expect.objectContaining({
        action: 'create_activity',
        schemaAction: 'activity.confirm_create',
        loopStage: 'activity_draft_created',
      }),
    ]);
  });
});
