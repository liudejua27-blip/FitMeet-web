import { Injectable, Logger } from '@nestjs/common';

import { MessagesService } from '../messages/messages.service';
import { AgentActionLogService } from './agent-action-log.service';
import {
  AgentActionRiskLevel,
  AgentActionStatus,
} from './entities/agent-action-log.entity';
import { AgentTask } from './entities/agent-task.entity';
import { SceneRiskPolicyResult } from './scene-risk-policy.service';
import {
  getSocialAgentApprovalId,
  getSocialAgentRelatedActivityId,
  getSocialAgentRelatedCandidateId,
  getSocialAgentRelatedSocialRequestId,
  getSocialAgentTargetUserId,
  getSocialAgentToolInputSummary,
  getSocialAgentToolOutputSummary,
} from './social-agent-tool-audit';
import {
  getSocialAgentToolActionType,
  getSocialAgentToolRiskLevel,
  getSocialAgentToolRiskLevelForPolicy,
  shouldWriteSocialAgentActionResultInbox,
} from './social-agent-tool-policy';
import {
  SocialAgentToolCallRecord,
  SocialAgentToolName,
} from './social-agent-tool.types';

type RecordActionSideEffectInput = {
  task: AgentTask;
  toolName: SocialAgentToolName;
  input: Record<string, unknown>;
  call: SocialAgentToolCallRecord;
  policy: Record<string, unknown>;
};

type ToolAuditDetails = {
  userId: number;
  agentTaskId: number;
  toolName: SocialAgentToolName;
  inputSummary: string;
  outputSummary: string;
  riskLevel: AgentActionRiskLevel;
  requiresApproval: boolean;
  userConfirmed: boolean;
  executed: boolean;
  sceneType: string;
  approvalId: number | null;
  status: SocialAgentToolCallRecord['status'];
  error: Record<string, unknown> | null;
  createdAt: string;
};

@Injectable()
export class SocialAgentActionSideEffectService {
  private readonly logger = new Logger(SocialAgentActionSideEffectService.name);

  constructor(
    private readonly actionLogs: AgentActionLogService,
    private readonly messages: MessagesService,
  ) {}

  async record(input: RecordActionSideEffectInput): Promise<void> {
    const audit = this.buildToolAuditDetails(input);
    const actionLog = await this.actionLogs.logAgentAction({
      ownerUserId: input.task.ownerUserId,
      agentId: input.task.agentConnectionId,
      agentTaskId: input.task.id,
      actionType: getSocialAgentToolActionType(input.toolName),
      actionStatus: this.actionStatusForCall(input.call),
      eventType:
        input.call.status === 'succeeded'
          ? 'social_agent.tool.succeeded'
          : `social_agent.tool.${input.call.status}`,
      conversationId: this.string(input.call.output?.conversationId) ?? null,
      messageId:
        this.string(input.call.output?.messageId) ??
        this.string(input.call.output?.id) ??
        null,
      status: input.call.status,
      riskLevel: audit.riskLevel,
      targetUserId: getSocialAgentTargetUserId(input.input, input.call.output),
      relatedSocialRequestId: getSocialAgentRelatedSocialRequestId(
        input.input,
        input.call.output,
      ),
      relatedCandidateId: getSocialAgentRelatedCandidateId(
        input.toolName,
        input.input,
        input.call.output,
      ),
      relatedActivityId: getSocialAgentRelatedActivityId(
        input.toolName,
        input.input,
        input.call.output,
      ),
      inputSummary: audit.inputSummary,
      outputSummary: audit.outputSummary,
      payload: {
        ...audit,
        agentTaskId: input.task.id,
        stepId: input.call.stepId,
        toolCallId: input.call.id,
        toolName: input.toolName,
        permissionMode: input.task.permissionMode,
        policy: input.policy,
        userId: input.task.ownerUserId,
        input: input.input,
        output: input.call.output,
        error: input.call.error,
      },
      reason: this.string(input.call.error?.message) ?? null,
    });

    if (!actionLog) {
      this.logger.warn(
        `Action completed without agent_action_logs entry for task=${input.task.id}, tool=${input.toolName}`,
      );
    }

    if (
      shouldWriteSocialAgentActionResultInbox(input.toolName) &&
      input.task.agentConnectionId
    ) {
      try {
        await this.writeActionResultInbox(input);
      } catch (error) {
        this.logger.warn(
          `Failed to write action result inbox for task=${input.task.id}, tool=${input.toolName}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  private buildToolAuditDetails(
    input: RecordActionSideEffectInput,
  ): ToolAuditDetails {
    const scenePolicy = this.isRecord(input.policy.sceneRisk)
      ? (input.policy.sceneRisk as unknown as SceneRiskPolicyResult)
      : null;
    const pendingApproval =
      input.call.output?.pendingApproval === true ||
      input.call.output?.status === 'pending_approval';
    const simulated = input.call.output?.simulated === true;
    return {
      userId: input.task.ownerUserId,
      agentTaskId: input.task.id,
      toolName: input.toolName,
      inputSummary: getSocialAgentToolInputSummary(input.toolName, input.input),
      outputSummary: getSocialAgentToolOutputSummary(
        input.toolName,
        input.call,
      ),
      riskLevel: scenePolicy
        ? getSocialAgentToolRiskLevelForPolicy(scenePolicy.riskLevel)
        : getSocialAgentToolRiskLevel(input.toolName),
      requiresApproval:
        typeof input.policy.requiresApproval === 'boolean'
          ? input.policy.requiresApproval
          : false,
      userConfirmed: this.hasUserApproval(input.input),
      executed:
        input.call.status === 'succeeded' && !pendingApproval && !simulated,
      sceneType: scenePolicy?.sceneType ?? 'general',
      approvalId: getSocialAgentApprovalId(
        input.toolName,
        input.input,
        input.call.output,
      ),
      status: input.call.status,
      error: input.call.error,
      createdAt: input.call.completedAt,
    };
  }

  private async writeActionResultInbox(
    input: RecordActionSideEffectInput,
  ): Promise<void> {
    if (!input.task.agentConnectionId) return;

    await this.messages.createAgentInboxEvent({
      agentConnectionId: input.task.agentConnectionId,
      ownerUserId: input.task.ownerUserId,
      eventType: `agent.action.${input.call.status}`,
      conversationId: this.string(input.call.output?.conversationId) || null,
      messageId:
        this.string(input.call.output?.messageId) ||
        this.string(input.call.output?.id) ||
        null,
      requestId:
        getSocialAgentRelatedSocialRequestId(
          input.call.input,
          input.call.output,
        ) ?? null,
      candidateRecordId:
        getSocialAgentRelatedCandidateId(
          input.toolName,
          input.call.input,
          input.call.output,
        ) ?? null,
      fromUserId:
        getSocialAgentTargetUserId(input.call.input, input.call.output) ?? null,
      contentPreview:
        input.call.status === 'succeeded'
          ? `${input.toolName} completed`
          : `${input.toolName} ${input.call.status}: ${
              this.string(input.call.error?.message) ?? ''
            }`,
      unread: true,
      dedupeKey: `${input.task.agentConnectionId}:agent.action:${input.task.id}:${input.call.id}`,
      metadata: {
        agentTaskId: input.task.id,
        stepId: input.call.stepId,
        toolCallId: input.call.id,
        toolName: input.toolName,
        permissionMode: input.task.permissionMode,
        policy: input.policy,
        status: input.call.status,
        output: input.call.output,
        error: input.call.error,
      },
    });
  }

  private hasUserApproval(input: Record<string, unknown>): boolean {
    if (this.number(input.approvalId) || this.number(input.approvalRequestId)) {
      return true;
    }
    const metadata = this.isRecord(input.metadata) ? input.metadata : {};
    return (
      this.bool(input.userConfirmed) ||
      this.bool(input.confirmedByUser) ||
      this.string(metadata.confirmationSource) === 'social_agent_chat'
    );
  }

  private actionStatusForCall(
    call: SocialAgentToolCallRecord,
  ): AgentActionStatus {
    if (
      call.output?.pendingApproval === true ||
      call.output?.status === 'pending_approval'
    ) {
      return AgentActionStatus.PendingApproval;
    }
    return call.status === 'succeeded'
      ? AgentActionStatus.Executed
      : AgentActionStatus.Failed;
  }

  private string(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private number(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
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

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
