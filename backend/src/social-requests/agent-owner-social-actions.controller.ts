import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
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
import { AiDraftSocialRequestDto } from './dto/ai-draft-social-request.dto';
import { SocialRequestsService } from './social-requests.service';
import { MatchService } from '../match/match.service';
import { MessagesService } from '../messages/messages.service';
import { AgentApprovalService } from '../agent-gateway/agent-approval.service';
import {
  ApprovalRiskLevel,
  ApprovalType,
} from '../agent-gateway/entities/agent-approval-request.entity';

type AgentRequest = Request & { [AGENT_CONNECTION_KEY]?: AgentConnection };

/**
 * Agent-token authed actions on the owner's social requests.
 *
 * These complement `AgentSocialRequestsController` (POST /agent/social-requests)
 * and the user-facing JWT routes by giving the OpenClaw/QClaw agent everything
 * it needs to drive an end-to-end social loop on behalf of its owner:
 *   - publish (sync to public hall)
 *   - run match / read candidates
 *   - send first invite + mark candidate as messaged
 *
 * All endpoints derive the owner's userId from the AgentConnection attached
 * by AgentTokenGuard. The body never carries userId.
 */
@Controller('agent/social-requests')
@UseGuards(AgentTokenGuard, AgentPermissionGuard)
export class AgentOwnerSocialActionsController {
  constructor(
    private readonly socialRequests: SocialRequestsService,
    private readonly matchService: MatchService,
    private readonly messages: MessagesService,
    private readonly approvals: AgentApprovalService,
  ) {}

  /** POST /api/agent/social-requests/ai-draft */
  @Post('ai-draft')
  @RequirePermission(AgentAction.CreateSocialRequest)
  aiDraft(@Req() req: AgentRequest, @Body() dto: AiDraftSocialRequestDto) {
    const agent = req[AGENT_CONNECTION_KEY]!;
    return this.socialRequests.aiDraft(agent.userId, dto.rawText, {
      agentId: agent.id,
      source: 'agent_token_social_request_ai_draft',
      taskContext: dto.taskContext ?? null,
    });
  }

  /** POST /api/agent/social-requests/:id/publish */
  @Post(':id/publish')
  @RequirePermission(AgentAction.CreateSocialRequest)
  async publish(@Req() req: AgentRequest, @Param('id', ParseIntPipe) id: number) {
    const agent = req[AGENT_CONNECTION_KEY]!;
    const approval = await this.approvals.create({
      userId: agent.userId,
      agentConnectionId: agent.id,
      type: ApprovalType.PostPublish,
      actionType: 'publish_social_request',
      skillName: 'agent.social_request.publish',
      payload: {
        socialRequestId: id,
        source: 'agent_token_social_request_publish',
        checkpointRequired: true,
        resumeMode: 'resume_after_approval',
      },
      summary: `公开发布社交需求 #${id}`,
      riskLevel: ApprovalRiskLevel.High,
      reason: '公开发布会让需求进入发现/大厅，必须由用户确认。',
      createdBy: 'agent',
      relatedSocialRequestId: id,
    });
    return {
      ok: true,
      status: 'pending_approval' as const,
      approvalId: approval.id,
      reason: 'public_publish_requires_user_confirmation',
    };
  }

  /** POST /api/agent/social-requests/:id/match */
  @Post(':id/match')
  @RequirePermission(AgentAction.SearchProfiles)
  runMatch(
    @Req() req: AgentRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { limit?: number } = {},
  ) {
    const agent = req[AGENT_CONNECTION_KEY]!;
    return this.matchService.runMatch(id, agent.userId, {
      limit: body?.limit,
    });
  }

  /** GET /api/agent/social-requests/:id/candidates */
  @Get(':id/candidates')
  @RequirePermission(AgentAction.SearchProfiles)
  candidates(@Req() req: AgentRequest, @Param('id', ParseIntPipe) id: number) {
    const agent = req[AGENT_CONNECTION_KEY]!;
    return this.matchService.listCandidates(id, agent.userId);
  }

  /**
   * POST /api/agent/social-requests/:id/candidates/:candidateId/send-invite
   * body: { targetUserId: number, text: string }
   *
   * Composes start-conversation + send-message + mark-messaged so the
   * agent can perform a single semantic "send invite" action.
   */
  @Post(':id/candidates/:candidateId/send-invite')
  @RequirePermission(AgentAction.SendMessage)
  async sendInvite(
    @Req() req: AgentRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('candidateId', ParseIntPipe) candidateId: number,
    @Body() body: { targetUserId: number; text: string },
  ) {
    const agent = req[AGENT_CONNECTION_KEY]!;
    const userId = agent.userId;
    const text = (body?.text || '').trim();
    const targetUserId = Number(body?.targetUserId);
    if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
      return { ok: false, error: 'targetUserId required' };
    }
    if (!text) {
      return { ok: false, error: 'text required' };
    }

    const approval = await this.approvals.create({
      userId,
      agentConnectionId: agent.id,
      type: ApprovalType.SendMessage,
      actionType: 'send_message',
      skillName: 'agent.social_request.send_invite',
      payload: {
        toUserId: targetUserId,
        content: text,
        socialRequestId: id,
        candidateRecordId: candidateId,
        metadata: {
          actorType: 'agent',
          actorUserId: userId,
          agentConnectionId: agent.id,
          socialRequestId: id,
          candidateRecordId: candidateId,
          source: 'agent_token_send_invite',
        },
        checkpointRequired: true,
        resumeMode: 'resume_after_approval',
      },
      summary: `向候选人 #${targetUserId} 发送邀请`,
      riskLevel: ApprovalRiskLevel.Medium,
      reason: 'Agent 发送邀约消息属于外联动作，必须由用户确认。',
      createdBy: 'agent',
      relatedSocialRequestId: id,
      relatedCandidateId: candidateId,
    });
    return {
      ok: true,
      status: 'pending_approval' as const,
      approvalId: approval.id,
      reason: 'send_invite_requires_user_confirmation',
    };
  }

  /** POST /api/agent/social-requests/:id/candidates/:candidateId/mark-messaged */
  @Post(':id/candidates/:candidateId/mark-messaged')
  @RequirePermission(AgentAction.SendMessage)
  async markMessaged(
    @Req() req: AgentRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('candidateId', ParseIntPipe) candidateId: number,
  ) {
    const agent = req[AGENT_CONNECTION_KEY]!;
    const approval = await this.approvals.create({
      userId: agent.userId,
      agentConnectionId: agent.id,
      type: ApprovalType.Custom,
      actionType: 'mark_candidate_messaged',
      skillName: 'agent.social_request.mark_messaged',
      payload: {
        socialRequestId: id,
        candidateRecordId: candidateId,
        source: 'agent_token_mark_messaged',
        checkpointRequired: true,
        resumeMode: 'resume_after_approval',
      },
      summary: `将候选 #${candidateId} 标记为已触达`,
      riskLevel: ApprovalRiskLevel.Medium,
      reason: '候选触达状态会影响后续推荐和邀约闭环，必须由用户确认。',
      createdBy: 'agent',
      relatedSocialRequestId: id,
      relatedCandidateId: candidateId,
    });
    return {
      ok: true,
      status: 'pending_approval' as const,
      approvalId: approval.id,
      reason: 'mark_candidate_messaged_requires_user_confirmation',
    };
  }
}
