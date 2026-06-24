import {
  BadRequestException,
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
import type { AgentConnection } from './entities/agent-connection.entity';
import { AgentRunCheckpointService } from './agent-run-checkpoint.service';
import type { AgentRunCheckpointAction } from './agent-run-checkpoint.service';
import {
  AgentRunCheckpointStatus,
  type AgentRunCheckpoint,
} from './entities/agent-run-checkpoint.entity';

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
    private readonly checkpoints: AgentRunCheckpointService,
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

  /** GET /api/agent/owner/pending-approvals */
  @Get('owner/pending-approvals')
  async ownerPending(@Req() req: JwtReq) {
    return this.pending(req);
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
      riskLevel: verdict.riskLevel,
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
    const payloadAny = approval.payload ?? {};
    let resume: Awaited<ReturnType<AgentRunCheckpointService['markDecision']>> =
      null;
    let checkpointError: string | undefined;
    try {
      resume = await this.checkpoints.markDecision(approval, 'approved');
    } catch (err) {
      checkpointError =
        err instanceof Error ? err.message : 'Checkpoint resume failed';
    }
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
        schemaAction: this.text(payloadAny.schemaAction),
        sideEffect: this.text(payloadAny.sideEffect),
        idempotencyKey: this.text(payloadAny.idempotencyKey),
        resumeMode: this.text(payloadAny.resumeMode),
        checkpointRequired: payloadAny.checkpointRequired === true,
        sourceStepId: this.text(payloadAny.sourceStepId),
        resumeCursor: resume?.resumeCursor ?? null,
        resumeCheckpointId: resume?.checkpointId ?? null,
        resumeIdempotencyKey: resume?.idempotencyKey ?? null,
        checkpointError,
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
      resume,
      checkpointError,
    };
  }

  /** POST /api/agent/owner/approvals/:id/approve */
  @Post('owner/approvals/:id/approve')
  async approveOwner(
    @Req() req: JwtReq,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.approve(req, id);
  }

  /** POST /api/agent/approvals/:id/reject */
  @Post('approvals/:id/reject')
  async reject(@Req() req: JwtReq, @Param('id', ParseIntPipe) id: number) {
    const actor = this.resolveActor(req);
    const row = await this.approvals.reject(id, actor.userId);
    const payloadAny = row.payload ?? {};
    let resume: Awaited<ReturnType<AgentRunCheckpointService['markDecision']>> =
      null;
    let checkpointError: string | undefined;
    try {
      resume = await this.checkpoints.markDecision(row, 'rejected');
    } catch (err) {
      checkpointError =
        err instanceof Error ? err.message : 'Checkpoint resume failed';
    }
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
        schemaAction: this.text(payloadAny.schemaAction),
        sideEffect: this.text(payloadAny.sideEffect),
        idempotencyKey: this.text(payloadAny.idempotencyKey),
        resumeMode: this.text(payloadAny.resumeMode),
        checkpointRequired: payloadAny.checkpointRequired === true,
        sourceStepId: this.text(payloadAny.sourceStepId),
        resumeCursor: resume?.resumeCursor ?? null,
        resumeCheckpointId: resume?.checkpointId ?? null,
        resumeIdempotencyKey: resume?.idempotencyKey ?? null,
        checkpointError,
      },
      reason: 'user_rejected_pending_action',
    });
    return {
      ok: true,
      approvalId: id,
      status: row.status,
      resume,
      checkpointError,
    };
  }

  /** POST /api/agent/owner/approvals/:id/reject */
  @Post('owner/approvals/:id/reject')
  async rejectOwner(@Req() req: JwtReq, @Param('id', ParseIntPipe) id: number) {
    return this.reject(req, id);
  }

  /** GET /api/agent/approvals/:id */
  @Get('approvals/:id')
  async one(@Req() req: JwtReq, @Param('id', ParseIntPipe) id: number) {
    return this.approvals.getById(id, this.resolveActor(req).userId);
  }

  /** GET /api/agent/checkpoints/tasks/:taskId/latest */
  @Get('checkpoints/tasks/:taskId/latest')
  async latestCheckpointForTask(
    @Req() req: JwtReq,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    const actor = this.resolveActor(req);
    const checkpoint = await this.checkpoints.latestForTask(
      actor.userId,
      taskId,
    );
    return {
      checkpoint: checkpoint ? this.checkpointSummary(checkpoint) : null,
    };
  }

  /** POST /api/agent/checkpoints/:id/retry */
  @Post('checkpoints/:id/retry')
  async retryCheckpoint(
    @Req() req: JwtReq,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.prepareCheckpointAction(req, id, 'retry');
  }

  /** POST /api/agent/checkpoints/:id/replay */
  @Post('checkpoints/:id/replay')
  async replayCheckpoint(
    @Req() req: JwtReq,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.prepareCheckpointAction(req, id, 'replay');
  }

  /** POST /api/agent/checkpoints/:id/fork */
  @Post('checkpoints/:id/fork')
  async forkCheckpoint(
    @Req() req: JwtReq,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.prepareCheckpointAction(req, id, 'fork');
  }

  /** POST /api/agent/checkpoints/:id/steps/:stepId/retry */
  @Post('checkpoints/:id/steps/:stepId/retry')
  async retryCheckpointStep(
    @Req() req: JwtReq,
    @Param('id', ParseIntPipe) id: number,
    @Param('stepId') stepId: string,
  ) {
    return this.prepareCheckpointStepAction(req, id, stepId, 'retry');
  }

  /** POST /api/agent/checkpoints/:id/steps/:stepId/replay */
  @Post('checkpoints/:id/steps/:stepId/replay')
  async replayCheckpointStep(
    @Req() req: JwtReq,
    @Param('id', ParseIntPipe) id: number,
    @Param('stepId') stepId: string,
  ) {
    return this.prepareCheckpointStepAction(req, id, stepId, 'replay');
  }

  /** POST /api/agent/checkpoints/:id/steps/:stepId/fork */
  @Post('checkpoints/:id/steps/:stepId/fork')
  async forkCheckpointStep(
    @Req() req: JwtReq,
    @Param('id', ParseIntPipe) id: number,
    @Param('stepId') stepId: string,
  ) {
    return this.prepareCheckpointStepAction(req, id, stepId, 'fork');
  }

  private async prepareCheckpointAction(
    req: JwtReq,
    checkpointId: number,
    action: Exclude<AgentRunCheckpointAction, 'resume'>,
  ) {
    const actor = this.resolveActor(req);
    return {
      plan: await this.checkpoints.prepareAction({
        ownerUserId: actor.userId,
        checkpointId,
        action,
      }),
      streamEndpoint: `/api/social-agent/chat/checkpoints/${checkpointId}/${action}/stream`,
    };
  }

  private async prepareCheckpointStepAction(
    req: JwtReq,
    checkpointId: number,
    stepId: string,
    action: Exclude<AgentRunCheckpointAction, 'resume'>,
  ) {
    const cleanStepId = typeof stepId === 'string' ? stepId.trim() : '';
    if (!cleanStepId) throw new BadRequestException('stepId is required');
    const actor = this.resolveActor(req);
    return {
      plan: await this.checkpoints.prepareStepAction({
        ownerUserId: actor.userId,
        checkpointId,
        stepId: cleanStepId,
        action,
      }),
      streamEndpoint: `/api/social-agent/chat/checkpoints/${checkpointId}/steps/${encodeURIComponent(cleanStepId)}/${action}/stream`,
    };
  }

  private checkpointSummary(checkpoint: AgentRunCheckpoint) {
    const active = checkpoint.status === AgentRunCheckpointStatus.Active;
    return {
      id: checkpoint.id,
      agentTaskId: checkpoint.agentTaskId,
      type: checkpoint.type,
      status: checkpoint.status,
      phase: checkpoint.phase,
      toolName: checkpoint.toolName,
      stepId: checkpoint.stepId,
      approvalRequestId: checkpoint.approvalRequestId ?? null,
      parentCheckpointId: checkpoint.parentCheckpointId ?? null,
      retryCount: checkpoint.retryCount,
      replayCount: checkpoint.replayCount,
      forkCount: checkpoint.forkCount,
      resumeCount: checkpoint.resumeCount,
      resumable: active,
      canRetry: active,
      canReplay: active,
      canFork: active,
      threadId: `agent-task:${checkpoint.agentTaskId}`,
      sourceStep: checkpoint.stepId
        ? {
            stepId: checkpoint.stepId,
            label: this.stepLabel(checkpoint, checkpoint.stepId),
            toolName: this.text(checkpoint.toolName),
          }
        : null,
      steps: this.checkpointStepsSummary(checkpoint),
      createdAt: checkpoint.createdAt?.toISOString?.() ?? null,
      updatedAt: checkpoint.updatedAt?.toISOString?.() ?? null,
    };
  }

  private checkpointStepsSummary(checkpoint: AgentRunCheckpoint) {
    const steps = Array.isArray(checkpoint.steps) ? checkpoint.steps : [];
    return steps
      .map((step, index) => {
        if (!step || typeof step !== 'object' || Array.isArray(step)) {
          return null;
        }
        const record = step;
        const stepId = this.text(record.id) ?? `step-${index + 1}`;
        const label = this.text(record.label) ?? 'Agent 步骤';
        return {
          stepId,
          label,
          status: this.text(record.status) ?? null,
          toolName:
            this.text(record.toolName) ??
            (stepId === checkpoint.stepId
              ? this.text(checkpoint.toolName)
              : null),
          retryable: true,
          replayable: true,
          forkable: true,
        };
      })
      .filter((step): step is NonNullable<typeof step> => Boolean(step))
      .slice(0, 12);
  }

  private stepLabel(checkpoint: AgentRunCheckpoint, stepId: string) {
    const steps = Array.isArray(checkpoint.steps) ? checkpoint.steps : [];
    const step = steps.find((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item))
        return false;
      return this.text(item.id) === stepId;
    });
    if (!step || typeof step !== 'object' || Array.isArray(step)) return null;
    return this.text(step.label);
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

  private text(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed || null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return null;
  }
}
