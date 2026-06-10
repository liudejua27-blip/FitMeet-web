import { ForbiddenException } from '@nestjs/common';

import { AgentPermissionService } from './agent-permission.service';
import {
  AgentTask,
  AgentTaskPermissionMode,
} from './entities/agent-task.entity';
import { FitMeetAgentToolRegistryService } from './fitmeet-agent-tool-registry.service';
import { SceneRiskPolicyService } from './scene-risk-policy.service';
import { SocialAgentToolExecutionPolicyService } from './social-agent-tool-execution-policy.service';
import {
  SocialAgentToolCallRecord,
  SocialAgentToolName,
} from './social-agent-tool.types';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 100,
    ownerUserId: 1,
    agentConnectionId: 7,
    taskType: 'social_goal',
    title: 'Book a running venue deposit',
    goal: 'Pay a small venue deposit',
    input: {},
    plan: [],
    toolCalls: [],
    result: {},
    memory: {},
    status: 'pending',
    permissionMode: AgentTaskPermissionMode.LimitedAuto,
    riskLevel: 'low' as never,
    idempotencyKey: null,
    statusReason: null,
    error: null,
    startedAt: null,
    awaitingConfirmationAt: null,
    completedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  } as AgentTask;
}

function makePolicyService(
  registry: Pick<
    FitMeetAgentToolRegistryService,
    'getToolByExecutorName'
  > = new FitMeetAgentToolRegistryService(),
  selfImprove?: {
    publishedToolPolicyPatches: jest.Mock;
    publishedSafetyPolicyPatches: jest.Mock;
  },
) {
  return new SocialAgentToolExecutionPolicyService(
    new AgentPermissionService(),
    registry as FitMeetAgentToolRegistryService,
    new SceneRiskPolicyService(),
    selfImprove as never,
  );
}

describe('SocialAgentToolExecutionPolicyService', () => {
  it('builds critical payment policy metadata with limit and idempotency contract', () => {
    const service = makePolicyService();

    const policy = service.buildPolicyMetadata(
      makeTask(),
      SocialAgentToolName.Payment,
      { amount: 88, currency: 'cny', payeeUserId: 2 },
    );

    expect(policy).toMatchObject({
      permissionMode: AgentTaskPermissionMode.LimitedAuto,
      canonicalPermissionMode: 'limited_auto',
      requiresApproval: true,
      riskLevel: 'high',
      highRisk: true,
      dailyLimit: 3,
      idempotency: 'paymentIntentKeys',
      executionContract: 'create_payment_intent_only',
      sceneRisk: expect.objectContaining({
        actionType: 'payment',
        riskLevel: 'critical',
        blockedActions: expect.arrayContaining(['auto_execute']),
      }),
    });
  });

  it('blocks high-risk tools after the per-task 24 hour limit', () => {
    const service = makePolicyService();
    const existingCalls = [0, 1, 2].map(
      (index): SocialAgentToolCallRecord => ({
        id: `old_${index}`,
        stepId: `old_${index}`,
        toolName: SocialAgentToolName.Payment,
        status: 'succeeded',
        input: {},
        output: {},
        error: null,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 1,
      }),
    );

    expect(() =>
      service.assertHighRiskFrequencyLimit(
        makeTask({ toolCalls: existingCalls }),
        SocialAgentToolName.Payment,
      ),
    ).toThrow('daily_high_risk_tool_limit_exceeded: payment limit=3');
  });

  it('ignores old or failed tool calls when counting high-risk frequency', () => {
    const service = makePolicyService();
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const calls: SocialAgentToolCallRecord[] = [
      {
        id: 'old_success',
        stepId: 'old_success',
        toolName: SocialAgentToolName.Payment,
        status: 'succeeded',
        input: {},
        output: {},
        error: null,
        startedAt: oldDate,
        completedAt: oldDate,
        durationMs: 1,
      },
      {
        id: 'recent_failed',
        stepId: 'recent_failed',
        toolName: SocialAgentToolName.Payment,
        status: 'failed',
        input: {},
        output: null,
        error: { message: 'declined' },
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 1,
      },
    ];

    expect(() =>
      service.assertHighRiskFrequencyLimit(
        makeTask({ toolCalls: calls }),
        SocialAgentToolName.Payment,
      ),
    ).not.toThrow();
  });

  it('rejects tools that are not registered for the current permission mode', () => {
    const service = makePolicyService({
      getToolByExecutorName: jest.fn(
        () =>
          ({
            name: 'payment',
            category: 'payment',
            requiresApproval: true,
            permissionMode: [AgentTaskPermissionMode.LimitedAuto],
          }) as never,
      ),
    });

    expect(() =>
      service.assertToolAllowed({
        mode: AgentTaskPermissionMode.Confirm,
        step: { action: 'payment' },
        toolName: SocialAgentToolName.Payment,
      }),
    ).toThrow(ForbiddenException);
  });

  it('maps legacy open mode to limited auto for registry checks', () => {
    const service = makePolicyService({
      getToolByExecutorName: jest.fn(
        () =>
          ({
            name: 'send_message',
            category: 'message',
            requiresApproval: false,
            permissionMode: [AgentTaskPermissionMode.LimitedAuto],
          }) as never,
      ),
    });

    expect(() =>
      service.assertToolAllowed({
        mode: 'open',
        step: { action: 'send_message' },
        toolName: SocialAgentToolName.SendMessage,
      }),
    ).not.toThrow();
  });

  it('applies published tool and safety policy patches to runtime metadata', async () => {
    const selfImprove = {
      publishedToolPolicyPatches: jest.fn().mockResolvedValue([
        {
          forceRequiresApproval: true,
          forceRiskLevel: 'high',
          executionContract: 'human_review_required',
        },
      ]),
      publishedSafetyPolicyPatches: jest.fn().mockResolvedValue([
        {
          forceMinRiskLevel: 'critical',
          requireDoubleConfirmation: true,
          blockedActions: ['auto_execute'],
          safetyPrompt: 'Self-improve safety rule applied.',
        },
      ]),
    };
    const service = makePolicyService(undefined, selfImprove);

    const policy = await service.buildPolicyMetadataWithPatches(
      makeTask(),
      SocialAgentToolName.SendMessage,
      { text: '今晚发消息约见面' },
    );

    expect(selfImprove.publishedToolPolicyPatches).toHaveBeenCalledWith(
      SocialAgentToolName.SendMessage,
    );
    expect(policy).toMatchObject({
      requiresApproval: true,
      requiresDoubleConfirmation: true,
      riskLevel: 'high',
      highRisk: true,
      executionContract: 'human_review_required',
      selfImproveToolPolicyApplied: true,
      selfImproveSafetyPolicyApplied: true,
      sceneRisk: expect.objectContaining({
        riskLevel: 'critical',
        blockedActions: expect.arrayContaining(['auto_execute']),
        safetyPrompts: expect.arrayContaining([
          'Self-improve safety rule applied.',
        ]),
      }),
    });
  });
});
