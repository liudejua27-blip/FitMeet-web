import {
  Body,
  Controller,
  Get,
  UnauthorizedException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AgentApprovalService } from './agent-approval.service';
import { AgentApprovalDispatcherService } from './agent-approval-dispatcher.service';
import { AgentActionLogService } from './agent-action-log.service';
import {
  mapApprovalToActionType,
  mapApprovalRiskLevel,
} from './approval-action-mapper';
import { AgentActionStatus } from './entities/agent-action-log.entity';
import { AgentSettingsService } from './agent-settings.service';
import { AGENT_CONNECTION_KEY } from './guards/agent-token.guard';
import { AgentOwnerOrTokenGuard } from './guards/agent-owner-or-token.guard';
import {
  CreateApprovalDto,
  UpdateAgentPermissionsDto,
} from './dto/agent-control.dto';
import { ApprovalRiskLevel } from './entities/agent-approval-request.entity';
import type { AgentConnection } from './entities/agent-connection.entity';

interface JwtReq {
  user?: { id: number };
  [AGENT_CONNECTION_KEY]?: AgentConnection;
}

/**
 * Owner-facing JWT routes for the agent permission & approval system.
 * Distinct from `/api/agent/*` token routes (those are authenticated by
 * the agent's own bearer token via AgentTokenGuard).
 *
 * Mounted at `/api/agent` (singular) under JwtAuthGuard.
 */
@Controller('agent')
@UseGuards(AgentOwnerOrTokenGuard)
export class AgentControlController {
  constructor(
    private readonly settings: AgentSettingsService,
    private readonly approvals: AgentApprovalService,
    private readonly dispatcher: AgentApprovalDispatcherService,
    private readonly actionLogs: AgentActionLogService,
  ) {}

  // ── permissions ────────────────────────────────────────────────

  /** GET /api/agent/permissions */
  @Get('permissions')
  async getPermissions(@Req() req: JwtReq) {
    const actor = this.resolveActor(req);
    return actor.agentConnectionId
      ? this.settings.getEffective(actor.userId, actor.agentConnectionId)
      : this.settings.getOrCreate(actor.userId);
  }

  /** PATCH /api/agent/permissions */
  @Patch('permissions')
  async updatePermissions(
    @Req() req: JwtReq,
    @Body() dto: UpdateAgentPermissionsDto,
  ) {
    const actor = this.resolveActor(req);
    return this.settings.update(actor.userId, dto);
  }

  // ── approvals ──────────────────────────────────────────────────

  /** GET /api/agent/approvals/pending */
  @Get('approvals/pending')
  async pending(@Req() req: JwtReq) {
    const actor = this.resolveActor(req);
    return this.approvals.getPending(actor.userId);
  }

  /**
   * POST /api/agent/approvals
   * Manual creation entry point — used by tests, by the agent SDK
   * when it wants to pre-warn the user, and by the dev console.
   */
  @Post('approvals')
  async create(@Req() req: JwtReq, @Body() dto: CreateApprovalDto) {
    const actor = this.resolveActor(req);
    const settings = await this.settings.getEffective(
      actor.userId,
      actor.agentConnectionId,
    );
    const verdict = this.approvals.classify({
      type: dto.type,
      payload: dto.payload,
      settings,
    });
    if (verdict.blocked) {
      return {
        blocked: true,
        reason: verdict.blockedReason,
        riskLevel: verdict.riskLevel,
      };
    }
    const row = await this.approvals.create({
      userId: actor.userId,
      agentConnectionId:
        actor.agentConnectionId ?? dto.agentConnectionId ?? null,
      type: dto.type,
      skillName: dto.skillName,
      payload: dto.payload,
      summary: dto.summary || verdict.summary,
      riskLevel: verdict.riskLevel as ApprovalRiskLevel,
      rationale: dto.rationale,
    });
    return {
      requiresApproval: verdict.requiresApproval,
      approvalId: row.id,
      summary: row.summary,
      riskLevel: row.riskLevel,
      reasons: verdict.reasons,
      expiresAt: row.expiresAt,
    };
  }

  /** POST /api/agent/approvals/:id/approve */
  @Post('approvals/:id/approve')
  async approve(@Req() req: JwtReq, @Param('id', ParseIntPipe) id: number) {
    const actor = this.resolveActor(req);
    const result = await this.approvals.approve(id, actor.userId, (approval) =>
      this.dispatcher.dispatch(approval),
    );
    const out = result.dispatchResult as
      | {
          ok: boolean;
          skipped?: boolean;
          result?: unknown;
          errorMessage?: string;
        }
      | undefined;
    const dispatched = out?.ok === true;
    const skipped = out?.skipped === true;
    const dispatchError = out?.errorMessage ?? result.dispatchError;
    const approval = result.approval;
    const payloadAny = (approval.payload ?? {}) as Record<string, unknown>;
    await this.actionLogs.logAgentAction({
      ownerUserId: actor.userId,
      agentId: approval.agentConnectionId ?? actor.agentConnectionId ?? null,
      agentTaskId: approval.agentTaskId,
      actionType: mapApprovalToActionType(approval),
      actionStatus: dispatchError
        ? AgentActionStatus.Failed
        : AgentActionStatus.Executed,
      riskLevel: mapApprovalRiskLevel(approval.riskLevel),
      targetUserId:
        (payloadAny.toUserId as number | undefined) ??
        (payloadAny.targetUserId as number | undefined) ??
        null,
      relatedSocialRequestId: approval.relatedSocialRequestId,
      relatedCandidateId: approval.relatedCandidateId,
      relatedActivityId: approval.relatedActivityId,
      inputSummary: approval.summary,
      outputSummary: dispatchError
        ? `dispatch_failed: ${dispatchError}`
        : skipped
          ? 'approved_no_dispatch_handler'
          : 'approved_and_dispatched',
      payload: {
        approvalId: approval.id,
        agentTaskId: approval.agentTaskId,
        approvalType: approval.type,
        dispatched,
        skipped,
      },
      reason: 'user_approved_pending_action',
    });
    return {
      ok: true,
      approvalId: id,
      status: approval.status,
      dispatched,
      skipped,
      result: out?.result,
      dispatchError,
    };
  }

  /** POST /api/agent/approvals/:id/reject */
  @Post('approvals/:id/reject')
  async reject(@Req() req: JwtReq, @Param('id', ParseIntPipe) id: number) {
    const actor = this.resolveActor(req);
    const row = await this.approvals.reject(id, actor.userId);
    const payloadAny = (row.payload ?? {}) as Record<string, unknown>;
    await this.actionLogs.logAgentAction({
      ownerUserId: actor.userId,
      agentId: row.agentConnectionId ?? actor.agentConnectionId ?? null,
      agentTaskId: row.agentTaskId,
      actionType: mapApprovalToActionType(row),
      actionStatus: AgentActionStatus.Rejected,
      riskLevel: mapApprovalRiskLevel(row.riskLevel),
      targetUserId:
        (payloadAny.toUserId as number | undefined) ??
        (payloadAny.targetUserId as number | undefined) ??
        null,
      relatedSocialRequestId: row.relatedSocialRequestId,
      relatedCandidateId: row.relatedCandidateId,
      relatedActivityId: row.relatedActivityId,
      inputSummary: row.summary,
      outputSummary: 'rejected_by_user',
      payload: {
        approvalId: row.id,
        agentTaskId: row.agentTaskId,
        approvalType: row.type,
      },
      reason: 'user_rejected_pending_action',
    });
    return { ok: true, approvalId: id, status: row.status };
  }

  /** GET /api/agent/approvals/:id */
  @Get('approvals/:id')
  async one(@Req() req: JwtReq, @Param('id', ParseIntPipe) id: number) {
    return this.approvals.getById(id, this.resolveActor(req).userId);
  }

  private resolveActor(req: JwtReq) {
    const conn = req[AGENT_CONNECTION_KEY];
    if (conn) {
      return { userId: conn.userId, agentConnectionId: conn.id };
    }
    if (req.user?.id) {
      return { userId: req.user.id, agentConnectionId: null };
    }
    throw new UnauthorizedException(
      'Missing authenticated user or agent token',
    );
  }
}
