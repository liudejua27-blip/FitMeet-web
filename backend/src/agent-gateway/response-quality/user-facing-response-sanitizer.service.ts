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
      permissionMode,
    };
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

  private profileProposalCard(
    proposal: LifeGraphProposalDto,
    taskId: number | null,
  ): FitMeetAlphaCard {
    const resolvedTaskId = taskId ?? proposal.taskId;
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

  private readText(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value : fallback;
  }
}
