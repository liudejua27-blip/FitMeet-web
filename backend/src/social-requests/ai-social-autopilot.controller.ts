import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  AGENT_CONNECTION_KEY,
  AgentTokenGuard,
} from '../agent-gateway/guards/agent-token.guard';
import { AgentConnection } from '../agent-gateway/entities/agent-connection.entity';
import { AiSocialAutopilotService } from '../agent-gateway/ai-social-autopilot.service';

type AgentRequest = Request & { [AGENT_CONNECTION_KEY]?: AgentConnection };

/**
 * Agent-token-authenticated trigger that lets an active agent ask the
 * platform to run one autopilot sweep scoped to its owner.
 *
 * The sweep logic lives in `agent-gateway/ai-social-autopilot.service.ts`
 * — the single canonical implementation. The legacy
 * `social-requests/ai-social-autopilot.service.ts` was removed to keep one
 * source of truth for policy gating and AgentActionLog writes.
 *
 * Owner-side (JWT) counterpart: `POST /api/agent/autopilot/run-once`
 * (no ownerUserId filter, sweeps every active profile).
 */
@Controller('agent/social-autopilot')
@UseGuards(AgentTokenGuard)
export class AiSocialAutopilotController {
  constructor(private readonly autopilot: AiSocialAutopilotService) {}

  @Post('run-once')
  runOnce(@Req() req: AgentRequest) {
    const conn = req[AGENT_CONNECTION_KEY]!;
    return this.autopilot.runOnce('manual', conn.userId);
  }
}
