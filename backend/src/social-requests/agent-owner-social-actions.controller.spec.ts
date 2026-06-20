import { AgentOwnerSocialActionsController } from './agent-owner-social-actions.controller';
import { AGENT_CONNECTION_KEY } from '../agent-gateway/guards/agent-token.guard';
import { AgentAction } from '../agent-gateway/entities/agent-permission.entity';
import { ApprovalRiskLevel, ApprovalType } from '../agent-gateway/entities/agent-approval-request.entity';

function makeController() {
  const socialRequests = {
    aiDraft: jest.fn(),
    syncPublicIntentById: jest.fn(),
  };
  const matchService = {
    runMatch: jest.fn(),
    listCandidates: jest.fn(),
    markCandidateMessaged: jest.fn(),
  };
  const messages = {
    startConversation: jest.fn(),
    sendMessage: jest.fn(),
  };
  const approvals = {
    create: jest.fn().mockResolvedValue({ id: 9001 }),
  };
  const controller = new AgentOwnerSocialActionsController(
    socialRequests as never,
    matchService as never,
    messages as never,
    approvals as never,
  );
  const req = {
    [AGENT_CONNECTION_KEY]: {
      id: 77,
      userId: 7,
      permissions: [
        AgentAction.CreateSocialRequest,
        AgentAction.SendMessage,
      ],
    },
  };
  return { approvals, controller, matchService, messages, req, socialRequests };
}

describe('AgentOwnerSocialActionsController approval gates', () => {
  it('passes agent-token ai-draft taskContext into SocialRequestsService', async () => {
    const harness = makeController();
    const taskContext = {
      taskSlots: {
        activity: { value: '散步', state: 'completed' },
        time_window: { value: '今天晚上', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
      },
    };

    await harness.controller.aiDraft(harness.req as never, {
      rawText: '可以，继续帮我找人',
      taskContext,
    });

    expect(harness.socialRequests.aiDraft).toHaveBeenCalledWith(
      7,
      '可以，继续帮我找人',
      expect.objectContaining({
        agentId: 77,
        source: 'agent_token_social_request_ai_draft',
        taskContext,
      }),
    );
  });

  it('turns agent-token public publish into a real approval request', async () => {
    const harness = makeController();

    await expect(harness.controller.publish(harness.req as never, 301)).resolves.toEqual({
      ok: true,
      status: 'pending_approval',
      approvalId: 9001,
      reason: 'public_publish_requires_user_confirmation',
    });

    expect(harness.socialRequests.syncPublicIntentById).not.toHaveBeenCalled();
    expect(harness.approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        agentConnectionId: 77,
        type: ApprovalType.PostPublish,
        actionType: 'publish_social_request',
        riskLevel: ApprovalRiskLevel.High,
        relatedSocialRequestId: 301,
        payload: expect.objectContaining({
          socialRequestId: 301,
          checkpointRequired: true,
          resumeMode: 'resume_after_approval',
        }),
      }),
    );
  });

  it('turns agent-token invite sending into a real approval request', async () => {
    const harness = makeController();

    await expect(
      harness.controller.sendInvite(harness.req as never, 301, 501, {
        targetUserId: 22,
        text: '周末一起跑步吗？',
      }),
    ).resolves.toEqual({
      ok: true,
      status: 'pending_approval',
      approvalId: 9001,
      reason: 'send_invite_requires_user_confirmation',
    });

    expect(harness.messages.startConversation).not.toHaveBeenCalled();
    expect(harness.messages.sendMessage).not.toHaveBeenCalled();
    expect(harness.matchService.markCandidateMessaged).not.toHaveBeenCalled();
    expect(harness.approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        agentConnectionId: 77,
        type: ApprovalType.SendMessage,
        actionType: 'send_message',
        relatedSocialRequestId: 301,
        relatedCandidateId: 501,
        payload: expect.objectContaining({
          toUserId: 22,
          content: '周末一起跑步吗？',
          socialRequestId: 301,
          candidateRecordId: 501,
          checkpointRequired: true,
        }),
      }),
    );
  });

  it('turns agent-token mark-messaged into a real approval request', async () => {
    const harness = makeController();

    await expect(
      harness.controller.markMessaged(harness.req as never, 301, 501),
    ).resolves.toEqual({
      ok: true,
      status: 'pending_approval',
      approvalId: 9001,
      reason: 'mark_candidate_messaged_requires_user_confirmation',
    });

    expect(harness.matchService.markCandidateMessaged).not.toHaveBeenCalled();
    expect(harness.approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        agentConnectionId: 77,
        type: ApprovalType.Custom,
        actionType: 'mark_candidate_messaged',
        relatedSocialRequestId: 301,
        relatedCandidateId: 501,
        payload: expect.objectContaining({
          socialRequestId: 301,
          candidateRecordId: 501,
          checkpointRequired: true,
        }),
      }),
    );
  });
});
