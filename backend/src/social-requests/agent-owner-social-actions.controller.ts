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
  ) {}

  /** POST /api/agent/social-requests/ai-draft */
  @Post('ai-draft')
  @RequirePermission(AgentAction.CreateSocialRequest)
  aiDraft(@Req() req: AgentRequest, @Body() dto: AiDraftSocialRequestDto) {
    const agent = req[AGENT_CONNECTION_KEY]!;
    return this.socialRequests.aiDraft(agent.userId, dto.rawText);
  }

  /** POST /api/agent/social-requests/:id/publish */
  @Post(':id/publish')
  @RequirePermission(AgentAction.CreateSocialRequest)
  publish(@Req() req: AgentRequest, @Param('id', ParseIntPipe) id: number) {
    const agent = req[AGENT_CONNECTION_KEY]!;
    return this.socialRequests.syncPublicIntentById(id, agent.userId);
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

    const conv = await this.messages.startConversation(userId, targetUserId);
    const message = await this.messages.sendMessage(
      conv.conversationId,
      userId,
      text,
      {
        source: 'ai_delegate',
        senderType: 'agent',
        senderAgentId: agent.id,
        metadata: {
          actorType: 'agent',
          actorUserId: userId,
          agentConnectionId: agent.id,
          socialRequestId: id,
          candidateRecordId: candidateId,
        },
      },
    );
    let candidate: { id: number; status: string } | null = null;
    try {
      candidate = await this.matchService.markCandidateMessaged(
        id,
        candidateId,
        userId,
      );
    } catch {
      // best-effort: invite is sent even if mark-messaged fails.
    }
    return {
      ok: true,
      conversationId: conv.conversationId,
      messageId: message.id,
      candidate,
    };
  }

  /** POST /api/agent/social-requests/:id/candidates/:candidateId/mark-messaged */
  @Post(':id/candidates/:candidateId/mark-messaged')
  @RequirePermission(AgentAction.SendMessage)
  markMessaged(
    @Req() req: AgentRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('candidateId', ParseIntPipe) candidateId: number,
  ) {
    const agent = req[AGENT_CONNECTION_KEY]!;
    return this.matchService.markCandidateMessaged(
      id,
      candidateId,
      agent.userId,
    );
  }
}
