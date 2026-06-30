import {
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
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
import type { UserFacingAgentResponse } from './user-facing-agent-response';
import { validateUserFacingAgentResponse } from './user-facing-agent-response-validator';

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
        assistantMessage: '我会先结合你的长期偏好，再筛选合适的人。',
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
      'taskId',
      'workflow',
    ]);
    expect(response).toMatchObject({
      taskId: 101,
      assistantMessage: '我会先结合你的长期偏好，再筛选合适的人。',
      lightStatus: '正在筛选公开可发现的人',
      pendingConfirmations: [],
      permissionMode: AgentTaskPermissionMode.Confirm,
      safeStatus: {
        blocked: false,
        level: 'low',
        boundaryNotes: ['第一次见面建议选择公共场所'],
        requiredConfirmations: ['发送消息'],
      },
      workflow: {
        workflowId: 'agent-task:101',
        state: 'IDLE',
        requiredAction: null,
        retryable: false,
        recoveryMessage: null,
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

  it('strips checkpoint resume metadata from ordinary user-facing responses', () => {
    const response = toUserFacingAgentResponse(
      {
        taskId: 101,
        status: AgentTaskStatus.Executing,
        visibleSteps: [],
        assistantMessage: '已保存到候选排序步骤，可以重新运行这一段。',
        socialRequestDraft: null,
        candidates: [],
        approvalRequiredActions: [],
        events: [],
        cards: [],
        permissionMode: AgentTaskPermissionMode.Confirm,
        runtime: {
          checkpointId: 321,
          checkpointType: 'step',
          canResume: false,
          canReplay: true,
          canFork: true,
          parentCheckpointId: 320,
          threadId: 'agent-task:101',
          idempotencyKey:
            'agent-checkpoint:replay:agent-task:101:checkpoint:321:step:rank',
          checkpointAction: 'replay',
          resumeCursor: {
            threadId: 'agent-task:101',
            checkpointId: 321,
            parentCheckpointId: 320,
            action: 'replay',
            stepId: 'rank',
          },
          sourceStep: {
            stepId: 'rank',
            label: '正在排序候选人',
            toolName: 'social_match',
          },
          stepScope: {
            mode: 'through_step',
            stepCount: 3,
            sourceCheckpointId: 320,
          },
          sideEffectPolicy: {
            idempotencyKey:
              'agent-checkpoint:replay:agent-task:101:checkpoint:321:step:rank',
            sideEffectsBeforeResume: 'idempotent_only',
            duplicatePolicy: 'reuse_idempotency_key',
          },
          traceId: 'hidden-runtime-trace',
          planner: 'hidden-runtime-planner',
        } as never,
      },
      AgentTaskPermissionMode.Confirm,
    );

    expect(response).toMatchObject({
      taskId: 101,
      workflow: {
        workflowId: 'agent-task:101',
        state: 'IDLE',
        requiredAction: null,
        retryable: false,
        recoveryMessage: null,
      },
    });
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain('checkpointId');
    expect(serialized).not.toContain('idempotencyKey');
    expect(serialized).not.toContain('resumeCursor');
    expect(serialized).not.toContain('sourceStep');
    expect(serialized).not.toContain('sideEffectPolicy');
    expect(serialized).not.toContain('hidden-runtime-trace');
    expect(serialized).not.toContain('hidden-runtime-planner');
    expect(serialized).not.toContain('social_match');
    expect(serialized).not.toContain('checkpoint:321');
    expect(serialized).not.toContain('hidden-runtime-trace');
    expect(serialized).not.toContain('hidden-runtime-planner');
    expect(serialized).not.toContain('social_match');
  });

  it('keeps assistant source only when the model or fallback source is explicit', () => {
    const llmResponse = toUserFacingAgentResponse(
      {
        intent: 'casual_chat',
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
        replyStrategy: 'conversational_answer',
        source: 'rules',
        action: 'answer',
        savedContext: false,
        profileUpdated: false,
        shouldQueueRun: false,
        runMode: null,
        taskId: 102,
        assistantMessage: '这是模型生成的回复。',
        assistantMessageSource: 'llm',
        cards: [],
        permissionMode: AgentTaskPermissionMode.Confirm,
      },
      AgentTaskPermissionMode.Confirm,
    );

    expect(llmResponse.assistantMessageSource).toBe('llm');

    const unknownSourceResponse = toUserFacingAgentResponse(
      {
        intent: 'casual_chat',
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
        replyStrategy: 'conversational_answer',
        source: 'rules',
        action: 'answer',
        savedContext: false,
        profileUpdated: false,
        shouldQueueRun: false,
        runMode: null,
        taskId: 103,
        assistantMessage: '这是旧数据恢复的回复。',
        cards: [],
        permissionMode: AgentTaskPermissionMode.Confirm,
      },
      AgentTaskPermissionMode.Confirm,
    );

    expect(
      Object.prototype.hasOwnProperty.call(
        unknownSourceResponse,
        'assistantMessageSource',
      ),
    ).toBe(false);
  });

  it('turns suppressed fallback recovery copy into a structured recovery notice', () => {
    const response = toUserFacingAgentResponse(
      {
        intent: 'casual_chat',
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
        replyStrategy: 'conversational_answer',
        source: 'rules',
        action: 'answer',
        savedContext: false,
        profileUpdated: false,
        shouldQueueRun: false,
        runMode: null,
        taskId: 104,
        assistantMessage: '这次处理时间有点久。这段需求还在，可以稍后继续。',
        assistantMessageSource: 'fallback',
        cards: [],
        permissionMode: AgentTaskPermissionMode.Confirm,
      },
      AgentTaskPermissionMode.Confirm,
    );

    expect(response.assistantMessage).toBe('');
    expect(response.assistantMessageSource).toBe('fallback');
    expect(response.recoveryNotice).toMatchObject({
      kind: 'timeout',
      title: '这段需求还在',
      message:
        '刚才处理比平时久一点，可以继续处理；不会重复执行已确认的高风险动作。',
      retryable: true,
      source: 'stream_error',
    });
    expect(JSON.stringify(response)).not.toContain('稍后再试');
  });

  it('collapses duplicated assistant text before exposing the final response', () => {
    const duplicated =
      '谢谢你的认可！我现在会先确认时间和活动类型，然后帮你推荐合适的人。';
    const response = toUserFacingAgentResponse(
      {
        intent: 'social_search',
        confidence: 1,
        entities: {
          city: '青岛',
          activityType: 'walking',
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
        savedContext: true,
        profileUpdated: false,
        shouldQueueRun: false,
        runMode: null,
        taskId: 104,
        assistantMessage: `${duplicated}\n\n${duplicated}`,
        assistantMessageSource: 'llm',
        cards: [],
        permissionMode: AgentTaskPermissionMode.Confirm,
      },
      AgentTaskPermissionMode.Confirm,
    );

    expect(response.assistantMessage).toBe(duplicated);
    expect(response.assistantMessage.match(/谢谢你的认可/g) ?? []).toHaveLength(
      1,
    );
  });

  it('does not create a failed recovery notice when a suppressed fallback carries pending approval', () => {
    const response = toUserFacingAgentResponse(
      {
        intent: 'social_search',
        confidence: 1,
        entities: {
          city: '青岛',
          activityType: 'walking',
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
        savedContext: true,
        profileUpdated: false,
        shouldQueueRun: false,
        runMode: null,
        taskId: 105,
        assistantMessage: '我可以继续上次的话题，也可以重新开始。',
        assistantMessageSource: 'fallback',
        cards: [],
        pendingApproval: {
          id: 55,
          type: ApprovalType.PostPublish,
          actionType: 'publish_social_request',
          summary: '发布约练卡到发现',
          riskLevel: ApprovalRiskLevel.Medium,
          payload: {},
          expiresAt: null,
        },
        permissionMode: AgentTaskPermissionMode.Confirm,
      },
      AgentTaskPermissionMode.Confirm,
    );

    expect(response.assistantMessage).toBe('');
    expect(response.pendingConfirmations).toHaveLength(1);
    expect(response.publicLoop).toEqual({
      stage: 'publish_confirmation_required',
      publicIntentId: null,
      discoverHref: null,
      publicIntentHref: null,
      messagesHref: null,
      requiredConfirmation: true,
    });
    expect(response.recoveryNotice).toBeUndefined();
  });

  it('keeps useful cards while suppressing generic fallback assistant copy', () => {
    const response = toUserFacingAgentResponse(
      {
        intent: 'social_search',
        confidence: 1,
        entities: {
          city: '青岛',
          activityType: 'walking',
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
        savedContext: true,
        profileUpdated: false,
        shouldQueueRun: false,
        runMode: null,
        taskId: 106,
        assistantMessage:
          'FitMeet Agent 暂时没有顺利完成。我已经保留当前对话，请稍后再试。',
        assistantMessageSource: 'fallback',
        cards: [
          {
            id: 'candidate-501',
            type: 'candidate_card',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'social_match.candidate',
            title: '陈砚',
            body: '公开资料显示她也喜欢轻松散步。',
            data: {
              schemaType: 'social_match.candidate',
              candidateRecordId: 501,
              targetUserId: 22,
            },
            actions: [],
          },
        ],
        permissionMode: AgentTaskPermissionMode.Confirm,
      },
      AgentTaskPermissionMode.Confirm,
    );

    expect(response.assistantMessage).toBe('');
    expect(response.assistantMessageSource).toBe('fallback');
    expect(response.cards).toHaveLength(1);
    expect(response.cards[0]).toMatchObject({
      id: 'candidate-501',
      schemaType: 'social_match.candidate',
    });
    expect(response.recoveryNotice).toBeUndefined();
    expect(JSON.stringify(response)).not.toContain('稍后再试');
    expect(JSON.stringify(response)).not.toContain('暂时没有顺利完成');
  });

  it('keeps generic assistant-ui cards while stripping internal debug fields', () => {
    const response = toUserFacingAgentResponse(
      {
        intent: 'casual_chat',
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
        action: 'reply',
        taskId: 101,
        assistantMessage: '我已经整理好了。',
        savedContext: true,
        profileUpdated: false,
        shouldQueueRun: false,
        runMode: null,
        queuedRun: null,
        pendingApproval: null,
        activityResults: [],
        profileUpdateProposal: null,
        cards: [
          {
            id: 'generic-summary:101',
            type: 'safety_boundary',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'generic.card',
            title: '整理结果',
            body: '这是一个普通对话结果，不应伪装成社交推荐。',
            status: 'completed',
            data: {
              schemaName: 'GenericResultCard',
              schemaVersion: 'fitmeet.tool-ui.v1',
              schemaType: 'generic.card',
              details: ['只用于消息内展示', '不触发社交工具'],
              traceId: 'trace-generic',
              planner: 'hidden planner',
              plannerSource: 'deepseek planner',
              knownTaskSlotConstraints: {
                instruction: 'planner/router must keep this internal',
              },
              rawJson: { debug: true },
            },
            actions: [
              {
                id: 'safe_action',
                label: '继续',
                action: 'see_more',
                requiresConfirmation: false,
                payload: {
                  taskId: 101,
                  toolCallId: 'hidden-call',
                  safeCopy: '可以继续查看',
                },
              },
            ],
          },
        ],
        safety: {
          blocked: false,
          level: 'low',
          reasons: [],
          boundaryNotes: [],
          requiredConfirmations: [],
        },
        permissionMode: AgentTaskPermissionMode.Confirm,
      },
      AgentTaskPermissionMode.Confirm,
    );

    expect(response.cards[0]).toMatchObject({
      id: 'generic-summary:101',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'generic.card',
      data: {
        schemaName: 'GenericResultCard',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'generic.card',
      },
    });
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain('trace-generic');
    expect(serialized).not.toContain('planner');
    expect(serialized).not.toContain('toolCallId');
    expect(serialized).not.toContain('hidden-call');
    expect(serialized).not.toContain('knownTaskSlotConstraints');
    expect(serialized).not.toContain('rawJson');
    expect(serialized).toContain('可以继续查看');
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
    expect(response.publicLoop).toEqual({
      stage: 'contact_confirmation_required',
      publicIntentId: null,
      discoverHref: null,
      publicIntentHref: null,
      messagesHref: null,
      requiredConfirmation: true,
    });
    expect(JSON.stringify(response)).not.toContain('payload');
    expect(JSON.stringify(response)).not.toContain('trace-2');
  });

  it('keeps safe approval identity payload for inline card placement and dedupe', () => {
    const response = toUserFacingAgentResponse(
      {
        taskId: 101,
        status: AgentTaskStatus.Executing,
        visibleSteps: [],
        assistantMessage: '发送邀请前需要你确认。',
        socialRequestDraft: null,
        candidates: [],
        approvalRequiredActions: [
          {
            id: null,
            actionType: 'send_invite',
            summary: '发送邀请给陈砚前需要你确认。',
            riskLevel: 'medium',
            payload: {
              taskId: 101,
              candidateRecordId: 501,
              targetUserId: 22,
              opportunityId: 'qdu-walk-tonight',
              message: '这条私信不应直接进入前端去重 payload',
              traceId: 'trace-hidden',
              rawJson: { planner: 'hidden' },
            },
          },
        ],
        events: [],
        cards: [],
        permissionMode: AgentTaskPermissionMode.Confirm,
      },
      AgentTaskPermissionMode.Confirm,
    );

    expect(response.pendingConfirmations).toEqual([
      {
        id: null,
        type: 'send_invite',
        actionType: 'send_invite',
        summary: '发送邀请给陈砚前需要你确认。',
        riskLevel: 'medium',
        payload: {
          taskId: 101,
          candidateRecordId: 501,
          targetUserId: 22,
          opportunityId: 'qdu-walk-tonight',
        },
        expiresAt: null,
      },
    ]);
    expect(JSON.stringify(response.pendingConfirmations)).not.toContain(
      'trace-hidden',
    );
    expect(JSON.stringify(response.pendingConfirmations)).not.toContain(
      'rawJson',
    );
    expect(JSON.stringify(response.pendingConfirmations)).not.toContain(
      '这条私信',
    );
  });

  it('filters low-risk card actions out of user-facing pending confirmations', () => {
    const response = toUserFacingAgentResponse(
      {
        taskId: 101,
        status: AgentTaskStatus.Executing,
        visibleSteps: [],
        assistantMessage: '我整理好了候选卡，低风险动作会直接留在卡片上。',
        socialRequestDraft: null,
        candidates: [],
        approvalRequiredActions: [
          {
            id: 1,
            actionType: 'candidate.like',
            summary: '收藏候选陈砚，后续推荐会参考。',
            riskLevel: 'medium',
          },
          {
            id: 2,
            actionType: 'save_candidate',
            summary: '保存候选陈砚，后续推荐会参考。',
            riskLevel: 'medium',
          },
          {
            id: 3,
            actionType: 'candidate.generate_opener',
            summary: '生成开场白草稿。',
            riskLevel: 'medium',
          },
          {
            id: 4,
            actionType: 'generate_opener',
            summary: '生成开场白，不会发送给对方。',
            riskLevel: 'medium',
          },
          {
            id: 5,
            actionType: 'opener.confirm_send',
            summary: '发送邀请给陈砚前需要你确认。',
            riskLevel: 'medium',
          },
          {
            id: 6,
            actionType: 'candidate.connect',
            summary: '加好友并聊天前需要你确认。',
            riskLevel: 'medium',
          },
          {
            id: 7,
            actionType: 'publish_social_request',
            summary: '发布约练卡到发现前需要你确认。',
            riskLevel: 'medium',
          },
        ],
        events: [],
        cards: [],
        permissionMode: AgentTaskPermissionMode.Confirm,
      },
      AgentTaskPermissionMode.Confirm,
    );

    expect(
      response.pendingConfirmations.map((item) => item.actionType),
    ).toEqual([
      'opener.confirm_send',
      'candidate.connect',
      'publish_social_request',
    ]);
    expect(JSON.stringify(response.pendingConfirmations)).not.toContain(
      '收藏候选',
    );
    expect(JSON.stringify(response.pendingConfirmations)).not.toContain(
      '生成开场白草稿',
    );
  });

  it('filters a low-risk single pendingApproval out of user-facing confirmations', () => {
    const response = toUserFacingAgentResponse(
      {
        intent: 'action_request',
        confidence: 1,
        entities: {
          city: '青岛',
          activityType: 'walking',
          targetGender: '',
          timePreference: '今晚',
          locationPreference: '青岛大学附近',
        },
        shouldSearch: false,
        shouldReplan: false,
        shouldUpdateProfile: false,
        shouldExecuteAction: true,
        replyStrategy: 'execute_action',
        source: 'rules',
        action: 'reply',
        taskId: 101,
        assistantMessage: '已收藏这个候选，后续推荐会参考你的选择。',
        savedContext: true,
        profileUpdated: false,
        shouldQueueRun: false,
        runMode: null,
        queuedRun: null,
        pendingApproval: {
          id: 77,
          type: ApprovalType.Custom,
          actionType: 'candidate.like',
          summary: '收藏候选陈砚，后续推荐会参考。',
          riskLevel: ApprovalRiskLevel.Medium,
          payload: {
            candidateRecordId: 501,
            traceId: 'trace-should-not-leak',
          },
          expiresAt: null,
        },
        activityResults: [],
        profileUpdateProposal: null,
        cards: [],
        permissionMode: AgentTaskPermissionMode.Confirm,
      },
      AgentTaskPermissionMode.Confirm,
    );

    expect(response.pendingConfirmations).toEqual([]);
    expect(response.lightStatus).not.toBe('正在等待你确认');
    expect(JSON.stringify(response)).not.toContain('trace-should-not-leak');
    expect(JSON.stringify(response)).not.toContain('收藏候选陈砚');
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
        assistantMessage: '我识别到以下画像信息，是否保存到你的个人信息？',
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
          confirmationBoundary: '确认前不会写入长期偏好。',
          privacyBoundary: '仅保存脱敏偏好，不保存私聊原文或精确敏感信息。',
          revokeHint: '确认后仍可在个人信息里查看、纠正或撤回。',
          diff: expect.objectContaining({
            description: '只在你确认后写入长期偏好。',
            confirmationBoundary: '确认前不会写入长期偏好。',
            privacyBoundary: '仅保存脱敏偏好，不保存私聊原文或精确敏感信息。',
            sourceSignals: ['用户提到周末下午一般有空'],
          }),
        }),
        actions: [
          expect.objectContaining({
            schemaAction: 'life_graph.accept_update',
            payload: expect.objectContaining({
              taskId: 101,
              proposalId: 77,
              approvalRequired: true,
              checkpointRequired: true,
              resumeMode: 'resume_after_approval',
              riskLevel: 'low',
              fieldIds: ['lifestyle:availableTimes:1'],
            }),
          }),
          expect.objectContaining({
            schemaAction: 'life_graph.reject_update',
            payload: expect.objectContaining({
              taskId: 101,
              proposalId: 77,
              checkpointRequired: true,
              resumeMode: 'resume_after_rejection',
              fieldIds: ['lifestyle:availableTimes:1'],
            }),
          }),
        ],
      }),
    ]);
  });

  it('passes counterpart reply Life Graph writeback proposal as sanitized user-facing data', () => {
    const response = toUserFacingAgentResponse(
      {
        intent: 'social_search',
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
        action: 'reply',
        taskId: 101,
        assistantMessage: '对方回复了，我整理了一条可确认的互动信号。',
        savedContext: true,
        profileUpdated: false,
        shouldQueueRun: false,
        runMode: null,
        queuedRun: null,
        pendingApproval: null,
        activityResults: [],
        cards: [],
        profileUpdateProposal: null,
        lifeGraphWritebackProposal: {
          schemaVersion: 'fitmeet.life_graph.writeback.v1',
          source: 'counterpart_reply',
          status: 'pending_user_confirmation',
          sensitivityLevel: 'medium',
          taskId: 101,
          candidateUserId: 22,
          conversationId: 'conversation-1',
          messageId: 'message-2',
          proposedSignals: [
            {
              field: 'meetLoop.counterpartIntent',
              label: '对方回复意图',
              value: 'ask_question',
              confidence: 0.84,
              traceId: 'hidden-signal-trace',
            },
            {
              field: 'meetLoop.replySummary',
              label: '脱敏互动摘要',
              value: '对方询问见面地点。',
              confidence: 0.76,
              rawMessage: 'Sure, where should we meet?',
            },
          ],
          confirmationBoundary: '这只是画像更新建议，确认前不会写入长期偏好。',
          privacyBoundary:
            '不保存对方私聊原文，只保存脱敏后的互动信号和下一步建议。',
          revokeHint: '确认后仍可在 Life Graph 中撤回这次影响。',
          traceId: 'hidden-trace',
          planner: 'hidden-plan',
          rawJson: { messageText: 'Sure, where should we meet?' },
        },
        permissionMode: AgentTaskPermissionMode.Confirm,
      },
      AgentTaskPermissionMode.Confirm,
    );

    expect(response.lifeGraphWritebackProposal).toMatchObject({
      schemaVersion: 'fitmeet.life_graph.writeback.v1',
      source: 'counterpart_reply',
      status: 'pending_user_confirmation',
      sensitivityLevel: 'medium',
      taskId: 101,
      candidateUserId: 22,
      conversationId: 'conversation-1',
      messageId: 'message-2',
      proposedSignals: [
        {
          field: 'meetLoop.counterpartIntent',
          label: '对方回复意图',
          value: 'ask_question',
          confidence: 0.84,
        },
        {
          field: 'meetLoop.replySummary',
          label: '脱敏互动摘要',
          value: '对方询问见面地点。',
          confidence: 0.76,
        },
      ],
      confirmationBoundary: '这只是画像更新建议，确认前不会写入长期偏好。',
      privacyBoundary:
        '不保存对方私聊原文，只保存脱敏后的互动信号和下一步建议。',
      revokeHint: '确认后仍可在 Life Graph 中撤回这次影响。',
    });

    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain('hidden-trace');
    expect(serialized).not.toContain('hidden-plan');
    expect(serialized).not.toContain('hidden-signal-trace');
    expect(serialized).not.toContain('rawJson');
    expect(serialized).not.toContain('Sure, where should we meet?');
  });

  it('marks conflicting Life Graph proposals as explicit user-overrides only on the accept action', () => {
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
        assistantMessage: '我发现这条画像和之前记录有冲突，需要你确认。',
        savedContext: true,
        profileUpdated: false,
        shouldQueueRun: false,
        runMode: null,
        queuedRun: null,
        pendingApproval: null,
        activityResults: [],
        cards: [],
        profileUpdateProposal: {
          proposalId: 88,
          userId: 7,
          taskId: 101,
          messageId: null,
          status: LifeGraphProposalStatus.Proposed,
          aiSummary: '周末下午偏好和旧记录冲突。',
          confirmationRequired: true,
          createdAt: new Date(0).toISOString(),
          confirmedAt: null,
          rejectedAt: null,
          missingFields: [],
          proposedFields: [
            {
              proposalFieldId: 'lifestyle:availableTimes:conflict',
              category: LifeGraphFieldCategory.Lifestyle,
              fieldKey: 'availableTimes',
              fieldValue: ['周末下午'],
              source: LifeGraphFieldSource.AiInferred,
              confidence: 0.86,
              reason: '用户这次明确说周末下午方便',
              requiresUserConfirmation: true,
              status: 'conflict',
              conflict: true,
              oldValue: ['工作日晚上'],
            },
          ],
        },
        permissionMode: AgentTaskPermissionMode.Confirm,
      },
      AgentTaskPermissionMode.Confirm,
    );

    const card = response.cards[0];
    expect(card.data).toMatchObject({
      conflicts: ['lifestyle.availableTimes: 工作日晚上 -> 周末下午'],
      sensitivityLevel: 'medium',
      confirmationBoundary:
        '确认保存表示你允许这次提案覆盖冲突的旧资料；拒绝则不会写入。',
      privacyBoundary: '仅保存脱敏偏好，不保存私聊原文或精确敏感信息。',
      diff: expect.objectContaining({
        current: 'lifestyle.availableTimes: 工作日晚上 -> 周末下午',
        conflicts: ['lifestyle.availableTimes: 工作日晚上 -> 周末下午'],
        sensitivityLevel: 'medium',
        confirmationBoundary:
          '确认保存表示你允许这次提案覆盖冲突的旧资料；拒绝则不会写入。',
        sourceSignals: ['用户这次明确说周末下午方便'],
      }),
    });
    expect(card.actions).toEqual([
      expect.objectContaining({
        schemaAction: 'life_graph.accept_update',
        payload: expect.objectContaining({
          proposalId: 88,
          fieldIds: ['lifestyle:availableTimes:conflict'],
          approvalRequired: true,
          checkpointRequired: true,
          resumeMode: 'resume_after_approval',
          riskLevel: 'medium',
          allowConflicts: true,
        }),
      }),
      expect.objectContaining({
        schemaAction: 'life_graph.reject_update',
        payload: expect.objectContaining({
          taskId: 101,
          proposalId: 88,
          checkpointRequired: true,
          resumeMode: 'resume_after_rejection',
          fieldIds: ['lifestyle:availableTimes:conflict'],
        }),
      }),
    ]);
  });

  it('exposes the public loop state after Discover publish and candidate recommendation', () => {
    const response = toUserFacingAgentResponse(
      {
        intent: 'social_search',
        confidence: 1,
        entities: {
          city: '青岛',
          activityType: '散步',
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
        action: 'reply',
        taskId: 101,
        assistantMessage: '已发布到发现页，并找到合适候选。',
        savedContext: true,
        profileUpdated: false,
        shouldQueueRun: false,
        runMode: 'follow_up',
        queuedRun: null,
        pendingApproval: null,
        activityResults: [],
        profileUpdateProposal: null,
        cards: [
          {
            id: 'publish_to_discover:101:intent_302',
            type: 'activity_status',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'social_match.activity',
            title: '已发布到发现',
            body: '公开可发现用户现在可以看到这张约练卡。',
            status: 'completed',
            data: {
              publicIntentId: 'intent_302',
              discoverHref: '/discover?publicIntentId=intent_302',
              publicIntentHref: '/public-intent/intent_302',
            },
            actions: [],
          },
          {
            id: 'candidate_22',
            type: 'candidate_card',
            title: '合适候选',
            body: '时间和地点匹配。',
            data: {},
            actions: [],
          },
        ],
        safety: {
          blocked: false,
          level: 'low',
          reasons: [],
          boundaryNotes: [],
          requiredConfirmations: [],
        },
      },
      AgentTaskPermissionMode.Confirm,
    );

    expect(response.publicLoop).toEqual({
      stage: 'candidates_ready',
      publicIntentId: 'intent_302',
      discoverHref: '/discover?publicIntentId=intent_302',
      publicIntentHref: '/public-intent/intent_302',
      messagesHref: null,
      requiredConfirmation: false,
    });
  });
});

describe('validateUserFacingAgentResponse', () => {
  function baseResponse(
    overrides: Partial<UserFacingAgentResponse> = {},
  ): UserFacingAgentResponse {
    return {
      assistantMessage: '我会继续处理你的需求。',
      lightStatus: '正在思考',
      cards: [],
      safeStatus: {
        blocked: false,
        level: 'low',
        boundaryNotes: [],
        requiredConfirmations: [],
      },
      pendingConfirmations: [],
      permissionMode: AgentTaskPermissionMode.Confirm,
      ...overrides,
    };
  }

  it('rejects internal implementation terms in ordinary responses', () => {
    expect(() =>
      validateUserFacingAgentResponse(
        baseResponse({ assistantMessage: 'planner 已经完成。' }),
      ),
    ).toThrow('user_facing_response_internal_term_leaked');
  });

  it('rejects published claims without a verified public intent', () => {
    expect(() =>
      validateUserFacingAgentResponse(
        baseResponse({ assistantMessage: '已发布到发现页。' }),
      ),
    ).toThrow('user_facing_response_claims_published_without_public_intent');
  });

  it('rejects matched claims without candidate cards', () => {
    expect(() =>
      validateUserFacingAgentResponse(
        baseResponse({
          assistantMessage: '已匹配到合适候选。',
          publicLoop: {
            stage: 'discover_visible',
            publicIntentId: 'intent_1',
            discoverHref: '/discover?publicIntentId=intent_1',
            publicIntentHref: '/public-intent/intent_1',
            messagesHref: null,
            requiredConfirmation: false,
          },
        }),
      ),
    ).toThrow('user_facing_response_claims_matched_without_candidates');
  });

  it('rejects candidate stage before Discover is verified', () => {
    expect(() =>
      validateUserFacingAgentResponse(
        baseResponse({
          publicLoop: {
            stage: 'candidates_ready',
            publicIntentId: null,
            discoverHref: null,
            publicIntentHref: null,
            messagesHref: null,
            requiredConfirmation: false,
          },
          cards: [
            {
              id: 'candidate-1',
              type: 'candidate_card',
              title: '候选',
              body: '时间地点接近。',
              data: {},
              actions: [],
            },
          ],
        }),
      ),
    ).toThrow('user_facing_response_candidates_before_discover_verified');
  });

  it('rejects candidate cards after the user dismissed the loop', () => {
    expect(() =>
      validateUserFacingAgentResponse(
        baseResponse({
          publicLoop: {
            stage: 'dismissed',
            publicIntentId: null,
            discoverHref: null,
            publicIntentHref: null,
            messagesHref: null,
            requiredConfirmation: false,
          },
          cards: [
            {
              id: 'candidate-1',
              type: 'candidate_card',
              title: '候选',
              body: '不应在撤下后展示。',
              data: {},
              actions: [],
            },
          ],
        }),
      ),
    ).toThrow('user_facing_response_dismissed_contains_candidates');
  });

  it('accepts published and matched copy when evidence exists', () => {
    expect(
      validateUserFacingAgentResponse(
        baseResponse({
          assistantMessage: '已发布到发现页，并找到候选。',
          publicLoop: {
            stage: 'candidates_ready',
            publicIntentId: 'intent_1',
            discoverHref: '/discover?publicIntentId=intent_1',
            publicIntentHref: '/public-intent/intent_1',
            messagesHref: null,
            requiredConfirmation: false,
          },
          cards: [
            {
              id: 'candidate-1',
              type: 'candidate_card',
              title: '候选',
              body: '时间地点接近。',
              data: {},
              actions: [],
            },
          ],
        }),
      ).assistantMessage,
    ).toContain('已发布');
  });
});
