import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

import { AdminRbacGuard } from '../admin-rbac/admin-rbac.guard';
import { RequireAdminPermission } from '../admin-rbac/admin-rbac.decorator';
import { SocialAgentCandidatePoolService } from './social-agent-candidate-pool.service';
import type { CandidatePoolIntent } from './social-agent-candidate-pool.service';
import { SocialAgentChatService } from './social-agent-chat.service';
import { DebugEnvelopeBuilderService } from './response-quality/debug-envelope-builder.service';

type FitMeetRequest = Request & {
  user: { id: number };
};

type RouteMessageDebugBody = {
  message?: string | null;
  taskId?: number | null;
  hasCandidates?: boolean;
};

@Controller('social-agent/debug')
@UseGuards(AuthGuard('jwt'), AdminRbacGuard)
@RequireAdminPermission('agent:l5:read')
export class SocialAgentDebugController {
  constructor(
    private readonly candidatePool: SocialAgentCandidatePoolService,
    private readonly chat: SocialAgentChatService,
    private readonly debugEnvelopeBuilder: DebugEnvelopeBuilderService,
  ) {}

  @Get('candidate-pool')
  getCandidatePoolDebug(
    @Req() req: FitMeetRequest,
    @Query('taskId') taskId?: string,
    @Query('intent') intent?: CandidatePoolIntent,
  ) {
    return this.candidatePool.debugCandidatePool(
      req.user.id,
      taskId ? Number(taskId) : null,
      intent === 'activity_search' ? 'activity_search' : 'social_search',
    );
  }

  @Post('route-message')
  @HttpCode(200)
  @RequireAdminPermission('agent:l5:write')
  async routeMessageDebug(
    @Req() req: FitMeetRequest,
    @Body() body: RouteMessageDebugBody,
  ) {
    const result = await this.chat.routeMessage(req.user.id, body ?? {});
    return this.debugEnvelopeBuilder.buildRouteMessageEnvelope(result);
  }
}
