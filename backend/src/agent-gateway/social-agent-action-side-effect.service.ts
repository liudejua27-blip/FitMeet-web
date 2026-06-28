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
  shouldWriteSocialAgentActionResultMessageEvent,
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
  reversible: boolean;
  compensationAction: string | null;
  compensationStatus: 'not_needed' | 'available' | 'manual_review_required';
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
        input: this.redactForAudit(input.input),
        output: this.redactForAudit(input.call.output),
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
      shouldWriteSocialAgentActionResultMessageEvent(input.toolName) &&
      input.task.agentConnectionId
    ) {
      try {
        await this.writeActionResultMessageEvent(input);
      } catch (error) {
        this.logger.warn(
          `Failed to write action result message center for task=${input.task.id}, tool=${input.toolName}: ${
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
      inputSummary: this.redactSummaryForAudit(
        getSocialAgentToolInputSummary(input.toolName, input.input),
      ),
      outputSummary: this.redactSummaryForAudit(
        getSocialAgentToolOutputSummary(input.toolName, input.call),
      ),
      riskLevel: scenePolicy
        ? input.policy.mandatoryApproval === true
          ? AgentActionRiskLevel.High
          : getSocialAgentToolRiskLevelForPolicy(scenePolicy.riskLevel)
        : getSocialAgentToolRiskLevel(input.toolName),
      requiresApproval:
        typeof input.policy.requiresApproval === 'boolean'
          ? input.policy.requiresApproval
          : false,
      userConfirmed: this.hasUserApproval(input.input),
      executed:
        input.call.status === 'succeeded' && !pendingApproval && !simulated,
      reversible: this.isReversible(input.toolName, pendingApproval, simulated),
      compensationAction: this.compensationActionForTool(input.toolName),
      compensationStatus: this.compensationStatus(
        input.call,
        input.toolName,
        pendingApproval,
        simulated,
      ),
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

  private async writeActionResultMessageEvent(
    input: RecordActionSideEffectInput,
  ): Promise<void> {
    if (!input.task.agentConnectionId) return;

    await this.messages.createAgentMessageEvent({
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
        output: this.redactForAudit(input.call.output),
        error: input.call.error,
      },
    });
  }

  private hasUserApproval(input: Record<string, unknown>): boolean {
    return Boolean(
      this.number(input.approvalId) || this.number(input.approvalRequestId),
    );
  }

  private isReversible(
    toolName: SocialAgentToolName,
    pendingApproval: boolean,
    simulated: boolean,
  ): boolean {
    if (pendingApproval || simulated) return true;
    return [
      SocialAgentToolName.PublishSocialRequest,
      SocialAgentToolName.CreateSocialRequest,
      SocialAgentToolName.CreateActivity,
      SocialAgentToolName.InviteActivity,
      SocialAgentToolName.JoinActivity,
      SocialAgentToolName.SaveCandidate,
      SocialAgentToolName.UpdateLongTermMemory,
    ].includes(toolName);
  }

  private compensationActionForTool(
    toolName: SocialAgentToolName,
  ): string | null {
    switch (toolName) {
      case SocialAgentToolName.PublishSocialRequest:
      case SocialAgentToolName.CreateSocialRequest:
        return 'cancel_social_request_or_unpublish_public_intent';
      case SocialAgentToolName.CreateActivity:
      case SocialAgentToolName.InviteActivity:
      case SocialAgentToolName.JoinActivity:
      case SocialAgentToolName.OfflineMeeting:
        return 'cancel_or_update_activity_and_notify_participants';
      case SocialAgentToolName.SendMessage:
      case SocialAgentToolName.SendMessageToCandidate:
      case SocialAgentToolName.ReplyMessage:
        return 'send_correction_or_retraction_message';
      case SocialAgentToolName.ConnectCandidate:
      case SocialAgentToolName.AddFriend:
        return 'remove_connection_or_mark_contact_request_cancelled';
      case SocialAgentToolName.ShareLocation:
        return 'stop_location_sharing_and_notify_counterpart';
      case SocialAgentToolName.Payment:
        return 'cancel_payment_intent_or_refund_via_manual_review';
      case SocialAgentToolName.UpdateAiProfileFromAnswers:
      case SocialAgentToolName.UpdateProfileFromAgentContext:
      case SocialAgentToolName.UpdateLongTermMemory:
        return 'revert_profile_or_life_graph_field_from_audit';
      default:
        return null;
    }
  }

  private compensationStatus(
    call: SocialAgentToolCallRecord,
    toolName: SocialAgentToolName,
    pendingApproval: boolean,
    simulated: boolean,
  ): 'not_needed' | 'available' | 'manual_review_required' {
    if (pendingApproval || simulated) return 'not_needed';
    if (call.status !== 'succeeded') return 'manual_review_required';
    return this.isReversible(toolName, false, false)
      ? 'available'
      : 'manual_review_required';
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

  private redactForAudit(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.redactForAudit(item));
    }
    if (!this.isRecord(value)) {
      return this.redactPrimitiveForAudit('', value);
    }
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = this.redactPrimitiveForAudit(key, this.redactForAudit(item));
    }
    return out;
  }

  private redactPrimitiveForAudit(key: string, value: unknown): unknown {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey === 'lat' ||
      normalizedKey === 'lng' ||
      normalizedKey === 'longitude' ||
      normalizedKey === 'latitude' ||
      /phone|mobile|wechat|weixin|contact|email|address|exactlocation|preciselocation/.test(
        normalizedKey,
      )
    ) {
      return '[redacted]';
    }
    if (typeof value !== 'string') return value;
    if (
      /1[3-9]\d{9}/.test(value) ||
      /微信|wechat|weixin|手机号|电话|联系方式|精确定位|实时定位|宿舍|门牌|房间|楼栋/i.test(
        value,
      ) ||
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)
    ) {
      return '[redacted]';
    }
    return value;
  }

  private redactSummaryForAudit(value: string): string {
    const redacted = this.redactPrimitiveForAudit('', value);
    return typeof redacted === 'string' ? redacted : '[redacted]';
  }
}
