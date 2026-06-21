import {
  buildSocialAgentOpenerDraftApprovalInput,
  buildSocialAgentOpenerDraftState,
} from './social-agent-opener-draft-action.presenter';
import {
  ApprovalRiskLevel,
  ApprovalType,
} from './entities/agent-approval-request.entity';

describe('social agent opener draft action presenter', () => {
  const candidate = {
    userId: 22,
    candidateRecordId: 501,
    displayName: '小林',
    suggestedMessage: '今晚先在青岛大学操场轻松跑一段吗？',
  };

  it('builds the approval input for sending a candidate opener draft', () => {
    expect(
      buildSocialAgentOpenerDraftApprovalInput({
        ownerUserId: 7,
        taskId: 101,
        action: 'opener.confirm_send',
        targetUserId: 22,
        candidate,
        draft: '今晚先在青岛大学操场轻松跑一段吗？',
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
        source: 'agent_card_action',
        schemaAction: 'opener.confirm_send',
        taskId: 101,
        agentTaskId: 101,
        candidateUserId: 22,
        targetUserId: 22,
        candidateRecordId: 501,
        socialRequestCandidateId: 501,
        candidate,
        message: '今晚先在青岛大学操场轻松跑一段吗？',
        suggestedOpener: '今晚先在青岛大学操场轻松跑一段吗？',
        safetyBoundary: '确认前不会发送。建议先站内沟通，不急着交换联系方式。',
        approvalRequired: true,
        checkpointRequired: true,
        resumeMode: 'resume_after_approval',
        idempotencyKey: 'opener-send:101:22',
        riskReasons: [
          '这个动作会向真实用户发送消息',
          '发送前需要你确认语气和内容',
          '不会自动交换联系方式或精确位置',
        ],
      },
      summary: '发送开场白给这位用户',
      riskLevel: 'high',
      reason: 'FitMeet Agent 已生成开场白草稿，等待用户确认后再发送。',
      createdBy: 'agent',
      relatedCandidateId: 501,
    });
  });

  it('keeps stable candidate identity in the opener approval payload', () => {
    expect(
      buildSocialAgentOpenerDraftApprovalInput({
        ownerUserId: 7,
        taskId: 101,
        action: 'opener.confirm_send',
        targetUserId: 22,
        candidate: {
          ...candidate,
          socialRequestId: 301,
        },
        draft: '今晚先在青岛大学操场轻松跑一段吗？',
        relatedCandidateId: 501,
      }),
    ).toMatchObject({
      payload: {
        taskId: 101,
        agentTaskId: 101,
        targetUserId: 22,
        candidateUserId: 22,
        candidateRecordId: 501,
        socialRequestCandidateId: 501,
        socialRequestId: 301,
      },
      relatedCandidateId: 501,
    });
  });

  it('falls back to a generic approval summary without a target user', () => {
    expect(
      buildSocialAgentOpenerDraftApprovalInput({
        ownerUserId: 7,
        taskId: 101,
        action: 'opener.confirm_send',
        targetUserId: null,
        candidate,
        draft: '你好，想先聊聊吗？',
        relatedCandidateId: null,
      }).summary,
    ).toBe('发送开场白给对方');
  });

  it('builds the pending action, draft state, and confirmation copy', () => {
    expect(
      buildSocialAgentOpenerDraftState({
        action: 'candidate.generate_opener',
        targetUserId: 22,
        candidate,
        draft: '今晚先在青岛大学操场轻松跑一段吗？',
        approvalId: 9001,
        pendingApproval: {
          id: 9001,
          type: ApprovalType.SendMessage,
          actionType: 'send_invite',
          summary: '发送开场白给这位用户',
          riskLevel: ApprovalRiskLevel.High,
          payload: {},
          expiresAt: '2026-06-08T00:00:00.000Z',
        },
        at: '2026-06-07T00:00:00.000Z',
      }),
    ).toMatchObject({
      pendingAction: {
        id: 9001,
        type: ApprovalType.SendMessage,
        actionType: 'send_invite',
        summary: '发送开场白给这位用户',
        riskLevel: ApprovalRiskLevel.High,
        at: '2026-06-07T00:00:00.000Z',
      },
      cardActionDraft: {
        action: 'candidate.generate_opener',
        targetUserId: 22,
        candidate,
        message: '今晚先在青岛大学操场轻松跑一段吗？',
        approvalId: 9001,
      },
      transitionPatch: {
        objective: 'candidate_messaging',
        nextStep: '等待你确认是否发送开场白',
        waitingFor: 'message_confirmation',
        lastCompletedStep: 'opener_draft_created',
      },
      displayName: '小林',
      assistantMessage:
        '我先帮你写了一条低压力的开场白。你确认前，我不会替你发送。',
    });
  });
});
