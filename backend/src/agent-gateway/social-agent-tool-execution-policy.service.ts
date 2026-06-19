import { createHash } from 'crypto';

import { ForbiddenException, Injectable, Optional } from '@nestjs/common';

import { AgentSelfImproveService } from './agent-self-improve.service';
import { AgentPermissionService } from './agent-permission.service';
import {
  AgentTask,
  AgentTaskPermissionMode,
} from './entities/agent-task.entity';
import { FitMeetAgentToolRegistryService } from './fitmeet-agent-tool-registry.service';
import { SceneRiskPolicyService } from './scene-risk-policy.service';
import {
  getSocialAgentPermissionActionForTool,
  getSocialAgentToolRiskLevelForPolicy,
  getSocialAgentToolSceneActionType,
  requiresMandatorySocialAgentApproval,
  SOCIAL_AGENT_HIGH_RISK_TOOL_DAILY_LIMITS,
} from './social-agent-tool-policy';
import {
  SocialAgentToolCallRecord,
  SocialAgentToolName,
} from './social-agent-tool.types';
import { SocialCodexRuntimePolicyService } from './social-codex-runtime-policy.service';

@Injectable()
export class SocialAgentToolExecutionPolicyService {
  constructor(
    private readonly permissions: AgentPermissionService,
    private readonly toolRegistry: FitMeetAgentToolRegistryService,
    private readonly sceneRisk: SceneRiskPolicyService,
    @Optional()
    private readonly selfImprove?: AgentSelfImproveService,
    @Optional()
    private readonly socialCodex?: SocialCodexRuntimePolicyService,
  ) {}

  assertToolAllowed(input: {
    mode: AgentTaskPermissionMode | string;
    step: Record<string, unknown>;
    toolName: SocialAgentToolName;
  }): void {
    const registeredTool = this.toolRegistry.getToolByExecutorName(
      input.toolName,
    );
    const registryMode =
      input.mode === 'open' ||
      input.mode === 'lab' ||
      input.mode === 'manual_confirm'
        ? AgentTaskPermissionMode.LimitedAuto
        : (input.mode as AgentTaskPermissionMode);
    if (
      registeredTool &&
      !registeredTool.permissionMode.includes(registryMode)
    ) {
      throw new ForbiddenException(
        `Tool ${input.toolName} is not registered for permission mode ${input.mode}`,
      );
    }

    const action =
      getSocialAgentPermissionActionForTool(input.mode, input.toolName) ??
      this.permissions.normalizeAction(
        this.string(input.step.action ?? input.step.actionType) ?? '',
      );
    if (!action) return;
    if (!this.permissions.canExecute(input.mode as never, action)) {
      throw new ForbiddenException(
        `Tool ${input.toolName} requires action ${action}, not allowed in mode ${input.mode}`,
      );
    }
  }

  assertHighRiskFrequencyLimit(
    task: AgentTask,
    toolName: SocialAgentToolName,
  ): void {
    const limit = SOCIAL_AGENT_HIGH_RISK_TOOL_DAILY_LIMITS[toolName];
    if (!limit) return;

    const since = Date.now() - 24 * 60 * 60 * 1000;
    const recentSucceededCalls = (task.toolCalls ?? []).filter((call) => {
      const typedCall = call as Partial<SocialAgentToolCallRecord>;
      if (typedCall.toolName !== toolName || typedCall.status !== 'succeeded') {
        return false;
      }
      const startedAt =
        typeof typedCall.startedAt === 'string'
          ? Date.parse(typedCall.startedAt)
          : NaN;
      return Number.isFinite(startedAt) && startedAt >= since;
    });

    if (recentSucceededCalls.length >= limit) {
      throw new ForbiddenException(
        `daily_high_risk_tool_limit_exceeded: ${toolName} limit=${limit}`,
      );
    }
  }

  buildPolicyMetadata(
    task: AgentTask,
    toolName: SocialAgentToolName,
    input: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const limit = SOCIAL_AGENT_HIGH_RISK_TOOL_DAILY_LIMITS[toolName] ?? null;
    const registeredTool = this.toolRegistry.getToolByExecutorName(toolName);
    const sceneRisk = this.sceneRisk.evaluate({
      sceneType: this.string(
        input.sceneType ?? input.activityType ?? input.type,
      ),
      actionType: getSocialAgentToolSceneActionType(toolName),
      text: `${task.goal ?? ''} ${task.title ?? ''} ${this.safeUnknownText(input)}`,
      permissionMode: task.permissionMode,
      involvesMoney: this.bool(
        input.involvesMoney ?? input.hasMoney ?? input.money,
      ),
      preciseLocation: this.bool(
        input.preciseLocation ??
          input.sharePreciseLocation ??
          input.exactLocation,
      ),
    });
    const mandatoryApproval = requiresMandatorySocialAgentApproval(
      toolName,
      input,
    );
    const socialCodexDecision = this.socialCodex?.evaluate({
      toolName,
      payload: input,
      userConfirmed: this.hasApprovalCredential(input),
    });
    const highRisk =
      mandatoryApproval ||
      socialCodexDecision?.riskLevel === 'high' ||
      socialCodexDecision?.riskLevel === 'blocked' ||
      toolName === SocialAgentToolName.OfflineMeeting ||
      toolName === SocialAgentToolName.CreateActivity ||
      toolName === SocialAgentToolName.JoinActivity ||
      toolName === SocialAgentToolName.ApproveAction ||
      toolName === SocialAgentToolName.ShareLocation ||
      toolName === SocialAgentToolName.Payment ||
      sceneRisk.riskLevel === 'high' ||
      sceneRisk.riskLevel === 'critical';
    const idempotencyKey = this.buildSocialCodexIdempotencyKey({
      task,
      toolName,
      input,
      scope: socialCodexDecision?.idempotencyKeyScope ?? null,
      highRisk,
    });
    return {
      permissionMode: task.permissionMode,
      canonicalPermissionMode: sceneRisk.permissionMode,
      registryToolName: registeredTool?.name ?? null,
      category: registeredTool?.category ?? null,
      requiresApproval:
        mandatoryApproval ||
        socialCodexDecision?.requiresApproval === true ||
        sceneRisk.requiresConfirmation ||
        registeredTool?.requiresApproval ||
        false,
      dryRunRequired: socialCodexDecision?.dryRunRequired === true,
      auditRequired:
        socialCodexDecision?.auditRequired === true ||
        mandatoryApproval ||
        highRisk,
      mandatoryApproval,
      requiresDoubleConfirmation: sceneRisk.requiresDoubleConfirmation,
      riskLevel: getSocialAgentToolRiskLevelForPolicy(sceneRisk.riskLevel),
      sceneRisk,
      highRisk,
      socialCodex: socialCodexDecision
        ? {
            actionType: socialCodexDecision.actionType,
            mode: socialCodexDecision.mode,
            riskLevel: socialCodexDecision.riskLevel,
            reasons: socialCodexDecision.reasons,
            requiresApproval: socialCodexDecision.requiresApproval,
            dryRunRequired: socialCodexDecision.dryRunRequired,
            auditRequired: socialCodexDecision.auditRequired,
            sandbox: socialCodexDecision.sandbox,
            dryRunPreview: socialCodexDecision.dryRunPreview,
            idempotencyKeyScope: socialCodexDecision.idempotencyKeyScope,
            idempotencyKey,
          }
        : null,
      socialCodexAudit: socialCodexDecision?.auditRequired
        ? this.socialCodex?.buildAuditPayload({
            userId: task.ownerUserId,
            taskId: task.id,
            decision: socialCodexDecision,
            payload: input,
          }) ?? null
        : null,
      dailyLimit: limit,
      idempotencyKey,
      idempotency:
        toolName === SocialAgentToolName.Payment
          ? 'paymentIntentKeys'
          : toolName === SocialAgentToolName.OfflineMeeting ||
              toolName === SocialAgentToolName.InviteActivity ||
              toolName === SocialAgentToolName.CreateActivity ||
              toolName === SocialAgentToolName.JoinActivity
            ? 'activityInviteKeys'
            : toolName === SocialAgentToolName.SendMessage ||
                toolName === SocialAgentToolName.SendMessageToCandidate ||
                toolName === SocialAgentToolName.ReplyMessage
              ? 'sentMessageKeys'
              : null,
      executionContract:
        socialCodexDecision?.mode === 'blocked'
          ? 'blocked_by_social_codex_sandbox'
          : toolName === SocialAgentToolName.Payment
            ? 'create_payment_intent_only'
            : socialCodexDecision?.mode === 'approval_required'
              ? 'approval_required_dry_run_audit'
              : socialCodexDecision?.mode === 'dry_run'
                ? 'dry_run_required'
                : highRisk
                  ? 'audit_required'
                  : 'mode_gated',
    };
  }

  private buildSocialCodexIdempotencyKey(input: {
    task: AgentTask;
    toolName: SocialAgentToolName;
    input: Record<string, unknown>;
    scope: string | null;
    highRisk: boolean;
  }): string | null {
    if (!input.scope && !input.highRisk) return null;
    const payloadHash = createHash('sha256')
      .update(this.stableJson(input.input))
      .digest('hex')
      .slice(0, 18);
    return [
      input.scope ?? 'social_codex:high_risk',
      `task:${input.task.id}`,
      `tool:${input.toolName}`,
      payloadHash,
    ].join(':');
  }

  private stableJson(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableJson(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => `${JSON.stringify(key)}:${this.stableJson(item)}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }

  async buildPolicyMetadataWithPatches(
    task: AgentTask,
    toolName: SocialAgentToolName,
    input: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const base = this.buildPolicyMetadata(task, toolName, input);
    if (!this.selfImprove) return base;
    const [toolPatches, safetyPatches] = await Promise.all([
      this.selfImprove.publishedToolPolicyPatches(toolName).catch(() => []),
      this.selfImprove
        .publishedSafetyPolicyPatches('scene_risk')
        .catch(() => []),
    ]);
    let policy = base;
    for (const patch of safetyPatches) {
      policy = this.applySafetyPolicyPatch(policy, patch);
    }
    for (const patch of toolPatches) {
      policy = this.applyToolPolicyPatch(policy, patch);
    }
    return policy;
  }

  private applyToolPolicyPatch(
    policy: Record<string, unknown>,
    patch: Record<string, unknown>,
  ): Record<string, unknown> {
    const next = { ...policy };
    if (typeof patch.forceRequiresApproval === 'boolean') {
      next.requiresApproval = patch.forceRequiresApproval;
    }
    if (typeof patch.requiresApproval === 'boolean') {
      next.requiresApproval = patch.requiresApproval;
    }
    if (this.isPolicyRiskLevel(patch.forceRiskLevel)) {
      next.riskLevel = patch.forceRiskLevel;
      next.highRisk = patch.forceRiskLevel === 'high';
    }
    if (typeof patch.executionContract === 'string') {
      next.executionContract = patch.executionContract;
    }
    if (
      typeof patch.dailyLimit === 'number' &&
      Number.isFinite(patch.dailyLimit)
    ) {
      next.dailyLimit = Math.max(0, Math.floor(patch.dailyLimit));
    }
    if (patch.blocked === true) {
      next.executionContract = 'blocked_by_self_improve_policy';
      next.requiresApproval = true;
      next.highRisk = true;
    }
    next.selfImproveToolPolicyApplied = true;
    return next;
  }

  private applySafetyPolicyPatch(
    policy: Record<string, unknown>,
    patch: Record<string, unknown>,
  ): Record<string, unknown> {
    const sceneRisk = this.asRecord(policy.sceneRisk);
    const nextSceneRisk = { ...sceneRisk };
    if (this.isSceneRiskLevel(patch.forceMinRiskLevel)) {
      nextSceneRisk.riskLevel = this.maxSceneRisk(
        this.string(sceneRisk.riskLevel) ?? 'low',
        patch.forceMinRiskLevel,
      );
      policy = {
        ...policy,
        riskLevel:
          nextSceneRisk.riskLevel === 'critical'
            ? 'high'
            : nextSceneRisk.riskLevel,
        highRisk:
          nextSceneRisk.riskLevel === 'high' ||
          nextSceneRisk.riskLevel === 'critical' ||
          policy.highRisk === true,
      };
    } else {
      policy = { ...policy };
    }
    if (typeof patch.requireConfirmation === 'boolean') {
      nextSceneRisk.requiresConfirmation =
        patch.requireConfirmation ||
        nextSceneRisk.requiresConfirmation === true;
      policy.requiresApproval =
        patch.requireConfirmation || policy.requiresApproval === true;
    }
    if (typeof patch.requireDoubleConfirmation === 'boolean') {
      nextSceneRisk.requiresDoubleConfirmation =
        patch.requireDoubleConfirmation ||
        nextSceneRisk.requiresDoubleConfirmation === true;
      policy.requiresDoubleConfirmation =
        patch.requireDoubleConfirmation ||
        policy.requiresDoubleConfirmation === true;
    }
    nextSceneRisk.blockedActions = [
      ...new Set([
        ...this.stringList(sceneRisk.blockedActions),
        ...this.stringList(patch.blockedActions),
      ]),
    ];
    nextSceneRisk.safetyPrompts = [
      ...new Set([
        ...this.stringList(sceneRisk.safetyPrompts),
        ...this.stringList(patch.safetyPrompts),
        ...(typeof patch.safetyPrompt === 'string' && patch.safetyPrompt.trim()
          ? [patch.safetyPrompt.trim()]
          : []),
      ]),
    ];
    return {
      ...policy,
      sceneRisk: nextSceneRisk,
      selfImproveSafetyPolicyApplied: true,
    };
  }

  private string(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private bool(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
      if (['false', '0', 'no', 'n'].includes(normalized)) return false;
    }
    return undefined;
  }

  private hasApprovalCredential(input: Record<string, unknown>): boolean {
    return (
      this.bool(
        input.userConfirmed ??
          input.confirmed ??
          input.approved ??
          input.approvalConfirmed,
      ) === true ||
      this.hasFiniteNumber(input.approvalId) ||
      this.hasFiniteNumber(input.approvalRequestId)
    );
  }

  private hasFiniteNumber(value: unknown): boolean {
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'string' && value.trim()) {
      return Number.isFinite(Number(value));
    }
    return false;
  }

  private safeUnknownText(value: unknown): string {
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private stringList(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private isPolicyRiskLevel(
    value: unknown,
  ): value is 'low' | 'medium' | 'high' {
    return value === 'low' || value === 'medium' || value === 'high';
  }

  private isSceneRiskLevel(
    value: unknown,
  ): value is 'low' | 'medium' | 'high' | 'critical' {
    return (
      value === 'low' ||
      value === 'medium' ||
      value === 'high' ||
      value === 'critical'
    );
  }

  private maxSceneRisk(
    left: string,
    right: 'low' | 'medium' | 'high' | 'critical',
  ): 'low' | 'medium' | 'high' | 'critical' {
    const order = ['low', 'medium', 'high', 'critical'] as const;
    const normalizedLeft = this.isSceneRiskLevel(left) ? left : 'low';
    return order.indexOf(normalizedLeft) >= order.indexOf(right)
      ? normalizedLeft
      : right;
  }
}
