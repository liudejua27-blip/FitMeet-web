import {
  buildBlockedSendMessageActionLog,
  buildExecutedSendMessageActionLog,
  buildPendingApprovalSendMessageActionLog,
} from './agent-gateway-message-log.mapper';
import {
  AgentActionRiskLevel,
  AgentActionStatus,
  AgentActionType,
} from './entities/agent-action-log.entity';
import {
  AgentPermissionLevel,
  ConnectionStatus,
} from './entities/agent-connection.entity';
import { ApprovalRiskLevel } from './entities/agent-approval-request.entity';

const conn = {
  id: 5,
  userId: 9,
  agentName: 'openclaw',
  agentDisplayName: 'OpenClaw',
  permissionLevel: AgentPermissionLevel.Open,
  status: ConnectionStatus.Active,
};

describe('agent gateway message log mapper', () => {
  it('builds blocked send-message audit input', () => {
    expect(
      buildBlockedSendMessageActionLog({
        conn: conn as never,
        dto: { messageType: 'text' },
        targetUserId: 42,
        content: 'blocked text',
        agentTaskId: 101,
        verdict: { blockedReason: 'policy', reasons: ['first_contact'] },
        isFirstContact: true,
      }),
    ).toMatchObject({
      ownerUserId: 9,
      agentId: 5,
      actionType: AgentActionType.SendMessage,
      actionStatus: AgentActionStatus.Failed,
      riskLevel: AgentActionRiskLevel.High,
      targetUserId: 42,
      inputSummary: 'blocked text',
      outputSummary: 'blocked_by_policy: policy',
      reason: 'policy',
      payload: {
        agentTaskId: 101,
        messageType: 'text',
        reasons: ['first_contact'],
        isFirstContact: true,
      },
    });
  });

  it('builds pending approval send-message audit input', () => {
    const logInput = buildPendingApprovalSendMessageActionLog({
      conn: conn as never,
      dto: {
        socialRequestId: 12,
        activityId: 77,
      },
      targetUserId: 42,
      content: 'please approve',
      agentTaskId: 101,
      approvalRequest: {
        id: 501,
        summary: 'send this?',
        reason: 'first contact',
        riskLevel: ApprovalRiskLevel.High,
      },
      verdict: { reasons: ['first_contact'] },
      isFirstContact: true,
    });

    expect(logInput).toMatchObject({
      actionStatus: AgentActionStatus.PendingApproval,
      riskLevel: AgentActionRiskLevel.High,
      relatedSocialRequestId: 12,
      relatedActivityId: 77,
      outputSummary: 'pending_approval: send this?',
      payload: {
        approvalId: 501,
        approvalType: 'first_message',
        reasons: ['first_contact'],
        messageType: 'text',
      },
      reason: 'first contact',
    });
  });

  it('builds executed send-message audit input', () => {
    const logInput = buildExecutedSendMessageActionLog({
      conn: conn as never,
      dto: {
        approvalRequestId: 501,
        metadata: { source: 'agent_runtime' },
      },
      targetUserId: 42,
      content: 'sent text',
      agentTaskId: 101,
      risk: 0.45,
      messageId: 'msg_1',
      conversationId: 'conv_1',
      socketPushed: true,
      notificationCreated: false,
    });

    expect(logInput).toMatchObject({
      actionStatus: AgentActionStatus.Executed,
      riskLevel: AgentActionRiskLevel.Medium,
      outputSummary: 'message_sent: id=msg_1 conv=conv_1',
      payload: {
        messageId: 'msg_1',
        conversationId: 'conv_1',
        messageType: 'text',
        agentTaskId: 101,
        socketPushed: true,
        notificationCreated: false,
        approvalRequestId: 501,
        source: 'agent_runtime',
      },
      reason: 'agent_send_message',
    });
  });
});
