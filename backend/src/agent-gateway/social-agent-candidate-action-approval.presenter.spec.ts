import {
  buildSocialAgentCandidateActionApprovalInput,
  buildSocialAgentCandidateActionApprovalState,
} from './social-agent-candidate-action-approval.presenter';
import {
  ApprovalRiskLevel,
  ApprovalType,
} from './entities/agent-approval-request.entity';

describe('social agent candidate action approval presenter', () => {
  const route = {
    intent: 'action_request',
    entities: {
      city: '',
      activityType: '',
      targetGender: '',
      timePreference: '',
      locationPreference: '',
    },
  } as const;
  const candidate = {
    userId: 22,
    candidateUserId: 22,
    candidateRecordId: 501,
    nickname: '小林',
  };

  it('builds a send-message approval input from chat intent', () => {
    expect(
      buildSocialAgentCandidateActionApprovalInput({
        ownerUserId: 7,
        taskId: 101,
        message: '帮我给她发消息',
        route,
        candidate,
        targetUserId: 22,
        relatedCandidateId: 501,
      }),
    ).toEqual({
      userId: 7,
      agentConnectionId: null,
      agentTaskId: 101,
      type: 'send_message',
      actionType: 'send_invite',
      skillName: 'send_invite',
      payload: {
        source: 'social_agent_chat',
        userMessage: '帮我给她发消息',
        intent: 'action_request',
        entities: route.entities,
        candidateUserId: 22,
        agentTaskId: 101,
      },
      summary: '用户请求向候选人 #22发送消息',
      riskLevel: 'medium',
      reason: '由 Social Agent 聊天意图路由生成，待用户在前端确认。',
      createdBy: 'agent',
      relatedCandidateId: 501,
    });
  });

  it('recognizes connect and invite candidate intents', () => {
    expect(
      buildSocialAgentCandidateActionApprovalInput({
        ownerUserId: 7,
        taskId: 101,
        message: '帮我加好友',
        route,
        candidate,
        targetUserId: 22,
        relatedCandidateId: 501,
      }),
    ).toMatchObject({
      type: 'contact_request',
      actionType: 'connect_candidate',
      summary: '用户请求添加候选人 #22为好友/关注',
      riskLevel: 'medium',
    });
    expect(
      buildSocialAgentCandidateActionApprovalInput({
        ownerUserId: 7,
        taskId: 101,
        message: '邀请她一起约练',
        route,
        candidate,
        targetUserId: 22,
        relatedCandidateId: 501,
      }),
    ).toMatchObject({
      type: 'join_activity',
      actionType: 'invite_candidate',
      summary: '用户请求邀请候选人 #22参加活动',
      riskLevel: 'medium',
    });
  });

  it('summarizes Social Codex runtime context into the approval payload', () => {
    expect(
      buildSocialAgentCandidateActionApprovalInput({
        ownerUserId: 7,
        taskId: 101,
        message: '邀请她一起散步',
        route,
        candidate,
        targetUserId: 22,
        relatedCandidateId: 501,
        runtimeContext: {
          hydratedContext: {
            userId: 7,
            threadId: 'agent-task:101',
            taskId: 101,
            recentMessages: [
              { role: 'user', content: '今晚青岛大学附近散步' },
            ],
            taskMemory: null,
            taskSlots: {
              time_window: { value: '今晚', state: 'completed' },
              location_text: { value: '青岛大学附近', state: 'completed' },
              activity: { value: '散步', state: 'completed' },
            },
            lifeGraphFactProposals: [],
            lifeGraphFactDisplaySummaries: [],
            lifeGraphGovernanceSummary: {
              total: 0,
              autoSaveCount: 0,
              confirmationRequiredCount: 0,
              blockedCount: 0,
              sensitiveCount: 0,
              expiringFactKeys: [],
            },
            lifeGraphSummary: { preferences: { intensity: '低强度' } },
            pendingApprovals: [{ id: 'approval-existing' }],
            candidateActions: { saved: ['candidate-1'] },
          } as never,
          brainToolResults: [{ toolName: 'candidate_confirmation_check' }],
        },
      }),
    ).toMatchObject({
      payload: {
        socialCodex: {
          runtimeContext: {
            schemaVersion: 'fitmeet.social_codex.action_context.v1',
            hasHydratedContext: true,
            threadId: 'agent-task:101',
            taskId: 101,
            completedSlots: [
              { key: 'time_window', value: '今晚', state: 'completed' },
              {
                key: 'location_text',
                value: '青岛大学附近',
                state: 'completed',
              },
              { key: 'activity', value: '散步', state: 'completed' },
            ],
            pendingApprovalCount: 1,
            hasCandidateActions: true,
            hasLifeGraphSummary: true,
            brainToolResultCount: 1,
          },
        },
      },
    });
  });

  it('falls back to a custom low-risk approval for unknown actions', () => {
    expect(
      buildSocialAgentCandidateActionApprovalInput({
        ownerUserId: 7,
        taskId: 101,
        message: '帮我想想下一步',
        route,
        candidate: undefined,
        targetUserId: null,
        relatedCandidateId: null,
      }),
    ).toMatchObject({
      type: 'custom',
      actionType: 'social_agent_action',
      summary: '用户请求执行动作：帮我想想下一步',
      riskLevel: 'low',
      relatedCandidateId: null,
    });
  });

  it('builds pending action and confirmation state patch', () => {
    expect(
      buildSocialAgentCandidateActionApprovalState({
        pendingApproval: {
          id: 9001,
          type: ApprovalType.SendMessage,
          actionType: 'send_invite',
          summary: '用户请求向候选人 #22发送消息',
          riskLevel: ApprovalRiskLevel.Medium,
          payload: {},
          expiresAt: '2026-06-08T00:00:00.000Z',
        },
        at: '2026-06-07T00:00:00.000Z',
      }),
    ).toEqual({
      pendingAction: {
        id: 9001,
        type: ApprovalType.SendMessage,
        actionType: 'send_invite',
        summary: '用户请求向候选人 #22发送消息',
        riskLevel: ApprovalRiskLevel.Medium,
        at: '2026-06-07T00:00:00.000Z',
      },
      transitionPatch: {
        objective: 'candidate_action',
        nextStep: '等待用户确认候选人动作',
        shouldSearchNow: false,
        awaitingSearchConfirmation: false,
        waitingFor: 'action_confirmation',
        lastCompletedStep: 'approval_created',
      },
    });
  });
});
