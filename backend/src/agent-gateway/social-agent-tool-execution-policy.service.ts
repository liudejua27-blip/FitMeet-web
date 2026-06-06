import { ForbiddenException, Injectable } from '@nestjs/common';

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
  SOCIAL_AGENT_HIGH_RISK_TOOL_DAILY_LIMITS,
} from './social-agent-tool-policy';
import {
  SocialAgentToolCallRecord,
  SocialAgentToolName,
} from './social-agent-tool.types';

@Injectable()
export class SocialAgentToolExecutionPolicyService {
  constructor(
    private readonly permissions: AgentPermissionService,
    private readonly toolRegistry: FitMeetAgentToolRegistryService,
    private readonly sceneRisk: SceneRiskPolicyService,
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
    const highRisk =
      toolName === SocialAgentToolName.OfflineMeeting ||
      toolName === SocialAgentToolName.CreateActivity ||
      toolName === SocialAgentToolName.JoinActivity ||
      toolName === SocialAgentToolName.ApproveAction ||
      toolName === SocialAgentToolName.ShareLocation ||
      toolName === SocialAgentToolName.Payment ||
      sceneRisk.riskLevel === 'high' ||
      sceneRisk.riskLevel === 'critical';
    return {
      permissionMode: task.permissionMode,
      canonicalPermissionMode: sceneRisk.permissionMode,
      registryToolName: registeredTool?.name ?? null,
      category: registeredTool?.category ?? null,
      requiresApproval:
        sceneRisk.requiresConfirmation ||
        registeredTool?.requiresApproval ||
        false,
      requiresDoubleConfirmation: sceneRisk.requiresDoubleConfirmation,
      riskLevel: getSocialAgentToolRiskLevelForPolicy(sceneRisk.riskLevel),
      sceneRisk,
      highRisk,
      dailyLimit: limit,
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
        toolName === SocialAgentToolName.Payment
          ? 'create_payment_intent_only'
          : highRisk
            ? 'audit_required'
            : 'mode_gated',
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

  private safeUnknownText(value: unknown): string {
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
}
