import { AgentTaskPermissionMode } from './entities/agent-task.entity';
import { SocialAgentActionSideEffectService } from './social-agent-action-side-effect.service';
import {
  SocialAgentToolCallRecord,
  SocialAgentToolName,
} from './social-agent-tool.types';

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 100,
    ownerUserId: 1,
    agentConnectionId: 7,
    permissionMode: AgentTaskPermissionMode.LimitedAuto,
    title: 'Find a running partner',
    goal: 'Invite a nearby runner',
    ...overrides,
  };
}

function makeCall(
  overrides: Partial<SocialAgentToolCallRecord> = {},
): SocialAgentToolCallRecord {
  return {
    id: 'call_1',
    stepId: 'step_1',
    toolName: SocialAgentToolName.SendMessage,
    status: 'succeeded',
    input: { targetUserId: 2, text: 'Want to run?' },
    output: { conversationId: 'conv_1', messageId: 'msg_1' },
    error: null,
    startedAt: '2026-06-06T00:00:00.000Z',
    completedAt: '2026-06-06T00:00:01.000Z',
    durationMs: 1000,
    ...overrides,
  };
}

describe('SocialAgentActionSideEffectService', () => {
  function makeService() {
    const actionLogs = {
      logAgentAction: jest.fn().mockResolvedValue({ id: 1 }),
    };
    const messages = {
      createAgentInboxEvent: jest.fn().mockResolvedValue({ id: 'evt_1' }),
    };
    const service = new SocialAgentActionSideEffectService(
      actionLogs as never,
      messages as never,
    );
    return { service, actionLogs, messages };
  }

  it('writes an audit log and action inbox event for successful social actions', async () => {
    const { service, actionLogs, messages } = makeService();
    const call = makeCall();

    await service.record({
      task: makeTask() as never,
      toolName: SocialAgentToolName.SendMessage,
      input: call.input,
      call,
      policy: {
        permissionMode: AgentTaskPermissionMode.LimitedAuto,
        requiresApproval: false,
        sceneRisk: { sceneType: 'running', riskLevel: 'medium' },
      },
    });

    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 1,
        agentId: 7,
        agentTaskId: 100,
        actionType: 'send_message',
        actionStatus: 'executed',
        eventType: 'social_agent.tool.succeeded',
        conversationId: 'conv_1',
        messageId: 'msg_1',
        status: 'succeeded',
        riskLevel: 'medium',
        targetUserId: 2,
        payload: expect.objectContaining({
          agentTaskId: 100,
          stepId: 'step_1',
          toolCallId: 'call_1',
          toolName: SocialAgentToolName.SendMessage,
          userId: 1,
          executed: true,
          requiresApproval: false,
          sceneType: 'running',
        }),
      }),
    );
    expect(messages.createAgentInboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentConnectionId: 7,
        ownerUserId: 1,
        eventType: 'agent.action.succeeded',
        conversationId: 'conv_1',
        messageId: 'msg_1',
        fromUserId: 2,
        contentPreview: 'send_message completed',
        dedupeKey: '7:agent.action:100:call_1',
      }),
    );
  });

  it('records pending approval actions as not executed', async () => {
    const { service, actionLogs, messages } = makeService();
    const call = makeCall({
      toolName: SocialAgentToolName.Payment,
      input: { payeeUserId: 2, amount: 88, approvalId: 501 },
      output: {
        pendingApproval: true,
        status: 'pending_approval',
        approvalId: 501,
      },
    });

    await service.record({
      task: makeTask() as never,
      toolName: SocialAgentToolName.Payment,
      input: call.input,
      call,
      policy: {
        permissionMode: AgentTaskPermissionMode.LimitedAuto,
        requiresApproval: true,
        sceneRisk: { sceneType: 'payment', riskLevel: 'critical' },
      },
    });

    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'payment',
        actionStatus: 'pending_approval',
        riskLevel: 'high',
        targetUserId: 2,
        payload: expect.objectContaining({
          approvalId: 501,
          executed: false,
          requiresApproval: true,
          sceneType: 'payment',
        }),
      }),
    );
    expect(messages.createAgentInboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'agent.action.succeeded',
        metadata: expect.objectContaining({
          output: expect.objectContaining({
            pendingApproval: true,
            status: 'pending_approval',
          }),
        }),
      }),
    );
  });
});
