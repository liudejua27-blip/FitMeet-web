import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto, SubmitActivityProofDto } from './dto/activity.dto';
import {
  AGENT_CONNECTION_KEY,
  AgentTokenGuard,
} from '../agent-gateway/guards/agent-token.guard';
import {
  AgentPermissionGuard,
  RequirePermission,
} from '../agent-gateway/guards/agent-permission.guard';
import { AgentAction } from '../agent-gateway/entities/agent-permission.entity';
import { AgentConnection } from '../agent-gateway/entities/agent-connection.entity';
import { AgentGatewayService } from '../agent-gateway/agent-gateway.service';
import { AgentActionLogService } from '../agent-gateway/agent-action-log.service';
import {
  AgentActionRiskLevel,
  AgentActionStatus,
  AgentActionType,
} from '../agent-gateway/entities/agent-action-log.entity';
import {
  ActionResult,
  LoggedAction,
} from '../agent-gateway/entities/agent-activity-log.entity';

type AgentReq = Request & {
  [AGENT_CONNECTION_KEY]: AgentConnection;
};

/**
 * Agent-token surface for the SocialActivity system.
 *
 * Exposed paths:
 *  - POST /api/agent/activities
 *  - POST /api/agent/activities/:id/join
 *  - POST /api/agent/activities/:id/proof
 *
 * Replaces the legacy MeetsService-backed handlers; the legacy
 * `agent-skills.controller.ts` no longer registers these paths.
 */
@Controller('agent')
@UseGuards(AgentTokenGuard, AgentPermissionGuard)
export class AgentActivitiesController {
  constructor(
    private readonly activities: ActivitiesService,
    private readonly gateway: AgentGatewayService,
    private readonly actionLogs: AgentActionLogService,
  ) {}

  @Post('activities')
  @RequirePermission(AgentAction.CreateActivity)
  async create(@Req() req: AgentReq, @Body() dto: CreateActivityDto) {
    const conn = req[AGENT_CONNECTION_KEY];
    const activity = await this.activities.create(conn.userId, dto);
    await this.gateway.logAgentSkill(
      conn,
      LoggedAction.CreateActivity,
      { activityId: activity.id, type: dto.type, title: activity.title },
      ActionResult.Success,
      null,
      0.4,
    );
    await this.actionLogs.logAgentAction({
      ownerUserId: conn.userId,
      agentId: conn.id,
      actionType: AgentActionType.CreateActivity,
      actionStatus: AgentActionStatus.Executed,
      riskLevel: AgentActionRiskLevel.Medium,
      relatedActivityId: activity.id,
      inputSummary: `${dto.type ?? ''} ${activity.title ?? ''}`.trim(),
      outputSummary: `activity_created: id=${activity.id}`,
      payload: { type: dto.type, title: activity.title },
      reason: 'agent_create_activity',
    });
    return activity;
  }

  @Post('activities/:id/join')
  @RequirePermission(AgentAction.JoinActivity)
  async join(@Req() req: AgentReq, @Param('id', ParseIntPipe) id: number) {
    const conn = req[AGENT_CONNECTION_KEY];
    const activity = await this.activities.join(id, conn.userId);
    await this.gateway.logAgentSkill(
      conn,
      LoggedAction.JoinActivity,
      { activityId: id, status: activity.status },
      ActionResult.Success,
    );
    await this.actionLogs.logAgentAction({
      ownerUserId: conn.userId,
      agentId: conn.id,
      actionType: AgentActionType.JoinActivity,
      actionStatus: AgentActionStatus.Executed,
      riskLevel: AgentActionRiskLevel.Low,
      relatedActivityId: id,
      outputSummary: `joined: status=${activity.status}`,
      payload: { status: activity.status },
      reason: 'agent_join_activity',
    });
    return activity;
  }

  @Post('activities/:id/proof')
  @RequirePermission(AgentAction.SubmitCompletionProof)
  async proof(
    @Req() req: AgentReq,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitActivityProofDto,
  ) {
    const conn = req[AGENT_CONNECTION_KEY];
    const proof = await this.activities.submitProof(id, conn.userId, dto);
    await this.gateway.logAgentSkill(
      conn,
      LoggedAction.SubmitCompletionProof,
      {
        activityId: id,
        proofId: proof.id,
        proofType: proof.proofType,
        hasPhoto: !!proof.photoUrl,
        privacyMode: proof.privacyMode,
      },
      ActionResult.PendingApproval,
      null,
      0.5,
    );
    await this.actionLogs.logAgentAction({
      ownerUserId: conn.userId,
      agentId: conn.id,
      actionType: AgentActionType.SubmitProof,
      actionStatus: AgentActionStatus.PendingApproval,
      riskLevel: AgentActionRiskLevel.Medium,
      relatedActivityId: id,
      outputSummary: `proof_submitted: id=${proof.id} type=${proof.proofType}`,
      payload: {
        proofId: proof.id,
        proofType: proof.proofType,
        hasPhoto: !!proof.photoUrl,
        privacyMode: proof.privacyMode,
      },
      reason: 'agent_submit_proof',
    });
    return proof;
  }
}
