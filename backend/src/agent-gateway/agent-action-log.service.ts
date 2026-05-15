import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AgentActionLog,
  AgentActionRiskLevel,
  AgentActionStatus,
  AgentActionType,
} from './entities/agent-action-log.entity';

/**
 * Input passed to {@link AgentActionLogService.logAgentAction}.
 *
 * Important: `ownerUserId` MUST be derived by the caller from the JWT or
 * Agent Token context. Callers must never accept it from request bodies.
 */
export interface LogAgentActionInput {
  ownerUserId: number;
  actionType: AgentActionType;
  actionStatus?: AgentActionStatus;
  riskLevel?: AgentActionRiskLevel;
  agentId?: number | null;
  targetUserId?: number | null;
  targetAgentId?: number | null;
  relatedSocialRequestId?: number | null;
  relatedCandidateId?: number | null;
  relatedActivityId?: number | null;
  inputSummary?: string | null;
  outputSummary?: string | null;
  payload?: Record<string, unknown>;
  reason?: string | null;
}

export interface AgentActionLogQuery {
  ownerUserId: number;
  agentId?: number;
  actionType?: AgentActionType;
  actionStatus?: AgentActionStatus;
  page?: number;
  limit?: number;
}

@Injectable()
export class AgentActionLogService {
  private readonly logger = new Logger(AgentActionLogService.name);

  constructor(
    @InjectRepository(AgentActionLog)
    private readonly repo: Repository<AgentActionLog>,
  ) {}

  /**
   * Write a single audit entry for an agent action.
   *
   * Best-effort: failures here must never block the underlying business
   * action. We catch and log so callers can `await` without try/catch.
   */
  async logAgentAction(input: LogAgentActionInput): Promise<AgentActionLog | null> {
    try {
      const row = this.repo.create({
        ownerUserId: input.ownerUserId,
        actionType: input.actionType,
        actionStatus: input.actionStatus ?? AgentActionStatus.Executed,
        riskLevel: input.riskLevel ?? AgentActionRiskLevel.Low,
        agentId: input.agentId ?? null,
        targetUserId: input.targetUserId ?? null,
        targetAgentId: input.targetAgentId ?? null,
        relatedSocialRequestId: input.relatedSocialRequestId ?? null,
        relatedCandidateId: input.relatedCandidateId ?? null,
        relatedActivityId: input.relatedActivityId ?? null,
        inputSummary: truncate(input.inputSummary ?? null, 500),
        outputSummary: truncate(input.outputSummary ?? null, 500),
        payload: input.payload ?? {},
        reason: input.reason ?? null,
      });
      return await this.repo.save(row);
    } catch (err) {
      this.logger.error(
        `Failed to write agent action log (owner=${input.ownerUserId}, type=${input.actionType}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  async list(query: AgentActionLogQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    const where: Record<string, unknown> = { ownerUserId: query.ownerUserId };
    if (query.agentId !== undefined) where.agentId = query.agentId;
    if (query.actionType !== undefined) where.actionType = query.actionType;
    if (query.actionStatus !== undefined) where.actionStatus = query.actionStatus;

    const [items, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async getById(ownerUserId: number, id: number): Promise<AgentActionLog> {
    const row = await this.repo.findOne({ where: { id, ownerUserId } });
    if (!row) {
      throw new NotFoundException('Agent action log not found');
    }
    return row;
  }
}

function truncate(value: string | null, max: number): string | null {
  if (value == null) return null;
  return value.length > max ? value.slice(0, max) : value;
}
