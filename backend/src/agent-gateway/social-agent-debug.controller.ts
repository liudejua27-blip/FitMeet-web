import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

import { SocialAgentCandidatePoolService } from './social-agent-candidate-pool.service';
import type { CandidatePoolIntent } from './social-agent-candidate-pool.service';

type FitMeetRequest = Request & {
  user: { id: number };
};

@Controller('social-agent/debug')
@UseGuards(AuthGuard('jwt'))
export class SocialAgentDebugController {
  constructor(
    private readonly candidatePool: SocialAgentCandidatePoolService,
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
}
