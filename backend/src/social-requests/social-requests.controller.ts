import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import {
  AGENT_CONNECTION_KEY,
  AgentTokenGuard,
} from '../agent-gateway/guards/agent-token.guard';
import { AgentConnection } from '../agent-gateway/entities/agent-connection.entity';
import { CreateSocialRequestDto } from './dto/create-social-request.dto';
import { AiDraftSocialRequestDto } from './dto/ai-draft-social-request.dto';
import { SearchSocialRequestDto } from './dto/search-social-request.dto';
import { UpdateSocialRequestDto } from './dto/update-social-request.dto';
import { SocialRequestsService } from './social-requests.service';
import { AgentSocialRequestAdapter } from './agent-social-request.adapter';
import { CreateSocialRequestDto as LegacyCreateSocialRequestDto } from '../agent-gateway/dto/agent-gateway.dto';

type AgentRequest = Request & { [AGENT_CONNECTION_KEY]?: AgentConnection };

/** User-facing endpoints (JWT auth). */
@Controller('social-requests')
@UseGuards(JwtAuthGuard)
export class SocialRequestsController {
  constructor(private readonly svc: SocialRequestsService) {}

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateSocialRequestDto,
  ) {
    return this.svc.create(req.user.id, dto);
  }

  /**
   * POST /social-requests/ai-draft
   *
   * Takes a free-text description + the caller's profile and returns a
   * STRUCTURED DRAFT (without persisting). The frontend renders the draft
   * as an editable form; the user then POSTs the (possibly edited) result
   * to `POST /social-requests` to actually publish.
   */
  @Post('ai-draft')
  aiDraft(
    @Req() req: AuthenticatedRequest,
    @Body() dto: AiDraftSocialRequestDto,
  ) {
    return this.svc.aiDraft(req.user.id, dto.rawText);
  }

  @Get('my')
  listMine(
    @Req() req: AuthenticatedRequest,
    @Query() query: SearchSocialRequestDto,
  ) {
    return this.svc.findOwn(req.user.id, query);
  }

  @Get(':id')
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(id, req.user.id);
  }

  @Patch(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSocialRequestDto,
  ) {
    return this.svc.update(id, req.user.id, dto);
  }

  @Post(':id/cancel')
  cancel(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.cancel(id, req.user.id);
  }

  @Post(':id/rematch')
  rematch(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.rematch(id, req.user.id);
  }

  @Post(':id/sync-public-intent')
  syncPublicIntent(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.syncPublicIntentById(id, req.user.id);
  }
}

/**
 * Agent-facing endpoint.
 *
 * Authenticated via X-Agent-Token (handled by AgentTokenGuard from the
 * agent-gateway module). The matched AgentConnection is attached to the
 * request and passed into the service for permission checks.
 *
 * TODO: also gate this with AgentPermissionGuard + @RequirePermission(CreateSocialRequest)
 *       once we extend AgentAction to include "CreateSocialRequest" in the
 *       permission map for this controller path. For now we rely on
 *       AgentConnection.permissionLevel checks inside the service.
 */
@Controller('agent/social-requests')
@UseGuards(AgentTokenGuard)
export class AgentSocialRequestsController {
  constructor(private readonly adapter: AgentSocialRequestAdapter) {}

  /**
   * POST /api/agent/social-requests
   *
   * Canonical OpenClaw entrypoint. Accepts the legacy
   * `{ requestType, description, timePreference, ... }` payload and writes
   * to `user_social_requests` via SocialRequestsService + MatchService.
   * Returns the legacy `{ request, candidates, matchedBy, handoff }`
   * envelope so existing OpenClaw integrations keep working.
   */
  @Post()
  create(@Req() req: AgentRequest, @Body() dto: LegacyCreateSocialRequestDto) {
    const agent = req[AGENT_CONNECTION_KEY]!;
    return this.adapter.createFromLegacy(agent.userId, dto, agent);
  }
}
