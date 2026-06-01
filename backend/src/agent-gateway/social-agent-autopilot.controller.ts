import { Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

import { SocialAgentAutopilotService } from './social-agent-autopilot.service';

type FitMeetRequest = Request & {
  user: { id: number };
};

@Controller('social-agent/autopilot')
@UseGuards(AuthGuard('jwt'))
export class SocialAgentAutopilotController {
  constructor(private readonly autopilot: SocialAgentAutopilotService) {}

  /** POST /api/social-agent/autopilot/run-once */
  @Post('run-once')
  @HttpCode(200)
  async runOnce(@Req() req: FitMeetRequest) {
    const summary = await this.autopilot.runOnce('manual', req.user.id);
    return { ok: !summary.skipped || summary.reason === undefined, summary };
  }
}
