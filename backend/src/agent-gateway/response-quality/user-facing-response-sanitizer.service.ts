import { Injectable } from '@nestjs/common';

import { AgentTaskPermissionMode } from '../entities/agent-task.entity';
import type { LifeGraphProposalDto } from '../../life-graph/dto/life-graph.dto';
import type {
  FitMeetAgentSafety,
  FitMeetAlphaCard,
} from '../fitmeet-alpha-agent.types';
import type {
  SanitizableAgentResult,
  UserFacingAgentPendingConfirmation,
  UserFacingAgentResponse,
} from '../user-facing-agent-response';
import { AgentCardAssemblerService } from './agent-card-assembler.service';
import { LightStatusMapperService } from './light-status-mapper.service';

type PendingApprovalLike = {
  id: number | string | null;
  type: string;
  actionType: string;
  summary: string;
  riskLevel: string;
  expiresAt: string | null;
};

@Injectable()
export class UserFacingResponseSanitizerService {
  constructor(
    private readonly lightStatusMapper: LightStatusMapperService,
    private readonly cardAssembler: AgentCardAssemblerService,
  ) {}

  toUserFacingAgentResponse(
    result: SanitizableAgentResult,
    permissionMode: AgentTaskPermissionMode,
  ): UserFacingAgentResponse {
    const safety = this.readSafety(result);
    const pendingConfirmations = this.readPendingConfirmations(result);

    return {
      assistantMessage: result.assistantMessage,
      lightStatus: this.lightStatusMapper.resolve(result, pendingConfirmations),
      cards: this.cardAssembler.assemble(this.readCards(result)),
      safeStatus: {
        blocked: safety?.blocked ?? false,
        level: safety?.level ?? 'low',
        boundaryNotes: safety?.boundaryNotes ?? [],
        requiredConfirmations: safety?.requiredConfirmations ?? [],
      },
      pendingConfirmations,
      ...this.readLifeGraphWritebackProposal(result),
      permissionMode,
      runtime: this.readRuntime(result),
    };
  }

  private readRuntime(
    result: SanitizableAgentResult,
  ): UserFacingAgentResponse['runtime'] {
    if (!('runtime' in result) || !result.runtime) return undefined;
    const runtime = result.runtime;
    return {
      checkpointId: this.readNumber(runtime.checkpointId),
      checkpointType: this.readText(runtime.checkpointType, ''),
      canResume: runtime.canResume === true,
      canReplay: runtime.canReplay === true,
      canFork: runtime.canFork === true,
      parentCheckpointId: this.readNumber(runtime.parentCheckpointId),
      threadId: this.readText(runtime.threadId, '') || null,
      idempotencyKey: this.readText(runtime.idempotencyKey, '') || null,
      checkpointAction: this.readCheckpointAction(runtime.checkpointAction),
      resumeCursor: this.readResumeCursor(runtime.resumeCursor),
      sourceStep: this.readSourceStep(runtime.sourceStep),
      stepScope: this.readStepScope(runtime.stepScope),
      sideEffectPolicy: this.readSideEffectPolicy(runtime.sideEffectPolicy),
    };
  }

  private readCheckpointAction(
    value: unknown,
  ): 'resume' | 'retry' | 'replay' | 'fork' | null {
    return value === 'resume' ||
      value === 'retry' ||
      value === 'replay' ||
      value === 'fork'
      ? value
      : null;
  }

  private readResumeCursor(
    value: unknown,
  ): NonNullable<UserFacingAgentResponse['runtime']>['resumeCursor'] {
    if (!this.isRecord(value)) return null;
    return {
      threadId: this.readText(value.threadId, '') || null,
      checkpointId:
        this.readNumber(value.checkpointId) ??
        (this.readText(value.checkpointId, '') || null),
      parentCheckpointId:
        this.readNumber(value.parentCheckpointId) ??
        (this.readText(value.parentCheckpointId, '') || null),
      action: this.readCheckpointAction(value.action),
      stepId: this.readText(value.stepId, '') || null,
    };
  }

  private readSourceStep(value: unknown) {
    if (!this.isRecord(value)) return null;
    const stepId = this.readText(value.stepId, '');
    if (!stepId) return null;
    return {
      stepId,
      label: this.readText(value.label, '') || null,
      toolName: this.publicToolName(this.readText(value.toolName, '')),
    };
  }

  private readStepScope(
    value: unknown,
  ): NonNullable<UserFacingAgentResponse['runtime']>['stepScope'] {
    if (!this.isRecord(value)) return null;
    const mode: 'full_checkpoint' | 'through_step' =
      value.mode === 'through_step' || value.mode === 'full_checkpoint'
        ? value.mode
        : 'full_checkpoint';
    return {
      mode,
      stepCount: this.readNumber(value.stepCount) ?? 0,
      sourceCheckpointId: this.readNumber(value.sourceCheckpointId),
    };
  }

  private readSideEffectPolicy(value: unknown) {
    if (!this.isRecord(value)) return null;
    const idempotencyKey = this.readText(value.idempotencyKey, '');
    if (!idempotencyKey) return null;
    return {
      idempotencyKey,
      sideEffectsBeforeResume: 'idempotent_only' as const,
      duplicatePolicy: 'reuse_idempotency_key' as const,
    };
  }

  private publicToolName(value: string): string | null {
    const text = value.trim().toLowerCase();
    if (!text) return null;
    if (text === 'social_match') return '匹配步骤';
    if (text === 'life_graph') return '画像步骤';
    if (text === 'meet_loop') return '约练步骤';
    if (text === 'approval_gate') return '确认步骤';
    return null;
  }

  private readSafety(
    result: SanitizableAgentResult,
  ): FitMeetAgentSafety | undefined {
    return 'safety' in result ? result.safety : undefined;
  }

  private readCards(result: SanitizableAgentResult): FitMeetAlphaCard[] {
    const cards = 'cards' in result ? (result.cards ?? []) : [];
    if (!('profileUpdateProposal' in result) || !result.profileUpdateProposal) {
      return cards;
    }
    if (cards.some((card) => card.type === 'profile_proposal')) return cards;
    return [
      ...cards,
      this.profileProposalCard(result.profileUpdateProposal, result.taskId),
    ];
  }

  private readLifeGraphWritebackProposal(
    result: SanitizableAgentResult,
  ): { lifeGraphWritebackProposal?: Record<string, unknown> } {
    if (
      !('lifeGraphWritebackProposal' in result) ||
      !this.isRecord(result.lifeGraphWritebackProposal)
    ) {
      return {};
    }
    const proposal = result.lifeGraphWritebackProposal;
    const proposedSignals = Array.isArray(proposal.proposedSignals)
      ? proposal.proposedSignals
          .filter((signal) => this.isRecord(signal))
          .map((signal) => ({
            field: this.readText(signal.field, ''),
            label: this.readText(signal.label, ''),
            value: this.readText(signal.value, ''),
            confidence:
              typeof signal.confidence === 'number'
                ? signal.confidence
                : undefined,
          }))
          .filter((signal) => signal.field && signal.label && signal.value)
      : [];
    if (proposedSignals.length === 0) return {};
    return {
      lifeGraphWritebackProposal: {
        schemaVersion: this.readText(
          proposal.schemaVersion,
          'fitmeet.life_graph.writeback.v1',
        ),
        source: this.readText(proposal.source, 'counterpart_reply'),
        status: this.readText(proposal.status, 'pending_user_confirmation'),
        sensitivityLevel: this.readText(proposal.sensitivityLevel, 'medium'),
        taskId: this.readNumber(proposal.taskId),
        candidateUserId: this.readNumber(proposal.candidateUserId),
        conversationId: this.readText(proposal.conversationId, '') || null,
        messageId: this.readText(proposal.messageId, '') || null,
        proposedSignals,
        confirmationBoundary: this.readText(
          proposal.confirmationBoundary,
          '这只是画像更新建议，确认前不会写入长期 Life Graph。',
        ),
        privacyBoundary: this.readText(
          proposal.privacyBoundary,
          '不保存对方私聊原文，只保存脱敏后的互动信号。',
        ),
        revokeHint: this.readText(
          proposal.revokeHint,
          '确认后仍可在 Life Graph 中撤回这次影响。',
        ),
      },
    };
  }

  private profileProposalCard(
    proposal: LifeGraphProposalDto,
    taskId: number | null,
  ): FitMeetAlphaCard {
    const resolvedTaskId = taskId ?? proposal.taskId;
    const fieldIds = proposal.proposedFields
      .map((field) => this.readText(field.proposalFieldId, ''))
      .filter(Boolean);
    const hasConflicts = proposal.proposedFields.some(
      (field) =>
        field.conflict === true ||
        field.status === 'conflict' ||
        field.status === 'revoked_conflict',
    );
    const conflicts = proposal.proposedFields
      .filter(
        (field) =>
          field.conflict === true ||
          field.status === 'conflict' ||
          field.status === 'revoked_conflict',
      )
      .map((field) => {
        const oldValue = this.displayValue(field.oldValue);
        const nextValue = this.displayValue(field.fieldValue);
        return `${field.category}.${field.fieldKey}: ${oldValue} -> ${nextValue}`;
      });
    const sourceSignals = proposal.proposedFields
      .map((field) => this.readText(field.reason, ''))
      .filter(Boolean);
    return {
      id: `life_graph_proposal:${proposal.proposalId}`,
      type: 'profile_proposal',
      title: '建议更新 Life Graph',
      body:
        proposal.aiSummary ||
        '我识别到一些可以用于后续推荐的画像信息，请确认是否保存。',
      status: 'waiting_confirmation',
      data: {
        taskId: resolvedTaskId,
        proposalId: proposal.proposalId,
        proposedFields: proposal.proposedFields.map(
          (field) =>
            `${field.category}.${field.fieldKey}: ${this.displayValue(
              field.fieldValue,
            )}`,
        ),
        fields: proposal.proposedFields,
        diff: {
          title: '画像更新建议',
          description: hasConflicts
            ? '这条记忆和旧记录存在差异，只有你确认后才会覆盖长期画像。'
            : '只在你确认后写入长期 Life Graph。',
          current: conflicts.length ? conflicts.join('；') : '暂无明确冲突',
          proposed: proposal.aiSummary || '等待你确认后更新',
          conflicts,
          sensitivityLevel: hasConflicts ? 'medium' : 'low',
          confirmationBoundary: hasConflicts
            ? '确认保存表示你允许这次提案覆盖冲突的旧画像；拒绝则不会写入。'
            : '确认前不会写入长期 Life Graph。',
          privacyBoundary: '仅保存脱敏画像偏好，不保存私聊原文或精确敏感信息。',
          sourceSignals,
        },
        conflicts,
        sensitivityLevel: hasConflicts ? 'medium' : 'low',
        confirmationBoundary: hasConflicts
          ? '确认保存表示你允许这次提案覆盖冲突的旧画像；拒绝则不会写入。'
          : '确认前不会写入长期 Life Graph。',
        privacyBoundary: '仅保存脱敏画像偏好，不保存私聊原文或精确敏感信息。',
        sourceSignals,
        revokeHint: '确认后仍可在 Life Graph 中查看、纠正或撤回。',
        confirmationRequired: proposal.confirmationRequired,
        missingFields: proposal.missingFields,
      },
      actions: [
        {
          id: `life_graph_accept:${proposal.proposalId}`,
          label: '确认保存',
          action: 'confirm_profile_update',
          schemaAction: 'life_graph.accept_update',
          loopStage: 'life_graph_updated',
          requiresConfirmation: true,
          payload: {
            taskId: resolvedTaskId,
            proposalId: proposal.proposalId,
            approvalRequired: true,
            checkpointRequired: true,
            resumeMode: 'resume_after_approval',
            riskLevel: hasConflicts ? 'medium' : 'low',
            ...(fieldIds.length ? { fieldIds } : {}),
            ...(hasConflicts ? { allowConflicts: true } : {}),
          },
        },
        {
          id: `life_graph_reject:${proposal.proposalId}`,
          label: '暂不保存',
          action: 'refine_request',
          schemaAction: 'life_graph.reject_update',
          loopStage: 'life_graph_updated',
          requiresConfirmation: false,
          payload: {
            taskId: resolvedTaskId,
            proposalId: proposal.proposalId,
            checkpointRequired: true,
            resumeMode: 'resume_after_rejection',
            ...(fieldIds.length ? { fieldIds } : {}),
          },
        },
      ],
    };
  }

  private displayValue(value: unknown): string {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.readText(item, ''))
        .filter(Boolean)
        .join('、');
    }
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return String(value);
    }
    return '已识别';
  }

  private readPendingConfirmations(
    result: SanitizableAgentResult,
  ): UserFacingAgentPendingConfirmation[] {
    if ('pendingApproval' in result && result.pendingApproval) {
      return [this.fromPendingApproval(result.pendingApproval)];
    }

    if ('approvalRequiredActions' in result) {
      return result.approvalRequiredActions.map((action) =>
        this.fromApprovalAction(action),
      );
    }

    return [];
  }

  private fromPendingApproval(
    approval: PendingApprovalLike,
  ): UserFacingAgentPendingConfirmation {
    return {
      id: approval.id,
      type: approval.type,
      actionType: approval.actionType,
      summary: approval.summary,
      riskLevel: approval.riskLevel,
      expiresAt: approval.expiresAt,
    };
  }

  private fromApprovalAction(
    action: Record<string, unknown>,
  ): UserFacingAgentPendingConfirmation {
    return {
      id: this.readPrimitive(action.id) ?? null,
      type: this.readText(
        action.type,
        this.readText(action.actionType, 'confirmation'),
      ),
      actionType: this.readText(
        action.actionType,
        this.readText(action.type, 'confirmation'),
      ),
      summary: this.readText(
        action.summary,
        this.readText(action.label, '等待你确认后再继续'),
      ),
      riskLevel: this.readText(
        action.riskLevel,
        this.readText(action.risk, 'medium'),
      ),
      expiresAt: typeof action.expiresAt === 'string' ? action.expiresAt : null,
    };
  }

  private readPrimitive(value: unknown): string | number | null {
    return typeof value === 'string' || typeof value === 'number'
      ? value
      : null;
  }

  private readNumber(value: unknown): number | null {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
  }

  private readText(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value : fallback;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
