import { AgentTaskPermissionMode } from './entities/agent-task.entity';
import {
  ApprovalRiskLevel,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import {
  LifeGraphFieldCategory,
  LifeGraphFieldSource,
  LifeGraphProposalStatus,
} from '../life-graph/life-graph.enums';
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
          type: ApprovalType.SendMessage,
          actionType: 'send_message',
          summary: '发送开场白给小林',
          riskLevel: ApprovalRiskLevel.Medium,
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
        type: ApprovalType.SendMessage,
        actionType: 'send_message',
        summary: '发送开场白给小林',
        riskLevel: ApprovalRiskLevel.Medium,
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
              {
                id: 'view-activity',
                label: '查看详情',
                action: 'view_activity',
                requiresConfirmation: false,
              },
              {
                id: 'upload-proof',
                label: '上传证明',
                action: 'upload_proof',
                requiresConfirmation: false,
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
      expect.objectContaining({
        action: 'view_activity',
        schemaAction: 'activity.view_detail',
        loopStage: 'activity_completed',
      }),
      expect.objectContaining({
        action: 'upload_proof',
        schemaAction: 'activity.upload_proof',
        loopStage: 'activity_completed',
      }),
    ]);
  });

  it('turns Life Graph proposals into confirmable user-facing cards', () => {
    const response = toUserFacingAgentResponse(
      {
        intent: 'profile_enrichment',
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
        replyStrategy: 'direct_reply',
        source: 'rules',
        action: 'answer',
        taskId: 101,
        assistantMessage: '我识别到以下画像信息，是否保存到你的 Life Graph？',
        savedContext: true,
        profileUpdated: false,
        shouldQueueRun: false,
        runMode: null,
        queuedRun: null,
        pendingApproval: null,
        activityResults: [],
        cards: [],
        profileUpdateProposal: {
          proposalId: 77,
          userId: 7,
          taskId: 101,
          messageId: null,
          status: LifeGraphProposalStatus.Proposed,
          aiSummary: '识别到周末下午和跑步偏好。',
          confirmationRequired: true,
          createdAt: new Date(0).toISOString(),
          confirmedAt: null,
          rejectedAt: null,
          missingFields: [],
          proposedFields: [
            {
              proposalFieldId: 'lifestyle:availableTimes:1',
              category: LifeGraphFieldCategory.Lifestyle,
              fieldKey: 'availableTimes',
              fieldValue: ['周末下午'],
              source: LifeGraphFieldSource.AiInferred,
              confidence: 0.9,
              reason: '用户提到周末下午一般有空',
              requiresUserConfirmation: true,
              status: 'proposed',
              conflict: false,
              oldValue: null,
            },
          ],
        },
        permissionMode: AgentTaskPermissionMode.Confirm,
      },
      AgentTaskPermissionMode.Confirm,
    );

    expect(response.cards).toEqual([
      expect.objectContaining({
        id: 'life_graph_proposal:77',
        type: 'profile_proposal',
        status: 'waiting_confirmation',
        data: expect.objectContaining({
          taskId: 101,
          proposalId: 77,
          proposedFields: ['lifestyle.availableTimes: 周末下午'],
        }),
        actions: [
          expect.objectContaining({
            schemaAction: 'life_graph.accept_update',
            payload: { taskId: 101, proposalId: 77 },
          }),
          expect.objectContaining({
            schemaAction: 'life_graph.reject_update',
            payload: { taskId: 101, proposalId: 77 },
          }),
        ],
      }),
    ]);
  });
});
