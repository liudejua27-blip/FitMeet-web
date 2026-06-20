import { ForbiddenException } from '@nestjs/common';

import { AgentPermissionService } from './agent-permission.service';
import {
  AgentTask,
  AgentTaskPermissionMode,
} from './entities/agent-task.entity';
import { FitMeetAgentToolRegistryService } from './fitmeet-agent-tool-registry.service';
import { SceneRiskPolicyService } from './scene-risk-policy.service';
import { SocialAgentToolExecutionPolicyService } from './social-agent-tool-execution-policy.service';
import { SocialCodexRuntimePolicyService } from './social-codex-runtime-policy.service';
import {
  requiresMandatorySocialAgentApproval,
  SOCIAL_AGENT_MANDATORY_APPROVAL_TOOLS,
} from './social-agent-tool-policy';
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
    new SocialCodexRuntimePolicyService(),
  );
}

describe('SocialAgentToolExecutionPolicyService', () => {
  it('keeps every mandatory social side-effect tool behind approval, dry-run, audit, and idempotency', () => {
    const service = makePolicyService();

    for (const toolName of SOCIAL_AGENT_MANDATORY_APPROVAL_TOOLS) {
      const policy = service.buildPolicyMetadata(makeTask(), toolName, {
        targetUserId: 2,
        candidateRecordId: 701,
        publiclyDiscoverable: true,
        message: '周末下午一起散步吗？',
      });

      expect(requiresMandatorySocialAgentApproval(toolName)).toBe(true);
      expect(policy).toEqual(
        expect.objectContaining({
          requiresApproval: true,
          dryRunRequired: true,
          auditRequired: true,
          highRisk: true,
          idempotencyKey: expect.any(String),
        }),
      );
      expect(policy.idempotencyKey).toContain(`tool:${toolName}`);
      expect(policy.socialCodex).toEqual(
        expect.objectContaining({
          requiresApproval: true,
          dryRunRequired: true,
          auditRequired: true,
        }),
      );
    }
  });

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

  it('merges Social Codex sandbox metadata into tool policy output', () => {
    const service = makePolicyService();

    const policy = service.buildPolicyMetadata(
      makeTask(),
      SocialAgentToolName.SendMessageToCandidate,
      { message: '周末下午一起散步吗？', publiclyDiscoverable: true },
    );

    expect(policy).toMatchObject({
      requiresApproval: true,
      dryRunRequired: true,
      auditRequired: true,
      highRisk: true,
      executionContract: 'approval_required_dry_run_audit',
      socialCodex: expect.objectContaining({
        actionType: 'send_invite',
        mode: 'approval_required',
        riskLevel: 'high',
        requiresApproval: true,
        dryRunRequired: true,
        auditRequired: true,
        idempotencyKey: expect.stringMatching(
          /^social_codex:send_invite:task:100:tool:send_message_to_candidate:/,
        ),
        dryRunPreview: expect.objectContaining({
          required: true,
          title: '邀请发送草稿',
          sideEffectAllowedBeforeApproval: false,
        }),
      }),
      socialCodexAudit: expect.objectContaining({
        event: 'social_codex.policy_decision',
        actionType: 'send_invite',
        taskId: 100,
        payload: expect.objectContaining({
          message: '周末下午一起散步吗？',
        }),
      }),
      idempotencyKey: expect.stringMatching(
        /^social_codex:send_invite:task:100:tool:send_message_to_candidate:/,
      ),
    });
  });

  it('classifies CreateSocialRequest publish payloads as approval-gated publish actions', () => {
    const service = makePolicyService();

    const policy = service.buildPolicyMetadata(
      makeTask({ title: '今晚青岛大学散步', goal: '发布到发现找搭子' }),
      SocialAgentToolName.CreateSocialRequest,
      {
        mode: 'publish',
        publish: true,
        syncPublicIntent: true,
        title: '今晚青岛大学散步',
      },
    );

    expect(policy).toMatchObject({
      requiresApproval: true,
      dryRunRequired: true,
      auditRequired: true,
      highRisk: true,
      executionContract: 'approval_required_dry_run_audit',
      socialCodex: expect.objectContaining({
        actionType: 'publish_social_request',
        mode: 'approval_required',
        riskLevel: 'high',
        requiresApproval: true,
        dryRunRequired: true,
        auditRequired: true,
        idempotencyKeyScope: 'social_codex:publish_social_request',
        idempotencyKey: expect.stringMatching(
          /^social_codex:publish_social_request:task:100:tool:create_social_request:/,
        ),
      }),
      socialCodexAudit: expect.objectContaining({
        event: 'social_codex.policy_decision',
        actionType: 'publish_social_request',
        taskId: 100,
      }),
      idempotencyKey: expect.stringMatching(
        /^social_codex:publish_social_request:task:100:tool:create_social_request:/,
      ),
    });
  });

  it('builds stable idempotency keys for the same Social Codex action', () => {
    const service = makePolicyService();
    const task = makeTask();
    const input = { message: '周末下午一起散步吗？', publiclyDiscoverable: true };

    const first = service.buildPolicyMetadata(
      task,
      SocialAgentToolName.SendMessageToCandidate,
      input,
    );
    const second = service.buildPolicyMetadata(
      task,
      SocialAgentToolName.SendMessageToCandidate,
      { publiclyDiscoverable: true, message: '周末下午一起散步吗？' },
    );

    expect(first.idempotencyKey).toBe(second.idempotencyKey);
    expect(first.socialCodex).toMatchObject({
      idempotencyKey: first.idempotencyKey,
    });
  });

  it('keeps low-risk tools read-only in Social Codex sandbox metadata', () => {
    const service = makePolicyService();

    const policy = service.buildPolicyMetadata(
      makeTask({ title: '找散步搭子', goal: '搜索公开可发现的散步机会' }),
      SocialAgentToolName.SearchPublicIntents,
      { activity: '散步', area: '青岛大学附近' },
    );

    expect(policy).toMatchObject({
      requiresApproval: false,
      dryRunRequired: false,
      auditRequired: false,
      highRisk: false,
      executionContract: 'mode_gated',
      socialCodex: expect.objectContaining({
        actionType: 'search_public_candidates',
        mode: 'allow',
        riskLevel: 'low',
        sandbox: expect.objectContaining({
          readOnlyAccessAllowed: true,
          externalSideEffectAllowed: false,
          contactExchangeAllowed: false,
          preciseLocationAllowed: false,
        }),
      }),
      socialCodexAudit: null,
    });
  });

  it('marks contact exchange as blocked by the Social Codex sandbox until confirmed', () => {
    const service = makePolicyService();

    const policy = service.buildPolicyMetadata(
      makeTask(),
      SocialAgentToolName.SendMessage,
      { message: '我的微信是 fitmeet-test' },
    );

    expect(policy).toMatchObject({
      requiresApproval: true,
      dryRunRequired: false,
      auditRequired: true,
      executionContract: 'blocked_by_social_codex_sandbox',
      socialCodex: expect.objectContaining({
        mode: 'blocked',
        riskLevel: 'blocked',
      }),
      socialCodexAudit: expect.objectContaining({
        actionType: 'send_message',
        payload: {
          message: '[redacted]',
        },
      }),
    });
    expect(JSON.stringify(policy.socialCodexAudit)).not.toContain('fitmeet-test');
  });

  it('redacts sensitive fields from Social Codex audit metadata', () => {
    const service = makePolicyService();

    const policy = service.buildPolicyMetadata(
      makeTask(),
      SocialAgentToolName.ShareLocation,
      {
        exactLocation: '青岛大学 3 号宿舍 401',
        nested: { phone: '15253005312', publicText: '青岛大学附近' },
      },
    );

    expect(policy).toMatchObject({
      socialCodexAudit: expect.objectContaining({
        actionType: 'reveal_precise_location',
        payload: {
          exactLocation: '[redacted]',
          nested: { phone: '[redacted]', publicText: '青岛大学附近' },
        },
      }),
    });
  });
});
