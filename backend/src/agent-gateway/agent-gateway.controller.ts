import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { AgentGatewayService } from './agent-gateway.service';
import { AgentProfileService } from './agent-profile.service';
import { AgentApprovalService } from './agent-approval.service';
import { AgentApprovalDispatcherService } from './agent-approval-dispatcher.service';
import { AgentSettingsService } from './agent-settings.service';
import { AgentActionLogService } from './agent-action-log.service';
import { AiSocialAutopilotService } from './ai-social-autopilot.service';
import { AgentDiscoveryService } from './agent-discovery.service';
import { AgentProfileQAService } from './agent-profile-qa.service';
import { ProfileMatchService } from './profile-match.service';
import { ProfileMatchAutopilotService } from './profile-match-autopilot.service';
import { SocialAgentToolExecutorService } from './social-agent-tool-executor.service';
import { AgentType } from './entities/agent-profile.entity';
import {
  AgentActionRiskLevel,
  AgentActionStatus,
  AgentActionType,
} from './entities/agent-action-log.entity';
import {
  AgentApprovalRequest,
  ApprovalRiskLevel,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import { SocialProfileService } from '../users/social-profile.service';
import type { AgentConnection } from './entities/agent-connection.entity';
import {
  AgentTokenGuard,
  AGENT_CONNECTION_KEY,
} from './guards/agent-token.guard';
import {
  AgentPermissionGuard,
  RequirePermission,
} from './guards/agent-permission.guard';
import { AgentAction } from './entities/agent-permission.entity';
import { RegisterAgentDto } from './dto/register-agent.dto';
import {
  CreateAgentProfileDto,
  UpdateAgentProfileDto,
} from './dto/agent-profile.dto';
import {
  CreateSocialRequestDto,
  ConfirmSocialRequestCandidateDto,
  SearchMatchDto,
  SearchNearbyPeopleDto,
  DraftContentDto,
  SendMessageDto,
  ContactRequestDto,
  RespondApprovalDto,
  UpdatePreferencesDto,
} from './dto/agent-gateway.dto';
import { UpdateAgentPermissionsDto } from './dto/agent-control.dto';
import { UpdateSocialProfileDto } from '../users/dto/update-social-profile.dto';
import { SocialRequestStatus } from './entities/social-request.entity';
import type { AiProfileBuilderCard } from '../ai/ai.service';

type FitMeetRequest = Request & {
  user: { id: number };
  [AGENT_CONNECTION_KEY]: AgentConnection;
};

// ── User-facing (JWT) routes ─────────────────────────────────────
@Controller('agents')
@UseGuards(AuthGuard('jwt'))
export class AgentUserController {
  private readonly logger = new Logger(AgentUserController.name);

  constructor(
    private readonly svc: AgentGatewayService,
    private readonly profiles: AgentProfileService,
    private readonly approvalService: AgentApprovalService,
    private readonly dispatcher: AgentApprovalDispatcherService,
    private readonly discovery: AgentDiscoveryService,
    private readonly autopilot: AiSocialAutopilotService,
    private readonly profileMatches: ProfileMatchService,
    private readonly profileMatchAutopilot: ProfileMatchAutopilotService,
    private readonly socialAgentExecutor: SocialAgentToolExecutorService,
  ) {}
  /** GET /api/agents */
  @Get()
  listAgentProfiles(@Req() req: FitMeetRequest) {
    return this.profiles.listVisible(req.user.id);
  }

  /** POST /api/agents */
  @Post()
  createAgentProfile(
    @Req() req: FitMeetRequest,
    @Body() dto: CreateAgentProfileDto,
  ) {
    return this.profiles.create(req.user.id, dto);
  }

  /**
   * POST /api/agents/register
   * User registers a new agent connection.
   * Returns the raw agent token ONCE.
   */
  @Post('register')
  register(@Req() req: FitMeetRequest, @Body() dto: RegisterAgentDto) {
    return this.svc.registerAgent(req.user.id, dto);
  }

  /**
   * POST /api/agents/personal-token
   * Issues a personal OpenClaw token after the user has logged in and passed
   * real-name verification. This replaces a manual Agent Hub setup for MVP.
   */
  @Post('personal-token')
  issuePersonalToken(@Req() req: FitMeetRequest) {
    return this.svc.issuePersonalAgentToken(req.user.id);
  }

  /** GET /api/agents/personal-token/status */
  @Get('personal-token/status')
  getPersonalTokenStatus(@Req() req: FitMeetRequest) {
    return this.svc.getPersonalAgentTokenStatus(req.user.id);
  }

  /** GET /api/agents/connections - list all connected agents */
  @Get('connections')
  listConnections(@Req() req: FitMeetRequest) {
    return this.svc.listConnections(req.user.id);
  }

  /** POST /api/agents/social-agent/tasks/:id/run-next */
  @Post('social-agent/tasks/:id/run-next')
  @HttpCode(200)
  runSocialAgentNext(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.socialAgentExecutor.runNext(id, req.user.id);
  }

  /** DELETE /api/agents/connections/:id - revoke an agent */
  @Delete('connections/:id')
  revokeConnection(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.revokeConnection(req.user.id, id);
  }

  /** POST /api/agents/connections/:id/pause — suspend without revoking the token */
  @Post('connections/:id/pause')
  @HttpCode(200)
  pauseConnection(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.setConnectionStatus(req.user.id, id, 'paused');
  }

  /** POST /api/agents/connections/:id/resume — re-activate a paused agent */
  @Post('connections/:id/resume')
  @HttpCode(200)
  resumeConnection(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.setConnectionStatus(req.user.id, id, 'active');
  }

  // ── Preferences ───────────────────────────────────────────────

  /** GET /api/agents/preferences */
  @Get('preferences')
  getPreferences(@Req() req: FitMeetRequest) {
    return this.svc.getPreferences(req.user.id);
  }

  /** PUT /api/agents/preferences */
  @Put('preferences')
  updatePreferences(
    @Req() req: FitMeetRequest,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.svc.updatePreferences(req.user.id, dto);
  }

  // ── Activity & Approvals ──────────────────────────────────────

  /** GET /api/agents/activity?page=1&limit=20 */
  @Get('activity')
  getActivity(
    @Req() req: FitMeetRequest,
    @Query('page', ParseIntPipe) page = 1,
    @Query('limit', ParseIntPipe) limit = 20,
  ) {
    return this.svc.getActivity(req.user.id, page, limit);
  }

  /** GET /api/agents/approvals/pending */
  @Get('approvals/pending')
  getPendingApprovals(@Req() req: FitMeetRequest) {
    return this.svc.getPendingApprovals(req.user.id);
  }

  /** POST /api/agents/approval/respond */
  @Post('approval/respond')
  @HttpCode(200)
  async respondApproval(
    @Req() req: FitMeetRequest,
    @Body() dto: RespondApprovalDto,
  ) {
    if (dto.decision === 'approved') {
      const result = await this.approvalService.approve(
        dto.approvalRequestId,
        req.user.id,
        (approval) => this.dispatcher.dispatch(approval),
      );
      return {
        ok: true,
        status: result.approval.status,
        dispatched: result.dispatched,
        result: result.dispatchResult,
        error: result.dispatchError,
      };
    }
    const row = await this.approvalService.reject(
      dto.approvalRequestId,
      req.user.id,
    );
    return { ok: true, status: row.status };
  }

  // ── Match Review ──────────────────────────────────────────────

  /** GET /api/agents/matches?page=1&limit=10 */
  @Get('matches')
  getMatches(
    @Req() req: FitMeetRequest,
    @Query('page', ParseIntPipe) page = 1,
    @Query('limit', ParseIntPipe) limit = 10,
  ) {
    return this.svc.getMatchCandidates(req.user.id, page, limit);
  }

  /** POST /api/agents/matches/:id/review */
  @Post('matches/:id/review')
  reviewMatch(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { decision: 'approved' | 'rejected'; feedback?: string },
  ) {
    return this.svc.reviewCandidate(
      req.user.id,
      id,
      body.decision,
      body.feedback,
    );
  }

  /** GET /api/agents/social-requests */
  @Get('social-requests')
  listSocialRequests(@Req() req: FitMeetRequest) {
    return this.svc.listSocialRequests(req.user.id);
  }

  /** POST /api/agents/social-requests */
  @Post('social-requests')
  createSocialRequest(
    @Req() req: FitMeetRequest,
    @Body() dto: CreateSocialRequestDto,
  ) {
    return this.svc.createUserSocialRequest(req.user.id, dto);
  }

  // ── Agent-to-Agent discovery & messaging ───────────────────────

  /** GET /api/agents/search?q=&type=&limit= — discover other agents */
  /** POST /api/agents/autopilot/run-once */
  @Post('autopilot/run-once')
  @HttpCode(200)
  async runOwnerAutopilotOnce(@Req() req: FitMeetRequest) {
    try {
      const summary = await this.autopilot.runOnce('manual', req.user.id);
      return { ok: true, summary };
    } catch (err) {
      this.logger.error(
        `Owner autopilot run-once failed for userId=${req.user.id}: ${
          err instanceof Error ? err.stack || err.message : String(err)
        }`,
      );
      return {
        ok: false,
        summary: {
          triggeredBy: 'manual',
          skipped: true,
          reason: 'autopilot_unavailable',
          agentsScanned: 0,
          requestsScanned: 0,
          decisions: { executed: 0, pending: 0, planned: 0, skipped: 0 },
        },
      };
    }
  }

  /** POST /api/agents/profile-matches/run-once */
  @Post('profile-matches/run-once')
  @HttpCode(200)
  runProfileMatchesOnce(@Req() req: FitMeetRequest) {
    return this.profileMatches.runOnce(req.user.id);
  }

  /** POST /api/agents/profile-match/autopilot/run-once */
  @Post('profile-match/autopilot/run-once')
  @HttpCode(200)
  async runProfileMatchAutopilotOnce(@Req() req: FitMeetRequest) {
    const summary = await this.profileMatchAutopilot.runOnce(
      'manual',
      req.user.id,
    );
    return { ok: true, autopilot: 'profile_match_autopilot', summary };
  }

  /** GET /api/agents/profile-match/autopilot/status */
  @Get('profile-match/autopilot/status')
  getProfileMatchAutopilotStatus() {
    return this.profileMatchAutopilot.getStatus();
  }

  /** POST /api/agents/subconscious-loop/run-once */
  @Post('subconscious-loop/run-once')
  @HttpCode(200)
  async runSubconsciousLoopOnce(@Req() req: FitMeetRequest) {
    const summary = await this.profileMatchAutopilot.runOnce(
      'manual',
      req.user.id,
    );
    return { ok: true, autopilot: 'profile_match_autopilot', summary };
  }

  /** GET /api/agents/subconscious-loop/status */
  @Get('subconscious-loop/status')
  getSubconsciousLoopStatus() {
    return this.profileMatchAutopilot.getStatus();
  }

  /** GET /api/agents/openclaw/status */
  @Get('openclaw/status')
  getOpenClawStatus(@Req() req: FitMeetRequest) {
    return this.svc.getOpenClawSetupStatus(
      req.user.id,
      this.profileMatchAutopilot.getStatus(),
    );
  }

  /** GET /api/agents/profile-matches?limit=30 */
  @Get('profile-matches')
  listProfileMatches(
    @Req() req: FitMeetRequest,
    @Query('limit') limit?: string,
  ) {
    return this.profileMatches.list(
      req.user.id,
      limit ? Number(limit) : undefined,
    );
  }

  /** POST /api/agents/profile-matches/:id/ignore */
  @Post('profile-matches/:id/ignore')
  @HttpCode(200)
  ignoreProfileMatch(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body?: { ownerConfirmed?: boolean },
  ) {
    return this.profileMatches.ignore(req.user.id, id, {
      ownerConfirmed: body?.ownerConfirmed,
    });
  }

  /** POST /api/agents/profile-matches/:id/favorite */
  @Post('profile-matches/:id/favorite')
  @HttpCode(200)
  favoriteProfileMatch(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body?: { ownerConfirmed?: boolean },
  ) {
    return this.profileMatches.favorite(req.user.id, id, {
      ownerConfirmed: body?.ownerConfirmed,
    });
  }

  /** POST /api/agents/profile-matches/:id/draft-opener */
  @Post('profile-matches/:id/draft-opener')
  @HttpCode(200)
  draftProfileMatchOpener(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { tone?: string },
  ) {
    return this.profileMatches.draftOpener(req.user.id, id, body?.tone);
  }

  /** POST /api/agents/profile-matches/:id/confirm-contact */
  @Post('profile-matches/:id/confirm-contact')
  @HttpCode(200)
  confirmProfileMatchContact(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { note?: string; ownerConfirmed?: boolean },
  ) {
    return this.profileMatches.confirmContact(req.user.id, id, body?.note, {
      ownerConfirmed: body?.ownerConfirmed,
    });
  }

  /** POST /api/agents/profile-matches/:id/request-contact-exchange */
  @Post('profile-matches/:id/request-contact-exchange')
  @HttpCode(200)
  requestProfileMatchContactExchange(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { note?: string; ownerConfirmed?: boolean },
  ) {
    return this.profileMatches.requestContactExchange(
      req.user.id,
      id,
      body ?? {},
    );
  }

  /** POST /api/agents/profile-matches/:id/send-intro */
  @Post('profile-matches/:id/send-intro')
  @HttpCode(200)
  sendProfileMatchIntro(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { text?: string; ownerConfirmed?: boolean },
  ) {
    return this.profileMatches.sendIntro(req.user.id, id, body ?? {});
  }

  /** Aliases under /api/agents/recommendations/:id/* for cards UI */
  @Post('recommendations/:id/ignore')
  @HttpCode(200)
  ignoreRecommendation(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body?: { ownerConfirmed?: boolean },
  ) {
    return this.ignoreProfileMatch(req, id, body);
  }

  @Post('recommendations/:id/save')
  @HttpCode(200)
  saveRecommendation(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body?: { ownerConfirmed?: boolean },
  ) {
    return this.favoriteProfileMatch(req, id, body);
  }

  @Post('recommendations/:id/draft-opener')
  @HttpCode(200)
  draftRecommendationOpener(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { tone?: string },
  ) {
    return this.draftProfileMatchOpener(req, id, body);
  }

  @Post('recommendations/:id/confirm-contact')
  @HttpCode(200)
  confirmRecommendationContact(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { note?: string; ownerConfirmed?: boolean },
  ) {
    return this.confirmProfileMatchContact(req, id, body);
  }

  @Post('recommendations/:id/request-contact-exchange')
  @HttpCode(200)
  requestRecommendationContactExchange(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { note?: string; ownerConfirmed?: boolean },
  ) {
    return this.requestProfileMatchContactExchange(req, id, body);
  }

  @Post('recommendations/:id/send-intro')
  @HttpCode(200)
  sendRecommendationIntro(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { text?: string; ownerConfirmed?: boolean },
  ) {
    return this.sendProfileMatchIntro(req, id, body);
  }

  /** GET /api/agents/inbox/conversations?agentProfileId=&limit=&unreadOnly= */
  @Get('inbox/conversations')
  listOwnedAgentInbox(
    @Req() req: FitMeetRequest,
    @Query('agentProfileId') agentProfileId?: string,
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.discovery.listInboxForOwner(req.user.id, {
      agentProfileId: agentProfileId ? Number(agentProfileId) : undefined,
      limit: limit ? Number(limit) : undefined,
      unreadOnly: unreadOnly === 'true',
    });
  }

  /** GET /api/agents/inbox/conversations/:conversationId/messages */
  @Get('inbox/conversations/:conversationId/messages')
  listOwnedAgentInboxMessages(
    @Req() req: FitMeetRequest,
    @Param('conversationId') conversationId: string,
    @Query('agentProfileId') agentProfileId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.discovery.listInboxMessagesForOwner(
      req.user.id,
      conversationId,
      {
        agentProfileId: agentProfileId ? Number(agentProfileId) : undefined,
        limit: limit ? Number(limit) : undefined,
      },
    );
  }

  /** GET /api/agents/inbox/events?agentProfileId=&limit=&unreadOnly= */
  @Get('inbox/events')
  listOwnedAgentInboxEvents(
    @Req() req: FitMeetRequest,
    @Query('agentProfileId') agentProfileId?: string,
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.discovery.listInboxEventsForOwner(req.user.id, {
      agentProfileId: agentProfileId ? Number(agentProfileId) : undefined,
      limit: limit ? Number(limit) : undefined,
      unreadOnly: unreadOnly === 'true',
    });
  }

  /** POST /api/agents/inbox/events/ack */
  @Post('inbox/events/ack')
  @HttpCode(200)
  ackOwnedAgentInboxEvents(
    @Req() req: FitMeetRequest,
    @Body() body: { agentProfileId?: number; eventIds?: string[] },
  ) {
    return this.discovery.ackInboxEventsForOwner(req.user.id, body ?? {});
  }

  /** POST /api/agents/inbox/conversations/:conversationId/reply */
  @Post('inbox/conversations/:conversationId/reply')
  @HttpCode(200)
  replyOwnedAgentInbox(
    @Req() req: FitMeetRequest,
    @Param('conversationId') conversationId: string,
    @Body()
    body: { agentProfileId?: number; content?: string; text?: string },
  ) {
    return this.discovery.replyToInboxForOwner(
      req.user.id,
      conversationId,
      body,
    );
  }

  @Get('search')
  searchAgents(
    @Req() req: FitMeetRequest,
    @Query('q') q?: string,
    @Query('type') type?: AgentType,
    @Query('limit') limit?: string,
  ) {
    return this.discovery.search(req.user.id, {
      q,
      type,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /** POST /api/agents/:id/message — send a message to a target agent */
  @Post(':id/message')
  @HttpCode(200)
  sendMessageToAgent(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { content: string; fromAgentId?: number },
  ) {
    return this.discovery.sendMessageToAgent(req.user.id, id, body);
  }

  /** POST /api/agents/:id/invite — invite a target agent to an activity */
  @Post(':id/invite')
  @HttpCode(200)
  inviteAgent(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { fromAgentId?: number; activityId?: number; note?: string },
  ) {
    return this.discovery.inviteAgent(req.user.id, id, body);
  }

  /** GET /api/agents/:id */
  @Get(':id')
  getAgentProfile(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.profiles.getVisible(req.user.id, id);
  }

  /** PATCH /api/agents/:id */
  @Patch(':id')
  updateAgentProfile(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAgentProfileDto,
  ) {
    return this.profiles.update(req.user.id, id, dto);
  }

  /** POST /api/agents/:id/pause */
  @Post(':id/pause')
  @HttpCode(200)
  pauseAgentProfile(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.profiles.pause(req.user.id, id);
  }

  /** POST /api/agents/:id/resume */
  @Post(':id/resume')
  @HttpCode(200)
  resumeAgentProfile(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.profiles.resume(req.user.id, id);
  }
}

// ── Public social-skills routes (no token) ─────────────────────────
@Controller('public/social-intents')
export class PublicSocialIntentController {
  constructor(private readonly svc: AgentGatewayService) {}

  /** GET /api/public/social-intents?page=1&limit=30 */
  @Get()
  listPublicSocialIntents(
    @Query('page') page = '1',
    @Query('limit') limit = '30',
    @Query('q') q?: string,
    @Query('city') city?: string,
    @Query('requestType') requestType?: string,
    @Query('status') status?: SocialRequestStatus,
  ) {
    return this.svc.listPublicSocialIntents({
      page: Number(page),
      limit: Number(limit),
      q,
      city,
      requestType,
      status,
    });
  }

  /** GET /api/public/social-intents/:id/matches */
  @Get(':id/matches')
  getPublicSocialIntentMatches(@Param('id') id: string) {
    return this.svc.getPublicSocialIntentMatches(id);
  }

  /** GET /api/public/social-intents/:id */
  @Get(':id')
  getPublicSocialIntent(@Param('id') id: string) {
    return this.svc.getPublicSocialIntent(id);
  }

  /**
   * POST /api/public/social-intents
   * Lightweight mode for downloaded skills with no personal token.
   * Allows intent submission and immediate FitMeet matching only.
   */
  @Post()
  submitPublicSocialIntent(
    @Req() req: FitMeetRequest,
    @Body() dto: CreateSocialRequestDto,
  ) {
    return this.svc.submitPublicSocialIntent(dto, {
      ip: req.ip,
      forwardedFor: req.headers['x-forwarded-for'],
      userAgent: req.headers['user-agent'],
      deviceId: req.headers['x-fitmeet-device-id'],
      origin: req.headers.origin,
    });
  }
}

// ── Agent-facing (X-Agent-Token) routes ──────────────────────────
@Controller('public/social-skills')
export class PublicSocialSkillsController {
  constructor(private readonly svc: AgentGatewayService) {}

  /** GET /api/public/social-skills/openapi.json */
  @Get('openapi.json')
  getOpenApi() {
    return this.svc.getSocialSkillsOpenApi();
  }
}

@Controller('agent')
@UseGuards(AgentTokenGuard, AgentPermissionGuard)
export class AgentApiController {
  private readonly logger = new Logger(AgentApiController.name);

  constructor(
    private readonly svc: AgentGatewayService,
    private readonly profiles: AgentProfileService,
    private readonly discovery: AgentDiscoveryService,
    private readonly settings: AgentSettingsService,
    private readonly approvals: AgentApprovalService,
    private readonly dispatcher: AgentApprovalDispatcherService,
    private readonly socialProfiles: SocialProfileService,
    private readonly actionLogs: AgentActionLogService,
    private readonly autopilot: AiSocialAutopilotService,
    private readonly profileMatches: ProfileMatchService,
    private readonly profileMatchAutopilot: ProfileMatchAutopilotService,
  ) {}

  /**
   * GET /api/agent/skills/manifest
   * Machine-readable skill contract for OpenClaw and compatible agents.
   */
  @Get('skills/manifest')
  getSkillsManifest(@Req() req: FitMeetRequest) {
    return this.svc.getSkillsManifest(req[AGENT_CONNECTION_KEY]);
  }

  /** GET /api/agent/skills/openapi.json */
  @Get('skills/openapi.json')
  getOpenApi() {
    return this.svc.getSocialSkillsOpenApi();
  }

  @Get('owner/permissions')
  getOwnerPermissions(@Req() req: FitMeetRequest) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.settings.getEffective(conn.userId, conn.id);
  }

  @Get('owner/agent-profile')
  getOwnerAgentProfiles(@Req() req: FitMeetRequest) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.profiles.listVisible(conn.userId);
  }

  // ── Agent-to-Agent routes for FITMEET_AGENT_TOKEN callers ───────────

  @Get('a2a/search')
  @RequirePermission(AgentAction.SearchProfiles)
  searchAgentsForToken(
    @Req() req: FitMeetRequest,
    @Query('q') q?: string,
    @Query('type') type?: AgentType,
    @Query('limit') limit?: string,
  ) {
    return this.discovery.searchForAgentConnection(req[AGENT_CONNECTION_KEY], {
      q,
      type,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('a2a/agents/:id')
  @RequirePermission(AgentAction.SearchProfiles)
  getAgentDetailForToken(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.discovery.getAgentDetailForConnection(
      req[AGENT_CONNECTION_KEY],
      id,
    );
  }

  @Post('a2a/agents/:id/message')
  @HttpCode(200)
  @RequirePermission(AgentAction.SendMessage)
  sendAgentMessageForToken(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { content: string; fromAgentId?: number },
  ) {
    return this.discovery.sendMessageToAgentForConnection(
      req[AGENT_CONNECTION_KEY],
      id,
      body,
    );
  }

  @Post('a2a/agents/:id/invite')
  @HttpCode(200)
  @RequirePermission(AgentAction.SendMessage)
  inviteAgentForToken(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { fromAgentId?: number; activityId?: number; note?: string },
  ) {
    return this.discovery.inviteAgentForConnection(
      req[AGENT_CONNECTION_KEY],
      id,
      body,
    );
  }

  @Get('inbox/conversations')
  listAgentInbox(
    @Req() req: FitMeetRequest,
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.discovery.listInboxForConnection(req[AGENT_CONNECTION_KEY], {
      limit: limit ? Number(limit) : undefined,
      unreadOnly: unreadOnly === 'true',
    });
  }

  @Get('inbox/events')
  listAgentInboxEvents(
    @Req() req: FitMeetRequest,
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('eventType') eventType?: string,
  ) {
    void this.discovery
      .recordInboxHeartbeat(req[AGENT_CONNECTION_KEY], {
        limit: limit ? Number(limit) : undefined,
        unreadOnly: unreadOnly === 'true',
        eventType,
      })
      .catch(() => undefined);
    return this.discovery.listInboxEventsForConnection(
      req[AGENT_CONNECTION_KEY],
      {
        limit: limit ? Number(limit) : undefined,
        unreadOnly: unreadOnly === 'true',
        eventType,
      },
    );
  }

  @Get('subconscious-loop/status')
  getAgentSubconsciousLoopStatus() {
    return this.profileMatchAutopilot.getStatus();
  }

  @Post('inbox/events/ack')
  @HttpCode(200)
  ackAgentInboxEvents(
    @Req() req: FitMeetRequest,
    @Body() body: { eventIds?: string[] },
  ) {
    return this.discovery.ackInboxEventsForConnection(
      req[AGENT_CONNECTION_KEY],
      body ?? {},
    );
  }

  @Get('inbox/conversations/:conversationId/messages')
  listAgentInboxMessages(
    @Req() req: FitMeetRequest,
    @Param('conversationId') conversationId: string,
    @Query('limit') limit?: string,
  ) {
    return this.discovery.listInboxMessagesForConnection(
      req[AGENT_CONNECTION_KEY],
      conversationId,
      { limit: limit ? Number(limit) : undefined },
    );
  }

  @Post('inbox/conversations/:conversationId/reply')
  @HttpCode(200)
  @RequirePermission(AgentAction.SendMessage)
  replyAgentInbox(
    @Req() req: FitMeetRequest,
    @Param('conversationId') conversationId: string,
    @Body() body: { content?: string; text?: string },
  ) {
    return this.discovery.replyToInboxForConnection(
      req[AGENT_CONNECTION_KEY],
      conversationId,
      body,
    );
  }

  @Patch('owner/permissions')
  updateOwnerPermissions(
    @Req() req: FitMeetRequest,
    @Body() dto: UpdateAgentPermissionsDto,
  ) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.settings.update(conn.userId, dto);
  }

  @Get('owner/social-profile')
  getOwnerSocialProfile(@Req() req: FitMeetRequest) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.socialProfiles.get(conn.userId);
  }

  @Get('owner/social-profile/status')
  async getOwnerSocialProfileStatus(@Req() req: FitMeetRequest) {
    const conn = req[AGENT_CONNECTION_KEY];
    const [profile, completion] = await Promise.all([
      this.socialProfiles.get(conn.userId),
      this.socialProfiles.getCompletion(conn.userId),
    ]);
    const matchingPoolEnabled = Boolean(
      profile.profileDiscoverable || profile.agentCanRecommendMe,
    );
    return {
      profile,
      completion,
      visibility: {
        profileDiscoverable: profile.profileDiscoverable,
        agentCanRecommendMe: profile.agentCanRecommendMe,
        agentCanStartChatAfterApproval: profile.agentCanStartChatAfterApproval,
      },
      matchingPoolEnabled,
      nextStep:
        completion.percent >= 80
          ? 'review_or_confirm_profile'
          : 'ask_more_questions',
    };
  }

  @Patch('owner/social-profile')
  updateOwnerSocialProfile(
    @Req() req: FitMeetRequest,
    @Body() dto: UpdateSocialProfileDto,
  ) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.socialProfiles.upsert(conn.userId, dto);
  }

  @Patch('owner/social-profile/visibility')
  updateOwnerSocialProfileVisibility(
    @Req() req: FitMeetRequest,
    @Body()
    body: {
      profileDiscoverable?: boolean;
      agentCanRecommendMe?: boolean;
      allowAgentRecommend?: boolean;
      agentCanStartChatAfterApproval?: boolean;
      ownerConfirmed?: boolean;
    },
  ) {
    if (body?.ownerConfirmed !== true) {
      throw new BadRequestException('ownerConfirmed=true is required');
    }
    const conn = req[AGENT_CONNECTION_KEY];
    return this.socialProfiles.upsert(conn.userId, {
      profileDiscoverable: body.profileDiscoverable,
      agentCanRecommendMe:
        body.agentCanRecommendMe ?? body.allowAgentRecommend,
      agentCanStartChatAfterApproval: body.agentCanStartChatAfterApproval,
    });
  }

  @Get('owner/social-profile/questions')
  generateOwnerSocialProfileQuestions(@Req() req: FitMeetRequest) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.socialProfiles.generateQuestions(conn.userId);
  }

  @Post('owner/social-profile/answers')
  saveOwnerSocialProfileAnswer(
    @Req() req: FitMeetRequest,
    @Body() body: { key: string; answer: string },
  ) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.socialProfiles.saveAnswer(conn.userId, body.key, body.answer);
  }

  @Post('owner/social-profile/ai-draft')
  generateOwnerAiSocialProfileDraft(
    @Req() req: FitMeetRequest,
    @Body()
    body: {
      answers?: Array<{
        key?: string;
        question?: string;
        answer?: string;
        value?: unknown;
      }>;
      rawText?: string;
      source?: string;
    },
  ) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.socialProfiles.generateAiDraft(conn.userId, {
      ...(body ?? {}),
      source: body?.source ?? 'openclaw_social_skills',
    });
  }

  @Post('owner/social-profile/ai-save')
  saveOwnerAiSocialProfileDraft(
    @Req() req: FitMeetRequest,
    @Body()
    body: {
      profile?: AiProfileBuilderCard;
      enableMatching?: boolean;
      ownerConfirmed?: boolean;
      sensitiveTagsConfirmed?: boolean;
      sensitiveTagDecisions?: Record<
        string,
        'confirmed' | 'rejected' | 'hidden'
      >;
    },
  ) {
    if (body?.ownerConfirmed !== true) {
      throw new BadRequestException('ownerConfirmed=true is required');
    }
    const sensitiveTags =
      body.profile?.matchSignals?.sensitivePrivateTags ?? [];
    if (sensitiveTags.length > 0 && body.sensitiveTagsConfirmed !== true) {
      throw new BadRequestException('sensitiveTagsConfirmed=true is required');
    }
    const conn = req[AGENT_CONNECTION_KEY];
    return this.socialProfiles.saveAiDraft(conn.userId, body ?? {});
  }

  @Get('owner/social-profile/completion')
  getOwnerSocialProfileCompletion(@Req() req: FitMeetRequest) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.socialProfiles.getCompletion(conn.userId);
  }

  @Post('owner/profile-matches/run-once')
  @HttpCode(200)
  @RequirePermission(AgentAction.SearchProfiles)
  runOwnerProfileMatchesOnce(@Req() req: FitMeetRequest) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.profileMatches.runOnce(conn.userId);
  }

  /** POST /api/agent/profile-match/autopilot/run-once */
  @Post('profile-match/autopilot/run-once')
  @HttpCode(200)
  @RequirePermission(AgentAction.SearchProfiles)
  async runOwnerProfileMatchAutopilotOnce(@Req() req: FitMeetRequest) {
    const conn = req[AGENT_CONNECTION_KEY];
    const summary = await this.profileMatchAutopilot.runOnce(
      'manual',
      conn.userId,
    );
    return { ok: true, autopilot: 'profile_match_autopilot', summary };
  }

  /** GET /api/agent/profile-match/autopilot/status */
  @Get('profile-match/autopilot/status')
  @RequirePermission(AgentAction.SearchProfiles)
  getOwnerProfileMatchAutopilotStatus() {
    return this.profileMatchAutopilot.getStatus();
  }

  /** POST /api/agent/subconscious-loop/run-once */
  @Post('subconscious-loop/run-once')
  @HttpCode(200)
  @RequirePermission(AgentAction.SearchProfiles)
  async runOwnerSubconsciousLoopOnce(@Req() req: FitMeetRequest) {
    const conn = req[AGENT_CONNECTION_KEY];
    const summary = await this.profileMatchAutopilot.runOnce(
      'manual',
      conn.userId,
    );
    return { ok: true, autopilot: 'profile_match_autopilot', summary };
  }

  @Get('owner/profile-matches')
  @RequirePermission(AgentAction.SearchProfiles)
  listOwnerProfileMatches(
    @Req() req: FitMeetRequest,
    @Query('limit') limit?: string,
  ) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.profileMatches.list(
      conn.userId,
      limit ? Number(limit) : undefined,
    );
  }

  @Get('owner/profile-recommendations/events')
  @RequirePermission(AgentAction.SearchProfiles)
  listOwnerProfileRecommendationEvents(
    @Req() req: FitMeetRequest,
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.discovery.listInboxEventsForConnection(conn, {
      limit: limit ? Number(limit) : undefined,
      unreadOnly: unreadOnly === 'true',
      eventType: 'profile.match.recommended',
    });
  }

  @Post('owner/profile-matches/:id/ignore')
  @HttpCode(200)
  @RequirePermission(AgentAction.SearchProfiles)
  ignoreOwnerProfileMatch(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.profileMatches.ignore(conn.userId, id);
  }

  @Post('owner/profile-matches/:id/favorite')
  @HttpCode(200)
  @RequirePermission(AgentAction.SearchProfiles)
  favoriteOwnerProfileMatch(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.profileMatches.favorite(conn.userId, id);
  }

  @Post('owner/profile-matches/:id/draft-opener')
  @HttpCode(200)
  @RequirePermission(AgentAction.GenerateMessage)
  draftOwnerProfileMatchOpener(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { tone?: string },
  ) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.profileMatches.draftOpener(conn.userId, id, body?.tone);
  }

  @Post('owner/profile-matches/:id/confirm-contact')
  @HttpCode(200)
  @RequirePermission(AgentAction.ContactRequest)
  confirmOwnerProfileMatchContact(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { note?: string; ownerConfirmed?: boolean },
  ) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.profileMatches.confirmContact(conn.userId, id, body?.note, {
      ownerConfirmed: body?.ownerConfirmed,
    });
  }

  @Post('owner/profile-matches/:id/request-contact-exchange')
  @HttpCode(200)
  @RequirePermission(AgentAction.ContactRequest)
  requestOwnerProfileMatchContactExchange(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { note?: string; ownerConfirmed?: boolean },
  ) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.profileMatches.requestContactExchange(
      conn.userId,
      id,
      body ?? {},
    );
  }

  @Post('owner/profile-matches/:id/send-intro')
  @HttpCode(200)
  @RequirePermission(AgentAction.GenerateMessage)
  sendOwnerProfileMatchIntro(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { text?: string; ownerConfirmed?: boolean },
  ) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.profileMatches.sendIntro(conn.userId, id, body ?? {});
  }

  /** Aliases under /api/agent/recommendations/:id/* */
  @Post('recommendations/:id/ignore')
  @HttpCode(200)
  @RequirePermission(AgentAction.SearchProfiles)
  ignoreOwnerRecommendation(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body?: { ownerConfirmed?: boolean },
  ) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.profileMatches.ignore(conn.userId, id, {
      ownerConfirmed: body?.ownerConfirmed,
    });
  }

  @Post('recommendations/:id/save')
  @HttpCode(200)
  @RequirePermission(AgentAction.SearchProfiles)
  saveOwnerRecommendation(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body?: { ownerConfirmed?: boolean },
  ) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.profileMatches.favorite(conn.userId, id, {
      ownerConfirmed: body?.ownerConfirmed,
    });
  }

  @Post('recommendations/:id/draft-opener')
  @HttpCode(200)
  @RequirePermission(AgentAction.GenerateMessage)
  draftOwnerRecommendationOpener(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { tone?: string },
  ) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.profileMatches.draftOpener(conn.userId, id, body?.tone);
  }

  @Post('recommendations/:id/confirm-contact')
  @HttpCode(200)
  @RequirePermission(AgentAction.ContactRequest)
  confirmOwnerRecommendationContact(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { note?: string; ownerConfirmed?: boolean },
  ) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.profileMatches.confirmContact(conn.userId, id, body?.note, {
      ownerConfirmed: body?.ownerConfirmed,
    });
  }

  @Post('recommendations/:id/request-contact-exchange')
  @HttpCode(200)
  @RequirePermission(AgentAction.ContactRequest)
  requestOwnerRecommendationContactExchange(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { note?: string; ownerConfirmed?: boolean },
  ) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.profileMatches.requestContactExchange(
      conn.userId,
      id,
      body ?? {},
    );
  }

  @Post('recommendations/:id/send-intro')
  @HttpCode(200)
  @RequirePermission(AgentAction.GenerateMessage)
  sendOwnerRecommendationIntro(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { text?: string; ownerConfirmed?: boolean },
  ) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.profileMatches.sendIntro(conn.userId, id, body ?? {});
  }

  @Get('owner/pending-approvals')
  getOwnerPendingApprovals(@Req() req: FitMeetRequest) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.approvals.getPending(conn.userId);
  }

  @Post('owner/approvals/:id/approve')
  async approveOwnerAction(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const conn = req[AGENT_CONNECTION_KEY];
    const result = await this.approvals.approve(id, conn.userId, (approval) =>
      this.dispatcher.dispatch(approval),
    );
    return {
      ok: true,
      status: result.approval.status,
      result: result.dispatchResult,
    };
  }

  @Post('owner/approvals/:id/reject')
  async rejectOwnerAction(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const conn = req[AGENT_CONNECTION_KEY];
    const row = await this.approvals.reject(id, conn.userId);
    return { ok: true, status: row.status };
  }

  /**
   * GET /api/agent/profile/preferences
   * Agent reads the user's preference profile to personalise queries.
   */
  @Get('profile/preferences')
  @RequirePermission(AgentAction.SearchProfiles)
  getPreferences(@Req() req: FitMeetRequest) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.svc.getPreferences(conn.userId);
  }

  /**
   * POST /api/agent/social-requests
   *
   * Owned by `AgentSocialRequestsController` in the `social-requests` module.
   * The legacy registration was removed when the SocialRequest data source
   * was unified onto `user_social_requests` (see AgentSocialRequestAdapter).
   */

  /**
   * POST /api/agent/social-intents
   * Preferred OpenClaw entrypoint: submit the owner's need to FitMeet.
   * FitMeet owns matching, safety ranking, and result packaging.
   */
  @Post('social-intents')
  @RequirePermission(AgentAction.CreateSocialRequest)
  submitSocialIntent(
    @Req() req: FitMeetRequest,
    @Body() dto: CreateSocialRequestDto,
  ) {
    return this.svc.createAgentSocialRequest(req[AGENT_CONNECTION_KEY], dto);
  }

  /**
   * GET /api/agent/social-requests/:id/matches
   * OpenClaw reads FitMeet-produced results and asks the owner what to do.
   */
  @Get('social-requests/:id/matches')
  @RequirePermission(AgentAction.SearchProfiles)
  getSocialRequestMatches(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.getSocialRequestMatches(req[AGENT_CONNECTION_KEY], id);
  }

  /**
   * POST /api/agent/social-requests/:id/candidates/decision
   * OpenClaw submits the owner's decision; FitMeet performs the bounded action.
   */
  @Post('social-requests/:id/candidates/decision')
  @RequirePermission(AgentAction.SendMessage)
  decideSocialRequestCandidate(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmSocialRequestCandidateDto,
  ) {
    return this.svc.decideSocialRequestCandidate(
      req[AGENT_CONNECTION_KEY],
      id,
      dto,
    );
  }

  /**
   * POST /api/agent/nearby/search — see MatchModule (src/match/agent-match.controller.ts)
   * The legacy unscored implementation has been removed in favour of the
   * explainable matching pipeline.
   */

  /**
   * POST /api/agent/match/search
   * Agent searches for compatible users based on preferences + query.
   */
  @Post('match/search')
  @RequirePermission(AgentAction.SearchProfiles)
  searchMatches(@Req() req: FitMeetRequest, @Body() dto: SearchMatchDto) {
    return this.svc.searchMatches(req[AGENT_CONNECTION_KEY], dto);
  }

  /**
   * POST /api/agent/posts/draft
   * Generate a post draft for human review.
   */
  @Post('posts/draft')
  @RequirePermission(AgentAction.GeneratePost)
  draftPost(@Req() req: FitMeetRequest, @Body() dto: DraftContentDto) {
    return this.svc.draftContent(req[AGENT_CONNECTION_KEY], {
      ...dto,
      type: 'post',
    });
  }

  /**
   * POST /api/agent/messages/draft
   * Generate a message draft for human review.
   */
  @Post('messages/draft')
  @RequirePermission(AgentAction.GenerateMessage)
  draftMessage(@Req() req: FitMeetRequest, @Body() dto: DraftContentDto) {
    return this.svc.draftContent(req[AGENT_CONNECTION_KEY], {
      ...dto,
      type: 'message',
    });
  }

  /**
   * POST /api/agent/messages/send
   * Send a message (requires approval or Standard/Open permission).
   * Returns 202 + approvalRequestId if user confirmation is needed.
   */
  @Post('messages/send')
  @HttpCode(200)
  @RequirePermission(AgentAction.SendMessage)
  sendMessage(@Req() req: FitMeetRequest, @Body() dto: SendMessageDto) {
    return this.svc.sendMessage(req[AGENT_CONNECTION_KEY], dto);
  }

  /**
   * POST /api/agent/contact/request
   * Request that the platform mediate a contact exchange.
   * Both sides must consent; agent cannot bypass this.
   */
  @Post('contact/request')
  @RequirePermission(AgentAction.ContactRequest)
  requestContact(@Req() req: FitMeetRequest, @Body() dto: ContactRequestDto) {
    return this.svc.requestContact(req[AGENT_CONNECTION_KEY], dto);
  }

  /**
   * GET /api/agent/activity
   * Agent Gateway reads the AgentActionLog for the calling agent's owner.
   * ownerUserId is derived from the agent token — never accepted from the body.
   */
  @Get('activity')
  getActivity(
    @Req() req: FitMeetRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('actionType') actionType?: AgentActionType,
    @Query('actionStatus') actionStatus?: AgentActionStatus,
    @Query('scope') scope?: 'self' | 'owner',
  ) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.actionLogs.list({
      ownerUserId: conn.userId,
      agentId: scope === 'self' ? conn.id : undefined,
      actionType,
      actionStatus,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /**
   * GET /api/agent/activity/:id
   * Read a single audit row. Scoped to the agent's owner so one agent token
   * cannot read another owner's log entries.
   */
  @Get('activity/:id')
  getActivityById(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.actionLogs.getById(conn.userId, id);
  }

  // ── Pending actions (approvals queue) ─────────────────────────

  /**
   * GET /api/agent/approvals/pending
   * Lists PendingAction rows (reuses AgentApprovalRequest) for the
   * agent's owner. ownerUserId comes from the agent token.
   */
  @Get('approvals/pending')
  getPendingApprovals(@Req() req: FitMeetRequest) {
    const conn = req[AGENT_CONNECTION_KEY];
    return this.approvals.getPending(conn.userId);
  }

  /**
   * POST /api/agent/approvals/:id/approve
   * Approve a pending action. Dispatches the underlying action (which,
   * for send_message / send_invite, advances candidate.status and
   * SocialRequest.status via the dispatcher) and writes an AgentActionLog
   * entry tagged `executed` (or `failed` on dispatch error).
   */
  @Post('approvals/:id/approve')
  @HttpCode(200)
  async approveAction(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const conn = req[AGENT_CONNECTION_KEY];
    const result = await this.approvals.approve(id, conn.userId, (approval) =>
      this.dispatcher.dispatch(approval),
    );
    await this.actionLogs.logAgentAction({
      ownerUserId: conn.userId,
      agentId: result.approval.agentConnectionId ?? conn.id,
      agentTaskId: result.approval.agentTaskId,
      actionType: mapApprovalToActionType(result.approval),
      actionStatus:
        result.dispatchError !== undefined
          ? AgentActionStatus.Failed
          : AgentActionStatus.Executed,
      riskLevel: mapRiskLevel(result.approval.riskLevel),
      targetUserId:
        (result.approval.payload?.toUserId as number | undefined) ??
        (result.approval.payload?.targetUserId as number | undefined) ??
        null,
      relatedSocialRequestId: result.approval.relatedSocialRequestId,
      relatedCandidateId: result.approval.relatedCandidateId,
      relatedActivityId: result.approval.relatedActivityId,
      inputSummary: result.approval.summary,
      outputSummary: result.dispatchError
        ? `dispatch_failed: ${result.dispatchError}`
        : 'approved_and_dispatched',
      payload: {
        approvalId: result.approval.id,
        agentTaskId: result.approval.agentTaskId,
        approvalType: result.approval.type,
        dispatched: result.dispatched,
      },
      reason: 'user_approved_pending_action',
    });
    return {
      ok: true,
      status: result.approval.status,
      dispatched: result.dispatched,
      result: result.dispatchResult,
      error: result.dispatchError,
    };
  }

  /**
   * POST /api/agent/approvals/:id/reject
   * Reject a pending action. The underlying action is NOT executed; we
   * only write an AgentActionLog entry tagged `rejected`.
   */
  @Post('approvals/:id/reject')
  @HttpCode(200)
  async rejectAction(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason?: string } = {},
  ) {
    const conn = req[AGENT_CONNECTION_KEY];
    const row = await this.approvals.reject(id, conn.userId);
    await this.actionLogs.logAgentAction({
      ownerUserId: conn.userId,
      agentId: row.agentConnectionId ?? conn.id,
      agentTaskId: row.agentTaskId,
      actionType: mapApprovalToActionType(row),
      actionStatus: AgentActionStatus.Rejected,
      riskLevel: mapRiskLevel(row.riskLevel),
      targetUserId:
        (row.payload?.toUserId as number | undefined) ??
        (row.payload?.targetUserId as number | undefined) ??
        null,
      relatedSocialRequestId: row.relatedSocialRequestId,
      relatedCandidateId: row.relatedCandidateId,
      relatedActivityId: row.relatedActivityId,
      inputSummary: row.summary,
      outputSummary: 'rejected_no_action_taken',
      payload: {
        approvalId: row.id,
        agentTaskId: row.agentTaskId,
        approvalType: row.type,
      },
      reason: body.reason ?? 'user_rejected_pending_action',
    });
    return { ok: true, status: row.status };
  }

  /**
   * POST /api/agent/autopilot/run-once
   * Manually trigger one AI Social Autopilot sweep. Useful for ops /
   * testing without waiting for the cron tick. Disabled-by-default
   * sweeps still run when manually triggered.
   */
  @Post('autopilot/run-once')
  @HttpCode(200)
  async runAutopilotOnce(@Req() req: FitMeetRequest) {
    const conn = req[AGENT_CONNECTION_KEY];
    try {
      const summary = await this.autopilot.runOnce('manual', conn.userId);
      return { ok: true, summary };
    } catch (err) {
      this.logger.error(
        `Agent autopilot run-once failed for userId=${conn.userId}, connectionId=${conn.id}: ${
          err instanceof Error ? err.stack || err.message : String(err)
        }`,
      );
      return {
        ok: false,
        summary: {
          triggeredBy: 'manual',
          skipped: true,
          reason: 'autopilot_unavailable',
          agentsScanned: 0,
          requestsScanned: 0,
          decisions: { executed: 0, pending: 0, planned: 0, skipped: 0 },
        },
      };
    }
  }
}

function mapApprovalToActionType(
  approval: AgentApprovalRequest,
): AgentActionType {
  if (approval.actionType === 'add_friend') return AgentActionType.AddFriend;
  if (approval.actionType === 'invite_activity')
    return AgentActionType.InviteActivity;
  if (approval.actionType === 'create_activity')
    return AgentActionType.CreateActivity;
  if (approval.actionType === 'send_message')
    return AgentActionType.SendMessage;
  switch (approval.type) {
    case ApprovalType.SendMessage:
    case ApprovalType.FirstMessage:
      return AgentActionType.SendMessage;
    case ApprovalType.ContactRequest:
    case ApprovalType.ContactExchange:
      return AgentActionType.AddFriend;
    case ApprovalType.CreateActivity:
    case ApprovalType.OfflineMeeting:
      return AgentActionType.CreateActivity;
    case ApprovalType.JoinActivity:
      return AgentActionType.JoinActivity;
    case ApprovalType.SubmitCompletionProof:
    case ApprovalType.PhotoUpload:
      return AgentActionType.SubmitProof;
    default:
      return AgentActionType.SendMessage;
  }
}

function mapRiskLevel(level: ApprovalRiskLevel): AgentActionRiskLevel {
  switch (level) {
    case ApprovalRiskLevel.High:
      return AgentActionRiskLevel.High;
    case ApprovalRiskLevel.Medium:
      return AgentActionRiskLevel.Medium;
    default:
      return AgentActionRiskLevel.Low;
  }
}

// ── AI 画像问答（JWT 直接走当前登录用户）───────────────────────────
// 与 AgentApiController 下的 owner/social-profile/* 区别：
//   - 那一组走 X-Agent-Token（OpenClaw / 第三方 agent 代用户调用）
//   - 这一组走 JWT（FitMeet App 自己的用户直接调用）
@Controller('agent/profile')
@UseGuards(AuthGuard('jwt'))
export class AgentProfileQAController {
  constructor(private readonly qa: AgentProfileQAService) {}

  @Get('questions')
  getQuestions(@Req() req: FitMeetRequest) {
    return this.qa.generateQuestions(req.user.id);
  }

  @Post('answers')
  @HttpCode(200)
  saveAnswers(
    @Req() req: FitMeetRequest,
    @Body() body: { answers?: Array<{ key: string; value: unknown }> },
  ) {
    return this.qa.saveAnswers(req.user.id, body?.answers ?? []);
  }

  @Get('completion')
  getCompletion(@Req() req: FitMeetRequest) {
    return this.qa.getCompletion(req.user.id);
  }
}
