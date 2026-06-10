import { AgentTaskPermissionMode } from './entities/agent-task.entity';
import {
  ApprovalRiskLevel,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import type { SceneRiskPolicyResult } from './scene-risk-policy.service';
import {
  buildSocialAgentPendingApprovalOutput,
  buildSocialAgentRiskGateDecision,
} from './social-agent-risk-gate.presenter';
import { SocialAgentToolName } from './social-agent-tool.types';

const basePolicy: SceneRiskPolicyResult = {
  riskLevel: 'medium',
  requiresConfirmation: true,
  requiresDoubleConfirmation: false,
  blockedActions: [],
  safetyPrompts: ['需要先确认'],
  sceneType: 'general',
  actionType: 'send_message',
  permissionMode: 'manual_confirm',
};

const task = {
  id: 100,
  ownerUserId: 1,
  agentConnectionId: 7,
  permissionMode: AgentTaskPermissionMode.Confirm,
};

describe('social-agent-risk-gate.presenter', () => {
  it('returns simulated output when policy blocks real execution', () => {
    const decision = buildSocialAgentRiskGateDecision({
      task,
      toolName: SocialAgentToolName.SendMessage,
      toolInput: { targetUserId: 2, text: 'Hi' },
      stepId: 'step_1',
      policy: {
        ...basePolicy,
        requiresConfirmation: false,
        blockedActions: ['execute_real_action'],
        permissionMode: 'lab',
      },
      hasUserApproval: false,
    });

    expect(decision).toMatchObject({
      kind: 'simulated',
      output: {
        success: true,
        status: 'simulated',
        simulated: true,
        toolName: SocialAgentToolName.SendMessage,
        stepId: 'step_1',
      },
    });
  });

  it('bypasses approval when confirmation is not required or already present', () => {
    expect(
      buildSocialAgentRiskGateDecision({
        task,
        toolName: SocialAgentToolName.DraftOpener,
        toolInput: { targetUserId: 2, text: 'Hi' },
        stepId: 'step_1',
        policy: { ...basePolicy, requiresConfirmation: false },
        hasUserApproval: false,
      }),
    ).toEqual({ kind: 'none' });

    expect(
      buildSocialAgentRiskGateDecision({
        task,
        toolName: SocialAgentToolName.SendMessage,
        toolInput: { targetUserId: 2, text: 'Hi', approvalId: 501 },
        stepId: 'step_1',
        policy: basePolicy,
        hasUserApproval: true,
      }),
    ).toEqual({ kind: 'none' });
  });

  it('bypasses approval for non-confirmable tools even under confirm policy', () => {
    expect(
      buildSocialAgentRiskGateDecision({
        task,
        toolName: SocialAgentToolName.SearchMatches,
        toolInput: { query: 'running' },
        stepId: 'step_1',
        policy: {
          ...basePolicy,
          actionType: 'search_candidates',
        },
        hasUserApproval: false,
      }),
    ).toEqual({ kind: 'none' });
  });

  it('builds the approval create input used by the executor', () => {
    const decision = buildSocialAgentRiskGateDecision({
      task,
      toolName: SocialAgentToolName.Payment,
      toolInput: {
        amount: 88,
        currency: 'cny',
        payeeUserId: 2,
        socialRequestId: 50,
      },
      stepId: 'step_1',
      policy: {
        ...basePolicy,
        riskLevel: 'critical',
        requiresDoubleConfirmation: true,
        blockedActions: ['auto_execute'],
        actionType: 'payment',
      },
      hasUserApproval: false,
    });

    expect(decision).toMatchObject({
      kind: 'pending_approval',
      approvalInput: {
        userId: 1,
        agentConnectionId: 7,
        agentTaskId: 100,
        type: ApprovalType.Payment,
        actionType: 'payment',
        skillName: SocialAgentToolName.Payment,
        riskLevel: ApprovalRiskLevel.High,
        relatedSocialRequestId: 50,
        relatedCandidateId: null,
        relatedActivityId: null,
        createdBy: 'agent',
        payload: {
          amount: 88,
          currency: 'cny',
          payeeUserId: 2,
          socialRequestId: 50,
          agentTaskId: 100,
          stepId: 'step_1',
          toolName: SocialAgentToolName.Payment,
          sceneType: 'general',
          riskLevel: 'critical',
          requiresDoubleConfirmation: true,
          blockedActions: ['auto_execute'],
        },
      },
    });
  });

  it('serializes pending approval output for Web/iOS task restoration', () => {
    const expiresAt = new Date('2026-06-07T00:00:00.000Z');

    expect(
      buildSocialAgentPendingApprovalOutput({
        approval: {
          id: 501,
          type: ApprovalType.Payment,
          actionType: 'payment',
          summary: '支付/钱包属于Critical动作，需要双确认后再执行。',
          riskLevel: ApprovalRiskLevel.High,
          payload: { amount: 88 },
          expiresAt,
        },
        policy: basePolicy,
      }),
    ).toEqual({
      success: false,
      status: 'pending_approval',
      pendingApproval: true,
      approvalId: 501,
      approval: {
        id: 501,
        type: ApprovalType.Payment,
        actionType: 'payment',
        summary: '支付/钱包属于Critical动作，需要双确认后再执行。',
        riskLevel: ApprovalRiskLevel.High,
        payload: { amount: 88 },
        expiresAt: '2026-06-07T00:00:00.000Z',
      },
      riskPolicy: basePolicy,
      message: '已创建待确认动作，用户确认后 Agent 才会继续执行。',
    });
  });
});
