import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { IsInt, IsOptional, Min } from 'class-validator';
import type { Request } from 'express';
import { MatchService } from './match.service';
import { NearbySearchDto } from './dto/match.dto';
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
import {
  ActionResult,
  LoggedAction,
} from '../agent-gateway/entities/agent-activity-log.entity';

type AgentReq = Request & { [AGENT_CONNECTION_KEY]: AgentConnection };

class MatchPartnerDto extends NearbySearchDto {
  @IsOptional()
  @IsInt()
  socialRequestId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  topK?: number;
}

@Controller('agent')
@UseGuards(AgentTokenGuard, AgentPermissionGuard)
export class AgentMatchController {
  constructor(
    private readonly matchService: MatchService,
    private readonly gateway: AgentGatewayService,
  ) {}

  /**
   * POST /api/agent/nearby/search
   * Stateless: does NOT persist a UserSocialRequest, does NOT persist
   * candidate rows. Useful for the agent to "preview" candidates before
   * asking the user to confirm a real social request.
   */
  @Post('nearby/search')
  @RequirePermission(AgentAction.SearchProfiles)
  async searchNearby(@Req() req: AgentReq, @Body() dto: NearbySearchDto) {
    const conn = req[AGENT_CONNECTION_KEY];
    const candidates = await this.matchService.searchNearby({
      userId: conn.userId,
      city: dto.city,
      lat: dto.lat,
      lng: dto.lng,
      radiusKm: dto.radiusKm,
      type: dto.type,
      activityType: dto.activityType,
      interestTags: dto.interestTags,
      timeStart: dto.timeStart ?? null,
      timeEnd: dto.timeEnd ?? null,
      safetyRequirement: dto.safetyRequirement,
      agentAllowedRequired: dto.agentAllowedRequired ?? true,
      limit: dto.limit ?? 10,
    });

    await this.gateway.logAgentSkill(
      conn,
      LoggedAction.Search,
      {
        endpoint: 'nearby/search',
        type: dto.type,
        radiusKm: dto.radiusKm,
        candidateCount: candidates.length,
      },
      ActionResult.Success,
    );

    return { candidates };
  }

  /**
   * POST /api/agent/match/partner
   * If `socialRequestId` is provided, runs full match against that
   * persisted UserSocialRequest (owner-only). Otherwise behaves like
   * `/agent/nearby/search` but writes a `MatchPartner` activity log.
   */
  @Post('match/partner')
  @RequirePermission(AgentAction.SearchProfiles)
  async matchPartner(@Req() req: AgentReq, @Body() dto: MatchPartnerDto) {
    const conn = req[AGENT_CONNECTION_KEY];
    const limit = dto.topK ?? dto.limit ?? 10;

    if (dto.socialRequestId) {
      const result = await this.matchService.runMatch(
        dto.socialRequestId,
        conn.userId,
        { limit },
      );
      await this.gateway.logAgentSkill(
        conn,
        LoggedAction.MatchPartner,
        {
          socialRequestId: dto.socialRequestId,
          topK: limit,
          candidateCount: result.candidates.length,
        },
        ActionResult.Success,
      );
      return result;
    }

    const candidates = await this.matchService.searchNearby({
      userId: conn.userId,
      city: dto.city,
      lat: dto.lat,
      lng: dto.lng,
      radiusKm: dto.radiusKm,
      type: dto.type,
      activityType: dto.activityType,
      interestTags: dto.interestTags,
      timeStart: dto.timeStart ?? null,
      timeEnd: dto.timeEnd ?? null,
      safetyRequirement: dto.safetyRequirement,
      agentAllowedRequired: dto.agentAllowedRequired ?? true,
      limit,
    });

    await this.gateway.logAgentSkill(
      conn,
      LoggedAction.MatchPartner,
      {
        socialRequestId: null,
        topK: limit,
        candidateCount: candidates.length,
      },
      ActionResult.Success,
    );

    return { socialRequestId: null, candidates };
  }
}
